const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    onMaximizeChange: (callback) => ipcRenderer.on('window-maximized-state', (_, isMaximized) => callback(isMaximized)),
    
    // Snip Engine
    triggerSnip: () => ipcRenderer.send('trigger-snip'),
    onScreenImage: (callback) => ipcRenderer.on('set-screen-image', (_, imageUri) => callback(imageUri)),
    snipComplete: (base64Data) => ipcRenderer.send('snip-complete', base64Data),
    closeSnip: () => ipcRenderer.send('close-snip'),

    // Spotlight
    onPrepareSpotlight: (callback) => ipcRenderer.on('prepare-spotlight', (_, base64Data) => callback(base64Data)),
    closeSpotlight: () => ipcRenderer.send('close-spotlight'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    focusMainWindow: () => ipcRenderer.send('focus-main-window'),
    
    // Background Worker Invokes
    getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
    getClerkId: () => ipcRenderer.invoke('get-clerk-id'),
    getTray: () => ipcRenderer.invoke('get-tray'),
    addToTray: (img) => ipcRenderer.invoke('add-to-tray', img),
    clearTray: () => ipcRenderer.invoke('clear-tray'),

    // 🚨 NEW: Dashboard In-Chat Snipping
    triggerDashboardSnip: () => ipcRenderer.send('trigger-dashboard-snip'),
    onDashboardSnipComplete: (callback) => ipcRenderer.on('dashboard-snip-complete', (_, base64Data) => callback(base64Data))
});