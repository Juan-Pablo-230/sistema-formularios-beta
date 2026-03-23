let versionBeta = true; // Variable global para indicar que estamos en versión BETA

if (versionBeta == true) {
    console.warn("Esta es una versión BETA del sistema de inscripciones. Puede contener errores o funcionalidades incompletas. Por favor, utilícelo con precaución y reporte cualquier problema al desarrollador.");
    document.title = 'Sistema de inscripciones - BETA';
    const faviconUrl = '/img/logo-beta.png';
    const link = document.createElement('link');
    link.rel = 'shortcut icon';
    link.href = faviconUrl;
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
        logoImg.src = faviconUrl;
    }
    document.head.appendChild(link);
    const h1 = document.querySelector('.header-text h1');
     if (h1) {
        h1.textContent = 'Sistema de inscripciones - BETA';
    }
    const footer = document.querySelector('footer');
    if (footer) {
        footer.innerHTML = '<a href="https://sistema-formularios-production.up.railway.app/" style="color: #667eea; text-decoration: none;">Ir a la versión estable del sistema.</a>';
    }
}
else {
    document.title = 'Sistema de inscripciones';
    const faviconUrl = '/img/logo-oficial.png';
    const link = document.createElement('link');
    link.rel = 'shortcut icon';
    link.href = faviconUrl;
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
        logoImg.src = faviconUrl;
    }
    document.head.appendChild(link);
    const h1 = document.querySelector('.header-text h1');
    if (h1) {
        h1.textContent = 'Sistema de inscripciones';
    }
    const footer = document.querySelector('footer');
    if (footer) {
        footer.innerHTML = '<a href="https://sistema-formularios-beta-production.up.railway.app/" style="color: #667eea; text-decoration: none;">Ir a la versión BETA del sistema.</a>';
    }
}

// auth.js - Versión con modal de migración y scroll bloqueado

class AuthSystem {
    constructor() {
        console.log('AuthSystem MongoDB inicializado');
        this.apiBaseUrl = '';
        this.currentUser = null;
        this.migrationModalActive = false; // Para evitar múltiples modales
        this.init();
    }

    async init() {
        console.log('Inicializando sistema de auth con MongoDB...');
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            console.log('Usuario encontrado en localStorage:', this.currentUser);
            
            // Verificar si necesita migración al cargar la página
            setTimeout(() => {
                this.checkMigrationNeeded();
            }, 500); // Pequeño delay para asegurar que el DOM esté listo
        } else {
            console.log('No hay usuario en localStorage');
        }
    }

    // Verificar si necesita migración
    async checkMigrationNeeded() {
        // Si ya hay un modal activo, no hacer nada
        if (this.migrationModalActive) return;
        
        // Si no hay usuario logueado, no hacer nada
        if (!this.isLoggedIn()) return;
        
        const user = this.currentUser;
        
        // Verificar si necesita migración (needsPasswordChange true Y no ha actualizado)
        const needsMigration = user.needsMigration === true;
        
        // Verificar si le falta el área
        const needsArea = !user.area || user.area === '';
        
        console.log('🔍 Verificando necesidad de migración:', {
            needsMigration,
            needsArea,
            area: user.area
        });
        
        // Si necesita migración O le falta el área, mostrar modal
        if (needsMigration || needsArea) {
            console.log('⚠️ Usuario necesita completar datos, mostrando modal...');
            await this.showMigrationModal();
        } else {
            console.log('✅ Usuario ya tiene todos los datos completos');
        }
    }

    async makeRequest(endpoint, data = null, method = 'POST') {
        try {
            const user = this.getCurrentUser();
            const headers = {
                'Content-Type': 'application/json',
            };
            
            if (user && user._id) {
                headers['user-id'] = user._id;
            }
            
            const options = {
                method: method,
                headers: headers
            };
            
            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }
            
            console.log('🌐 Haciendo request a:', `/api${endpoint}`);
            console.log('👤 User ID en headers:', user?._id || 'No logueado');
            
            const response = await fetch(`/api${endpoint}`, options);
            
            const contentType = response.headers.get('content-type');
            
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON - La API no está disponible:', text.substring(0, 200));
                return { 
                    success: false, 
                    message: 'La API no está disponible en este entorno',
                    error: 'NO_JSON_RESPONSE',
                    status: response.status,
                    data: null
                };
            }
            
            const result = await response.json();
            
            if (!response.ok) {
                console.error('❌ Error en respuesta:', result);
                return { 
                    success: false, 
                    message: result.message || `Error ${response.status}`,
                    status: response.status,
                    data: null
                };
            }
            
            if (!result.success) {
                console.error('❌ API devolvió error:', result);
                return { 
                    success: false, 
                    message: result.message || 'Error desconocido',
                    data: null
                };
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Error en la solicitud:', error.message);
            console.error('Stack:', error.stack);
            return { 
                success: false, 
                message: error.message,
                error: 'NETWORK_ERROR',
                data: null
            };
        }
    }

    async login(identifier, password) {
        try {
            const result = await this.makeRequest('/auth/login', {
                identifier: identifier,
                password: password
            });
            
            if (!result.success) {
                throw new Error(result.message || 'Error de conexión con el servidor');
            }
            
            this.currentUser = result.data;
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            
            console.log('✅ Login exitoso MongoDB:', this.currentUser.apellidoNombre);
            console.log('📊 Estado de migración:', {
                needsPasswordChange: this.currentUser.needsPasswordChange,
                passwordAlreadyUpdated: this.currentUser.passwordAlreadyUpdated,
                area: this.currentUser.area
            });
            
            // Verificar si necesita migración después del login
            setTimeout(() => {
                this.checkMigrationNeeded();
            }, 500);
            
            return this.currentUser;
            
        } catch (error) {
            console.error('❌ Error en login:', error);
            throw error;
        }
    }

    // Muestra el modal obligatorio de migración (para texto plano y área faltante)
