console.log('formularios.js cargado - Versión con logging mejorado');

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

// Función segura para hacer requests - CORREGIDA para evitar doble /api
async function makeRequestSafe(endpoint, data = null, method = 'POST') {
    if (authSystemReady && authSystem && typeof authSystem.makeRequest === 'function') {
        // Asegurarse de que endpoint no tenga /api al principio
        const cleanEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
        return await authSystem.makeRequest(cleanEndpoint, data, method);
    }
    throw new Error('authSystem no disponible');
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

// VERIFICAR SI LA CLASE ESTÁ ABIERTA (antes de las 20:00 del día de la clase)
function claseEstaAbierta() {
    console.log('🔍 Verificando si la clase está abierta...');
    
    if (!claseInfo) {
        console.log('⚠️ No hay información de clase disponible - asumiendo abierta por defecto');
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
        
        // Si ya pasaron las 20:00, la clase está cerrada
        if (horaActualEnMinutos >= horaLimiteEnMinutos) {
            console.log('❌ Clase del día de hoy pero después de las 20:00');
            return false;
        }
    }
    
    console.log('✅ Clase abierta para inscripción');
    return true;
}

// VERIFICAR SI EL FORMULARIO YA FUE COMPLETADO POR EL USUARIO
async function usuarioYaCompletoFormulario() {
    console.log('🔍 Verificando si el usuario ya completó el formulario...');
    
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
        
        // PRIMERO: Intentar verificar por claseId (más preciso)
        if (claseId) {
            try {
                console.log(`🔍 Verificando por claseId: ${claseId}`);
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${claseId}`, null, 'GET');
                console.log('📊 Resultado verificación por claseId:', result);
                
                if (result && result.data) {
                    if (result.data.exists === true) {
                        console.log('✅ Inscripción encontrada por claseId');
                        return true;
                    }
                }
            } catch (error) {
                console.log('⚠️ Error verificando por claseId:', error.message);
            }
        }
        
        // SEGUNDO: Intentar verificar por nombre de clase
        if (claseNombre) {
            try {
                console.log(`🔍 Verificando por nombre: ${claseNombre}`);
                const result = await makeRequestSafe(`/inscripciones/verificar/${usuarioActual._id}/${encodeURIComponent(claseNombre)}`, null, 'GET');
                console.log('📊 Resultado verificación por nombre:', result);
                
                if (result && result.data) {
                    if (result.data.exists === true) {
                        console.log('✅ Inscripción encontrada por nombre de clase');
                        return true;
                    }
                }
            } catch (error) {
                console.log('⚠️ Error verificando por nombre:', error.message);
            }
        }
        
        console.log('✅ No hay inscripción previa');
        return false;
        
    } catch (error) {
        console.error('❌ Error verificando formulario:', error);
        return false;
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
        
        console.log('💾 Intentando guardar inscripción:', inscripcionData);
        const result = await makeRequestSafe('/inscripciones', inscripcionData);
        console.log('✅ Inscripción guardada:', result);
        return true;
        
    } catch (error) {
        console.error('❌ Error guardando inscripción:', error);
        
        if (error.message && error.message.includes('Ya estás inscrito')) {
            mostrarFormularioYaCompletado();
        }
        
        throw error;
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
    
    // Deshabilitar el botón de envío
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    }
    
    // Ocultar el formulario
    if (form) {
        form.style.display = 'none';
    }
    
    // Remover mensaje anterior si existe
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
    
    // Insertar el mensaje antes del formulario
    container.insertBefore(mensaje, form);
    console.log('✅ Mensaje de inscripción completada mostrado');
}

// MOSTRAR MENSAJE DE CLASE CERRADA (DESPUÉS DE LAS 20:00)
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
    
    // Deshabilitar el botón de envío
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    }
    
    // Ocultar el formulario
    if (form) {
        form.style.display = 'none';
    }
    
    // Remover mensaje anterior si existe
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
    
    // Insertar el mensaje
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

// Crear opciones para admin - ¡FUNCIÓN QUE FALTABA!
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

// Cargar información de la clase desde la API - VERSIÓN CORREGIDA
async function cargarInformacionClase() {
    const claseId = obtenerClaseId();
    
    console.log('🔍 Cargando información de clase, ID:', claseId);
    
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
            // IMPORTANTE: Usar ruta sin /api duplicado
            const response = await makeRequestSafe(`/clases-publicas/${claseId}`, null, 'GET');
            console.log('📦 Respuesta de clase pública:', response);
            
            if (response && response.success && response.data) {
                clase = response.data;
                tipoClase = 'publica';
                console.log('✅ Clase pública cargada:', clase.nombre);
            }
        } catch (error) {
            console.log('⚠️ No es una clase pública:', error.message);
        }
        
        // SEGUNDO: Si no es pública, intentar como clase de gestión (histórica)
        if (!clase) {
            try {
                console.log('🔍 Intentando cargar como clase de gestión...');
                // IMPORTANTE: Usar ruta sin /api duplicado
                const response = await makeRequestSafe(`/clases-historicas/${claseId}`, null, 'GET');
                console.log('📦 Respuesta de clase de gestión:', response);
                
                if (response && response.success && response.data) {
                    clase = response.data;
                    tipoClase = 'historica';
                    console.log('✅ Clase de gestión cargada:', clase.nombre);
                }
            } catch (error) {
                console.log('⚠️ Tampoco es una clase de gestión:', error.message);
            }
        }
        
        // TERCERO: Si ninguna funcionó, usar datos por defecto
        if (!clase) {
            console.log('⚠️ No se pudo cargar la clase de la API, usando datos por defecto');
            clase = {
                nombre: 'Clase de prueba',
                fechaClase: new Date().toISOString(),
                enlaceFormulario: '',
                instructores: ['Instructor por defecto'],
                descripcion: 'Clase cargada con datos por defecto'
            };
            tipoClase = 'default';
        }
        
        claseInfo = clase;
        claseInfo.tipo = tipoClase;
        
        console.log('📊 Clase cargada exitosamente:', claseInfo);
        
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
                        const fechaFormateada = fechaClase.toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        
                        const fechaLimite = new Date(fechaClase);
                        fechaLimite.setHours(20, 0, 0, 0);
                        
                        const hoy = new Date();
                        if (fechaLimite > hoy) {
                            const diasRestantes = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
                            deadline.innerHTML = `⏰ <strong>Fecha de la clase:</strong> ${fechaFormateada} - <strong>Inscripción hasta:</strong> ${fechaLimite.toLocaleDateString('es-AR')} 20:00 hrs (${diasRestantes} días restantes)`;
                        } else {
                            deadline.innerHTML = `⏰ <strong>Fecha de la clase:</strong> ${fechaFormateada} - <strong>Inscripción:</strong> Hoy hasta las 20:00 hrs`;
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
        
        // Mostrar mensaje de error pero continuar con datos por defecto
        claseInfo = {
            nombre: 'Clase de prueba',
            fechaClase: new Date().toISOString(),
            enlaceFormulario: ''
        };
        
        return true; // Continuar para que las validaciones se ejecuten
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
        
        // VERIFICACIÓN 1: ¿La clase está abierta?
        if (!claseEstaAbierta()) {
            mostrarClaseCerrada();
            return false;
        }
        
        // VERIFICACIÓN 2: ¿Ya está inscrito?
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
    
    // Cargar información de la clase
    const claseCargada = await cargarInformacionClase();
    console.log('📊 Resultado carga de clase:', claseCargada);
    
    // VERIFICACIÓN INICIAL 1: ¿La clase está abierta?
    console.log('🔍 Ejecutando verificación de apertura...');
    const abierta = claseEstaAbierta();
    console.log('📊 Resultado verificación apertura:', abierta);
    
    if (!abierta) {
        console.log('🔒 Clase cerrada, mostrando mensaje');
        mostrarClaseCerrada();
        return;
    }
    
    // VERIFICACIÓN INICIAL 2: ¿Ya está inscrito?
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