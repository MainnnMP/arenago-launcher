const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    login: (data) => ipcRenderer.invoke('login', data),
    play: (config) => ipcRenderer.invoke('play', config),
    
    getSkins: () => ipcRenderer.invoke('skins:get'),
    addSkin: () => ipcRenderer.invoke('skins:add'),
    deleteSkin: (path) => ipcRenderer.invoke('skins:delete', path),
    
    getCatalog: () => ipcRenderer.invoke('modpacks:getCatalog'),
    checkInstalled: (ids) => ipcRenderer.invoke('modpacks:checkInstalled', ids),
    cleanModpack: (id) => ipcRenderer.invoke('modpacks:clean', id),
    
    openModpackFolder: () => ipcRenderer.invoke('settings:openFolder'),
    openLink: (url) => ipcRenderer.invoke('settings:openLink', url),
    
    onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data)),
    stopGame: () => ipcRenderer.invoke('stop-game'),
    onGameClosed: (callback) => ipcRenderer.on('game-closed', callback),

    checkUpdates: () => ipcRenderer.invoke('updates:check'),
    downloadUpdate: () => ipcRenderer.invoke('updates:download'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
    getUpdateState: () => ipcRenderer.invoke('updates:state'),
    onUpdateStatus: (callback) => ipcRenderer.on('updates:status', (event, data) => callback(data))
});