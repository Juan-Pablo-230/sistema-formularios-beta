let versionBeta = true; // Variable global para indicar que estamos en versión BETA

if (versionBeta == true) {
    console.warn("Esta es una versión BETA del sistema de inscripciones. Puede contener errores o funcionalidades incompletas. Por favor, utilícelo con precaución y reporte cualquier problema al desarrollador.");
    document.title = 'Sistema de inscripciones - BETA';
    const faviconUrl = '/img/logo-beta.png'; // Asegúrate de tener un ícono específico para la versión BETA
    const link = document.createElement('link');
    link.rel = 'shortcut icon';
    link.href = faviconUrl;
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
        logoImg.src = faviconUrl; // Cambia el logo en la página también
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
    const faviconUrl = '/img/logo-oficial.png'; // Ícono normal para producción
    const link = document.createElement('link');
    link.rel = 'shortcut icon';
    link.href = faviconUrl;
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
        logoImg.src = faviconUrl; // Cambia el logo en la página también
    }
    document.head.appendChild(link);
    const h1 = document.querySelector('.header-text h1');
    if (h1) {
        h1.textContent = 'Sistema de inscripciones';
    }
    const footer = document.querySelector('footer');
    if (footer) {
        footer.innerHTML = '<a href="https://sistema-formulario-beta-production.up.railway.app/" style="color: #667eea; text-decoration: none;">Ir a la versión BETA del sistema.</a>';
    }
}

// auth.js - Versión con modal de migración obligatorio

