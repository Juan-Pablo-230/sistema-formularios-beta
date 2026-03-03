console.log('formularios.js cargado - MongoDB Version');

// Variable global para verificar si authSystem está disponible
let authSystemReady = false;

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

// Funciones seguras
function getCurrentUserSafe() {
    return authSystemReady && authSystem?.getCurrentUser?.() || null;
}

function isLoggedInSafe() {
    return authSystemReady && authSystem?.isLoggedIn?.() || false;
}

function isAdminSafe() {
    return authSystemReady && authSystem?.isAdmin?.() || false;
}

async function makeRequestSafe(endpoint, data = null, method = 'POST') {
    if (!authSystemReady || !authSystem?.makeRequest) {
        throw new Error('authSystem no disponible');
    }
    return await authSystem.makeRequest(endpoint, data, method);
}

// ============================================
// FUNCIONES DE CARGA DE DATOS DE LA CLASE
// ============================================

let FECHA_APERTURA = null;
let FECHA_CIERRE = null;
let intervaloVerificacion = null;

// Función para formatear fecha
function formatearFecha(fecha) {
    const opciones = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return fecha.toLocaleDateString('es-AR', opciones).replace(',', ' a las') + 'hs';
}

// Función para cargar datos de la clase desde el ID
async function cargarDatosClase() {
    const claseId = window.CLASE_ID;
    
    if (!claseId) {
        console.error('❌ No hay CLASE_ID definido');
        document.getElementById('claseTitulo').textContent = 'Error: Clase no especificada';
        return;
    }
    
    try {
        console.log('📥 Cargando datos de la clase ID:', claseId);
        
        document.getElementById('claseTitulo').textContent = 'Cargando información de la clase...';
        
        const url = `/api/clases-publicas/${claseId}`;
        console.log('📡 Fetching URL:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📦 Datos recibidos:', result);
        
        if (!result.success || !result.data) {
            throw new Error(result.message || 'Error al cargar la clase');
        }
        
        const clase = result.data;
        console.log('✅ Clase cargada:', clase);
        
        // Actualizar título
        document.getElementById('claseTitulo').textContent = `Clase "${clase.nombre}"`;
        
        // Actualizar indicador visible
        document.getElementById('claseIndicador').style.display = 'block';
        document.getElementById('claseNombre').textContent = clase.nombre;
        
        // Agregar detalles al indicador
        const detallesDiv = document.getElementById('claseDetalles');
        let detallesHTML = '';
        
        if (clase.instructores?.length > 0) {
            detallesHTML += `<span><i>👥</i> ${clase.instructores.join(', ')}</span>`;
        }
        
        if (clase.lugar) {
            detallesHTML += `<span><i>📍</i> ${clase.lugar}</span>`;
        }
        
        if (clase.fechaClase) {
            const fecha = new Date(clase.fechaClase);
            const fechaFormateada = fecha.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            detallesHTML += `<span><i>📅</i> ${fechaFormateada}hs</span>`;
        }
        
        detallesDiv.innerHTML = detallesHTML;
        
        // Actualizar campos ocultos
        document.getElementById('claseId').value = claseId;
        
        // Actualizar selector de clase
        const claseOption = document.getElementById('claseOption');
        claseOption.value = clase.nombre;
        claseOption.textContent = clase.nombre;
        
        // Guardar enlace de redirección
        if (clase.enlaceFormulario) {
            document.getElementById('enlaceRedireccion').value = clase.enlaceFormulario;
            console.log('🔗 Enlace de redirección:', clase.enlaceFormulario);
        } else {
            document.getElementById('enlaceRedireccion').value = '/asistenciapres.html';
            console.log('🔗 Usando enlace por defecto');
        }
        
        // Autocompletar datos del usuario
        autocompletarDatosUsuario();
        
        // Configurar fechas
        configurarFechasClase(clase);
        
    } catch (error) {
        console.error('❌ Error cargando clase:', error);
        document.getElementById('claseTitulo').textContent = 'Error al cargar la clase';
        
        const indicador = document.getElementById('claseIndicador');
        if (indicador) {
            indicador.style.display = 'block';
            indicador.innerHTML = `
                <strong style="color: #dc3545;">❌ Error</strong>
                <div style="margin-top: 10px; color: var(--text-secondary);">
                    ${error.message}<br>
                    <small>URL intentada: /api/clases-publicas/${window.CLASE_ID}</small>
                </div>
            `;
        }
    }
}

