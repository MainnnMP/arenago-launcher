const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

async function installNeoForge(rootDir, mcVersion, loaderVersion, sender) {
    await fs.ensureDir(rootDir);
    const profilesPath = path.join(rootDir, 'launcher_profiles.json');
    if (!fs.existsSync(profilesPath)) {
        await fs.writeJson(profilesPath, { profiles: {} });
    }

    const versionName = `neoforge-${loaderVersion}`;
    const versionDir = path.join(rootDir, 'versions', versionName);
    const jsonPath = path.join(versionDir, `${versionName}.json`);

    if (await fs.pathExists(jsonPath)) return versionName;

    sender.send('progress', { percent: 15, message: `Descargando NeoForge ${loaderVersion}...` });
    const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
    const installerPath = path.join(rootDir, `neoforge-installer-${loaderVersion}.jar`);
    
    try {
        const response = await axios({ url: installerUrl, responseType: 'stream' });
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(installerPath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        sender.send('progress', { percent: 25, message: "Instalando dependencias de NeoForge con Java..." });
        await new Promise((resolve, reject) => {
            const proc = spawn('java', ['-jar', installerPath, '--installClient', rootDir]);
            let errorOutput = "";
            proc.stdout.on('data', (data) => console.log("[NeoForge Log]:", data.toString().trim()));
            proc.stderr.on('data', (data) => errorOutput += data.toString());
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Código ${code}. Detalle: ${errorOutput || "Revisa Java"}`));
            });
        });
    } finally {
        if (await fs.pathExists(installerPath)) await fs.remove(installerPath);
    }
    return versionName;
}

async function installForge(rootDir, mcVersion, loaderVersion, sender) {
    await fs.ensureDir(rootDir);
    const profilesPath = path.join(rootDir, 'launcher_profiles.json');
    if (!fs.existsSync(profilesPath)) {
        await fs.writeJson(profilesPath, { profiles: {} });
    }

    const versionName = `${mcVersion}-forge-${loaderVersion}`;
    const versionDir = path.join(rootDir, 'versions', versionName);
    const jsonPath = path.join(versionDir, `${versionName}.json`);

    if (await fs.pathExists(jsonPath)) return versionName;

    sender.send('progress', { percent: 15, message: `Descargando Forge ${loaderVersion}...` });
    const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;
    const installerPath = path.join(rootDir, `forge-installer-${loaderVersion}.jar`);
    
    try {
        const response = await axios({ url: installerUrl, responseType: 'stream' });
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(installerPath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        sender.send('progress', { percent: 25, message: "Instalando dependencias de Forge con Java..." });
        await new Promise((resolve, reject) => {
            const proc = spawn('java', ['-jar', installerPath, '--installClient', rootDir]);
            let errorOutput = "";
            proc.stdout.on('data', (data) => console.log("[Forge Log]:", data.toString().trim()));
            proc.stderr.on('data', (data) => errorOutput += data.toString());
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Código ${code}. Detalle: ${errorOutput || "Revisa Java"}`));
            });
        });
    } finally {
        if (await fs.pathExists(installerPath)) await fs.remove(installerPath);
    }
    return versionName;
}

async function installFabric(rootDir, mcVersion, loaderVersion, sender) {
    const versionName = `fabric-loader-${loaderVersion}-${mcVersion}`;
    const versionDir = path.join(rootDir, 'versions', versionName);
    const jsonPath = path.join(versionDir, `${versionName}.json`);

    await fs.ensureDir(versionDir);

    if (!await fs.pathExists(jsonPath)) {
        sender.send('progress', { percent: 15, message: `Instalando perfil de Fabric ${loaderVersion}...` });
        const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
        const res = await axios.get(url);
        await fs.writeJson(jsonPath, res.data, { spaces: 2 });
    }
    return versionName;
}

module.exports = { installNeoForge, installForge, installFabric };