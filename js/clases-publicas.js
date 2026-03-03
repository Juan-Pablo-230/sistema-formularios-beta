// clases-publicas.js
console.log('📚 Módulo de Clases Públicas cargado');

class ClasesPublicasManager {
    constructor() {
        this.data = [];
        this.editandoId = null;
        this.init();
    }

    async init() {
        await this.cargarDatos();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('claseForm')?.addEventListener('submit', (e) => this.guardarClase(e));
        
        document.getElementById('limpiarFormBtn')?.addEventListener('click', () => {
            this.cancelarEdicion();
        });
        
        document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
            this.cancelarEdicion();
        });
        
        document.getElementById('refrescarClasesBtn')?.addEventListener('click', () => {
            this.cargarDatos();
        });
        
        document.getElementById('buscarClase')?.addEventListener('input', (e) => {
            this.mostrarLista(e.target.value, document.getElementById('filtroVisibilidad').value);
        });
        
        document.getElementById('filtroVisibilidad')?.addEventListener('change', (e) => {
            this.mostrarLista(document.getElementById('buscarClase').value, e.target.value);
        });
    }

    async cargarDatos() {
        try {
            const result = await authSystem.makeRequest('/clases-publicas', null, 'GET');
            this.data = result.data || [];
            console.log(`✅ ${this.data.length} clases públicas cargadas`);
            this.mostrarLista();
            this.actualizarEstadisticas();
        } catch (error) {
            console.error('❌ Error cargando clases públicas:', error);
            this.mostrarError();
        }
    }

    mostrarLista(filtroTexto = '', filtroVisibilidad = 'todas') {
        const container = document.getElementById('clasesList');
        if (!container) return;

        let clasesFiltradas = this.data;
        
        // Filtrar por texto
        if (filtroTexto) {
            const termino = filtroTexto.toLowerCase();
            clasesFiltradas = clasesFiltradas.filter(c => 
                c.nombre?.toLowerCase().includes(termino) ||
                c.descripcion?.toLowerCase().includes(termino) ||
                (c.instructores && c.instructores.some(i => i.toLowerCase().includes(termino)))
            );
        }
        
        // Filtrar por visibilidad
        if (filtroVisibilidad === 'publicadas') {
            clasesFiltradas = clasesFiltradas.filter(c => c.publicada === true);
        } else if (filtroVisibilidad === 'no-publicadas') {
            clasesFiltradas = clasesFiltradas.filter(c => c.publicada === false);
        }

        if (clasesFiltradas.length === 0) {
            container.innerHTML = `
                <div class="empty-message">
                    No hay clases públicas para mostrar
                </div>
            `;
            return;
        }

        clasesFiltradas.sort((a, b) => new Date(b.fechaClase) - new Date(a.fechaClase));

        container.innerHTML = clasesFiltradas.map(clase => {
            // Formatear fecha
            let fechaFormateada = 'N/A';
            if (clase.fechaClase) {
                const fecha = new Date(clase.fechaClase);
                fechaFormateada = fecha.toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
            
            // Estado según visibilidad
            const estadoIcono = clase.publicada ? '✅' : '⏸️';
            const estadoTexto = clase.publicada ? 'Publicada' : 'No publicada';
            const estadoClass = clase.publicada ? 'publicada' : 'no-publicada';
            
            return `
                <div class="clase-card ${estadoClass}">
                    <div class="clase-header">
                        <span class="clase-titulo">${clase.nombre}</span>
                        <span class="clase-estado ${estadoClass}">
                            ${estadoIcono} ${estadoTexto}
                        </span>
                    </div>
                    
                    ${clase.descripcion ? `<p class="clase-descripcion">${clase.descripcion}</p>` : ''}
                    
                    <div class="clase-detalles">
                        <span>📅 ${fechaFormateada}</span>
                        ${clase.instructores?.length ? `<span>👥 ${clase.instructores.join(', ')}</span>` : ''}
                        ${clase.lugar ? `<span>📍 ${clase.lugar}</span>` : ''}
                    </div>
                    
                    <div class="clase-enlaces">
                        ${clase.enlaceFormulario ? `
                            <a href="${clase.enlaceFormulario}" target="_blank" class="material-link" style="background: var(--accent-color); color: white;">
                                📝 Formulario
                            </a>
                        ` : ''}
                        ${!clase.enlaceFormulario ? 
                            '<span class="sin-enlaces">Sin formulario asociado</span>' : ''}
                    </div>
                    
                    <div class="clase-acciones">
                        <button class="btn-small btn-edit" onclick="clasesPublicasManager.editarClase('${clase._id}')">✏️ Editar</button>
                        <button class="btn-small btn-danger" onclick="clasesPublicasManager.eliminarClase('${clase._id}')">🗑️ Eliminar</button>
                        ${clase.publicada ? 
                            `<button class="btn-small btn-warning" onclick="clasesPublicasManager.cambiarVisibilidad('${clase._id}', false)">⏸️ Ocultar</button>` :
                            `<button class="btn-small btn-success" onclick="clasesPublicasManager.cambiarVisibilidad('${clase._id}', true)">✅ Publicar</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    async guardarClase(event) {
        event.preventDefault();
        
        // Validar campos requeridos
        const nombre = document.getElementById('claseNombre')?.value.trim();
        const fecha = document.getElementById('claseFecha')?.value;
        const publicada = document.querySelector('input[name="visibilidad"]:checked')?.value === 'true';
        
        if (!nombre) {
            this.mostrarMensaje('❌ El nombre de la clase es obligatorio', 'error');
            return;
        }
        
        if (!fecha) {
            this.mostrarMensaje('❌ La fecha de la clase es obligatoria', 'error');
            return;
        }
        
        const hora = document.getElementById('claseHora')?.value || '10:00';
        const fechaCompleta = `${fecha}T${hora}:00`;
        
        // Procesar instructores
        const instructores = document.getElementById('claseInstructores')?.value
            ? document.getElementById('claseInstructores').value.split(',').map(i => i.trim()).filter(i => i)
            : [];
        
        // Preparar datos
        const claseData = {
            nombre: nombre,
            descripcion: document.getElementById('claseDescripcion')?.value || '',
            fechaClase: fechaCompleta,
            instructores: instructores,
            lugar: document.getElementById('claseLugar')?.value || '',
            enlaceFormulario: document.getElementById('claseEnlaceFormulario')?.value || '',
            publicada: publicada
        };
        
        console.log('📤 Enviando datos al servidor:', claseData);
        
        try {
            let response;
            if (this.editandoId) {
                response = await authSystem.makeRequest(`/clases-publicas/${this.editandoId}`, claseData, 'PUT');
                this.mostrarMensaje('✅ Clase actualizada correctamente', 'success');
            } else {
                response = await authSystem.makeRequest('/clases-publicas', claseData);
                this.mostrarMensaje('✅ Clase creada correctamente', 'success');
            }
            
            this.cancelarEdicion();
            await this.cargarDatos();
        } catch (error) {
            console.error('❌ Error detallado:', error);
            this.mostrarMensaje('❌ Error: ' + error.message, 'error');
        }
    }

    editarClase(id) {
        const clase = this.data.find(c => c._id === id);
        if (!clase) return;

        this.editandoId = id;
        
        document.getElementById('claseNombre').value = clase.nombre || '';
        document.getElementById('claseDescripcion').value = clase.descripcion || '';
        
        if (clase.fechaClase) {
            const fecha = new Date(clase.fechaClase);
            document.getElementById('claseFecha').value = fecha.toISOString().split('T')[0];
            document.getElementById('claseHora').value = fecha.toTimeString().slice(0, 5);
        }
        
        document.getElementById('claseInstructores').value = clase.instructores?.join(', ') || '';
        document.getElementById('claseLugar').value = clase.lugar || '';
        document.getElementById('claseEnlaceFormulario').value = clase.enlaceFormulario || '';
        
        // Seleccionar visibilidad
        const radioPublicada = document.querySelector('input[name="visibilidad"][value="true"]');
        const radioNoPublicada = document.querySelector('input[name="visibilidad"][value="false"]');
        if (clase.publicada) {
            radioPublicada.checked = true;
        } else {
            radioNoPublicada.checked = true;
        }
        
        document.getElementById('formTitle').innerHTML = '✏️ Editando: ' + clase.nombre;
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        document.getElementById('submitClaseBtn').textContent = '✏️ Actualizar Clase';
        
        document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
    }

    cancelarEdicion() {
        this.editandoId = null;
        this.limpiarFormulario();
        document.getElementById('formTitle').innerHTML = '➕ Agregar Nueva Clase Pública';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('submitClaseBtn').textContent = '💾 Guardar Clase';
    }

    limpiarFormulario() {
        document.getElementById('claseForm').reset();
        document.getElementById('claseHora').value = '10:00';
        document.querySelector('input[name="visibilidad"][value="false"]').checked = true;
        this.ocultarMensaje();
    }

    async eliminarClase(id) {
        if (!confirm('¿Está seguro de eliminar esta clase?')) return;

        try {
            await authSystem.makeRequest(`/clases-publicas/${id}`, null, 'DELETE');
            this.mostrarMensaje('✅ Clase eliminada correctamente', 'success');
            await this.cargarDatos();
        } catch (error) {
            this.mostrarMensaje('❌ Error al eliminar: ' + error.message, 'error');
        }
    }

    async cambiarVisibilidad(id, publicada) {
        const clase = this.data.find(c => c._id === id);
        if (!clase) return;

        try {
            await authSystem.makeRequest(`/clases-publicas/${id}/visibilidad`, { publicada }, 'PUT');
            this.mostrarMensaje(`✅ Clase ${publicada ? 'publicada' : 'ocultada'} correctamente`, 'success');
            await this.cargarDatos();
        } catch (error) {
            this.mostrarMensaje('❌ Error al cambiar visibilidad: ' + error.message, 'error');
        }
    }

    actualizarEstadisticas() {
        const total = this.data.length;
        const publicadas = this.data.filter(c => c.publicada === true).length;
        const noPublicadas = this.data.filter(c => c.publicada === false).length;
        const conFormulario = this.data.filter(c => c.enlaceFormulario).length;

        document.getElementById('totalClases').textContent = total;
        document.getElementById('clasesPublicadas').textContent = publicadas;
        document.getElementById('clasesNoPublicadas').textContent = noPublicadas;
        document.getElementById('clasesConFormulario').textContent = conFormulario;
    }

    mostrarMensaje(texto, tipo) {
        const msg = document.getElementById('formMessage');
        msg.textContent = texto;
        msg.className = `message ${tipo}`;
        msg.style.display = 'block';
        
        setTimeout(() => {
            msg.style.display = 'none';
        }, 3000);
    }

    ocultarMensaje() {
        document.getElementById('formMessage').style.display = 'none';
    }

    mostrarError() {
        const container = document.getElementById('clasesList');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    ⚠️ Error al cargar las clases públicas
                </div>
            `;
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.clasesPublicasManager = new ClasesPublicasManager();
});