// Configurar fechas de apertura y cierre
function configurarFechasClase(clase) {
    if (clase.fechaApertura && clase.fechaCierre) {
        FECHA_APERTURA = new Date(clase.fechaApertura);
        FECHA_CIERRE = new Date(clase.fechaCierre);
    } else {
        const fechaClase = new Date(clase.fechaClase);
        FECHA_APERTURA = new Date(fechaClase);
        FECHA_APERTURA.setHours(9, 50, 0, 0);
        FECHA_CIERRE = new Date(fechaClase);
        FECHA_CIERRE.setHours(11, 0, 0, 0);
    }
    
    actualizarTextoFecha();
}

// Actualizar texto de fecha
function actualizarTextoFecha() {
    const elementoFecha = document.getElementById('deadline');
    if (elementoFecha && FECHA_CIERRE) {
        elementoFecha.textContent = `Fecha de cierre: ${formatearFecha(FECHA_CIERRE)} (Hora Argentina)`;
    }
}

// Función para autocompletar datos del usuario
function autocompletarDatosUsuario() {
    if (isLoggedInSafe()) {
        const user = getCurrentUserSafe();
        console.log('👤 Autocompletando con usuario:', user);
        
        if (user.apellidoNombre) {
            document.getElementById('apellidoNombre').value = user.apellidoNombre;
        }
        if (user.legajo) {
            document.getElementById('legajo').value = user.legajo;
        }
        if (user.turno) {
            document.getElementById('turno').value = user.turno;
        }
        if (user.email) {
            document.getElementById('email').value = user.email;
        }
    }
}

// Hacer campos readonly
function hacerCamposReadonly() {
    const campos = ['apellidoNombre', 'legajo', 'email'];
    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.setAttribute('readonly', true);
    });
    
    const selects = ['clase', 'turno'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.setAttribute('readonly', true);
    });
}

// ============================================
// FUNCIONES DE VALIDACIÓN DE INSCRIPCIÓN
// ============================================

function obtenerClaseActual() {
    return document.getElementById('clase')?.value || null;
}

function obtenerEnlaceRedireccion() {
    return document.getElementById('enlaceRedireccion')?.value || '/asistenciapres.html';
}

// Verificar si el usuario ya completó el formulario
async function usuarioYaCompletoFormulario() {
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseActual = obtenerClaseActual();
        
        console.log('🔍 Verificando inscripción:', { usuario: usuarioActual, clase: claseActual });
        
        if (!usuarioActual || !claseActual) {
            return false;
        }
        
        if (isAdminSafe()) {
            console.log('👑 Usuario admin, omitiendo verificación');
            return false;
        }
        
        if (!usuarioActual._id) {
            console.log('❌ Usuario no tiene _id');
            return false;
        }
        
        const result = await makeRequestSafe(
            `/inscripciones/verificar/${usuarioActual._id}/${encodeURIComponent(claseActual)}`,
            null,
            'GET'
        );
        
        console.log('📊 Resultado verificación:', result);
        return result.data?.exists || false;
        
    } catch (error) {
        console.error('❌ Error verificando:', error);
        return false;
    }
}

// Mostrar mensaje de formulario ya completado
function mostrarFormularioYaCompletado() {
    console.log('🔄 Mostrando mensaje de formulario ya completado...');
    
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    const claseActual = obtenerClaseActual();
    const enlaceRedireccion = obtenerEnlaceRedireccion();
    
    if (!container) return;
    
    if (form) form.style.display = 'none';
    
    const mensajeAnterior = document.querySelector('.mensaje-ya-completado');
    if (mensajeAnterior) mensajeAnterior.remove();
    
    let contenidoEnlace = '';
    if (enlaceRedireccion && enlaceRedireccion !== '/asistenciapres.html') {
        contenidoEnlace = `
            <p style="color: #667eea; font-size: 1em; margin-bottom: 25px; padding: 15px; background: rgba(102, 126, 234, 0.1); border-radius: 8px; border-left: 4px solid #667eea;">
                <strong>¿Te saliste de la reunión accidentalmente?</strong><br>
                <a href="${enlaceRedireccion}" 
                   style="color: #667eea; text-decoration: underline; font-weight: bold;">
                    Haz click aquí para ingresar nuevamente
                </a>
            </p>
        `;
    } else {
        contenidoEnlace = `
            <p style="color: #888888; font-size: 0.9em; margin-bottom: 25px; padding: 15px; background: rgba(136, 136, 136, 0.1); border-radius: 8px; border-left: 4px solid #888888;">
                <em>Enlace de la reunión no disponible</em>
            </p>
        `;
    }
    
    const mensaje = document.createElement('div');
    mensaje.className = 'mensaje-ya-completado';
    mensaje.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
            <h2 style="color: #28a745; margin-bottom: 15px;">Formulario completado</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px; font-size: 1.1em;">
                ¡Gracias! Ya has completado el formulario de inscripción para:<br>
                <strong style="color: #e0e0e0;">${claseActual || 'esta clase'}</strong>
            </p>
            <p style="color: #888888; font-size: 0.9em; margin-bottom: 20px;">
                No es necesario enviarlo nuevamente para esta clase.
            </p>
            ${contenidoEnlace}
            <div style="margin-top: 20px;">
                <button onclick="window.location.href='../index.html'" class="back-btn" style="margin: 5px;">
                    ← Volver al Menú Principal
                </button>
                <button onclick="logoutSafe()" class="back-btn logout-btn" style="margin: 5px;">
                    Cerrar Sesión
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(mensaje);
    console.log('✅ Mensaje mostrado');
}

