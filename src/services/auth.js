// src/services/auth.js
const msmc = require('msmc');
const crypto = require('crypto');
const { session } = require('electron');

async function loginMicrosoft() {
    try {
        // Limpiamos la caché para evitar que ventanas corruptas cierren el proceso
        if (session && session.defaultSession) {
            await session.defaultSession.clearStorageData();
        }

        console.log("Iniciando ventana de Microsoft...");

        // En msmc v3 usamos fastLaunch directamente en lugar de instanciar Auth
        const result = await msmc.fastLaunch("electron", (update) => {
            console.log("Estado msmc:", update);
        });

        console.log("=== RESPUESTA DE MICROSOFT ===");
        console.log(JSON.stringify(result, null, 2));
        console.log("==============================");

        // msmc v3 tiene su propio comprobador de errores
        if (msmc.errorCheck(result)) {
            return { success: false, error: `Microsoft rechazó el acceso: ${result.reason}` };
        }

        // Si pasamos el errorCheck, extraemos los datos
        if (result && result.profile && result.profile.id) {
            return { 
                success: true, 
                auth: { 
                    name: result.profile.name, 
                    uuid: result.profile.id, 
                    access_token: result.access_token 
                } 
            };
        } else {
            return { success: false, error: "Microsoft no devolvió un perfil de Minecraft válido." };
        }
    } catch (error) {
        console.error("Error crítico en login:", error);
        return { success: false, error: `Excepción en la autenticación: ${error.message || error}` };
    }
}

async function loginOffline(username) {
    // Genera un ID único falso para que el servidor offline te reconozca
    const offlineId = crypto.randomUUID().replace(/-/g, '');
    
    return { 
        success: true, 
        auth: { 
            name: username, 
            uuid: offlineId, 
            access_token: "" 
        } 
    };
}

module.exports = { loginMicrosoft, loginOffline };