const { connectToDatabase, getDB } = require('./database');

async function initializeDatabase() {
    try {
        console.log('🚀 Inicializando base de datos...');
        await connectToDatabase();
        const db = getDB('formulario');

        // Solo crear clases si no existen
        for (const clase of clases) {
            const claseExistente = await db.collection('clases').findOne({ nombre: clase.nombre });
            if (!claseExistente) {
                await db.collection('clases').insertOne(clase);
                console.log(`✅ Clase creada: ${clase.nombre}`);
            } else {
                console.log(`✅ Clase ya existe: ${clase.nombre}`);
            }
        }

        // Verificar/crear colección de material
        const collections = await db.listCollections({ name: 'material' }).toArray();
        const materialCollectionExists = collections.some(col => col.name === 'material');
        
        if (!materialCollectionExists) {
            console.log('📝 Creando colección "material"...');
            await db.createCollection('material');
            
            await db.collection('material').createIndex({ usuarioId: 1, clase: 1 });
            await db.collection('material').createIndex({ fechaSolicitud: -1 });
            await db.collection('material').createIndex({ clase: 1 });
            
            console.log('✅ Colección "material" creada exitosamente con índices');
        } else {
            console.log('✅ Colección "material" ya existe');
        }

        // Verificar/crear colección de clases históricas
        const clasesHistoricasExists = await db.listCollections({ name: 'clases' }).hasNext();
        if (!clasesHistoricasExists) {
            console.log('📝 Creando colección "clases"...');
            await db.createCollection('clases');
            
            await db.collection('clases').createIndex({ fechaClase: -1 });
            await db.collection('clases').createIndex({ nombre: 1 });
            console.log('✅ Colección "clases" creada con índices');
        } else {
            console.log('✅ Colección "clases" ya existe');
        }

        // Verificar/crear colección de material histórico
        const materialHistoricoExists = await db.listCollections({ name: 'solicitudMaterial' }).hasNext();
        if (!materialHistoricoExists) {
            console.log('📝 Creando colección "solicitudMaterial"...');
            await db.createCollection('solicitudMaterial');
            
            await db.collection('solicitudMaterial').createIndex({ usuarioId: 1, claseId: 1 });
            await db.collection('solicitudMaterial').createIndex({ fechaSolicitud: -1 });
            await db.collection('solicitudMaterial').createIndex({ claseId: 1 });
            
            console.log('✅ Colección "solicitudMaterial" creada con índices');
        } else {
            console.log('✅ Colección "solicitudMaterial" ya existe');
        }

        // Cartelera: Verificar/crear colección de cartelera
        const carteleraExists = await db.listCollections({ name: 'cartelera' }).hasNext();
        if (!carteleraExists) {
            console.log('📝 Creando colección "cartelera"...');
            await db.createCollection('cartelera');
            await db.collection('cartelera').createIndex({ fechaInicio: 1 });
            await db.collection('cartelera').createIndex({ fechaExpiracion: 1 });
            await db.collection('cartelera').createIndex({ activo: 1 });
            await db.collection('cartelera').createIndex({ prioridad: -1 });
            console.log('✅ Colección "cartelera" creada con índices');
        } else {
            console.log('✅ Colección "cartelera" ya existe');
        }

        // Verificar/crear colección de clases públicas
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

        // ===== MIGRACIÓN: Agregar campo passwordUpdated a usuarios existentes =====
        console.log('🔄 Migrando usuarios existentes...');
        const usuarios = db.collection('usuarios');

        // Usuarios que ya tienen contraseña hasheada (no texto plano)
        const resultadoHash = await usuarios.updateMany(
            { 
                passwordUpdated: { $exists: false },
                // Si la contraseña NO es igual al legajo (asumiendo que los de texto plano usaban legajo)
                $expr: { $ne: [ "$password", "$legajo" ] }
            },
            { 
                $set: { 
                    passwordUpdated: true,
                    fechaMigracion: new Date()
                } 
            }
        );

        // Usuarios con contraseña en texto plano (necesitan migrar)
        const resultadoTexto = await usuarios.updateMany(
            { 
                passwordUpdated: { $exists: false },
                // Si la contraseña es igual al legajo (probablemente texto plano)
                $expr: { $eq: [ "$password", "$legajo" ] }
            },
            { 
                $set: { 
                    passwordUpdated: false
                } 
            }
        );

        console.log('✅ Migración de passwordUpdated completada:');
        console.log(`   - Usuarios marcados como actualizados: ${resultadoHash.modifiedCount}`);
        console.log(`   - Usuarios marcados para migrar: ${resultadoTexto.modifiedCount}`);

        console.log('\n🎉 Base de datos inicializada correctamente!');
        console.log('\n📊 Colecciones creadas/verificadas:');
        console.log('   - usuarios (con índices únicos para legajo y email)');
        console.log('   - inscripciones (con índice único para usuarioId + clase)');
        console.log('   - material (con índices para búsquedas eficientes)');
        console.log('   - clases (clases predefinidas)');
        console.log('   - clases-publicas (clases públicas)');
        console.log('   - solicitudMaterial (material histórico)');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        process.exit(1);
    }
}

initializeDatabase();