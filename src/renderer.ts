import { ipcRenderer, shell, IpcRendererEvent } from 'electron';

declare const echarts: any;

// Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    // console.error(message); // Silent for now unless critical
};

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const newDownloadBtn = document.getElementById('newDownloadBtn') as HTMLButtonElement;
    const addModal = document.getElementById('addModal') as HTMLDivElement;
    const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
    const startDownloadBtn = document.getElementById('startDownloadBtn') as HTMLButtonElement;

    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    const fileNameInput = document.getElementById('fileNameInput') as HTMLInputElement;
    const connectionsInput = document.getElementById('connectionsInput') as HTMLSelectElement;

    const downloadList = document.getElementById('downloadList') as HTMLDivElement;
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const toastContainer = document.getElementById('toastContainer') as HTMLDivElement;
    const globalSpeedEl = document.getElementById('globalSpeed') as HTMLSpanElement;

    // Welcome Modal
    const welcomeModal = document.getElementById('welcomeModal') as HTMLDivElement;
    const getStartedBtn = document.getElementById('getStartedBtn') as HTMLButtonElement;

    // Check First Run
    if (!localStorage.getItem('ndm_has_launched')) {
        welcomeModal?.classList.remove('hidden');
    }

    getStartedBtn?.addEventListener('click', () => {
        localStorage.setItem('ndm_has_launched', 'true');
        welcomeModal.style.opacity = '0';
        setTimeout(() => welcomeModal.classList.add('hidden'), 500); // Fade out
    });

    // Toolbar Buttons
    const resumeBtn = document.getElementById('resumeBtn') as HTMLButtonElement;
    const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
    const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
    const deleteBtn = document.getElementById('deleteBtn') as HTMLButtonElement;
    const clearAllBtn = document.getElementById('clearAllBtn') as HTMLButtonElement;

    // Navigation
    const categoryNav = document.getElementById('categoryNav');
    const statusNav = document.getElementById('statusNav');

    // State
    let historyData: any[] = [];
    let selectedUuid: string | null = null;
    let currentFilter: string = 'all';
    let currentStatusFilter: string | null = null;

    // --- ECharts Initialization ---
    // @ts-ignore
    const myChart = echarts.init(document.getElementById('speedChart'));
    const speedData: number[] = new Array(30).fill(0);

    const chartOption = {
        animation: false, // Disable animation for smooth real-time updates
        grid: { top: 5, bottom: 5, left: 0, right: 0 },
        tooltip: { trigger: 'axis', formatter: '{c} MB/s' },
        xAxis: { type: 'category', show: false, data: new Array(30).fill('') },
        yAxis: { type: 'value', show: false, min: 0 },
        series: [{
            data: speedData,
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: { color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#000000', width: 2 },
            areaStyle: {
                color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)' },
                    { offset: 1, color: document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.01)' }
                ])
            }
        }]
    };
    myChart.setOption(chartOption);
    window.addEventListener('resize', () => myChart.resize());

    // --- Modal Logic ---
    function openModal() {
        addModal.classList.remove('hidden');
        setTimeout(() => urlInput.focus(), 100);
    }

    function closeModal() {
        addModal.classList.add('hidden');
        urlInput.value = '';
        fileNameInput.value = '';
    }

    newDownloadBtn?.addEventListener('click', openModal);
    cancelBtn?.addEventListener('click', closeModal);

    startDownloadBtn?.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) {
            showToast('Error', 'Please enter a valid URL', 'error');
            return;
        }

        const options = {
            fileName: fileNameInput.value.trim() || undefined,
            numConnections: parseInt(connectionsInput.value)
        };

        ipcRenderer.send('start-download', url, options);
        closeModal();
        showToast('Started', 'Download added to queue', 'success');
    });

    // --- Toolbar Actions ---
    function updateToolbarState() {
        const hasSelection = !!selectedUuid;
        const item = historyData.find(h => h.uuid === selectedUuid);

        resumeBtn.disabled = !hasSelection || !item || (item.status === 'downloading' || item.status === 'completed');
        pauseBtn.disabled = !hasSelection || !item || (item.status !== 'downloading');
        stopBtn.disabled = !hasSelection || !item || (item.status === 'completed' || item.status === 'cancelled');
        deleteBtn.disabled = !hasSelection;

        // Visual opacity update
        [resumeBtn, pauseBtn, stopBtn, deleteBtn].forEach(btn => {
            btn.style.opacity = btn.disabled ? '0.5' : '1';
            btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
        });
    }

    resumeBtn?.addEventListener('click', () => {
        if (selectedUuid) ipcRenderer.send('resume-download', selectedUuid);
    });

    pauseBtn?.addEventListener('click', () => {
        if (selectedUuid) ipcRenderer.send('pause-download', selectedUuid);
    });

    stopBtn?.addEventListener('click', () => {
        if (selectedUuid) ipcRenderer.send('cancel-download', selectedUuid);
    });

    deleteBtn?.addEventListener('click', () => {
        if (selectedUuid && confirm('Delete this download record?')) {
            ipcRenderer.send('delete-entry', selectedUuid);
            selectedUuid = null;
            updateToolbarState();
        }
    });

    clearAllBtn?.addEventListener('click', () => {
        if (confirm('Clear all download history?')) {
            ipcRenderer.send('clear-history');
            selectedUuid = null;
            updateToolbarState();
        }
    });

    // --- Navigation Logic ---
    categoryNav?.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.sidebar-item');
        if (!target) return;

        // Update active state
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        target.classList.add('active');

        currentFilter = target.getAttribute('data-filter') || 'all';
        currentStatusFilter = null; // Reset status filter
        renderList();
    });

    statusNav?.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('.sidebar-item');
        if (!target) return;

        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        target.classList.add('active');

        currentStatusFilter = target.getAttribute('data-status');
        currentFilter = 'all'; // Reset category filter
        renderList();
    });

    // --- Theme Logic ---
    const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;

    // Initialize theme
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
    } else {
        document.documentElement.classList.remove('dark');
        themeToggle.innerHTML = '<i class="fa-regular fa-moon"></i>';
    }

    themeToggle?.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fa-regular fa-moon"></i>';
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
        }
        // Update chart color on theme toggle
        const isDark = document.documentElement.classList.contains('dark');
        const color = isDark ? '#ffffff' : '#000000';
        const areaColorStart = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
        const areaColorEnd = isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.01)';

        myChart.setOption({
            series: [{
                lineStyle: { color: color },
                areaStyle: {
                    color: new (echarts as any).graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: areaColorStart },
                        { offset: 1, color: areaColorEnd }
                    ])
                }
            }]
        });
    });

    // --- IPC Listeners ---
    ipcRenderer.on('history-updated', (event, history) => {
        historyData = history;
        renderList();
        updateToolbarState();
    });

    ipcRenderer.on('download-progress', (event, progress) => {
        updateRow(progress);
        updateGlobalSpeed();
    });

    ipcRenderer.on('download-complete', () => showToast('Complete', 'Download finished successfully', 'success'));
    ipcRenderer.on('download-error', (e, { error }) => showToast('Error', error, 'error'));

    // --- Rendering Logic ---
    function renderList() {
        const search = searchInput.value.toLowerCase();
        downloadList.innerHTML = '';

        const filtered = historyData.filter(item => {
            // Search Filter
            if (search && !item.fileName?.toLowerCase().includes(search)) return false;

            // Status Filter
            if (currentStatusFilter) {
                if (currentStatusFilter === 'completed' && item.status !== 'completed') return false;
                if (currentStatusFilter === 'downloading' && item.status === 'completed') return false;
            }

            // Category Filter (Mock logic based on extension)
            if (currentFilter !== 'all') {
                const ext = item.fileName?.split('.').pop()?.toLowerCase();
                if (currentFilter === 'compressed' && !['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return false;
                if (currentFilter === 'video' && !['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return false;
                if (currentFilter === 'audio' && !['mp3', 'wav', 'flac'].includes(ext)) return false;
                if (currentFilter === 'document' && !['pdf', 'doc', 'docx', 'txt'].includes(ext)) return false;
                if (currentFilter === 'software' && !['exe', 'dmg', 'pkg', 'iso'].includes(ext)) return false;
            }

            return true;
        });

        if (filtered.length === 0) {
            downloadList.innerHTML = `
                <div class="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
                    <i class="fa-regular fa-folder-open text-4xl mb-4 opacity-50"></i>
                    <p>No downloads found</p>
                </div>`;
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('div');
            // Add dark mode classes to row
            row.className = `grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition group download-row ${selectedUuid === item.uuid ? 'selected' : ''}`;
            row.onclick = () => {
                selectedUuid = item.uuid;
                renderList(); // Re-render to update selection style
                updateToolbarState();
            };
            row.ondblclick = () => {
                if (item.status === 'completed') {
                    const path = require('path');
                    shell.showItemInFolder(path.join(item.outputDir, item.fileName));
                }
            };

            const percent = item.totalBytes ? (item.downloaded / item.totalBytes) * 100 : 0;
            const isDownloading = item.status === 'downloading';

            // Icon Logic
            let iconClass = 'fa-regular fa-file';
            let iconColor = 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400';
            const ext = item.fileName?.split('.').pop()?.toLowerCase();

            // Monochrome Icons
            if (['mp4', 'mkv'].includes(ext)) { iconClass = 'fa-brands fa-youtube'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }
            else if (['zip', 'rar'].includes(ext)) { iconClass = 'fa-regular fa-file-zipper'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }
            else if (['mp3', 'wav'].includes(ext)) { iconClass = 'fa-solid fa-music'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }
            else if (['exe', 'dmg'].includes(ext)) { iconClass = 'fa-brands fa-windows'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }
            else if (['pdf', 'doc'].includes(ext)) { iconClass = 'fa-regular fa-file-lines'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }
            else if (['jpg', 'png'].includes(ext)) { iconClass = 'fa-regular fa-image'; iconColor = 'text-gray-900 bg-gray-200 dark:bg-gray-700 dark:text-white'; }

            // Status Text Color
            let statusColor = 'text-gray-500 dark:text-gray-400';
            if (item.status === 'downloading') statusColor = 'text-black dark:text-white';
            if (item.status === 'completed') statusColor = 'text-gray-600 dark:text-gray-300';
            if (item.status === 'error') statusColor = 'text-gray-600 dark:text-gray-300';
            if (item.status === 'paused') statusColor = 'text-gray-500 dark:text-gray-400';

            row.innerHTML = `
                <div class="col-span-5 flex items-center gap-3">
                    <div class="icon-box ${iconColor} text-lg">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="overflow-hidden">
                        <div class="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white truncate" title="${item.fileName}">${item.fileName || 'Unknown'}</div>
                        <div class="text-xs text-gray-400 truncate" title="${item.url}">${new URL(item.url).hostname}</div>
                    </div>
                </div>
                <div class="col-span-3">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="${statusColor} font-medium uppercase text-[10px]">${item.status}</span>
                        <span class="text-gray-500 dark:text-gray-400" id="text-${item.uuid}">${percent.toFixed(1)}%</span>
                    </div>
                    <div class="progress-bg dark:bg-gray-800">
                        <div class="progress-fill ${item.status === 'completed' ? 'bg-gray-500 dark:bg-gray-400' : (item.status === 'error' ? 'bg-gray-500' : 'bg-black dark:bg-white')}" style="width: ${percent}%" id="prog-${item.uuid}"></div>
                    </div>
                </div>
                <div class="col-span-1 text-right text-sm text-gray-600 dark:text-gray-400">${formatBytes(item.totalBytes)}</div>
                <div class="col-span-2 text-right">
                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200" id="speed-${item.uuid}">-</div>
                    <div class="text-xs text-blue-500 dark:text-blue-400" id="eta-${item.uuid}">-</div>
                </div>
                <div class="col-span-1 text-right text-sm text-gray-500 dark:text-gray-500">${new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            downloadList.appendChild(row);
        });
    }

    function updateRow(progress: any) {
        const bar = document.getElementById(`prog-${progress.uuid}`);
        const speed = document.getElementById(`speed-${progress.uuid}`);
        const eta = document.getElementById(`eta-${progress.uuid}`);
        const text = document.getElementById(`text-${progress.uuid}`);

        const percent = (progress.downloaded / progress.total) * 100;

        if (bar) bar.style.width = `${percent}%`;
        if (text) text.textContent = `${percent.toFixed(1)}%`;
        if (speed) speed.textContent = formatSpeed(progress.speed);

        if (eta && progress.speed > 0 && progress.total > progress.downloaded) {
            const remainingBytes = progress.total - progress.downloaded;
            const seconds = remainingBytes / progress.speed;
            eta.textContent = `~ ${formatTime(seconds)}`;
        } else if (eta) {
            eta.textContent = '-';
        }
    }

    function updateGlobalSpeed() {
        // Calculate total speed of all downloading items
        // This requires tracking active speeds in a map or similar, but for now we rely on the last event
        // A better way is to sum up speeds from all active downloads if we had that state readily available.
        // For simplicity, let's just push a random value or the current single download speed to the chart
        // In a real app, main process should send 'global-speed-update'
    }

    // Listen for chart updates (simulated for now based on single download)
    ipcRenderer.on('download-progress', (event, progress) => {
        // Update Chart
        const speedMB = progress.speed / (1024 * 1024);
        speedData.shift();
        speedData.push(speedMB);
        myChart.setOption({ series: [{ data: speedData }] });

        globalSpeedEl.textContent = formatSpeed(progress.speed);
    });

    searchInput?.addEventListener('input', renderList);

    // --- Utilities ---
    function showToast(title: string, msg: string, type: 'success' | 'error' = 'success') {
        const t = document.createElement('div');
        t.className = `toast-enter bg-white border-l-4 ${type === 'success' ? 'border-green-500' : 'border-red-500'} shadow-lg rounded-r-lg p-4 flex items-center gap-3 min-w-[300px]`;
        t.innerHTML = `
            <div class="${type === 'success' ? 'text-green-500' : 'text-red-500'}">
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'} text-xl"></i>
            </div>
            <div>
                <div class="font-bold text-gray-800 text-sm">${title}</div>
                <div class="text-gray-500 text-xs">${msg}</div>
            </div>
        `;
        toastContainer.appendChild(t);

        // Trigger animation
        requestAnimationFrame(() => {
            t.classList.remove('toast-enter');
            t.classList.add('toast-enter-active');
        });

        setTimeout(() => {
            t.classList.remove('toast-enter-active');
            t.classList.add('toast-exit-active');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    function formatBytes(bytes: number) {
        if (!bytes) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][i]}`;
    }

    function formatSpeed(bytes: number) {
        return bytes ? `${formatBytes(bytes)}/s` : '0 B/s';
    }

    function formatTime(seconds: number) {
        if (!isFinite(seconds) || seconds < 0) return '-';
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        const mins = Math.floor(seconds / 60);
        return `${mins} min`;
    }
});
