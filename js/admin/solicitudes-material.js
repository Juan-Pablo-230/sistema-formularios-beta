// solicitudes-material.js
console.log('📚 Módulo de Solicitudes de Material cargado');

class SolicitudesMaterialManager {
    constructor() {
        this.data = [];
        this.filtroClase = 'todas';
        this.filtroUsuario = '';
        this.init();
    }

    async init() {
        await this.cargarDatos();
        this.setupEventListeners();
    }

    async cargarDatos() {
        try {
            const result = await authSystem.makeRequest('/material-historico/solicitudes', null, 'GET');
            this.data = result.data || [];
            console.log(`✅ ${this.data.length} solicitudes cargadas`);
            this.actualizarUI();
        } catch (error) {
            console.error('❌ Error cargando solicitudes:', error);
            this.mostrarError();
        }
    }

    filtrarDatos() {
        let datos = [...this.data];

        if (this.filtroClase !== 'todas') {
            datos = datos.filter(d => d.claseNombre === this.filtroClase);
        }

        if (this.filtroUsuario) {
            const termino = this.filtroUsuario.toLowerCase();
            datos = datos.filter(d => 
                (d.usuario?.apellidoNombre?.toLowerCase().includes(termino)) ||
                (d.usuario?.legajo?.toString().includes(termino))
            );
        }

        return datos;
    }

    actualizarUI() {
        this.actualizarFiltros();
        this.mostrarTabla();
        this.actualizarEstadisticas();
    }

    actualizarFiltros() {
        const selectClase = document.getElementById('filtroClase');
        if (!selectClase) return;

        const clases = [...new Set(this.data.map(d => d.claseNombre).filter(Boolean))];
        
        selectClase.innerHTML = '<option value="todas">Todas las clases</option>';
        clases.sort().forEach(clase => {
            const option = document.createElement('option');
            option.value = clase;
            option.textContent = clase;
            selectClase.appendChild(option);
        });
    }

    mostrarTabla() {
    const tbody = document.getElementById('solicitudesBody');
    if (!tbody) return;

    const datosFiltrados = this.filtrarDatos();

    if (datosFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-message">
                    No hay solicitudes para mostrar
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = datosFiltrados.map((item, index) => {
        // Formatear fecha con hour12: false para forzar 24h
        let fechaFormateada = 'N/A';
        if (item.fechaSolicitud) {
            const fecha = new Date(item.fechaSolicitud);
            fechaFormateada = fecha.toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        }
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${item.usuario?.apellidoNombre || 'N/A'}</td>
                <td>${item.usuario?.legajo || 'N/A'}</td>
                <td>${this.formatearTurno(item.usuario?.turno || item.turno)}</td>
                <td>${item.claseNombre || 'N/A'}</td>
                <td><a href="mailto:${item.usuario?.email || item.email}" class="email-link">${item.usuario?.email || item.email || 'N/A'}</a></td>
                <td>${fechaFormateada}</td>
                <td>
                    <div class="material-badge">
                        ${item.youtube ? `<a href="${item.youtube}" target="_blank" class="material-link youtube">▶️ YouTube</a>` : ''}
                        ${item.powerpoint ? `<a href="${item.powerpoint}" target="_blank" class="material-link powerpoint">📊 PPT</a>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

    formatearTurno(turno) {
        if (!turno) return '<span class="turno-badge default">No especificado</span>';
        
        const clases = {
            'Turno mañana': 'mañana',
            'Turno tarde': 'tarde',
            'Turno noche A': 'noche',
            'Turno noche B': 'noche',
            'Turno intermedio': 'intermedio',
            'Turno SADOFE': 'finde'
        };
        
        const clase = clases[turno] || 'default';
        return `<span class="turno-badge ${clase}">${turno}</span>`;
    }

    actualizarEstadisticas() {
        const total = this.data.length;
        const clasesUnicas = new Set(this.data.map(s => s.claseNombre)).size;
        const usuariosUnicos = new Set(this.data.map(s => s.usuario?._id)).size;
        
        const semanaAtras = new Date();
        semanaAtras.setDate(semanaAtras.getDate() - 7);
        const solicitudesSemana = this.data.filter(s => 
            s.fechaSolicitud && new Date(s.fechaSolicitud) >= semanaAtras
        ).length;

        document.getElementById('totalSolicitudes').textContent = total;
        document.getElementById('clasesDistintas').textContent = clasesUnicas;
        document.getElementById('usuariosDistintos').textContent = usuariosUnicos;
        document.getElementById('solicitudesSemana').textContent = solicitudesSemana;
    }

    mostrarError() {
        const tbody = document.getElementById('solicitudesBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="error-message">
                        ⚠️ Error al cargar las solicitudes
                    </td>
                </tr>
            `;
        }
    }

    setupEventListeners() {
        document.getElementById('filtroClase')?.addEventListener('change', (e) => {
            this.filtroClase = e.target.value;
            this.mostrarTabla();
        });

        document.getElementById('filtroUsuario')?.addEventListener('input', (e) => {
            this.filtroUsuario = e.target.value;
            this.mostrarTabla();
        });

        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.cargarDatos();
        });
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.solicitudesMaterialManager = new SolicitudesMaterialManager();
});