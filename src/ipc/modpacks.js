const { ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const paths = require('../utils/paths');
const { readInstanceMeta } = require('../services/modpack');

const CATALOG_URL = 'https://raw.githubusercontent.com/MainnnMP/arenago-modpacks/main/catalogo.json';

function extraerLista(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.modpacks)) return data.modpacks;
    if (data && Array.isArray(data.catalogo)) return data.catalogo;
    throw new Error('El catalogo.json no es una lista. Tiene que ser [ { ... }, { ... } ].');
}

function versionCatalogo(mp) {
    if (mp.version) return String(mp.version);
    return crypto.createHash('sha1').update(String(mp.mrpackUrl)).digest('hex').slice(0, 12);
}

function normalizar(mp) {
    if (!mp || typeof mp !== 'object') return null;
    const modpackId = mp.modpackId || mp.id;
    const name = mp.name;
    const mrpackUrl = mp.mrpackUrl;
    const mcVersion = mp.mcVersion;
    if (!modpackId || !name || !mrpackUrl || !mcVersion) return null;
    return {
        modpackId: String(modpackId),
        name: String(name),
        description: mp.description ? String(mp.description) : '',
        mcVersion: String(mcVersion),
        mrpackUrl: String(mrpackUrl),
        image: mp.image ? String(mp.image) : '',
        version: versionCatalogo(mp)
    };
}

async function fetchCatalogo() {
    const res = await fetch(`${CATALOG_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} al pedir el catálogo.`);
    const texto = await res.text();
    let data;
    try {
        data = JSON.parse(texto);
    } catch {
        throw new Error('El catalogo.json no es JSON válido. Revisa comas entre los modpacks.');
    }
    const lista = extraerLista(data).map(normalizar).filter(Boolean);
    if (lista.length === 0) throw new Error('El catálogo está vacío o le faltan campos (modpackId, name, mcVersion, mrpackUrl).');
    return lista;
}

module.exports = function registerModpacksIPC() {
    ipcMain.handle('modpacks:getCatalog', async () => {
        try {
            return { ok: true, modpacks: await fetchCatalogo() };
        } catch (err) {
            console.error('Error al cargar el catálogo:', err);
            return { ok: false, error: err.message || 'No se pudo cargar el catálogo.' };
        }
    });
    ipcMain.handle('modpacks:checkInstalled', async (event, ids) => {
        const result = {};
        if (!Array.isArray(ids)) return result;
        for (const id of ids) {
            const instancePath = path.join(paths.instancesFolder, id);
            const installed = fs.existsSync(instancePath);
            const meta = installed ? await readInstanceMeta(instancePath) : null;
            result[id] = {
                installed,
                version: meta && meta.version ? String(meta.version) : null
            };
        }
        return result;
    });
    ipcMain.handle('modpacks:clean', async (event, id) => {
        const p = path.join(paths.instancesFolder, id);
        if (fs.existsSync(p)) await fs.remove(p);
        return true;
    });
};