async showMigrationModal() {
    // Verificar si ya hay un modal activo
    if (this.migrationModalActive) {
        console.log('⚠️ Ya hay un modal de migración activo');
        return Promise.reject('Modal ya activo');
    }
    
    // Marcar que hay un modal activo
    this.migrationModalActive = true;

    return new Promise((resolve, reject) => {
        const user = this.currentUser;
        // Verificar si necesita migración de contraseña (texto plano)
        const needsMigration = user.needsMigration === true;
        
        console.log('📋 Mostrando modal de migración. needsMigration:', needsMigration);
        
        // BLOQUEAR SCROLL DEL FONDO
        document.body.style.overflow = 'hidden';
        
        // Crear overlay
        const overlay = document.createElement('div');
        overlay.className = 'migration-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            font-family: 'Arial', sans-serif;
            backdrop-filter: blur(5px);
        `;
        
        // Construir el HTML del modal
        let modalHTML = `
            <div class="migration-container" style="
                background: #1e1e2e;
                padding: 30px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                width: 90%;
                max-width: 500px;
                color: #e0e0e0;
                max-height: 90vh;
                overflow-y: auto;
            ">
                <h2 style="text-align: center; margin-bottom: 20px; color: #fff;">⚠️ Acción Requerida</h2>
                <p style="text-align: center; margin-bottom: 20px;">
                    Por motivos de seguridad y para completar tu perfil, debes realizar los siguientes pasos antes de continuar:
                </p>
        `;
        
        // CAMPO ÁREA - SIEMPRE VISIBLE
        modalHTML += `
            <div style="margin-bottom: 25px; padding: 15px; background: #2a2f36; border-radius: 10px;">
                <h3 style="margin-bottom: 15px; color: #4285f4;">🏥 Área de Trabajo</h3>
                <p>Por favor, selecciona tu área de trabajo para completar tu perfil:</p>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">Área de Trabajo *</label>
                    <select id="migrationArea" required style="
                        width: 100%;
                        padding: 10px;
                        border: 2px solid #3d3d5c;
                        border-radius: 8px;
                        background: #1e1e2e;
                        color: #e0e0e0;
                        font-size: 14px;
                    ">
                        <option value="">Seleccione su área</option>
                        <option value="Camilleros">Camilleros</option>
                        <option value="Asistentes">Asistentes</option>
                        <option value="Enfermeros">Enfermeros</option>
                        <option value="Personal general del Sanatorio">Personal general del Sanatorio</option>
                        <option value="Otros profesionales de la salud">Otros profesionales de la salud</option>
                    </select>
                </div>
            </div>
        `;
        
        // Agregar sección de cambio de contraseña SOLO si es necesario (texto plano)
        if (needsMigration) {
            modalHTML += `
                <div style="margin-bottom: 25px; padding: 15px; background: #2a2f36; border-radius: 10px;">
                    <h3 style="margin-bottom: 15px; color: #ff6b6b;">🔐 Configuración de Contraseña</h3>
                    <p>Por seguridad, debes configurar tu contraseña con nuestro nuevo sistema de encriptación.</p>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Contraseña Actual *</label>
                        <div style="position: relative;">
                            <input type="password" id="currentPassword" required style="
                                width: 100%;
                                padding: 10px;
                                padding-right: 45px;
                                border: 2px solid #3d3d5c;
                                border-radius: 8px;
                                background: #1e1e2e;
                                color: #e0e0e0;
                            ">
                            <button type="button" class="toggle-password" data-target="currentPassword" style="
                                position: absolute;
                                right: 10px;
                                top: 50%;
                                transform: translateY(-50%);
                                background: none;
                                border: none;
                                cursor: pointer;
                                color: #b0b0b0;
                                font-size: 14px;
                                z-index: 10;
                            ">👁️</button>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Nueva Contraseña *</label>
                        <div style="position: relative;">
                            <input type="password" id="newPassword" required maxlength="15" style="
                                width: 100%;
                                padding: 10px;
                                padding-right: 45px;
                                border: 2px solid #3d3d5c;
                                border-radius: 8px;
                                background: #1e1e2e;
                                color: #e0e0e0;
                            ">
                            <button type="button" class="toggle-password" data-target="newPassword" style="
                                position: absolute;
                                right: 10px;
                                top: 50%;
                                transform: translateY(-50%);
                                background: none;
                                border: none;
                                cursor: pointer;
                                color: #b0b0b0;
                                font-size: 14px;
                                z-index: 10;
                            ">👁️</button>
                        </div>
                        <small style="color: #b0b0b0;">Mínimo 8, máximo 15 caracteres</small>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Confirmar Nueva Contraseña *</label>
                        <div style="position: relative;">
                            <input type="password" id="confirmNewPassword" required maxlength="15" style="
                                width: 100%;
                                padding: 10px;
                                padding-right: 45px;
                                border: 2px solid #3d3d5c;
                                border-radius: 8px;
                                background: #1e1e2e;
                                color: #e0e0e0;
                            ">
                            <button type="button" class="toggle-password" data-target="confirmNewPassword" style="
                                position: absolute;
                                right: 10px;
                                top: 50%;
                                transform: translateY(-50%);
                                background: none;
                                border: none;
                                cursor: pointer;
                                color: #b0b0b0;
                                font-size: 14px;
                                z-index: 10;
                            ">👁️</button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Cerrar el modal
        modalHTML += `
                <div id="migrationMessage" style="
                    display: none;
                    padding: 12px;
                    border-radius: 5px;
                    margin-bottom: 15px;
                    text-align: center;
                    font-weight: bold;
                "></div>
                
                <button id="migrateBtn" style="
                    width: 100%;
                    background: linear-gradient(135deg, #34a853 0%, #0f9d58 100%);
                    color: white;
                    padding: 15px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">Continuar</button>
            </div>
        `;
        
        overlay.innerHTML = modalHTML;
        document.body.appendChild(overlay);
        
        // Función para restaurar scroll y limpiar estado
        const restaurarScroll = () => {
            document.body.style.overflow = '';
            this.migrationModalActive = false;
            if (overlay.parentNode) {
                overlay.remove();
            }
        };
        
        // ========== FUNCIONALIDAD DEL OJITO (VERSIÓN DEFINITIVA) ==========
setTimeout(() => {
    const toggleButtons = overlay.querySelectorAll('.toggle-password');
    console.log('🔍 Botones toggle encontrados:', toggleButtons.length);
    
    toggleButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const targetId = this.getAttribute('data-target');
            const originalInput = document.getElementById(targetId);
            
            if (!originalInput) return;
            
            const parentDiv = originalInput.parentNode;
            const currentValue = originalInput.value;
            
            // Verificar si ya existe un campo visible alternativo
            const existingTextInput = parentDiv.querySelector('.temp-text-input');
            
            if (originalInput.type === 'password' && !existingTextInput) {
                // Crear un input de texto temporal
                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.className = 'temp-text-input';
                textInput.value = currentValue;
                textInput.style.cssText = originalInput.style.cssText;
                textInput.style.position = 'absolute';
                textInput.style.left = '0';
                textInput.style.top = '0';
                textInput.style.width = '100%';
                textInput.style.height = '100%';
                textInput.style.padding = originalInput.style.padding;
                textInput.style.border = originalInput.style.border;
                textInput.style.background = originalInput.style.background;
                textInput.style.color = originalInput.style.color;
                
                // Ocultar el input original
                originalInput.style.opacity = '0';
                originalInput.style.position = 'relative';
                originalInput.style.zIndex = '0';
                
                // Posicionar el contenedor relativamente
                parentDiv.style.position = 'relative';
                
                // Agregar el input de texto encima
                parentDiv.appendChild(textInput);
                
                // Sincronizar valores cuando se escribe en el texto
                textInput.addEventListener('input', function() {
                    originalInput.value = this.value;
                });
                
                // Sincronizar si se escribe en el original (por si acaso)
                originalInput.addEventListener('input', function() {
                    if (textInput) textInput.value = this.value;
                });
                
                this.textContent = '🙈';
                console.log('👁️ Contraseña visible para:', targetId);
                
            } else if (existingTextInput) {
                // Eliminar el input temporal y restaurar el original
                existingTextInput.remove();
                originalInput.style.opacity = '1';
                originalInput.style.position = '';
                this.textContent = '👁️';
                console.log('👁️ Contraseña oculta para:', targetId);
            }
        });
    });
}, 100);
        
        // Manejar envío
        const migrateBtn = overlay.querySelector('#migrateBtn');
        
        migrateBtn.addEventListener('click', async () => {
            
            // Preparar datos base
            const data = {};
            
            // Validar área SIEMPRE
            const area = overlay.querySelector('#migrationArea')?.value;
            if (!area) {
                this.showMigrationMessage(overlay, '❌ Debes seleccionar tu área de trabajo', 'error');
                return;
            }
            data.area = area;
            
            // Validar y obtener valores SOLO si se requiere migración de contraseña
            if (needsMigration) {
                const currentPassword = overlay.querySelector('#currentPassword')?.value;
                const newPassword = overlay.querySelector('#newPassword')?.value;
                const confirmPassword = overlay.querySelector('#confirmNewPassword')?.value;
                
                // Validaciones
                if (!currentPassword) {
                    this.showMigrationMessage(overlay, 'Debes ingresar tu contraseña actual', 'error');
                    return;
                }
                
                if (!newPassword) {
                    this.showMigrationMessage(overlay, 'Debes ingresar una nueva contraseña', 'error');
                    return;
                }
                
                if (!confirmPassword) {
                    this.showMigrationMessage(overlay, 'Debes confirmar la nueva contraseña', 'error');
                    return;
                }
                
                if (newPassword.length < 8) {
                    this.showMigrationMessage(overlay, 'La nueva contraseña debe tener al menos 8 caracteres', 'error');
                    return;
                }
                
                if (newPassword.length > 15) {
                    this.showMigrationMessage(overlay, 'La nueva contraseña no puede tener más de 15 caracteres', 'error');
                    return;
                }
                
                if (newPassword !== confirmPassword) {
                    this.showMigrationMessage(overlay, 'Las contraseñas nuevas no coinciden', 'error');
                    return;
                }
                
                // Asignar valores al objeto data
                data.currentPassword = currentPassword;
                data.newPassword = newPassword;
            }
            
            try {
                migrateBtn.disabled = true;
                migrateBtn.textContent = 'Procesando...';
                
                const result = await this.makeRequest('/usuarios/migrar', data);
                
                if (result.success) {
                    // Actualizar usuario en localStorage
                    this.currentUser = result.data;
                    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                    
                    this.showMigrationMessage(overlay, '✅ Datos actualizados correctamente. Recargando...', 'success');
                    
                    setTimeout(() => {
                        restaurarScroll();
                        window.location.reload();
                    }, 2000);
                } else {
                    throw new Error(result.message || 'Error en la migración');
                }
            } catch (error) {
                this.showMigrationMessage(overlay, '❌ ' + error.message, 'error');
                migrateBtn.disabled = false;
                migrateBtn.textContent = 'Continuar';
            }
        });
        
        // Permitir cerrar el modal haciendo clic fuera
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (confirm('¿Estás seguro? Si cierras esta ventana, no podrás acceder al sistema hasta completar tus datos.')) {
                    restaurarScroll();
                    window.location.href = '/index.html';
                }
            }
        });
    });
}

