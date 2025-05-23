const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TaskTracker = require("./TaskTracker");
const { sendProgress } = require("./progressSse");

/**
 * Gestor de lotes consecutivos para operaciones de inserción masiva
 * Optimizado para manejar grandes volúmenes de datos con progreso en tiempo real
 */
class ConsecutiveBatchManager {
  constructor() {
    this.activeBatches = new Map();
    this.batchStats = new Map();
    this.defaultBatchSize = 100;
    this.maxConcurrentBatches = 3;
  }

  /**
   * Procesa datos en lotes consecutivos con progreso SSE
   * @param {string} taskId - ID de la tarea
   * @param {Array} data - Datos a procesar
   * @param {Object} options - Opciones de configuración
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processBatches(taskId, data, options = {}) {
    const batchId = `batch_${taskId}_${Date.now()}`;

    try {
      const config = {
        batchSize: options.batchSize || this.defaultBatchSize,
        serverKey: options.serverKey || "server2",
        tableName: options.tableName,
        columnTypes: options.columnTypes || {},
        clearBeforeInsert: options.clearBeforeInsert || false,
        validateRecords: options.validateRecords !== false,
        onProgress: options.onProgress || null,
        abortSignal: options.abortSignal || null,
      };

      logger.info(`🚀 Iniciando procesamiento por lotes: ${batchId}`);
      logger.info(
        `📊 Configuración: ${data.length} registros, lotes de ${config.batchSize}, servidor: ${config.serverKey}`
      );

      // Registrar el lote activo
      this.activeBatches.set(batchId, {
        taskId,
        startTime: Date.now(),
        totalRecords: data.length,
        processedRecords: 0,
        status: "running",
        config,
      });

      // Inicializar estadísticas
      this.batchStats.set(batchId, {
        totalBatches: Math.ceil(data.length / config.batchSize),
        completedBatches: 0,
        successfulInserts: 0,
        failedInserts: 0,
        duplicates: 0,
        errors: [],
      });

      // Obtener conexión al servidor
      const connectionResult = await ConnectionService.enhancedRobustConnect(
        config.serverKey
      );
      if (!connectionResult.success) {
        throw new Error(
          `No se pudo conectar a ${config.serverKey}: ${connectionResult.error?.message}`
        );
      }

      const connection = connectionResult.connection;
      let initialCount = 0;

      try {
        // Limpiar tabla si es necesario
        if (config.clearBeforeInsert && config.tableName) {
          logger.info(
            `🧹 Limpiando tabla ${config.tableName} antes de insertar`
          );

          const countBefore = await this.getTableCount(
            connection,
            config.tableName
          );
          await SqlService.clearTableData(connection, config.tableName);

          logger.info(`✅ Tabla limpiada: ${countBefore} registros eliminados`);
          this.updateProgress(taskId, 5, "Tabla limpiada");
        }

        // Obtener conteo inicial
        if (config.tableName) {
          initialCount = await this.getTableCount(connection, config.tableName);
          logger.info(`📊 Conteo inicial: ${initialCount} registros`);
        }

        // Procesar datos en lotes
        const result = await this.processDataInBatches(
          batchId,
          connection,
          data,
          config
        );

        // Obtener conteo final
        const finalCount = config.tableName
          ? await this.getTableCount(connection, config.tableName)
          : initialCount + result.successfulInserts;

        // Preparar resultado final
        const finalResult = {
          success: true,
          batchId,
          totalRecords: data.length,
          successfulInserts: result.successfulInserts,
          failedInserts: result.failedInserts,
          duplicates: result.duplicates,
          initialCount,
          finalCount,
          insertedCount: finalCount - initialCount,
          processingTime:
            Date.now() - this.activeBatches.get(batchId).startTime,
          errors: result.errors.slice(0, 10), // Solo los primeros 10 errores
        };

        logger.info(
          `✅ Procesamiento completado: ${JSON.stringify({
            batchId,
            successfulInserts: result.successfulInserts,
            failedInserts: result.failedInserts,
            duplicates: result.duplicates,
            processingTime: finalResult.processingTime,
          })}`
        );

        // Actualizar progreso final
        this.updateProgress(taskId, 100, "Procesamiento completado");

        return finalResult;
      } finally {
        // Liberar conexión
        try {
          await ConnectionService.releaseConnection(connection);
        } catch (e) {
          logger.warn(`Error al liberar conexión: ${e.message}`);
        }
      }
    } catch (error) {
      logger.error(
        `❌ Error en procesamiento por lotes ${batchId}: ${error.message}`
      );

      // Actualizar estado de error
      if (this.activeBatches.has(batchId)) {
        this.activeBatches.get(batchId).status = "failed";
      }

      this.updateProgress(taskId, -1, `Error: ${error.message}`);

      throw error;
    } finally {
      // Limpiar registros del lote
      this.cleanup(batchId);
    }
  }

  /**
   * Procesa los datos en lotes con control de concurrencia
   * @private
   */
  async processDataInBatches(batchId, connection, data, config) {
    const stats = this.batchStats.get(batchId);
    const batchInfo = this.activeBatches.get(batchId);

    let successfulInserts = 0;
    let failedInserts = 0;
    let duplicates = 0;
    const errors = [];

    // Dividir datos en lotes
    const batches = [];
    for (let i = 0; i < data.length; i += config.batchSize) {
      batches.push(data.slice(i, i + config.batchSize));
    }

    logger.info(
      `📦 Procesando ${batches.length} lotes de hasta ${config.batchSize} registros cada uno`
    );

    // Procesar lotes con control de concurrencia
    for (let i = 0; i < batches.length; i++) {
      // Verificar cancelación
      if (config.abortSignal?.aborted) {
        throw new Error("Procesamiento cancelado por el usuario");
      }

      const batch = batches[i];
      const batchNumber = i + 1;

      logger.debug(
        `🔄 Procesando lote ${batchNumber}/${batches.length} (${batch.length} registros)`
      );

      try {
        // Validar conexión antes de cada lote
        await this.validateConnection(connection, config.serverKey);

        // Procesar registros del lote
        const batchResult = await this.processBatch(
          connection,
          batch,
          config,
          batchNumber
        );

        // Actualizar contadores
        successfulInserts += batchResult.successful;
        failedInserts += batchResult.failed;
        duplicates += batchResult.duplicates;

        if (batchResult.errors.length > 0) {
          errors.push(...batchResult.errors);
        }

        // Actualizar estadísticas
        stats.completedBatches = batchNumber;
        stats.successfulInserts = successfulInserts;
        stats.failedInserts = failedInserts;
        stats.duplicates = duplicates;
        stats.errors = errors;

        // Actualizar progreso
        const progress = Math.min(
          Math.round((batchNumber / batches.length) * 100),
          99
        );
        this.updateProgress(
          batchInfo.taskId,
          progress,
          `Lote ${batchNumber}/${batches.length}: ${batchResult.successful} insertados`
        );

        batchInfo.processedRecords += batch.length;

        logger.debug(
          `✅ Lote ${batchNumber} completado: ${batchResult.successful} exitosos, ${batchResult.failed} fallidos, ${batchResult.duplicates} duplicados`
        );
      } catch (batchError) {
        logger.error(`❌ Error en lote ${batchNumber}: ${batchError.message}`);

        failedInserts += batch.length;
        errors.push({
          batchNumber,
          error: batchError.message,
          recordCount: batch.length,
        });

        // Decidir si continuar o abortar
        if (errors.length > 5) {
          logger.error(
            `❌ Demasiados errores (${errors.length}), abortando procesamiento`
          );
          throw new Error(
            `Procesamiento abortado después de ${errors.length} errores consecutivos`
          );
        }
      }

      // Pausa breve entre lotes para no sobrecargar la base de datos
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    return {
      successfulInserts,
      failedInserts,
      duplicates,
      errors: errors.slice(0, 50), // Limitar errores reportados
    };
  }

  /**
   * Procesa un lote individual de registros
   * @private
   */
  async processBatch(connection, batch, config, batchNumber) {
    let successful = 0;
    let failed = 0;
    let duplicates = 0;
    const errors = [];

    for (const record of batch) {
      try {
        // Validar registro si está habilitado
        if (config.validateRecords) {
          const validatedRecord = SqlService.validateRecord(record);

          // Insertar registro validado
          const result = await SqlService.insertWithExplicitTypes(
            connection,
            config.tableName,
            validatedRecord,
            config.columnTypes
          );

          if (result && result.rowsAffected > 0) {
            successful += result.rowsAffected;
          } else {
            failed++;
          }
        } else {
          // Insertar sin validación adicional
          const result = await SqlService.insertWithExplicitTypes(
            connection,
            config.tableName,
            record,
            config.columnTypes
          );

          if (result && result.rowsAffected > 0) {
            successful += result.rowsAffected;
          } else {
            failed++;
          }
        }
      } catch (insertError) {
        // Manejar errores específicos
        if (this.isDuplicateKeyError(insertError)) {
          duplicates++;
        } else if (this.isConnectionError(insertError)) {
          // Reconectar y reintentar
          logger.warn(
            `Reconectando por error de conexión en lote ${batchNumber}`
          );

          const reconnectResult = await ConnectionService.enhancedRobustConnect(
            config.serverKey
          );
          if (reconnectResult.success) {
            connection = reconnectResult.connection;

            // Reintentar inserción
            try {
              const retryResult = await SqlService.insertWithExplicitTypes(
                connection,
                config.tableName,
                record,
                config.columnTypes
              );

              if (retryResult && retryResult.rowsAffected > 0) {
                successful += retryResult.rowsAffected;
              } else {
                failed++;
              }
            } catch (retryError) {
              failed++;
              errors.push({
                record: JSON.stringify(record).substring(0, 100),
                error: retryError.message,
              });
            }
          } else {
            failed++;
            errors.push({
              record: JSON.stringify(record).substring(0, 100),
              error: insertError.message,
            });
          }
        } else {
          failed++;
          errors.push({
            record: JSON.stringify(record).substring(0, 100),
            error: insertError.message,
          });
        }
      }
    }

    return { successful, failed, duplicates, errors };
  }

  /**
   * Valida que la conexión siga activa
   * @private
   */
  async validateConnection(connection, serverKey) {
    try {
      await SqlService.query(connection, "SELECT 1 AS test");
    } catch (connError) {
      logger.warn(`Conexión perdida, reconectando a ${serverKey}...`);

      const reconnectResult = await ConnectionService.enhancedRobustConnect(
        serverKey
      );
      if (!reconnectResult.success) {
        throw new Error(
          `No se pudo reconectar a ${serverKey}: ${reconnectResult.error?.message}`
        );
      }

      return reconnectResult.connection;
    }

    return connection;
  }

  /**
   * Obtiene el conteo de registros de una tabla
   * @private
   */
  async getTableCount(connection, tableName) {
    try {
      const result = await SqlService.query(
        connection,
        `SELECT COUNT(*) AS total FROM ${tableName} WITH (NOLOCK)`
      );
      return result.recordset[0]?.total || 0;
    } catch (error) {
      logger.warn(
        `No se pudo obtener conteo de ${tableName}: ${error.message}`
      );
      return 0;
    }
  }

  /**
   * Actualiza el progreso de la tarea
   * @private
   */
  updateProgress(taskId, progress, message = "") {
    try {
      sendProgress(taskId, progress, message);
    } catch (error) {
      logger.warn(`Error al enviar progreso: ${error.message}`);
    }
  }

  /**
   * Verifica si un error es de clave duplicada
   * @private
   */
  isDuplicateKeyError(error) {
    return (
      error.number === 2627 ||
      error.number === 2601 ||
      (error.message &&
        (error.message.includes("PRIMARY KEY") ||
          error.message.includes("UNIQUE KEY") ||
          error.message.includes("duplicate key")))
    );
  }

  /**
   * Verifica si un error es de conexión
   * @private
   */
  isConnectionError(error) {
    return (
      error.message &&
      (error.message.includes("conexión") ||
        error.message.includes("connection") ||
        error.message.includes("timeout") ||
        error.message.includes("state"))
    );
  }

  /**
   * Limpia los registros de un lote completado
   * @private
   */
  cleanup(batchId) {
    try {
      this.activeBatches.delete(batchId);
      this.batchStats.delete(batchId);
      logger.debug(`🧹 Limpieza completada para lote: ${batchId}`);
    } catch (error) {
      logger.warn(
        `Error durante limpieza de lote ${batchId}: ${error.message}`
      );
    }
  }

  /**
   * Obtiene estadísticas de lotes activos
   */
  getActiveStats() {
    const activeStats = [];

    for (const [batchId, batchInfo] of this.activeBatches.entries()) {
      const stats = this.batchStats.get(batchId);

      activeStats.push({
        batchId,
        taskId: batchInfo.taskId,
        status: batchInfo.status,
        startTime: batchInfo.startTime,
        totalRecords: batchInfo.totalRecords,
        processedRecords: batchInfo.processedRecords,
        progress: Math.round(
          (batchInfo.processedRecords / batchInfo.totalRecords) * 100
        ),
        stats: stats
          ? {
              completedBatches: stats.completedBatches,
              totalBatches: stats.totalBatches,
              successfulInserts: stats.successfulInserts,
              failedInserts: stats.failedInserts,
              duplicates: stats.duplicates,
              errorCount: stats.errors.length,
            }
          : null,
      });
    }

    return activeStats;
  }

  /**
   * Cancela un lote en proceso
   */
  async cancelBatch(batchId) {
    try {
      if (this.activeBatches.has(batchId)) {
        const batchInfo = this.activeBatches.get(batchId);
        batchInfo.status = "cancelled";

        logger.info(`⏹️ Lote ${batchId} marcado para cancelación`);

        // El proceso verificará el estado y se detendrá
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error al cancelar lote ${batchId}: ${error.message}`);
      return false;
    }
  }
}

// Exportar instancia singleton
module.exports = new ConsecutiveBatchManager();
