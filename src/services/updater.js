// src/services/updater.js
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

// macOS solo permite que una app se reemplace a sí misma si está firmada y
// notarizada por Apple. Sin certificado, allí avisamos pero no actualizamos.
const puedeAutoActualizar = process.platform !== 'darwin';

// El usuario decide cuándo descargar y cuándo reiniciar.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
// Nunca instalar una versión anterior ni una preliberación.
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;
// Descargar siempre el instalador completo, no el web installer de NSIS.
autoUpdater.disableWebInstaller = true;

let ventana = null;

let estado = {
    status: 'idle',
    versionActual: app.getVersion(),
    versionNueva: null,
    percent: 0,
    error: null
};

function emitir(cambios) {
    estado = { ...estado, ...cambios };
    if (ventana && !ventana.isDestroyed()) {
        ventana.webContents.send('updates:status', estado);
    }
}

// Los mensajes de electron-updater traen URLs y rutas internas. Al renderer le
// mandamos solo una descripción, y el detalle queda en el log del proceso main.
function describirError(err) {
    const crudo = (err && err.message) || String(err);
    console.error('[Updater]', crudo);

    if (/ENOTFOUND|ENETUNREACH|EAI_AGAIN|ETIMEDOUT|ECONNRESET/i.test(crudo)) {
        return 'No se pudo conectar con el servidor de actualizaciones.';
    }
    if (/404|Cannot find channel|No published versions/i.test(crudo)) {
        return 'Todavía no hay versiones publicadas.';
    }
    if (/sha512|checksum|integrity/i.test(crudo)) {
        return 'El archivo descargado no coincide con su hash; se canceló la actualización.';
    }
    return 'No se pudo completar la actualización.';
}

autoUpdater.on('checking-for-update', () => {
    emitir({ status: 'checking', error: null });
});

autoUpdater.on('update-available', (info) => {
    emitir({ status: 'available', versionNueva: info.version, percent: 0 });
});

autoUpdater.on('update-not-available', () => {
    emitir({ status: 'none', versionNueva: null });
});

autoUpdater.on('download-progress', (p) => {
    emitir({ status: 'downloading', percent: Math.round(p.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
    emitir({ status: 'ready', versionNueva: info.version, percent: 100 });
});

autoUpdater.on('error', (err) => {
    emitir({ status: 'error', error: describirError(err) });
});

function init(win) {
    ventana = win;
    if (!puedeAutoActualizar) emitir({ status: 'unsupported' });
}

async function buscar() {
    // En desarrollo no hay app empaquetada que reemplazar.
    if (!app.isPackaged) return { ok: false, motivo: 'dev' };
    if (!puedeAutoActualizar) return { ok: false, motivo: 'unsupported' };

    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        emitir({ status: 'error', error: describirError(err) });
        return { ok: false, motivo: 'error' };
    }
}

async function descargar() {
    if (estado.status !== 'available') return { ok: false, motivo: 'sin-actualizacion' };

    try {
        // electron-updater compara el sha512 del archivo contra el que declara
        // latest.yml antes de dejarlo disponible para instalar.
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (err) {
        emitir({ status: 'error', error: describirError(err) });
        return { ok: false, motivo: 'error' };
    }
}

function instalar() {
    if (estado.status !== 'ready') return { ok: false, motivo: 'sin-descarga' };

    // Se aplaza para que el renderer reciba la respuesta antes de que la app cierre.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ok: true };
}

function obtenerEstado() {
    return estado;
}

module.exports = { init, buscar, descargar, instalar, obtenerEstado };
