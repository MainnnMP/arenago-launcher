const { ipcMain } = require('electron');
const launcher = require('../services/launcher');

module.exports = function registerPlayIPC() {
    ipcMain.handle('play', async (event, config) => {
        // config trae: auth, ram, modpackId, mcVersion, mrpackUrl
        return await launcher.launchGame(config, event.sender);
    });

    ipcMain.handle('stop-game', () => launcher.stopGame());
};