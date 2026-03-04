console.log('formularios.js cargado - Versión adaptada');

// Variable global para verificar si authSystem está disponible
let authSystemReady = false;
let claseInfo = null; // Guardar información de la clase actual

// Función para esperar a que authSystem esté disponible
function waitForAuthSystem() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 50;
        let attempts = 0;
        
        const checkAuth = () => {
            attempts++;
            if (typeof authSystem !== 'undefined' && authSystem !== null) {
                console.log('✅ authSystem cargado después de', attempts, 'intentos');
                authSystemReady = true;
                resolve(authSystem);
            } else if (attempts >= maxAttempts) {
                reject(new Error('authSystem no se cargó'));
            } else {
                setTimeout(checkAuth, 100);
            }
        };
        
        checkAuth();
    });
}

// Función segura para obtener el usuario actual
function getCurrentUserSafe() {
    if (authSystemReady && authSystem && typeof authSystem.getCurrentUser === 'function') {
        return authSystem.getCurrentUser();
    }
    return null;
}

// Función segura para verificar si está logueado
function isLoggedInSafe() {
    if (authSystemReady && authSystem && typeof authSystem.isLoggedIn === 'function') {
        return authSystem.isLoggedIn();
    }
    return false;
}

// Función segura para verificar si es admin
function isAdminSafe() {
    if (authSystemReady && authSystem && typeof authSystem.isAdmin === 'function') {
        return authSystem.isAdmin();
    }
    return false;
}

// Función segura para hacer requests
async function makeRequestSafe(endpoint, data = null, method = 'POST') {
    if (authSystemReady && authSystem && typeof authSystem.makeRequest === 'function') {
        return await authSystem.makeRequest(endpoint, data, method);
    }
    throw new Error('authSystem no disponible');
}

// Obtener el ID de clase (de window.CLASE_ID o de la URL)
function obtenerClaseId() {
    // Priorizar window.CLASE_ID (definido en formularios.html)
    if (window.CLASE_ID) {
        return window.CLASE_ID;
    }
    
    // Fallback: obtener de la URL
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('claseId');
}

// Función para obtener la clase actual (nombre)
function obtenerClaseActual() {
    if (claseInfo && claseInfo.nombre) {
        return claseInfo.nombre;
    }
    
    const selectClase = document.getElementById('clase');
    if (selectClase && selectClase.value) {
        return selectClase.value;
    }
    return null;
}

