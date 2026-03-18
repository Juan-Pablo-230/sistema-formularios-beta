// calendar.js
console.log('📅 calendar.js cargado');

class CalendarManager {
    constructor() {
        this.todasLasClases = [];
        this.filtroActual = 'todas';
        this.proximaClase = null;
        this.init();
    }

    async init() {
        await this.cargarClases();
        this.configurarFiltros();
    }

    async cargarClases() {
        const gridContainer = document.getElementById('calendar-clases-grid');
        const proximaSection = document.getElementById('proximaClaseSection');
        const proximaInfo = document.getElementById('proximaClaseInfo');
        const mensajeDiv = document.getElementById('calendarMensaje');

        if (!gridContainer) return;

        const mostrarMensaje = (texto, tipo = 'info') => {
            if (mensajeDiv) {
                mensajeDiv.textContent = texto;
                mensajeDiv.className = `status-message ${tipo}`;
                mensajeDiv.style.display = 'block';
                setTimeout(() => mensajeDiv.style.display = 'none', 4000);
            }
        };

        try {
            console.log('🔄 Cargando clases para el calendario...');
            gridContainer.innerHTML = '<div class="loading-classes">Cargando calendario de clases...</div>';

            // Obtener la hora del servidor para cálculos precisos
            const timeResponse = await fetch('/api/health');
            const timeData = await timeResponse.json();
            const ahora = new Date(timeData.timestamp).getTime();

            // 1. Obtener clases públicas (clases en vivo)
            const responsePublicas = await fetch('/api/clases-publicas/publicadas');
            const dataPublicas = await responsePublicas.json();
            let clasesPublicas = dataPublicas.success ? dataPublicas.data : [];

            // 2. Obtener clases históricas (material grabado)
            const responseHistoricas = await fetch('/api/clases-historicas');
            const dataHistoricas = await responseHistoricas.json();
            let clasesHistoricas = dataHistoricas.success ? dataHistoricas.data : [];

            // 3. Combinar todas las clases
            this.todasLasClases = [];

            // Procesar clases públicas
            clasesPublicas.forEach(clase => {
                if (clase.fechaClase) {
                    this.todasLasClases.push({
                        _id: clase._id,
                        nombre: clase.nombre,
                        descripcion: clase.descripcion || '',
                        fechaClase: clase.fechaClase,
                        fechaApertura: clase.fechaApertura || clase.fechaClase,
                        fechaCierre: clase.fechaCierre || (new Date(new Date(clase.fechaClase).getTime() + 60 * 60 * 1000).toISOString()),
                        lugar: clase.lugar || 'Por definir',
                        instructores: clase.instructores && clase.instructores.length > 0 ? clase.instructores : ['Instructor no especificado'],
                        tipo: 'publica',
                        enlace: clase.enlaceFormulario || null,
                        publicada: clase.publicada || false,
                        esProxima: false
                    });
                }
            });

            // Procesar clases históricas (solo las que tienen material/enlaces)
            clasesHistoricas.forEach(clase => {
                if (clase.fechaClase && (clase.enlaces?.youtube || clase.enlaces?.powerpoint)) {
                    this.todasLasClases.push({
                        _id: clase._id,
                        nombre: clase.nombre,
                        descripcion: clase.descripcion || 'Material de clase grabada',
                        fechaClase: clase.fechaClase,
                        fechaApertura: clase.fechaClase,
                        fechaCierre: new Date(new Date(clase.fechaClase).getTime() + 2 * 60 * 60 * 1000).toISOString(),
                        lugar: '📚 Material grabado disponible',
                        instructores: clase.instructores && clase.instructores.length > 0 ? clase.instructores : ['Instructor no especificado'],
                        tipo: 'historica',
                        enlace: null,
                        enlaces: clase.enlaces || {},
                        publicada: true,
                        esProxima: false
                    });
                }
            });

            if (this.todasLasClases.length === 0) {
                gridContainer.innerHTML = '<div class="no-classes-message">No hay clases cargadas en el sistema.</div>';
                proximaSection.style.display = 'none';
                return;
            }

            // Ordenar las clases por fecha (más cercanas primero)
            this.todasLasClases.sort((a, b) => new Date(a.fechaClase) - new Date(b.fechaClase));

            // Encontrar la PRÓXIMA clase (la primera con fecha posterior a ahora)
            this.proximaClase = null;
            for (let clase of this.todasLasClases) {
                if (clase.tipo === 'publica' && new Date(clase.fechaClase).getTime() > ahora) {
                    this.proximaClase = clase;
                    break;
                }
            }

            // Si no hay próximas clases públicas, buscar en históricas
            if (!this.proximaClase) {
                for (let clase of this.todasLasClases) {
                    if (new Date(clase.fechaClase).getTime() > ahora) {
                        this.proximaClase = clase;
                        break;
                    }
                }
            }

            // Mostrar la próxima clase destacada (en AMARILLO)
            if (this.proximaClase) {
                this.proximaClase.esProxima = true;
                const fechaProxima = new Date(this.proximaClase.fechaClase).toLocaleString('es-AR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

                const instructoresTexto = Array.isArray(this.proximaClase.instructores) 
                    ? this.proximaClase.instructores.join(', ') 
                    : this.proximaClase.instructores;

                proximaInfo.innerHTML = `
                    <h3>${this.proximaClase.nombre}</h3>
                    <p><strong>📅 Fecha:</strong> ${fechaProxima.charAt(0).toUpperCase() + fechaProxima.slice(1)}</p>
                    <p><strong>📍 Lugar:</strong> ${this.proximaClase.lugar}</p>
                    <p><strong>👥 Instructores:</strong> ${instructoresTexto}</p>
                    ${this.proximaClase.descripcion ? `<p><strong>📝 Descripción:</strong> ${this.proximaClase.descripcion}</p>` : ''}
                `;
                proximaSection.style.display = 'block';
            } else {
                proximaSection.style.display = 'none';
            }

            // Mostrar todas las clases según el filtro actual
            this.mostrarClases(this.filtroActual);

        } catch (error) {
            console.error('❌ Error cargando calendario:', error);
            gridContainer.innerHTML = '<div class="error-message">Error al cargar el calendario. Por favor, recargue la página.</div>';
            mostrarMensaje('Error de conexión al cargar las clases', 'error');
        }
    }

    mostrarClases(filtro) {
        const gridContainer = document.getElementById('calendar-clases-grid');
        if (!gridContainer) return;

        let clasesFiltradas = this.todasLasClases;
        const ahora = Date.now();

        // Aplicar filtro
        if (filtro === 'publicas') {
            clasesFiltradas = this.todasLasClases.filter(c => c.tipo === 'publica');
        } else if (filtro === 'historicas') {
            clasesFiltradas = this.todasLasClases.filter(c => c.tipo === 'historica');
        } else if (filtro === 'proximas') {
            clasesFiltradas = this.todasLasClases.filter(c => new Date(c.fechaClase).getTime() > ahora);
        }

        if (clasesFiltradas.length === 0) {
            gridContainer.innerHTML = `<div class="no-classes-message">No hay clases para mostrar en esta categoría.</div>`;
            return;
        }

        let htmlString = '';
        clasesFiltradas.forEach(clase => {
            const fechaClase = new Date(clase.fechaClase).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            const esProxima = (this.proximaClase && clase._id === this.proximaClase._id);
            const instructoresTexto = Array.isArray(clase.instructores) 
                ? clase.instructores.join(', ') 
                : clase.instructores;

            // Determinar estado
            let estadoClase = 'pasada';
            let estadoTexto = 'Finalizada';
            const fechaClaseTime = new Date(clase.fechaClase).getTime();

            if (fechaClaseTime > ahora) {
                estadoClase = 'futura';
                estadoTexto = 'Próximamente';
            }
            if (esProxima) {
                estadoClase = 'proxima';
                estadoTexto = '¡PRÓXIMA!';
            }

            // Clase especial para históricas con enlaces
            const tieneMaterial = clase.enlaces && (clase.enlaces.youtube || clase.enlaces.powerpoint);

            htmlString += `
                <div class="calendar-card ${estadoClase} ${clase.tipo}" data-clase-id="${clase._id}">
                    <div class="calendar-card-header">
                        <h3>${clase.nombre}</h3>
                        <span class="clase-tipo-badge ${clase.tipo}">
                            ${clase.tipo === 'publica' ? '📢 EN VIVO' : '📚 GRABADA'}
                        </span>
                    </div>
                    
                    <p class="clase-instructores">👥 ${instructoresTexto}</p>
                    
                    <div class="clase-detalles">
                        <p class="clase-fecha">📅 ${fechaClase}</p>
                        <p class="clase-lugar">📍 ${clase.lugar}</p>
                    </div>
                    
                    ${clase.descripcion ? `<p class="clase-descripcion">${clase.descripcion}</p>` : ''}
                    
                    ${tieneMaterial ? `
                        <div class="clase-material">
                            ${clase.enlaces.youtube ? `<a href="${clase.enlaces.youtube}" target="_blank" class="material-link youtube">▶️ Ver en YouTube</a>` : ''}
                            ${clase.enlaces.powerpoint ? `<a href="${clase.enlaces.powerpoint}" target="_blank" class="material-link powerpoint">📊 Ver Presentación</a>` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="clase-estado-badge ${estadoClase}">${estadoTexto}</div>
                </div>
            `;
        });

        gridContainer.innerHTML = htmlString;
        console.log(`✅ Calendario actualizado con filtro "${filtro}":`, clasesFiltradas.length, 'clases');
    }

    configurarFiltros() {
        const filtros = document.querySelectorAll('.filtro-btn');
        
        filtros.forEach(btn => {
            btn.addEventListener('click', () => {
                // Actualizar botón activo
                filtros.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Aplicar filtro
                this.filtroActual = btn.dataset.filtro;
                this.mostrarClases(this.filtroActual);
            });
        });
    }
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.calendarManager = new CalendarManager();
});