console.log('📚 solicitud-material.js cargado - Versión independiente con localStorage');

// ============================================
// Funciones auxiliares basadas en authSystem
// ============================================
function waitForAuthSystem() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 50;
        let attempts = 0;
        const check = () => {
            if (typeof authSystem !== 'undefined' && authSystem) {
                resolve(authSystem);
            } else if (attempts++ < maxAttempts) {
                setTimeout(check, 100);
            } else {
                reject(new Error('authSystem no disponible'));
            }
        };
        check();
    });
}

function getCurrentUserSafe() {
    return authSystem?.getCurrentUser ? authSystem.getCurrentUser() : null;
}

function isLoggedInSafe() {
    return authSystem?.isLoggedIn ? authSystem.isLoggedIn() : false;
}

async function makeRequestSafe(endpoint, data = null, method = 'POST') {
    if (!authSystem || !authSystem.makeRequest) {
        throw new Error('authSystem no listo');
    }
    const fullEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    return await authSystem.makeRequest(fullEndpoint, data, method);
}

function logoutSafe() {
    if (authSystem && authSystem.logout) {
        authSystem.logout();
    }
    window.location.href = '/index.html';
}

// ============================================
// Clase MaterialHistorico
// ============================================
class MaterialHistorico {
    constructor() {
        this.solicitudes = [];
        this.clasesHistoricas = [];
        this.clasesFiltradas = [];
        this.anosDisponibles = [];
        this.mesesDisponibles = [];
        this.anoSeleccionado = null;
        this.mesSeleccionado = null;
        this.apiBaseUrl = window.location.origin + '/api';
        this.nombresMeses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando sistema de material histórico con filtro por año y mes...');
        
        try {
            await waitForAuthSystem();
            console.log('✅ authSystem listo para usar');
        } catch (error) {
            console.error('❌ Error esperando por authSystem:', error);
            this.mostrarMensaje('Error al cargar el sistema de autenticación', 'error');
            return;
        }
        
        if (!isLoggedInSafe()) {
            console.log('🔐 Usuario no logueado, mostrando modal de login...');
            try {
                await authSystem.showLoginModal();
                console.log('✅ Usuario autenticado:', getCurrentUserSafe());
            } catch (error) {
                console.log('❌ Usuario canceló el login');
                this.mostrarMensaje('Debe iniciar sesión para poder solicitar el material', 'error');
                this.deshabilitarControles();
                return;
            }
        }

        this.configurarUI();
        await this.cargarClasesHistoricas();
        await this.cargarMisSolicitudes();
    }

