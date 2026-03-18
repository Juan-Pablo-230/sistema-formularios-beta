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

// ==================== FUNCIÓN HASH ====================
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
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
            '/api/usuarios/migrar (POST)'
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

        // Verificar contraseña: primero en texto plano (para usuarios antiguos)
        let passwordMatches = false;
        let needsPasswordChange = false;
        
        if (usuario.password === password) {
            // Coincide en texto plano -> usuario antiguo, debe migrar
            passwordMatches = true;
            needsPasswordChange = true;
        } else {
            // Probar con hash
            const hashedInput = hashPassword(password);
            if (usuario.password === hashedInput) {
                passwordMatches = true;
                needsPasswordChange = false; // ya tiene hash
            }
        }

        if (!passwordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña incorrecta'
            });
        }

        // Determinar si necesita aceptar TYC
        const needsTyAceptacion = !usuario.tycAceptado;

        // Remover password de la respuesta
        const { password: _, ...usuarioSinPassword } = usuario;
        
        res.json({ 
            success: true, 
            message: 'Login exitoso', 
            data: {
                ...usuarioSinPassword,
                needsPasswordChange,
                needsTyAceptacion
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
        const { apellidoNombre, legajo, turno, email, password, role = 'user' } = req.body;
        
        // Validaciones básicas
        if (!apellidoNombre || !legajo || !turno || !email || !password) {
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
        
        // Hashear contraseña
        const hashedPassword = hashPassword(password);
        
        // Crear nuevo usuario (con tycAceptado = false) DESACTIVADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
/*         const nuevoUsuario = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            email,
            password: hashedPassword,
            role,
            tycAceptado: false,
            fechaRegistro: new Date()
        }; */
        
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
        const { usuarioId, clase, turno } = req.body;
        const db = await mongoDB.getDatabaseSafe('formulario');
        
        // Verificar si ya está inscrito
        const inscripcionExistente = await db.collection('inscripciones').findOne({
            usuarioId: new ObjectId(usuarioId),
            clase: clase
        });
        
        if (inscripcionExistente) {
            return res.status(400).json({ 
                success: false, 
                message: 'Ya estás inscrito en esta clase' 
            });
        }
        
        // Crear nueva inscripción
        const nuevaInscripcion = {
            usuarioId: new ObjectId(usuarioId),
            clase,
            turno,
            fecha: new Date()
        };
        
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
        const { apellidoNombre, legajo, turno, email, password, role = 'user' } = req.body;
        
        if (!apellidoNombre || !legajo || !turno || !email || !password) {
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
        
        const hashedPassword = hashPassword(password);
        
/*         const nuevoUsuario = { DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            email,
            password: hashedPassword,
            role,
            tycAceptado: false,
            fechaRegistro: new Date()
        }; */
        
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
        
        const hashedPassword = hashPassword(newPassword);
        
        const result = await db.collection('usuarios').updateOne(
            { _id: new ObjectId(id) },
            { $set: { password: hashedPassword } }
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
        const { apellidoNombre, legajo, email, turno } = req.body;
        
        console.log('✏️ Editando usuario ID:', id, 'Datos:', req.body);
        
        if (!apellidoNombre || !legajo || !email || !turno) {
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
                turno 
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
        
        const { apellidoNombre, legajo, turno, email, password, currentPassword } = req.body;
        
        if (!apellidoNombre || !legajo || !turno || !email || !currentPassword) {
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
        
        const currentPasswordMatches = (usuarioActual.password === currentPassword) || 
                                       (usuarioActual.password === hashPassword(currentPassword));
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
            updateData.password = hashPassword(password);
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

// NUEVA RUTA: Migración de contraseña y aceptación de TYC
app.post('/api/usuarios/migrar', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        /* const { currentPassword, newPassword, aceptarTyC } = req.body; */ //DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña actual es requerida' 
            });
        }
        
/*         if (aceptarTyC !== true) { DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
            return res.status(400).json({ 
                success: false, 
                message: 'Debe aceptar los Términos y Condiciones' 
            });
        } */
        
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
        
        const currentPasswordMatches = (usuario.password === currentPassword) || 
                                       (usuario.password === hashPassword(currentPassword));
        if (!currentPasswordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
/*         const updateData = { DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
            tycAceptado: true,
            fechaAceptacionTYC: new Date()
        }; */
        
        if (newPassword) {
            if (newPassword.length < 6) {
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
            updateData.password = hashPassword(newPassword);
        }
        
        await db.collection('usuarios').updateOne(
            { _id: new ObjectId(userHeader) },
            { $set: updateData }
        );
        
        const usuarioActualizado = await db.collection('usuarios').findOne(
            { _id: new ObjectId(userHeader) },
            { projection: { password: 0 } }
        );
        
        /* console.log('✅ Usuario migrado y TYC aceptado:', usuarioActualizado.apellidoNombre); */ //DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
        console.log('✅ Usuario migrado', usuarioActualizado.apellidoNombre);
        
        res.json({ 
            success: true, 
            message: 'Migración completada exitosamente',
            data: usuarioActualizado 
        });
        
    } catch (error) {
        console.error('❌ Error en migración:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor',
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
        
        const passwordMatches = (usuario.password === currentPassword) || 
                                (usuario.password === hashPassword(currentPassword));
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

// ==================== RUTAS PARA CLASES PÚBLICAS ====================
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
        const db = await mongoDB.getDatabaseSafe('formulario');
        const clases = await db.collection('clases-publicas')
            .find({ publicada: true })
            .sort({ fechaClase: -1 })
            .toArray();
        
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
        
        const collections = ['usuarios', 'inscripciones', 'material', 'clases', 'solicitudMaterial', 'tiempo-en-clases'];
        
        for (const collectionName of collections) {
            const collectionExists = await db.listCollections({ name: collectionName }).hasNext();
            
            if (!collectionExists) {
                console.log(`📝 Creando colección "${collectionName}"...`);
                await db.createCollection(collectionName);
                
                if (collectionName === 'usuarios') {
                    await db.collection(collectionName).createIndex({ email: 1 }, { unique: true });
                    await db.collection(collectionName).createIndex({ legajo: 1 }, { unique: true });
                    /* await db.collection(collectionName).createIndex({ tycAceptado: 1 }); */ //DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
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
                }
                
                console.log(`✅ Colección "${collectionName}" creada`);
            } else {
                console.log(`✅ Colección "${collectionName}" ya existe`);
            }
        }
        
        const clasesPublicasExists = await db.listCollections({ name: 'clases-publicas' }).hasNext();
        if (!clasesPublicasExists) {
            console.log('📝 Creando colección "clases-publicas"...');
            await db.createCollection('clases-publicas');
            
            await db.collection('clases-publicas').createIndex({ fechaClase: -1 });
            await db.collection('clases-publicas').createIndex({ nombre: 1 });
            await db.collection('clases-publicas').createIndex({ publicada: 1 });
            
            console.log('✅ Colección "clases-publicas" creada con índices');
        } else {
            console.log('✅ Colección "clases-publicas" ya existe');
        }
        
        // Migración: agregar campo tycAceptado a usuarios existentes DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
/*         const usuarios = db.collection('usuarios');
        await usuarios.updateMany(
            { tycAceptado: { $exists: false } },
            { $set: { tycAceptado: false } }
        );
        console.log('✅ Campo tycAceptado inicializado en usuarios existentes'); */
        
        res.json({ 
            success: true, 
            message: 'Base de datos inicializada correctamente',
            collections: collections
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
            
            // Migración automática al iniciar: agregar campo tycAceptado si no existe DESESTIMADO TEMPORALMENTE DEBIDO A QUE LOS RECURSOS NO ESTÁN DISPONIBLES
/*             const db = await mongoDB.getDatabaseSafe('formulario');
            const usuarios = db.collection('usuarios');
            await usuarios.updateMany(
                { tycAceptado: { $exists: false } },
                { $set: { tycAceptado: false } }
            );
            console.log('✅ Migración automática: campo tycAceptado inicializado'); */
            
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