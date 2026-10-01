// src/utils/paths.js
const { app } = require('electron');
const path = require('path');

// Carpeta donde se guardará todo
const rootData = path.join(app.getPath('userData'), '.arenago');

module.exports = {
    rootData,

    // Datos generales del launcher
    launcherFolder: path.join(rootData, 'launcher'),

    // Minecraft compartido entre todas las instancias
    assetsFolder: path.join(rootData, 'assets'),
    librariesFolder: path.join(rootData, 'libraries'),
    versionsFolder: path.join(rootData, 'versions'),

    // Datos propios de cada instancia/modpack
    instancesFolder: path.join(rootData, 'instances'),

    // Otros datos
    skinsFolder: path.join(rootData, 'skins'),
    javaFolder: path.join(rootData, 'java')
};