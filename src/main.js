const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const paths = require('./utils/paths');

const registerLoginIPC = require('./ipc/login');
const registerPlayIPC = require('./ipc/play');
const registerSettingsIPC = require('./ipc/settings');
const registerSkinsIPC = require('./ipc/skins');
const registerModpacksIPC = require('./ipc/modpacks');
const registerUpdatesIPC = require('./ipc/updates');
const updater = require('./services/updater');

async function createWindow() {
    await fs.ensureDir(paths.instancesFolder);

    const win = new BrowserWindow({
        width: 1000,
        height: 600,
        frame: false,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));

    updater.init(win);
    // Se busca al arrancar; si falla, la UI simplemente no muestra el aviso.
    win.webContents.once('did-finish-load', () => updater.buscar());
}

app.whenReady().then(() => {
    registerLoginIPC();
    registerPlayIPC();
    registerSettingsIPC();
    registerSkinsIPC();
    registerModpacksIPC();
    registerUpdatesIPC();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});