// Cargar información de la clase desde la API
async function cargarInformacionClase() {
    const claseId = obtenerClaseId();
    
    if (!claseId) {
        console.error('❌ No hay ID de clase');
        document.getElementById('claseTitulo').textContent = 'Error: Clase no especificada';
        return false;
    }
    
    try {
        console.log('📡 Cargando información de clase:', claseId);
        document.getElementById('claseTitulo').textContent = 'Cargando información de la clase...';
        
        // PRIMERO: Intentar cargar como clase pública
        console.log('🔍 Intentando cargar como clase pública...');
        let clase = null;
        let tipoClase = null;
        
        try {
            const response = await makeRequestSafe(`/clases-publicas/${claseId}`, null, 'GET');
            if (response && response.success && response.data) {
                clase = response.data;
                tipoClase = 'publica';
                console.log('✅ Clase pública cargada:', clase.nombre);
            }
        } catch (error) {
            console.log('⚠️ No es una clase pública, intentando como clase de gestión...');
        }
        
        // SEGUNDO: Si no es pública, intentar como clase de gestión (histórica)
        if (!clase) {
            try {
                const response = await makeRequestSafe(`/clases-historicas/${claseId}`, null, 'GET');
                if (response && response.success && response.data) {
                    clase = response.data;
                    tipoClase = 'historica';
                    console.log('✅ Clase de gestión cargada:', clase.nombre);
                }
            } catch (error) {
                console.log('⚠️ Tampoco es una clase de gestión');
            }
        }
        
        // TERCERO: Si ninguna funcionó, mostrar error
        if (!clase) {
            throw new Error('No se pudo cargar la información de la clase');
        }
        
        claseInfo = clase;
        claseInfo.tipo = tipoClase;
        
        // Actualizar título
        document.getElementById('claseTitulo').textContent = claseInfo.nombre || 'Clase sin nombre';
        
        // Actualizar indicador de clase
        const claseIndicador = document.getElementById('claseIndicador');
        const claseNombre = document.getElementById('claseNombre');
        const claseDetalles = document.getElementById('claseDetalles');
        const deadline = document.getElementById('deadline');
        
        if (claseIndicador && claseNombre) {
            claseNombre.textContent = claseInfo.nombre || 'Clase sin nombre';
            claseIndicador.style.display = 'block';
            
            // Mostrar detalles adicionales
            if (claseDetalles) {
                let detallesHTML = '';
                
                // Instructores (manejar diferentes formatos)
                if (claseInfo.instructores) {
                    let instructoresTexto = '';
                    if (Array.isArray(claseInfo.instructores)) {
                        instructoresTexto = claseInfo.instructores.join(', ');
                    } else if (typeof claseInfo.instructores === 'string') {
                        instructoresTexto = claseInfo.instructores;
                    }
                    if (instructoresTexto) {
                        detallesHTML += `<p><strong>Instructores:</strong> ${instructoresTexto}</p>`;
                    }
                }
                
                // Lugar (para clases públicas)
                if (claseInfo.lugar) {
                    detallesHTML += `<p><strong>Lugar:</strong> ${claseInfo.lugar}</p>`;
                }
                
                // Descripción
                if (claseInfo.descripcion) {
                    detallesHTML += `<p><strong>Descripción:</strong> ${claseInfo.descripcion}</p>`;
                }
                
                claseDetalles.innerHTML = detallesHTML;
            }
            
            // Actualizar deadline
            if (deadline && claseInfo.fechaClase) {
                try {
                    const fechaClase = new Date(claseInfo.fechaClase);
                    if (!isNaN(fechaClase.getTime())) {
                        const fechaLimite = new Date(fechaClase);
                        fechaLimite.setHours(20, 0, 0, 0); // 20:00 hrs del día de la clase
                        
                        const hoy = new Date();
                        if (fechaLimite > hoy) {
                            const diasRestantes = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
                            deadline.innerHTML = `⏰ <strong>Fecha límite de inscripción:</strong> ${fechaLimite.toLocaleDateString('es-AR')} hasta las 20:00 hrs (${diasRestantes} días restantes)`;
                        } else {
                            deadline.innerHTML = '⏰ <strong>Fecha límite de inscripción:</strong> Hoy hasta las 20:00 hrs';
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Error formateando fecha:', e);
                }
            }
        }
        
        // Actualizar select de clase
        const selectClase = document.getElementById('clase');
        const claseOption = document.getElementById('claseOption');
        
        if (selectClase && claseOption) {
            claseOption.value = claseInfo.nombre;
            claseOption.textContent = claseInfo.nombre;
            selectClase.value = claseInfo.nombre;
        }
        
        // Guardar enlace de redirección
        const enlaceRedireccion = document.getElementById('enlaceRedireccion');
        if (enlaceRedireccion) {
            if (claseInfo.enlaceFormulario) {
                enlaceRedireccion.value = claseInfo.enlaceFormulario;
            } else if (claseInfo.enlaces && claseInfo.enlaces.youtube) {
                enlaceRedireccion.value = claseInfo.enlaces.youtube;
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error cargando clase:', error);
        document.getElementById('claseTitulo').textContent = 'Error al cargar la clase';
        
        // Mostrar mensaje de error
        const claseIndicador = document.getElementById('claseIndicador');
        if (claseIndicador) {
            claseIndicador.style.display = 'block';
            claseIndicador.innerHTML = `
                <div style="color: #dc3545; padding: 15px; text-align: center;">
                    <strong>❌ Error:</strong> No se pudo cargar la información de la clase.
                    <br>
                    <small>ID: ${claseId}</small>
                    <br>
                    <button onclick="window.location.href='../index.html'" class="back-btn" style="margin-top: 10px;">
                        ← Volver al Menú Principal
                    </button>
                </div>
            `;
        }
        
        return false;
    }
}

// Verificar si el usuario ya completó el formulario
async function usuarioYaCompletoFormulario() {
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseNombre = obtenerClaseActual();
        const claseId = obtenerClaseId();
        
        console.log('🔍 Verificando inscripción:', {
            usuario: usuarioActual,
            claseNombre,
            claseId
        });
        
        if (!usuarioActual || !usuarioActual._id) {
            console.log('❌ No hay usuario logueado o no tiene _id');
            return false;
        }
        
        if (!claseNombre && !claseId) {
            console.log('❌ No se pudo determinar la clase');
            return false;
        }
        
        // Admins pueden ver el formulario siempre
        if (isAdminSafe()) {
            console.log('👑 Usuario admin, omitiendo verificación');
            return false;
        }
        
        // Verificar usando claseId si está disponible
        if (claseId) {
            try {
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${claseId}`, null, 'GET');
                if (result && result.data && result.data.exists) {
                    console.log('✅ Inscripción encontrada por claseId');
                    return true;
                }
            } catch (error) {
                console.log('⚠️ No se pudo verificar por claseId:', error);
            }
        }
        
        // Si no se encontró por claseId, buscar por nombre de clase
        if (claseNombre) {
            try {
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${encodeURIComponent(claseNombre)}`, null, 'GET');
                if (result && result.data && result.data.exists) {
                    console.log('✅ Inscripción encontrada por nombre de clase');
                    return true;
                }
            } catch (error) {
                console.log('⚠️ No se pudo verificar por nombre:', error);
            }
        }
        
        console.log('✅ No hay inscripción previa');
        return false;
        
    } catch (error) {
        console.error('❌ Error verificando formulario:', error);
        return false;
    }
}

// Obtener enlace de redirección
function obtenerEnlaceRedireccion() {
    const enlaceRedireccion = document.getElementById('enlaceRedireccion');
    if (enlaceRedireccion && enlaceRedireccion.value) {
        return enlaceRedireccion.value;
    }
    
    // Fallback: buscar enlace desde claseInfo
    if (claseInfo) {
        if (claseInfo.enlaceFormulario) {
            return claseInfo.enlaceFormulario;
        }
        if (claseInfo.enlaces && claseInfo.enlaces.youtube) {
            return claseInfo.enlaces.youtube;
        }
    }
    
    return null;
}

// Mostrar mensaje de formulario ya completado
function mostrarFormularioYaCompletado() {
    console.log('🔄 Mostrando mensaje de formulario ya completado...');
    
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    const claseNombre = obtenerClaseActual();
    const enlaceRedireccion = obtenerEnlaceRedireccion();
    
    if (!container) {
        console.error('❌ No se encontró el contenedor principal');
        return;
    }
    
    if (form) {
        form.style.display = 'none';
    }
    
    const mensajeAnterior = document.querySelector('.mensaje-ya-completado');
    if (mensajeAnterior) {
        mensajeAnterior.remove();
    }
    
    let contenidoEnlace = '';
    if (enlaceRedireccion) {
        contenidoEnlace = `
            <p style="color: #667eea; font-size: 1em; margin-bottom: 25px; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 8px; border-left: 4px solid #667eea;">
                <strong>¿Necesitas acceder a la clase?</strong><br>
                <a href="${enlaceRedireccion}" target="_blank" rel="noopener noreferrer"
                   style="color: #667eea; text-decoration: underline; font-weight: bold;">
                    Haz click aquí para ingresar a la clase
                </a>
            </p>
        `;
    } else {
        contenidoEnlace = `
            <p style="color: #888888; font-size: 0.9em; margin-bottom: 25px; padding: 15px; background: rgba(136, 136, 136, 0.1); border-radius: 8px; border-left: 4px solid #888888;">
                <em>Enlace de la clase no disponible</em>
            </p>
        `;
    }
    
    const mensaje = document.createElement('div');
    mensaje.className = 'mensaje-ya-completado';
    mensaje.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
            <h2 style="color: #28a745; margin-bottom: 15px;">Inscripción completada</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px; font-size: 1.1em;">
                ¡Gracias! Ya te has inscrito para:<br>
                <strong style="color: #e0e0e0;">${claseNombre || 'esta clase'}</strong>
            </p>
            <p style="color: #888888; font-size: 0.9em; margin-bottom: 20px;">
                No es necesario inscribirse nuevamente.
            </p>
            ${contenidoEnlace}
            <div style="margin-top: 20px;">
                <button onclick="window.location.href='../index.html'" class="back-btn" style="margin: 5px;">
                    ← Volver al Menú Principal
                </button>
                <button onclick="logoutSafe();" class="back-btn logout-btn" style="margin: 5px;">
                    Cerrar Sesión
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(mensaje);
    console.log('✅ Mensaje de inscripción completada mostrado');
}

// Función segura para logout
function logoutSafe() {
    if (authSystemReady && authSystem && typeof authSystem.logout === 'function') {
        authSystem.logout();
    }
    window.location.href = '../index.html';
}

// Mostrar error
function mostrarErrorVerificacion(mensaje) {
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    
    if (container && form) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mensaje-cierre';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 3em; margin-bottom: 15px;">⚠️</div>
                <h3 style="color: #dc3545; margin-bottom: 10px;">Error</h3>
                <p style="color: #b0b0b0;">${mensaje}</p>
                <button onclick="window.location.reload()" class="back-btn" style="margin-top: 15px;">
                    Reintentar
                </button>
            </div>
        `;
        
        form.parentNode.insertBefore(errorDiv, form);
        form.style.display = 'none';
    }
}

// Autocompletar desde usuario logueado
function autocompletarDesdeUsuario() {
    if (isLoggedInSafe()) {
        const user = getCurrentUserSafe();
        console.log('🔄 Autocompletando formulario con datos del usuario:', user);
        
        const apellidoNombre = document.getElementById('apellidoNombre');
        const legajo = document.getElementById('legajo');
        const email = document.getElementById('email');
        const turno = document.getElementById('turno');
        
        if (apellidoNombre) apellidoNombre.value = user.apellidoNombre || '';
        if (legajo) legajo.value = user.legajo || '';
        if (email) email.value = user.email || '';
        if (turno && user.turno) turno.value = user.turno;
    }
}

// Guardar inscripción
async function guardarInscripcion(formData) {
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseNombre = obtenerClaseActual();
        const claseId = obtenerClaseId();
        
        if (!usuarioActual || !usuarioActual._id) {
            throw new Error('Usuario no autenticado');
        }
        
        const inscripcionData = {
            usuarioId: usuarioActual._id,
            clase: claseNombre,
            turno: formData.get('turno'),
            fecha: new Date().toISOString()
        };
        
        // Agregar claseId si está disponible
        if (claseId) {
            inscripcionData.claseId = claseId;
        }
        
        console.log('💾 Guardando inscripción:', inscripcionData);
        const result = await makeRequestSafe('/inscripciones', inscripcionData);
        console.log('✅ Inscripción guardada:', result);
        return true;
        
    } catch (error) {
        console.error('❌ Error guardando inscripción:', error);
        throw error;
    }
}

// Validar y enviar formulario
async function validarFormulario(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('.submit-btn');
    const originalText = submitBtn ? submitBtn.textContent : 'Ingresar a la clase';
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Validando...';
        }
        
        // Verificar si ya se inscribió
        const yaCompleto = await usuarioYaCompletoFormulario();
        
        if (yaCompleto) {
            const claseNombre = obtenerClaseActual();
            const enlaceRedireccion = obtenerEnlaceRedireccion();
            
            let mensaje = `❌ Ya estás inscrito en: ${claseNombre}`;
            if (enlaceRedireccion) {
                mensaje += `\n\n¿Quieres ir a la clase ahora?`;
                if (confirm(mensaje)) {
                    window.open(enlaceRedireccion, '_blank');
                }
            } else {
                alert(mensaje);
            }
            
            mostrarFormularioYaCompletado();
            return false;
        }
        
        // Guardar inscripción
        if (submitBtn) submitBtn.textContent = '💾 Guardando...';
        const formData = new FormData(event.target);
        await guardarInscripcion(formData);
        
        // Redireccionar
        const enlaceRedireccion = obtenerEnlaceRedireccion();
        if (enlaceRedireccion) {
            window.location.href = enlaceRedireccion;
        } else {
            alert('✅ Inscripción completada con éxito');
            window.location.href = '../index.html';
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('❌ Error al procesar la inscripción: ' + error.message);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Crear opciones para admin
function crearOpcionesAdmin() {
    const backBtnContainer = document.querySelector('.back-btn-container');
    
    if (backBtnContainer && isLoggedInSafe() && isAdminSafe()) {
        const adminBtn = document.createElement('button');
        adminBtn.textContent = '📊 Panel Admin';
        adminBtn.className = 'back-btn admin-panel-btn';
        adminBtn.onclick = () => window.location.href = '/admin/dashboard.html';
        backBtnContainer.appendChild(adminBtn);
    }
}

// Inicializar aplicación
async function inicializarAplicacion() {
    console.log('🚀 Inicializando aplicación...');
    
    try {
        await waitForAuthSystem();
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarErrorVerificacion('Error al cargar el sistema de autenticación');
        return;
    }
    
    // Verificar login
    if (!isLoggedInSafe()) {
        try {
            await authSystem.showLoginModal();
        } catch (error) {
            console.log('❌ Login cancelado');
            window.location.href = '../index.html';
            return;
        }
    }
    
    // Cargar información de la clase
    const claseCargada = await cargarInformacionClase();
    if (!claseCargada) {
        mostrarErrorVerificacion('No se pudo cargar la información de la clase');
        return;
    }
    
    // Verificar si ya está inscrito
    try {
        const yaCompleto = await usuarioYaCompletoFormulario();
        if (yaCompleto) {
            mostrarFormularioYaCompletado();
            return;
        }
    } catch (error) {
        console.error('❌ Error en verificación:', error);
    }
    
    // Configurar formulario
    if (isAdminSafe()) {
        crearOpcionesAdmin();
    }
    
    autocompletarDesdeUsuario();
    
    const form = document.getElementById('inscripcionForm');
    if (form) {
        form.addEventListener('submit', validarFormulario);
    }
    
    // Botón de logout
    const backBtnContainer = document.querySelector('.back-btn-container');
    if (backBtnContainer && isLoggedInSafe()) {
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Cerrar Sesión';
        logoutBtn.className = 'back-btn logout-btn';
        logoutBtn.onclick = logoutSafe;
        backBtnContainer.appendChild(logoutBtn);
    }
    
    console.log('✅ Aplicación inicializada');
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, iniciando...');
    inicializarAplicacion();
});

// Debug
function debugEstado() {
    console.log('=== DEBUG ESTADO ===');
    console.log('claseId:', obtenerClaseId());
    console.log('claseInfo:', claseInfo);
    console.log('authSystemReady:', authSystemReady);
    console.log('Usuario logueado:', isLoggedInSafe());
    console.log('===================');
}

window.debugEstado = debugEstado;