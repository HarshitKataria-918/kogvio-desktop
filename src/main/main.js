const { app, BrowserWindow, globalShortcut, ipcMain, shell, desktopCapturer, screen } = require('electron');
const path = require('path');
const { createTray } = require('./tray');

let mainWindow = null;
let snipWindow = null;
let spotlightWindow = null;
let tray = null;
let scanTray = [];
let activeSnipMode = 'global'; // 🚨 NEW STATE TRACKER

if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient('kogvio', process.execPath, [path.resolve(process.argv[1])]);
} else {
    app.setAsDefaultProtocolClient('kogvio');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createMainWindow();
        registerGlobalShortcuts();
        tray = createTray(mainWindow, handleCaptureTrigger);
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        frame: false,
        backgroundColor: '#000000',
        icon: path.join(__dirname, '../../assets/icon.ico'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadURL('https://kogvio.com/dashboard.html');

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) mainWindow.show();
    });

    mainWindow.webContents.on('did-finish-load', () => {
        const currentUrl = mainWindow.webContents.getURL();
        
        if (currentUrl.includes('kogvio.com')) {
            mainWindow.webContents.executeJavaScript(`
                if (!document.getElementById('electron-drag-bar')) {
                    const dragBar = document.createElement('div');
                    dragBar.id = 'electron-drag-bar';
                    dragBar.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 40px; z-index: 999998; -webkit-app-region: drag; pointer-events: none;';
                    document.body.appendChild(dragBar);

                    const controls = document.createElement('div');
                    controls.id = 'electron-desktop-controls';
                    controls.style.cssText = 'position: fixed; top: 12px; right: 16px; z-index: 999999; display: flex; align-items: center; gap: 8px; background: rgba(10, 5, 15, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); -webkit-app-region: no-drag;';
                    
                    controls.innerHTML = \`
                        <button id="win-min-btn" style="padding: 6px; color: #A1A1AA; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex;" onmouseover="this.style.color='#FFF'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#A1A1AA'; this.style.background='transparent'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        <button id="win-max-btn" style="padding: 6px; color: #A1A1AA; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex;" onmouseover="this.style.color='#FFF'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#A1A1AA'; this.style.background='transparent'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>
                        </button>
                        <button id="win-close-btn" style="padding: 6px; color: #A1A1AA; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex;" onmouseover="this.style.color='#FFF'; this.style.background='#EF4444'" onmouseout="this.style.color='#A1A1AA'; this.style.background='transparent'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    \`;
                    
                    document.body.appendChild(controls);

                    document.getElementById('win-min-btn').onclick = () => window.electronAPI.minimizeWindow();
                    document.getElementById('win-max-btn').onclick = () => window.electronAPI.maximizeWindow();
                    document.getElementById('win-close-btn').onclick = () => window.electronAPI.closeWindow();
                }
                true;
            `).catch(err => console.log('Injection failed:', err));
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('clerk') || url.includes('google.com') || url.includes('accounts')) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    frame: true, autoHideMenuBar: true, width: 500, height: 650,
                    webPreferences: { nodeIntegration: false, contextIsolation: true }
                }
            };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-state', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-state', false));
}

function registerGlobalShortcuts() {
    const shortcut = process.platform === 'darwin' ? 'Command+Shift+E' : 'Control+Shift+E';
    globalShortcut.register(shortcut, () => {
        activeSnipMode = 'global'; // 🚨 Mark as global snip
        handleCaptureTrigger();
    });
}

function handleCaptureTrigger() {
    if (spotlightWindow) {
        spotlightWindow.close();
        spotlightWindow = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scale = primaryDisplay.scaleFactor || 1;

    desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.floor(width * scale), height: Math.floor(height * scale) }
    }).then(sources => {
        if (sources.length > 0) {
            createSnipWindow(sources[0].thumbnail.toDataURL());
        }
    }).catch(err => console.error('[Kogvio Desktop] Capture failed:', err));
}

