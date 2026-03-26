const express = require('express');
const cors = require('cors');
const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const { connectToDatabase, getDB, mongoDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== FUNCIONES DE HASH CON SCRYPT ====================

// Configuración de scrypt (optimizada para Railway gratuito)
const SCRYPT_CONFIG = {
    N: 8192,        // Factor de costo (8MB de memoria)
    r: 8,           // Tamaño de bloque
    p: 1,           // Paralelismo
    keyLength: 32,  // Longitud de clave (32 bytes es suficiente)
    saltLength: 16  // Longitud del salt
};

// Función principal para hashear con scrypt
function hashPasswordScrypt(password) {
    // 1. Generar salt aleatorio
    const salt = crypto.randomBytes(SCRYPT_CONFIG.saltLength);
    
    // 2. Derivar clave con scrypt
    const hash = crypto.scryptSync(password, salt, SCRYPT_CONFIG.keyLength, {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p
    });
    
    // 3. Guardar en formato: scrypt|N|r|p|salt|hash
    return `scrypt|${SCRYPT_CONFIG.N}|${SCRYPT_CONFIG.r}|${SCRYPT_CONFIG.p}|${salt.toString('base64')}|${hash.toString('base64')}`;
}

// Función para verificar contraseña (soporta scrypt y texto plano para migración)
function verifyPassword(password, storedHash) {
    // 1. Verificar si es texto plano (para migración manual)
    if (!storedHash.includes('|') && storedHash.length < 64) {
        return storedHash === password;
    }
    
    // 2. Verificar si es scrypt (formato con pipe)
    if (storedHash.startsWith('scrypt|')) {
        const parts = storedHash.split('|');
        if (parts.length === 6 && parts[0] === 'scrypt') {
            const N = parseInt(parts[1]);
            const r = parseInt(parts[2]);
            const p = parseInt(parts[3]);
            const salt = Buffer.from(parts[4], 'base64');
            const hashGuardado = Buffer.from(parts[5], 'base64');
            
            // Calcular hash con los mismos parámetros
            const hashCalculado = crypto.scryptSync(password, salt, hashGuardado.length, {
                N: N,
                r: r,
                p: p
            });
            
            // Comparación segura en tiempo constante
            return crypto.timingSafeEqual(hashGuardado, hashCalculado);
        }
    }
    
    // Si no es ninguno de los formatos conocidos, fallar
    return false;
}

// Función unificada para crear hash (usar scrypt por defecto)
function hashPassword(password) {
    return hashPasswordScrypt(password);
}

// ==================== CONFIGURACIÓN INICIAL ====================
console.log('🚀 Iniciando Sistema de Formularios MongoDB...');
console.log('📋 Environment check:');
console.log('- Node version:', process.version);
console.log('- PORT:', PORT);
console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'DEFINIDA' : 'NO DEFINIDA');

// ==================== MIDDLEWARES BÁSICOS ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== RUTAS DE DIAGNÓSTICO ====================
console.log('=== ENVIRONMENT VARIABLES CHECK ===');
console.log('MONGODB_URI defined:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI length:', process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0);

// ==================== RUTAS DE HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    console.log('🏥 Health check request recibido');
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongoDB: mongoDB.isConnected ? 'CONECTADO' : 'NO CONECTADO'
    });
});