// Guardar inscripción en MongoDB
async function guardarInscripcionEnMongoDB(formData) {
    try {
        const usuarioActual = getCurrentUserSafe();
        const claseActual = obtenerClaseActual();
        const turno = formData.get('turno');
        
        console.log('💾 Guardando inscripción:', {
            usuarioId: usuarioActual?._id,
            clase: claseActual,
            turno: turno
        });
        
        if (!usuarioActual?._id) throw new Error('Usuario no tiene _id');
        if (!claseActual) throw new Error('No se pudo determinar la clase');
        
        const inscripcionData = {
            usuarioId: usuarioActual._id,
            clase: claseActual,
            turno: turno,
            fecha: new Date().toISOString()
        };
        
        const result = await makeRequestSafe('/inscripciones', inscripcionData);
        console.log('✅ Inscripción guardada:', result);
        return true;
        
    } catch (error) {
        console.error('❌ Error guardando:', error);
        throw error;
    }
}

// Función principal de validación y envío
async function validarFormulario(event) {
    event.preventDefault();
    console.log('🔍 Iniciando validación...');
    
    const submitBtn = event.target.querySelector('.submit-btn');
    const originalText = submitBtn?.textContent || 'Enviar Inscripción';
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Validando...';
        }
        
        if (!isLoggedInSafe()) {
            alert('Debe iniciar sesión para continuar');
            window.location.href = '/index.html';
            return false;
        }
        
        console.log('🔍 Verificando inscripción existente...');
        const yaCompleto = await usuarioYaCompletoFormulario();
        
        if (yaCompleto) {
            const claseActual = obtenerClaseActual();
            const enlaceRedireccion = obtenerEnlaceRedireccion();
            
            let mensaje = `❌ Ya has completado el formulario para: ${claseActual}`;
            if (enlaceRedireccion && enlaceRedireccion !== '/asistenciapres.html') {
                mensaje += `\n\n¿Te saliste de la reunión? Haz click en el mensaje para volver a ingresar.`;
            }
            
            alert(mensaje);
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
            
            mostrarFormularioYaCompletado();
            return false;
        }
        
        console.log('✅ Usuario puede inscribirse');
        
        const form = document.getElementById('inscripcionForm');
        const formData = new FormData(form);
        
        if (submitBtn) submitBtn.textContent = '💾 Guardando...';
        
        const guardadoExitoso = await guardarInscripcionEnMongoDB(formData);
        
        if (guardadoExitoso) {
            console.log('✅ Inscripción exitosa');
            const enlaceRedireccion = obtenerEnlaceRedireccion();
            
            if (submitBtn) submitBtn.textContent = '✅ Redirigiendo...';
            
            // Pequeño retraso para que se vea el mensaje
            setTimeout(() => {
                window.location.href = enlaceRedireccion;
            }, 500);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('❌ Error: ' + error.message);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Función segura para logout
function logoutSafe() {
    if (authSystemReady && authSystem?.logout) {
        authSystem.logout();
    }
    window.location.reload();
}

// Crear botones de opciones para administradores (FUNCIÓN QUE FALTABA)
function crearOpcionesAdmin() {
    const backBtnContainer = document.querySelector('.back-btn-container');
    
    if (backBtnContainer && isLoggedInSafe() && isAdminSafe()) {
        backBtnContainer.innerHTML = '';
        
        const adminBtn = document.createElement('button');
        adminBtn.textContent = '📊 Ir al Panel de Administración';
        adminBtn.className = 'back-btn admin-panel-btn';
        adminBtn.onclick = function() {
            window.location.href = '/admin/dashboard.html';
        };
        backBtnContainer.appendChild(adminBtn);
        
        const formBtn = document.createElement('button');
        formBtn.textContent = '📝 Ver Formulario de Inscripción';
        formBtn.className = 'back-btn form-btn active';
        formBtn.onclick = function() {
            document.querySelectorAll('.back-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
        };
        backBtnContainer.appendChild(formBtn);
        
        const adminInfo = document.createElement('div');
        adminInfo.className = 'admin-info';
        adminInfo.innerHTML = `
            <span style="color: #667eea; font-weight: bold;">👤 Modo Administrador - MongoDB</span>
        `;
        backBtnContainer.appendChild(adminInfo);
    }
}

// Función para mostrar error de verificación
function mostrarErrorVerificacion(mensaje) {
    const container = document.querySelector('.container');
    const form = document.getElementById('inscripcionForm');
    
    if (form) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mensaje-cierre';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 3em; margin-bottom: 15px;">⚠️</div>
                <h3 style="color: #dc3545; margin-bottom: 10px;">Error de Verificación</h3>
                <p style="color: #b0b0b0;">${mensaje}</p>
                <button onclick="window.location.reload()" class="back-btn" style="margin-top: 15px;">
                    Reintentar
                </button>
            </div>
        `;
        
        form.parentNode.insertBefore(errorDiv, form);
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

async function inicializarAplicacion() {
    console.log('🚀 Inicializando aplicación...');
    
    try {
        await waitForAuthSystem();
        console.log('✅ authSystem listo');
        
    } catch (error) {
        console.error('❌ Error con authSystem:', error);
        mostrarErrorVerificacion('Error al cargar el sistema de autenticación');
        return;
    }
    
    // Verificar autenticación
    if (!isLoggedInSafe()) {
        try {
            console.log('🔐 Usuario no logueado, mostrando modal...');
            await authSystem.showLoginModal();
        } catch (error) {
            console.log('❌ Usuario canceló el login');
            window.location.href = '/index.html';
            return;
        }
    }
    
    // Si hay CLASE_ID, estamos en el formulario genérico
    if (window.CLASE_ID) {
        console.log('📌 Modo formulario genérico con CLASE_ID:', window.CLASE_ID);
        hacerCamposReadonly();
        await cargarDatosClase();
    }
    
    console.log('🔍 Verificando si usuario ya completó el formulario...');
    
    // Verificar si ya completó el formulario
    try {
        const yaCompleto = await usuarioYaCompletoFormulario();
        
        if (yaCompleto) {
            console.log('✅ Usuario ya completó el formulario');
            mostrarFormularioYaCompletado();
            return;
        }
        
        console.log('✅ Usuario puede completar el formulario');
        
    } catch (error) {
        console.error('❌ Error en verificación inicial:', error);
        mostrarErrorVerificacion('Error al verificar el estado del formulario');
        return;
    }
    
    // Si es admin, mostrar opciones
    if (isAdminSafe()) {
        console.log('👑 Usuario admin detectado');
        crearOpcionesAdmin();
    }
    
    // Autocompletar (por si acaso)
    autocompletarDatosUsuario();
    
    // Configurar evento de envío (SOLO UNA VEZ)
    const form = document.getElementById('inscripcionForm');
    if (form) {
        // Remover cualquier listener anterior y agregar el nuevo
        form.removeEventListener('submit', validarFormulario);
        form.addEventListener('submit', validarFormulario);
        console.log('✅ Event listener configurado');
    } else {
        console.error('❌ Formulario no encontrado');
    }
    
    // Agregar botón de logout
    const backBtnContainer = document.querySelector('.back-btn-container');
    if (backBtnContainer && isLoggedInSafe()) {
        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Cerrar Sesión';
        logoutBtn.className = 'back-btn logout-btn';
        logoutBtn.onclick = logoutSafe;
        backBtnContainer.appendChild(logoutBtn);
    }
    
    console.log('✅ Aplicación inicializada correctamente');
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializarAplicacion);

// Exponer funciones útiles
window.obtenerClaseActual = obtenerClaseActual;
window.obtenerEnlaceRedireccion = obtenerEnlaceRedireccion;
window.logoutSafe = logoutSafe;
window.debugEstadoFormulario = function() {
    console.log('=== DEBUG ESTADO FORMULARIO ===');
    console.log('authSystemReady:', authSystemReady);
    console.log('CLASE_ID:', window.CLASE_ID);
    console.log('Usuario:', getCurrentUserSafe());
    console.log('Clase actual:', obtenerClaseActual());
    console.log('Enlace redirección:', obtenerEnlaceRedireccion());
    console.log('Formulario existe:', !!document.getElementById('inscripcionForm'));
};