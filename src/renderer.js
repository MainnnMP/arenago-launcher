let sesionActiva = null;
let skinSeleccionadaPath = localStorage.getItem('arenaGoSkinActiva') || null;
let skinSeleccionadaVariante = localStorage.getItem('arenaGoSkinVariante') || 'classic';
let skinTemporal = skinSeleccionadaPath; 
let skinGallery = [];
let catalogoModpacks = [];
let catalogoError = null;
let estadosInstalacion = {};
let modpackSeleccionado = null;

// Nuevo estado para saber si el juego está abierto
let isPlaying = false;

const btnMenuAjustes = document.getElementById('btnMenuAjustes');
const zonaModpacks = document.getElementById('zona-modpacks');
const zonaAjustes = document.getElementById('zona-ajustes');
const tituloVista = document.getElementById('titulo-vista');

btnMenuAjustes.addEventListener('click', () => {
    if (zonaAjustes.style.display === 'none') {
        zonaModpacks.style.display = 'none';
        zonaAjustes.style.display = 'block';
        tituloVista.innerText = "Configuraciones del Launcher";
        btnMenuAjustes.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Volver a Modpacks';
    } else {
        zonaModpacks.style.display = 'block';
        zonaAjustes.style.display = 'none';
        tituloVista.innerText = "Catálogo de Modpacks";
        btnMenuAjustes.innerHTML = '<i class="fa-solid fa-gear"></i> Ajustes';
    }
});

const ramSlider = document.getElementById('ramSlider');
const ramText = document.getElementById('ramText');
const ramGuardada = localStorage.getItem('arenaGoRam') || '6';
ramSlider.value = ramGuardada; ramText.innerText = ramGuardada + ' GB';
ramSlider.addEventListener('input', (e) => {
    const val = e.target.value; ramText.innerText = val + ' GB'; localStorage.setItem('arenaGoRam', val);
});

document.getElementById('btnAbrirCarpeta').addEventListener('click', () => window.api.openModpackFolder());
document.getElementById('btnDiscord').addEventListener('click', () => window.api.openLink('https://discord.gg/YdCZv9k4zB'));
document.getElementById('btnInsta').addEventListener('click', () => window.api.openLink('https://www.instagram.com/arenago.cl/'));
document.getElementById('varianteSkin').value = skinSeleccionadaVariante;

function obtenerCaraDeSkin(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false; 
            ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 100, 100);
            ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 100, 100);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null); 
        img.src = src;
    });
}

const sesionGuardada = JSON.parse(localStorage.getItem('arenaGoSession'));
if (sesionGuardada && sesionGuardada.auth && sesionGuardada.auth.name) {
    document.getElementById('tipoLogin').value = sesionGuardada.tipo;
    if (sesionGuardada.tipo === 'offline') {
        document.getElementById('apodo').value = sesionGuardada.username;
        document.getElementById('grupoApodo').style.display = 'block';
    }
    sesionActiva = sesionGuardada.auth;
    mostrarPerfil(sesionGuardada.tipo);
}

document.getElementById('tipoLogin').addEventListener('change', (e) => {
    document.getElementById('grupoApodo').style.display = e.target.value === 'offline' ? 'block' : 'none';
});

async function cargarCatálogo() {
    catalogoError = null;
    try {
        const res = await window.api.getCatalog();
        if (!res.ok) throw new Error(res.error);

        catalogoModpacks = res.modpacks;
        estadosInstalacion = {};

        const ids = catalogoModpacks.map(mp => mp.modpackId);
        const estados = await window.api.checkInstalled(ids);

        for (const id in estados) {
            const estado = estados[id] && typeof estados[id] === 'object'
                ? estados[id]
                : { installed: !!estados[id], version: null };
            estadosInstalacion[id] = estado;
            if (!estado.installed) localStorage.removeItem(`instalado_${id}`);
            else localStorage.setItem(`instalado_${id}`, 'true');
        }
    } catch (e) {
        console.error("Error al cargar el catálogo:", e);
        catalogoModpacks = [];
        catalogoError = e.message || "No se pudo cargar el catálogo.";
    }
    renderizarCatálogo();
}