app.get('/api/test/simple', (req, res) => {
    console.log('✅ Ruta de prueba GET llamada');
    res.json({ 
        success: true, 
        message: 'Test GET funciona',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/debug/routes', (req, res) => {
    res.json({
        success: true,
        message: 'Rutas API disponibles',
        routes: [
            '/api/health',
            '/api/test/simple',
            '/api/init-db',
            '/api/auth/login (POST)',
            '/api/auth/register (POST)',
            '/api/auth/check-legajo/:legajo',
            '/api/inscripciones',
            '/api/inscripciones/verificar/:usuarioId/:clase',
            '/api/material/solicitudes',
            '/api/admin/usuarios',
            '/api/debug/mongo',
            '/api/env-check',
            '/api/clases-historicas',
            '/api/material-historico/solicitudes',
            '/api/tiempo-clase/actualizar (POST)',
            '/api/tiempo-clase (GET)',
            '/api/tiempo-clase/estadisticas (GET)',
            '/api/tiempo-clase/usuario/:usuarioId (GET)',
            '/api/tiempo-clase/init (GET)',
            '/api/usuarios/migrar (POST)',
            '/api/clases-publicas (GET)',
            '/api/clases-publicas/publicadas (GET)',
            '/api/clases-publicas/:id (GET)',
            '/api/clases-publicas (POST)',
            '/api/clases-publicas/:id (PUT)',
            '/api/clases-publicas/:id/visibilidad (PUT)',
            '/api/clases-publicas/:id (DELETE)'
        ],
        timestamp: new Date().toISOString()
    });
});

app.get('/api/env-check', (req, res) => {
    res.json({
        mongoDB_URI: process.env.MONGODB_URI ? 'DEFINED' : 'NOT DEFINED',
        mongoDB_URI_length: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
        allVariables: Object.keys(process.env).sort()
    });
});

// ==================== RUTAS DE AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('🔐 Intento de login recibido:', { identifier: req.body.identifier });
        const { identifier, password } = req.body;
        
        if (!identifier || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email/legajo y contraseña requeridos' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Buscar usuario por email o legajo
        const usuario = await db.collection('usuarios').findOne({
            $or: [
                { email: identifier },
                { legajo: identifier.toString() }
            ]
        });

        console.log('🔍 Usuario encontrado:', usuario ? 'Sí' : 'No');
        
        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado'
            });
        }

        // Verificar contraseña (soporta scrypt y texto plano)
        const passwordMatches = verifyPassword(password, usuario.password);
        
        // Detectar si necesita migración (solo si es texto plano)
        const needsMigration = !usuario.password.includes('|') && usuario.password.length < 64;
        
        if (!passwordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña incorrecta'
            });
        }

        // Remover password de la respuesta
        const { password: _, ...usuarioSinPassword } = usuario;
        
        res.json({ 
            success: true, 
            message: 'Login exitoso', 
            data: {
                ...usuarioSinPassword,
                needsMigration: needsMigration  // Indicar si necesita migración
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('📝 Registro de usuario:', req.body);
        const { apellidoNombre, legajo, turno, area, email, password, role = 'user' } = req.body;
        
        // Validaciones básicas
        if (!apellidoNombre || !legajo || !turno || !area || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        if (password.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña no puede exceder los 15 caracteres'
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Verificar si el usuario ya existe
        const usuarioExistente = await db.collection('usuarios').findOne({
            $or: [
                { email: email },
                { legajo: legajo.toString() }
            ]
        });
        
        if (usuarioExistente) {
            return res.status(400).json({ 
                success: false, 
                message: 'El email o legajo ya están registrados' 
            });
        }
        
        // Usar scrypt para hashear
        const hashedPassword = hashPasswordScrypt(password);
        
        // Crear nuevo usuario
        const nuevoUsuario = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            area,
            email,
            password: hashedPassword,
            role,
            fechaRegistro: new Date()
        };
        
        const result = await db.collection('usuarios').insertOne(nuevoUsuario);
        
        // Remover password de la respuesta
        const { password: _, ...usuarioCreado } = nuevoUsuario;
        usuarioCreado._id = result.insertedId;
        
        res.json({ 
            success: true, 
            message: 'Usuario registrado exitosamente', 
            data: usuarioCreado 
        });
        
    } catch (error) {
        console.error('❌ Error en registro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/auth/check-legajo/:legajo', async (req, res) => {
    try {
        const { legajo } = req.params;
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioExistente = await db.collection('usuarios').findOne({ 
            legajo: legajo.toString() 
        });
        
        res.json({ 
            success: true, 
            data: { exists: !!usuarioExistente } 
        });
        
    } catch (error) {
        console.error('❌ Error verificando legajo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE INSCRIPCIONES ====================
app.post('/api/inscripciones', async (req, res) => {
    try {
        const { usuarioId, clase, turno, fecha, claseId } = req.body;
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Verificar si ya está inscrito
        let query = {
            usuarioId: new ObjectId(usuarioId),
            clase: clase
        };
        
        const inscripcionExistente = await db.collection('inscripciones').findOne(query);
        
        if (inscripcionExistente) {
            return res.json({ 
                success: true, 
                message: 'Ya estás inscrito en esta clase',
                exists: true
            });
        }
        
        // Crear nueva inscripción
        const nuevaInscripcion = {
            usuarioId: new ObjectId(usuarioId),
            clase,
            turno,
            fecha: new Date(fecha || Date.now())
        };
        
        if (claseId) {
            nuevaInscripcion.claseId = claseId;
        }
        
        await db.collection('inscripciones').insertOne(nuevaInscripcion);
        
        res.json({ 
            success: true, 
            message: 'Inscripción registrada exitosamente' 
        });
        
    } catch (error) {
        console.error('❌ Error registrando inscripción:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/inscripciones/verificar/:usuarioId/:clase', async (req, res) => {
    try {
        const { usuarioId, clase } = req.params;
        
        console.log('🔍 Verificando inscripción para:', { usuarioId, clase });
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Primero intentar como ObjectId
        let objectId;
        if (ObjectId.isValid(usuarioId)) {
            objectId = new ObjectId(usuarioId);
        } else {
            // Si no es ObjectId válido, buscar por legajo
            const usuario = await db.collection('usuarios').findOne({ 
                legajo: usuarioId.toString() 
            });
            
            if (!usuario) {
                return res.json({ 
                    success: true, 
                    data: { exists: false } 
                });
            }
            
            objectId = usuario._id;
        }
        
        const inscripcionExistente = await db.collection('inscripciones').findOne({
            usuarioId: objectId,
            clase: decodeURIComponent(clase)
        });
        
        console.log('📊 Inscripción existe:', !!inscripcionExistente);
        
        res.json({ 
            success: true, 
            data: { exists: !!inscripcionExistente } 
        });
        
    } catch (error) {
        console.error('❌ Error verificando inscripción:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/inscripciones', async (req, res) => {
    try {
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Obtener todas las inscripciones con datos del usuario
        const inscripciones = await db.collection('inscripciones')
            .aggregate([
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: 'usuarioId',
                        foreignField: '_id',
                        as: 'usuario'
                    }
                },
                { $unwind: '$usuario' },
                { $sort: { fecha: -1 } }
            ])
            .toArray();
        
        // Formatear fechas para respuesta
        const inscripcionesFormateadas = inscripciones.map(insc => {
            const inscripcion = { ...insc };
            
            if (inscripcion.fecha instanceof Date) {
                inscripcion.fecha = inscripcion.fecha.toISOString();
            }
            
            if (inscripcion.usuario && inscripcion.usuario.password) {
                delete inscripcion.usuario.password;
            }
            
            return inscripcion;
        });
        
        console.log(`📋 ${inscripcionesFormateadas.length} inscripciones obtenidas`);
        
        res.json({ 
            success: true, 
            data: inscripcionesFormateadas 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo inscripciones:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/inscripciones/estadisticas', async (req, res) => {
    try {
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const inscripciones = await db.collection('inscripciones')
            .aggregate([
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: 'usuarioId',
                        foreignField: '_id',
                        as: 'usuario'
                    }
                },
                { $unwind: '$usuario' }
            ])
            .toArray();
        
        console.log(`📊 Total inscripciones para estadísticas: ${inscripciones.length}`);
        
        const hoy = new Date().toISOString().split('T')[0];
        
        const inscripcionesHoy = inscripciones.filter(i => {
            if (!i.fecha) return false;
            
            let fechaStr;
            if (i.fecha instanceof Date) {
                fechaStr = i.fecha.toISOString().split('T')[0];
            } else if (typeof i.fecha === 'string') {
                fechaStr = i.fecha.split('T')[0];
            } else {
                return false;
            }
            
            return fechaStr === hoy;
        }).length;
        
        const porClase = {};
        inscripciones.forEach(insc => {
            if (insc.clase) {
                porClase[insc.clase] = (porClase[insc.clase] || 0) + 1;
            }
        });
        
        const porTurno = {};
        inscripciones.forEach(insc => {
            if (insc.turno) {
                porTurno[insc.turno] = (porTurno[insc.turno] || 0) + 1;
            }
        });
        
        const ultimas = inscripciones.slice(0, 10).map(insc => {
            let fechaFormateada = 'Fecha no disponible';
            if (insc.fecha instanceof Date) {
                fechaFormateada = insc.fecha.toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } else if (typeof insc.fecha === 'string') {
                fechaFormateada = new Date(insc.fecha).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
            
            return {
                usuario: insc.usuario?.apellidoNombre || 'N/A',
                clase: insc.clase || 'N/A',
                fecha: fechaFormateada
            };
        });
        
        res.json({ 
            success: true, 
            data: {
                total: inscripciones.length,
                hoy: inscripcionesHoy,
                porClase: porClase,
                porTurno: porTurno,
                ultimas: ultimas
            }
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de inscripciones:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE CLASES HISTÓRICAS ====================
app.get('/api/clases-historicas', async (req, res) => {
    try {
        console.log('📥 GET /api/clases-historicas');
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const clases = await db.collection('clases')
            .find({})
            .sort({ fechaClase: -1 })
            .toArray();
        
        console.log(`✅ ${clases.length} clases obtenidas`);
        
        res.json({ 
            success: true, 
            data: clases 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo clases:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/clases-historicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📥 GET /api/clases-historicas/${id}`);
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: 'ID inválido' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const clase = await db.collection('clases').findOne({ 
            _id: new ObjectId(id) 
        });
        
        if (!clase) {
            return res.status(404).json({ 
                success: false, 
                message: 'Clase no encontrada' 
            });
        }
        
        res.json({ 
            success: true, 
            data: clase,
            serverTime: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo clase:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

app.post('/api/clases-historicas', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        console.log('📥 POST /api/clases-historicas - Usuario:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || usuario.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores pueden crear clases' 
            });
        }
        
        const { nombre, descripcion, fechaClase, enlaces, instructores, tags, estado } = req.body;
        
        if (!nombre || !fechaClase) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos: nombre y fecha son obligatorios' 
            });
        }
        
        console.log('📅 Fecha recibida (ART - string):', fechaClase);
        
        let fecha;
        if (fechaClase.includes('T')) {
            const [fechaPart, horaPart] = fechaClase.split('T');
            const [year, month, day] = fechaPart.split('-').map(Number);
            const [hour, minute] = horaPart.split(':').map(Number);
            
            if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
                throw new Error('Formato de fecha inválido');
            }
            
            const horaUTC = hour + 3;
            fecha = new Date(Date.UTC(year, month - 1, day, horaUTC, minute, 0));
            console.log(`⏰ Hora ART: ${hour}:${minute} -> Hora UTC: ${horaUTC}:${minute}`);
        } else {
            const [year, month, day] = fechaClase.split('-').map(Number);
            fecha = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        }
        
        console.log('📅 Fecha guardada (UTC):', fecha.toISOString());
        
        let estadoFinal = estado || 'activa';
        const activaBool = estadoFinal === 'activa' || estadoFinal === 'publicada';
        
        const nuevaClase = {
            nombre,
            descripcion: descripcion || '',
            fechaClase: fecha,
            enlaces: enlaces || { youtube: '', powerpoint: '' },
            activa: activaBool,
            estado: estadoFinal,
            instructores: instructores || [],
            tags: tags || [],
            fechaCreacion: new Date(),
            creadoPor: new ObjectId(userHeader)
        };
        
        const result = await db.collection('clases').insertOne(nuevaClase);
        
        console.log('✅ Clase creada:', result.insertedId);
        console.log('📊 Estado guardado:', estadoFinal);
        
        res.json({ 
            success: true, 
            message: 'Clase creada exitosamente',
            data: { ...nuevaClase, _id: result.insertedId }
        });
        
    } catch (error) {
        console.error('❌ Error creando clase:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.put('/api/clases-historicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        console.log(`📥 PUT /api/clases-historicas/${id} - Usuario:`, userHeader);
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Solicitud inválida' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || usuario.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores pueden actualizar clases' 
            });
        }
        
        const { nombre, descripcion, fechaClase, enlaces, instructores, tags, estado } = req.body;
        
        if (!nombre || !fechaClase) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos: nombre y fecha son obligatorios' 
            });
        }
        
        console.log('📅 Fecha actualización recibida (ART - string):', fechaClase);
        
        let fecha;
        if (fechaClase.includes('T')) {
            const [fechaPart, horaPart] = fechaClase.split('T');
            const [year, month, day] = fechaPart.split('-').map(Number);
            const [hour, minute] = horaPart.split(':').map(Number);
            
            if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
                throw new Error('Formato de fecha inválido');
            }
            
            const horaUTC = hour + 3;
            fecha = new Date(Date.UTC(year, month - 1, day, horaUTC, minute, 0));
            console.log(`⏰ Hora ART: ${hour}:${minute} -> Hora UTC: ${horaUTC}:${minute}`);
        } else {
            const [year, month, day] = fechaClase.split('-').map(Number);
            fecha = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        }
        
        console.log('📅 Fecha guardada (UTC):', fecha.toISOString());
        
        let estadoFinal = estado || 'activa';
        const activaBool = estadoFinal === 'activa' || estadoFinal === 'publicada';
        
        const updateData = {
            $set: {
                nombre,
                descripcion: descripcion || '',
                fechaClase: fecha,
                enlaces: enlaces || { youtube: '', powerpoint: '' },
                activa: activaBool,
                estado: estadoFinal,
                instructores: instructores || [],
                tags: tags || [],
                fechaActualizacion: new Date()
            }
        };
        
        const result = await db.collection('clases').updateOne(
            { _id: new ObjectId(id) },
            updateData
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Clase no encontrada' 
            });
        }
        
        console.log('✅ Clase actualizada:', id);
        console.log('📊 Estado actualizado:', estadoFinal);
        
        res.json({ 
            success: true, 
            message: 'Clase actualizada exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error actualizando clase:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.delete('/api/clases-historicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        console.log(`📥 DELETE /api/clases-historicas/${id} - Usuario:`, userHeader);
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Solicitud inválida' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || usuario.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores pueden eliminar clases' 
            });
        }
        
        const result = await db.collection('clases').deleteOne({
            _id: new ObjectId(id)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Clase no encontrada' 
            });
        }
        
        console.log('✅ Clase eliminada:', id);
        
        res.json({ 
            success: true, 
            message: 'Clase eliminada exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error eliminando clase:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE MATERIAL HISTÓRICO ====================
app.post('/api/material-historico/solicitudes', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('📦 POST /material-historico/solicitudes - Headers user-id:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado - Falta user-id en headers' 
            });
        }
        
        const { claseId, claseNombre, email, youtube, powerpoint } = req.body;
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const solicitudExistente = await db.collection('solicitudMaterial').findOne({
            usuarioId: new ObjectId(userHeader),
            claseId: claseId
        });
        
        if (solicitudExistente) {
            return res.json({ 
                success: true, 
                message: 'Material ya solicitado anteriormente',
                data: solicitudExistente,
                exists: true
            });
        }
        
        const nuevaSolicitud = {
            usuarioId: new ObjectId(userHeader),
            claseId: claseId,
            claseNombre: claseNombre,
            email: email,
            youtube: youtube,
            powerpoint: powerpoint,
            fechaSolicitud: new Date()
        };
        
        await db.collection('solicitudMaterial').insertOne(nuevaSolicitud);
        
        res.json({ 
            success: true, 
            message: 'Solicitud de material histórico registrada exitosamente',
            data: nuevaSolicitud
        });
        
    } catch (error) {
        console.error('❌ Error registrando solicitud de material histórico:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/material-historico/solicitudes', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('📦 GET /material-historico/solicitudes - Headers user-id:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado - Falta user-id en headers' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        let matchCriteria = { usuarioId: new ObjectId(userHeader) };
        
        if (usuario.role === 'admin') {
            console.log('👑 Admin: viendo TODAS las solicitudes de material histórico');
            matchCriteria = {};
        }
        
        const solicitudes = await db.collection('solicitudMaterial')
            .aggregate([
                {
                    $match: matchCriteria
                },
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: 'usuarioId',
                        foreignField: '_id',
                        as: 'usuario'
                    }
                },
                { $unwind: { path: '$usuario', preserveNullAndEmptyArrays: true } },
                { $sort: { fechaSolicitud: -1 } }
            ])
            .toArray();
        
        console.log(`📊 Encontradas ${solicitudes.length} solicitudes de material histórico`);
        
        res.json({ 
            success: true, 
            data: solicitudes 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo solicitudes de material histórico:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE ADMINISTRACIÓN ====================
app.get('/api/admin/usuarios', async (req, res) => {
    try {
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarios = await db.collection('usuarios')
            .find({}, { projection: { password: 0 } })
            .toArray();
        
        res.json({ 
            success: true, 
            data: usuarios 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo usuarios:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

app.post('/api/admin/usuarios', async (req, res) => {
    try {
        const { apellidoNombre, legajo, turno, area, email, password, role = 'user' } = req.body;
        
        // Validaciones
        if (!apellidoNombre || !legajo || !turno || !area || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        if (password.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña no puede exceder los 15 caracteres'
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioExistente = await db.collection('usuarios').findOne({
            $or: [
                { email: email },
                { legajo: legajo.toString() }
            ]
        });
        
        if (usuarioExistente) {
            return res.status(400).json({ 
                success: false, 
                message: 'El email o legajo ya están registrados' 
            });
        }
        
        // Usar scrypt
        const hashedPassword = hashPasswordScrypt(password);
        
        const nuevoUsuario = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            area,
            email,
            password: hashedPassword,
            role,
            fechaRegistro: new Date()
        };
        
        const result = await db.collection('usuarios').insertOne(nuevoUsuario);
        
        const { password: _, ...usuarioCreado } = nuevoUsuario;
        usuarioCreado._id = result.insertedId;
        
        res.json({ 
            success: true, 
            message: 'Usuario creado exitosamente', 
            data: usuarioCreado 
        });
        
    } catch (error) {
        console.error('❌ Error creando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.put('/api/admin/usuarios/:id/rol', async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        
        if (!['admin', 'advanced', 'user'].includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Rol inválido' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const result = await db.collection('usuarios').updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: role } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Rol actualizado correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error actualizando rol:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.put('/api/admin/usuarios/:id/password', async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        
        console.log('🔐 Cambiando contraseña para usuario ID:', id);
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La nueva contraseña debe tener al menos 6 caracteres' 
            });
        }
        if (newPassword.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña no puede exceder los 15 caracteres'
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Usar scrypt
        const hashedPassword = hashPasswordScrypt(newPassword);
        
        const result = await db.collection('usuarios').updateOne(
            { _id: new ObjectId(id) },
            { $set: { 
                password: hashedPassword,
                fechaActualizacion: new Date()
            } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Contraseña cambiada correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error cambiando contraseña:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.put('/api/admin/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { apellidoNombre, legajo, email, turno, area } = req.body;
        
        console.log('✏️ Editando usuario ID:', id, 'Datos:', req.body);
        
        if (!apellidoNombre || !legajo || !email || !turno || !area) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioExistente = await db.collection('usuarios').findOne({
            $and: [
                { _id: { $ne: new ObjectId(id) } },
                { $or: [
                    { legajo: legajo.toString() },
                    { email: email }
                ]}
            ]
        });
        
        if (usuarioExistente) {
            return res.status(400).json({ 
                success: false, 
                message: 'El email o legajo ya están registrados por otro usuario' 
            });
        }
        
        const result = await db.collection('usuarios').updateOne(
            { _id: new ObjectId(id) },
            { $set: { 
                apellidoNombre, 
                legajo: legajo.toString(), 
                email, 
                turno,
                area
            }}
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Usuario actualizado correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error actualizando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.delete('/api/admin/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🗑️ Eliminando usuario con ID:', id);
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(id) 
        });
        
        if (!usuario) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const currentUserId = req.headers['user-id'];
        if (currentUserId === id) {
            return res.status(400).json({ 
                success: false, 
                message: 'No puedes eliminarte a ti mismo' 
            });
        }
        
        const result = await db.collection('usuarios').deleteOne({ 
            _id: new ObjectId(id) 
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        console.log('✅ Usuario eliminado:', usuario.apellidoNombre);
        
        res.json({ 
            success: true, 
            message: `Usuario ${usuario.apellidoNombre} eliminado correctamente` 
        });
        
    } catch (error) {
        console.error('❌ Error eliminando usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE CLASES PÚBLICAS ====================
app.get('/api/clases-publicas', async (req, res) => {
    try {
        const db = await mongoDB.getDatabaseSafe('formulario');
        const clases = await db.collection('clases-publicas')
            .find({})
            .sort({ fechaClase: -1 })
            .toArray();
        
        res.json({ success: true, data: clases });
    } catch (error) {
        console.error('❌ Error obteniendo clases públicas:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.get('/api/clases-publicas/publicadas', async (req, res) => {
    try {
        console.log('📥 GET /api/clases-publicas/publicadas');
        const db = await mongoDB.getDatabaseSafe('formulario');
        const clases = await db.collection('clases-publicas')
            .find({ publicada: true })
            .sort({ fechaClase: -1 })
            .toArray();
        
        console.log(`✅ ${clases.length} clases publicadas encontradas`);
        
        res.json({ 
            success: true, 
            data: clases,
            serverTime: Date.now()
        });
    } catch (error) {
        console.error('❌ Error obteniendo clases publicadas:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.get('/api/clases-publicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📥 GET /api/clases-publicas/${id}`);
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: 'ID de clase inválido' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const clase = await db.collection('clases-publicas').findOne({ 
            _id: new ObjectId(id) 
        });
        
        if (!clase) {
            return res.status(404).json({ 
                success: false, 
                message: 'Clase no encontrada' 
            });
        }
        
        res.json({ 
            success: true, 
            data: clase,
            serverTime: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo clase por ID:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.post('/api/clases-publicas', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ success: false, message: 'No autenticado' });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores y usuarios avanzados pueden crear clases' 
            });
        }
        
        const { nombre, descripcion, fechaClase, instructores, lugar, enlaceFormulario, publicada } = req.body;
        
        if (!nombre || !fechaClase) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nombre y fecha son obligatorios' 
            });
        }
        
        let fecha;
        if (fechaClase.includes('T')) {
            const [fechaPart, horaPart] = fechaClase.split('T');
            const [year, month, day] = fechaPart.split('-').map(Number);
            const [hour, minute] = horaPart.split(':').map(Number);
            const horaUTC = hour + 3;
            fecha = new Date(Date.UTC(year, month - 1, day, horaUTC, minute, 0));
        } else {
            const [year, month, day] = fechaClase.split('-').map(Number);
            fecha = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        }
        
        const nuevaClase = {
            nombre,
            descripcion: descripcion || '',
            fechaClase: fecha,
            instructores: instructores || [],
            lugar: lugar || '',
            enlaceFormulario: enlaceFormulario || '',
            publicada: publicada === true,
            fechaCreacion: new Date(),
            creadoPor: new ObjectId(userHeader)
        };
        
        const result = await db.collection('clases-publicas').insertOne(nuevaClase);
        
        res.json({ 
            success: true, 
            message: 'Clase pública creada exitosamente',
            data: { ...nuevaClase, _id: result.insertedId }
        });
        
    } catch (error) {
        console.error('❌ Error creando clase pública:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.put('/api/clases-publicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ success: false, message: 'Solicitud inválida' });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores y usuarios avanzados pueden actualizar clases' 
            });
        }
        
        const { nombre, descripcion, fechaClase, instructores, lugar, enlaceFormulario, publicada } = req.body;
        
        if (!nombre || !fechaClase) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nombre y fecha son obligatorios' 
            });
        }
        
        let fecha;
        if (fechaClase.includes('T')) {
            const [fechaPart, horaPart] = fechaClase.split('T');
            const [year, month, day] = fechaPart.split('-').map(Number);
            const [hour, minute] = horaPart.split(':').map(Number);
            const horaUTC = hour + 3;
            fecha = new Date(Date.UTC(year, month - 1, day, horaUTC, minute, 0));
        } else {
            const [year, month, day] = fechaClase.split('-').map(Number);
            fecha = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        }
        
        const updateData = {
            $set: {
                nombre,
                descripcion: descripcion || '',
                fechaClase: fecha,
                instructores: instructores || [],
                lugar: lugar || '',
                enlaceFormulario: enlaceFormulario || '',
                publicada: publicada === true,
                fechaActualizacion: new Date()
            }
        };
        
        const result = await db.collection('clases-publicas').updateOne(
            { _id: new ObjectId(id) },
            updateData
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Clase no encontrada' });
        }
        
        res.json({ success: true, message: 'Clase pública actualizada exitosamente' });
        
    } catch (error) {
        console.error('❌ Error actualizando clase pública:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.put('/api/clases-publicas/:id/visibilidad', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        const { publicada } = req.body;
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ success: false, message: 'Solicitud inválida' });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores y usuarios avanzados pueden cambiar visibilidad' 
            });
        }
        
        const result = await db.collection('clases-publicas').updateOne(
            { _id: new ObjectId(id) },
            { $set: { publicada: publicada === true } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Clase no encontrada' });
        }
        
        res.json({ 
            success: true, 
            message: publicada ? 'Clase publicada exitosamente' : 'Clase ocultada exitosamente' 
        });
        
    } catch (error) {
        console.error('❌ Error cambiando visibilidad:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.delete('/api/clases-publicas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ success: false, message: 'Solicitud inválida' });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Solo administradores y usuarios avanzados pueden eliminar clases' 
            });
        }
        
        const result = await db.collection('clases-publicas').deleteOne({
            _id: new ObjectId(id)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Clase no encontrada' });
        }
        
        res.json({ success: true, message: 'Clase pública eliminada exitosamente' });
        
    } catch (error) {
        console.error('❌ Error eliminando clase pública:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ==================== RUTAS DE USUARIO (para perfil y migración) ====================
app.put('/api/usuarios/perfil', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('✏️ Actualizando perfil para usuario ID:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { apellidoNombre, legajo, turno, area, email, password, currentPassword } = req.body;
        
        if (!apellidoNombre || !legajo || !turno || !area || !email || !currentPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Todos los campos son requeridos' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioActual = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuarioActual) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        // Verificar contraseña actual
        const currentPasswordMatches = verifyPassword(currentPassword, usuarioActual.password);
        if (!currentPasswordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        if (legajo !== usuarioActual.legajo || email !== usuarioActual.email) {
            const usuarioExistente = await db.collection('usuarios').findOne({
                $and: [
                    { _id: { $ne: new ObjectId(userHeader) } },
                    { $or: [
                        { legajo: legajo.toString() },
                        { email: email }
                    ]}
                ]
            });
            
            if (usuarioExistente) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'El email o legajo ya están registrados por otro usuario' 
                });
            }
        }
        
        const updateData = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            area,
            email
        };
        
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'La nueva contraseña debe tener al menos 6 caracteres'
                });
            }
            if (password.length > 15) {
                return res.status(400).json({
                    success: false,
                    message: 'La nueva contraseña no puede exceder los 15 caracteres'
                });
            }
            // Usar scrypt para nueva contraseña
            updateData.password = hashPasswordScrypt(password);
        }
        
        await db.collection('usuarios').updateOne(
            { _id: new ObjectId(userHeader) },
            { $set: updateData }
        );
        
        const usuarioActualizado = await db.collection('usuarios').findOne(
            { _id: new ObjectId(userHeader) },
            { projection: { password: 0 } }
        );
        
        console.log('✅ Perfil actualizado:', usuarioActualizado.apellidoNombre);
        
        res.json({ 
            success: true, 
            message: 'Perfil actualizado correctamente',
            data: usuarioActualizado 
        });
        
    } catch (error) {
        console.error('❌ Error actualizando perfil:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// RUTA DE MIGRACIÓN (texto plano a scrypt)
app.post('/api/usuarios/migrar', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('🔄 SOLICITUD DE MIGRACIÓN RECIBIDA');
        console.log('- User ID:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado - Falta user-id' 
            });
        }
        
        const { area, currentPassword, newPassword } = req.body;
        
        console.log('📦 Datos recibidos:', { area, tieneCurrentPassword: !!currentPassword, tieneNewPassword: !!newPassword });
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        let usuario;
        try {
            usuario = await db.collection('usuarios').findOne({ 
                _id: new ObjectId(userHeader) 
            });
        } catch (idError) {
            return res.status(400).json({
                success: false,
                message: 'ID de usuario inválido'
            });
        }
        
        if (!usuario) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        console.log('👤 Usuario encontrado:', usuario.apellidoNombre);
        
        // Verificar contraseña actual (soporta texto plano y scrypt)
        if (!currentPassword) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere la contraseña actual'
            });
        }
        
        const passwordMatches = verifyPassword(currentPassword, usuario.password);
        if (!passwordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        // Preparar datos de actualización
        const updateData = {
            fechaMigracion: new Date()
        };
        
        // Si viene área, actualizarla
        if (area) {
            updateData.area = area;
            console.log('🏥 Área a actualizar:', area);
        }
        
        // Migrar contraseña a scrypt (usar la nueva contraseña si se proporcionó, o la actual)
        let passwordToHash = newPassword || currentPassword;
        
        if (passwordToHash) {
            if (passwordToHash.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'La contraseña debe tener al menos 6 caracteres'
                });
            }
            if (passwordToHash.length > 15) {
                return res.status(400).json({
                    success: false,
                    message: 'La contraseña no puede exceder los 15 caracteres'
                });
            }
            
            updateData.password = hashPasswordScrypt(passwordToHash);
            console.log('✅ Contraseña migrada a scrypt');
        }
        
        // Actualizar usuario
        await db.collection('usuarios').updateOne(
            { _id: new ObjectId(userHeader) },
            { $set: updateData }
        );
        
        // Obtener usuario actualizado (sin password)
        const usuarioActualizado = await db.collection('usuarios').findOne(
            { _id: new ObjectId(userHeader) },
            { projection: { password: 0 } }
        );
        
        console.log('✅ Usuario migrado exitosamente a scrypt');
        
        res.json({ 
            success: true, 
            message: 'Migración completada exitosamente',
            data: usuarioActualizado 
        });
        
    } catch (error) {
        console.error('❌ ERROR en migración:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message,
            error: error.message 
        });
    }
});

