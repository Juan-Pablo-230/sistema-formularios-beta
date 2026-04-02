console.log('admin.js cargado correctamente - MongoDB Version');

class AdminSystem {
    constructor() {
        this.inscripcionesData = [];
        this.usuariosData = [];
        this.filtroClaseActual = '';
        this.vistaActual = 'inscripciones';
        this.usuarioEditando = null;
        this.claseFiltradaActual = null;
        this.solicitudesMaterialHistoricoData = [];
    }

    verifyAdminAccess() {
        if (!authSystem.isLoggedIn()) {
            window.location.href = '/index.html';
            return false;
        }
        
        if (!authSystem.isAdmin() && !authSystem.isAdvancedUser()) {
            alert('No tienes permisos para acceder al panel de administración');
            window.location.href = '/index.html';
            return false;
        }
        
        return true;
    }

    async loadInscripciones() {
        try {
            console.log('📥 Cargando inscripciones desde MongoDB...');
            
            const result = await authSystem.makeRequest('/inscripciones', null, 'GET');
            this.inscripcionesData = result.data;
            
            console.log('✅ Inscripciones cargadas MongoDB:', this.inscripcionesData.length);
            
            if (this.inscripcionesData.length > 0) {
                console.log('📋 Lista de inscripciones:');
                this.inscripcionesData.forEach((insc, index) => {
                    console.log(`${index + 1}. ${insc.usuario?.apellidoNombre} - ${insc.clase}`);
                });
            } else {
                console.log('📭 No hay inscripciones registradas');
            }
            
            return this.inscripcionesData;
            
        } catch (error) {
            console.error('❌ Error cargando inscripciones MongoDB:', error);
            return [];
        }
    }

    async loadUsuarios() {
        try {
            const result = await authSystem.makeRequest('/admin/usuarios', null, 'GET');
            this.usuariosData = result.data;
            console.log('✅ Usuarios cargados MongoDB:', this.usuariosData.length);
            
            return this.usuariosData;
            
        } catch (error) {
            console.error('❌ Error cargando usuarios MongoDB:', error);
            return [];
        }
    }

