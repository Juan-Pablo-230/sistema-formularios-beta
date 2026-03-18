// calendar.js
console.log('📅 calendar.js cargado - SOLO CLASES PRÓXIMAS');

class CalendarManager {
    constructor() {
        this.clasesProximas = [];
        this.proximaClase = null;
        this.filtroActual = 'todas';
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
            console.log('🔄 Cargando clases próximas...');
            gridContainer.innerHTML = '<div class="loading-classes">Cargando clases próximas...</div>';

            // Obtener la hora del servidor para cálculos precisos
            const timeResponse = await fetch('/api/health');
            const timeData = await timeResponse.json();
            const ahora = new Date(timeData.timestamp).getTime();

            // Obtener clases públicas (clases en vivo)
            const responsePublicas = await fetch('/api/clases-publicas/publicadas');
            const dataPublicas = await responsePublicas.json();
            let clasesPublicas = dataPublicas.success ? dataPublicas.data : [];

            // Filtrar SOLO las clases futuras (fecha mayor a ahora)
            this.clasesProximas = [];

            clasesPublicas.forEach(clase => {
                if (clase.fechaClase) {
                    const fechaClase = new Date(clase.fechaClase).getTime();
                    
                    // SOLO incluir si la fecha es FUTURA (mayor a ahora)
                    if (fechaClase > ahora) {
                        this.clasesProximas.push({
                            _id: clase._id,
                            nombre: clase.nombre,
                            descripcion: clase.descripcion || '',
                            fechaClase: clase.fechaClase,
                            fechaApertura: clase.fechaApertura || clase.fechaClase,
                            fechaCierre: clase.fechaCierre || (new Date(new Date(clase.fechaClase).getTime() + 60 * 60 * 1000).toISOString()),
                            lugar: clase.lugar || 'Por definir',
                            instructores: clase.instructores && clase.instructores.length > 0 ? clase.instructores : ['Instructor no especificado'],
                            enlace: clase.enlaceFormulario || null,
                            esProxima: false
                        });
                    }
                }
            });

            if (this.clasesProximas.length === 0) {
                gridContainer.innerHTML = '<div class="no-classes-message">No hay clases próximas programadas.</div>';
                proximaSection.style.display = 'none';
                return;
            }

            // Ordenar las clases por fecha (más cercanas primero)
            this.clasesProximas.sort((a, b) => new Date(a.fechaClase) - new Date(b.fechaClase));

            // La PRÓXIMA clase es la primera del array (la más cercana)
            this.proximaClase = this.clasesProximas[0];
            this.proximaClase.esProxima = true;

            // Mostrar la próxima clase destacada (en AMARILLO)
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

            // Mostrar todas las clases próximas
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

        let clasesFiltradas = this.clasesProximas;

        // Aplicar filtro (por si queremos filtrar por lugar o instructor en el futuro)
        // Por ahora solo mostramos todas las próximas

        if (clasesFiltradas.length === 0) {
            gridContainer.innerHTML = `<div class="no-classes-message">No hay clases próximas para mostrar.</div>`;
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

            htmlString += `
                <div class="calendar-card ${esProxima ? 'proxima' : 'futura'}" data-clase-id="${clase._id}">
                    <div class="calendar-card-header">
                        <h3>${clase.nombre}</h3>
                        ${esProxima ? '<span class="proxima-badge">⭐ PRÓXIMA ⭐</span>' : ''}
                    </div>
                    
                    <p class="clase-instructores">👥 ${instructoresTexto}</p>
                    
                    <div class="clase-detalles">
                        <p class="clase-fecha">📅 ${fechaClase}</p>
                        <p class="clase-lugar">📍 ${clase.lugar}</p>
                    </div>
                    
                    ${clase.descripcion ? `<p class="clase-descripcion">${clase.descripcion}</p>` : ''}
                    
                    <div class="clase-fecha-relativa">
                        ${this.obtenerTiempoRestante(new Date(clase.fechaClase).getTime())}
                    </div>
                </div>
            `;
        });

        gridContainer.innerHTML = htmlString;
        console.log(`✅ Calendario actualizado: ${clasesFiltradas.length} clases próximas`);
    }

    obtenerTiempoRestante(fechaClase) {
        const ahora = Date.now();
        const diffMs = fechaClase - ahora;
        
        if (diffMs <= 0) return '🚀 Comenzó';
        
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHoras = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (diffDias > 0) {
            return `⏳ Faltan ${diffDias} día${diffDias !== 1 ? 's' : ''} y ${diffHoras} hora${diffHoras !== 1 ? 's' : ''}`;
        } else if (diffHoras > 0) {
            return `⏳ Faltan ${diffHoras} hora${diffHoras !== 1 ? 's' : ''}`;
        } else {
            const diffMinutos = Math.floor(diffMs / (1000 * 60));
            return `⏳ Faltan ${diffMinutos} minuto${diffMinutos !== 1 ? 's' : ''}`;
        }
    }

    configurarFiltros() {
        // Por ahora no hay filtros funcionales, pero mantenemos la estructura
        const filtros = document.querySelectorAll('.filtro-btn');
        
        filtros.forEach(btn => {
            btn.addEventListener('click', () => {
                filtros.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Por ahora solo mostramos todas las próximas siempre
                this.mostrarClases('todas');
            });
        });
    }
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.calendarManager = new CalendarManager();
});