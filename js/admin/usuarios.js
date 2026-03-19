// usuarios.js - VERSIÓN CORREGIDA CON CAMPO ÁREA
console.log('👥 Módulo de Usuarios cargado - Versión corregida');

class UsuariosManager {
    constructor() {
        this.data = [];
        this.inscripcionesData = [];
        this.solicitudesData = [];
        this.init();
    }

    async init() {
        await this.cargarDatos();
        await this.cargarInscripciones();
        await this.cargarSolicitudes();
        this.setupEventListeners();
    }

    async cargarDatos() {
        try {
            const result = await authSystem.makeRequest('/admin/usuarios', null, 'GET');
            this.data = result.data || [];
            console.log(`✅ ${this.data.length} usuarios cargados`);
            this.actualizarUI();
        } catch (error) {
            console.error('❌ Error cargando usuarios:', error);
            this.mostrarError();
        }
    }

    async cargarInscripciones() {
        try {
            console.log('📥 Cargando inscripciones para historial...');
            const result = await authSystem.makeRequest('/inscripciones', null, 'GET');
            
            if (result.success && result.data) {
                this.inscripcionesData = result.data;
                console.log(`✅ ${this.inscripcionesData.length} inscripciones cargadas`);
            } else {
                this.inscripcionesData = [];
            }
        } catch (error) {
            console.error('❌ Error cargando inscripciones:', error);
            this.inscripcionesData = [];
        }
    }

    async cargarSolicitudes() {
        try {
            console.log('📥 Cargando solicitudes de material para historial...');
            const result = await authSystem.makeRequest('/material-historico/solicitudes', null, 'GET');
            
            if (result.success && result.data) {
                this.solicitudesData = result.data;
                console.log(`✅ ${this.solicitudesData.length} solicitudes cargadas`);
            } else {
                this.solicitudesData = [];
            }
        } catch (error) {
            console.error('❌ Error cargando solicitudes:', error);
            this.solicitudesData = [];
        }
    }

    contarActividadesUsuario(usuarioId) {
        let total = 0;
        
        if (this.inscripcionesData && this.inscripcionesData.length > 0) {
            const inscripciones = this.inscripcionesData.filter(ins => 
                (ins.usuario && ins.usuario._id === usuarioId) || 
                (ins.usuarioId === usuarioId)
            );
            total += inscripciones.length;
        }
        
        if (this.solicitudesData && this.solicitudesData.length > 0) {
            const solicitudes = this.solicitudesData.filter(sol => 
                sol.usuarioId === usuarioId || 
                (sol.usuario && sol.usuario._id === usuarioId)
            );
            total += solicitudes.length;
        }
        
        return total;
    }

    actualizarUI() {
        this.mostrarTabla();
        this.actualizarEstadisticas();
    }

