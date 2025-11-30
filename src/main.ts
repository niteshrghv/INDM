import { app, BrowserWindow, ipcMain, dialog, IpcMainEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Downloader } from './downloader';

// Explicitly set App Name for macOS Menu Bar
app.setName('INDM');

let mainWindow: BrowserWindow | null;
const activeDownloads = new Map<string, Downloader>(); // uuid -> Downloader instance

// Use userData for persistent storage
const userDataPath = app.getPath('userData');
const historyPath = path.join(userDataPath, 'history.json');
const statesDir = path.join(userDataPath, 'states');

if (!fs.existsSync(statesDir)) {
    fs.mkdirSync(statesDir, { recursive: true });
}

interface HistoryEntry {
    uuid: string;
    url: string;
    fileName?: string;
    outputDir: string;
    status: 'initializing' | 'downloading' | 'completed' | 'paused' | 'error' | 'cancelled';
    totalBytes?: number;
    downloaded?: number;
    date?: number;
    error?: string;
}

// History Manager
const HistoryManager = {
    getHistory: (): HistoryEntry[] => {
        if (!fs.existsSync(historyPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        } catch (e) { return []; }
    },
    addEntry: (entry: HistoryEntry) => {
        const history = HistoryManager.getHistory();
        // Remove existing if any (update)
        const newHistory = history.filter(h => h.uuid !== entry.uuid);
        newHistory.unshift(entry);
        fs.writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
        return newHistory;
    },
    updateEntry: (uuid: string, updates: Partial<HistoryEntry>) => {
        const history = HistoryManager.getHistory();
        const index = history.findIndex(h => h.uuid === uuid);
        if (index !== -1) {
            history[index] = { ...history[index], ...updates };
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
            return history;
        }
        return history;
    }
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'INDM',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hiddenInset',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
        icon: path.join(__dirname, '../assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow) {
            mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
        }
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Default Download Directory
const defaultDownloadDir = path.join(app.getPath('downloads'), 'indm');
if (!fs.existsSync(defaultDownloadDir)) {
    fs.mkdirSync(defaultDownloadDir, { recursive: true });
}

ipcMain.on('start-download', async (event: IpcMainEvent, url: string, options: any = {}) => {
    // Use provided outputDir or default
    const outputDir = options.outputDir || defaultDownloadDir;

    // If options.askPath is true, show dialog (optional feature for later)
    // For now, auto-use default as requested

    startDownload(url, outputDir, options);
});

ipcMain.on('delete-entry', (event: IpcMainEvent, uuid: string) => {
    const history = HistoryManager.getHistory();
    const newHistory = history.filter(h => h.uuid !== uuid);
    fs.writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
    if (mainWindow) mainWindow.webContents.send('history-updated', newHistory);
});

function startDownload(url: string, outputDir: string, options: any = {}) {
    // Ensure we pass the stateDir
    options.stateDir = statesDir;

    const downloader = new Downloader(url, outputDir, options);
    activeDownloads.set(downloader.uuid, downloader);

    // Add to history initially
    HistoryManager.addEntry({
        uuid: downloader.uuid,
        url: url,
        fileName: downloader.fileName,
        outputDir: outputDir,
        status: 'initializing',
        totalBytes: 0,
        downloaded: 0,
        date: Date.now()
    });
    if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());

    downloader.on('start', (info: any) => {
        if (mainWindow) mainWindow.webContents.send('download-started', info);
        HistoryManager.updateEntry(downloader.uuid, {
            status: 'downloading',
            totalBytes: info.totalBytes,
            fileName: info.fileName
        });
        if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
    });

    downloader.on('progress', (progress: any) => {
        if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });

    downloader.on('complete', (filePath: string) => {
        if (mainWindow) mainWindow.webContents.send('download-complete', { uuid: downloader.uuid, filePath });
        HistoryManager.updateEntry(downloader.uuid, {
            status: 'completed',
            downloaded: downloader.totalBytes
        });
        if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
        activeDownloads.delete(downloader.uuid);
    });

    downloader.on('error', (err: string) => {
        if (mainWindow) mainWindow.webContents.send('download-error', { uuid: downloader.uuid, error: err });
        HistoryManager.updateEntry(downloader.uuid, { status: 'error', error: err });
        if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
    });

    downloader.on('paused', () => {
        if (mainWindow) mainWindow.webContents.send('download-paused', { uuid: downloader.uuid });
        // Update history with latest progress
        const totalDownloaded = downloader.downloadedBytesPerChunk.reduce((a, b) => a + b, 0);
        HistoryManager.updateEntry(downloader.uuid, {
            status: 'paused',
            downloaded: totalDownloaded
        });
        if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
    });

    downloader.start();
}

ipcMain.on('pause-download', (event: IpcMainEvent, uuid: string) => {
    const downloader = activeDownloads.get(uuid);
    if (downloader) {
        downloader.pause();
    }
});

ipcMain.on('resume-download', (event: IpcMainEvent, uuid: string) => {
    // Check active first
    let downloader = activeDownloads.get(uuid);

    if (downloader) {
        downloader.start();
        return;
    }

    // Check history
    const history = HistoryManager.getHistory();
    const entry = history.find(h => h.uuid === uuid);

    if (entry) {
        const statePath = path.join(statesDir, `${uuid}.json`);
        if (fs.existsSync(statePath)) {
            try {
                const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                startDownload(state.url, state.outputDir, state);
            } catch (e) {
                console.error('Failed to load resume state:', e);
            }
        } else {
            // Try fresh if state missing
            startDownload(entry.url, entry.outputDir, { uuid: entry.uuid, fileName: entry.fileName });
        }
    }
});

ipcMain.on('cancel-download', (event: IpcMainEvent, uuid: string) => {
    const downloader = activeDownloads.get(uuid);
    if (downloader) {
        downloader.pause();
        activeDownloads.delete(uuid);
    }
    HistoryManager.updateEntry(uuid, { status: 'cancelled' });
    if (mainWindow) mainWindow.webContents.send('history-updated', HistoryManager.getHistory());
});

ipcMain.on('clear-history', () => {
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
    if (mainWindow) mainWindow.webContents.send('history-updated', []);
});