class AuthSystem {
    constructor() {
        console.log('AuthSystem MongoDB inicializado');
        this.apiBaseUrl = ''; // Vacío para rutas relativas
        this.currentUser = null;
        this.init();
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
            
            // Verificar el content-type
            const contentType = response.headers.get('content-type');
            
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON - La API no está disponible:', text.substring(0, 200));
                // Devolver un objeto de error pero NO lanzar excepción
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
            // Devolver objeto de error en lugar de lanzar
            return { 
                success: false, 
                message: error.message,
                error: 'NETWORK_ERROR',
                data: null
            };
        }
    }

    async init() {
        console.log('Inicializando sistema de auth con MongoDB...');
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            console.log('Usuario encontrado en localStorage:', this.currentUser);
        } else {
            console.log('No hay usuario en localStorage');
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
            
            // Si el usuario necesita migración (cambio de contraseña o aceptar TYC), mostrar modal
            /* if (this.currentUser.needsPasswordChange || this.currentUser.needsTyAceptacion) { */ //DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
            if (this.currentUser.needsPasswordChange) {
                await this.showMigrationModal();
            }
            
            return this.currentUser;
            
        } catch (error) {
            console.error('❌ Error en login:', error);
            throw error;
        }
    }

    // Muestra el modal obligatorio de migración
    async showMigrationModal() {
        return new Promise((resolve, reject) => {
            const user = this.currentUser;
            const needsPasswordChange = user.needsPasswordChange;
            
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
            
            // Contenido del modal
            overlay.innerHTML = `
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
                        Por motivos de seguridad, debes realizar los siguientes pasos antes de continuar:
                    </p>

                    /* Esto queda comentado temporalmente debido a que los recursos no están disponibles */
                    
                    /* <div style="margin-bottom: 25px; padding: 15px; background: #2a2f36; border-radius: 10px;">
                        <h3 style="margin-bottom: 15px; color: #ffd166;">📜 Términos y Condiciones</h3>
                        <p style="margin-bottom: 15px;">Para usar el sistema, debes aceptar nuestros Términos y Condiciones.</p>
                        <div style="text-align: center; margin-bottom: 15px;">
                            <a href="/tyc.pdf" target="_blank" style="
                                display: inline-block;
                                background: #4285f4;
                                color: white;
                                padding: 10px 20px;
                                border-radius: 5px;
                                text-decoration: none;
                                font-weight: bold;
                            ">📄 Ver Términos y Condiciones (PDF)</a>
                        </div>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="tycCheckbox" style="width: 18px; height: 18px;">
                            <span>He leído y acepto los Términos y Condiciones *</span>
                        </label>
                    </div> */ 
                    
                    ${needsPasswordChange ? `
                    <div style="margin-bottom: 25px; padding: 15px; background: #2a2f36; border-radius: 10px;">
                        <h3 style="margin-bottom: 15px; color: #ff6b6b;">🔐 Cambio de Contraseña Obligatorio</h3>
                        <p>Se detecto en el sistema una vulnerabilidad que permitia obtener las contraseñas de los usuarios. El error fue corregido, pero para mayor seguridad, debes cambiar tu contraseña.</p>
                        
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
                                ">👁️</button>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
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
            
            document.body.appendChild(overlay);
            
            // Funcionalidad de mostrar/ocultar contraseña
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
            
            // Manejar envío
            const migrateBtn = overlay.querySelector('#migrateBtn');
            /* const tycCheckbox = overlay.querySelector('#tycCheckbox'); */ //Desactivado temporalmente debido a que los recursos no están disponibles

            const advertencia = confirm(
                '⚠️  CAMBIO DE CONTRASEÑA  ⚠️\n\n' +
                'Al cambiar la contraseña:\n\n' +
                '❌ NO podrás acceder a la VERSIÓN ESTABLE\n' +
                '   (sistema-formularios-production)\n\n' +
                '✅ Solo podrás usar la VERSIÓN BETA\n' +
                '   (sistema-formulario-beta)\n\n' +
                '¿Estás seguro de continuar?'
            );

            if (!advertencia) {
                this.showMigrationMessage(overlay, 'Cambio de contraseña cancelado', 'info');
                return;
            }
            
            migrateBtn.addEventListener('click', async () => {
                // Validar TYC
                // Desactivado temporalmente debido a que los recursos no están disponibles
                /* if (!tycCheckbox.checked) {
                    this.showMigrationMessage(overlay, 'Debes aceptar los Términos y Condiciones', 'error');
                    return;
                } */
                
                // Preparar datos
                const data = {
                    /* aceptarTyC: true, */ //Desactivado temporalmente debido a que los recursos no están disponibles
                    currentPassword: needsPasswordChange ? overlay.querySelector('#currentPassword').value : ''

                };
                
                if (needsPasswordChange) {
                    /* const newPass = overlay.querySelector('#newPassword').value; */ //Desactivado temporalmente debido a que los recursos no están disponibles
                    const confirmPass = overlay.querySelector('#confirmNewPassword').value;
                    
                    if (!data.currentPassword) {
                        this.showMigrationMessage(overlay, 'Debes ingresar tu contraseña actual', 'error');
                        return;
                    }
                    if (!newPass || !confirmPass) {
                        this.showMigrationMessage(overlay, 'Debes ingresar una nueva contraseña', 'error');
                        return;
                    }
                    if (newPass.length < 7 || newPass.length > 15) {
                        this.showMigrationMessage(overlay, 'La nueva contraseña debe tener entre 8 y 15 caracteres', 'error');
                        return;
                    }
                    if (newPass !== confirmPass) {
                        this.showMigrationMessage(overlay, 'Las contraseñas nuevas no coinciden', 'error');
                        return;
                    }
                    data.newPassword = newPass;
                }
                
                try {
                    migrateBtn.disabled = true;
                    migrateBtn.textContent = 'Procesando...';
                    
                    const result = await this.makeRequest('/usuarios/migrar', data);
                    
                    if (result.success) {
                        // Actualizar usuario en localStorage
                        this.currentUser = result.data;
                        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                        
                        this.showMigrationMessage(overlay, '✅ Migración exitosa. Recargando...', 'success');
                        
                        setTimeout(() => {
                            overlay.remove();
                            // Recargar la página para reflejar cambios
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
        });
    }

    showMigrationMessage(overlay, text, type) {
        const msgDiv = overlay.querySelector('#migrationMessage');
        msgDiv.style.display = 'block';
        msgDiv.textContent = text;
        msgDiv.style.background = type === 'error' ? '#5a2d2d' : '#2d5a2d';
        msgDiv.style.color = type === 'error' ? '#ff6b6b' : '#6bff6b';
        msgDiv.style.border = type === 'error' ? '1px solid #ff6b6b' : '1px solid #6bff6b';
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
        if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
        }
        if (password.length > 15) {
            throw new Error('La contraseña no puede tener más de 15 caracteres');
        }
        return true;
    }

    async verifyCurrentPassword(password) {
        const user = this.getCurrentUser();
        if (!user) return false;
        // En un sistema real, esto debería verificar contra el backend
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

    // MÉTODO DE LOGIN MODAL (existente, sin cambios)
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