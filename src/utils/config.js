const fs = require('fs-extra');
const path = require('path');
const paths = require('./paths');

const configFile = path.join(paths.launcherFolder, 'config.json');

async function loadConfig() {
    if (!fs.existsSync(configFile)) {
        return { ram: 4096, javaPath: 'auto', account: null };
    }
    return fs.readJson(configFile);
}

async function saveConfig(data) {
    await fs.ensureDir(paths.launcherFolder);
    await fs.writeJson(configFile, data, { spaces: 2 });
}

module.exports = { loadConfig, saveConfig };