    // Método para cargar solicitudes de material histórico (VERSIÓN MEJORADA)
    async loadSolicitudesMaterialHistorico() {
        try {
            console.log('📥 Cargando solicitudes de material histórico...');
            
            const user = authSystem.getCurrentUser();
            if (!user || !user._id) {
                console.error('❌ No hay usuario logueado');
                this.solicitudesMaterialHistoricoData = [];
                this.showMaterialHistoricoTable([]);
                return [];
            }
            
            console.log('👤 Usuario actual:', user._id);
            
            const result = await authSystem.makeRequest('/material-historico/solicitudes', null, 'GET');
            
            this.solicitudesMaterialHistoricoData = result.data || [];
            console.log('✅ Solicitudes de material histórico cargadas:', this.solicitudesMaterialHistoricoData.length);
            
            // Log para depuración - mostrar los datos cargados
            if (this.solicitudesMaterialHistoricoData.length > 0) {
                console.log('📋 Primera solicitud:', {
                    nombre: this.solicitudesMaterialHistoricoData[0].usuario?.apellidoNombre,
                    turno: this.solicitudesMaterialHistoricoData[0].usuario?.turno,
                    email: this.solicitudesMaterialHistoricoData[0].usuario?.email || this.solicitudesMaterialHistoricoData[0].email,
                    clase: this.solicitudesMaterialHistoricoData[0].claseNombre
                });
            }
            
            // Actualizar tabla si estamos en la vista correcta
            if (this.vistaActual === 'materialHistorico') {
                this.showMaterialHistoricoTable(this.solicitudesMaterialHistoricoData);
            }
            
            return this.solicitudesMaterialHistoricoData;
            
        } catch (error) {
            console.error('❌ Error cargando solicitudes de material histórico:', error);
            this.solicitudesMaterialHistoricoData = [];
            
            // Mostrar mensaje de error en la tabla
            if (this.vistaActual === 'materialHistorico') {
                const tbody = document.getElementById('materialHistoricoBody');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8" style="text-align: center; color: #ff6b6b; padding: 20px;">
                                ⚠️ Error al cargar las solicitudes. Asegúrate de que el servidor tenga las rutas de material histórico configuradas.
                            </td>
                        </tr>
                    `;
                }
            }
            
            return [];
        }
    }

    // Método para mostrar la tabla de material histórico (VERSIÓN MEJORADA)
    showMaterialHistoricoTable(solicitudes) {
        const tbody = document.getElementById('materialHistoricoBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (solicitudes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: #666; padding: 20px;">
                        No hay solicitudes de material histórico
                    </td>
                </tr>
            `;
            
            const totalEl = document.getElementById('totalSolicitudesHistorico');
            const clasesEl = document.getElementById('clasesDistintasHistorico');
            if (totalEl) totalEl.textContent = '0';
            if (clasesEl) clasesEl.textContent = '0';
            return;
        }

        // Ordenar por fecha más reciente
        solicitudes.sort((a, b) => 
            new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud)
        );

        // Calcular estadísticas
        const clasesUnicas = new Set(solicitudes.map(s => s.claseNombre)).size;
        const totalEl = document.getElementById('totalSolicitudesHistorico');
        const clasesEl = document.getElementById('clasesDistintasHistorico');
        if (totalEl) totalEl.textContent = solicitudes.length;
        if (clasesEl) clasesEl.textContent = clasesUnicas;

        solicitudes.forEach((solicitud, index) => {
            const row = document.createElement('tr');
            
            const fecha = solicitud.fechaSolicitud ? 
                new Date(solicitud.fechaSolicitud).toLocaleString('es-AR') : 
                'Fecha no disponible';
            
            const materialHTML = this.generarMaterialHistoricoHTML(solicitud);
            
            // Obtener turno del usuario (de la solicitud o del usuario anidado)
            let turno = 'No especificado';
            if (solicitud.turno) {
                turno = solicitud.turno;
            } else if (solicitud.usuario && solicitud.usuario.turno) {
                turno = solicitud.usuario.turno;
            }
            
            // Formatear turno para mostrar de manera más legible
            const turnoFormateado = this.formatearTurno(turno);
            
            // Obtener email para mailto
            let email = '';
            let emailDisplay = 'No disponible';
            
            if (solicitud.email) {
                email = solicitud.email;
                emailDisplay = `<a href="mailto:${email}" class="email-link" title="Enviar correo a ${email}">${email}</a>`;
            } else if (solicitud.usuario && solicitud.usuario.email) {
                email = solicitud.usuario.email;
                emailDisplay = `<a href="mailto:${email}" class="email-link" title="Enviar correo a ${email}">${email}</a>`;
            }
            
            // Obtener nombre y legajo
            const nombre = solicitud.usuario?.apellidoNombre || 'N/A';
            const legajo = solicitud.usuario?.legajo || 'N/A';
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${nombre}</td>
                <td>${legajo}</td>
                <td>${turnoFormateado}</td>
                <td>${solicitud.claseNombre || 'N/A'}</td>
                <td>${emailDisplay}</td>
                <td>${fecha}</td>
                <td>${materialHTML}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // Nuevo método auxiliar para formatear turnos
    formatearTurno(turno) {
        if (!turno || turno === 'No especificado') {
            return '<span style="color: #999; font-style: italic;">No especificado</span>';
        }
        
        // Mapa de colores para diferentes tipos de turno
        const coloresTurno = {
            'Turno mañana': { bg: '#e3f2fd', color: '#1565c0', icon: '🌅' },
            'Turno tarde': { bg: '#fff3e0', color: '#e65100', icon: '☀️' },
            'Turno noche A': { bg: '#e8eaf6', color: '#283593', icon: '🌙' },
            'Turno noche B': { bg: '#e8eaf6', color: '#1a237e', icon: '🌙' },
            'Turno intermedio': { bg: '#f3e5f5', color: '#6a1b9a', icon: '⏰' },
            'Turno SADOFE': { bg: '#ffebee', color: '#b71c1c', icon: '📅' }
        };
        
        const estilo = coloresTurno[turno] || { bg: '#f5f5f5', color: '#616161', icon: '👤' };
        
        return `
            <span style="
                display: inline-block;
                padding: 4px 10px;
                border-radius: 20px;
                background: ${estilo.bg};
                color: ${estilo.color};
                font-weight: 500;
                font-size: 0.9em;
                white-space: nowrap;
            ">
                ${estilo.icon} ${turno}
            </span>
        `;
    }

    // Método auxiliar para generar HTML de material (mejorado)
    generarMaterialHistoricoHTML(solicitud) {
        const enlaces = [];
        
        if (solicitud.youtube) {
            enlaces.push(`
                <a href="${solicitud.youtube}" 
                   target="_blank" 
                   class="email-link" 
                   title="Ver en YouTube"
                   style="
                       display: inline-flex;
                       align-items: center;
                       gap: 4px;
                       padding: 4px 8px;
                       background: #ff0000;
                       color: white;
                       border-radius: 4px;
                       text-decoration: none;
                       font-size: 0.85em;
                   ">
                    ▶️ YouTube
                </a>
            `);
        }
        
        if (solicitud.powerpoint) {
            enlaces.push(`
                <a href="${solicitud.powerpoint}" 
                   target="_blank" 
                   class="email-link" 
                   title="Ver presentación"
                   style="
                       display: inline-flex;
                       align-items: center;
                       gap: 4px;
                       padding: 4px 8px;
                       background: #d24726;
                       color: white;
                       border-radius: 4px;
                       text-decoration: none;
                       font-size: 0.85em;
                   ">
                    📊 PPT
                </a>
            `);
        }
        
        if (enlaces.length === 0) {
            return '<span style="color: #666; font-style: italic;">Material no disponible</span>';
        }
        
        return `<div style="display: flex; gap: 5px; flex-wrap: wrap;">${enlaces.join('')}</div>`;
    }

    // Método para cambiar a vista de material histórico
    cambiarVistaMaterialHistorico() {
        this.vistaActual = 'materialHistorico';
        
        // Limpiar contenedor antes de cargar
        const materialHistoricoBody = document.getElementById('materialHistoricoBody');
        if (materialHistoricoBody) {
            materialHistoricoBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: #666; padding: 20px;">
                        Cargando solicitudes de material histórico...
                    </td>
                </tr>
            `;
        }
        
        // Mostrar datos
        this.showMaterialHistoricoTable(this.solicitudesMaterialHistoricoData);
    }

    async initMaterialData() {
        try {
            console.log('🔄 Inicializando datos de material...');
            console.log('✅ Sistema de material listo para usar');
            return true;
            
        } catch (error) {
            console.error('❌ Error inicializando material:', error);
            return false;
        }
    }

    mostrarModalCambioPassword(legajo) {
        const usuario = this.usuariosData.find(u => u.legajo.toString() === legajo.toString());
        if (!usuario) {
            alert('Usuario no encontrado');
            return;
        }

        const modalHTML = `
            <div class="modal-overlay" id="changePasswordModal">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2>🔐 Cambiar Contraseña</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <form id="changePasswordForm" class="modal-form">
                        <input type="hidden" id="changePasswordUserId" value="${usuario._id}">
                        
                        <div class="user-info-preview">
                            <h4>Información del Usuario</h4>
                            <div class="info-grid">
                                <div class="info-item">
                                    <label>Nombre:</label>
                                    <div class="info-value">${usuario.apellidoNombre || 'N/A'}</div>
                                </div>
                                <div class="info-item">
                                    <label>Legajo:</label>
                                    <div class="info-value">${usuario.legajo || 'N/A'}</div>
                                </div>
                                <div class="info-item">
                                    <label>Email:</label>
                                    <div class="info-value">${usuario.email || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="newPassword">Nueva Contraseña *</label>
                            <div style="position: relative;">
                                <input type="password" id="newPassword" name="newPassword" required 
                                       placeholder="Ingrese la nueva contraseña" minlength="6">
                                <button type="button" class="toggle-password" style="
                                    position: absolute;
                                    right: 10px;
                                    top: 50%;
                                    transform: translateY(-50%);
                                    background: none;
                                    border: none;
                                    cursor: pointer;
                                    color: var(--text-muted);
                                    font-size: 14px;
                                ">👁️</button>
                            </div>
                            <small class="field-info">Mínimo 6 caracteres</small>
                        </div>

                        <div class="form-group">
                            <label for="confirmNewPassword">Confirmar Nueva Contraseña *</label>
                            <div style="position: relative;">
                                <input type="password" id="confirmNewPassword" name="confirmNewPassword" required 
                                       placeholder="Confirme la nueva contraseña">
                                <button type="button" class="toggle-password" style="
                                    position: absolute;
                                    right: 10px;
                                    top: 50%;
                                    transform: translateY(-50%);
                                    background: none;
                                    border: none;
                                    cursor: pointer;
                                    color: var(--text-muted);
                                    font-size: 14px;
                                ">👁️</button>
                            </div>
                        </div>

                        <div class="password-info">
                            <div class="password-notice">
                                <h4>⚠️ Información Importante</h4>
                                <p>• El usuario deberá usar esta contraseña para iniciar sesión</p>
                                <p>• Se recomienda usar una contraseña temporal que el usuario cambie después</p>
                                <p>• Notifique al usuario sobre el cambio de contraseña</p>
                            </div>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="submit-btn">💾 Cambiar Contraseña</button>
                            <button type="button" class="cancel-btn">❌ Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('changePasswordModal');
        if (existingModal) {
            existingModal.remove();
        }

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('changePasswordModal');

        const closeModal = () => modal.remove();
        
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Toggle password visibility
        modal.querySelectorAll('.toggle-password').forEach(button => {
            button.addEventListener('click', function() {
                const input = this.parentElement.querySelector('input');
                if (input.type === 'password') {
                    input.type = 'text';
                    this.textContent = '🙈';
                } else {
                    input.type = 'password';
                    this.textContent = '👁️';
                }
            });
        });

        modal.querySelector('#changePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.cambiarPasswordUsuario(usuario._id);
        });

        modal.style.display = 'flex';
    }

    async cambiarPasswordUsuario(usuarioId) {
        const form = document.getElementById('changePasswordForm');
        const formData = new FormData(form);
        
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmNewPassword');

        // Validaciones
        if (newPassword.length < 6) {
            this.mostrarMensajeModal('❌ La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.mostrarMensajeModal('❌ Las contraseñas no coinciden', 'error');
            return;
        }

        try {
            const result = await authSystem.makeRequest(
                `/admin/usuarios/${usuarioId}/password`,
                { newPassword: newPassword },
                'PUT'
            );

            this.mostrarMensajeModal('✅ Contraseña cambiada correctamente', 'success');
            
            setTimeout(() => {
                document.getElementById('changePasswordModal').remove();
            }, 2000);

        } catch (error) {
            console.error('❌ Error cambiando contraseña:', error);
            this.mostrarMensajeModal('❌ Error al cambiar contraseña: ' + error.message, 'error');
        }
    }

    mostrarMensajeModal(mensaje, tipo) {
        const form = document.getElementById('changePasswordForm');
        let messageDiv = form.querySelector('.message-modal');
        
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.className = 'message-modal';
            form.insertBefore(messageDiv, form.firstChild);
        }
        
        messageDiv.textContent = mensaje;
        messageDiv.style.cssText = `
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 15px;
            text-align: center;
            font-weight: bold;
            ${tipo === 'error' ? 
                'background: #ffebee; color: #c62828; border: 1px solid #ffcdd2;' : 
                'background: #e8f5e8; color: #2e7d32; border: 1px solid #c8e6c9;'
            }
        `;

        if (tipo === 'success') {
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 3000);
        }
    }

    obtenerClasesUnicas(inscripciones) {
        const clases = [...new Set(inscripciones.map(insc => insc.clase).filter(Boolean))];
        console.log('📚 Clases únicas encontradas:', clases);
        return clases;
    }

    aplicarFiltrosCombinados(inscripciones) {
        let inscripcionesFiltradas = inscripciones;
        
        this.claseFiltradaActual = null;
        
        if (this.filtroClaseActual !== 'todas') {
            inscripcionesFiltradas = inscripcionesFiltradas.filter(insc => insc.clase === this.filtroClaseActual);
            this.claseFiltradaActual = this.filtroClaseActual;
        }
        
        console.log(`🔍 Filtros aplicados - Clase: "${this.filtroClaseActual}" - Resultados: ${inscripcionesFiltradas.length}`);
        return inscripcionesFiltradas;
    }

    crearInterfazFiltros(inscripciones) {
        const clases = this.obtenerClasesUnicas(inscripciones);
        
        const filtroContainer = document.getElementById('filtroContainer');
        if (!filtroContainer) return;
        
        // Limpiar pero NO eliminar el contenedor
        filtroContainer.innerHTML = '';
        
        if (clases.length > 0) {
            const selectClase = document.createElement('select');
            selectClase.id = 'filtroClase';
            selectClase.className = 'filtro-select';
            selectClase.innerHTML = `
                <option value="">Seleccione una clase:</option>
                <option value="todas" ${this.filtroClaseActual === 'todas' ? 'selected' : ''}>Todas las clases</option>
                ${clases.map(clase => `<option value="${clase}" ${this.filtroClaseActual === clase ? 'selected' : ''}>${clase}</option>`).join('')}
            `;
            
            selectClase.addEventListener('change', (e) => {
                this.filtroClaseActual = e.target.value;
                this.actualizarVistaConFiltros();
                this.actualizarBotonImprimir();
            });
            
            filtroContainer.appendChild(selectClase);
        }
            
        const imprimirContainer = document.createElement('div');
        imprimirContainer.id = 'imprimirContainer';
        imprimirContainer.style.display = 'none';
        imprimirContainer.style.marginLeft = 'auto';
        
        const imprimirBtn = document.createElement('button');
        imprimirBtn.id = 'imprimirPlanillaBtn';
        imprimirBtn.className = 'btn btn-primary';
        imprimirBtn.innerHTML = '🖨️ Imprimir planilla de asistencia';
        imprimirBtn.addEventListener('click', () => {
            this.imprimirPlanillaAsistencia();
        });
        
        imprimirContainer.appendChild(imprimirBtn);
        filtroContainer.appendChild(imprimirContainer);
        
        this.actualizarBotonImprimir();
    }

    actualizarBotonImprimir() {
        const imprimirContainer = document.getElementById('imprimirContainer');
        if (!imprimirContainer) return;
        
        const tienePermisos = authSystem.isAdmin() || authSystem.isAdvancedUser();
        const hayClaseFiltrada = this.filtroClaseActual !== 'todas';
        
        if (tienePermisos && hayClaseFiltrada) {
            imprimirContainer.style.display = 'block';
        } else {
            imprimirContainer.style.display = 'none';
        }
    }

    imprimirPlanillaAsistencia() {
        if (!this.claseFiltradaActual) {
            alert('No hay una clase específica seleccionada para imprimir');
            return;
        }
        
        const inscripcionesFiltradas = this.aplicarFiltrosCombinados(this.inscripcionesData);
        
        if (inscripcionesFiltradas.length === 0) {
            alert('No hay inscripciones para la clase seleccionada');
            return;
        }
        
        const ventanaImpresion = window.open('', '_blank');
        const fechaActual = new Date().toLocaleDateString('es-AR');
        const nombreClase = this.claseFiltradaActual;
        
        // Obtener todas las páginas
        const paginas = this.generarFilasPlanilla(inscripcionesFiltradas);
        
        // Generar contenido HTML para todas las páginas
        let contenidoHTML = '';
        
        paginas.forEach((pagina, index) => {
            contenidoHTML += `
                <div class="pagina" style="page-break-after: ${index < paginas.length - 1 ? 'always' : 'avoid'};">
                    <div class="header">
                        <h1>PLANILLA DE ASISTENCIA - PÁGINA ${pagina.pagina}/${pagina.totalPaginas}</h1>
                        <h2>${nombreClase}</h2>
                    </div>
                    
                    <div class="info-section">
                        <div><strong>Fecha de impresión:</strong> ${fechaActual}</div>
                        <div><strong>Inscriptos en esta página:</strong> ${pagina.inicioNumero}-${pagina.finNumero} de ${inscripcionesFiltradas.length}</div>
                        <div><strong>Total general:</strong> ${inscripcionesFiltradas.length} inscriptos</div>
                    </div>
                    
                    <div class="planilla-container">
                        <div class="columna">
                            <div class="columna-header">COLUMNA A</div>
                            ${pagina.primeraColumna}
                        </div>
                        
                        <div class="columna">
                            <div class="columna-header">COLUMNA B</div>
                            ${pagina.segundaColumna}
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>Página ${pagina.pagina} de ${pagina.totalPaginas} - Sistema de Asistencia MongoDB</p>
                    </div>
                </div>
            `;
        });
        
        ventanaImpresion.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Planilla de Asistencia - ${nombreClase}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 20px; 
                        color: #333;
                        font-size: 12px;
                    }
                    .pagina {
                        margin-bottom: 30px;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 20px; 
                        border-bottom: 2px solid #333; 
                        padding-bottom: 15px; 
                    }
                    .header h1 { 
                        margin: 0; 
                        font-size: 18px; 
                        color: #2c3e50; 
                    }
                    .header h2 { 
                        margin: 5px 0 0 0; 
                        font-size: 14px; 
                        color: #7f8c8d; 
                    }
                    .info-section { 
                        margin-bottom: 15px; 
                        display: flex; 
                        justify-content: space-between; 
                        font-size: 11px;
                        flex-wrap: wrap;
                    }
                    .planilla-container { 
                        display: grid; 
                        grid-template-columns: 1fr 1fr; 
                        gap: 15px;
                        min-height: 500px;
                    }
                    .columna { 
                        border: 1px solid #333; 
                    }
                    .columna-header { 
                        background-color: #34495e; 
                        color: white; 
                        padding: 8px; 
                        text-align: center; 
                        font-weight: bold; 
                        border-bottom: 1px solid #333;
                        font-size: 11px;
                    }
                    .fila { 
                        display: grid; 
                        grid-template-columns: 1fr 60px;
                        border-bottom: 1px solid #ddd; 
                        min-height: 24px;
                    }
                    .fila:last-child { border-bottom: none; }
                    .nombre { 
                        padding: 6px 8px;
                        border-right: 1px solid #ddd;
                        font-size: 11px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .asistencia { 
                        padding: 6px; 
                        text-align: center; 
                        background-color: #f8f9fa; 
                        border: 1px solid #e74c3c;
                        font-size: 11px;
                    }
                    .footer { 
                        margin-top: 20px; 
                        text-align: center; 
                        font-size: 10px; 
                        color: #7f8c8d; 
                    }
                    @media print {
                        body { 
                            margin: 10mm;
                            font-size: 10px;
                        }
                        .no-print { display: none; }
                        .planilla-container { 
                            break-inside: avoid;
                            gap: 10mm;
                        }
                        .columna {
                            break-inside: avoid;
                        }
                        .fila {
                            min-height: 20px;
                        }
                        .nombre, .asistencia {
                            padding: 4px 6px;
                        }
                    }
                    @page { 
                        size: A4; 
                        margin: 15mm;
                    }
                </style>
            </head>
            <body>
                ${contenidoHTML}
                
                <div class="no-print" style="text-align: center; margin-top: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #2c3e50; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Imprimir todas las páginas</button>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">❌ Cerrar</button>
                </div>
                
                <script>
                    window.onload = function() { 
                        window.focus();
                        const filasVacias = document.querySelectorAll('.nombre:empty');
                        filasVacias.forEach(fila => {
                            fila.parentElement.style.minHeight = '24px';
                        });
                    };
                <\/script>
            </body>
            </html>
        `);
        
        ventanaImpresion.document.close();
    }

    generarFilasPlanilla(inscripciones) {
        const MAX_FILAS_POR_PAGINA = 25;
        const COLUMNAS_POR_PAGINA = 2;
        
        const maxFilasPorColumna = Math.ceil(MAX_FILAS_POR_PAGINA / COLUMNAS_POR_PAGINA);
        const totalPaginas = Math.ceil(inscripciones.length / MAX_FILAS_POR_PAGINA);
        
        const paginas = [];
        
        for (let pagina = 0; pagina < totalPaginas; pagina++) {
            const inicio = pagina * MAX_FILAS_POR_PAGINA;
            const fin = Math.min(inicio + MAX_FILAS_POR_PAGINA, inscripciones.length);
            const inscripcionesPagina = inscripciones.slice(inicio, fin);
            
            const mitad = Math.ceil(inscripcionesPagina.length / COLUMNAS_POR_PAGINA);
            const primeraMitad = inscripcionesPagina.slice(0, mitad);
            const segundaMitad = inscripcionesPagina.slice(mitad);
            
            let primeraColumna = primeraMitad.map((insc, index) => {
                const numeroGlobal = inicio + index + 1;
                return `
                    <div class="fila">
                        <div class="nombre">${numeroGlobal}. ${insc.usuario?.apellidoNombre || 'N/A'}</div>
                        <div class="asistencia"></div>
                    </div>
                `;
            }).join('');
            
            let segundaColumna = segundaMitad.map((insc, index) => {
                const numeroGlobal = inicio + mitad + index + 1;
                return `
                    <div class="fila">
                        <div class="nombre">${numeroGlobal}. ${insc.usuario?.apellidoNombre || 'N/A'}</div>
                        <div class="asistencia"></div>
                    </div>
                `;
            }).join('');
            
            const diferencia = primeraMitad.length - segundaMitad.length;
            if (diferencia > 0) {
                for (let i = 0; i < diferencia; i++) {
                    segundaColumna += `
                        <div class="fila">
                            <div class="nombre"></div>
                            <div class="asistencia"></div>
                        </div>
                    `;
                }
            }
            
            paginas.push({
                pagina: pagina + 1,
                totalPaginas: totalPaginas,
                primeraColumna: primeraColumna,
                segundaColumna: segundaColumna,
                inicioNumero: inicio + 1,
                finNumero: fin,
                totalInscripcionesPagina: inscripcionesPagina.length
            });
        }
        
        return paginas;
    }

    actualizarVistaConFiltros() {
        if (this.vistaActual === 'inscripciones') {
            const inscripcionesFiltradas = this.aplicarFiltrosCombinados(this.inscripcionesData);
            this.showStats(inscripcionesFiltradas);
            this.showInscripcionesTable(inscripcionesFiltradas);
            this.actualizarBotonImprimir();
            
            const totalInscripciones = this.inscripcionesData.length;
            const inscripcionesFiltradasCount = inscripcionesFiltradas.length;
            const contadorResultados = document.getElementById('contadorResultados');
            
            if (contadorResultados) {
                if (this.filtroClaseActual !== 'todas') {
                    contadorResultados.textContent = 
                        `Mostrando ${inscripcionesFiltradasCount} de ${totalInscripciones} inscripciones`;
                } else {
                    contadorResultados.textContent = 
                        `${totalInscripciones} inscripciones en total`;
                }
            }
        }
    }

    showStats(inscripciones) {
        console.log('📊 Mostrando estadísticas MongoDB para:', inscripciones.length, 'inscripciones');
        
        const stats = {
            total: inscripciones.length,
            porClase: {},
            porTurno: {},
        };

        inscripciones.forEach(insc => {
            if (insc.clase) {
                stats.porClase[insc.clase] = (stats.porClase[insc.clase] || 0) + 1;
            }
            
            if (insc.turno) {
                stats.porTurno[insc.turno] = (stats.porTurno[insc.turno] || 0) + 1;
            }
            
        });

        const totalInscripcionesEl = document.getElementById('totalInscripciones');
        if (totalInscripcionesEl) totalInscripcionesEl.textContent = stats.total;
        
        console.log('📈 Estadísticas calculadas MongoDB:', stats);
    }

    showInscripcionesTable(inscripciones) {
        const tbody = document.getElementById('inscripcionesBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        console.log('🔄 Actualizando tabla con MongoDB:', inscripciones.length, 'inscripciones');

        if (inscripciones.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: #666; padding: 20px;">
                        No hay inscripciones registradas ${this.filtroClaseActual !== 'todas' ? 'con los filtros aplicados' : ''}
                    </td>
                </tr>
            `;
            return;
        }

        inscripciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        inscripciones.forEach((insc, index) => {
            const fecha = insc.fecha ? new Date(insc.fecha).toLocaleString('es-AR') : 'Fecha no disponible';
            const row = document.createElement('tr');
            
            const emailLink = insc.usuario?.email ? 
                `<a href="mailto:${insc.usuario.email}" class="email-link">${insc.usuario.email}</a>` : 
                'N/A';
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${insc.usuario?.apellidoNombre || 'N/A'}</td>
                <td>${insc.usuario?.legajo || 'N/A'}</td>
                <td>${insc.clase || 'N/A'}</td>
                <td>${insc.turno || 'N/A'}</td>
                <td>${emailLink}</td>
                <td>${fecha}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        console.log('✅ Tabla actualizada correctamente MongoDB');
    }

    showUsuariosTable(usuarios) {
        const tbody = document.getElementById('usuariosBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: #666; padding: 20px;">
                        No hay usuarios registrados
                    </td>
                </tr>
            `;
            return;
        }

        usuarios.sort((a, b) => {
            if (a.fechaRegistro && b.fechaRegistro) {
                return new Date(b.fechaRegistro) - new Date(a.fechaRegistro);
            }
            return (a.apellidoNombre || '').localeCompare(b.apellidoNombre || '');
        });

        usuarios.forEach((usuario, index) => {
            const row = document.createElement('tr');
            
            const fechaRegistro = usuario.fechaRegistro ? 
                new Date(usuario.fechaRegistro).toLocaleString('es-AR') : 
                'No registrada';
                
            const esAdmin = authSystem.isAdmin();
            const acciones = esAdmin ? `
                <div class="user-actions-stacked">
                    <select class="role-select" data-legajo="${usuario.legajo}">
                        <option value="user" ${usuario.role === 'user' ? 'selected' : ''}>Usuario Estándar</option>
                        <option value="advanced" ${usuario.role === 'advanced' ? 'selected' : ''}>Usuario Avanzado</option>
                        <option value="admin" ${usuario.role === 'admin' ? 'selected' : ''}>Administrador</option>
                    </select>
                    <div class="action-buttons">
                        <button class="btn-small btn-password change-password" data-legajo="${usuario.legajo}" title="Cambiar contraseña">🔐</button>
                        <button class="btn-small btn-edit edit-user" data-legajo="${usuario.legajo}" title="Editar datos del usuario">✏️</button>
                        <button class="btn-small btn-danger delete-user" data-legajo="${usuario.legajo}" title="Eliminar usuario">🗑️</button>
                    </div>
                </div>
            ` : (authSystem.isAdvancedUser() ? `
                <div class="user-actions-stacked">
                    <select class="role-select" data-legajo="${usuario.legajo}">
                        <option value="user" ${usuario.role === 'user' ? 'selected' : ''}>Usuario Estándar</option>
                        <option value="advanced" ${usuario.role === 'advanced' ? 'selected' : ''}>Usuario Avanzado</option>
                        <option value="admin" ${usuario.role === 'admin' ? 'selected' : ''} disabled>Administrador</option>
                    </select>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit edit-user" data-legajo="${usuario.legajo}" title="Editar datos del usuario">✏️</button>
                        <span class="read-only">Solo lectura</span>
                    </div>
                </div>
            ` : '<span class="read-only">Solo lectura</span>');
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${usuario.apellidoNombre || 'N/A'}</td>
                <td>${usuario.legajo || 'N/A'}</td>
                <td>${usuario.email || 'N/A'}</td>
                <td>${usuario.turno || 'N/A'}</td>
                <td><span class="role-badge ${usuario.role || 'user'}">${authSystem.getUserRoleText(usuario.role || 'user')}</span></td>
                <td>${fechaRegistro}</td>
                <td>${acciones}</td>
            `;
            
            tbody.appendChild(row);
        });

        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.cambiarRolUsuario(e.target.dataset.legajo, e.target.value);
            });
        });