function renderizarCatálogo() {
    const container = document.getElementById('modpacks-container');
    container.replaceChildren();

    if (catalogoModpacks.length === 0) {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '13px';
        p.style.textAlign = 'center';
        p.innerText = catalogoError || "No hay modpacks disponibles o falló la conexión.";
        container.appendChild(p);
        return;
    }

    const grid = document.createElement('div');
    grid.className = "modpack-grid";

    catalogoModpacks.forEach(mp => {
        const card = document.createElement('div');
        card.className = "modpack-card";
        
        // Comparamos usando el nuevo modpackId
        if (modpackSeleccionado && modpackSeleccionado.modpackId === mp.modpackId) {
            card.classList.add("active");
        }
        
        const estado = estadosInstalacion[mp.modpackId] || {};
        const estaInstalado = !!estado.installed;
        const hayUpdate = estaInstalado && estado.version !== mp.version;
        const statusBadge = hayUpdate
            ? '<span class="modpack-status status-update"><i class="fa-solid fa-rotate"></i> Actualización</span>'
            : estaInstalado
            ? '<span class="modpack-status status-installed"><i class="fa-solid fa-check"></i> Descargado</span>'
            : '<span class="modpack-status status-cloud"><i class="fa-solid fa-cloud"></i> En la nube</span>';

        let imagenHTML = mp.image ? `<img src="${mp.image}" alt="${mp.name}">` : '';

        card.innerHTML = `
            ${imagenHTML}
            <div class="modpack-info">
                <h4>${mp.name}</h4>
                <p>${mp.description}</p>
                ${statusBadge}
            </div>
        `;                
        
        if (estaInstalado) {
            const btnDelete = document.createElement("button");
            btnDelete.classList.add("btn-delete-modpack");
            btnDelete.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btnDelete.title = "Eliminar archivos del modpack";
            
            btnDelete.onclick = async (e) => {
                e.stopPropagation(); 
                if (confirm(`¿Estás seguro de que quieres borrar "${mp.name}"?`)) {
                    await window.api.cleanModpack(mp.modpackId);
                    localStorage.removeItem(`instalado_${mp.modpackId}`);
                    estadosInstalacion[mp.modpackId] = { installed: false, version: null };
                    renderizarCatálogo(); 
                    actualizarBotonJugar(); 
                }
            };
            card.appendChild(btnDelete);
        }

        card.onclick = () => {
            modpackSeleccionado = mp;
            renderizarCatálogo();
            actualizarBotonJugar();
        };
        grid.appendChild(card);
    });
    container.appendChild(grid);
}

function actualizarBotonJugar() {
    const btn = document.getElementById('btnJugar');
    
    // Si el juego se está ejecutando, forzamos que el botón sea de Cerrar
    if (isPlaying) {
        btn.innerText = "Cerrar";
        btn.disabled = false;
        btn.classList.add('btn-cerrar');
        return;
    } else {
        btn.classList.remove('btn-cerrar');
    }

    if (!modpackSeleccionado) {
        btn.innerText = "Selecciona un Modpack";
        btn.disabled = true;
        return;
    }
    
    btn.disabled = false;
    const estado = estadosInstalacion[modpackSeleccionado.modpackId] || {};
    if (estado.installed && estado.version !== modpackSeleccionado.version) {
        btn.innerText = "Actualizar y Jugar";
    } else {
        btn.innerText = estado.installed ? "Jugar" : "Instalar y Jugar";
    }
}

async function mostrarPerfil(tipo) {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-dashboard').style.display = 'flex';
    document.getElementById('user-section').style.display = 'flex';
    
    document.getElementById('display-name').innerText = sesionActiva.name;
    document.getElementById('display-type').innerText = tipo === 'microsoft' ? 'Cuenta Premium' : 'Cuenta Offline';
    
    cargarCatálogo();

    if (tipo === 'microsoft' && skinSeleccionadaPath) {
         const caraUrl = await obtenerCaraDeSkin("file://" + skinSeleccionadaPath);
         if(caraUrl) document.getElementById('skin-render').src = caraUrl;
         else document.getElementById('skin-render').src = `https://minotar.net/armor/bust/${sesionActiva.name}/100.png`;
    } else {
         document.getElementById('skin-render').src = `https://minotar.net/armor/bust/${sesionActiva.name}/100.png`;
    }

    if(tipo === 'microsoft') {
        document.getElementById('seccion-galeria').style.display = 'flex';
        skinGallery = await window.api.getSkins(); renderizarGaleria();
    } else {
        document.getElementById('seccion-galeria').style.display = 'none';
    }
}