app.delete('/api/usuarios/cuenta', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('🗑️ Eliminando cuenta para usuario ID:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { currentPassword } = req.body;
        
        if (!currentPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña actual es requerida' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const passwordMatches = verifyPassword(currentPassword, usuario.password);
        if (!passwordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña incorrecta' 
            });
        }
        
        const result = await db.collection('usuarios').deleteOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        console.log('✅ Cuenta eliminada:', usuario.apellidoNombre);
        
        res.json({ 
            success: true, 
            message: 'Cuenta eliminada correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error eliminando cuenta:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTAS PARA TIEMPO EN CLASE ====================
app.post('/api/tiempo-clase/actualizar', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('⏱️ POST /api/tiempo-clase/actualizar - Usuario:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { claseId, claseNombre, tiempoActivo, tiempoInactivo, esFinal } = req.body;
        
        if (!claseId || !claseNombre || tiempoActivo === undefined || tiempoInactivo === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan datos requeridos' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        const filtro = {
            usuarioId: new ObjectId(userHeader),
            claseId: claseId
        };
        
        const registroExistente = await db.collection('tiempo-en-clases').findOne(filtro);
        
        const ahora = new Date();
        
        if (registroExistente) {
            const updateData = {
                $set: {
                    usuarioNombre: usuario.apellidoNombre,
                    legajo: usuario.legajo,
                    turno: usuario.turno,
                    claseNombre: claseNombre,
                    ultimaActualizacion: ahora
                },
                $inc: {
                    tiempoActivo: tiempoActivo,
                    tiempoInactivo: tiempoInactivo
                }
            };
            
            if (esFinal) {
                updateData.$set.finalizado = true;
                updateData.$set.fechaFinalizacion = ahora;
            }
            
            await db.collection('tiempo-en-clases').updateOne(filtro, updateData);
            
            console.log(`✅ Tiempo ACTUALIZADO para ${usuario.apellidoNombre} en ${claseNombre}`);
            console.log(`   + Activo: ${tiempoActivo}s, + Inactivo: ${tiempoInactivo}s`);
            
        } else {
            const nuevoRegistro = {
                usuarioId: new ObjectId(userHeader),
                usuarioNombre: usuario.apellidoNombre,
                legajo: usuario.legajo,
                turno: usuario.turno,
                claseId: claseId,
                claseNombre: claseNombre,
                tiempoActivo: tiempoActivo,
                tiempoInactivo: tiempoInactivo,
                fechaInicio: ahora,
                ultimaActualizacion: ahora,
                finalizado: esFinal || false
            };
            
            if (esFinal) {
                nuevoRegistro.fechaFinalizacion = ahora;
            }
            
            await db.collection('tiempo-en-clases').insertOne(nuevoRegistro);
            
            console.log(`✅ Nuevo registro CREADO para ${usuario.apellidoNombre} en ${claseNombre}`);
        }
        
        const registroActualizado = await db.collection('tiempo-en-clases').findOne(filtro);
        
        res.json({ 
            success: true, 
            message: 'Tiempo actualizado correctamente',
            data: registroActualizado
        });
        
    } catch (error) {
        console.error('❌ Error actualizando tiempo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/tiempo-clase', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        const { clase, usuario } = req.query;
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioActual = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuarioActual) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        let filtro = {};
        
        if (usuarioActual.role !== 'admin' && usuarioActual.role !== 'advanced') {
            filtro.usuarioId = new ObjectId(userHeader);
        }
        
        if (clase && clase !== 'todas') {
            filtro.claseNombre = clase;
        }
        
        if (usuario && (usuarioActual.role === 'admin' || usuarioActual.role === 'advanced')) {
            filtro.usuarioId = new ObjectId(usuario);
        }
        
        const registros = await db.collection('tiempo-en-clases')
            .find(filtro)
            .sort({ ultimaActualizacion: -1 })
            .toArray();
        
        res.json({ 
            success: true, 
            data: registros 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo tiempos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

app.get('/api/tiempo-clase/estadisticas', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioActual = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuarioActual) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        let matchStage = {};
        if (usuarioActual.role !== 'admin' && usuarioActual.role !== 'advanced') {
            matchStage.usuarioId = new ObjectId(userHeader);
        }
        
        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalRegistros: { $sum: 1 },
                    totalActivo: { $sum: '$tiempoActivo' },
                    totalInactivo: { $sum: '$tiempoInactivo' },
                    usuariosUnicos: { $addToSet: '$usuarioId' },
                    clasesUnicas: { $addToSet: '$claseNombre' }
                }
            }
        ];
        
        const estadisticas = await db.collection('tiempo-en-clases')
            .aggregate(pipeline)
            .toArray();
        
        const resultado = {
            totalRegistros: estadisticas[0]?.totalRegistros || 0,
            tiempoActivoTotal: estadisticas[0]?.totalActivo || 0,
            tiempoInactivoTotal: estadisticas[0]?.totalInactivo || 0,
            usuariosUnicos: estadisticas[0]?.usuariosUnicos?.length || 0,
            clasesUnicas: estadisticas[0]?.clasesUnicas?.length || 0
        };
        
        res.json({ 
            success: true, 
            data: resultado 
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

app.get('/api/tiempo-clase/usuario/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const userHeader = req.headers['user-id'];
        
        if (!userHeader || !ObjectId.isValid(usuarioId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Solicitud inválida' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuarioActual = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuarioActual) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }
        
        if (usuarioActual.role !== 'admin' && usuarioActual.role !== 'advanced' && 
            userHeader !== usuarioId) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permiso para ver estos datos' 
            });
        }
        
        const registros = await db.collection('tiempo-en-clases')
            .find({ usuarioId: new ObjectId(usuarioId) })
            .sort({ ultimaActualizacion: -1 })
            .toArray();
        
        const usuario = await db.collection('usuarios').findOne(
            { _id: new ObjectId(usuarioId) },
            { projection: { password: 0 } }
        );
        
        res.json({ 
            success: true, 
            data: {
                usuario: usuario,
                registros: registros
            }
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo detalle de usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

app.get('/api/tiempo-clase/init', async (req, res) => {
    try {
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const collectionExists = await db.listCollections({ name: 'tiempo-en-clases' }).hasNext();
        
        if (!collectionExists) {
            console.log('📝 Creando colección "tiempo-en-clases"...');
            await db.createCollection('tiempo-en-clases');
            
            await db.collection('tiempo-en-clases').createIndex({ usuarioId: 1, claseId: 1 }, { unique: true });
            await db.collection('tiempo-en-clases').createIndex({ usuarioId: 1 });
            await db.collection('tiempo-en-clases').createIndex({ claseId: 1 });
            await db.collection('tiempo-en-clases').createIndex({ ultimaActualizacion: -1 });
            
            console.log('✅ Colección "tiempo-en-clases" creada con índices');
        } else {
            console.log('✅ Colección "tiempo-en-clases" ya existe');
        }
        
        res.json({ 
            success: true, 
            message: 'Colección tiempo-en-clases verificada',
            coleccion: collectionExists ? 'existe' : 'creada'
        });
        
    } catch (error) {
        console.error('❌ Error inicializando colección de tiempos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== INICIALIZACIÓN DE BASE DE DATOS ====================
app.get('/api/init-db', async (req, res) => {
    try {
        console.log('🔄 Inicializando base de datos...');
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const collections = ['usuarios', 'inscripciones', 'material', 'clases', 'solicitudMaterial', 'tiempo-en-clases', 'clases-publicas'];
        
        for (const collectionName of collections) {
            const collectionExists = await db.listCollections({ name: collectionName }).hasNext();
            
            if (!collectionExists) {
                console.log(`📝 Creando colección "${collectionName}"...`);
                await db.createCollection(collectionName);
                
                if (collectionName === 'usuarios') {
                    await db.collection(collectionName).createIndex({ email: 1 }, { unique: true });
                    await db.collection(collectionName).createIndex({ legajo: 1 }, { unique: true });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'inscripciones') {
                    await db.collection(collectionName).createIndex({ usuarioId: 1, clase: 1 }, { unique: true });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'material') {
                    await db.collection(collectionName).createIndex({ usuarioId: 1, clase: 1 });
                    await db.collection(collectionName).createIndex({ fechaSolicitud: -1 });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'clases') {
                    await db.collection(collectionName).createIndex({ fechaClase: -1 });
                    await db.collection(collectionName).createIndex({ nombre: 1 });
                    await db.collection(collectionName).createIndex({ estado: 1 });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'solicitudMaterial') {
                    await db.collection(collectionName).createIndex({ usuarioId: 1, claseId: 1 });
                    await db.collection(collectionName).createIndex({ fechaSolicitud: -1 });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'tiempo-en-clases') {
                    await db.collection(collectionName).createIndex({ usuarioId: 1, claseId: 1 }, { unique: true });
                    await db.collection(collectionName).createIndex({ usuarioId: 1 });
                    await db.collection(collectionName).createIndex({ claseId: 1 });
                    await db.collection(collectionName).createIndex({ ultimaActualizacion: -1 });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                } else if (collectionName === 'clases-publicas') {
                    await db.collection(collectionName).createIndex({ fechaClase: -1 });
                    await db.collection(collectionName).createIndex({ nombre: 1 });
                    await db.collection(collectionName).createIndex({ publicada: 1 });
                    console.log(`✅ Índices creados para "${collectionName}"`);
                }
                
                console.log(`✅ Colección "${collectionName}" creada`);
            } else {
                console.log(`✅ Colección "${collectionName}" ya existe`);
            }
        }
        
        // Migración: agregar campo area a usuarios existentes
        const usuarios = db.collection('usuarios');
        const resultadoArea = await usuarios.updateMany(
            { area: { $exists: false } },
            { $set: { area: "Personal general del Sanatorio" } }
        );
        console.log(`✅ Campo area inicializado en usuarios existentes: ${resultadoArea.modifiedCount} actualizados`);

        res.json({ 
            success: true, 
            message: 'Base de datos inicializada correctamente',
            collections: collections,
            migraciones: {
                area: resultadoArea.modifiedCount
            }
        });
        
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error inicializando base de datos',
            error: error.message 
        });
    }
});

// ==================== RUTAS DE CARTELERA ====================

// GET - Obtener avisos activos para mostrar en index.html
app.get('/api/cartelera/activos', async (req, res) => {
    try {
        console.log('📢 GET /api/cartelera/activos');
        const db = await mongoDB.getDatabaseSafe('formulario');
        const ahora = new Date();
        
        const avisos = await db.collection('cartelera')
            .find({
                activo: true,
                fechaInicio: { $lte: ahora },
                fechaExpiracion: { $gte: ahora }
            })
            .sort({ prioridad: -1, fechaCreacion: -1 })
            .toArray();
        
        console.log(`✅ ${avisos.length} avisos activos encontrados`);
        
        res.json({ 
            success: true, 
            data: avisos 
        });
    } catch (error) {
        console.error('❌ Error obteniendo avisos activos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// GET - Obtener todos los avisos (para admin)
app.get('/api/cartelera', async (req, res) => {
    try {
        console.log('📢 GET /api/cartelera');
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver esta información' 
            });
        }
        
        const avisos = await db.collection('cartelera')
            .find({})
            .sort({ fechaCreacion: -1 })
            .toArray();
        
        console.log(`✅ ${avisos.length} avisos encontrados`);
        
        res.json({ 
            success: true, 
            data: avisos 
        });
    } catch (error) {
        console.error('❌ Error obteniendo avisos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// POST - Crear nuevo aviso
app.post('/api/cartelera', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        console.log('📢 POST /api/cartelera - Usuario:', userHeader);
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { titulo, mensaje, tipo, fechaInicio, fechaExpiracion, prioridad } = req.body;
        
        // Validaciones
        if (!titulo || !mensaje || !tipo || !fechaInicio || !fechaExpiracion) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos: titulo, mensaje, tipo, fechaInicio, fechaExpiracion' 
            });
        }
        
        // Validar tipo
        const tiposValidos = ['warning', 'urgent', 'info'];
        if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tipo inválido. Debe ser warning, urgent o info' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para crear avisos' 
            });
        }
        
        const nuevoAviso = {
            titulo: titulo,
            mensaje: mensaje,
            tipo: tipo,
            activo: true,
            fechaInicio: new Date(fechaInicio),
            fechaExpiracion: new Date(fechaExpiracion),
            creadoPor: new ObjectId(userHeader),
            fechaCreacion: new Date(),
            prioridad: prioridad || 1
        };
        
        const result = await db.collection('cartelera').insertOne(nuevoAviso);
        
        console.log('✅ Aviso creado:', result.insertedId);
        
        res.json({ 
            success: true, 
            message: 'Aviso creado exitosamente',
            data: { ...nuevoAviso, _id: result.insertedId }
        });
        
    } catch (error) {
        console.error('❌ Error creando aviso:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// PUT - Actualizar aviso
app.put('/api/cartelera/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        
        console.log(`📢 PUT /api/cartelera/${id} - Usuario:`, userHeader);
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Solicitud inválida' 
            });
        }
        
        const { titulo, mensaje, tipo, fechaInicio, fechaExpiracion, activo, prioridad } = req.body;
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para actualizar avisos' 
            });
        }
        
        const updateData = {
            $set: {}
        };
        
        if (titulo) updateData.$set.titulo = titulo;
        if (mensaje) updateData.$set.mensaje = mensaje;
        if (tipo) updateData.$set.tipo = tipo;
        if (fechaInicio) updateData.$set.fechaInicio = new Date(fechaInicio);
        if (fechaExpiracion) updateData.$set.fechaExpiracion = new Date(fechaExpiracion);
        if (activo !== undefined) updateData.$set.activo = activo;
        if (prioridad !== undefined) updateData.$set.prioridad = prioridad;
        
        updateData.$set.fechaActualizacion = new Date();
        
        const result = await db.collection('cartelera').updateOne(
            { _id: new ObjectId(id) },
            updateData
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Aviso no encontrado' 
            });
        }
        
        console.log('✅ Aviso actualizado:', id);
        
        res.json({ 
            success: true, 
            message: 'Aviso actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error actualizando aviso:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// DELETE - Eliminar aviso
app.delete('/api/cartelera/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userHeader = req.headers['user-id'];
        
        console.log(`📢 DELETE /api/cartelera/${id} - Usuario:`, userHeader);
        
        if (!userHeader || !ObjectId.isValid(id)) {
            return res.status(401).json({ 
                success: false, 
                message: 'Solicitud inválida' 
            });
        }
        
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        const usuario = await db.collection('usuarios').findOne({ 
            _id: new ObjectId(userHeader) 
        });
        
        if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'advanced')) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para eliminar avisos' 
            });
        }
        
        const result = await db.collection('cartelera').deleteOne({
            _id: new ObjectId(id)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Aviso no encontrado' 
            });
        }
        
        console.log('✅ Aviso eliminado:', id);
        
        res.json({ 
            success: true, 
            message: 'Aviso eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error eliminando aviso:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
            error: error.message 
        });
    }
});

