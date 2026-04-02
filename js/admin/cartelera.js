// cartelera.js
console.log('📢 Módulo de Cartelera cargado');

class CarteleraManager {
    constructor() {
        this.avisos = [];
        this.editandoId = null;
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando CarteleraManager...');
        await this.cargarAvisos();
        this.setupEventListeners();
    }

    async cargarAvisos() {
        try {
            const container = document.getElementById('avisosContainer');
            if (!container) return;
            
            container.innerHTML = '<div class="loading-message"><div class="spinner"></div> Cargando avisos...</div>';
            
            const result = await authSystem.makeRequest('/cartelera', null, 'GET');
            
            if (result.success && result.data) {
                this.avisos = result.data;
                this.mostrarAvisos();
            } else {
                container.innerHTML = '<div class="empty-message">No hay avisos para mostrar</div>';
            }
        } catch (error) {
            console.error('❌ Error cargando avisos:', error);
            const container = document.getElementById('avisosContainer');
            if (container) {
                container.innerHTML = '<div class="error-message">⚠️ Error al cargar los avisos</div>';
            }
        }
    }

    // NUEVO: Función para convertir URLs en enlaces clickeables
    convertirUrlsEnEnlaces(texto) {
        if (!texto) return '';
        
        // Regex para detectar URLs (http, https, www)
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
        
        return texto.replace(urlRegex, (url) => {
            let href = url;
            if (!href.startsWith('http')) {
                href = 'https://' + href;
            }
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #4285f4; text-decoration: underline;">${url}</a>`;
        });
    }

