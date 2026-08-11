const mongoose = require('mongoose');
const ConsecutiveService = require('./server/services/ConsecutiveService');
const Consecutive = require('./server/models/consecutiveModel');
const logger = require('./server/services/logger');

async function testSync() {
  try {
    console.log('🚀 Iniciando prueba de sincronización...');
    
    // Conectar a MongoDB (ajusta la URI si es necesario)
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/core_app');
    console.log('✅ MongoDB conectado');

    // 1. Crear un consecutivo de prueba para Recibos
    const testRecibo = await Consecutive.findOneAndUpdate(
      { name: 'TEST_RECIBO_SYNC' },
      {
        name: 'TEST_RECIBO_SYNC',
        currentValue: 150193,
        sqlSync: {
          enabled: true,
          serverKey: 'server1',
          tableName: 'catelli.CONSECUTIVO',
          keyField: 'CONSECUTIVO',
          keyValue: '04',
          valueField: 'ULTIMO_VALOR'
        },
        active: true
      },
      { upsert: true, new: true }
    );

    console.log('📦 Consecutivo de prueba creado/actualizado');

    // 2. Simular una reserva y confirmación
    const reservation = await ConsecutiveService.reserveConsecutiveValues(testRecibo._id, 1);
    console.log('🔢 Valor reservado:', reservation.values[0].formatted);

    console.log('🔄 Ejecutando commit (debería disparar SQL Sync)...');
    await ConsecutiveService.commitReservation(testRecibo._id, reservation.reservationId, reservation.values);
    
    console.log('✅ Prueba completada. Revisa los logs de arriba para ver el UPDATE SQL.');

  } catch (error) {
    console.error('❌ Error en prueba:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testSync();
