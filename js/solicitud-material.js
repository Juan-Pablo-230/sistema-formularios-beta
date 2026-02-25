console.log('📚 material-historico.js cargado - Usando authSystem de formularios.js');

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
            // Usar la función waitForAuthSystem de formularios.js
            await waitForAuthSystem();
            console.log('✅ authSystem listo para usar');
            
        } catch (error) {
            console.error('❌ Error esperando por authSystem:', error);
            this.mostrarMensaje('Error al cargar el sistema de autenticación', 'error');
            return;
        }
        
        // Verificar autenticación usando isLoggedInSafe() de formularios.js
        if (!isLoggedInSafe()) {
            console.log('🔐 Usuario no logueado, mostrando modal de login...');
            try {
                await authSystem.showLoginModal();
                console.log('✅ Usuario autenticado:', getCurrentUserSafe());
            } catch (error) {
                console.log('❌ Usuario canceló el login');
                // Solo mostrar mensaje, NO redirigir
                this.mostrarMensaje('Debe iniciar sesión para poder solicitar el material', 'error');
                // Deshabilitar los controles
                this.deshabilitarControles();
                return;
            }
        }

        this.configurarUI();
        await this.cargarClasesHistoricas();
        await this.cargarMisSolicitudes();
    }

    deshabilitarControles() {
        // Deshabilitar selects y botones si el usuario no está logueado
        const selects = document.querySelectorAll('select');
        const buttons = document.querySelectorAll('button');
        
        selects.forEach(select => select.disabled = true);
        buttons.forEach(button => {
            if (button.id !== 'logoutBtn') {
                button.disabled = true;
            }
        });
        
        // Mostrar mensaje en el área principal
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
        
        // Autocompletar email si existe el campo
        const emailInput = document.getElementById('emailUsuario');
        if (emailInput && usuario && usuario.email) {
            emailInput.value = usuario.email;
        }

        // Configurar botón de logout SOLO si existe
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                logoutSafe(); // Usar logoutSafe de formularios.js
            });
        } else {
            console.log('⚠️ Botón de logout no encontrado en el DOM');
        }

        // Configurar formulario principal SOLO si existe
        const form = document.getElementById('materialHistoricoForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.procesarSolicitud();
            });
        } else {
            console.error('❌ Formulario de solicitud de material no encontrado');
        }

        // Configurar botón de solicitar otra clase SOLO si existe
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
                // 🔥 CORRECCIÓN: Filtrar solo las clases con estado 'publicada'
                this.clasesHistoricas = result.data.filter(clase => 
                    clase.estado === 'publicada' || 
                    (clase.activa === true && !clase.estado) // Compatibilidad con datos antiguos
                );
                
                console.log(`✅ ${this.clasesHistoricas.length} clases publicadas cargadas`);
                
                // Mostrar las clases cargadas para debug
                this.clasesHistoricas.forEach(clase => {
                    console.log(`📚 Clase: ${clase.nombre} - Estado: ${clase.estado || (clase.activa ? 'activa (legacy)' : 'inactiva')}`);
                });
                
                this.procesarAnosDisponibles();
                this.llenarSelectorAnos();
            } else {
                throw new Error('Se recibió una respuesta inválida del servidor');
            }
            
        } catch (error) {
            console.error('❌ Error cargando clases:', error);
        }
    }

    procesarAnosDisponibles() {
        // Extraer años únicos de las fechas de las clases
        const anos = new Set();
        
        this.clasesHistoricas.forEach(clase => {
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                const ano = fecha.getFullYear();
                if (!isNaN(ano)) {
                    anos.add(ano);
                }
            }
        });
        
        // Convertir a array y ordenar descendente (más reciente primero)
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
        
        // Agregar opción "Todos" al inicio
        selectAno.innerHTML = '<option value="">Seleccione un año</option>';
        selectAno.innerHTML += '<option value="todos">Todos los años</option>';
        
        this.anosDisponibles.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            selectAno.appendChild(option);
        });
        
        // Agregar evento de cambio
        selectAno.addEventListener('change', (e) => {
            this.anoSeleccionado = e.target.value;
            this.procesarMesesDisponibles();
        });
        
        console.log('✅ Selector de años cargado con opción "Todos"');
    }

    procesarMesesDisponibles() {
        if (!this.anoSeleccionado || this.anoSeleccionado === 'todos') {
            this.mesesDisponibles = [];
            this.llenarSelectorMeses();
            return;
        }
        
        // Extraer meses únicos para el año seleccionado
        const meses = new Set();
        
        this.clasesHistoricas.forEach(clase => {
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                if (fecha.getFullYear() === parseInt(this.anoSeleccionado)) {
                    const mes = fecha.getMonth(); // 0-11
                    meses.add(mes);
                }
            }
        });
        
        // Convertir a array y ordenar (1-12)
        this.mesesDisponibles = Array.from(meses).sort((a, b) => a - b);
        
        console.log(`Meses disponibles para ${this.anoSeleccionado}: ${this.mesesDisponibles.map(m => this.nombresMeses[m]).join(', ')}`);
        
        this.llenarSelectorMeses();
    }

    llenarSelectorMeses() {
        const selectMes = document.getElementById('mesSeleccionado');
        if (!selectMes) return;
        
        // Limpiar y habilitar/deshabilitar
        selectMes.innerHTML = '';
        selectMes.disabled = false;
        
        if (!this.anoSeleccionado) {
            selectMes.innerHTML = '<option value="">Primero seleccione año</option>';
            selectMes.disabled = true;
            return;
        }
        
        if (this.anoSeleccionado === 'todos') {
            // Si seleccionó "Todos los años", mostrar opción "Todos los meses"
            selectMes.innerHTML = '<option value="">Seleccione un mes</option>';
            selectMes.innerHTML += '<option value="todos">Todos los meses</option>';
            
            // Agregar todos los meses disponibles globalmente
            const todosMeses = new Set();
            this.clasesHistoricas.forEach(clase => {
                if (clase.fechaClase) {
                    const fecha = new Date(clase.fechaClase);
                    todosMeses.add(fecha.getMonth());
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
        
        // Agregar evento de cambio
        selectMes.addEventListener('change', (e) => {
            this.mesSeleccionado = e.target.value;
            this.filtrarClasesPorMes();
        });
        
        console.log('✅ Selector de meses cargado con opción "Todos"');
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
        
        // Filtrar clases por año y mes (considerando opciones "todos")
        this.clasesFiltradas = this.clasesHistoricas.filter(clase => {
            if (!clase.fechaClase) return false;
            const fecha = new Date(clase.fechaClase);
            
            // Filtrar por año
            const pasaAno = this.anoSeleccionado === 'todos' || 
                           fecha.getFullYear() === parseInt(this.anoSeleccionado);
            
            // Filtrar por mes
            const pasaMes = this.mesSeleccionado === 'todos' || 
                           fecha.getMonth() === parseInt(this.mesSeleccionado);
            
            return pasaAno && pasaMes;
        });
        
        console.log(`🔍 ${this.clasesFiltradas.length} clases publicadas encontradas para los filtros seleccionados`);
        
        if (this.clasesFiltradas.length === 0) {
            // No hay clases para este período
            if (form) form.style.display = 'none';
            if (buscadorContainer) buscadorContainer.style.display = 'none';
            if (sinClasesMensaje) sinClasesMensaje.style.display = 'block';
            return;
        }
        
        // Hay clases, mostrar el formulario y el buscador
        if (sinClasesMensaje) sinClasesMensaje.style.display = 'none';
        if (form) form.style.display = 'block';
        if (buscadorContainer) buscadorContainer.style.display = 'block';
        
        this.llenarSelectClases();
        this.configurarBuscadorClases();
    }

    configurarBuscadorClases() {
        const buscador = document.getElementById('buscadorClases');
        if (!buscador) return;
        
        // Eliminar event listener anterior si existe
        const nuevoBuscador = buscador.cloneNode(true);
        buscador.parentNode.replaceChild(nuevoBuscador, buscador);
        
        // Agregar nuevo event listener
        nuevoBuscador.addEventListener('input', (e) => {
            this.filtrarListaClases(e.target.value);
        });
    }

    filtrarListaClases(textoBusqueda) {
        const select = document.getElementById('claseSeleccionada');
        if (!select) return;
        
        const opciones = select.querySelectorAll('option');
        const textoLower = textoBusqueda.toLowerCase();
        
        opciones.forEach(option => {
            if (option.value === '') return; // Ignorar la opción por defecto
            
            const textoOpcion = option.textContent.toLowerCase();
            if (textoOpcion.includes(textoLower)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    }

    llenarSelectClases() {
        const select = document.getElementById('claseSeleccionada');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleccione una clase</option>';
        
        // Ordenar alfabéticamente por nombre
        this.clasesFiltradas.sort((a, b) => {
            return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
        });
        
        this.clasesFiltradas.forEach(clase => {
            const option = document.createElement('option');
            option.value = clase._id;
            
            // Formatear fecha para mostrar
            let fechaTexto = '';
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                fechaTexto = fecha.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
            
            // Mostrar el estado de la clase (opcional, para debug)
            const estadoTexto = clase.estado ? ` [${clase.estado}]` : '';
            
            option.textContent = `${clase.nombre} (${fechaTexto})${estadoTexto}`;
            option.dataset.nombre = clase.nombre;
            option.dataset.descripcion = clase.descripcion || '';
            option.dataset.fecha = clase.fechaClase;
            option.dataset.youtube = clase.enlaces?.youtube || '';
            option.dataset.powerpoint = clase.enlaces?.powerpoint || '';
            option.dataset.instructores = clase.instructores?.join(', ') || '';
            
            select.appendChild(option);
        });
        
        console.log(`✅ Selector de clases cargado con ${this.clasesFiltradas.length} opciones (solo clases publicadas)`);
        
        // Resetear buscador
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

        // Mostrar enlaces del material
        this.mostrarMaterial(claseData);
        
        // Guardar solicitud en MongoDB
        await this.guardarSolicitud(claseData);
    }

    mostrarMaterial(claseData) {
        const materialLinks = document.getElementById('materialLinks');
        const claseNombre = document.getElementById('claseNombre');
        const claseDescripcion = document.getElementById('claseDescripcion');
        const claseFecha = document.getElementById('claseFecha');
        const linksContainer = document.getElementById('linksContainer');
        
        if (!materialLinks || !claseNombre || !linksContainer) {
            console.error('❌ Elementos necesarios para mostrar material no encontrados');
            return;
        }
        
        // Formatear fecha para mostrar
        let fechaFormateada = '';
        if (claseData.fecha) {
            const fecha = new Date(claseData.fecha);
            fechaFormateada = fecha.toLocaleDateString('es-AR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            // Capitalizar primera letra
            fechaFormateada = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
        }
        
        // Mostrar período seleccionado en el badge
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
        
        // Limpiar instructores anteriores
        const instructoresExistente = document.getElementById('instructoresInfo');
        if (instructoresExistente) {
            instructoresExistente.remove();
        }
        
        if (claseData.instructores) {
            const instructoresElem = document.createElement('p');
            instructoresElem.id = 'instructoresInfo';
            instructoresElem.innerHTML = `👥 Instructores: ${claseData.instructores}`;
            instructoresElem.style.marginTop = '10px';
            instructoresElem.style.color = 'var(--text-secondary)';
            const claseInfo = document.getElementById('claseInfo');
            if (claseInfo) {
                claseInfo.appendChild(instructoresElem);
            }
        }
        
        linksContainer.innerHTML = '';
        
        if (claseData.youtube) {
            linksContainer.innerHTML += `
                <div class="link-card youtube" onclick="window.open('${claseData.youtube}', '_blank')">
                    <a href="${claseData.youtube}" target="_blank">
                        <div class="icon">▶️</div>
                        <div class="title">YouTube</div>
                        <div class="subtitle">Ver grabación de la clase</div>
                        <div class="hover-info">Click para abrir el video</div>
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
                        <div class="hover-info">Click para abrir la presentación</div>
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
        
        // Resetear selectores
        const selectAno = document.getElementById('anoSeleccionado');
        if (selectAno) selectAno.value = '';
        
        const selectMes = document.getElementById('mesSeleccionado');
        if (selectMes) {
            selectMes.innerHTML = '<option value="">Primero seleccione año</option>';
            selectMes.disabled = true;
        }
        
        this.anoSeleccionado = null;
        this.mesSeleccionado = null;
    }

    async guardarSolicitud(claseData) {
        try {
            const user = getCurrentUserSafe();
            
            const solicitudData = {
                claseId: claseData.id,
                claseNombre: claseData.nombre,
                email: user.email,
                youtube: claseData.youtube,
                powerpoint: claseData.powerpoint,
                fechaClase: claseData.fecha,
                fechaSolicitud: new Date().toISOString()
            };

            console.log('📤 Guardando solicitud:', solicitudData);
            
            // Usar makeRequestSafe de formularios.js
            const result = await makeRequestSafe('/material-historico/solicitudes', solicitudData);
            
            if (result.success) {
                console.log('✅ Solicitud guardada');
                await this.cargarMisSolicitudes();
            }
            
        } catch (error) {
            console.error('❌ Error guardando solicitud:', error);
            this.mostrarMensaje('Material disponible (modo offline)', 'info');
        }
    }

    async cargarMisSolicitudes() {
        try {
            const user = getCurrentUserSafe();
            
            console.log('🔍 Cargando historial de solicitudes...');
            
            const response = await fetch(`${this.apiBaseUrl}/material-historico/solicitudes`, {
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': user._id
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    this.solicitudes = result.data;
                } else {
                    this.cargarSolicitudesLocal();
                }
            } else {
                this.cargarSolicitudesLocal();
            }
            
            this.mostrarMisSolicitudes();
            
        } catch (error) {
            console.error('❌ Error cargando solicitudes:', error);
            this.cargarSolicitudesLocal();
            this.mostrarMisSolicitudes();
        }
    }

    cargarSolicitudesLocal() {
        const user = getCurrentUserSafe();
        const storageKey = `solicitudMaterial_${user._id}`;
        const stored = localStorage.getItem(storageKey);
        this.solicitudes = stored ? JSON.parse(stored) : [];
        console.log(`📋 ${this.solicitudes.length} solicitudes cargadas desde localStorage`);
    }

    mostrarMisSolicitudes() {
        const tbody = document.querySelector('#tablaMisSolicitudes tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (this.solicitudes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #666; padding: 20px;">
                        Todavia no has solicitado material de clases grabadas. ¡Explora las clases disponibles y solicita el material que te interese!
                    </td>
                </tr>
            `;
            return;
        }

        // Ordenar por fecha más reciente
        this.solicitudes.sort((a, b) => 
            new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud)
        );

        this.solicitudes.forEach(solicitud => {
            const row = document.createElement('tr');
            
            const fechaClase = solicitud.fechaClase ? 
                new Date(solicitud.fechaClase).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'Fecha no disponible';
            
            const fechaSolicitud = solicitud.fechaSolicitud ? 
                new Date(solicitud.fechaSolicitud).toLocaleString('es-AR') : 
                'Fecha no disponible';
            
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
        const mensajeDiv = document.getElementById('statusMessage');
        if (!mensajeDiv) {
            console.log('📢', mensaje, tipo);
            return;
        }
        
        mensajeDiv.textContent = mensaje;
        mensajeDiv.className = `status-message ${tipo}`;
        mensajeDiv.style.display = 'block';

        setTimeout(() => {
            mensajeDiv.style.display = 'none';
        }, 5000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, esperando funciones de formularios.js...');
    
    // Verificar que las funciones existen antes de inicializar
    if (typeof waitForAuthSystem === 'undefined') {
        console.error('❌ funciones de formularios.js no disponibles');
        // Mostrar mensaje de error
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 3em; margin-bottom: 20px;">⚠️</div>
                    <h3>Error de Carga</h3>
                    <p>No se pudo cargar el sistema de autenticación.</p>
                    <p style="color: #666; font-size: 0.9em;">Asegúrese de que formularios.js se cargue antes que solicitud-material.js</p>
                    <button onclick="window.location.reload()" class="back-btn">Reintentar</button>
                </div>
            `;
        }
    } else {
        console.log('✅ funciones de formularios.js disponibles, inicializando...');
        window.materialHistorico = new MaterialHistorico();
    }
});