// ==================== RUTA POR DEFECTO ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== MANEJO DE RUTAS NO ENCONTRADAS ====================
app.use('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ 
            success: false, 
            message: 'Ruta API no encontrada: ' + req.path 
        });
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// ==================== INICIAR SERVIDOR ====================
async function startServer() {
    try {
        console.log('\n🔄 Intentando conectar a MongoDB...');
        try {
            await mongoDB.connect();
            console.log('✅ MongoDB conectado exitosamente');
            
            // Migración automática al iniciar: agregar campo area si no existe
            const db = await mongoDB.getDatabaseSafe('formulario');
            const usuarios = db.collection('usuarios');
            const resultadoArea = await usuarios.updateMany(
                { area: { $exists: false } },
                { $set: { area: "Personal general del Sanatorio" } }
            );
            if (resultadoArea.modifiedCount > 0) {
                console.log(`✅ Migración automática: campo area agregado a ${resultadoArea.modifiedCount} usuarios`);
            }
            
        } catch (dbError) {
            console.warn('⚠️ MongoDB no disponible:', dbError.message);
            console.log('⚠️ El servidor iniciará sin base de datos');
        }
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n==========================================');
            console.log('✅ SERVIDOR INICIADO CORRECTAMENTE');
            console.log(`🔧 Puerto: ${PORT}`);
            console.log(`🌍 URL: http://0.0.0.0:${PORT}`);
            console.log(`🏥 Health: /api/health`);
            console.log(`🧪 Test: /api/test/simple`);
            console.log(`🔄 Init DB: /api/init-db`);
            console.log(`⏱️ Tiempo clase (acumulativo): /api/tiempo-clase`);
            console.log('==========================================\n');
        });
        
        server.on('error', (error) => {
            console.error('❌ Error del servidor:', error.message);
            if (error.code === 'EADDRINUSE') {
                console.error(`⚠️ Puerto ${PORT} en uso`);
            }
        });
        
        return server;
    } catch (error) {
        console.error('❌ ERROR iniciando servidor:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

startServer();