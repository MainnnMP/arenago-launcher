const { ipcMain } = require('electron');
const auth = require('../services/auth');

module.exports = function registerLoginIPC() {
    ipcMain.handle('login', async (event, data) => {
        if (data.tipo === 'microsoft') {
            return await auth.loginMicrosoft();
        } else {
            return await auth.loginOffline(data.username);
        }
    });
};