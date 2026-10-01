const { ipcMain } = require('electron');
const updater = require('../services/updater');
const launcher = require('../services/launcher');

// Ninguno de estos handlers acepta parámetros: el origen de la actualización
// está fijado en la configuración de build, nunca lo propone el renderer.
module.exports = function registerUpdatesIPC() {
    ipcMain.handle('updates:check', () => updater.buscar());
    ipcMain.handle('updates:download', () => updater.descargar());
    ipcMain.handle('updates:state', () => updater.obtenerEstado());

    ipcMain.handle('updates:install', () => {
        // Reiniciar el launcher con Minecraft abierto dejaría el juego huérfano.
        if (launcher.isGameRunning()) {
            return { ok: false, motivo: 'juego-abierto' };
        }
        return updater.instalar();
    });
};