    deshabilitarControles() {
        const selects = document.querySelectorAll('select');
        const buttons = document.querySelectorAll('button');
        
        selects.forEach(select => select.disabled = true);
        buttons.forEach(button => {
            if (button.id !== 'logoutBtn') {
                button.disabled = true;
            }
        });
        
        const container = document.querySelector('.container');
        if (container) {
            const loginMessage = document.createElement('div');
            loginMessage.className = 'login-required-message';
            loginMessage.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 3em; margin-bottom: 20px;">🔐</div>
                    <h3 style="color: var(--primary-color); margin-bottom: 15px;">Inicio de Sesión Requerido</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        Para acceder al material, por favor inicie sesión.
                    </p>
                    <button onclick="authSystem.showLoginModal()" class="back-btn" style="background: var(--primary-color);">
                        Iniciar Sesión
                    </button>
                </div>
            `;
            container.prepend(loginMessage);
        }
    }

    configurarUI() {
        const usuario = getCurrentUserSafe();
        console.log('👤 Usuario actual:', usuario);
        
        const emailInput = document.getElementById('emailUsuario');
        if (emailInput && usuario && usuario.email) {
            emailInput.value = usuario.email;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                logoutSafe();
            });
        } else {
            console.log('⚠️ Botón de logout no encontrado en el DOM');
        }

        const form = document.getElementById('materialHistoricoForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.procesarSolicitud();
            });
        } else {
            console.error('❌ Formulario de solicitud de material no encontrado');
        }

        const solicitarOtraBtn = document.getElementById('solicitarOtraClase');
        if (solicitarOtraBtn) {
            solicitarOtraBtn.addEventListener('click', () => {
                this.ocultarMaterial();
            });
        }
    }

    async cargarClasesHistoricas() {
        try {
            console.log('📥 Cargando clases desde MongoDB.');
            
            const user = getCurrentUserSafe();
            if (!user) {
                throw new Error('Usuario no disponible');
            }

            const response = await fetch(`${this.apiBaseUrl}/clases-historicas`, {
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': user._id
                }
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.clasesHistoricas = result.data.filter(clase => 
                    clase.estado === 'publicada' || 
                    (clase.activa === true && !clase.estado)
                );
                
                console.log(`✅ ${this.clasesHistoricas.length} clases publicadas cargadas`);
                
                this.procesarAnosDisponibles();
                this.llenarSelectorAnos();
            } else {
                throw new Error('Se recibió una respuesta inválida del servidor');
            }
            
        } catch (error) {
            console.error('❌ Error cargando clases:', error);
            this.mostrarMensaje('Error al cargar clases. Verifique su conexión.', 'error');
        }
    }

    procesarAnosDisponibles() {
        const anos = new Set();
        this.clasesHistoricas.forEach(clase => {
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                const ano = fecha.getFullYear();
                if (!isNaN(ano)) anos.add(ano);
            }
        });
        this.anosDisponibles = Array.from(anos).sort((a, b) => b - a);
        console.log(`📅 Años disponibles: ${this.anosDisponibles.join(', ')}`);
    }

    llenarSelectorAnos() {
        const selectAno = document.getElementById('anoSeleccionado');
        if (!selectAno) return;
        
        if (this.anosDisponibles.length === 0) {
            selectAno.innerHTML = '<option value="">No hay años disponibles</option>';
            return;
        }
        
        selectAno.innerHTML = '<option value="">Seleccione un año</option>';
        selectAno.innerHTML += '<option value="todos">Todos los años</option>';
        
        this.anosDisponibles.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            selectAno.appendChild(option);
        });
        
        selectAno.addEventListener('change', (e) => {
            this.anoSeleccionado = e.target.value;
            this.procesarMesesDisponibles();
        });
        
        console.log('✅ Selector de años cargado');
    }

    procesarMesesDisponibles() {
        if (!this.anoSeleccionado || this.anoSeleccionado === 'todos') {
            this.mesesDisponibles = [];
            this.llenarSelectorMeses();
            return;
        }
        
        const meses = new Set();
        this.clasesHistoricas.forEach(clase => {
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                if (fecha.getFullYear() === parseInt(this.anoSeleccionado)) {
                    meses.add(fecha.getMonth());
                }
            }
        });
        this.mesesDisponibles = Array.from(meses).sort((a, b) => a - b);
        this.llenarSelectorMeses();
    }

    llenarSelectorMeses() {
        const selectMes = document.getElementById('mesSeleccionado');
        if (!selectMes) return;
        
        selectMes.innerHTML = '';
        selectMes.disabled = false;
        
        if (!this.anoSeleccionado) {
            selectMes.innerHTML = '<option value="">Primero seleccione año</option>';
            selectMes.disabled = true;
            return;
        }
        
        if (this.anoSeleccionado === 'todos') {
            selectMes.innerHTML = '<option value="">Seleccione un mes</option>';
            selectMes.innerHTML += '<option value="todos">Todos los meses</option>';
            
            const todosMeses = new Set();
            this.clasesHistoricas.forEach(clase => {
                if (clase.fechaClase) {
                    todosMeses.add(new Date(clase.fechaClase).getMonth());
                }
            });
            Array.from(todosMeses).sort((a, b) => a - b).forEach(mesNum => {
                const option = document.createElement('option');
                option.value = mesNum;
                option.textContent = this.nombresMeses[mesNum];
                selectMes.appendChild(option);
            });
        } else if (this.mesesDisponibles.length === 0) {
            selectMes.innerHTML = '<option value="">No hay meses con clases</option>';
            this.filtrarClasesPorMes();
            return;
        } else {
            selectMes.innerHTML = '<option value="">Seleccione un mes</option>';
            selectMes.innerHTML += '<option value="todos">Todos los meses</option>';
            this.mesesDisponibles.forEach(mesNum => {
                const option = document.createElement('option');
                option.value = mesNum;
                option.textContent = this.nombresMeses[mesNum];
                selectMes.appendChild(option);
            });
        }
        
        selectMes.addEventListener('change', (e) => {
            this.mesSeleccionado = e.target.value;
            this.filtrarClasesPorMes();
        });
    }

    filtrarClasesPorMes() {
        const selectClase = document.getElementById('claseSeleccionada');
        const form = document.getElementById('materialHistoricoForm');
        const sinClasesMensaje = document.getElementById('sinClasesMensaje');
        const buscadorContainer = document.getElementById('buscadorClasesContainer');
        
        if (!this.anoSeleccionado || !this.mesSeleccionado) {
            if (form) form.style.display = 'none';
            if (sinClasesMensaje) sinClasesMensaje.style.display = 'none';
            if (buscadorContainer) buscadorContainer.style.display = 'none';
            return;
        }
        
        this.clasesFiltradas = this.clasesHistoricas.filter(clase => {
            if (!clase.fechaClase) return false;
            const fecha = new Date(clase.fechaClase);
            const pasaAno = this.anoSeleccionado === 'todos' || fecha.getFullYear() === parseInt(this.anoSeleccionado);
            const pasaMes = this.mesSeleccionado === 'todos' || fecha.getMonth() === parseInt(this.mesSeleccionado);
            return pasaAno && pasaMes;
        });
        
        console.log(`🔍 ${this.clasesFiltradas.length} clases encontradas`);
        
        if (this.clasesFiltradas.length === 0) {
            if (form) form.style.display = 'none';
            if (buscadorContainer) buscadorContainer.style.display = 'none';
            if (sinClasesMensaje) sinClasesMensaje.style.display = 'block';
            return;
        }
        
        if (sinClasesMensaje) sinClasesMensaje.style.display = 'none';
        if (form) form.style.display = 'block';
        if (buscadorContainer) buscadorContainer.style.display = 'block';
        
        this.llenarSelectClases();
        this.configurarBuscadorClases();
    }

    configurarBuscadorClases() {
        const buscador = document.getElementById('buscadorClases');
        if (!buscador) return;
        const nuevo = buscador.cloneNode(true);
        buscador.parentNode.replaceChild(nuevo, buscador);
        nuevo.addEventListener('input', (e) => this.filtrarListaClases(e.target.value));
    }

    filtrarListaClases(texto) {
        const select = document.getElementById('claseSeleccionada');
        if (!select) return;
        const term = texto.toLowerCase();
        select.querySelectorAll('option').forEach(opt => {
            if (opt.value === '') return;
            opt.style.display = opt.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    }

    llenarSelectClases() {
        const select = document.getElementById('claseSeleccionada');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleccione una clase</option>';
        
        this.clasesFiltradas.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        this.clasesFiltradas.forEach(clase => {
            const option = document.createElement('option');
            option.value = clase._id;
            
            let fechaTexto = '';
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                fechaTexto = fecha.toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            }
            
            option.textContent = `${clase.nombre} (${fechaTexto})`;
            option.dataset.nombre = clase.nombre;
            option.dataset.descripcion = clase.descripcion || '';
            option.dataset.fecha = clase.fechaClase;
            option.dataset.youtube = clase.enlaces?.youtube || '';
            option.dataset.powerpoint = clase.enlaces?.powerpoint || '';
            option.dataset.instructores = clase.instructores?.join(', ') || '';
            
            select.appendChild(option);
        });
        
        const buscador = document.getElementById('buscadorClases');
        if (buscador) {
            buscador.value = '';
            this.filtrarListaClases('');
        }
    }

    async procesarSolicitud() {
        const claseId = document.getElementById('claseSeleccionada').value;
        if (!claseId) {
            this.mostrarMensaje('Por favor, seleccione una clase', 'error');
            return;
        }

        const selectOption = document.querySelector(`#claseSeleccionada option[value="${claseId}"]`);
        if (!selectOption) {
            this.mostrarMensaje('Error: Clase no encontrada', 'error');
            return;
        }

        const claseData = {
            id: claseId,
            nombre: selectOption.dataset.nombre,
            descripcion: selectOption.dataset.descripcion,
            fecha: selectOption.dataset.fecha,
            youtube: selectOption.dataset.youtube,
            powerpoint: selectOption.dataset.powerpoint,
            instructores: selectOption.dataset.instructores
        };

        // Guardar y mostrar (independientemente del servidor)
        await this.guardarSolicitudLocal(claseData);
        this.mostrarMaterial(claseData);
    }

    async guardarSolicitudLocal(claseData) {
        const user = getCurrentUserSafe();
        if (!user) return;

        const solicitud = {
            claseId: claseData.id,
            claseNombre: claseData.nombre,
            email: user.email,
            youtube: claseData.youtube,
            powerpoint: claseData.powerpoint,
            fechaClase: claseData.fecha,
            fechaSolicitud: new Date().toISOString()
        };

        // Guardar en localStorage
        try {
            const storageKey = `solicitudMaterial_${user._id}`;
            let solicitudes = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const existe = solicitudes.some(s => s.claseId === claseData.id);
            if (!existe) {
                solicitudes.push(solicitud);
                localStorage.setItem(storageKey, JSON.stringify(solicitudes));
                console.log('💾 Solicitud guardada en localStorage');
            }
        } catch (e) {
            console.error('Error guardando en localStorage:', e);
        }

        // Intentar enviar al servidor en segundo plano (no bloquea)
        this.enviarSolicitudServidor(solicitud).catch(err => {
            console.warn('No se pudo sincronizar con el servidor:', err);
        });
    }

    async enviarSolicitudServidor(solicitud) {
        try {
            const user = getCurrentUserSafe();
            if (!user) return;

            const url = `${window.location.origin}/api/material-historico/solicitudes`;
            console.log('📤 Enviando solicitud a:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': user._id
                },
                body: JSON.stringify(solicitud)
            });

            console.log('📥 Respuesta status:', response.status);

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON. Primeros 200 caracteres:', text.substring(0, 200));
                throw new Error('El servidor no respondió con JSON');
            }

