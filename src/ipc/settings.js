const { ipcMain, shell } = require('electron');
const paths = require('../utils/paths');
const fs = require('fs-extra');
module.exports = function registerSettingsIPC() {
    ipcMain.handle('settings:openFolder', async () => {
        await fs.ensureDir(paths.rootData);
        shell.openPath(paths.rootData);
    });
    ipcMain.handle('settings:openLink', async (event, url) => shell.openExternal(url));
};