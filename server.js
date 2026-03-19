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
        let passwordAlreadyUpdated = false;

        if (usuario.password === password) {
            // Coincide en texto plano -> usuario antiguo, debe migrar
            passwordMatches = true;
            needsPasswordChange = true;
            passwordAlreadyUpdated = false;
        } else {
            // Probar con hash
            const hashedInput = hashPassword(password);
            if (usuario.password === hashedInput) {
                passwordMatches = true;
                
                // Verificar si ya actualizó la contraseña antes
                if (usuario.passwordUpdated === true) {
                    // Ya hizo la migración, no necesita cambiar
                    needsPasswordChange = false;
                    passwordAlreadyUpdated = true;
                } else {
                    // Tiene hash pero no ha confirmado migración
                    needsPasswordChange = true;
                    passwordAlreadyUpdated = false;
                }
            }
        }

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
                needsPasswordChange,
                passwordAlreadyUpdated
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
        // Agregar 'area' a la desestructuración
        const { apellidoNombre, legajo, turno, area, email, password, role = 'user' } = req.body;
        
        // Validaciones básicas - agregar area
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
        
        // Crear nuevo usuario (con passwordUpdated = true)
        const nuevoUsuario = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            area, // 👈 NUEVO CAMPO
            email,
            password: hashedPassword,
            role,
            passwordUpdated: true,
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

// NUEVA RUTA: Migración de contraseña (ACTUALIZADA)
app.post('/api/usuarios/migrar', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { currentPassword, newPassword } = req.body;
        
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
        
        const currentPasswordMatches = (usuario.password === currentPassword) || 
                                       (usuario.password === hashPassword(currentPassword));
        if (!currentPasswordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        // Preparar datos de actualización
        const updateData = {
            passwordUpdated: true,
            fechaMigracion: new Date()
        };
        
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
        // Agregar 'area' a la desestructuración
        const { apellidoNombre, legajo, turno, area, email, password, role = 'user' } = req.body;
        
        // Validaciones - agregar area
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
        
        const nuevoUsuario = {
            apellidoNombre,
            legajo: legajo.toString(),
            turno,
            area, // 👈 NUEVO CAMPO
            email,
            password: hashedPassword,
            role,
            passwordUpdated: true,
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
        // Agregar 'area' a la desestructuración
        const { apellidoNombre, legajo, email, turno, area } = req.body;
        
        console.log('✏️ Editando usuario ID:', id, 'Datos:', req.body);
        
        // Validaciones - agregar area
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
                area // 👈 NUEVO CAMPO
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
        
        // Agregar 'area' a la desestructuración
        const { apellidoNombre, legajo, turno, area, email, password, currentPassword } = req.body;
        
        // Validaciones - agregar area
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
            area, // 👈 NUEVO CAMPO
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

// NUEVA RUTA: Migración de contraseña
app.post('/api/usuarios/migrar', async (req, res) => {
    try {
        const userHeader = req.headers['user-id'];
        
        if (!userHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }
        
        const { currentPassword, newPassword } = req.body;
        
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
        
        const currentPasswordMatches = (usuario.password === currentPassword) || 
                                       (usuario.password === hashPassword(currentPassword));
        if (!currentPasswordMatches) {
            return res.status(401).json({ 
                success: false, 
                message: 'Contraseña actual incorrecta' 
            });
        }
        
        const updateData = {
            passwordUpdated: true,
            fechaMigracion: new Date()
        };
        
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