function createSnipWindow(imageUri) {
    if (snipWindow) return; 
    const primaryDisplay = screen.getPrimaryDisplay();
    
    snipWindow = new BrowserWindow({
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        width: primaryDisplay.bounds.width,
        height: primaryDisplay.bounds.height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    snipWindow.loadFile(path.join(__dirname, '../renderer/snip.html')).catch(() => {
        if (snipWindow) snipWindow.close();
    });

    snipWindow.webContents.on('did-finish-load', () => {
        if (snipWindow) {
            snipWindow.show();
            snipWindow.focus();
            snipWindow.webContents.send('set-screen-image', imageUri);
        }
    });

    snipWindow.on('closed', () => { snipWindow = null; });
}

// --- IPC EVENT ROUTING ---

ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => { if (!mainWindow) { return; } mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// 🚨 NEW: Receive Dashboard trigger
ipcMain.on('trigger-dashboard-snip', () => { 
    activeSnipMode = 'dashboard'; 
    handleCaptureTrigger(); 
});

ipcMain.on('trigger-snip', () => {
    activeSnipMode = 'global';
    handleCaptureTrigger();
});

ipcMain.on('close-snip', () => { if (snipWindow) snipWindow.close(); });
ipcMain.on('close-spotlight', () => { if (spotlightWindow) spotlightWindow.close(); });
ipcMain.on('open-external', (_, url) => { shell.openExternal(url); });
ipcMain.on('focus-main-window', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Context Tray Handlers
ipcMain.handle('get-tray', () => ({ tray: scanTray }));
ipcMain.handle('add-to-tray', (_, image) => {
    if (scanTray.length < 10) scanTray.push(image);
    return { success: true, count: scanTray.length };
});
ipcMain.handle('clear-tray', () => {
    scanTray = [];
    return { success: true };
});

ipcMain.handle('get-auth-token', async () => {
    if (!mainWindow) return null;
    try {
        return await mainWindow.webContents.executeJavaScript(`
            (async () => {
                try { return window.Clerk && window.Clerk.session ? await window.Clerk.session.getToken() : null; } catch(e) { return null; }
            })()
        `);
    } catch { return null; }
});

ipcMain.handle('get-clerk-id', async () => {
    if (!mainWindow) return null;
    try {
        return await mainWindow.webContents.executeJavaScript(`
            (async () => {
                try { return window.Clerk && window.Clerk.user ? window.Clerk.user.id : null; } catch(e) { return null; }
            })()
        `);
    } catch { return null; }
});

// 🚨 ROUTING THE COMPLETED SNIP
ipcMain.on('snip-complete', (event, base64Data) => {
    if (snipWindow) snipWindow.close();

    // BRANCH 1: Send image directly to Dashboard Chat
    if (activeSnipMode === 'dashboard') {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('dashboard-snip-complete', base64Data);
        }
        return;
    }

    // BRANCH 2: Open Spotlight Overlay
    const primaryDisplay = screen.getPrimaryDisplay();
    const cursor = screen.getCursorScreenPoint();
    
    if (spotlightWindow) spotlightWindow.close();

    const cardWidth = 400;
    const cardHeight = 540;
    const spawnX = Math.min(Math.max(20, cursor.x - 200), primaryDisplay.workAreaSize.width - cardWidth - 20);
    const spawnY = Math.min(Math.max(20, cursor.y - 100), primaryDisplay.workAreaSize.height - cardHeight - 20);

    spotlightWindow = new BrowserWindow({
        x: spawnX,
        y: spawnY,
        width: cardWidth,
        height: cardHeight,
        minWidth: 320,
        minHeight: 400,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    spotlightWindow.loadFile(path.join(__dirname, '../renderer/spotlight.html'));

    spotlightWindow.webContents.on('did-finish-load', () => {
        if (spotlightWindow) {
            spotlightWindow.show();
            spotlightWindow.focus();
            spotlightWindow.webContents.send('prepare-spotlight', base64Data);
        }
    });

    spotlightWindow.on('closed', () => { spotlightWindow = null; });
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });