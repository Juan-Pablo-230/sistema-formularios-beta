console.warn("Esta es una versión BETA del sistema de inscripciones. Puede contener errores o funcionalidades incompletas. Por favor, utilícelo con precaución y reporte cualquier problema al desarrollador.");

class AuthSystem {
    constructor() {
        console.log('AuthSystem MongoDB inicializado');
        // URL dinámica para Railway
        this.apiBaseUrl = window.location.origin + '/api';
        this.currentUser = null;
        this.init();
    }

    async makeRequest(endpoint, data = null, method = 'POST') {
        try {
            const user = this.getCurrentUser();
            const headers = {
                'Content-Type': 'application/json',
            };
            
            // Añadir user-id si el usuario está logueado
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
            
            console.log('🌐 Haciendo request a:', `${this.apiBaseUrl}${endpoint}`);
            console.log('👤 User ID en headers:', user?._id || 'No logueado');
            
            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
            
            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
                throw new Error(`El servidor devolvió: ${response.status} ${response.statusText}`);
            }
            
            if (!response.ok || !result.success) {
                throw new Error(result.message || `Error ${response.status}`);
            }
            
            return result;
        } catch (error) {
            console.error('Error en la solicitud:', error);
            throw error;
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
            
            this.currentUser = result.data;
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            
            console.log('✅ Login exitoso MongoDB:', this.currentUser.apellidoNombre);
            return this.currentUser;
            
        } catch (error) {
            throw error;
        }
    }

    async saveUserToCloud(userData) {
        try {
            const result = await this.makeRequest('/auth/register', userData);
            return true;
        } catch (error) {
            throw error;
        }
    }

    async createUserByAdmin(userData) {
        try {
            const result = await this.makeRequest('/admin/usuarios', userData);
            return true;
        } catch (error) {
            throw error;
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
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
            return result.data.exists;
        } catch (error) {
            console.error('Error verificando legajo:', error);
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

    // MÉTODO DE LOGIN MODAL
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
                                    <input type="password" id="loginPassword" name="password" required style="
                                        width: 100%;
                                        padding: 12px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 16px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" style="
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
                                    <input type="password" id="regPassword" name="password" required style="
                                        width: 100%;
                                        padding: 10px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 14px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" style="
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
                                    <input type="password" id="regConfirmPassword" name="confirmPassword" required style="
                                        width: 100%;
                                        padding: 10px;
                                        padding-right: 45px;
                                        border: 2px solid #3d3d5c;
                                        border-radius: 8px;
                                        font-size: 14px;
                                        background: #1e1e2e;
                                        color: #e0e0e0;
                                    ">
                                    <button type="button" class="toggle-password" style="
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

            const togglePasswordVisibility = (inputId, button) => {
                const input = document.getElementById(inputId);
                if (input.type === 'password') {
                    input.type = 'text';
                    button.textContent = '🙈';
                } else {
                    input.type = 'password';
                    button.textContent = '👁️';
                }
            };

            overlay.querySelectorAll('.toggle-password').forEach(button => {
                button.addEventListener('click', function() {
                    const inputId = this.parentElement.querySelector('input').id;
                    togglePasswordVisibility(inputId, this);
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