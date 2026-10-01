const { ipcMain, dialog } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const paths = require('../utils/paths');
module.exports = function registerSkinsIPC() {
    ipcMain.handle('skins:get', async () => {
        await fs.ensureDir(paths.skinsFolder);
        const files = await fs.readdir(paths.skinsFolder);
        return files.filter(f => f.endsWith('.png')).map(f => ({ path: path.join(paths.skinsFolder, f) }));
    });
    ipcMain.handle('skins:add', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Skins', extensions: ['png'] }] });
        if (canceled || !filePaths.length) return null;
        await fs.ensureDir(paths.skinsFolder);
        const dest = path.join(paths.skinsFolder, Date.now() + '.png');
        await fs.copy(filePaths[0], dest);
        const files = await fs.readdir(paths.skinsFolder);
        return files.filter(f => f.endsWith('.png')).map(f => ({ path: path.join(paths.skinsFolder, f) }));
    });
    ipcMain.handle('skins:delete', async (event, skinPath) => {
        if (fs.existsSync(skinPath)) await fs.remove(skinPath);
        const files = await fs.readdir(paths.skinsFolder);
        return files.filter(f => f.endsWith('.png')).map(f => ({ path: path.join(paths.skinsFolder, f) }));
    });
};