    mostrarTabla(filtro = '') {
        const tbody = document.getElementById('usuariosBody');
        if (!tbody) return;

        let usuariosFiltrados = this.data;
        
        if (filtro) {
            const termino = filtro.toLowerCase();
            usuariosFiltrados = this.data.filter(u => 
                (u.apellidoNombre?.toLowerCase().includes(termino)) ||
                (u.legajo?.toString().includes(termino)) ||
                (u.email?.toLowerCase().includes(termino))
            );
        }

        if (usuariosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
                        No hay usuarios para mostrar
                    </td>
                </tr>
            `;
            return;
        }

        const esAdmin = authSystem.isAdmin();

        tbody.innerHTML = usuariosFiltrados.map((usuario, index) => {
            const totalActividades = this.contarActividadesUsuario(usuario._id);

            return `
            <tr>
                <td>${index + 1}</td>
                <td>${usuario.apellidoNombre || 'N/A'}</td>
                <td>${usuario.legajo || 'N/A'}</td>
                <td>${usuario.email || 'N/A'}</td>
                <td>${usuario.turno || 'N/A'}</td>
                <td>${usuario.area || 'N/A'}</td> <!-- 👈 NUEVO CAMPO -->
                <td><span class="role-badge ${usuario.role || 'user'}">${this.getRoleText(usuario.role)}</span></td>
                <td>${usuario.fechaRegistro ? new Date(usuario.fechaRegistro).toLocaleString('es-AR') : 'N/A'}</td>
                <td>
                    <div class="user-actions-stacked">
                        ${esAdmin ? `
                            <select class="role-select" onchange="usuariosManager.cambiarRol('${usuario._id}', this.value)">
                                <option value="user" ${usuario.role === 'user' ? 'selected' : ''}>Usuario Estándar</option>
                                <option value="advanced" ${usuario.role === 'advanced' ? 'selected' : ''}>Usuario Avanzado</option>
                                <option value="admin" ${usuario.role === 'admin' ? 'selected' : ''}>Administrador</option>
                            </select>
                            <div class="action-buttons">
                                <button class="btn-small btn-edit" onclick="usuariosManager.editarUsuario('${usuario._id}')" title="Editar usuario">✏️</button>
                                <button class="btn-small btn-danger" onclick="usuariosManager.eliminarUsuario('${usuario._id}')" title="Eliminar usuario">🗑️</button>
                                <button class="btn-small btn-info" onclick="usuariosManager.verHistorial('${usuario._id}')" title="Ver historial completo (${totalActividades} actividades)">📋</button>
                            </div>
                        ` : `
                            <span class="read-only">Solo lectura</span>
                            <div class="action-buttons">
                                <button class="btn-small btn-info" onclick="usuariosManager.verHistorial('${usuario._id}')" title="Ver historial completo (${totalActividades} actividades)">📋</button>
                            </div>
                        `}
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    getRoleText(role) {
        const roles = {
            'admin': '👑 Administrador',
            'advanced': '⭐ Avanzado',
            'user': '👤 Usuario'
        };
        return roles[role] || '👤 Usuario';
    }

    actualizarEstadisticas() {
        const total = this.data.length;
        const admins = this.data.filter(u => u.role === 'admin').length;
        const avanzados = this.data.filter(u => u.role === 'advanced').length;
        const estandar = this.data.filter(u => u.role === 'user' || !u.role).length;

        document.getElementById('totalUsuarios').textContent = total;
        document.getElementById('usuariosAdmin').textContent = admins;
        document.getElementById('usuariosAvanzados').textContent = avanzados;
        document.getElementById('usuariosEstandar').textContent = estandar;
    }

    mostrarError() {
        const tbody = document.getElementById('usuariosBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: #ff6b6b;">
                        ⚠️ Error al cargar los usuarios
                    </td>
                </tr>
            `;
        }
    }

    async cambiarRol(usuarioId, nuevoRol) {
        if (!authSystem.isAdmin()) {
            alert('Solo administradores pueden cambiar roles');
            return;
        }

        try {
            await authSystem.makeRequest(`/admin/usuarios/${usuarioId}/rol`, { role: nuevoRol }, 'PUT');
            await this.cargarDatos();
            alert('✅ Rol actualizado correctamente');
        } catch (error) {
            alert('❌ Error al cambiar rol: ' + error.message);
        }
    }

    // ===== MÉTODOS DEL MODAL CORREGIDOS =====
    
    abrirModal(usuario = null) {
        const modal = document.getElementById('userModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('userForm');
        const passwordGroup = document.getElementById('passwordGroup');
        const userIdInput = document.getElementById('userId');
        
        if (!modal) {
            console.error('❌ Modal no encontrado');
            return;
        }
        
        // Resetear el formulario completamente
        form.reset();
        
        if (usuario) {
            // MODO EDICIÓN
            title.textContent = '✏️ Editar Usuario';
            userIdInput.value = usuario._id;
            document.getElementById('userNombre').value = usuario.apellidoNombre || '';
            document.getElementById('userLegajo').value = usuario.legajo || '';
            document.getElementById('userEmail').value = usuario.email || '';
            document.getElementById('userTurno').value = usuario.turno || '';
            document.getElementById('userArea').value = usuario.area || ''; // 👈 NUEVO CAMPO
            document.getElementById('userRole').value = usuario.role || 'user';
            
            // En edición, la contraseña es opcional
            document.getElementById('userPassword').required = false;
            document.getElementById('userPassword').placeholder = 'Dejar en blanco para mantener (máx 15)';
            if (passwordGroup) passwordGroup.style.display = 'block';
            
            console.log('✏️ Editando usuario:', usuario.apellidoNombre);
        } else {
            // MODO CREACIÓN
            title.textContent = '➕ Crear Usuario';
            userIdInput.value = '';
            
            // En creación, la contraseña es obligatoria
            document.getElementById('userPassword').required = true;
            document.getElementById('userPassword').placeholder = 'Mínimo 6, máximo 15 caracteres';
            if (passwordGroup) passwordGroup.style.display = 'block';
        }
        
        // Mostrar el modal
        modal.style.display = 'flex';
        
        // Prevenir que el click en el modal lo cierre
        const modalContainer = modal.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    cerrarModal() {
        const modal = document.getElementById('userModal');
        if (modal) {
            modal.style.display = 'none';
            
            // Resetear el formulario al cerrar
            const form = document.getElementById('userForm');
            if (form) form.reset();
        }
    }

    async guardarUsuario(event) {
        event.preventDefault();
        
        console.log('💾 Guardando usuario...');
        
        // Obtener datos del formulario
        const userId = document.getElementById('userId').value;
        const apellidoNombre = document.getElementById('userNombre').value.trim();
        const legajo = document.getElementById('userLegajo').value.trim();
        const email = document.getElementById('userEmail').value.trim();
        const turno = document.getElementById('userTurno').value;
        const area = document.getElementById('userArea').value; // 👈 NUEVO CAMPO
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;
        
        // Validaciones básicas
        if (!apellidoNombre || !legajo || !email || !turno || !area || !role) {
            this.mostrarMensajeModal('❌ Todos los campos obligatorios deben estar completos', 'error');
            return;
        }
        
        // Validar contraseña según el modo
        if (!userId && !password) {
            this.mostrarMensajeModal('❌ La contraseña es obligatoria para nuevos usuarios', 'error');
            return;
        }
        
        if (password && password.length < 6) {
            this.mostrarMensajeModal('❌ La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        if (password && password.length > 15) {
            this.mostrarMensajeModal('❌ La contraseña no puede tener más de 15 caracteres', 'error');
            return;
        }
        
        // Preparar datos para enviar
        const userData = {
            apellidoNombre: apellidoNombre,
            legajo: legajo,
            email: email,
            turno: turno,
            area: area, // 👈 NUEVO CAMPO
            role: role
        };
        
        try {
            let response;
            
            if (userId) {
                // MODO EDICIÓN - Actualizar datos básicos
                console.log('📤 Actualizando usuario:', userId, userData);
                response = await authSystem.makeRequest(`/admin/usuarios/${userId}`, userData, 'PUT');
                
                // Si hay nueva contraseña, actualizarla también
                if (password) {
                    console.log('🔐 Actualizando contraseña');
                    await authSystem.makeRequest(`/admin/usuarios/${userId}/password`, { newPassword: password }, 'PUT');
                }
                
                this.mostrarMensajeModal('✅ Usuario actualizado correctamente', 'success');
            } else {
                // MODO CREACIÓN - Crear nuevo usuario
                console.log('📤 Creando nuevo usuario:', userData);
                userData.password = password; // Agregar contraseña solo en creación
                response = await authSystem.makeRequest('/admin/usuarios', userData);
                this.mostrarMensajeModal('✅ Usuario creado correctamente', 'success');
            }
            
            // Cerrar modal después de guardar exitosamente
            setTimeout(() => {
                this.cerrarModal();
                this.cargarDatos(); // Recargar la lista de usuarios
                this.cargarInscripciones();
                this.cargarSolicitudes();
            }, 1500);
            
        } catch (error) {
            console.error('❌ Error guardando usuario:', error);
            this.mostrarMensajeModal('❌ Error: ' + error.message, 'error');
        }
    }

    mostrarMensajeModal(mensaje, tipo) {
        const modal = document.getElementById('userModal');
        const form = document.getElementById('userForm');
        
        let messageDiv = modal.querySelector('.modal-message');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.className = 'modal-message';
            form.insertBefore(messageDiv, form.firstChild);
        }
        
        messageDiv.textContent = mensaje;
        messageDiv.style.cssText = `
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 15px;
            text-align: center;
            font-weight: bold;
            animation: slideDown 0.3s ease;
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

    async eliminarUsuario(usuarioId) {
        if (!authSystem.isAdmin()) {
            alert('Solo administradores pueden eliminar usuarios');
            return;
        }

        const usuario = this.data.find(u => u._id === usuarioId);
        if (!usuario) return;

        if (usuario._id === authSystem.getCurrentUser()._id) {
            alert('No puedes eliminarte a ti mismo');
            return;
        }

        if (!confirm(`¿Eliminar al usuario ${usuario.apellidoNombre}?`)) return;

        try {
            await authSystem.makeRequest(`/admin/usuarios/${usuarioId}`, null, 'DELETE');
            await this.cargarDatos();
            alert('✅ Usuario eliminado');
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    }

    editarUsuario(usuarioId) {
        const usuario = this.data.find(u => u._id === usuarioId);
        if (usuario) {
            this.abrirModal(usuario);
        }
    }

    async verHistorial(usuarioId) {
        const usuario = this.data.find(u => u._id === usuarioId);
        if (!usuario) return;

        const inscripciones = this.inscripcionesData.filter(ins => 
            (ins.usuario && ins.usuario._id === usuarioId) || 
            (ins.usuarioId === usuarioId)
        );

        const solicitudes = this.solicitudesData.filter(sol => 
            sol.usuarioId === usuarioId || 
            (sol.usuario && sol.usuario._id === usuarioId)
        );

        const totalInscripciones = inscripciones.length;
        const totalSolicitudes = solicitudes.length;
        const totalActividades = totalInscripciones + totalSolicitudes;

        const todasActividades = [
            ...inscripciones.map(ins => ({
                tipo: 'inscripcion',
                clase: ins.clase || 'N/A',
                turno: ins.turno || 'N/A',
                fecha: ins.fecha,
                detalles: ins,
                material: null
            })),
            ...solicitudes.map(sol => ({
                tipo: 'solicitud',
                clase: sol.claseNombre || sol.clase || 'N/A',
                turno: sol.turno || (sol.usuario?.turno) || 'N/A',
                fecha: sol.fechaSolicitud,
                detalles: sol,
                youtube: sol.youtube,
                powerpoint: sol.powerpoint
            }))
        ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let actividadesHTML = '';
        if (todasActividades.length === 0) {
            actividadesHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Este usuario no tiene actividades registradas.</p>';
        } else {
            actividadesHTML = `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <thead>
                            <tr style="background: var(--accent-color); color: white;">
                                <th style="padding: 12px; text-align: left;">#</th>
                                <th style="padding: 12px; text-align: left;">Tipo</th>
                                <th style="padding: 12px; text-align: left;">Clase</th>
                                <th style="padding: 12px; text-align: left;">Turno</th>
                                <th style="padding: 12px; text-align: left;">Fecha</th>
                                <th style="padding: 12px; text-align: left;">Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${todasActividades.map((act, index) => `
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 12px;">${index + 1}</td>
                                    <td style="padding: 12px;">
                                        ${act.tipo === 'inscripcion' 
                                            ? '<span style="background: rgba(66, 133, 244, 0.1); color: var(--accent-color); padding: 4px 8px; border-radius: 12px;">📋 Inscripción</span>' 
                                            : '<span style="background: rgba(52, 168, 83, 0.1); color: var(--success-500); padding: 4px 8px; border-radius: 12px;">📚 Solicitud Material</span>'}
                                    </td>
                                    <td style="padding: 12px; font-weight: 500;">${act.clase}</td>
                                    <td style="padding: 12px;">${act.turno}</td>
                                    <td style="padding: 12px;">${act.fecha ? new Date(act.fecha).toLocaleString('es-AR') : 'N/A'}</td>
                                    <td style="padding: 12px;">
                                        ${act.tipo === 'solicitud' && (act.youtube || act.powerpoint) ? `
                                            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                                ${act.youtube ? `<a href="${act.youtube}" target="_blank" class="material-link youtube" style="font-size: 0.8em;">▶️ YouTube</a>` : ''}
                                                ${act.powerpoint ? `<a href="${act.powerpoint}" target="_blank" class="material-link powerpoint" style="font-size: 0.8em;">📊 PPT</a>` : ''}
                                            </div>
                                        ` : act.tipo === 'inscripcion' ? 'Inscripción a clase' : 'Sin detalles'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const content = `
            <div style="padding: 20px;">
                <div style="background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-container) 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid var(--accent-color);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0; color: var(--text-primary);">${usuario.apellidoNombre}</h3>
                        <span class="role-badge ${usuario.role || 'user'}">${this.getRoleText(usuario.role)}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; color: var(--text-secondary);">
                        <div><strong>📋 Legajo:</strong> ${usuario.legajo}</div>
                        <div><strong>📧 Email:</strong> ${usuario.email}</div>
                        <div><strong>⏰ Turno:</strong> ${usuario.turno || 'No especificado'}</div>
                        <div><strong>🏥 Área:</strong> ${usuario.area || 'No especificada'}</div> <!-- 👈 NUEVO CAMPO -->
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%); color: white; padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 5px;">Total Actividades</div>
                        <strong style="font-size: 2em;">${totalActividades}</strong>
                    </div>
                    <div style="background: linear-gradient(135deg, var(--success-500) 0%, #0f9d58 100%); color: white; padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 5px;">Inscripciones</div>
                        <strong style="font-size: 2em;">${totalInscripciones}</strong>
                    </div>
                    <div style="background: linear-gradient(135deg, var(--info-500) 0%, var(--info-600) 100%); color: white; padding: 15px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 5px;">Solicitudes Material</div>
                        <strong style="font-size: 2em;">${totalSolicitudes}</strong>
                    </div>
                </div>
                
                <h4 style="margin-bottom: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                    <span>📅</span> Historial completo de actividades
                </h4>
                ${actividadesHTML}
            </div>
        `;

        const modal = document.getElementById('historialModal');
        const contentDiv = document.getElementById('historialModalContent');
        const title = document.getElementById('historialModalTitle');
        
        if (modal && contentDiv && title) {
            title.textContent = `📋 Historial de Actividades - ${usuario.apellidoNombre}`;
            contentDiv.innerHTML = content;
            modal.style.display = 'flex';
        }
    }

    exportarUsuariosCSV() {
        try {
            if (this.data.length === 0) {
                alert('No hay usuarios para exportar');
                return;
            }

            console.log(`📥 Exportando ${this.data.length} usuarios a CSV con IDs...`);

            const headers = [
                'ID (MongoDB)',
                'Apellido y Nombre',
                'Legajo',
                'Email',
                'Turno',
                'Área', // 👈 NUEVO CAMPO
                'Rol',
                'Fecha Registro'
            ];

            const rows = this.data.map(usuario => {
                let fechaRegistro = 'N/A';
                if (usuario.fechaRegistro) {
                    const fecha = new Date(usuario.fechaRegistro);
                    fechaRegistro = fecha.toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                }

                const roles = {
                    'admin': 'Administrador',
                    'advanced': 'Usuario Avanzado',
                    'user': 'Usuario Estándar'
                };
                const rolTexto = roles[usuario.role] || 'Usuario Estándar';

                const escapar = (texto) => {
                    if (!texto) return '""';
                    return `"${texto.replace(/"/g, '""')}"`;
                };

                return [
                    escapar(usuario._id || ''),
                    escapar(usuario.apellidoNombre || ''),
                    escapar(usuario.legajo || ''),
                    escapar(usuario.email || ''),
                    escapar(usuario.turno || ''),
                    escapar(usuario.area || ''), // 👈 NUEVO CAMPO
                    escapar(rolTexto),
                    escapar(fechaRegistro)
                ].join(',');
            });

            const csvContent = [
                headers.join(','),
                ...rows
            ].join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { 
                type: 'text/csv;charset=utf-8;' 
            });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            const fecha = new Date().toISOString().split('T')[0];
            const hora = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
            const nombreArchivo = `usuarios_${this.data.length}_registros_${fecha}_${hora}.csv`;
            
            link.setAttribute('href', url);
            link.setAttribute('download', nombreArchivo);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);

            alert(
                `✅ EXPORTACIÓN EXITOSA\n\n` +
                `📁 Archivo: ${nombreArchivo}\n` +
                `📊 Total usuarios: ${this.data.length}`
            );

            console.log(`✅ CSV generado: ${nombreArchivo}`);

        } catch (error) {
            console.error('❌ Error exportando usuarios:', error);
            alert('❌ Error al exportar usuarios: ' + error.message);
        }
    }

    setupEventListeners() {
        // Botón crear usuario
        document.getElementById('createUserBtn')?.addEventListener('click', () => {
            this.abrirModal();
        });

        // Botón exportar
        document.getElementById('exportUsersBtn')?.addEventListener('click', () => {
            this.exportarUsuariosCSV();
        });

        // Búsqueda de usuarios
        document.getElementById('searchUser')?.addEventListener('input', (e) => {
            this.mostrarTabla(e.target.value);
        });

        // Botón actualizar
        document.getElementById('refreshUsersBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('refreshUsersBtn');
            const originalText = btn.textContent;
            btn.textContent = '🔄 Actualizando...';
            btn.disabled = true;
            
            await this.cargarDatos();
            await this.cargarInscripciones();
            await this.cargarSolicitudes();
            
            btn.textContent = originalText;
            btn.disabled = false;
        });

        // Cerrar modal con botones X y Cancelar
        document.querySelectorAll('.close-modal, .cancel-modal, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.cerrarModal();
            });
        });

        // Cerrar modal de historial
        const closeHistorial = document.getElementById('closeHistorialModal');
        if (closeHistorial) {
            closeHistorial.addEventListener('click', () => {
                document.getElementById('historialModal').style.display = 'none';
            });
        }

        // Cerrar modal haciendo click fuera del contenedor (SOLO para el modal de historial)
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('historialModal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Evento submit del formulario
        const form = document.getElementById('userForm');
        if (form) {
            form.removeEventListener('submit', this.handleSubmit);
            
            this.handleSubmit = (e) => {
                e.preventDefault();
                this.guardarUsuario(e);
            };
            
            form.addEventListener('submit', this.handleSubmit);
        }

        // Prevenir cierre del modal al hacer click en el overlay
        const userModal = document.getElementById('userModal');
        if (userModal) {
            userModal.addEventListener('click', (e) => {
                if (e.target === userModal) {
                    if (confirm('¿Estás seguro? Los cambios no guardados se perderán.')) {
                        this.cerrarModal();
                    }
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.usuariosManager = new UsuariosManager();
});