document.getElementById('btnLogin').addEventListener('click', async () => {
    const tipo = document.getElementById('tipoLogin').value;
    const nombre = document.getElementById('apodo').value;
    const btn = document.getElementById('btnLogin');

    if (tipo === 'offline' && nombre.trim() === '') return alert("Ingresa un apodo válido.");
    btn.innerText = "Autenticando..."; btn.disabled = true;

    const res = await window.api.login({ tipo, username: nombre });
    if (res.success) {
        sesionActiva = res.auth;
        localStorage.setItem('arenaGoSession', JSON.stringify({ tipo, username: nombre, auth: sesionActiva }));
        mostrarPerfil(tipo);
    } else {
        alert(res.error); btn.innerText = "Iniciar Sesión"; btn.disabled = false;
    }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('arenaGoSession'); sesionActiva = null;
    document.getElementById('view-login').style.display = 'flex';
    document.getElementById('view-dashboard').style.display = 'none';
    document.getElementById('user-section').style.display = 'none';
    document.getElementById('seccion-galeria').style.display = 'none';
    const btn = document.getElementById('btnLogin'); btn.innerText = "Iniciar Sesión"; btn.disabled = false;
});

async function renderizarGaleria() {
    const grid = document.getElementById('skin-grid'); grid.replaceChildren(); 
    for (const skin of skinGallery) {
        const div = document.createElement("div"); div.classList.add("skin-item");
        const caraUrl = await obtenerCaraDeSkin("file://" + skin.path);
        if (!caraUrl) continue;
        if (skinTemporal === skin.path) div.classList.add("active");
        
        const img = document.createElement("img"); img.src = caraUrl; div.appendChild(img);
        const btnDelete = document.createElement("button"); btnDelete.classList.add("btn-delete-skin"); btnDelete.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btnDelete.onclick = async (e) => {
            e.stopPropagation(); 
            if (confirm("¿Estás seguro de que quieres eliminar esta skin?")) {
                if (skin.path === skinSeleccionadaPath || skin.path === skinTemporal) {
                    localStorage.removeItem('arenaGoSkinActiva');
                    skinSeleccionadaPath = null; skinTemporal = null;
                    document.getElementById('skin-render').src = `https://minotar.net/armor/bust/${sesionActiva.name}/100.png`;
                }
                skinGallery = await window.api.deleteSkin(skin.path); renderizarGaleria();
            }
        };
        div.appendChild(btnDelete);
        div.onclick = () => { skinTemporal = skin.path; renderizarGaleria(); };
        grid.append(div);
    }
}

document.getElementById('btnSubirSkin').addEventListener('click', async () => {
    const nuevaGaleria = await window.api.addSkin();
    if (nuevaGaleria) { 
        skinGallery = nuevaGaleria; skinTemporal = skinGallery[skinGallery.length - 1].path; renderizarGaleria();
    }
});

document.getElementById('btnGuardarSkin').addEventListener('click', async () => {
    if (skinTemporal) {
        skinSeleccionadaPath = skinTemporal; skinSeleccionadaVariante = document.getElementById('varianteSkin').value;
        localStorage.setItem('arenaGoSkinActiva', skinSeleccionadaPath); localStorage.setItem('arenaGoSkinVariante', skinSeleccionadaVariante);
        const caraUrl = await obtenerCaraDeSkin("file://" + skinSeleccionadaPath);
        if(caraUrl) document.getElementById('skin-render').src = caraUrl;
        alert("¡Skin guardada con éxito!");
    } else { alert("Selecciona una skin de la galería primero."); }
});

// ESCUCHADOR PARA CUANDO EL JUEGO SE CIERRA (Desde adentro de Minecraft o si falla)
window.api.onGameClosed(() => {
    isPlaying = false;
    actualizarBotonJugar();
});

document.getElementById('btnJugar').addEventListener('click', async () => {
    if(!modpackSeleccionado) return;

    // Si ya estamos jugando, el botón actúa como "Cerrar"
    if (isPlaying) {
        await window.api.stopGame();
        return; // El evento onGameClosed de arriba se encargará de reiniciar el botón
    }

    const btn = document.getElementById('btnJugar');
    btn.style.display = 'none';
    document.getElementById('panel-progreso').style.display = 'flex';
    
    // Enviamos el objeto exactamente como lo espera el backend ahora
    const res = await window.api.play({ 
        auth: sesionActiva, 
        skinPath: skinSeleccionadaPath, 
        variant: skinSeleccionadaVariante,
        tipo: document.getElementById('tipoLogin').value,
        ram: ramSlider.value,
        modpackId: modpackSeleccionado.modpackId,
        mrpackUrl: modpackSeleccionado.mrpackUrl,
        mcVersion: modpackSeleccionado.mcVersion,
        modpackVersion: modpackSeleccionado.version
    });

    document.getElementById('panel-progreso').style.display = 'none';
    btn.style.display = 'block';

    if(res.success) {
        // Marcamos como instalado y ponemos modo "Jugando"
        localStorage.setItem(`instalado_${modpackSeleccionado.modpackId}`, 'true');
        estadosInstalacion[modpackSeleccionado.modpackId] = {
            installed: true,
            version: modpackSeleccionado.version
        };
        isPlaying = true;
        renderizarCatálogo(); 
        actualizarBotonJugar();
    } else {
        alert("Error al iniciar el juego: " + res.error);
        actualizarBotonJugar();
    }
});

