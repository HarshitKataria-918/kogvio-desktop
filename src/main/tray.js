const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray = null;

function createTray(mainWindow, onTriggerSnip) {
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    
    try {
        tray = new Tray(iconPath);
    } catch {
        return null;
    }

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Workspace', 
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            } 
        },
        { 
            label: 'Capture Screen (Ctrl+Shift+E)', 
            click: () => onTriggerSnip() 
        },
        { type: 'separator' },
        { 
            label: 'Quit Kogvio', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('Kogvio AI Workspace');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });

    return tray;
}

module.exports = { createTray };