        document.querySelectorAll('.edit-user').forEach(button => {
            button.addEventListener('click', (e) => {
                this.mostrarModalEdicion(e.target.dataset.legajo);
            });
        });

        document.querySelectorAll('.delete-user').forEach(button => {
            button.addEventListener('click', (e) => {
                this.eliminarUsuario(e.target.dataset.legajo);
            });
        });

        document.querySelectorAll('.change-password').forEach(button => {
            button.addEventListener('click', (e) => {
                this.mostrarModalCambioPassword(e.target.dataset.legajo);
            });
        });
    }

    async cambiarRolUsuario(legajo, nuevoRol) {
        if (!authSystem.isAdmin() && !authSystem.isAdvancedUser()) {
            alert('Solo los administradores y usuarios avanzados pueden cambiar roles de usuario');
            return;
        }

        try {
            if (!authSystem.isAdmin() && nuevoRol === 'admin') {
                alert('❌ Solo los administradores pueden asignar el rol de administrador');
                return;
            }

            const usuario = this.usuariosData.find(u => u.legajo.toString() === legajo.toString());
            if (!usuario) {
                throw new Error('Usuario no encontrado');
            }

            const currentUser = authSystem.getCurrentUser();
            if (usuario.legajo === currentUser.legajo && nuevoRol !== 'admin') {
                alert('No puedes quitarte tus propios permisos de administrador');
                return;
            }

            const result = await authSystem.makeRequest(
                `/admin/usuarios/${usuario._id}/rol`,
                { role: nuevoRol },
                'PUT'
            );

            alert(`✅ Rol actualizado correctamente para ${usuario.apellidoNombre} (Legajo: ${legajo})`);
            this.loadUsuarios().then(usuarios => this.showUsuariosTable(usuarios));

        } catch (error) {
            console.error('❌ Error cambiando rol MongoDB:', error);
            alert('❌ Error al cambiar el rol: ' + error.message);
        }
    }

    async eliminarUsuario(legajo) {
        if (!authSystem.isAdmin()) {
            alert('Solo los administradores pueden eliminar usuarios');
            return;
        }

        const usuario = this.usuariosData.find(u => u.legajo.toString() === legajo.toString());
        if (!usuario) {
            alert('Usuario no encontrado');
            return;
        }

        const currentUser = authSystem.getCurrentUser();
        if (usuario.legajo === currentUser.legajo) {
            alert('No puedes eliminarte a ti mismo');
            return;
        }

        if (!confirm(`¿Está seguro de que desea eliminar al usuario ${usuario.apellidoNombre} (Legajo: ${legajo})? Esta acción no se puede deshacer.`)) {
            return;
        }

        try {
            const result = await authSystem.makeRequest(
                `/admin/usuarios/${usuario._id}`,
                null,
                'DELETE'
            );

            alert(`✅ Usuario ${usuario.apellidoNombre} eliminado correctamente`);
            this.loadUsuarios().then(usuarios => this.showUsuariosTable(usuarios));

        } catch (error) {
            console.error('❌ Error eliminando usuario MongoDB:', error);
            alert('❌ Error al eliminar usuario: ' + error.message);
        }
    }

    mostrarModalCreacion() {
        const modalHTML = `
            <div class="modal-overlay" id="createUserModal">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2>➕ Crear Nuevo Usuario</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <form id="createUserForm" class="modal-form">
                        <div class="form-group">
                            <label for="createApellidoNombre">Apellido y Nombre *</label>
                            <input type="text" id="createApellidoNombre" name="apellidoNombre" required>
                        </div>
                        <div class="form-group">
                            <label for="createLegajo">Número de Legajo *</label>
                            <input type="number" id="createLegajo" name="legajo" required>
                        </div>
                        <div class="form-group">
                            <label for="createEmail">Correo Electrónico *</label>
                            <input type="email" id="createEmail" name="email" required>
                        </div>
                        <div class="form-group">
                            <label for="createTurno">Turno de Trabajo *</label>
                            <select id="createTurno" name="turno" required>
                                <option value="">Seleccione turno</option>
                                <option value="Turno mañana">Turno mañana</option>
                                <option value="Turno tarde">Turno tarde</option>
                                <option value="Turno noche A">Turno noche A</option>
                                <option value="Turno noche B">Turno noche B</option>
                                <option value="Turno intermedio">Turno intermedio</option>
                                <option value="Turno SADOFE">Sábado, Domingo y feriado</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="createRole">Rol *</label>
                            <select id="createRole" name="role" required>
                                <option value="user">Usuario Estándar</option>
                                <option value="advanced">Usuario Avanzado</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="createPassword">Contraseña Temporal *</label>
                            <input type="password" id="createPassword" name="password" value="temp123" required>
                            <small>El usuario podrá cambiar esta contraseña después</small>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="submit-btn">💾 Crear Usuario</button>
                            <button type="button" class="cancel-btn">❌ Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('createUserModal');
        if (existingModal) {
            existingModal.remove();
        }

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('createUserModal');

        const closeModal = () => modal.remove();
        
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('#createUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.crearUsuarioDesdeModal();
        });

        modal.style.display = 'flex';
    }

    async crearUsuarioDesdeModal() {
        const form = document.getElementById('createUserForm');
        const formData = new FormData(form);
        
        const userData = {
            apellidoNombre: formData.get('apellidoNombre'),
            legajo: formData.get('legajo'),
            email: formData.get('email'),
            turno: formData.get('turno'),
            role: formData.get('role'),
            password: formData.get('password') || 'temp123'
        };

        try {
            const result = await authSystem.makeRequest('/admin/usuarios', userData);
            
            if (result.success) {
                alert('✅ Usuario creado exitosamente');
                document.getElementById('createUserModal').remove();
                
                const usuarios = await this.loadUsuarios();
                this.showUsuariosTable(usuarios);
            }
        } catch (error) {
            console.error('❌ Error creando usuario:', error);
            alert('❌ Error al crear usuario: ' + error.message);
        }
    }

    mostrarModalEdicion(legajo) {
        const usuario = this.usuariosData.find(u => u.legajo.toString() === legajo.toString());
        if (!usuario) {
            alert('Usuario no encontrado');
            return;
        }

        const modalHTML = `
            <div class="modal-overlay" id="editUserModal">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2>✏️ Editar Usuario</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <form id="editUserForm" class="modal-form">
                        <input type="hidden" id="editUserId" value="${usuario._id}">
                        <div class="form-group">
                            <label for="editApellidoNombre">Apellido y Nombre *</label>
                            <input type="text" id="editApellidoNombre" name="apellidoNombre" value="${usuario.apellidoNombre || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="editLegajo">Número de Legajo *</label>
                            <input type="number" id="editLegajo" name="legajo" value="${usuario.legajo || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="editEmail">Correo Electrónico *</label>
                            <input type="email" id="editEmail" name="email" value="${usuario.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="editTurno">Turno de Trabajo *</label>
                            <select id="editTurno" name="turno" required>
                                <option value="">Seleccione turno</option>
                                <option value="Turno mañana" ${usuario.turno === 'Turno mañana' ? 'selected' : ''}>Turno mañana</option>
                                <option value="Turno tarde" ${usuario.turno === 'Turno tarde' ? 'selected' : ''}>Turno tarde</option>
                                <option value="Turno noche A" ${usuario.turno === 'Turno noche A' ? 'selected' : ''}>Turno noche A</option>
                                <option value="Turno noche B" ${usuario.turno === 'Turno noche B' ? 'selected' : ''}>Turno noche B</option>
                                <option value="Turno intermedio" ${usuario.turno === 'Turno intermedio' ? 'selected' : ''}>Turno intermedio</option>
                                <option value="Turno SADOFE" ${usuario.turno === 'Turno SADOFE' ? 'selected' : ''}>Sábado, Domingo y feriado</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="submit-btn">💾 Guardar Cambios</button>
                            <button type="button" class="cancel-btn">❌ Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('editUserModal');
        if (existingModal) {
            existingModal.remove();
        }

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('editUserModal');

        const closeModal = () => modal.remove();
        
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('#editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.actualizarUsuarioDesdeModal(usuario._id);
        });

        modal.style.display = 'flex';
    }

    async actualizarUsuarioDesdeModal(usuarioId) {
        const form = document.getElementById('editUserForm');
        const formData = new FormData(form);
        
        const userData = {
            apellidoNombre: formData.get('apellidoNombre'),
            legajo: formData.get('legajo'),
            email: formData.get('email'),
            turno: formData.get('turno')
        };

        // Validaciones básicas
        if (!userData.apellidoNombre || !userData.legajo || !userData.email || !userData.turno) {
            alert('❌ Todos los campos son obligatorios');
            return;
        }

        try {
            const result = await authSystem.makeRequest(
                `/admin/usuarios/${usuarioId}`,
                userData,
                'PUT'
            );

            if (result.success) {
                alert('✅ Usuario actualizado correctamente');
                document.getElementById('editUserModal').remove();
                
                const usuarios = await this.loadUsuarios();
                this.showUsuariosTable(usuarios);
            }
        } catch (error) {
            console.error('❌ Error actualizando usuario:', error);
            alert('❌ Error al actualizar usuario: ' + error.message);
        }
    }

    cambiarVista(vista) {
        this.vistaActual = vista;
        
        const inscripcionesSection = document.getElementById('inscripcionesSection');
        const usuariosSection = document.getElementById('usuariosSection');
        const materialHistoricoSection = document.getElementById('materialHistoricoSection');
        const gestionClasesVisualSection = document.getElementById('gestionClasesVisualSection');
        
        const statsInscripciones = document.getElementById('statsInscripciones');
        const statsUsuarios = document.getElementById('statsUsuarios');
        
        // Filtros que deben mantenerse
        const filtrosInscripciones = document.getElementById('filtrosInscripciones');
        
        const btnInscripciones = document.getElementById('btnInscripciones');
        const btnUsuarios = document.getElementById('btnUsuarios');
        const btnMaterialHistorico = document.getElementById('btnMaterialHistorico');
        const btnGestionClasesVisual = document.getElementById('btnGestionClasesVisual');
        
        // Resetear todas las vistas
        [inscripcionesSection, usuariosSection, materialHistoricoSection, gestionClasesVisualSection].forEach(section => {
            if (section) section.style.display = 'none';
        });
        
        [statsInscripciones, statsUsuarios].forEach(stats => {
            if (stats) stats.style.display = 'none';
        });
        
        // Ocultar filtros
        if (filtrosInscripciones) filtrosInscripciones.style.display = 'none';
        
        [btnInscripciones, btnUsuarios, btnMaterialHistorico, btnGestionClasesVisual].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        
        if (vista === 'inscripciones') {
            inscripcionesSection.style.display = 'block';
            statsInscripciones.style.display = 'grid';
            filtrosInscripciones.style.display = 'flex';
            btnInscripciones.classList.add('active');
            this.actualizarVistaConFiltros();
            
        } else if (vista === 'usuarios') {
            usuariosSection.style.display = 'block';
            statsUsuarios.style.display = 'grid';
            btnUsuarios.classList.add('active');
            
            const totalUsuarios = this.usuariosData.length;
            const admins = this.usuariosData.filter(u => u.role === 'admin').length;
            const avanzados = this.usuariosData.filter(u => u.role === 'advanced').length;
            const estandar = this.usuariosData.filter(u => u.role === 'user' || !u.role).length;
            
            const totalEl = document.getElementById('totalUsuarios');
            const adminEl = document.getElementById('usuariosAdmin');
            const avanzadosEl = document.getElementById('usuariosAvanzados');
            const estandarEl = document.getElementById('usuariosEstandar');
            
            if (totalEl) totalEl.textContent = totalUsuarios;
            if (adminEl) adminEl.textContent = admins;
            if (avanzadosEl) avanzadosEl.textContent = avanzados;
            if (estandarEl) estandarEl.textContent = estandar;
            
        } else if (vista === 'materialHistorico') {
            materialHistoricoSection.style.display = 'block';
            btnMaterialHistorico.classList.add('active');
            this.cambiarVistaMaterialHistorico();
            
            // Inicializar Material Historico si es necesario
            if (typeof MaterialHistorico !== 'undefined' && !window.materialHistorico) {
                window.materialHistorico = new MaterialHistorico();
            }
        } else if (vista === 'gestionClasesVisual') {
            gestionClasesVisualSection.style.display = 'block';
            btnGestionClasesVisual.classList.add('active');
            
            // Inicializar Gestión Visual si es necesario
            if (typeof GestionClasesVisual !== 'undefined' && !window.gestionClasesVisual) {
                window.gestionClasesVisual = new GestionClasesVisual();
            }
        }
    }

    exportToCSV(inscripciones) {
        const inscripcionesAExportar = this.aplicarFiltrosCombinados(inscripciones);
        
        if (inscripcionesAExportar.length === 0) {
            alert('No hay datos para exportar con los filtros actuales');
            return;
        }

        // Obtener nombre de la clase para el archivo
        let nombreClaseArchivo = 'todas_las_clases';
        let nombreClaseMostrar = 'Todas las clases';
        
        // Si hay una clase filtrada, usarla para el nombre
        if (this.filtroClaseActual && this.filtroClaseActual !== 'todas') {
            nombreClaseMostrar = this.filtroClaseActual;
            
            // Limpiar el nombre para que sea válido como nombre de archivo
            nombreClaseArchivo = this.filtroClaseActual
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
                .replace(/[^a-z0-9\s]/gi, '') // Quitar caracteres especiales
                .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
                .substring(0, 50); // Limitar longitud
        }

        const headers = ['Apellido y Nombre', 'Legajo', 'Clase', 'Turno', 'Email', 'Fecha'];
        const csvData = [
            headers.join(','),
            ...inscripcionesAExportar.map(insc => [
                `"${insc.usuario?.apellidoNombre || ''}"`,
                `"${insc.usuario?.legajo || ''}"`,
                `"${insc.clase || ''}"`,
                `"${insc.turno || ''}"`,
                `"${insc.usuario?.email || ''}"`,
                `"${insc.fecha ? new Date(insc.fecha).toLocaleString('es-AR') : ''}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        // Crear nombre de archivo CON EL NOMBRE DE LA CLASE
        const fecha = new Date().toISOString().split('T')[0];
        const nombreArchivo = `inscripciones_${nombreClaseArchivo}_${fecha}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', nombreArchivo);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`✅ CSV exportado exitosamente:\n📄 ${nombreArchivo}\n📊 ${inscripcionesAExportar.length} registros\n🏫 ${nombreClaseMostrar}`);
    }
    
    async init() {
        console.log('🚀 Inicializando admin system MongoDB...');
        
        if (!this.verifyAdminAccess()) {
            return;
        }
        
        const user = authSystem.getCurrentUser();
        const adminNameEl = document.getElementById('adminName');
        const adminEmailEl = document.getElementById('adminEmail');
        const roleElement = document.getElementById('adminRole');
        
        if (adminNameEl) adminNameEl.textContent = user.apellidoNombre;
        if (adminEmailEl) adminEmailEl.textContent = user.email;
        
        if (roleElement) {
            roleElement.textContent = authSystem.getUserRoleText(user.role);
            roleElement.className = `admin-role-badge role-${user.role}`;
        }
        
        const inscripciones = await this.loadInscripciones();
        const usuarios = await this.loadUsuarios();
        
        this.crearInterfazFiltros(inscripciones);
        this.actualizarVistaConFiltros();
        this.showUsuariosTable(usuarios);
        
        // Configurar botones de navegación con verificación de existencia
        const btnInscripciones = document.getElementById('btnInscripciones');
        if (btnInscripciones) {
            btnInscripciones.addEventListener('click', () => {
                this.cambiarVista('inscripciones');
            });
        }
        
        const btnUsuarios = document.getElementById('btnUsuarios');
        if (btnUsuarios) {
            btnUsuarios.addEventListener('click', () => {
                if (authSystem.isAdmin()) {
                    this.cambiarVista('usuarios');
                } else {
                    alert('Solo los administradores pueden acceder a la gestión de usuarios');
                }
            });
            
            if (!authSystem.isAdmin()) {
                btnUsuarios.style.display = 'none';
            }
        }
        
        // Botón de Material Histórico
        const btnMaterialHistorico = document.getElementById('btnMaterialHistorico');
        if (btnMaterialHistorico) {
            btnMaterialHistorico.addEventListener('click', () => {
                if (authSystem.isAdmin() || authSystem.isAdvancedUser()) {
                    this.cambiarVista('materialHistorico');
                } else {
                    alert('Solo administradores y usuarios avanzados pueden acceder a esta sección');
                }
            });
            
            // Mostrar botón solo si tiene permisos
            if (!authSystem.isAdmin() && !authSystem.isAdvancedUser()) {
                btnMaterialHistorico.style.display = 'none';
            }
        }
        
        // Botón de Gestión Visual de Clases
        const btnGestionClasesVisual = document.getElementById('btnGestionClasesVisual');
        if (btnGestionClasesVisual) {
            btnGestionClasesVisual.addEventListener('click', () => {
                if (authSystem.isAdmin() || authSystem.isAdvancedUser()) {
                    this.cambiarVista('gestionClasesVisual');
                } else {
                    alert('Solo administradores y usuarios avanzados pueden acceder a esta sección');
                }
            });
            
            // Mostrar botón solo si tiene permisos
            if (!authSystem.isAdmin() && !authSystem.isAdvancedUser()) {
                btnGestionClasesVisual.style.display = 'none';
            }
        }
        
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportToCSV(this.inscripcionesData);
            });
        }
        
        const createUserBtn = document.getElementById('createUserBtn');
        if (createUserBtn && authSystem.isAdmin()) {
            createUserBtn.style.display = 'block';
            createUserBtn.addEventListener('click', () => {
                this.mostrarModalCreacion();
            });
        }
        
        if (authSystem.isAdmin() || authSystem.isAdvancedUser()) {
            await this.loadSolicitudesMaterialHistorico();
        }

        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.textContent = 'Actualizando...';
                const nuevasInscripciones = await this.loadInscripciones();
                const nuevosUsuarios = await this.loadUsuarios();
                
                if (this.vistaActual === 'inscripciones') {
                    this.crearInterfazFiltros(nuevasInscripciones);
                    this.actualizarVistaConFiltros();
                } else if (this.vistaActual === 'usuarios') {
                    this.showUsuariosTable(nuevosUsuarios);
                } else if (this.vistaActual === 'materialHistorico') {
                    const nuevasSolicitudes = await this.loadSolicitudesMaterialHistorico();
                    this.showMaterialHistoricoTable(nuevasSolicitudes);
                }
                
                refreshBtn.textContent = '🔄 Actualizar Datos';
            });
        }
        
        const homeBtn = document.getElementById('homeBtn');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                window.location.href = '/index.html';
            });
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                authSystem.logout();
                window.location.href = '/index.html';
            });
        }
        
        console.log('✅ Admin system MongoDB inicializado correctamente');
    }
}

const adminSystem = new AdminSystem();

document.addEventListener('DOMContentLoaded', function() {
    adminSystem.init();
});