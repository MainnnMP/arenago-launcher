// src/services/launcher.js
const { launch } = require('@xmcl/core');
const path = require('path');
const fs = require('fs-extra');
const paths = require('../utils/paths');
const modpack = require('./modpack');

// Variable global para guardar la instancia activa
let activeProcess = null;

async function launchGame(config, sender) {
    try {
        const instancePath = path.join(paths.instancesFolder, config.modpackId);
        const isInstalled = fs.existsSync(path.join(instancePath, 'mods'))
            || fs.existsSync(path.join(instancePath, 'arenago-instance.json'));
        let finalMcVersion = config.mcVersion;
        let versionToLaunch = finalMcVersion;
        const catalogVersion = config.modpackVersion;

        // 1. Instalar, o sincronizar solo lo que cambió si hay una versión nueva
        if (!isInstalled) {
            const info = await modpack.installMrPack(config.mrpackUrl, instancePath, sender, { catalogVersion });
            finalMcVersion = info.mcVersion;
            versionToLaunch = info.installedVersionName;
        } else {
            const meta = await modpack.readInstanceMeta(instancePath);
            if (modpack.needsSync(meta, catalogVersion)) {
                const info = await modpack.syncMrPack(config.mrpackUrl, instancePath, sender, { catalogVersion });
                finalMcVersion = info.mcVersion;
                versionToLaunch = info.installedVersionName;
            } else if (meta && meta.mcVersion) {
                finalMcVersion = meta.mcVersion;
                versionToLaunch = meta.installedVersionName || finalMcVersion;
            }
        }

        let loaderOnDisk = await modpack.findInstalledLoaderVersion(instancePath);
        if (!loaderOnDisk) {
            const repaired = await modpack.ensureLoaderFromInstance(instancePath, sender);
            if (repaired) {
                finalMcVersion = repaired.mcVersion || finalMcVersion;
                loaderOnDisk = repaired.installedVersionName;
            }
        }
        if (loaderOnDisk) {
            versionToLaunch = loaderOnDisk;
        }

        // 2. Asegurar cliente base de Minecraft (.jar y .json)
        const baseJarFolder = path.join(instancePath, 'versions', finalMcVersion);
        const baseJarPath = path.join(baseJarFolder, `${finalMcVersion}.jar`);
        const baseJsonPath = path.join(baseJarFolder, `${finalMcVersion}.json`);
        
        let versionJsonData;
        if (!fs.existsSync(baseJarPath) || !fs.existsSync(baseJsonPath)) {
            sender.send('progress', { percent: 80, message: `Descargando recursos de Minecraft ${finalMcVersion}...` });
            const manifestRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            const manifest = await manifestRes.json();
            const versionMeta = manifest.versions.find(v => v.id === finalMcVersion);
            
            const versionRes = await fetch(versionMeta.url);
            versionJsonData = await versionRes.json();

            await fs.ensureDir(baseJarFolder);
            await fs.writeJson(baseJsonPath, versionJsonData, { spaces: 2 });

            const jarRes = await fetch(versionJsonData.downloads.client.url);
            await fs.writeFile(baseJarPath, Buffer.from(await jarRes.arrayBuffer()));
        } else {
            versionJsonData = await fs.readJson(baseJsonPath);
        }

       // 3. ASSETS GLOBALES DESDE LA CARPETA ROOT
        sender.send('progress', { percent: 85, message: "Sincronizando assets globales..." });
        
        await fs.ensureDir(paths.assetsFolder);

        const localAssets = path.join(instancePath, 'assets');
        const indexesFolder = path.join(paths.assetsFolder, 'indexes');
        const objectsFolder = path.join(paths.assetsFolder, 'objects');
        
        await fs.ensureDir(indexesFolder);
        await fs.ensureDir(objectsFolder);

        // Recrear el puente (junction) para la instancia
        if (fs.existsSync(localAssets)) {
            if (!fs.lstatSync(localAssets).isSymbolicLink()) {
                await fs.remove(localAssets);
            } else {
                await fs.unlink(localAssets);
            }
        }
        await fs.ensureSymlink(paths.assetsFolder, localAssets, 'junction');

        if (versionJsonData.assetIndex) {
            const assetIndex = versionJsonData.assetIndex;
            const indexFilePath = path.join(indexesFolder, `${assetIndex.id}.json`);
            
            let indexData;

            // 1. Descargar el archivo índice si no existe
            if (!fs.existsSync(indexFilePath)) {
                const indexRes = await fetch(assetIndex.url);
                if (indexRes.ok) {
                    indexData = await indexRes.json();
                    await fs.writeJson(indexFilePath, indexData, { spaces: 2 });
                }
            } else {
                // Si ya existe, lo leemos de la computadora
                indexData = await fs.readJson(indexFilePath);
            }

            // 2. DESCARGAR LOS OBJETOS FÍSICOS (Sonidos, texturas, etc.)
            if (indexData && indexData.objects) {
                const objects = indexData.objects;
                const objectKeys = Object.keys(objects);
                
                sender.send('progress', { percent: 87, message: `Descargando ${objectKeys.length} assets físicos...` });

                for (const key of objectKeys) {
                    const hash = objects[key].hash;
                    const folderName = hash.substring(0, 2); 
                    
                    const objectDir = path.join(objectsFolder, folderName);
                    const objectPath = path.join(objectDir, hash);
                    
                    if (!fs.existsSync(objectPath)) {
                        await fs.ensureDir(objectDir);
                        
                        const assetUrl = `https://resources.download.minecraft.net/${folderName}/${hash}`;
                        
                        try {
                            const res = await fetch(assetUrl);
                            if (res.ok) {
                                await fs.writeFile(objectPath, Buffer.from(await res.arrayBuffer()));
                            }
                        } catch (e) {
                            console.error(`Fallo menor descargando asset ${hash}:`, e);
                        }
                    }
                }
            }
        }

        // 4. VERIFICACIÓN DE LIBRERÍAS Y NATIVOS (EXCLUSIVO PARA MAC)
        sender.send('progress', { percent: 90, message: "Verificando librerías y nativos..." });
        
        const activeJsonPath = path.join(instancePath, 'versions', versionToLaunch, `${versionToLaunch}.json`);
        let allLibraries = [...(versionJsonData.libraries || [])];

        if (fs.existsSync(activeJsonPath)) {
            const activeJsonData = await fs.readJson(activeJsonPath);
            if (activeJsonData.libraries) {
                allLibraries = allLibraries.concat(activeJsonData.libraries);
            }
        }

        for (const lib of allLibraries) {
            let libUrl = null;
            let libSubPath = null;

            if (lib.downloads) {
                // Filtro estricto para nativos de Mac (puede venir como 'natives-macos' o 'natives-osx')
                if (lib.downloads.classifiers && (lib.downloads.classifiers['nativnpmes-macos'] || lib.downloads.classifiers['natives-osx'])) {
                    const nativeData = lib.downloads.classifiers['natives-macos'] || lib.downloads.classifiers['natives-osx'];
                    libUrl = nativeData.url;
                    libSubPath = nativeData.path;
                } else if (lib.downloads.artifact) { // Librería común de Java
                    libUrl = lib.downloads.artifact.url;
                    libSubPath = lib.downloads.artifact.path;
                }
            } else if (lib.name) {
                const [group, artifact, version, classifier] = lib.name.split(':');
                const groupPath = group.replace(/\./g, '/');
                const classifierSuffix = classifier ? `-${classifier}` : '';
                libSubPath = `${groupPath}/${artifact}/${version}/${artifact}-${version}${classifierSuffix}.jar`;

                if (lib.url) {
                    libUrl = `${lib.url}${libSubPath}`;
                } else if (lib.name.includes('fabricmc')) {
                    libUrl = `https://maven.fabricmc.net/${libSubPath}`;
                } else {
                    libUrl = `https://libraries.minecraft.net/${libSubPath}`;
                }
            }

            if (libSubPath && libUrl) {
                const libPath = path.join(instancePath, 'libraries', libSubPath);
                if (!fs.existsSync(libPath)) {
                    await fs.ensureDir(path.dirname(libPath));
                    try {
                        const libRes = await fetch(libUrl);
                        if (libRes.ok) await fs.writeFile(libPath, Buffer.from(await libRes.arrayBuffer()));
                    } catch (e) {}
                }
            }
        }

        // 5. Opciones de lanzamiento
        const launchOptions = {
            gamePath: instancePath,
            javaPath: 'java', 
            version: versionToLaunch,
            gameProfile: {
                id: config.auth.uuid,
                name: config.auth.name
            },
            accessToken: config.auth.access_token || undefined,
            minMemory: 1024,
            maxMemory: parseInt(config.ram) * 1024,
        };

        // Si ya hay un proceso activo, bloqueamos la ejecución para evitar duplicados
        if (activeProcess) {
            return { success: false, error: "El juego ya se está ejecutando." };
        }

        activeProcess = await launch(launchOptions);
        
        activeProcess.stdout.on('data', (b) => console.log(b.toString()));
        activeProcess.stderr.on('data', (b) => console.log(b.toString()));
        
        // Listener para avisar al frontend cuando el juego se cierra
        activeProcess.on('close', (code) => {
            console.log(`El juego se cerró con el código ${code}`);
            activeProcess = null;
            if (sender) {
                sender.send('game-closed');
            }
        });
        
        return { success: true };
    } catch (error) {
        console.error("Error crítico al iniciar:", error);
        return { success: false, error: error.message };
    }
}

function stopGame() {
    if (activeProcess) {
        activeProcess.kill();
        activeProcess = null;
        return true;
    }
    return false;
}

function isGameRunning() {
    return activeProcess !== null;
}

module.exports = { launchGame, stopGame, isGameRunning };