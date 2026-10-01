const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const { installNeoForge, installForge, installFabric } = require('./loaderInstaller');

const INDEX_FILE = 'modrinth.index.json';
const INSTANCE_FILE = 'arenago-instance.json';

async function downloadFileNative(url, dest) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falló la descarga: ${url}`);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(dest, Buffer.from(buffer));
}

function normalizeRel(rel) {
    return String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function instanceMetaPath(instanceFolder) {
    return path.join(instanceFolder, INSTANCE_FILE);
}

function indexPath(instanceFolder) {
    return path.join(instanceFolder, INDEX_FILE);
}

async function readInstanceMeta(instanceFolder) {
    const p = instanceMetaPath(instanceFolder);
    if (!fs.existsSync(p)) return null;
    try {
        return await fs.readJson(p);
    } catch {
        return null;
    }
}

async function writeInstanceMeta(instanceFolder, data) {
    const prev = (await readInstanceMeta(instanceFolder)) || {};
    await fs.writeJson(instanceMetaPath(instanceFolder), { ...prev, ...data }, { spaces: 2 });
}

async function readIndex(instanceFolder) {
    const p = indexPath(instanceFolder);
    if (!fs.existsSync(p)) return null;
    try {
        return await fs.readJson(p);
    } catch {
        return null;
    }
}

async function hashFile(filePath, algorithm) {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
}

async function fileMatchesHashes(filePath, hashes) {
    if (!hashes || !fs.existsSync(filePath)) return false;
    try {
        if (hashes.sha512) {
            return (await hashFile(filePath, 'sha512')) === String(hashes.sha512).toLowerCase();
        }
        if (hashes.sha1) {
            return (await hashFile(filePath, 'sha1')) === String(hashes.sha1).toLowerCase();
        }
    } catch {
        return false;
    }
    return false;
}

function resolveInInstance(instanceFolder, rel) {
    return path.join(instanceFolder, ...normalizeRel(rel).split('/').filter(Boolean));
}

function isProtectedOverride(rel) {
    const n = normalizeRel(rel).toLowerCase();
    if (n === 'options.txt' || n === 'optionsof.txt') return true;
    if (n === 'saves' || n.startsWith('saves/')) return true;
    if (n === 'screenshots' || n.startsWith('screenshots/')) return true;
    return false;
}

async function listFilesRecursive(dir, base = dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...await listFilesRecursive(full, base));
        } else if (entry.isFile()) {
            out.push(normalizeRel(path.relative(base, full)));
        }
    }
    return out;
}

function sendProgress(sender, percent, message) {
    if (sender) sender.send('progress', { percent, message });
}

function loaderKey(deps) {
    if (!deps) return '';
    return [
        deps.minecraft,
        deps['fabric-loader'],
        deps.forge,
        deps.neoforge
    ].filter(Boolean).join('|');
}

function loaderName(deps) {
    if (!deps) return null;
    if (deps['fabric-loader']) return `fabric-loader:${deps['fabric-loader']}`;
    if (deps.forge) return `forge:${deps.forge}`;
    if (deps.neoforge) return `neoforge:${deps.neoforge}`;
    return null;
}

async function ensureLoader(indexJson, instanceFolder, sender) {
    const mcVersion = indexJson.dependencies.minecraft;
    let installedVersionName = mcVersion;

    if (indexJson.dependencies['fabric-loader']) {
        const loaderVersion = indexJson.dependencies['fabric-loader'];
        installedVersionName = await installFabric(instanceFolder, mcVersion, loaderVersion, sender);
    } else if (indexJson.dependencies['forge']) {
        const loaderVersion = indexJson.dependencies['forge'];
        installedVersionName = await installForge(instanceFolder, mcVersion, loaderVersion, sender);
    } else if (indexJson.dependencies['neoforge']) {
        const loaderVersion = indexJson.dependencies['neoforge'];
        installedVersionName = await installNeoForge(instanceFolder, mcVersion, loaderVersion, sender);
    }

    return { mcVersion, installedVersionName };
}

async function downloadIndexFiles(files, instanceFolder, sender, percentStart, percentSpan) {
    const modsList = files || [];
    let descargados = 0;

    for (const mod of modsList) {
        const destPath = resolveInInstance(instanceFolder, mod.path);
        await fs.ensureDir(path.dirname(destPath));

        const nombre = path.basename(mod.path);
        const percent = percentStart + (modsList.length === 0
            ? percentSpan
            : Math.floor((descargados / modsList.length) * percentSpan));
        sendProgress(sender, percent, `Verificando: ${nombre}`);

        if (await fileMatchesHashes(destPath, mod.hashes)) {
            descargados++;
            continue;
        }

        sendProgress(sender, percent, `Descargando: ${nombre}`);
        if (mod.downloads && mod.downloads.length > 0) {
            try {
                await downloadFileNative(mod.downloads[0], destPath);
            } catch (e) {
                console.error(`Error descargando archivo: ${mod.path}`, e);
            }
        }
        descargados++;
    }
}

async function removeObsoleteIndexFiles(oldIndex, newIndex, instanceFolder) {
    const keep = new Set((newIndex.files || []).map(f => normalizeRel(f.path)));
    for (const file of oldIndex.files || []) {
        const rel = normalizeRel(file.path);
        if (keep.has(rel)) continue;
        const dest = resolveInInstance(instanceFolder, rel);
        if (fs.existsSync(dest)) await fs.remove(dest);
    }
}

async function applyOverrides(overridesPath, instanceFolder, options) {
    const { firstInstall, previousHashes } = options;
    const nextHashes = {};
    const files = fs.existsSync(overridesPath) ? await listFilesRecursive(overridesPath) : [];

    for (const rel of files) {
        const src = path.join(overridesPath, ...rel.split('/'));
        const dest = resolveInInstance(instanceFolder, rel);
        const srcHash = await hashFile(src, 'sha1');
        nextHashes[rel] = srcHash;

        if (!firstInstall && isProtectedOverride(rel)) continue;

        const destExists = fs.existsSync(dest);
        if (!destExists) {
            await fs.ensureDir(path.dirname(dest));
            await fs.copy(src, dest);
            continue;
        }

        if (firstInstall) {
            await fs.copy(src, dest);
            continue;
        }

        const prevHash = previousHashes && previousHashes[rel];
        if (!prevHash) continue;

        const destHash = await hashFile(dest, 'sha1');
        if (destHash === prevHash && destHash !== srcHash) {
            await fs.copy(src, dest);
        }
    }

    if (!firstInstall && previousHashes) {
        const incoming = new Set(files);
        for (const rel of Object.keys(previousHashes)) {
            if (incoming.has(rel)) continue;
            if (isProtectedOverride(rel)) continue;
            const dest = resolveInInstance(instanceFolder, rel);
            if (!fs.existsSync(dest)) continue;
            const destHash = await hashFile(dest, 'sha1');
            if (destHash === previousHashes[rel]) await fs.remove(dest);
        }
    }

    return nextHashes;
}

async function extractMrPack(mrpackUrl, instanceFolder, sender) {
    const tempZip = path.join(instanceFolder, 'temp.mrpack');
    const extractDir = path.join(instanceFolder, 'extracted');

    await fs.ensureDir(instanceFolder);
    sendProgress(sender, 10, 'Descargando Modpack...');
    await downloadFileNative(mrpackUrl, tempZip);

    sendProgress(sender, 20, 'Analizando archivos del .mrpack...');
    const zip = new AdmZip(tempZip);
    zip.extractAllTo(extractDir, true);

    return { tempZip, extractDir };
}

async function cleanupExtract(tempZip, extractDir) {
    if (tempZip && fs.existsSync(tempZip)) await fs.remove(tempZip);
    if (extractDir && fs.existsSync(extractDir)) await fs.remove(extractDir);
}

async function finishInstall(instanceFolder, indexJson, installedVersionName, catalogVersion, overrideHashes) {
    await fs.writeJson(indexPath(instanceFolder), indexJson, { spaces: 2 });
    await writeInstanceMeta(instanceFolder, {
        version: catalogVersion || null,
        mcVersion: indexJson.dependencies.minecraft,
        loader: loaderName(indexJson.dependencies),
        installedVersionName,
        overrideHashes: overrideHashes || {}
    });
}

async function installMrPack(mrpackUrl, instanceFolder, sender, options = {}) {
    const { catalogVersion } = options;
    const { tempZip, extractDir } = await extractMrPack(mrpackUrl, instanceFolder, sender);

    try {
        const sourceIndexPath = path.join(extractDir, INDEX_FILE);
        if (!fs.existsSync(sourceIndexPath)) {
            throw new Error('El .mrpack no incluye modrinth.index.json');
        }
        const indexJson = await fs.readJson(sourceIndexPath);

        const { mcVersion, installedVersionName } = await ensureLoader(indexJson, instanceFolder, sender);
        await downloadIndexFiles(indexJson.files, instanceFolder, sender, 30, 45);

        sendProgress(sender, 80, 'Aplicando configuraciones...');
        const overrideHashes = await applyOverrides(path.join(extractDir, 'overrides'), instanceFolder, {
            firstInstall: true,
            previousHashes: {}
        });

        await finishInstall(instanceFolder, indexJson, installedVersionName, catalogVersion, overrideHashes);
        return { mcVersion, installedVersionName, version: catalogVersion || null };
    } finally {
        await cleanupExtract(tempZip, extractDir);
    }
}

async function syncMrPack(mrpackUrl, instanceFolder, sender, options = {}) {
    const { catalogVersion } = options;
    const oldIndex = await readIndex(instanceFolder);
    const meta = (await readInstanceMeta(instanceFolder)) || {};
    const previousHashes = meta.overrideHashes || {};

    const { tempZip, extractDir } = await extractMrPack(mrpackUrl, instanceFolder, sender);

    try {
        const sourceIndexPath = path.join(extractDir, INDEX_FILE);
        if (!fs.existsSync(sourceIndexPath)) {
            throw new Error('El .mrpack no incluye modrinth.index.json');
        }
        const indexJson = await fs.readJson(sourceIndexPath);

        if (oldIndex) {
            sendProgress(sender, 22, 'Quitando archivos que ya no van en el pack...');
            await removeObsoleteIndexFiles(oldIndex, indexJson, instanceFolder);
        }

        const loaderChanged = !oldIndex || loaderKey(oldIndex.dependencies) !== loaderKey(indexJson.dependencies);
        let mcVersion = indexJson.dependencies.minecraft;
        let installedVersionName = meta.installedVersionName || mcVersion;
        if (loaderChanged) {
            const loader = await ensureLoader(indexJson, instanceFolder, sender);
            mcVersion = loader.mcVersion;
            installedVersionName = loader.installedVersionName;
        }

        await downloadIndexFiles(indexJson.files, instanceFolder, sender, 30, 45);

        sendProgress(sender, 80, 'Actualizando configuraciones...');
        const overrideHashes = await applyOverrides(path.join(extractDir, 'overrides'), instanceFolder, {
            firstInstall: false,
            previousHashes
        });

        await finishInstall(instanceFolder, indexJson, installedVersionName, catalogVersion, overrideHashes);
        return { mcVersion, installedVersionName, version: catalogVersion || null };
    } finally {
        await cleanupExtract(tempZip, extractDir);
    }
}

function needsSync(meta, catalogVersion) {
    if (!catalogVersion) return false;
    if (!meta || !meta.version) return true;
    return String(meta.version) !== String(catalogVersion);
}

module.exports = {
    installMrPack,
    syncMrPack,
    readInstanceMeta,
    needsSync
};
