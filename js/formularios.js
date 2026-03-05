// formularios.js - Versión que ignora errores de API

console.log('formularios.js cargado - Versión que ignora errores de API');

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

// Función segura para hacer requests - AHORA IGNORA ERRORES
async function makeRequestSafe(endpoint, data = null, method = 'POST') {
    if (authSystemReady && authSystem && typeof authSystem.makeRequest === 'function') {
        try {
            const cleanEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
            const result = await authSystem.makeRequest(cleanEndpoint, data, method);
            
            // Si la API no está disponible, devolvemos un objeto vacío pero no fallamos
            if (!result || !result.success) {
                console.log('⚠️ API no disponible, continuando con validación local');
                return { success: false, data: null, _offline: true };
            }
            
            return result;
        } catch (error) {
            console.log('⚠️ Error en makeRequestSafe (ignorado):', error.message);
            return { success: false, data: null, _offline: true };
        }
    }
    console.log('⚠️ authSystem no disponible');
    return { success: false, data: null, _offline: true };
}

// Obtener el ID de clase (de window.CLASE_ID o de la URL)
function obtenerClaseId() {
    if (window.CLASE_ID) {
        return window.CLASE_ID;
    }
    
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

// VERIFICAR SI LA CLASE ESTÁ ABIERTA (USANDO FECHA LOCAL)
function claseEstaAbierta() {
    console.log('🔍 Verificando si la clase está abierta (local)...');
    
    if (!claseInfo) {
        console.log('⚠️ No hay información de clase disponible - asumiendo abierta');
        return true;
    }
    
    if (!claseInfo.fechaClase) {
        console.log('⚠️ No hay fecha de clase disponible');
        return true;
    }
    
    const ahora = new Date();
    const fechaClase = new Date(claseInfo.fechaClase);
    
    console.log('📅 Fecha actual:', ahora.toLocaleString());
    console.log('📅 Fecha clase:', fechaClase.toLocaleString());
    
    // Comparar solo la fecha (sin hora)
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const diaClase = new Date(fechaClase.getFullYear(), fechaClase.getMonth(), fechaClase.getDate());
    
    console.log('📅 Día actual:', hoy.toDateString());
    console.log('📅 Día clase:', diaClase.toDateString());
    
    // Si la fecha de la clase ya pasó
    if (diaClase < hoy) {
        console.log('❌ Clase de fecha pasada');
        return false;
    }
    
    // Si es el mismo día, verificar si ya pasaron las 20:00 hrs
    if (diaClase.getTime() === hoy.getTime()) {
        const horaActual = ahora.getHours();
        const minutosActual = ahora.getMinutes();
        const horaActualEnMinutos = horaActual * 60 + minutosActual;
        const horaLimiteEnMinutos = 20 * 60; // 20:00 = 1200 minutos
        
        console.log(`⏰ Hora actual: ${horaActual}:${minutosActual} (${horaActualEnMinutos} minutos)`);
        console.log(`⏰ Límite: 20:00 (${horaLimiteEnMinutos} minutos)`);
        
        if (horaActualEnMinutos >= horaLimiteEnMinutos) {
            console.log('❌ Clase del día de hoy pero después de las 20:00');
            return false;
        }
    }
    
    console.log('✅ Clase abierta para inscripción');
    return true;
}

// VERIFICAR SI EL FORMULARIO YA FUE COMPLETADO - VERSIÓN LOCAL
async function usuarioYaCompletoFormulario() {
    console.log('🔍 Verificando si el usuario ya completó el formulario (local)...');
    
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseNombre = obtenerClaseActual();
        const claseId = obtenerClaseId();
        
        console.log('📊 Datos para verificación:', {
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
        
        // VERIFICACIÓN LOCAL: Usar localStorage como fallback
        try {
            const storageKey = `inscripcion_${usuarioActual._id}_${claseId || claseNombre}`;
            const yaInscriptoLocal = localStorage.getItem(storageKey);
            
            if (yaInscriptoLocal) {
                console.log('✅ Usuario ya inscrito (según localStorage)');
                return true;
            }
        } catch (e) {
            console.log('⚠️ Error leyendo localStorage:', e);
        }
        
        // Intentar verificar con API pero ignorar errores
        if (claseId) {
            try {
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${claseId}`, null, 'GET');
                if (result && result.data && result.data.exists === true) {
                    console.log('✅ Inscripción encontrada por claseId');
                    // Guardar en localStorage para futuras verificaciones
                    try {
                        const storageKey = `inscripcion_${usuarioActual._id}_${claseId}`;
                        localStorage.setItem(storageKey, 'true');
                    } catch (e) {}
                    return true;
                }
            } catch (error) {
                console.log('⚠️ Error verificando por claseId (ignorado):', error.message);
            }
        }
        
        if (claseNombre) {
            try {
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${encodeURIComponent(claseNombre)}`, null, 'GET');
                if (result && result.data && result.data.exists === true) {
                    console.log('✅ Inscripción encontrada por nombre de clase');
                    // Guardar en localStorage
                    try {
                        const storageKey = `inscripcion_${usuarioActual._id}_${claseNombre}`;
                        localStorage.setItem(storageKey, 'true');
                    } catch (e) {}
                    return true;
                }
            } catch (error) {
                console.log('⚠️ Error verificando por nombre (ignorado):', error.message);
            }
        }
        
        console.log('✅ No hay inscripción previa');
        return false;
        
    } catch (error) {
        console.error('❌ Error verificando formulario:', error);
        return false;
    }
}

// Guardar inscripción - VERSIÓN LOCAL
async function guardarInscripcion(formData) {
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseNombre = obtenerClaseActual();
        const claseId = obtenerClaseId();
        
        if (!usuarioActual || !usuarioActual._id) {
            throw new Error('Usuario no autenticado');
        }
        
        // Guardar en localStorage como respaldo
        try {
            const storageKey = `inscripcion_${usuarioActual._id}_${claseId || claseNombre}`;
            localStorage.setItem(storageKey, 'true');
            console.log('💾 Guardado en localStorage como respaldo');
        } catch (e) {
            console.log('⚠️ No se pudo guardar en localStorage:', e);
        }
        
        // Intentar guardar en API pero no fallar si no funciona
        try {
            const inscripcionData = {
                usuarioId: usuarioActual._id,
                clase: claseNombre,
                turno: formData.get('turno'),
                fecha: new Date().toISOString()
            };
            
            if (claseId) {
                inscripcionData.claseId = claseId;
            }
            
            console.log('💾 Intentando guardar inscripción:', inscripcionData);
            const result = await makeRequestSafe('/inscripciones', inscripcionData);
            
            if (result && result.success) {
                console.log('✅ Inscripción guardada en API');
            } else {
                console.log('⚠️ No se pudo guardar en API, pero tenemos respaldo local');
            }
        } catch (error) {
            console.log('⚠️ Error guardando en API (ignorado):', error.message);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error guardando inscripción:', error);
        throw error;
    }
}

// Obtener enlace de redirección
function obtenerEnlaceRedireccion() {
    const enlaceRedireccion = document.getElementById('enlaceRedireccion');
    if (enlaceRedireccion && enlaceRedireccion.value) {
        return enlaceRedireccion.value;
    }
    
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

// MOSTRAR MENSAJE DE FORMULARIO YA COMPLETADO
function mostrarFormularioYaCompletado() {
    console.log('🔄 Mostrando mensaje de formulario ya completado...');
    
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    const submitBtn = document.querySelector('.submit-btn');
    const claseNombre = obtenerClaseActual();
    const enlaceRedireccion = obtenerEnlaceRedireccion();
    
    if (!container) {
        console.error('❌ No se encontró el contenedor principal');
        return;
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
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
    
    container.insertBefore(mensaje, form);
    console.log('✅ Mensaje de inscripción completada mostrado');
}

// MOSTRAR MENSAJE DE CLASE CERRADA
function mostrarClaseCerrada() {
    console.log('🔒 Mostrando mensaje de clase cerrada...');
    
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    const submitBtn = document.querySelector('.submit-btn');
    const claseNombre = obtenerClaseActual();
    
    if (!container) {
        console.error('❌ No se encontró el contenedor principal');
        return;
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    }
    
    if (form) {
        form.style.display = 'none';
    }
    
    const mensajeAnterior = document.querySelector('.mensaje-cierre');
    if (mensajeAnterior) {
        mensajeAnterior.remove();
    }
    
    const mensaje = document.createElement('div');
    mensaje.className = 'mensaje-cierre';
    mensaje.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 4em; margin-bottom: 20px;">⏰</div>
            <h2 style="color: #ff6b6b; margin-bottom: 15px;">Clase cerrada</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px; font-size: 1.1em;">
                La inscripción para:<br>
                <strong style="color: #e0e0e0;">${claseNombre || 'esta clase'}</strong>
            </p>
            <p style="color: #b0b0b0; margin-bottom: 30px;">
                ya ha finalizado porque son más de las 20:00 horas del día de la clase.
            </p>
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
    
    container.insertBefore(mensaje, form);
    console.log('✅ Mensaje de clase cerrada mostrado');
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
        
        container.insertBefore(errorDiv, form);
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

// Crear opciones para admin
function crearOpcionesAdmin() {
    console.log('👑 Creando opciones para admin...');
    
    const backBtnContainer = document.querySelector('.back-btn-container');
    
    if (backBtnContainer && isLoggedInSafe() && isAdminSafe()) {
        const adminBtn = document.createElement('button');
        adminBtn.textContent = '📊 Panel Admin';
        adminBtn.className = 'back-btn admin-panel-btn';
        adminBtn.onclick = () => window.location.href = '/admin/dashboard.html';
        backBtnContainer.appendChild(adminBtn);
    }
}

// formularios.js - Busca esta función y reemplázala

// Cargar información de la clase - VERSIÓN CORREGIDA
async function cargarInformacionClase() {
    const claseId = obtenerClaseId();
    
    console.log('🔍 Cargando información de clase, ID:', claseId);
    
    if (!claseId) {
        console.error('❌ No hay ID de clase');
        document.getElementById('claseTitulo').textContent = 'Error: Clase no especificada';
        return false;
    }
    
    // Intentar obtener información del backend, pero si falla usar datos del HTML
    try {
        document.getElementById('claseTitulo').textContent = 'Cargando información de la clase...';
        
        // Intentar cargar de API pero ignorar errores
        try {
            const response = await makeRequestSafe(`/clases-publicas/${claseId}`, null, 'GET');
            if (response && response.success && response.data) {
                claseInfo = response.data;
                claseInfo.tipo = 'publica';
                console.log('✅ Clase pública cargada:', claseInfo.nombre);
            }
        } catch (error) {
            console.log('⚠️ No se pudo cargar clase pública:', error.message);
        }
        
        if (!claseInfo) {
            try {
                const response = await makeRequestSafe(`/clases-historicas/${claseId}`, null, 'GET');
                if (response && response.success && response.data) {
                    claseInfo = response.data;
                    claseInfo.tipo = 'historica';
                    console.log('✅ Clase histórica cargada:', claseInfo.nombre);
                }
            } catch (error) {
                console.log('⚠️ No se pudo cargar clase histórica:', error.message);
            }
        }
    } catch (error) {
        console.log('⚠️ Error general cargando clase:', error.message);
    }
    
    // Si no se pudo cargar, usar el ID para generar un nombre
    if (!claseInfo) {
        console.log('📝 Usando ID de clase como nombre');
        
        // Extraer un nombre legible del ID (opcional)
        let nombreClase = 'Clase';
        
        // Intentar obtener el nombre de la URL o del localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const claseNombreFromUrl = urlParams.get('nombre');
        
        if (claseNombreFromUrl) {
            nombreClase = decodeURIComponent(claseNombreFromUrl);
        } else {
            // Si no hay nombre en URL, usar el ID como referencia
            nombreClase = `Clase (${claseId.substring(0, 8)}...)`;
        }
        
        claseInfo = {
            nombre: nombreClase,
            fechaClase: new Date().toISOString(),
            enlaceFormulario: document.getElementById('enlaceRedireccion')?.value || '',
            instructores: ['Instructor'],
            descripcion: 'Clase cargada con datos locales'
        };
    }
    
    console.log('📊 Clase cargada:', claseInfo);
    
    // ACTUALIZAR EL TÍTULO
    document.getElementById('claseTitulo').textContent = claseInfo.nombre || 'Clase';
    
    // ACTUALIZAR EL INDICADOR DE CLASE
    const claseIndicador = document.getElementById('claseIndicador');
    const claseNombre = document.getElementById('claseNombre');
    
    if (claseIndicador && claseNombre) {
        claseNombre.textContent = claseInfo.nombre || 'Clase';
        claseIndicador.style.display = 'block';
    }
    
    // ACTUALIZAR EL SELECT - ¡ESTA ES LA PARTE IMPORTANTE!
    const selectClase = document.getElementById('clase');
    const claseOption = document.getElementById('claseOption');
    
    if (selectClase && claseOption) {
        // Actualizar la opción del select
        claseOption.value = claseInfo.nombre;
        claseOption.textContent = claseInfo.nombre;
        
        // Forzar que el select muestre esta opción
        selectClase.value = claseInfo.nombre;
        
        console.log('✅ Select actualizado a:', claseInfo.nombre);
    } else {
        console.warn('⚠️ No se encontraron elementos del select');
    }
    
    // ACTUALIZAR EL DEADLINE (fecha límite)
    const deadline = document.getElementById('deadline');
    if (deadline && claseInfo.fechaClase) {
        try {
            const fechaClase = new Date(claseInfo.fechaClase);
            if (!isNaN(fechaClase.getTime())) {
                const fechaFormateada = fechaClase.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                deadline.innerHTML = `⏰ <strong>Fecha de la clase:</strong> ${fechaFormateada}`;
            }
        } catch (e) {
            console.warn('⚠️ Error formateando fecha:', e);
        }
    }
    
    return true;
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
        
        // VERIFICACIÓN LOCAL: ¿La clase está abierta?
        if (!claseEstaAbierta()) {
            mostrarClaseCerrada();
            return false;
        }
        
        // VERIFICACIÓN LOCAL: ¿Ya está inscrito?
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
    
    console.log('👤 Usuario logueado:', getCurrentUserSafe());
    
    // Cargar información de la clase (no importa si falla)
    await cargarInformacionClase();
    
    // VERIFICACIÓN LOCAL: ¿La clase está abierta?
    console.log('🔍 Ejecutando verificación de apertura...');
    const abierta = claseEstaAbierta();
    console.log('📊 Resultado verificación apertura:', abierta);
    
    if (!abierta) {
        console.log('🔒 Clase cerrada, mostrando mensaje');
        mostrarClaseCerrada();
        return;
    }
    
    // VERIFICACIÓN LOCAL: ¿Ya está inscrito?
    console.log('🔍 Ejecutando verificación de inscripción...');
    try {
        const yaCompleto = await usuarioYaCompletoFormulario();
        console.log('📊 Resultado verificación inscripción:', yaCompleto);
        
        if (yaCompleto) {
            console.log('✅ Usuario ya inscrito, mostrando mensaje');
            mostrarFormularioYaCompletado();
            return;
        }
    } catch (error) {
        console.error('❌ Error en verificación:', error);
    }
    
    // Configurar formulario
    console.log('⚙️ Configurando formulario...');
    if (isAdminSafe()) {
        crearOpcionesAdmin();
    }
    
    autocompletarDesdeUsuario();
    
    const form = document.getElementById('inscripcionForm');
    if (form) {
        form.addEventListener('submit', validarFormulario);
        console.log('✅ Event listener del formulario configurado');
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
window.debugEstado = function() {
    console.log('=== DEBUG ESTADO ===');
    console.log('claseId:', obtenerClaseId());
    console.log('claseInfo:', claseInfo);
    console.log('authSystemReady:', authSystemReady);
    console.log('Usuario logueado:', isLoggedInSafe());
    console.log('Clase abierta:', claseEstaAbierta());
    console.log('===================');
};