    // NUEVO: Escapar HTML pero preservar los enlaces ya convertidos
    escapeHtmlPreservingLinks(texto) {
        if (!texto) return '';
        
        // Primero escapar todo el texto
        const div = document.createElement('div');
        div.textContent = texto;
        let escapado = div.innerHTML;
        
        // Luego convertir URLs a enlaces
        const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
        escapado = escapado.replace(urlRegex, (url) => {
            let href = url;
            if (!href.startsWith('http')) {
                href = 'https://' + href;
            }
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #4285f4; text-decoration: underline;">${url}</a>`;
        });
        
        return escapado;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    mostrarAvisos() {
        const container = document.getElementById('avisosContainer');
        if (!container) return;

        if (!this.avisos || this.avisos.length === 0) {
            container.innerHTML = '<div class="empty-message">No hay avisos para mostrar</div>';
            return;
        }

        const ahora = new Date();
        
        container.innerHTML = this.avisos.map(aviso => {
            const fechaInicio = new Date(aviso.fechaInicio);
            const fechaExpiracion = new Date(aviso.fechaExpiracion);
            const estaActivo = aviso.activo && ahora >= fechaInicio && ahora <= fechaExpiracion;
            
            // Formatear fechas
            const fechaInicioStr = fechaInicio.toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const fechaExpiracionStr = fechaExpiracion.toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            // Icono según tipo
            let tipoIcono = '';
            let tipoTexto = '';
            switch(aviso.tipo) {
                case 'warning':
                    tipoIcono = '⚠️';
                    tipoTexto = 'Advertencia';
                    break;
                case 'urgent':
                    tipoIcono = '🔴';
                    tipoTexto = 'Urgente';
                    break;
                case 'info':
                    tipoIcono = 'ℹ️';
                    tipoTexto = 'Informativo';
                    break;
            }
            
            // Prioridad
            let prioridadClase = '';
            let prioridadTexto = '';
            switch(aviso.prioridad) {
                case 3:
                    prioridadClase = 'prioridad-alta';
                    prioridadTexto = 'Alta';
                    break;
                case 2:
                    prioridadClase = 'prioridad-media';
                    prioridadTexto = 'Media';
                    break;
                default:
                    prioridadClase = 'prioridad-baja';
                    prioridadTexto = 'Baja';
            }
            
            // ESCAPAR el título (sin enlaces)
            const tituloEscapado = this.escapeHtml(aviso.titulo);
            
            // PARA EL MENSAJE: convertir URLs a enlaces clickeables
            const mensajeConEnlaces = this.convertirUrlsEnEnlaces(aviso.mensaje);
            
            return `
                <div class="aviso-card ${aviso.tipo} ${!estaActivo ? 'inactive' : ''}" data-id="${aviso._id}">
                    <div class="aviso-header">
                        <div class="aviso-titulo">
                            <span>${tipoIcono} ${tituloEscapado}</span>
                            <span class="aviso-prioridad ${prioridadClase}">⚡ ${prioridadTexto}</span>
                            <span class="aviso-estado ${estaActivo ? 'activo' : 'inactivo'}">
                                ${estaActivo ? '● Activo' : '○ Inactivo'}
                            </span>
                        </div>
                        <div class="aviso-fechas">
                            <span>📅 Inicio: ${fechaInicioStr}</span>
                            <span>🔚 Expira: ${fechaExpiracionStr}</span>
                        </div>
                    </div>
                    <div class="aviso-mensaje">${mensajeConEnlaces}</div>
                    <div class="aviso-acciones">
                        <button class="btn-small btn-edit" onclick="window.carteleraManager.editarAviso('${aviso._id}')">✏️ Editar</button>
                        <button class="btn-small btn-danger" onclick="window.carteleraManager.eliminarAviso('${aviso._id}')">🗑️ Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async crearAviso() {
        this.editandoId = null;
        
        const modalHTML = `
            <div id="avisoModal" class="modal-overlay" style="display: flex;">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2>➕ Crear Nuevo Aviso</h2>
                        <button class="close-modal" onclick="window.carteleraManager.cerrarModal()">&times;</button>
                    </div>
                    <form id="avisoForm" class="modal-form">
                        <div id="modalMessage" class="message" style="display: none;"></div>
                        
                        <div class="form-group">
                            <label>Título <span class="required">*</span></label>
                            <input type="text" id="avisoTitulo" required maxlength="100" placeholder="Ej: Cambio de horario de clases">
                        </div>
                        
                        <div class="form-group">
                            <label>Mensaje <span class="required">*</span></label>
                            <textarea id="avisoMensaje" rows="3" required maxlength="500" placeholder="Escribe el contenido del aviso... Puedes incluir enlaces como https://ejemplo.com"></textarea>
                            <small class="field-info">Los enlaces (http://, https://, www.) se mostrarán automáticamente como enlaces clickeables</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Tipo <span class="required">*</span></label>
                            <select id="avisoTipo" required>
                                <option value="warning">⚠️ Advertencia (Amarillo)</option>
                                <option value="urgent">🔴 Urgente (Rojo)</option>
                                <option value="info">ℹ️ Informativo (Azul)</option>
                            </select>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Fecha de Inicio <span class="required">*</span></label>
                                <input type="datetime-local" id="avisoFechaInicio" required>
                            </div>
                            
                            <div class="form-group">
                                <label>Fecha de Expiración <span class="required">*</span></label>
                                <input type="datetime-local" id="avisoFechaExpiracion" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Prioridad</label>
                            <select id="avisoPrioridad">
                                <option value="1">Baja</option>
                                <option value="2" selected>Media</option>
                                <option value="3">Alta</option>
                            </select>
                            <small class="field-info">Los avisos con mayor prioridad aparecen primero</small>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="submit-btn">💾 Guardar Aviso</button>
                            <button type="button" class="cancel-btn" onclick="window.carteleraManager.cerrarModal()">❌ Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Establecer fechas por defecto
        const ahora = new Date();
        const inicio = new Date(ahora);
        inicio.setHours(0, 0, 0, 0);
        const expiracion = new Date(ahora);
        expiracion.setDate(ahora.getDate() + 7);
        expiracion.setHours(23, 59, 59, 999);
        
        document.getElementById('avisoFechaInicio').value = inicio.toISOString().slice(0, 16);
        document.getElementById('avisoFechaExpiracion').value = expiracion.toISOString().slice(0, 16);
        
        document.getElementById('avisoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.guardarAviso();
        });
    }

    async editarAviso(id) {
        const aviso = this.avisos.find(a => a._id === id);
        if (!aviso) {
            alert('Aviso no encontrado');
            return;
        }
        
        this.editandoId = id;
        
        const modalHTML = `
            <div id="avisoModal" class="modal-overlay" style="display: flex;">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2>✏️ Editar Aviso</h2>
                        <button class="close-modal" onclick="window.carteleraManager.cerrarModal()">&times;</button>
                    </div>
                    <form id="avisoForm" class="modal-form">
                        <div id="modalMessage" class="message" style="display: none;"></div>
                        
                        <div class="form-group">
                            <label>Título <span class="required">*</span></label>
                            <input type="text" id="avisoTitulo" value="${this.escapeHtml(aviso.titulo)}" required maxlength="100">
                        </div>
                        
                        <div class="form-group">
                            <label>Mensaje <span class="required">*</span></label>
                            <textarea id="avisoMensaje" rows="3" required maxlength="500">${this.escapeHtml(aviso.mensaje)}</textarea>
                            <small class="field-info">Los enlaces (http://, https://, www.) se mostrarán automáticamente como enlaces clickeables</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Tipo <span class="required">*</span></label>
                            <select id="avisoTipo" required>
                                <option value="warning" ${aviso.tipo === 'warning' ? 'selected' : ''}>⚠️ Advertencia (Amarillo)</option>
                                <option value="urgent" ${aviso.tipo === 'urgent' ? 'selected' : ''}>🔴 Urgente (Rojo)</option>
                                <option value="info" ${aviso.tipo === 'info' ? 'selected' : ''}>ℹ️ Informativo (Azul)</option>
                            </select>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Fecha de Inicio <span class="required">*</span></label>
                                <input type="datetime-local" id="avisoFechaInicio" value="${new Date(aviso.fechaInicio).toISOString().slice(0, 16)}" required>
                            </div>
                            
                            <div class="form-group">
                                <label>Fecha de Expiración <span class="required">*</span></label>
                                <input type="datetime-local" id="avisoFechaExpiracion" value="${new Date(aviso.fechaExpiracion).toISOString().slice(0, 16)}" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Estado</label>
                            <select id="avisoActivo">
                                <option value="true" ${aviso.activo ? 'selected' : ''}>Activo</option>
                                <option value="false" ${!aviso.activo ? 'selected' : ''}>Inactivo</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Prioridad</label>
                            <select id="avisoPrioridad">
                                <option value="1" ${aviso.prioridad === 1 ? 'selected' : ''}>Baja</option>
                                <option value="2" ${aviso.prioridad === 2 ? 'selected' : ''}>Media</option>
                                <option value="3" ${aviso.prioridad === 3 ? 'selected' : ''}>Alta</option>
                            </select>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="submit-btn">💾 Actualizar Aviso</button>
                            <button type="button" class="cancel-btn" onclick="window.carteleraManager.cerrarModal()">❌ Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        document.getElementById('avisoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.guardarAviso();
        });
    }

    async guardarAviso() {
        const data = {
            titulo: document.getElementById('avisoTitulo').value.trim(),
            mensaje: document.getElementById('avisoMensaje').value.trim(),
            tipo: document.getElementById('avisoTipo').value,
            fechaInicio: document.getElementById('avisoFechaInicio').value,
            fechaExpiracion: document.getElementById('avisoFechaExpiracion').value,
            prioridad: parseInt(document.getElementById('avisoPrioridad').value)
        };
        
        if (document.getElementById('avisoActivo')) {
            data.activo = document.getElementById('avisoActivo').value === 'true';
        }
        
        // Validaciones
        if (!data.titulo || !data.mensaje) {
            this.mostrarMensajeModal('❌ Título y mensaje son obligatorios', 'error');
            return;
        }
        
        const fechaInicio = new Date(data.fechaInicio);
        const fechaExpiracion = new Date(data.fechaExpiracion);
        
        if (fechaInicio >= fechaExpiracion) {
            this.mostrarMensajeModal('❌ La fecha de expiración debe ser posterior a la fecha de inicio', 'error');
            return;
        }
        
        try {
            let result;
            if (this.editandoId) {
                result = await authSystem.makeRequest(`/cartelera/${this.editandoId}`, data, 'PUT');
            } else {
                result = await authSystem.makeRequest('/cartelera', data);
            }
            
            if (result.success) {
                this.mostrarMensajeModal(
                    this.editandoId ? '✅ Aviso actualizado correctamente' : '✅ Aviso creado correctamente',
                    'success'
                );
                
                setTimeout(() => {
                    this.cerrarModal();
                    this.cargarAvisos();
                }, 1500);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error guardando aviso:', error);
            this.mostrarMensajeModal('❌ ' + error.message, 'error');
        }
    }

    async eliminarAviso(id) {
        const aviso = this.avisos.find(a => a._id === id);
        if (!aviso) return;
        
        if (!confirm(`¿Está seguro de eliminar el aviso "${aviso.titulo}"?`)) {
            return;
        }
        
        try {
            const result = await authSystem.makeRequest(`/cartelera/${id}`, null, 'DELETE');
            
            if (result.success) {
                alert('✅ Aviso eliminado correctamente');
                await this.cargarAvisos();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Error eliminando aviso:', error);
            alert('❌ Error al eliminar aviso: ' + error.message);
        }
    }

    mostrarMensajeModal(mensaje, tipo) {
        const msgDiv = document.getElementById('modalMessage');
        if (!msgDiv) return;
        
        msgDiv.textContent = mensaje;
        msgDiv.className = `message ${tipo}`;
        msgDiv.style.display = 'block';
        
        if (tipo === 'success') {
            setTimeout(() => {
                msgDiv.style.display = 'none';
            }, 2000);
        }
    }

    cerrarModal() {
        const modal = document.getElementById('avisoModal');
        if (modal) {
            modal.remove();
        }
    }

    setupEventListeners() {
        const crearBtn = document.getElementById('crearAvisoBtn');
        if (crearBtn) {
            crearBtn.addEventListener('click', () => {
                this.crearAviso();
            });
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.carteleraManager = new CarteleraManager();
});