showMigrationMessage(overlay, text, type) {
    const msgDiv = overlay.querySelector('#migrationMessage');
    msgDiv.style.display = 'block';
    msgDiv.textContent = text;
    msgDiv.style.background = type === 'error' ? '#5a2d2d' : type === 'info' ? '#2d5a5a' : '#2d5a2d';
    msgDiv.style.color = type === 'error' ? '#ff6b6b' : type === 'info' ? '#6bffff' : '#6bff6b';
    msgDiv.style.border = type === 'error' ? '1px solid #ff6b6b' : type === 'info' ? '1px solid #6bffff' : '1px solid #6bff6b';
}

    showMigrationMessage(overlay, text, type) {
        const msgDiv = overlay.querySelector('#migrationMessage');
        msgDiv.style.display = 'block';
        msgDiv.textContent = text;
        msgDiv.style.background = type === 'error' ? '#5a2d2d' : type === 'info' ? '#2d5a5a' : '#2d5a2d';
        msgDiv.style.color = type === 'error' ? '#ff6b6b' : type === 'info' ? '#6bffff' : '#6bff6b';
        msgDiv.style.border = type === 'error' ? '1px solid #ff6b6b' : type === 'info' ? '1px solid #6bffff' : '1px solid #6bff6b';
    }

    async saveUserToCloud(userData) {
        try {
            const result = await this.makeRequest('/auth/register', userData);
            if (!result.success) {
                throw new Error(result.message || 'Error de conexión con el servidor');
            }
            return true;
        } catch (error) {
            console.error('❌ Error en registro:', error);
            throw error;
        }
    }

    async createUserByAdmin(userData) {
        try {
            const result = await this.makeRequest('/admin/usuarios', userData);
            if (!result.success) {
                throw new Error(result.message || 'Error de conexión con el servidor');
            }
            return true;
        } catch (error) {
            console.error('❌ Error creando usuario:', error);
            throw error;
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        console.log('👋 Usuario deslogueado');
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    isAdmin() {
        return this.currentUser?.role === 'admin';
    }

    isAdvancedUser() {
        return this.currentUser?.role === 'advanced';
    }

    isRegularUser() {
        return this.currentUser?.role === 'user' || !this.currentUser?.role;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    validatePassword(password, confirmPassword) {
        if (password !== confirmPassword) {
            throw new Error('Las contraseñas no coinciden');
        }
        if (password.length < 8) {
            throw new Error('La contraseña debe tener al menos 8 caracteres');
        }
        if (password.length > 15) {
            throw new Error('La contraseña no puede tener más de 15 caracteres');
        }
        return true;
    }

    async verifyCurrentPassword(password) {
        const user = this.getCurrentUser();
        if (!user) return false;
        return user.password === password;
    }

    async checkLegajoExists(legajo) {
        try {
            const result = await this.makeRequest(`/auth/check-legajo/${legajo}`, null, 'GET');
            return result.success ? result.data.exists : false;
        } catch (error) {
            console.error('❌ Error verificando legajo:', error);
            return false;
        }
    }

    getUserRoleText(role) {
        const roles = {
            'admin': '👑 Administrador',
            'advanced': '⭐ Usuario Avanzado', 
            'user': '👤 Usuario Regular'
        };
        return roles[role] || '👤 Usuario';
    }

    // MÉTODO DE LOGIN MODAL (con campo ÁREA agregado)
    showLoginModal() {
        if (this.isLoggedIn()) return Promise.resolve(this.currentUser);
        
        return new Promise((resolve, reject) => {
            console.log('Mostrando modal de login MongoDB...');
            
            const overlay = document.createElement('div');
            overlay.className = 'login-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                font-family: 'Arial', sans-serif;
            `;
            
            overlay.innerHTML = `
                <div class="login-container" style="
                    background: #1e1e2e;
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
                    width: 90%;
                    max-width: 450px;
                    max-height: 90vh;
                    overflow-y: auto;
                    color: #e0e0e0;
                ">
                    <div class="login-tabs" style="
                        display: flex;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #3d3d5c;
                    ">
                        <button class="login-tab active" data-tab="login" style="
                            flex: 1;
                            padding: 10px;
                            text-align: center;
                            background: none;
                            border: none;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: bold;
                            color: #667eea;
                            border-bottom: 3px solid #667eea;
                        ">Iniciar Sesión</button>
                        <button class="login-tab" data-tab="register" style="
                            flex: 1;
                            padding: 10px;
                            text-align: center;
                            background: none;
                            border: none;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: bold;
                            color: #b0b0b0;
                            transition: all 0.3s ease;
                        ">Registrarse</button>
                    </div>
                    
                    <div id="loginForm" class="login-form active">
                        <h3 style="text-align: center; margin-bottom: 20px; color: #e0e0e0;">Iniciar Sesión</h3>
                        <div class="security-warning" style="
                            background: #3a3a2a;
                            border: 1px solid #ffd166;
                            border-radius: 5px;
                            padding: 10px;
                            margin-bottom: 15px;
                            font-size: 0.85em;
                            color: #ffd166;
                            text-align: center;
                        ">
                            ⚠️ No utilice claves de uso específico (bancarias, operadoras, etc.)
                        </div>
                        <form id="loginFormElement">
                            <div class="form-group" style="margin-bottom: 20px; display: block;">
                                <label for="loginIdentifier" style="display: block; margin-bottom: 8px; font-weight: bold; color: #e0e0e0;">Correo o Legajo *</label>
                                <input type="text" id="loginIdentifier" name="identifier" required style="
                                    width: 100%;
                                    padding: 12px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 16px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                            </div>
                            <div class="form-group" style="margin-bottom: 20px; display: block;">
                                <label for="loginPassword" style="display: block; margin-bottom: 8px; font-weight: bold; color: #e0e0e0;">Contraseña *</label>
                                <div style="position: relative;">
                                    <input type="password" id="loginPassword" name="password" required maxlength="15" style="
                                        width: 100%;
                                        padding: 12px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 16px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" data-target="loginPassword" style="
                                        position: absolute;
                                        right: 10px;
                                        top: 50%;
                                        transform: translateY(-50%);
                                        background: none;
                                        border: none;
                                        cursor: pointer;
                                        color: #b0b0b0;
                                        font-size: 14px;
                                    ">👁️</button>
                                </div>
                            </div>
                            <button type="submit" class="login-btn" style="
                                width: 100%;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                padding: 15px;
                                border: none;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: bold;
                                cursor: pointer;
                                justify-content: center;
                                margin-top: 10px;
                            ">Ingresar</button>
                        </form>
                        <div class="switch-form" style="text-align: center; margin-top: 15px; font-size: 0.9em; color: #b0b0b0;">
                            ¿No tienes cuenta? <a class="switch-link" style="color: #667eea; cursor: pointer; text-decoration: none;">Regístrate aquí</a>
                        </div>
                    </div>
                    
                    <div id="registerForm" class="login-form" style="display: none;">
                        <h3 style="text-align: center; margin-bottom: 20px; color: #e0e0e0;">Crear Cuenta</h3>
                        <div class="security-warning" style="
                            background: #3a3a2a;
                            border: 1px solid #ffd166;
                            border-radius: 5px;
                            padding: 10px;
                            margin-bottom: 15px;
                            font-size: 0.85em;
                            color: #ffd166;
                            text-align: center;
                        ">
                            ⚠️ No utilice claves de uso específico (bancarias, operadoras, etc.)
                        </div>
                        <form id="registerFormElement">
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regApellidoNombre" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Apellido y Nombre *</label>
                                <input type="text" id="regApellidoNombre" name="apellidoNombre" required style="
                                    width: 100%;
                                    padding: 10px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regLegajo" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Número de Legajo *</label>
                                <input type="number" id="regLegajo" name="legajo" required style="
                                    width: 100%;
                                    padding: 10px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regTurno" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Turno de Trabajo *</label>
                                <select id="regTurno" name="turno" required style="
                                    width: 100%;
                                    padding: 10px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                                    <option value="">Seleccione turno</option>
                                    <option value="Turno mañana">Turno mañana</option>
                                    <option value="Turno tarde">Turno tarde</option>
                                    <option value="Turno noche A">Turno noche A</option>
                                    <option value="Turno noche B">Turno noche B</option>
                                    <option value="Turno intermedio">Turno intermedio</option>
                                    <option value="Sábado, Domingo y feriado">Sábado, Domingo y feriado</option>
                                </select>
                            </div>
                            
                            <!-- NUEVO CAMPO: ÁREA DE TRABAJO -->
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regArea" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Área de Trabajo *</label>
                                <select id="regArea" name="area" required style="
                                    width: 100%;
                                    padding: 10px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                                    <option value="">Seleccione área</option>
                                    <option value="Camilleros">Camilleros</option>
                                    <option value="Asistentes">Asistentes</option>
                                    <option value="Enfermeros">Enfermeros</option>
                                    <option value="Personal general del Sanatorio">Personal general del Sanatorio</option>
                                    <option value="Otros profesionales de la salud">Otros profesionales de la salud</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regEmail" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Correo Electrónico *</label>
                                <input type="email" id="regEmail" name="email" required style="
                                    width: 100%;
                                    padding: 10px;
                                    border: 2px solid #3d3d5c;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    background: #1e1e2e;
                                    color: #e0e0e0;
                                ">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px; display: block;">
                                <label for="regPassword" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Contraseña *</label>
                                <div style="position: relative;">
                                    <input type="password" id="regPassword" name="password" required maxlength="15" style="
                                        width: 100%;
                                        padding: 10px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 14px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" data-target="regPassword" style="
                                        position: absolute;
                                        right: 10px;
                                        top: 50%;
                                        transform: translateY(-50%);
                                        background: none;
                                        border: none;
                                        cursor: pointer;
                                        color: #b0b0b0;
                                        font-size: 14px;
                                    ">👁️</button>
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 20px; display: block;">
                                <label for="regConfirmPassword" style="display: block; margin-bottom: 5px; font-weight: bold; color: #e0e0e0;">Repetir Contraseña *</label>
                                <div style="position: relative;">
                                    <input type="password" id="regConfirmPassword" name="confirmPassword" required maxlength="15" style="
                                        width: 100%;
                                        padding: 10px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 14px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" data-target="regConfirmPassword" style="
                                        position: absolute;
                                        right: 10px;
                                        top: 50%;
                                        transform: translateY(-50%);
                                        background: none;
                                        border: none;
                                        cursor: pointer;
                                        color: #b0b0b0;
                                        font-size: 14px;
                                    ">👁️</button>
                                </div>
                            </div>
                            <button type="submit" class="login-btn" style="
                                width: 100%;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                padding: 15px;
                                border: none;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: bold;
                                cursor: pointer;
                                margin-top: 10px;
                                justify-content: center;
                            ">Registrarse</button>
                        </form>
                        <div class="switch-form" style="text-align: center; margin-top: 15px; font-size: 0.9em; color: #b0b0b0;">
                            ¿Ya tienes cuenta? <a class="switch-link" style="color: #667eea; cursor: pointer; text-decoration: none;">Inicia sesión aquí</a>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);

            // Funcionalidad de toggle password
            overlay.querySelectorAll('.toggle-password').forEach(btn => {
                btn.addEventListener('click', function() {
                    const targetId = this.dataset.target;
                    const input = document.getElementById(targetId);
                    if (input.type === 'password') {
                        input.type = 'text';
                        this.textContent = '🙈';
                    } else {
                        input.type = 'password';
                        this.textContent = '👁️';
                    }
                });
            });

            const switchTab = (tabName) => {
                console.log('Cambiando a tab:', tabName);
                overlay.querySelectorAll('.login-tab').forEach(tab => {
                    tab.style.color = '#b0b0b0';
                    tab.style.borderBottom = 'none';
                });
                overlay.querySelectorAll('.login-form').forEach(form => {
                    form.style.display = 'none';
                });
                
                const activeTab = overlay.querySelector(`[data-tab="${tabName}"]`);
                const activeForm = overlay.querySelector(`#${tabName}Form`);
                
                if (activeTab && activeForm) {
                    activeTab.style.color = '#667eea';
                    activeTab.style.borderBottom = '3px solid #667eea';
                    activeForm.style.display = 'block';
                }
            };

            overlay.querySelectorAll('.login-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabName = e.target.getAttribute('data-tab');
                    switchTab(tabName);
                });
            });
            
            overlay.querySelectorAll('.switch-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    const currentForm = e.target.closest('.login-form');
                    if (currentForm.id === 'loginForm') {
                        switchTab('register');
                    } else {
                        switchTab('login');
                    }
                });
            });

            const showMessage = (formId, message, type) => {
                const form = overlay.querySelector(`#${formId}`);
                let messageDiv = form.querySelector('.message');
                if (!messageDiv) {
                    messageDiv = document.createElement('div');
                    messageDiv.className = 'message';
                    form.insertBefore(messageDiv, form.querySelector('form'));
                }
                messageDiv.textContent = message;
                messageDiv.style.cssText = `
                    padding: 10px;
                    border-radius: 5px;
                    margin-bottom: 15px;
                    text-align: center;
                    font-size: 0.9em;
                    ${type === 'error' ? 'background: #5a2d2d; color: #ff6b6b; border: 1px solid #ff6b6b;' : 'background: #2d5a2d; color: #6bff6b; border: 1px solid #6bff6b;'}
                `;
                
                if (type === 'success') {
                    setTimeout(() => {
                        if (messageDiv.parentNode) {
                            messageDiv.remove();
                        }
                    }, 3000);
                }
            };

            overlay.querySelector('#loginFormElement').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const identifier = formData.get('identifier');
                const password = formData.get('password');
                
                try {
                    const user = await this.login(identifier, password);
                    document.body.removeChild(overlay);
                    resolve(user);
                } catch (error) {
                    showMessage('loginForm', error.message, 'error');
                }
            });
            
            overlay.querySelector('#registerFormElement').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const userData = {
                    apellidoNombre: formData.get('apellidoNombre'),
                    legajo: formData.get('legajo'),
                    turno: formData.get('turno'),
                    area: formData.get('area'),
                    email: formData.get('email'),
                    password: formData.get('password'),
                    role: 'user'
                };
                const confirmPassword = formData.get('confirmPassword');
                
                try {
                    this.validatePassword(userData.password, confirmPassword);
                    await this.saveUserToCloud(userData);
                    showMessage('registerForm', '✅ Registro exitoso. Ahora puedes iniciar sesión.', 'success');
                    setTimeout(() => switchTab('login'), 2000);
                } catch (error) {
                    showMessage('registerForm', error.message, 'error');
                }
            });
            
            overlay.offsetHeight;
        });
    }
}

const authSystem = new AuthSystem();