            const result = await response.json();
            console.log('📦 Respuesta JSON:', result);

            if (response.ok && result.success) {
                console.log('✅ Solicitud sincronizada con el servidor');
            } else {
                throw new Error(result.message || `Error ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Error al sincronizar con el servidor:', error);
        }
    }

    mostrarMaterial(claseData) {
        const materialLinks = document.getElementById('materialLinks');
        const claseNombre = document.getElementById('claseNombre');
        const claseDescripcion = document.getElementById('claseDescripcion');
        const claseFecha = document.getElementById('claseFecha');
        const linksContainer = document.getElementById('linksContainer');
        
        if (!materialLinks || !claseNombre || !linksContainer) return;
        
        let fechaFormateada = '';
        if (claseData.fecha) {
            const fecha = new Date(claseData.fecha);
            fechaFormateada = fecha.toLocaleDateString('es-AR', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            fechaFormateada = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
        }
        
        let periodoTexto = '';
        if (this.anoSeleccionado === 'todos' && this.mesSeleccionado === 'todos') {
            periodoTexto = 'Todos los períodos';
        } else if (this.anoSeleccionado === 'todos') {
            periodoTexto = `Todos los años - ${this.nombresMeses[this.mesSeleccionado]}`;
        } else if (this.mesSeleccionado === 'todos') {
            periodoTexto = `${this.anoSeleccionado} - Todos los meses`;
        } else {
            periodoTexto = `${this.nombresMeses[this.mesSeleccionado]} ${this.anoSeleccionado}`;
        }
        
        claseNombre.innerHTML = `${claseData.nombre} <span class="periodo-badge">${periodoTexto}</span>`;
        if (claseDescripcion) claseDescripcion.textContent = claseData.descripcion || 'Material de la clase grabada';
        if (claseFecha) claseFecha.textContent = `📅 ${fechaFormateada}`;
        
        // Instructores
        const instructoresExistente = document.getElementById('instructoresInfo');
        if (instructoresExistente) instructoresExistente.remove();
        if (claseData.instructores) {
            const instructoresElem = document.createElement('p');
            instructoresElem.id = 'instructoresInfo';
            instructoresElem.innerHTML = `👥 Instructores: ${claseData.instructores}`;
            instructoresElem.style.marginTop = '10px';
            instructoresElem.style.color = 'var(--text-secondary)';
            document.getElementById('claseInfo')?.appendChild(instructoresElem);
        }
        
        linksContainer.innerHTML = '';
        if (claseData.youtube) {
            linksContainer.innerHTML += `
                <div class="link-card youtube" onclick="window.open('${claseData.youtube}', '_blank')">
                    <a href="${claseData.youtube}" target="_blank">
                        <div class="icon">▶️</div>
                        <div class="title">YouTube</div>
                        <div class="subtitle">Ver grabación de la clase</div>
                    </a>
                </div>
            `;
        }
        if (claseData.powerpoint) {
            linksContainer.innerHTML += `
                <div class="link-card powerpoint" onclick="window.open('${claseData.powerpoint}', '_blank')">
                    <a href="${claseData.powerpoint}" target="_blank">
                        <div class="icon">📊</div>
                        <div class="title">PowerPoint</div>
                        <div class="subtitle">Descargar presentación</div>
                    </a>
                </div>
            `;
        }
        
        // Ocultar filtros y formulario, mostrar enlaces
        const filtrosContainer = document.querySelector('.filtros-container');
        if (filtrosContainer) filtrosContainer.style.display = 'none';
        
        const form = document.getElementById('materialHistoricoForm');
        if (form) form.style.display = 'none';
        
        const sinClasesMensaje = document.getElementById('sinClasesMensaje');
        if (sinClasesMensaje) sinClasesMensaje.style.display = 'none';
        
        const buscadorContainer = document.getElementById('buscadorClasesContainer');
        if (buscadorContainer) buscadorContainer.style.display = 'none';
        
        materialLinks.classList.add('visible');
        this.mostrarMensaje('✅ Material disponible', 'success');
    }

    ocultarMaterial() {
        const filtrosContainer = document.querySelector('.filtros-container');
        if (filtrosContainer) filtrosContainer.style.display = 'block';
        
        const form = document.getElementById('materialHistoricoForm');
        if (form) form.style.display = 'none';
        
        const materialLinks = document.getElementById('materialLinks');
        if (materialLinks) materialLinks.classList.remove('visible');
        
        const claseSelect = document.getElementById('claseSeleccionada');
        if (claseSelect) claseSelect.value = '';
        
        const buscadorContainer = document.getElementById('buscadorClasesContainer');
        if (buscadorContainer) buscadorContainer.style.display = 'none';
        
        const buscador = document.getElementById('buscadorClases');
        if (buscador) buscador.value = '';
        
        const selectAno = document.getElementById('anoSeleccionado');
        const selectMes = document.getElementById('mesSeleccionado');
        if (selectAno) selectAno.value = '';
        if (selectMes) {
            selectMes.innerHTML = '<option value="">Primero seleccione año</option>';
            selectMes.disabled = true;
        }
        this.anoSeleccionado = null;
        this.mesSeleccionado = null;
    }

    async cargarMisSolicitudes() {
        try {
            const user = getCurrentUserSafe();
            if (!user) return;

            // Cargar desde localStorage
            const storageKey = `solicitudMaterial_${user._id}`;
            const stored = localStorage.getItem(storageKey);
            const solicitudesLocal = stored ? JSON.parse(stored) : [];

            // Intentar cargar desde servidor
            let solicitudesServidor = [];
            try {
                const response = await fetch(`${this.apiBaseUrl}/material-historico/solicitudes`, {
                    headers: { 
                        'Content-Type': 'application/json',
                        'user-id': user._id 
                    }
                });
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.data) {
                        solicitudesServidor = result.data;
                    }
                }
            } catch (e) {
                console.warn('No se pudo conectar al servidor, usando solo datos locales');
            }

            // Combinar (evitar duplicados por claseId)
            const combinadas = [...solicitudesServidor];
            solicitudesLocal.forEach(local => {
                if (!combinadas.some(s => s.claseId === local.claseId)) {
                    combinadas.push(local);
                }
            });

            this.solicitudes = combinadas.sort((a, b) => 
                new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud)
            );

            this.mostrarMisSolicitudes();

        } catch (error) {
            console.error('❌ Error cargando solicitudes:', error);
            const user = getCurrentUserSafe();
            if (user) {
                const storageKey = `solicitudMaterial_${user._id}`;
                const stored = localStorage.getItem(storageKey);
                this.solicitudes = stored ? JSON.parse(stored) : [];
                this.mostrarMisSolicitudes();
            }
        }
    }

    mostrarMisSolicitudes() {
        const tbody = document.querySelector('#tablaMisSolicitudes tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (this.solicitudes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666; padding: 20px;">Todavía no has solicitado material de clases grabadas.</td></tr>';
            return;
        }

        this.solicitudes.forEach(solicitud => {
            const row = document.createElement('tr');
            
            const fechaClase = solicitud.fechaClase ? 
                new Date(solicitud.fechaClase).toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                }) : 'Fecha no disponible';
            
            const fechaSolicitud = solicitud.fechaSolicitud ? 
                new Date(solicitud.fechaSolicitud).toLocaleString('es-AR') : 'Fecha no disponible';
            
            const materialHTML = this.generarMaterialHTML(solicitud);
            
            row.innerHTML = `
                <td>${solicitud.claseNombre || solicitud.clase || 'N/A'}</td>
                <td>${fechaClase}</td>
                <td>${fechaSolicitud}</td>
                <td class="material-badge">${materialHTML}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    generarMaterialHTML(solicitud) {
        const enlaces = [];
        if (solicitud.youtube) {
            enlaces.push(`<a href="${solicitud.youtube}" target="_blank" title="Ver en YouTube">▶️ YouTube</a>`);
        }
        if (solicitud.powerpoint) {
            enlaces.push(`<a href="${solicitud.powerpoint}" target="_blank" title="Ver presentación">📊 Presentacion</a>`);
        }
        if (enlaces.length === 0) {
            return '<span style="color: #666;">Material disponible</span>';
        }
        return enlaces.join(' | ');
    }

    mostrarMensaje(mensaje, tipo) {
        const msgDiv = document.getElementById('statusMessage');
        if (!msgDiv) {
            console.log('📢', mensaje, tipo);
            return;
        }
        msgDiv.textContent = mensaje;
        msgDiv.className = `status-message ${tipo}`;
        msgDiv.style.display = 'block';
        setTimeout(() => msgDiv.style.display = 'none', 5000);
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, inicializando...');
    window.materialHistorico = new MaterialHistorico();
});