class ProfileUpdater {
    constructor() {
        this.availableLegajos = new Set();
        this.materialButtonContainer = document.getElementById('materialButtonContainer');
        this.init();
    }

    async init() {
        await this.loadAvailableLegajos();
        this.checkUserStatus();
        this.setupEventListeners();
    }

    async loadAvailableLegajos() {
        try {
            console.log('📥 Cargando legajos disponibles...');
            
            const response = await fetch('/api/admin/usuarios', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    result.data.forEach(user => {
                        if (user.legajo) {
                            this.availableLegajos.add(user.legajo.toString());
                        }
                    });
                    console.log(`✅ ${this.availableLegajos.size} legajos cargados desde MongoDB`);
                }
            } else {
                console.error('⚠️ No se pudieron cargar los legajos desde MongoDB');
            }

        } catch (error) {
            console.error('❌ Error cargando legajos:', error);
        }
    }

    checkUserStatus() {
        if (authSystem && authSystem.isLoggedIn && authSystem.isLoggedIn()) {
            this.showUserInfo();
            this.hideGuestInfo();
        } else {
            this.hideUserInfo();
            this.showGuestInfo();
        }
    }

    showGuestInfo() {
        const guestInfo = document.getElementById('guestInfo');
        if (guestInfo) {
            guestInfo.style.display = 'block';
        }
    }

    hideGuestInfo() {
        const guestInfo = document.getElementById('guestInfo');
        if (guestInfo) {
            guestInfo.style.display = 'none';
        }
    }

    showUserInfo() {
        const user = authSystem.getCurrentUser();
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');

        if (user && userInfo && userName) {
            let roleBadge = '';
            if (user.role === 'admin') {
                roleBadge = ' 👑';
            } else if (user.role === 'advanced') {
                roleBadge = ' ⭐';
            }
            
            // Agregar área a la información mostrada
            userName.textContent = `👤 ${user.apellidoNombre} - Legajo: ${user.legajo} - Área: ${user.area || 'Sin especificar'}${roleBadge}`;
            userInfo.style.display = 'block';

            // Mostrar botón de material
            if (this.materialButtonContainer) {
                this.materialButtonContainer.style.display = 'block';
            }

            // Mostrar botón de panel de administración si es admin o avanzado
            this.showAdminPanelButton(user);

            const userActions = document.querySelector('.user-actions');
            if (userActions) {
                this.showCalendarButton(userActions);
            }
        }
    }

    showCalendarButton(userActions) {
        const existingCalendarBtn = document.getElementById('calendarBtn');
        if (existingCalendarBtn) {
            existingCalendarBtn.remove();
        }

        const calendarBtn = document.createElement('button');
        calendarBtn.id = 'calendarBtn';
        calendarBtn.className = 'calendar-btn';
        calendarBtn.innerHTML = '📅 Calendario Educativo';
        calendarBtn.onclick = () => {
            window.location.href = '/calendar.html';
        };

        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn) {
            adminPanelBtn.insertAdjacentElement('afterend', calendarBtn);
        } else {
            userActions.insertBefore(calendarBtn, userActions.firstChild);
        }
    }

    hideUserInfo() {
        const userInfo = document.getElementById('userInfo');
        if (userInfo) userInfo.style.display = 'none';
        if (this.materialButtonContainer) {
            this.materialButtonContainer.style.display = 'none';
        }
    }

    showAdminPanelButton(user) {
        const userActions = document.querySelector('.user-actions');
        if (!userActions) return;

        const existingAdminBtn = document.getElementById('adminPanelBtn');
        if (existingAdminBtn) {
            existingAdminBtn.remove();
        }

        if (user.role === 'admin' || user.role === 'advanced') {
            const adminPanelBtn = document.createElement('button');
            adminPanelBtn.id = 'adminPanelBtn';
            adminPanelBtn.className = 'admin-panel-btn';
            adminPanelBtn.innerHTML = user.role === 'admin' ? '👑 Panel de Administración' : '⭐ Panel Avanzado';
            adminPanelBtn.onclick = () => {
                window.location.href = '/admin/dashboard.html';
            };
            userActions.insertBefore(adminPanelBtn, userActions.firstChild);
        }
    }

    setupEventListeners() {
        const updateProfileBtn = document.getElementById('updateProfileBtn');
        if (updateProfileBtn) {
            updateProfileBtn.addEventListener('click', () => {
                this.showUpdateModal();
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (authSystem && authSystem.logout) {
                    authSystem.logout();
                }
                this.checkUserStatus();
                window.location.reload();
            });
        }

        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.showLoginModal();
            });
        }

        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                this.showRegisterModal();
            });
        }

        this.setupModalEvents();
    }

    async showLoginModal() {
        try {
            await authSystem.showLoginModal();
            this.checkUserStatus();
            window.location.reload();
        } catch (error) {
            console.log('Login cancelado o fallido');
        }
    }

    async showRegisterModal() {
        try {
            await authSystem.showLoginModal();
            const modal = document.querySelector('.login-overlay');
            if (modal) {
                const registerTab = modal.querySelector('[data-tab="register"]');
                if (registerTab) {
                    registerTab.click();
                }
            }
        } catch (error) {
            console.log('Modal no disponible');
            await authSystem.showLoginModal();
        }
    }

    setupModalEvents() {
        const modal = document.getElementById('updateProfileModal');
        if (!modal) return;

        const closeBtn = modal.querySelector('.close-modal');
        const cancelBtns = modal.querySelectorAll('.cancel-btn');
        const updateForm = document.getElementById('updateProfileForm');
        const deleteForm = document.getElementById('deleteAccountForm');
        const modalTabs = document.querySelectorAll('.modal-tab');

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideUpdateModal();
            });
        }

        if (cancelBtns) {
            cancelBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.hideUpdateModal();
                });
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (confirm('¿Estás seguro? Los cambios no guardados se perderán.')) {
                        this.hideUpdateModal();
                    }
                }
            });
        }

        if (modalTabs) {
            modalTabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    this.switchTab(e.target.dataset.tab);
                });
            });
        }

        if (updateForm) {
            updateForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleProfileUpdate();
            });

            const legajoInput = document.getElementById('updateLegajo');
            if (legajoInput) {
                legajoInput.addEventListener('blur', () => {
                    this.validateLegajo(legajoInput.value);
                });
            }
        }

        if (deleteForm) {
            deleteForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAccountDeletion();
            });
        }

        this.setupPasswordToggles();
    }

    setupPasswordToggles() {
        document.querySelectorAll('.toggle-password').forEach(button => {
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
    }

    switchTab(tabName) {
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.modal-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        const targetContent = document.getElementById(`${tabName}Tab`);
        
        if (targetTab) targetTab.classList.add('active');
        if (targetContent) targetContent.classList.add('active');
        
        this.clearMessages();
    }

    showUpdateModal() {
        const modal = document.getElementById('updateProfileModal');
        const user = authSystem.getCurrentUser();

        if (modal && user) {
            document.getElementById('updateApellidoNombre').value = user.apellidoNombre || '';
            document.getElementById('updateLegajo').value = user.legajo || '';
            document.getElementById('updateTurno').value = user.turno || '';
            document.getElementById('updateArea').value = user.area || ''; // 👈 NUEVO CAMPO
            document.getElementById('updateEmail').value = user.email || '';
            document.getElementById('updateCurrentPassword').value = '';
            document.getElementById('updatePassword').value = '';
            document.getElementById('updateConfirmPassword').value = '';
            document.getElementById('deleteCurrentPassword').value = '';
            
            const deleteConfirmation = document.getElementById('deleteConfirmation');
            if (deleteConfirmation) deleteConfirmation.checked = false;

            this.hideLegajoWarning();
            this.clearMessages();
            this.switchTab('update');
            
            // Bloquear scroll del fondo
            document.body.style.overflow = 'hidden';
            
            modal.style.display = 'flex';
        }
    }

    hideUpdateModal() {
        const modal = document.getElementById('updateProfileModal');
        if (modal) {
            modal.style.display = 'none';
            // Restaurar scroll
            document.body.style.overflow = '';
            this.clearMessages();
            this.hideLegajoWarning();
        }
    }

    clearMessages() {
        const messages = document.querySelectorAll('.message');
        messages.forEach(msg => msg.remove());
    }

    showMessage(message, type) {
        this.clearMessages();
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;

        const activeTab = document.querySelector('.modal-tab-content.active');
        if (activeTab) {
            const form = activeTab.querySelector('form');
            if (form) {
                form.insertBefore(messageDiv, form.firstChild);
            }
        }

        if (type === 'success') {
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 5000);
        }
    }

    validateLegajo(legajo) {
        const user = authSystem.getCurrentUser();
        const warningElement = document.querySelector('.legajo-warning');
        
        if (!legajo || !warningElement) return;

        if (this.availableLegajos.has(legajo) && legajo !== user.legajo.toString()) {
            warningElement.style.display = 'block';
            return false;
        } else {
            warningElement.style.display = 'none';
            return true;
        }
    }

    hideLegajoWarning() {
        const warningElement = document.querySelector('.legajo-warning');
        if (warningElement) {
            warningElement.style.display = 'none';
        }
    }

    async verifyCurrentPassword(password) {
        try {
            const user = authSystem.getCurrentUser();
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identifier: user.email,
                    password: password
                })
            });

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
                return false;
            }

            const result = await response.json();
            return result.success;

        } catch (error) {
            console.error('Error verificando contraseña:', error);
            return false;
        }
    }

    async handleProfileUpdate() {
        const formData = new FormData(document.getElementById('updateProfileForm'));
        const user = authSystem.getCurrentUser();
        
        const currentPassword = formData.get('currentPassword');
        const updatedData = {
            apellidoNombre: formData.get('apellidoNombre'),
            legajo: formData.get('legajo'),
            turno: formData.get('turno'),
            area: formData.get('area'), // 👈 NUEVO CAMPO
            email: formData.get('email')
        };

        if (!this.validateUpdateForm(updatedData, currentPassword)) {
            return;
        }

        if (!this.validateLegajo(updatedData.legajo)) {
            this.showMessage('❌ El número de legajo ya está registrado. Use su cuenta existente.', 'error');
            return;
        }

        const isPasswordCorrect = await this.verifyCurrentPassword(currentPassword);
        if (!isPasswordCorrect) {
            this.showMessage('❌ La contraseña actual es incorrecta', 'error');
            return;
        }

        const newPassword = formData.get('password');
        if (newPassword) {
            const confirmPassword = formData.get('confirmPassword');
            if (!this.validateNewPassword(newPassword, confirmPassword)) {
                return;
            }
            updatedData.password = newPassword;
        }

        try {
            const success = await this.updateUserInMongoDB(user, updatedData, currentPassword);
            
            if (success) {
                this.showMessage('✅ Datos actualizados correctamente', 'success');
                
                setTimeout(() => {
                    this.hideUpdateModal();
                    this.checkUserStatus();
                    window.location.reload();
                }, 2000);
            } else {
                this.showMessage('❌ Error al actualizar los datos. Intente nuevamente.', 'error');
            }
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            this.showMessage('❌ Error al actualizar los datos: ' + error.message, 'error');
        }
    }

    validateUpdateForm(data, currentPassword) {
        if (!currentPassword) {
            this.showMessage('❌ La contraseña actual es obligatoria', 'error');
            return false;
        }

        if (!data.apellidoNombre || !data.legajo || !data.turno || !data.area || !data.email) {
            this.showMessage('❌ Todos los campos marcados con * son obligatorios', 'error');
            return false;
        }

        return true;
    }

    validateNewPassword(newPassword, confirmPassword) {
        if (newPassword && newPassword.length < 6) {
            this.showMessage('❌ La nueva contraseña debe tener al menos 6 caracteres', 'error');
            return false;
        }
        if (newPassword && newPassword.length > 15) {
            this.showMessage('❌ La nueva contraseña no puede tener más de 15 caracteres', 'error');
            return false;
        }
        if (newPassword && newPassword !== confirmPassword) {
            this.showMessage('❌ Las contraseñas no coinciden', 'error');
            return false;
        }
        return true;
    }

    async handleAccountDeletion() {
        const formData = new FormData(document.getElementById('deleteAccountForm'));
        const currentPassword = formData.get('currentPassword');
        const confirmation = formData.get('confirmation');
        const user = authSystem.getCurrentUser();

        if (!currentPassword) {
            this.showMessage('❌ La contraseña actual es obligatoria', 'error');
            return;
        }

        if (!confirmation) {
            this.showMessage('❌ Debe confirmar que entiende las consecuencias', 'error');
            return;
        }

        const isPasswordCorrect = await this.verifyCurrentPassword(currentPassword);
        if (!isPasswordCorrect) {
            this.showMessage('❌ La contraseña actual es incorrecta', 'error');
            return;
        }

        const finalConfirmation = confirm(
            '⚠️ ¿ESTÁ SEGURO/A DE ELIMINAR SU CUENTA?\n\n' +
            'Esta acción NO se puede deshacer.\n' +
            'Sus formularios completados permanecerán en el sistema.\n\n' +
            'Escriba "ELIMINAR" para confirmar:'
        );

        if (!finalConfirmation) {
            return;
        }

        const userInput = prompt('Escriba "ELIMINAR" para confirmar la eliminación:');
        if (userInput !== 'ELIMINAR') {
            this.showMessage('❌ Eliminación cancelada', 'error');
            return;
        }

        try {
            const success = await this.deleteUserFromMongoDB(user, currentPassword);
            
            if (success) {
                this.showMessage('✅ Cuenta eliminada correctamente', 'success');
                
                setTimeout(() => {
                    authSystem.logout();
                    this.hideUpdateModal();
                    this.checkUserStatus();
                    window.location.reload();
                }, 2000);
            } else {
                this.showMessage('❌ Error al eliminar la cuenta. Intente nuevamente.', 'error');
            }
        } catch (error) {
            console.error('Error eliminando cuenta:', error);
            this.showMessage('❌ Error al eliminar la cuenta: ' + error.message, 'error');
        }
    }

    async updateUserInMongoDB(oldUser, newData, currentPassword) {
        try {
            const response = await fetch('/api/usuarios/perfil', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': oldUser._id
                },
                body: JSON.stringify({
                    ...newData,
                    currentPassword: currentPassword
                })
            });

            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
                throw new Error(`El servidor devolvió HTML (${response.status}). Ruta no encontrada.`);
            }
            
            if (result.success) {
                const updatedUser = { ...oldUser, ...newData };
                authSystem.currentUser = updatedUser;
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                
                console.log('✅ Perfil actualizado en MongoDB');
                return true;
            } else {
                throw new Error(result.message || 'Error desconocido al actualizar perfil');
            }

        } catch (error) {
            console.error('❌ Error actualizando perfil en MongoDB:', error);
            throw error;
        }
    }

    async deleteUserFromMongoDB(user, currentPassword) {
        try {
            const response = await fetch('/api/usuarios/cuenta', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': user._id
                },
                body: JSON.stringify({
                    currentPassword: currentPassword
                })
            });

            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
                throw new Error(`El servidor devolvió HTML (${response.status}). Ruta no encontrada.`);
            }

            if (result.success) {
                console.log('✅ Usuario eliminado de MongoDB');
                return true;
            } else {
                throw new Error(result.message || 'Error desconocido al eliminar usuario');
            }

        } catch (error) {
            console.error('❌ Error eliminando usuario de MongoDB:', error);
            throw error;
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    const checkAuthSystem = setInterval(() => {
        if (typeof authSystem !== 'undefined') {
            clearInterval(checkAuthSystem);
            window.profileUpdater = new ProfileUpdater();
        }
    }, 100);
});

// Override del método login de authSystem para actualizar la UI
if (typeof authSystem !== 'undefined') {
    const originalLogin = authSystem.login;
    authSystem.login = async function(...args) {
        const result = await originalLogin.apply(this, args);
        if (window.profileUpdater) {
            window.profileUpdater.checkUserStatus();
        }
        return result;
    };
}