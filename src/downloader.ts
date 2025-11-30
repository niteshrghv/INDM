import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import axios from 'axios';
import { EventEmitter } from 'events';

interface DownloaderOptions {
    numConnections?: number;
    uuid?: string;
    stateDir?: string;
    fileName?: string;
    downloadedBytesPerChunk?: number[];
    totalBytes?: number;
}

interface DownloadState {
    url: string;
    outputDir: string;
    fileName: string;
    totalBytes: number;
    downloadedBytesPerChunk: number[];
    numConnections: number;
    uuid: string;
    stateDir: string;
}

export class Downloader extends EventEmitter {
    url: string;
    outputDir: string;
    numConnections: number;
    uuid: string;
    stateDir: string;
    fileName: string;
    finalFilePath: string;
    tempFilePath: string;
    httpAgent: http.Agent;
    httpsAgent: https.Agent;
    downloadedBytesPerChunk: number[];
    totalBytes: number;
    activeConnections: number;
    startTime: number;
    lastTickTime: number;
    lastTickDownloaded: number;
    abortController: AbortController;
    isPaused: boolean;
    stateFilePath: string;
    lastSaveTime: number = 0;
    lastSpeedUpdate: number = 0;
    lastDownloadedSize: number = 0;

    constructor(url: string, outputDir: string, options: DownloaderOptions = {}) {
        super();
        this.url = url;
        this.outputDir = outputDir;
        // Reduced to 8 connections to prevent I/O saturation and system hangs
        this.numConnections = options.numConnections || 8;
        this.uuid = options.uuid || Date.now().toString();
        this.stateDir = options.stateDir || outputDir;

        this.fileName = options.fileName || this.getFileNameFromUrl(url);
        this.finalFilePath = '';
        this.tempFilePath = '';
        this.stateFilePath = '';
        this.updatePaths();

        // Optimized agents
        this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: this.numConnections, scheduling: 'fifo' });
        this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: this.numConnections, scheduling: 'fifo' });

        this.downloadedBytesPerChunk = options.downloadedBytesPerChunk || new Array(this.numConnections).fill(0);
        this.totalBytes = options.totalBytes || 0;
        this.activeConnections = 0;
        this.startTime = 0;
        this.lastTickTime = 0;
        this.lastTickDownloaded = 0;

        this.abortController = new AbortController();
        this.isPaused = false;
        this.stateFilePath = path.join(this.stateDir, `${this.uuid}.json`);
    }

    updatePaths() {
        this.finalFilePath = path.join(this.outputDir, this.fileName);
        // Use a hidden temp file in the same dir to avoid moving across volumes later
        this.tempFilePath = this.finalFilePath + '.part';
    }

    getFileNameFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            let name = path.basename(urlObj.pathname);
            if (!name || name === '/') name = 'downloaded_file';
            return this.sanitizeFileName(name);
        } catch (e) {
            return 'downloaded_file';
        }
    }

    sanitizeFileName(name: string): string {
        name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (name.length > 100) {
            const ext = path.extname(name);
            const base = path.basename(name, ext);
            name = base.substring(0, 100 - ext.length) + ext;
        }
        return name;
    }

    async start() {
        try {
            this.isPaused = false;
            this.abortController = new AbortController();
            this.startTime = Date.now();
            this.lastTickTime = this.startTime;

            console.log(`Starting download for ${this.url}`);

            if (this.totalBytes === 0) {
                const headResponse = await axios.head(this.url, {
                    httpAgent: this.httpAgent,
                    httpsAgent: this.httpsAgent,
                    timeout: 10000,
                    signal: this.abortController.signal
                });

                const contentDisposition = headResponse.headers['content-disposition'];
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match && match[1]) {
                        this.fileName = this.sanitizeFileName(match[1]);
                        this.updatePaths();
                    }
                }

                const contentLength = headResponse.headers['content-length'];
                if (!contentLength) throw new Error('Cannot determine file size.');
                this.totalBytes = parseInt(contentLength, 10);
            }

            this.emit('start', { totalBytes: this.totalBytes, fileName: this.fileName, uuid: this.uuid });

            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }
            if (!fs.existsSync(this.stateDir)) {
                fs.mkdirSync(this.stateDir, { recursive: true });
            }

            this.saveState();

            let fileHandle: fs.promises.FileHandle;
            try {
                fileHandle = await fs.promises.open(this.tempFilePath, 'r+');
            } catch (e) {
                fileHandle = await fs.promises.open(this.tempFilePath, 'w');
            }

            try {
                console.log(`Downloading with ${this.numConnections} connections.`);
                await this.downloadParallel(fileHandle);

                await fileHandle.close();

                if (!this.isPaused && !this.abortController.signal.aborted) {
                    if (fs.existsSync(this.finalFilePath)) fs.unlinkSync(this.finalFilePath);
                    fs.renameSync(this.tempFilePath, this.finalFilePath);
                    if (fs.existsSync(this.stateFilePath)) fs.unlinkSync(this.stateFilePath);
                    this.emit('complete', this.finalFilePath);
                }

            } catch (err) {
                await fileHandle.close();
                if (this.abortController.signal.aborted) {
                    this.emit('paused');
                } else {
                    throw err;
                }
            }

        } catch (error: any) {
            if (!this.abortController.signal.aborted) {
                console.error('Download error:', error);
                this.emit('error', error.message);
            }
        }
    }

    saveState() {
        const state: DownloadState = {
            url: this.url,
            outputDir: this.outputDir,
            fileName: this.fileName,
            totalBytes: this.totalBytes,
            downloadedBytesPerChunk: this.downloadedBytesPerChunk,
            numConnections: this.numConnections,
            uuid: this.uuid,
            stateDir: this.stateDir
        };
        // Async save to avoid blocking event loop
        fs.writeFile(this.stateFilePath, JSON.stringify(state), () => { });
    }

    pause() {
        this.isPaused = true;
        this.abortController.abort();
        this.saveState();
        this.emit('paused');
    }

    async downloadParallel(fileHandle: fs.promises.FileHandle) {
        const chunkSize = Math.floor(this.totalBytes / this.numConnections);
        const promises = [];

        for (let i = 0; i < this.numConnections; i++) {
            const start = i * chunkSize;
            const end = (i === this.numConnections - 1) ? this.totalBytes - 1 : (start + chunkSize - 1);

            const downloaded = this.downloadedBytesPerChunk[i] || 0;
            const currentStart = start + downloaded;

            if (currentStart <= end) {
                promises.push(this.downloadChunkWithRetry(i, currentStart, end, fileHandle));
            }
        }

        await Promise.all(promises);
    }

    async downloadChunkWithRetry(index: number, start: number, end: number, fileHandle: fs.promises.FileHandle, attempt = 1): Promise<void> {
        if (this.abortController.signal.aborted) return;

        const maxRetries = 10;
        try {
            await this.downloadChunk(index, start, end, fileHandle);
        } catch (error: any) {
            if (this.abortController.signal.aborted) return;

            console.error(`Thread ${index} retry ${attempt}: ${error.message}`);
            if (attempt <= maxRetries) {
                const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.downloadChunkWithRetry(index, start, end, fileHandle, attempt + 1);
            } else {
                throw error;
            }
        }
    }

    async downloadChunk(index: number, start: number, end: number, fileHandle: fs.promises.FileHandle) {
        const response = await axios({
            method: 'get',
            url: this.url,
            headers: {
                'Range': `bytes=${start}-${end}`
            },
            responseType: 'stream',
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            timeout: 60000,
            signal: this.abortController.signal
        });

        let currentPos = start;

        for await (const chunk of response.data) {
            if (this.abortController.signal.aborted) return;

            await fileHandle.write(chunk, 0, chunk.length, currentPos);
            currentPos += chunk.length;

            this.downloadedBytesPerChunk[index] += chunk.length;
            this.checkAndEmitProgress();
        }
    }

    checkAndEmitProgress() {
        const now = Date.now();
        // Throttle updates to 1 second to reduce IPC/CPU load
        if (now - this.lastTickTime > 1000) {
            const totalDownloaded = this.downloadedBytesPerChunk.reduce((a, b) => a + b, 0);
            this.emitProgress(totalDownloaded);
            this.lastTickTime = now;

            // Save state less frequently (every 5 seconds)
            if (now - (this.lastSaveTime || 0) > 5000) {
                this.saveState();
                this.lastSaveTime = now;
            }
        }
    }

    emitProgress(totalDownloaded: number) {
        const now = Date.now();
        const timeDiff = (now - (this.lastSpeedUpdate || this.startTime)) / 1000;
        let speed = 0;

        if (timeDiff >= 1) { // Calculate speed every second
            const bytesDiff = totalDownloaded - (this.lastDownloadedSize || 0);
            speed = bytesDiff / timeDiff;
            this.lastSpeedUpdate = now;
            this.lastDownloadedSize = totalDownloaded;
        }

        this.emit('progress', {
            downloaded: totalDownloaded,
            total: this.totalBytes,
            speed: speed,
            uuid: this.uuid
        });
    }
}