window.api.onProgress((data) => {
    document.getElementById('estado').innerText = data.message;
    document.getElementById('barra').style.width = data.percent + '%';
});

// ===== ACTUALIZACIONES DEL LAUNCHER =====
const updateCard = document.getElementById('update-card');
const updateTitulo = document.getElementById('update-titulo');
const updateDetalle = document.getElementById('update-detalle');
const updateProgress = document.getElementById('update-progress');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateHint = document.getElementById('update-hint');
const btnActualizar = document.getElementById('btnActualizar');
const btnBuscarUpdates = document.getElementById('btnBuscarUpdates');
const versionActual = document.getElementById('version-actual');

let estadoUpdate = null;

// Los números de versión vienen del servidor de actualizaciones, así que se
// escriben siempre con innerText y nunca se interpolan en HTML.
function pintarUpdate(s) {
    estadoUpdate = s;
    versionActual.innerText = 'v' + s.versionActual;

    // Tras un fallo el aviso sigue visible para que se pueda reintentar.
    const hayAviso = s.status === 'available' || s.status === 'downloading'
        || s.status === 'ready' || (s.status === 'error' && s.versionNueva);
    updateCard.style.display = hayAviso ? 'block' : 'none';
    updateProgress.style.display = s.status === 'downloading' ? 'block' : 'none';
    updateProgressFill.style.width = s.percent + '%';

    if (s.status === 'available') {
        updateTitulo.innerText = 'Versión ' + s.versionNueva;
        updateDetalle.innerText = 'Hay una versión más reciente del launcher.';
        btnActualizar.disabled = false;
        btnActualizar.innerHTML = '<i class="fa-solid fa-download"></i> Actualizar';
    } else if (s.status === 'downloading') {
        updateTitulo.innerText = 'Descargando';
        updateDetalle.innerText = 'Descargando la versión ' + s.versionNueva + '.';
        btnActualizar.disabled = true;
        btnActualizar.innerHTML = '<i class="fa-solid fa-download"></i> ' + s.percent + '%';
    } else if (s.status === 'ready') {
        updateTitulo.innerText = 'Listo para instalar';
        updateDetalle.innerText = 'La versión ' + s.versionNueva + ' se instalará al reiniciar.';
        btnActualizar.disabled = false;
        btnActualizar.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Reiniciar e Instalar';
    } else if (s.status === 'error') {
        updateTitulo.innerText = 'Actualización incompleta';
        updateDetalle.innerText = s.error;
        btnActualizar.disabled = false;
        btnActualizar.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Reintentar';
    }

    const avisos = {
        checking: 'Buscando actualizaciones...',
        none: 'El launcher está actualizado.',
        available: 'Versión ' + s.versionNueva + ' disponible.',
        downloading: 'Descargando la actualización: ' + s.percent + '%',
        ready: 'Actualización descargada. Reinicia el launcher para instalarla.',
        unsupported: 'En macOS la actualización automática no está disponible. Descarga la nueva versión desde la web.',
        error: s.error || 'No se pudo comprobar si hay actualizaciones.'
    };
    updateHint.innerText = avisos[s.status] || 'El launcher busca actualizaciones automáticamente al abrirse.';
    btnBuscarUpdates.disabled = s.status === 'checking' || s.status === 'downloading';
}

btnActualizar.addEventListener('click', async () => {
    if (!estadoUpdate) return;

    if (estadoUpdate.status === 'available') {
        btnActualizar.disabled = true;
        await window.api.downloadUpdate();
        return;
    }

    if (estadoUpdate.status === 'ready') {
        const res = await window.api.installUpdate();
        if (!res.ok && res.motivo === 'juego-abierto') {
            alert("Cierra Minecraft antes de instalar la actualización.");
        }
        return;
    }

    if (estadoUpdate.status === 'error') {
        btnActualizar.disabled = true;
        await window.api.checkUpdates();
    }
});

btnBuscarUpdates.addEventListener('click', async () => {
    const res = await window.api.checkUpdates();
    if (!res.ok && res.motivo === 'dev') {
        updateHint.innerText = 'Estás ejecutando el launcher sin empaquetar, no hay nada que actualizar.';
    }
});

window.api.onUpdateStatus(pintarUpdate);
window.api.getUpdateState().then(pintarUpdate);