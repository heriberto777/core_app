const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const PromotionProcessor = require("./PromotionProcessor");

class DynamicTransferService {
  /**
   * Procesa documentos según una configuración de mapeo
   * @param {Array} documentIds - IDs de los documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {Object} signal - Señal de AbortController para cancelación
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    // Crear AbortController local si no se proporcionó signal
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    // Define cancelTaskId at the function level so it's available in all scopes
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    // Configurar un timeout interno como medida de seguridad
    const timeoutId = setTimeout(() => {
      if (localAbortController) {
        logger.warn(`Timeout interno activado para tarea ${mappingId}`);
        localAbortController.abort();
      }
    }, 120000); // 2 minutos

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    // Variables para manejar consecutivos centralizados
    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. Cargar configuración de mapeo
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Asegurar configuración por defecto para mappings existentes
      if (!mapping.markProcessedStrategy) {
        mapping.markProcessedStrategy = "individual"; // Mantener comportamiento actual
      }

      if (!mapping.markProcessedConfig) {
        mapping.markProcessedConfig = {
          batchSize: 100,
          includeTimestamp: true,
          timestampField: "LAST_PROCESSED_DATE",
          allowRollback: false,
        };
      }

      // 2. Verificar si se usan consecutivos centralizados
      if (
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.useCentralizedSystem
      ) {
        useCentralizedConsecutives = true;
        centralizedConsecutiveId =
          mapping.consecutiveConfig.selectedCentralizedConsecutive;
        logger.info(
          `Usando consecutivos centralizados: ${centralizedConsecutiveId}`
        );
      }

      // 3. Establecer conexiones
      logger.info(`Estableciendo conexiones para mapeo ${mapping.name}`);
      logger.info(`Servidor origen: ${mapping.sourceServer}`);
      logger.info(`Servidor destino: ${mapping.targetServer}`);

      const sourceConnResult = await ConnectionService.enhancedRobustConnect(
        mapping.sourceServer
      );
      if (!sourceConnResult.success) {
        clearTimeout(timeoutId);
        throw new Error(
          `No se pudo establecer conexión con servidor origen ${
            mapping.sourceServer
          }: ${sourceConnResult.error?.message || "Error desconocido"}`
        );
      }
      sourceConnection = sourceConnResult.connection;

      const targetConnResult = await ConnectionService.enhancedRobustConnect(
        mapping.targetServer
      );
      if (!targetConnResult.success) {
        clearTimeout(timeoutId);
        throw new Error(
          `No se pudo establecer conexión con servidor destino ${
            mapping.targetServer
          }: ${targetConnResult.error?.message || "Error desconocido"}`
        );
      }
      targetConnection = targetConnResult.connection;

      // 4. Crear registro de ejecución
      const executionData = {
        taskId: mapping.taskId,
        taskName: mapping.name,
        status: "running",
        documentIds: documentIds,
        totalDocuments: documentIds.length,
        startTime: new Date(startTime),
        mapping: mappingId,
        sourceServer: mapping.sourceServer,
        targetServer: mapping.targetServer,
        useCentralizedConsecutives,
        centralizedConsecutiveId,
      };

      const taskExecution = new TaskExecution(executionData);
      const savedExecution = await taskExecution.save();
      executionId = savedExecution._id;

      // 5. Actualizar estado de la tarea
      if (mapping.taskId) {
        await TransferTask.findByIdAndUpdate(mapping.taskId, {
          status: "running",
          progress: 0,
          lastExecutionId: executionId,
        });
      }

      // 6. Registrar tarea en TaskTracker
      TaskTracker.startTask(
        cancelTaskId,
        mapping.name,
        documentIds.length,
        signal
      );

      // 7. Procesar documentos
      const results = {
        processed: 0,
        failed: 0,
        details: [],
      };

      // Procesar documentos uno por uno
      for (let i = 0; i < documentIds.length; i++) {
        if (signal?.aborted) {
          logger.info("Proceso cancelado por el usuario");
          break;
        }

        const documentId = documentIds[i];
        logger.info(
          `Procesando documento ${documentId} (${i + 1}/${documentIds.length})`
        );

        try {
          // Usar método con soporte para promociones
          const result = await this.processSingleDocumentWithPromotions(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            useCentralizedConsecutives,
            centralizedConsecutiveId
          );

          if (result.success) {
            results.processed++;
            results.details.push({
              documentId,
              success: true,
              message: "Documento procesado exitosamente",
              consecutiveUsed: result.consecutiveUsed,
              consecutiveValue: result.consecutiveValue,
            });
          } else {
            results.failed++;
            results.details.push({
              documentId,
              success: false,
              message: result.message || "Error desconocido",
              error: result.error,
            });
          }
        } catch (error) {
          results.failed++;
          results.details.push({
            documentId,
            success: false,
            message: error.message || "Error desconocido",
            error: error.stack,
          });
          logger.error(
            `Error procesando documento ${documentId}: ${error.message}`
          );
        }

        // Actualizar progreso
        const progress = Math.round(((i + 1) / documentIds.length) * 100);
        if (mapping.taskId) {
          await TransferTask.findByIdAndUpdate(mapping.taskId, {
            progress,
          });
        }
        TaskTracker.updateProgress(cancelTaskId, progress);
      }

      // 8. Finalizar
      clearTimeout(timeoutId);
      const hasErrors = results.failed > 0;
      const finalStatus = hasErrors ? "completed_with_errors" : "completed";

      // Actualizar ejecución
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        endTime: new Date(),
        executionTime: Date.now() - startTime,
        processedDocuments: results.processed,
        failedDocuments: results.failed,
        result: {
          success: !hasErrors,
          message: hasErrors
            ? `Procesamiento completado con errores: ${results.processed} éxitos, ${results.failed} fallos`
            : "Procesamiento completado con éxito",
          affectedRecords: results.processed,
          errorDetails: hasErrors
            ? results.details
                .filter((d) => !d.success)
                .map(
                  (d) =>
                    `Documento ${d.documentId}: ${
                      d.message || d.error || "Error no especificado"
                    }`
                )
                .join("\n")
            : null,
        },
      });

      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: true,
        executionId,
        status: finalStatus,
        ...results,
      };
    } catch (error) {
      // Limpiar timeout
      clearTimeout(timeoutId);

      // Verificar si fue cancelado
      if (signal?.aborted) {
        logger.info("Tarea cancelada por el usuario");

        if (executionId) {
          await TaskExecution.findByIdAndUpdate(executionId, {
            status: "cancelled",
            executionTime: Date.now() - startTime,
            errorMessage: "Cancelada por el usuario",
          });
        }

        if (mapping?.taskId) {
          await TransferTask.findByIdAndUpdate(mapping.taskId, {
            status: "cancelled",
            progress: -1,
            lastExecutionResult: {
              success: false,
              message: "Tarea cancelada por el usuario",
            },
          });
        }

        TaskTracker.completeTask(
          cancelTaskId || `dynamic_process_${mappingId}`,
          "cancelled"
        );

        return {
          success: false,
          message: "Tarea cancelada por el usuario",
          executionId,
        };
      }

      logger.error(`Error al procesar documentos: ${error.message}`);

      // Actualizar el registro de ejecución en caso de error
      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          errorMessage: error.message,
        });
      }

      // Actualizar la tarea principal con el error
      if (mapping?.taskId) {
        await TransferTask.findByIdAndUpdate(mapping.taskId, {
          status: "failed",
          progress: -1,
          lastExecutionResult: {
            success: false,
            message: `Error: ${error.message}`,
            errorDetails: error.stack,
          },
        });
      }

      TaskTracker.completeTask(
        cancelTaskId || `dynamic_process_${mappingId}`,
        "failed"
      );

      throw error;
    } finally {
      // Cerrar conexiones de forma segura
      if (sourceConnection || targetConnection) {
        logger.info("Liberando conexiones...");

        const releasePromises = [];

        if (sourceConnection) {
          releasePromises.push(
            ConnectionService.releaseConnection(sourceConnection).catch((e) =>
              logger.error(`Error al liberar conexión origen: ${e.message}`)
            )
          );
        }

        if (targetConnection) {
          releasePromises.push(
            ConnectionService.releaseConnection(targetConnection).catch((e) =>
              logger.error(`Error al liberar conexión destino: ${e.message}`)
            )
          );
        }

        await Promise.allSettled(releasePromises);
        logger.info("Conexiones liberadas correctamente");
      }
    }
  }

  /**
   * Procesa un documento con soporte para promociones
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {boolean} useCentralizedConsecutives - Si usar consecutivos centralizados
   * @param {string} centralizedConsecutiveId - ID del consecutivo centralizado
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentWithPromotions(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(
        `Procesando documento ${documentId} con soporte para promociones`
      );

      // Create column length cache
      const columnLengthCache = new Map();

      // 1. Identificar las tablas principales (no de detalle)
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // Ordenar tablas por executionOrder si está definido
      const orderedMainTables = [...mainTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );
      logger.info(
        `Procesando ${
          orderedMainTables.length
        } tablas principales en orden: ${orderedMainTables
          .map((t) => t.name)
          .join(" -> ")}`
      );

      // 2. Generar consecutivo si es necesario
      let currentConsecutive = null;
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        logger.info("Generando consecutivo para documento...");
        currentConsecutive = await this.generateConsecutive(
          mapping,
          useCentralizedConsecutives,
          centralizedConsecutiveId
        );
        logger.info(`Consecutivo generado: ${currentConsecutive.formatted}`);
      }

      // 3. Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        try {
          sourceData = await this.getSourceData(
            documentId,
            tableConfig,
            sourceConnection
          );

          if (!sourceData) {
            logger.warn(
              `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
            );
            continue;
          }

          logger.debug(
            `Datos de origen obtenidos: ${JSON.stringify(sourceData)}`
          );
        } catch (error) {
          logger.error(
            `Error al obtener datos de origen para documento ${documentId}: ${error.message}`
          );
          throw new Error(`Error al obtener datos de origen: ${error.message}`);
        }

        // Procesar dependencias de foreign key ANTES de insertar datos principales
        try {
          if (
            mapping.foreignKeyDependencies &&
            mapping.foreignKeyDependencies.length > 0
          ) {
            logger.info(
              `Verificando ${mapping.foreignKeyDependencies.length} dependencias de foreign key para documento ${documentId}`
            );
            await this.processForeignKeyDependencies(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              sourceData
            );
            logger.info(
              `Dependencias de foreign key procesadas exitosamente para documento ${documentId}`
            );
          }
        } catch (depError) {
          logger.error(
            `Error en dependencias de foreign key para documento ${documentId}: ${depError.message}`
          );
          throw new Error(`Error en dependencias: ${depError.message}`);
        }

        // 4. Determinar el tipo de documento basado en las reglas
        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          sourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // 5. Insertar datos principales
        await this.processTable(
          tableConfig,
          sourceData,
          sourceData,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false // isDetailTable = false
        );

        logger.info(`Insertados datos principales en ${tableConfig.name}`);
        processedTables.push(tableConfig.name);

        // 6. Procesar tablas de detalle con promociones
        const detailTables = mapping.tableConfigs.filter(
          (tc) =>
            tc.isDetailTable &&
            (!tc.parentTableRef || tc.parentTableRef === tableConfig.name)
        );

        if (detailTables.length > 0) {
          await this.processDetailTablesWithPromotions(
            detailTables,
            documentId,
            sourceData,
            tableConfig,
            sourceConnection,
            targetConnection,
            currentConsecutive,
            mapping,
            columnLengthCache,
            processedTables
          );
        }
      }

      return {
        success: true,
        message: "Documento procesado exitosamente",
        documentType,
        consecutiveUsed: currentConsecutive
          ? currentConsecutive.formatted
          : null,
        consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
      };
    } catch (error) {
      return this.handleProcessingError(
        error,
        documentId,
        currentConsecutive,
        mapping
      );
    }
  }

  /**
   * Procesa un único documento según la configuración (sin transacciones)
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {Object} currentConsecutive - Consecutivo generado previamente (opcional)
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentSimple(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(
        `Procesando documento ${documentId} (modo sin transacciones)`
      );

      // Create column length cache
      const columnLengthCache = new Map();

      // 1. Identificar las tablas principales (no de detalle)
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // Ordenar tablas por executionOrder si está definido
      const orderedMainTables = [...mainTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );
      logger.info(
        `Procesando ${
          orderedMainTables.length
        } tablas principales en orden: ${orderedMainTables
          .map((t) => t.name)
          .join(" -> ")}`
      );

      // 2. Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        try {
          sourceData = await this.getSourceData(
            documentId,
            tableConfig,
            sourceConnection
          );

          if (!sourceData) {
            logger.warn(
              `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
            );
            continue;
          }

          logger.debug(
            `Datos de origen obtenidos: ${JSON.stringify(sourceData)}`
          );
        } catch (error) {
          logger.error(
            `Error al obtener datos de origen para documento ${documentId}: ${error.message}`
          );
          throw new Error(`Error al obtener datos de origen: ${error.message}`);
        }

        // Procesar dependencias de foreign key ANTES de insertar datos principales
        try {
          if (
            mapping.foreignKeyDependencies &&
            mapping.foreignKeyDependencies.length > 0
          ) {
            logger.info(
              `Verificando ${mapping.foreignKeyDependencies.length} dependencias de foreign key para documento ${documentId}`
            );
            await this.processForeignKeyDependencies(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              sourceData
            );
            logger.info(
              `Dependencias de foreign key procesadas exitosamente para documento ${documentId}`
            );
          }
        } catch (depError) {
          logger.error(
            `Error en dependencias de foreign key para documento ${documentId}: ${depError.message}`
          );
          throw new Error(`Error en dependencias: ${depError.message}`);
        }

        // 3. Determinar el tipo de documento basado en las reglas
        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          sourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // 4. Insertar datos principales
        await this.processTable(
          tableConfig,
          sourceData,
          sourceData,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false // isDetailTable = false
        );

        logger.info(
          `Insertados datos principales en ${tableConfig.name} sin transacción`
        );
        processedTables.push(tableConfig.name);

        // 5. Procesar tablas de detalle
        const detailTables = mapping.tableConfigs.filter(
          (tc) =>
            tc.isDetailTable &&
            (!tc.parentTableRef || tc.parentTableRef === tableConfig.name)
        );

        if (detailTables.length > 0) {
          await this.processDetailTables(
            detailTables,
            documentId,
            sourceData,
            tableConfig,
            sourceConnection,
            targetConnection,
            currentConsecutive,
            mapping,
            columnLengthCache,
            processedTables
          );
        }
      }

      return {
        success: true,
        message: "Documento procesado exitosamente",
        documentType,
        consecutiveUsed: currentConsecutive
          ? currentConsecutive.formatted
          : null,
        consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
      };
    } catch (error) {
      return this.handleProcessingError(
        error,
        documentId,
        currentConsecutive,
        mapping
      );
    }
  }

  /**
   * Procesa las tablas de detalle con soporte para promociones
   * @private
   */
  async processDetailTablesWithPromotions(
    detailTables,
    documentId,
    sourceData,
    parentTableConfig,
    sourceConnection,
    targetConnection,
    currentConsecutive,
    mapping,
    columnLengthCache,
    processedTables
  ) {
    // Ordenar tablas de detalle por executionOrder
    const orderedDetailTables = [...detailTables].sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    logger.info(
      `Procesando ${
        orderedDetailTables.length
      } tablas de detalle en orden: ${orderedDetailTables
        .map((t) => t.name)
        .join(" -> ")}`
    );

    for (const detailConfig of orderedDetailTables) {
      logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);

      // Obtener detalles con procesamiento de promociones
      const detailsData = await this.getDetailDataWithPromotions(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection,
        mapping
      );

      if (!detailsData || detailsData.length === 0) {
        logger.warn(
          `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
        );
        continue;
      }

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${detailConfig.name}`
      );

      // Insertar detalles
      for (const detailRow of detailsData) {
        await this.processTable(
          detailConfig,
          sourceData,
          detailRow,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          true // isDetailTable = true
        );

        logger.debug(
          `✅ INSERCIÓN EXITOSA DE DETALLE en ${detailConfig.targetTable}`
        );
      }

      logger.info(`Insertados detalles en ${detailConfig.name}`);
      processedTables.push(detailConfig.name);
    }
  }

  /**
   * Procesa las tablas de detalle (método original)
   * @private
   */
  async processDetailTables(
    detailTables,
    documentId,
    sourceData,
    parentTableConfig,
    sourceConnection,
    targetConnection,
    currentConsecutive,
    mapping,
    columnLengthCache,
    processedTables
  ) {
    // Ordenar tablas de detalle por executionOrder
    const orderedDetailTables = [...detailTables].sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    logger.info(
      `Procesando ${
        orderedDetailTables.length
      } tablas de detalle en orden: ${orderedDetailTables
        .map((t) => t.name)
        .join(" -> ")}`
    );

    for (const detailConfig of orderedDetailTables) {
      logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);

      // Obtener detalles
      const detailsData = await this.getDetailData(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );

      if (!detailsData || detailsData.length === 0) {
        logger.warn(
          `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
        );
        continue;
      }

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${detailConfig.name}`
      );

      // Insertar detalles
      for (const detailRow of detailsData) {
        await this.processTable(
          detailConfig,
          sourceData,
          detailRow,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          true // isDetailTable = true
        );

        logger.debug(
          `✅ INSERCIÓN EXITOSA DE DETALLE en ${detailConfig.targetTable}`
        );
      }

      logger.info(
        `Insertados detalles en ${detailConfig.name} sin transacción`
      );
      processedTables.push(detailConfig.name);
    }
  }

  /**
   * Obtiene datos de detalle con procesamiento de promociones
   * @private
   */
  async getDetailDataWithPromotions(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection,
    mapping
  ) {
    // Obtener datos de detalle normalmente
    const detailData = await this.getDetailData(
      detailConfig,
      parentTableConfig,
      documentId,
      sourceConnection
    );

    // Verificar si hay configuración de promociones
    if (!mapping.promotionConfig || !mapping.promotionConfig.enabled) {
      logger.debug("Promociones deshabilitadas, procesando datos normalmente");
      return detailData;
    }

    // Validar configuración de promociones
    if (!PromotionProcessor.validatePromotionConfig(mapping)) {
      logger.warn(
        "Configuración de promociones inválida, procesando sin promociones"
      );
      return detailData;
    }

    logger.info(
      `Procesando detalles con promociones para documento ${documentId}`
    );

    // Procesar promociones
    const processedData = PromotionProcessor.processPromotions(
      detailData,
      mapping
    );

    // Aplicar reglas específicas si están configuradas
    const finalData = PromotionProcessor.applyPromotionRules(
      processedData,
      mapping.promotionConfig
    );

    logger.info(
      `Procesamiento de promociones completado para documento ${documentId}`
    );
    return finalData;
  }

  /**
   * Obtiene datos de detalle
   * @private
   */
  async getDetailData(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    if (detailConfig.customQuery) {
      // Usar consulta personalizada
      const query = detailConfig.customQuery.replace(
        /@documentId/g,
        documentId
      );
      logger.debug(`Ejecutando consulta personalizada para detalles: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset;
    } else if (detailConfig.useSameSourceTable) {
      // Caso especial: usa la misma tabla que el encabezado
      return this.getDetailDataFromSameTable(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );
    } else {
      // Tabla de detalle normal con su propia fuente
      return this.getDetailDataFromOwnTable(
        detailConfig,
        documentId,
        sourceConnection
      );
    }
  }

  /**
   * Obtiene datos de detalle de la misma tabla que el encabezado
   * @private
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const tableAlias = "d1";
    const orderByColumn = detailConfig.orderByColumn || "";

    // Usar la función centralizada para obtener campos requeridos
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);

    // Construir la lista de campos con alias de tabla
    const finalSelectFields = requiredFields
      .map((field) => `${tableAlias}.${field}`)
      .join(", ");

    const primaryKey =
      detailConfig.primaryKey || parentTableConfig.primaryKey || "NUM_PED";

    const query = `
      SELECT ${finalSelectFields} FROM ${
      parentTableConfig.sourceTable
    } ${tableAlias}
      WHERE ${tableAlias}.${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${this.processFilterCondition(
              detailConfig.filterCondition,
              tableAlias
            )}`
          : ""
      }
      ${orderByColumn ? ` ORDER BY ${tableAlias}.${orderByColumn}` : ""}
    `;

    console.log(`🔍 CONSULTA DETALLE CORREGIDA: ${query}`);
    console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
    if (result.recordset && result.recordset.length > 0) {
      console.log(
        `🔍 CAMPOS DISPONIBLES EN RESULTADO: ${Object.keys(
          result.recordset[0]
        ).join(", ")}`
      );
    }

    return result.recordset;
  }

  /**
   * Obtiene datos de detalle de su propia tabla
   * @private
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "";

    // Usar la función centralizada para obtener campos requeridos
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);

    // Construir la lista de campos (sin alias porque es tabla única)
    const finalSelectFields = requiredFields.join(", ");

    const primaryKey = detailConfig.primaryKey || "NUM_PED";

    const query = `
      SELECT ${finalSelectFields} FROM ${detailConfig.sourceTable}
      WHERE ${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${detailConfig.filterCondition}`
          : ""
      }
      ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
    `;

    console.log(`🔍 CONSULTA DETALLE PROPIA: ${query}`);
    console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
    if (result.recordset && result.recordset.length > 0) {
      console.log(
        `🔍 CAMPOS DISPONIBLES EN RESULTADO: ${Object.keys(
          result.recordset[0]
        ).join(", ")}`
      );
    }

    return result.recordset;
  }

  /**
   * Obtiene datos de la tabla de origen
   * @private
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    if (tableConfig.customQuery) {
      // Usar consulta personalizada si existe
      const query = tableConfig.customQuery.replace(/@documentId/g, documentId);
      logger.debug(`Ejecutando consulta personalizada: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset[0];
    } else {
      // Usar la función centralizada para obtener campos requeridos
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const tableAlias = "t1";

      // Construir la lista de campos con alias de tabla
      const finalSelectFields = requiredFields
        .map((field) => `${tableAlias}.${field}`)
        .join(", ");

      const primaryKey = tableConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${finalSelectFields} FROM ${
        tableConfig.sourceTable
      } ${tableAlias}
        WHERE ${tableAlias}.${primaryKey} = @documentId
        ${
          tableConfig.filterCondition
            ? ` AND ${this.processFilterCondition(
                tableConfig.filterCondition,
                tableAlias
              )}`
            : ""
        }
      `;

      console.log(`🔍 CONSULTA ENCABEZADO CORREGIDA: ${query}`);
      console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

      logger.debug(`Ejecutando consulta principal: ${query}`);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
      if (result.recordset && result.recordset.length > 0) {
        console.log(
          `🔍 CAMPOS DISPONIBLES EN ENCABEZADO: ${Object.keys(
            result.recordset[0]
          ).join(", ")}`
        );
      }

      return result.recordset[0];
    }
  }

  /**
   * Método auxiliar para recopilar todos los campos necesarios de una configuración de tabla
   * @private
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    if (tableConfig.fieldMappings && tableConfig.fieldMappings.length > 0) {
      tableConfig.fieldMappings.forEach((fm) => {
        // Campo de origen mapeado
        if (fm.sourceField) {
          requiredFields.add(fm.sourceField);
        }

        // Campos para conversión de unidades
        if (fm.unitConversion && fm.unitConversion.enabled) {
          if (fm.unitConversion.unitMeasureField) {
            requiredFields.add(fm.unitConversion.unitMeasureField);
          }
          if (fm.unitConversion.conversionFactorField) {
            requiredFields.add(fm.unitConversion.conversionFactorField);
          }
        }

        // Campos para lookup
        if (fm.lookupFromTarget && fm.lookupParams) {
          fm.lookupParams.forEach((param) => {
            if (param.sourceField) {
              requiredFields.add(param.sourceField);
            }
          });
        }
      });
    }

    // Agregar clave primaria
    const primaryKey = tableConfig.primaryKey || "NUM_PED";
    requiredFields.add(primaryKey);

    return Array.from(requiredFields);
  }

  /**
   * Procesa condición de filtro agregando alias de tabla
   * @private
   */
  processFilterCondition(filterCondition, tableAlias) {
    return filterCondition.replace(/\b(\w+)\b/g, (m, field) => {
      if (
        !field.includes(".") &&
        !field.match(/^[\d.]+$/) &&
        ![
          "AND",
          "OR",
          "NULL",
          "IS",
          "NOT",
          "IN",
          "LIKE",
          "BETWEEN",
          "TRUE",
          "FALSE",
        ].includes(field.toUpperCase())
      ) {
        return `${tableAlias}.${field}`;
      }
      return m;
    });
  }

  /**
   * Procesa una tabla individual
   * @private
   */
  async processTable(
    tableConfig,
    sourceData,
    tableData,
    targetConnection,
    currentConsecutive,
    mapping,
    documentId,
    columnLengthCache,
    isDetailTable = false
  ) {
    const targetData = {};
    const targetFields = [];
    const targetValues = [];
    const directSqlFields = new Set();

    // Determinar si los datos a procesar son para la tabla actual
    const dataForProcessing = isDetailTable ? tableData : sourceData;

    // Ejecutar lookup si está configurado
    let lookupResults = {};
    if (this.hasLookupFields(tableConfig)) {
      logger.info(`Ejecutando lookup para tabla ${tableConfig.name}...`);
      const lookupExecution = await this.executeLookupInTarget(
        tableConfig,
        dataForProcessing,
        targetConnection
      );

      if (!lookupExecution.success) {
        const failedMsg = lookupExecution.failedFields
          ? lookupExecution.failedFields
              .map((f) => `${f.field}: ${f.error}`)
              .join(", ")
          : lookupExecution.error || "Error desconocido en lookup";

        throw new Error(
          `Falló la validación de lookup para tabla ${tableConfig.name}: ${failedMsg}`
        );
      }

      lookupResults = lookupExecution.results;
      logger.info(
        `Lookup completado exitosamente. Continuando con el procesamiento...`
      );
    }

    // Procesar todos los campos
    for (const fieldMapping of tableConfig.fieldMappings) {
      const processedField = await this.processField(
        fieldMapping,
        dataForProcessing,
        lookupResults,
        currentConsecutive,
        mapping,
        tableConfig,
        isDetailTable,
        targetConnection,
        columnLengthCache
      );

      if (processedField.isDirectSql) {
        targetFields.push(fieldMapping.targetField);
        targetValues.push(processedField.value); // Expresión SQL directa
        directSqlFields.add(fieldMapping.targetField);
      } else {
        targetData[fieldMapping.targetField] = processedField.value;
        targetFields.push(fieldMapping.targetField);
        targetValues.push(`@${fieldMapping.targetField}`);
      }

      logger.debug(
        `✅ Campo ${fieldMapping.targetField} preparado para inserción: ${
          processedField.value
        } (tipo: ${typeof processedField.value})`
      );
    }

    // Construir y ejecutar la consulta INSERT
    await this.executeInsert(
      tableConfig.targetTable,
      targetFields,
      targetValues,
      targetData,
      directSqlFields,
      targetConnection
    );
  }

  /**
   * Procesa un campo individual - MÉTODO UNIFICADO
   * @private
   */
  async processField(
    fieldMapping,
    sourceData,
    lookupResults,
    currentConsecutive,
    mapping,
    tableConfig,
    isDetailTable,
    targetConnection,
    columnLengthCache
  ) {
    let value;

    // PRIORIDAD 1: Usar valores obtenidos por lookup si existen
    if (
      fieldMapping.lookupFromTarget &&
      lookupResults[fieldMapping.targetField] !== undefined
    ) {
      value = lookupResults[fieldMapping.targetField];
      logger.debug(
        `Usando valor de lookup para ${fieldMapping.targetField}: ${value}`
      );
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 2: Verificar si el campo es una función SQL nativa
    const defaultValue = fieldMapping.defaultValue;
    const sqlNativeFunctions = [
      "GETDATE()",
      "CURRENT_TIMESTAMP",
      "NEWID()",
      "SYSUTCDATETIME()",
      "SYSDATETIME()",
      "GETUTCDATE()",
      "DAY(",
      "MONTH(",
      "YEAR(",
      "GETDATE",
      "DATEADD",
      "DATEDIFF",
    ];

    const isNativeFunction =
      typeof defaultValue === "string" &&
      sqlNativeFunctions.some((fn) => defaultValue.includes(fn));

    if (isNativeFunction) {
      logger.debug(
        `Campo ${fieldMapping.targetField} usa función SQL nativa: ${defaultValue}`
      );
      return { value: defaultValue, isDirectSql: true };
    }

    // PRIORIDAD 3: Consecutivo (si está configurado)
    if (currentConsecutive && this.isConsecutiveField(fieldMapping, mapping)) {
      const consecutiveValue = this.getConsecutiveValue(
        fieldMapping,
        currentConsecutive,
        isDetailTable
      );
      logger.debug(
        `Asignando consecutivo a ${fieldMapping.targetField}: ${consecutiveValue}`
      );
      return { value: consecutiveValue, isDirectSql: false };
    }

    // PRIORIDAD 4: Obtener valor del campo origen
    if (fieldMapping.sourceField) {
      value = sourceData[fieldMapping.sourceField];
      logger.debug(
        `Valor original de ${
          fieldMapping.sourceField
        }: ${value} (tipo: ${typeof value})`
      );

      // Aplicar conversión de unidades si está configurado
      if (fieldMapping.unitConversion && fieldMapping.unitConversion.enabled) {
        logger.debug(
          `Aplicando conversión de unidades para ${fieldMapping.targetField}`
        );
        value = this.applyUnitConversion(sourceData, fieldMapping, value);
      }

      // Aplicar eliminación de prefijo si está configurado
      if (
        fieldMapping.removePrefix &&
        typeof value === "string" &&
        value.startsWith(fieldMapping.removePrefix)
      ) {
        value = value.substring(fieldMapping.removePrefix.length);
        logger.debug(
          `Prefijo removido de ${fieldMapping.targetField}: ${value}`
        );
      }

      // Aplicar mapeo de valores si existe
      if (
        value !== null &&
        value !== undefined &&
        fieldMapping.valueMappings?.length > 0
      ) {
        const valueMap = fieldMapping.valueMappings.find(
          (vm) => vm.sourceValue === value
        );
        if (valueMap) {
          value = valueMap.targetValue;
          logger.debug(
            `Valor mapeado para ${fieldMapping.targetField}: ${value}`
          );
        }
      }
    }

    // PRIORIDAD 5: Usar valor por defecto si no hay valor
    if (
      (value === null || value === undefined) &&
      fieldMapping.defaultValue !== undefined
    ) {
      value =
        fieldMapping.defaultValue === "NULL" ? null : fieldMapping.defaultValue;
      logger.debug(
        `Valor por defecto para ${fieldMapping.targetField}: ${value}`
      );
    }

    // PRIORIDAD 6: Truncar valor si excede la longitud máxima
    if (typeof value === "string" && value.length > 0) {
      const maxLength = await this.getColumnMaxLength(
        targetConnection,
        tableConfig.targetTable,
        fieldMapping.targetField,
        columnLengthCache
      );

      if (maxLength > 0 && value.length > maxLength) {
        const originalValue = value;
        value = value.substring(0, maxLength);
        logger.warn(
          `Valor truncado para ${fieldMapping.targetField}: "${originalValue}" -> "${value}" (max: ${maxLength})`
        );
      }
    }

    logger.debug(
      `Valor final para ${
        fieldMapping.targetField
      }: ${value} (tipo: ${typeof value})`
    );

    return { value, isDirectSql: false };
  }

  /**
   * Ejecuta la inserción en la tabla destino
   * @private
   */
  async executeInsert(
    targetTable,
    targetFields,
    targetValues,
    targetData,
    directSqlFields,
    targetConnection
  ) {
    const insertFieldsList = targetFields;
    const insertValuesList = targetValues.map((value, index) => {
      const field = targetFields[index];
      return directSqlFields.has(field) ? targetValues[index] : `@${field}`;
    });

    const insertQuery = `
      INSERT INTO ${targetTable} (${insertFieldsList.join(", ")})
      VALUES (${insertValuesList.join(", ")})
    `;

    logger.debug(`Ejecutando inserción en tabla: ${insertQuery}`);

    // Filtrar los datos para que solo contengan los campos que realmente son parámetros
    const filteredTargetData = {};
    for (const field in targetData) {
      if (!directSqlFields.has(field)) {
        filteredTargetData[field] = targetData[field];
      }
    }

    logger.info(`📊 DATOS FINALES PARA INSERCIÓN en ${targetTable}:`);
    logger.info(`Campos: ${targetFields.join(", ")}`);
    logger.info(`Datos: ${JSON.stringify(filteredTargetData, null, 2)}`);

    await SqlService.query(targetConnection, insertQuery, filteredTargetData);
  }

  /**
   * Determina si un campo es un campo de consecutivo
   * @private
   */
  isConsecutiveField(fieldMapping, mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return false;
    }

    // Verificar si es el campo general
    if (fieldMapping.targetField === consecutiveConfig.fieldName) {
      return true;
    }

    // Verificar si es un campo específico de tabla
    if (
      consecutiveConfig.applyToTables &&
      consecutiveConfig.applyToTables.length > 0
    ) {
      return consecutiveConfig.applyToTables.some(
        (tableMapping) => tableMapping.fieldName === fieldMapping.targetField
      );
    }

    return false;
  }

  /**
   * Obtiene el valor del consecutivo para un campo
   * @private
   */
  getConsecutiveValue(fieldMapping, currentConsecutive, isDetailTable) {
    const consecutiveConfig = fieldMapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return currentConsecutive.formatted;
    }

    // Para tablas de detalle, usar el campo específico si está configurado
    if (isDetailTable && consecutiveConfig.detailFieldName) {
      return currentConsecutive.formatted;
    }

    return currentConsecutive.formatted;
  }

  /**
   * Verifica si una tabla tiene campos de lookup
   * @private
   */
  hasLookupFields(tableConfig) {
    return (
      tableConfig.fieldMappings &&
      tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)
    );
  }

  /**
   * Ejecuta lookup en la base de datos destino
   * @private
   */
  async executeLookupInTarget(tableConfig, sourceData, targetConnection) {
    const lookupResults = {};
    const failedLookups = [];

    try {
      logger.info(
        `Ejecutando lookup en destino para tabla ${tableConfig.name}...`
      );

      // Obtener solo los campos que requieren lookup
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        logger.debug("No hay campos de lookup configurados");
        return { results: {}, success: true, failedFields: [] };
      }

      logger.info(
        `Ejecutando lookup para ${lookupFields.length} campos: ${lookupFields
          .map((f) => f.targetField)
          .join(", ")}`
      );

      // Procesar cada campo de lookup
      for (const fieldMapping of lookupFields) {
        try {
          const lookupQuery = fieldMapping.lookupQuery;
          logger.debug(
            `Procesando lookup para campo ${fieldMapping.targetField}: ${lookupQuery}`
          );

          // Preparar parámetros para la consulta
          const params = {};
          const missingParams = [];

          // Registrar todos los parámetros que se esperan en la consulta
          const expectedParams = [];
          const paramRegex = /@(\w+)/g;
          let match;
          while ((match = paramRegex.exec(lookupQuery)) !== null) {
            expectedParams.push(match[1]);
          }

          logger.debug(
            `Parámetros esperados en la consulta: ${expectedParams.join(", ")}`
          );

          // Si hay parámetros definidos, extraerlos de los datos de origen
          if (
            fieldMapping.lookupParams &&
            fieldMapping.lookupParams.length > 0
          ) {
            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                logger.warn(
                  `Parámetro mal configurado para ${fieldMapping.targetField}. Debe tener sourceField y paramName.`
                );
                continue;
              }

              // Obtener el valor del campo origen
              let paramValue = sourceData[param.sourceField];

              // Registrar si el valor está presente
              logger.debug(
                `Parámetro ${param.paramName} (desde campo ${
                  param.sourceField
                }): ${
                  paramValue !== undefined && paramValue !== null
                    ? paramValue
                    : "NULL/UNDEFINED"
                }`
              );

              if (paramValue === undefined || paramValue === null) {
                missingParams.push(param.paramName);
              } else {
                params[param.paramName] = paramValue;
              }
            }
          }

          // Verificar si faltan parámetros críticos
          if (missingParams.length > 0) {
            const errorMsg = `Faltan parámetros requeridos para ${
              fieldMapping.targetField
            }: ${missingParams.join(", ")}`;
            logger.warn(errorMsg);

            if (fieldMapping.failIfNotFound) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                isCritical: true,
              });
              continue;
            } else {
              // Usar valor por defecto si no es crítico
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto para ${fieldMapping.targetField}: ${
                  lookupResults[fieldMapping.targetField]
                }`
              );
              continue;
            }
          }

          // Ejecutar la consulta de lookup
          logger.debug(
            `Ejecutando consulta de lookup con parámetros: ${JSON.stringify(
              params
            )}`
          );

          const lookupResult = await SqlService.query(
            targetConnection,
            lookupQuery,
            params
          );

          // Procesar el resultado
          if (lookupResult.recordset && lookupResult.recordset.length > 0) {
            // Tomar el primer registro
            const firstRecord = lookupResult.recordset[0];
            const columnNames = Object.keys(firstRecord);

            // Si la consulta devuelve una sola columna, usarla como valor
            if (columnNames.length === 1) {
              lookupResults[fieldMapping.targetField] =
                firstRecord[columnNames[0]];
            } else {
              // Si devuelve múltiples columnas, buscar una que coincida con el nombre del campo
              if (firstRecord[fieldMapping.targetField] !== undefined) {
                lookupResults[fieldMapping.targetField] =
                  firstRecord[fieldMapping.targetField];
              } else {
                // Usar la primera columna como fallback
                lookupResults[fieldMapping.targetField] =
                  firstRecord[columnNames[0]];
              }
            }

            logger.info(
              `✅ Lookup exitoso para ${fieldMapping.targetField}: ${
                lookupResults[fieldMapping.targetField]
              }`
            );
          } else {
            // No se encontraron resultados
            const errorMsg = `No se encontraron resultados en lookup para ${fieldMapping.targetField}`;
            logger.warn(errorMsg);

            if (fieldMapping.failIfNotFound) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                isCritical: true,
              });
            } else {
              // Usar valor por defecto
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto para ${fieldMapping.targetField}: ${
                  lookupResults[fieldMapping.targetField]
                }`
              );
            }
          }
        } catch (fieldError) {
          const errorMsg = `Error en lookup para ${fieldMapping.targetField}: ${fieldError.message}`;
          logger.error(errorMsg, fieldError);

          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
              isCritical: true,
            });
          } else {
            // Usar valor por defecto en caso de error
            lookupResults[fieldMapping.targetField] =
              fieldMapping.defaultValue || null;
            logger.debug(
              `Usando valor por defecto por error en ${
                fieldMapping.targetField
              }: ${lookupResults[fieldMapping.targetField]}`
            );
          }
        }
      }

      // Verificar si hay fallos críticos
      const criticalFailures = failedLookups.filter((f) => f.isCritical);
      if (criticalFailures.length > 0) {
        logger.error(
          `Fallos críticos en lookup: ${criticalFailures.length} campos`
        );
        return {
          results: {},
          success: false,
          failedFields: criticalFailures,
        };
      }

      logger.info(
        `Lookup en destino completado exitosamente. Obtenidos ${
          Object.keys(lookupResults).length
        } valores.`
      );

      return {
        results: lookupResults,
        success: true,
        failedFields: failedLookups, // Incluir fallos no críticos para información
      };
    } catch (error) {
      logger.error(
        `Error general al ejecutar lookup en destino: ${error.message}`,
        {
          error,
          stack: error.stack,
        }
      );

      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Aplica conversión de unidades a un valor específico
   * @private
   */
  applyUnitConversion(sourceData, fieldMapping, originalValue) {
    try {
      console.log(`🐛 DEBUG applyUnitConversion llamado:`);
      console.log(`   Campo: ${fieldMapping.targetField}`);
      console.log(`   Valor original: ${originalValue}`);
      console.log(
        `   Configuración enabled: ${fieldMapping.unitConversion?.enabled}`
      );
      console.log(`   sourceData keys: ${Object.keys(sourceData).join(", ")}`);

      // Log detallado de TODOS los campos disponibles con sus valores
      console.log(`🔍 DATOS COMPLETOS DISPONIBLES:`);
      Object.keys(sourceData).forEach((key) => {
        console.log(`   ${key}: ${sourceData[key]}`);
      });

      logger.debug(
        `🔧 Aplicando conversión de unidades para campo ${fieldMapping.targetField}`
      );

      const unitConfig = fieldMapping.unitConversion;
      if (!unitConfig || !unitConfig.enabled) {
        logger.debug(
          `Conversión de unidades no habilitada para ${fieldMapping.targetField}`
        );
        return originalValue;
      }

      // Validar que el valor original sea numérico
      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(
          `Valor no numérico para conversión de unidades en ${fieldMapping.targetField}: ${originalValue}`
        );
        return originalValue;
      }

      // Obtener el factor de conversión
      let conversionFactor = 1;

      if (unitConfig.conversionFactorField) {
        const factorValue = sourceData[unitConfig.conversionFactorField];
        console.log(
          `🔧 Factor de conversión desde campo ${unitConfig.conversionFactorField}: ${factorValue}`
        );

        if (factorValue !== undefined && factorValue !== null) {
          conversionFactor = parseFloat(factorValue);
          if (isNaN(conversionFactor)) {
            logger.warn(
              `Factor de conversión no numérico en ${unitConfig.conversionFactorField}: ${factorValue}`
            );
            conversionFactor = 1;
          }
        }
      }

      // Verificar unidad de medida si está configurada
      if (unitConfig.unitMeasureField) {
        const unitMeasure = sourceData[unitConfig.unitMeasureField];
        console.log(
          `🔧 Unidad de medida desde campo ${unitConfig.unitMeasureField}: ${unitMeasure}`
        );

        // Solo aplicar conversión si la unidad coincide con la unidad origen
        if (unitConfig.fromUnit && unitMeasure !== unitConfig.fromUnit) {
          logger.debug(
            `Unidad ${unitMeasure} no coincide con unidad origen ${unitConfig.fromUnit}, sin conversión`
          );
          return originalValue;
        }
      }

      // Aplicar la conversión
      let convertedValue;
      if (unitConfig.operation === "divide") {
        convertedValue =
          conversionFactor !== 0
            ? numericValue / conversionFactor
            : numericValue;
      } else {
        // Por defecto multiplicar
        convertedValue = numericValue * conversionFactor;
      }

      logger.info(
        `🔧 Conversión aplicada para ${
          fieldMapping.targetField
        }: ${originalValue} ${
          unitConfig.operation === "divide" ? "÷" : "×"
        } ${conversionFactor} = ${convertedValue}`
      );

      return convertedValue;
    } catch (error) {
      logger.error(
        `Error al aplicar conversión de unidades para ${fieldMapping.targetField}: ${error.message}`
      );
      return originalValue;
    }
  }

  /**
   * Obtiene la longitud máxima de una columna
   * @private
   */
  async getColumnMaxLength(connection, tableName, columnName, cache = null) {
    // Si se proporciona un cache, verificar si ya tenemos la información
    if (cache && cache instanceof Map) {
      const cacheKey = `${tableName}:${columnName}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }
    }

    try {
      // Extraer nombre de tabla sin esquema
      const tableNameOnly = tableName.replace(/^.*\.|\[|\]/g, "");

      // Consultar metadata de la columna
      const query = `
        SELECT CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tableNameOnly}'
        AND COLUMN_NAME = '${columnName}'
      `;

      const result = await SqlService.query(connection, query);

      let maxLength = 0;
      if (result.recordset && result.recordset.length > 0) {
        maxLength = result.recordset[0].CHARACTER_MAXIMUM_LENGTH || 0;
      }

      // Guardar en cache si está disponible
      if (cache && cache instanceof Map) {
        const cacheKey = `${tableName}:${columnName}`;
        cache.set(cacheKey, maxLength);
      }

      return maxLength;
    } catch (error) {
      logger.warn(
        `Error al obtener longitud máxima para ${columnName}: ${error.message}`
      );
      return 0; // En caso de error, retornar 0 (no truncar)
    }
  }

  /**
   * Genera un consecutivo para el documento
   * @private
   */
  async generateConsecutive(
    mapping,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null
  ) {
    try {
      if (useCentralizedConsecutives && centralizedConsecutiveId) {
        // Usar consecutivo centralizado
        logger.info(
          `Generando consecutivo centralizado: ${centralizedConsecutiveId}`
        );
        return await ConsecutiveService.generateConsecutive(
          centralizedConsecutiveId
        );
      } else {
        // Usar consecutivo local del mapping
        logger.info("Generando consecutivo local del mapping");
        return await this.generateLocalConsecutive(mapping);
      }
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Genera un consecutivo local
   * @private
   */
  async generateLocalConsecutive(mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return null;
    }

    // Incrementar el último valor
    const nextValue = (consecutiveConfig.lastValue || 0) + 1;

    // Formatear el consecutivo
    let formatted = nextValue.toString();

    if (consecutiveConfig.pattern) {
      // Usar patrón personalizado
      formatted = consecutiveConfig.pattern
        .replace(/{PREFIX}/g, consecutiveConfig.prefix || "")
        .replace(/{VALUE:(\d+)}/g, (match, digits) => {
          return nextValue.toString().padStart(parseInt(digits), "0");
        })
        .replace(/{VALUE}/g, nextValue.toString())
        .replace(/{YEAR}/g, new Date().getFullYear().toString())
        .replace(
          /{MONTH}/g,
          (new Date().getMonth() + 1).toString().padStart(2, "0")
        )
        .replace(/{DAY}/g, new Date().getDate().toString().padStart(2, "0"));
    } else {
      // Formato simple
      formatted = (consecutiveConfig.prefix || "") + nextValue;
    }

    // Actualizar el último valor en el mapping
    await TransferMapping.findByIdAndUpdate(mapping._id, {
      "consecutiveConfig.lastValue": nextValue,
    });

    return {
      value: nextValue,
      formatted: formatted,
    };
  }

  /**
   * Procesa dependencias de foreign key
   * @private
   */
  async processForeignKeyDependencies(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    if (
      !mapping.foreignKeyDependencies ||
      mapping.foreignKeyDependencies.length === 0
    ) {
      return;
    }

    // Ordenar dependencias por orden de ejecución
    const orderedDependencies = mapping.foreignKeyDependencies.sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    for (const dependency of orderedDependencies) {
      try {
        logger.info(`Procesando dependencia FK: ${dependency.fieldName}`);

        // Obtener el valor del campo que causa la dependencia
        const fieldValue = sourceData[dependency.fieldName];
        if (!fieldValue) {
          logger.warn(
            `Campo ${dependency.fieldName} no tiene valor, saltando dependencia`
          );
          continue;
        }

        // Buscar el campo clave en la configuración
        const keyField = dependency.dependentFields.find((f) => f.isKey);
        if (!keyField) {
          logger.warn(
            `No se encontró campo clave para dependencia ${dependency.fieldName}`
          );
          continue;
        }

        // Verificar si el registro ya existe
        const checkQuery = `SELECT COUNT(*) as count FROM ${dependency.dependentTable} WHERE ${keyField.targetField} = @keyValue`;
        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          { keyValue: fieldValue }
        );
        const exists = checkResult.recordset[0].count > 0;

        if (exists) {
          logger.info(
            `Registro ya existe en ${dependency.dependentTable} para valor ${fieldValue}`
          );
          continue;
        }

        if (dependency.validateOnly) {
          throw new Error(
            `Registro requerido no existe en ${dependency.dependentTable} para valor ${fieldValue}`
          );
        }

        if (dependency.insertIfNotExists) {
          logger.info(
            `Insertando registro en ${dependency.dependentTable} para valor ${fieldValue}`
          );

          // Preparar datos para inserción
          const insertData = {};
          const insertFields = [];
          const insertValues = [];

          for (const field of dependency.dependentFields) {
            let value;

            if (field.sourceField) {
              value = sourceData[field.sourceField];
            } else if (field.defaultValue !== undefined) {
              value = field.defaultValue;
            } else if (field.isKey) {
              value = fieldValue;
            }

            if (value !== undefined) {
              insertData[field.targetField] = value;
              insertFields.push(field.targetField);
              insertValues.push(`@${field.targetField}`);
            }
          }

          if (insertFields.length > 0) {
            const insertQuery = `INSERT INTO ${
              dependency.dependentTable
            } (${insertFields.join(", ")}) VALUES (${insertValues.join(", ")})`;
            await SqlService.query(targetConnection, insertQuery, insertData);
            logger.info(
              `Registro insertado exitosamente en ${dependency.dependentTable}`
            );
          }
        }
      } catch (depError) {
        logger.error(
          `Error en dependencia ${dependency.fieldName}: ${depError.message}`
        );
        throw new Error(
          `Error en dependencia FK ${dependency.fieldName}: ${depError.message}`
        );
      }
    }
  }

  /**
   * Determina el tipo de documento basado en las reglas
   * @private
   */
  determineDocumentType(documentTypeRules, sourceData) {
    if (!documentTypeRules || documentTypeRules.length === 0) {
      return "unknown";
    }

    for (const rule of documentTypeRules) {
      if (
        rule.sourceField &&
        rule.sourceValues &&
        rule.sourceValues.length > 0
      ) {
        const fieldValue = sourceData[rule.sourceField];
        if (rule.sourceValues.includes(fieldValue)) {
          return rule.name;
        }
      }
    }

    return "unknown";
  }

  /**
   * Maneja errores de procesamiento
   * @private
   */
  handleProcessingError(error, documentId, currentConsecutive, mapping) {
    logger.error(`Error procesando documento ${documentId}: ${error.message}`);

    // Si se generó un consecutivo, podríamos querer revertirlo
    if (currentConsecutive && mapping.consecutiveConfig?.updateAfterTransfer) {
      logger.warn(
        `Documento ${documentId} falló pero consecutivo ${currentConsecutive.formatted} ya fue generado`
      );
    }

    return {
      success: false,
      message: error.message,
      error: error.stack,
      documentType: "unknown",
      consecutiveUsed: currentConsecutive ? currentConsecutive.formatted : null,
      consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
    };
  }

  /**
   * Ordena las tablas según sus dependencias
   */
  getTablesExecutionOrder(tableConfigs) {
    // Separar tablas principales y de detalle
    const mainTables = tableConfigs.filter((tc) => !tc.isDetailTable);
    const detailTables = tableConfigs.filter((tc) => tc.isDetailTable);

    // Ordenar tablas principales por executionOrder
    mainTables.sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    // Para cada tabla principal, agregar sus detalles después
    const orderedTables = [];

    for (const mainTable of mainTables) {
      orderedTables.push(mainTable);

      // Agregar tablas de detalle relacionadas
      const relatedDetails = detailTables
        .filter((dt) => dt.parentTableRef === mainTable.name)
        .sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));

      orderedTables.push(...relatedDetails);
    }

    // Agregar detalles huérfanos al final
    const orphanDetails = detailTables.filter(
      (dt) => !mainTables.some((mt) => mt.name === dt.parentTableRef)
    );
    orderedTables.push(...orphanDetails);

    return orderedTables;
  }

  /**
   * Marca documentos como procesados según la estrategia configurada
   * @param {Array|string} documentIds - ID(s) de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a la base de datos
   * @param {boolean} shouldMark - true para marcar, false para desmarcar
   * @returns {Promise<Object>} - Resultado del marcado
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    // Normalizar documentIds a array
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    logger.info(
      `${shouldMark ? "Marcando" : "Desmarcando"} ${
        docArray.length
      } documento(s) como procesado(s)`
    );

    const strategy = mapping.markProcessedStrategy || "individual";
    const config = mapping.markProcessedConfig || {};

    try {
      switch (strategy) {
        case "individual":
          return await this.markDocumentsIndividually(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        case "batch":
          return await this.markDocumentsBatch(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        case "flag":
          return await this.markDocumentsWithFlag(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        default:
          throw new Error(`Estrategia de marcado no soportada: ${strategy}`);
      }
    } catch (error) {
      logger.error(
        `Error al ${shouldMark ? "marcar" : "desmarcar"} documentos: ${
          error.message
        }`
      );
      throw error;
    }
  }

  /**
   * Marca documentos individualmente
   * @private
   */
  async markDocumentsIndividually(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const processedField = config.processedField || "PROCESSED";

    for (const documentId of documentIds) {
      try {
        let query;
        let params = { documentId };

        if (shouldMark) {
          // Marcar como procesado
          let setClause = `${processedField} = 1`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        } else {
          // Desmarcar
          let setClause = `${processedField} = 0`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        }

        await SqlService.query(connection, query, params);
        results.success++;

        logger.debug(
          `Documento ${documentId} ${
            shouldMark ? "marcado" : "desmarcado"
          } exitosamente`
        );
      } catch (error) {
        results.failed++;
        results.errors.push({
          documentId,
          error: error.message,
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } documento ${documentId}: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Marca documentos en lotes
   * @private
   */
  async markDocumentsBatch(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const processedField = config.processedField || "PROCESSED";
    const batchSize = config.batchSize || 100;

    // Procesar en lotes
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);

      try {
        const placeholders = batch.map((_, index) => `@doc${index}`).join(", ");
        const params = {};

        batch.forEach((docId, index) => {
          params[`doc${index}`] = docId;
        });

        let query;
        if (shouldMark) {
          let setClause = `${processedField} = 1`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        } else {
          let setClause = `${processedField} = 0`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        }

        await SqlService.query(connection, query, params);
        results.success += batch.length;

        logger.debug(
          `Lote de ${batch.length} documentos ${
            shouldMark ? "marcados" : "desmarcados"
          } exitosamente`
        );
      } catch (error) {
        results.failed += batch.length;
        batch.forEach((docId) => {
          results.errors.push({
            documentId: docId,
            error: error.message,
          });
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } lote de documentos: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Marca documentos con flag
   * @private
   */
  async markDocumentsWithFlag(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const flagField = config.flagField || "TRANSFER_FLAG";
    const flagValue = config.flagValue || "PROCESSED";

    for (const documentId of documentIds) {
      try {
        let query;
        let params = { documentId };

        if (shouldMark) {
          // Marcar con flag
          let setClause = `${flagField} = '${flagValue}'`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "FLAG_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        } else {
          // Desmarcar flag
          let setClause = `${flagField} = NULL`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "FLAG_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        }

        await SqlService.query(connection, query, params);
        results.success++;

        logger.debug(
          `Documento ${documentId} ${
            shouldMark ? "marcado" : "desmarcado"
          } con flag exitosamente`
        );
      } catch (error) {
        results.failed++;
        results.errors.push({
          documentId,
          error: error.message,
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } documento ${documentId} con flag: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Obtiene los documentos según los filtros especificados
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Documentos encontrados
   */
  async getDocuments(mapping, filters, connection) {
    try {
      // Listar tablas disponibles en la base de datos para depuración
      try {
        logger.info("Listando tablas disponibles en la base de datos...");
        const listTablesQuery = `
          SELECT TOP 50 TABLE_SCHEMA, TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          ORDER BY TABLE_SCHEMA, TABLE_NAME
        `;

        const tablesResult = await SqlService.query(
          connection,
          listTablesQuery
        );

        if (tablesResult.recordset && tablesResult.recordset.length > 0) {
          const tables = tablesResult.recordset;
          logger.info(
            `Tablas disponibles: ${tables
              .map((t) => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
              .join(", ")}`
          );
        } else {
          logger.warn("No se encontraron tablas en la base de datos");
        }
      } catch (listError) {
        logger.warn(`Error al listar tablas: ${listError.message}`);
      }

      // Validar que el mapeo sea válido
      if (!mapping) {
        throw new Error("La configuración de mapeo es nula o indefinida");
      }

      if (
        !mapping.tableConfigs ||
        !Array.isArray(mapping.tableConfigs) ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error(
          "La configuración de mapeo no tiene tablas configuradas"
        );
      }

      // Determinar tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      if (!mainTable.sourceTable) {
        throw new Error(
          "La tabla principal no tiene definido el campo sourceTable"
        );
      }

      logger.info(
        `Obteniendo documentos de ${mainTable.sourceTable} en ${mapping.sourceServer}`
      );

      // Verificar si la tabla existe, manejando correctamente esquemas
      try {
        // Separar esquema y nombre de tabla
        let schema = "dbo"; // Esquema por defecto
        let tableName = mainTable.sourceTable;

        if (tableName.includes(".")) {
          const parts = tableName.split(".");
          if (parts.length === 2) {
            schema = parts[0];
            tableName = parts[1];
          }
        }

        // Limpiar nombres de corchetes si existen
        schema = schema.replace(/\[|\]/g, "");
        tableName = tableName.replace(/\[|\]/g, "");

        logger.info(`Verificando tabla ${schema}.${tableName}...`);

        // Verificar si la tabla existe
        const checkTableQuery = `
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = '${schema}'
          AND TABLE_NAME = '${tableName}'
        `;

        const tableCheckResult = await SqlService.query(
          connection,
          checkTableQuery
        );

        if (tableCheckResult.recordset[0].count === 0) {
          throw new Error(
            `La tabla ${schema}.${tableName} no existe en la base de datos`
          );
        }

        logger.info(`Tabla ${schema}.${tableName} encontrada correctamente`);

        // Obtener columnas de la tabla
        const columnsQuery = `
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = '${schema}'
          AND TABLE_NAME = '${tableName}'
          ORDER BY ORDINAL_POSITION
        `;

        const columnsResult = await SqlService.query(connection, columnsQuery);

        if (!columnsResult.recordset || columnsResult.recordset.length === 0) {
          throw new Error(
            `No se pudieron obtener las columnas de la tabla ${schema}.${tableName}`
          );
        }

        const availableColumns = columnsResult.recordset.map(
          (c) => c.COLUMN_NAME
        );
        logger.info(
          `Columnas disponibles en ${schema}.${tableName}: ${availableColumns.join(
            ", "
          )}`
        );

        // Guardar el nombre completo de la tabla con esquema para usarlo en la consulta
        const fullTableName = `${schema}.${tableName}`;

        // Construir campos a seleccionar basados en la configuración, validando que existan
        let selectFields = [];

        if (mainTable.fieldMappings && mainTable.fieldMappings.length > 0) {
          for (const mapping of mainTable.fieldMappings) {
            if (mapping.sourceField) {
              // Verificar si la columna existe
              if (availableColumns.includes(mapping.sourceField)) {
                selectFields.push(mapping.sourceField);
              } else {
                logger.warn(
                  `Columna ${mapping.sourceField} no existe en ${fullTableName} y será omitida`
                );
              }
            }
          }
        }

        // Si no hay campos válidos, seleccionar todas las columnas disponibles
        if (selectFields.length === 0) {
          logger.warn(
            `No se encontraron campos válidos para seleccionar, se usarán todas las columnas`
          );
          selectFields = availableColumns;
        }

        const selectFieldsStr = selectFields.join(", ");
        logger.debug(`Campos a seleccionar: ${selectFieldsStr}`);

        // Construir consulta basada en filtros, usando el nombre completo de la tabla
        let query = `
          SELECT ${selectFieldsStr}
          FROM ${fullTableName}
          WHERE 1=1
        `;

        const params = {};

        // Verificar si los campos utilizados en filtros existen
        let dateFieldExists = false;
        let dateField = filters.dateField || "FEC_PED";
        if (availableColumns.includes(dateField)) {
          dateFieldExists = true;
        } else {
          logger.warn(
            `Campo de fecha ${dateField} no existe en ${fullTableName}. Campos disponibles: ${availableColumns.join(
              ", "
            )}`
          );
          // Buscar campos de fecha alternativos
          const alternativeDateFields = [
            "FEC_PED",
            "FECHA_PEDIDO",
            "FECHA",
            "DATE_CREATED",
            "CREATED_DATE",
            "FEC_CREACION",
          ];
          for (const altField of alternativeDateFields) {
            if (availableColumns.includes(altField)) {
              dateField = altField;
              dateFieldExists = true;
              logger.info(`Usando campo de fecha alternativo: ${altField}`);
              break;
            }
          }
        }

        // Aplicar filtros solo si los campos existen
        if (dateFieldExists) {
          if (filters.dateFrom) {
            query += ` AND ${dateField} >= @dateFrom`;
            params.dateFrom = filters.dateFrom;
          }

          if (filters.dateTo) {
            query += ` AND ${dateField} <= @dateTo`;
            params.dateTo = filters.dateTo;
          }
        } else {
          logger.warn(
            `No se encontró campo de fecha válido. Consulta sin filtro de fecha.`
          );
        }

        // Filtros adicionales
        if (filters.status && availableColumns.includes("STATUS")) {
          query += ` AND STATUS = @status`;
          params.status = filters.status;
        }

        if (filters.processed !== undefined) {
          const processedField = filters.processedField || "PROCESSED";
          if (availableColumns.includes(processedField)) {
            query += ` AND ${processedField} = @processed`;
            params.processed = filters.processed;
          }
        }

        // Aplicar filtro personalizado si existe
        if (mainTable.filterCondition) {
          query += ` AND ${mainTable.filterCondition}`;
          logger.debug(
            `Aplicando filtro personalizado: ${mainTable.filterCondition}`
          );
        }

        // Ordenamiento
        const primaryKey = mainTable.primaryKey || "NUM_PED";
        if (availableColumns.includes(primaryKey)) {
          query += ` ORDER BY ${primaryKey} DESC`;
        }

        // Limitar resultados
        const limit = filters.limit || 100;
        query = `SELECT TOP ${limit} * FROM (${query}) AS limited_results`;

        logger.info(`Ejecutando consulta: ${query}`);
        logger.debug(`Parámetros: ${JSON.stringify(params)}`);

        const result = await SqlService.query(connection, query, params);

        logger.info(
          `Consulta ejecutada exitosamente. Documentos encontrados: ${result.recordset.length}`
        );

        return result.recordset;
      } catch (tableError) {
        logger.error(
          `Error al verificar/consultar tabla ${mainTable.sourceTable}: ${tableError.message}`
        );
        throw tableError;
      }
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea una nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} - Configuración creada
   */
  async createMapping(mappingData) {
    try {
      // Crear tarea relacionada si no existe
      if (!mappingData.taskId) {
        const task = new TransferTask({
          name: `Mapeo: ${mappingData.name}`,
          description: `Tarea automática para mapeo ${mappingData.name}`,
          type: "mapping",
          status: "active",
          mappingId: null,
          schedule: {
            enabled: false,
            cron: "0 0 * * *",
            timezone: "America/Santo_Domingo",
          },
          active: true,
        });

        const savedTask = await task.save();
        logger.info(
          `Tarea creada automáticamente para mapeo: ${savedTask._id}`
        );

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = savedTask._id;
      }

      const mapping = new TransferMapping(mappingData);
      const savedMapping = await mapping.save();

      // Actualizar la tarea con el ID del mapeo
      if (mappingData.taskId) {
        await TransferTask.findByIdAndUpdate(mappingData.taskId, {
          mappingId: savedMapping._id,
        });
      }

      return savedMapping;
    } catch (error) {
      logger.error(`Error al crear configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza una configuración de mapeo existente
   * @param {string} mappingId - ID de la configuración
   * @param {Object} mappingData - Datos actualizados
   * @returns {Promise<Object>} - Configuración actualizada
   */
  async updateMapping(mappingId, mappingData) {
    try {
      // Crear tarea relacionada si no existe
      if (!mappingData.taskId) {
        const task = new TransferTask({
          name: `Mapeo: ${mappingData.name}`,
          description: `Tarea automática para mapeo ${mappingData.name}`,
          type: "mapping",
          status: "active",
          mappingId: mappingId,
          schedule: {
            enabled: false,
            cron: "0 0 * * *",
            timezone: "America/Santo_Domingo",
          },
          active: true,
        });

        const savedTask = await task.save();
        logger.info(
          `Tarea creada automáticamente para mapeo: ${savedTask._id}`
        );

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = savedTask._id;
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        {
          new: true,
        }
      );

      return mapping;
    } catch (error) {
      logger.error(
        `Error al actualizar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  async getMappings() {
    try {
      return await TransferMapping.find().sort({ name: 1 });
    } catch (error) {
      logger.error(
        `Error al obtener configuraciones de mapeo: ${error.message}`
      );
      throw error;
    }
  }
  /**
   * Obtiene una configuración de mapeo por ID
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} - Configuración de mapeo
   */
  async getMappingById(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      return mapping;
    } catch (error) {
      logger.error(`Error al obtener configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Elimina una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  async deleteMapping(mappingId) {
    try {
      const result = await TransferMapping.findByIdAndDelete(mappingId);
      return !!result;
    } catch (error) {
      logger.error(
        `Error al eliminar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de un mapeo específico
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Estadísticas del mapeo
   */
  async getMappingStats(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Obtener ejecuciones recientes
      const executions = await TaskExecution.find({ mapping: mappingId })
        .sort({ startTime: -1 })
        .limit(10);

      // Calcular estadísticas
      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter(
        (e) => e.status === "completed"
      ).length;
      const failedExecutions = executions.filter(
        (e) => e.status === "failed"
      ).length;
      const totalProcessed = executions.reduce(
        (sum, e) => sum + (e.processedDocuments || 0),
        0
      );

      const lastExecution = executions[0];
      const avgExecutionTime =
        totalExecutions > 0
          ? executions.reduce((sum, e) => sum + (e.executionTime || 0), 0) /
            totalExecutions
          : 0;

      return {
        mappingId,
        mappingName: mapping.name,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        totalProcessed,
        successRate:
          totalExecutions > 0
            ? (successfulExecutions / totalExecutions) * 100
            : 0,
        avgExecutionTime: Math.round(avgExecutionTime),
        lastExecution: lastExecution
          ? {
              date: lastExecution.startTime,
              status: lastExecution.status,
              processedDocuments: lastExecution.processedDocuments || 0,
              executionTime: lastExecution.executionTime || 0,
            }
          : null,
      };
    } catch (error) {
      logger.error(`Error al obtener estadísticas del mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Valida una configuración de mapeo
   * @param {Object} mappingData - Datos del mapeo a validar
   * @returns {Promise<Object>} - Resultado de la validación
   */
  async validateMapping(mappingData) {
    const errors = [];
    const warnings = [];

    try {
      // Validaciones básicas
      if (!mappingData.name || mappingData.name.trim() === "") {
        errors.push("El nombre del mapeo es requerido");
      }

      if (!mappingData.sourceServer) {
        errors.push("El servidor origen es requerido");
      }

      if (!mappingData.targetServer) {
        errors.push("El servidor destino es requerido");
      }

      if (!mappingData.tableConfigs || mappingData.tableConfigs.length === 0) {
        errors.push("Se requiere al menos una configuración de tabla");
      }

      // Validar configuración de tablas
      if (mappingData.tableConfigs) {
        const mainTables = mappingData.tableConfigs.filter(
          (tc) => !tc.isDetailTable
        );
        const detailTables = mappingData.tableConfigs.filter(
          (tc) => tc.isDetailTable
        );

        if (mainTables.length === 0) {
          errors.push("Se requiere al menos una tabla principal");
        }

        // Validar cada tabla
        for (const tableConfig of mappingData.tableConfigs) {
          if (!tableConfig.name) {
            errors.push("Todas las tablas deben tener un nombre");
          }

          if (!tableConfig.sourceTable) {
            errors.push(
              `La tabla ${tableConfig.name} debe tener una tabla origen`
            );
          }

          if (!tableConfig.targetTable) {
            errors.push(
              `La tabla ${tableConfig.name} debe tener una tabla destino`
            );
          }

          if (
            !tableConfig.fieldMappings ||
            tableConfig.fieldMappings.length === 0
          ) {
            warnings.push(
              `La tabla ${tableConfig.name} no tiene campos mapeados`
            );
          }

          // Validar campos
          if (tableConfig.fieldMappings) {
            for (const fieldMapping of tableConfig.fieldMappings) {
              if (!fieldMapping.targetField) {
                errors.push(
                  `Campo sin nombre de destino en tabla ${tableConfig.name}`
                );
              }

              if (
                !fieldMapping.sourceField &&
                fieldMapping.defaultValue === undefined
              ) {
                warnings.push(
                  `Campo ${fieldMapping.targetField} no tiene origen ni valor por defecto`
                );
              }
            }
          }

          // Validar referencias de tablas de detalle
          if (tableConfig.isDetailTable && tableConfig.parentTableRef) {
            const parentExists = mainTables.some(
              (mt) => mt.name === tableConfig.parentTableRef
            );
            if (!parentExists) {
              errors.push(
                `La tabla de detalle ${tableConfig.name} referencia una tabla padre inexistente: ${tableConfig.parentTableRef}`
              );
            }
          }
        }
      }

      // Validar configuración de promociones si está habilitada
      if (mappingData.promotionConfig && mappingData.promotionConfig.enabled) {
        const promotionErrors = this.validatePromotionConfiguration(
          mappingData.promotionConfig
        );
        errors.push(...promotionErrors);
      }

      // Validar configuración de consecutivos si está habilitada
      if (
        mappingData.consecutiveConfig &&
        mappingData.consecutiveConfig.enabled
      ) {
        if (!mappingData.consecutiveConfig.fieldName) {
          errors.push(
            "Campo de consecutivo es requerido cuando está habilitado"
          );
        }
      }

      // Validar dependencias de foreign key
      if (mappingData.foreignKeyDependencies) {
        for (const dependency of mappingData.foreignKeyDependencies) {
          if (!dependency.fieldName) {
            errors.push(
              "Nombre de campo es requerido en dependencias de foreign key"
            );
          }

          if (!dependency.dependentTable) {
            errors.push(
              "Tabla dependiente es requerida en dependencias de foreign key"
            );
          }

          if (
            !dependency.dependentFields ||
            dependency.dependentFields.length === 0
          ) {
            errors.push(
              "Campos dependientes son requeridos en dependencias de foreign key"
            );
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error(`Error al validar configuración de mapeo: ${error.message}`);
      return {
        isValid: false,
        errors: [`Error interno de validación: ${error.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Valida la configuración de promociones
   * @private
   */
  validatePromotionConfiguration(promotionConfig) {
    const errors = [];

    if (!promotionConfig.detectFields) {
      errors.push("Campos de detección de promociones son requeridos");
    } else {
      const detectFields = promotionConfig.detectFields;

      if (!detectFields.bonusField) {
        errors.push("Campo de bonificación es requerido");
      }

      if (!detectFields.referenceField) {
        errors.push("Campo de referencia es requerido");
      }

      if (!detectFields.lineNumberField) {
        errors.push("Campo de número de línea es requerido");
      }

      if (!detectFields.articleField) {
        errors.push("Campo de artículo es requerido");
      }
    }

    if (!promotionConfig.targetFields) {
      errors.push("Campos destino de promociones son requeridos");
    } else {
      const targetFields = promotionConfig.targetFields;

      if (!targetFields.bonusLineRef) {
        errors.push("Campo de referencia de bonificación es requerido");
      }

      if (!targetFields.orderedQuantity) {
        errors.push("Campo de cantidad pedida es requerido");
      }

      if (!targetFields.bonusQuantity) {
        errors.push("Campo de cantidad bonificación es requerido");
      }
    }

    // Validar reglas si existen
    if (promotionConfig.rules) {
      for (const rule of promotionConfig.rules) {
        if (!rule.name) {
          errors.push("Nombre de regla es requerido");
        }

        if (!rule.type) {
          errors.push("Tipo de regla es requerido");
        }

        const validTypes = [
          "FAMILY_DISCOUNT",
          "QUANTITY_BONUS",
          "SCALED_BONUS",
          "PRODUCT_BONUS",
          "INVOICE_DISCOUNT",
          "ONE_TIME_OFFER",
        ];
        if (rule.type && !validTypes.includes(rule.type)) {
          errors.push(`Tipo de regla inválido: ${rule.type}`);
        }
      }
    }

    return errors;
  }

  /**
   * Prueba la conexión a las bases de datos de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Resultado de la prueba
   */
  async testMappingConnections(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      const results = {
        sourceConnection: null,
        targetConnection: null,
        overall: false,
      };

      // Probar conexión origen
      try {
        const sourceConnResult = await ConnectionService.enhancedRobustConnect(
          mapping.sourceServer
        );
        if (sourceConnResult.success) {
          results.sourceConnection = {
            success: true,
            message: "Conexión exitosa",
            server: mapping.sourceServer,
          };
          // Liberar conexión
          await ConnectionService.releaseConnection(
            sourceConnResult.connection
          );
        } else {
          results.sourceConnection = {
            success: false,
            message: sourceConnResult.error?.message || "Error desconocido",
            server: mapping.sourceServer,
          };
        }
      } catch (sourceError) {
        results.sourceConnection = {
          success: false,
          message: sourceError.message,
          server: mapping.sourceServer,
        };
      }

      // Probar conexión destino
      try {
        const targetConnResult = await ConnectionService.enhancedRobustConnect(
          mapping.targetServer
        );
        if (targetConnResult.success) {
          results.targetConnection = {
            success: true,
            message: "Conexión exitosa",
            server: mapping.targetServer,
          };
          // Liberar conexión
          await ConnectionService.releaseConnection(
            targetConnResult.connection
          );
        } else {
          results.targetConnection = {
            success: false,
            message: targetConnResult.error?.message || "Error desconocido",
            server: mapping.targetServer,
          };
        }
      } catch (targetError) {
        results.targetConnection = {
          success: false,
          message: targetError.message,
          server: mapping.targetServer,
        };
      }

      // Resultado general
      results.overall =
        results.sourceConnection?.success && results.targetConnection?.success;

      return results;
    } catch (error) {
      logger.error(`Error al probar conexiones del mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene una vista previa de los datos que se procesarían
   * @param {string} mappingId - ID del mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {number} limit - Límite de registros (default: 5)
   * @returns {Promise<Object>} - Vista previa de los datos
   */
  async getDataPreview(mappingId, filters = {}, limit = 5) {
    let sourceConnection = null;

    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Establecer conexión origen
      const sourceConnResult = await ConnectionService.enhancedRobustConnect(
        mapping.sourceServer
      );
      if (!sourceConnResult.success) {
        throw new Error(
          `No se pudo conectar al servidor origen: ${sourceConnResult.error?.message}`
        );
      }
      sourceConnection = sourceConnResult.connection;

      // Obtener documentos con límite
      const previewFilters = { ...filters, limit };
      const documents = await this.getDocuments(
        mapping,
        previewFilters,
        sourceConnection
      );

      const preview = {
        mappingId,
        mappingName: mapping.name,
        sourceServer: mapping.sourceServer,
        targetServer: mapping.targetServer,
        documentsFound: documents.length,
        sampleDocuments: [],
        promotionConfig: mapping.promotionConfig || null,
      };

      // Procesar algunos documentos como muestra
      for (const document of documents.slice(
        0,
        Math.min(limit, documents.length)
      )) {
        const documentId =
          document[
            mapping.tableConfigs.find((tc) => !tc.isDetailTable)?.primaryKey ||
              "NUM_PED"
          ];

        try {
          // Obtener detalles si hay tablas de detalle
          const details = {};
          const detailTables = mapping.tableConfigs.filter(
            (tc) => tc.isDetailTable
          );

          for (const detailTable of detailTables) {
            const detailData = await this.getDetailDataWithPromotions(
              detailTable,
              mapping.tableConfigs.find((tc) => !tc.isDetailTable),
              documentId,
              sourceConnection,
              mapping
            );
            details[detailTable.name] = detailData;
          }

          preview.sampleDocuments.push({
            documentId,
            header: document,
            details,
          });
        } catch (detailError) {
          logger.warn(
            `Error al obtener detalles para documento ${documentId}: ${detailError.message}`
          );
          preview.sampleDocuments.push({
            documentId,
            header: document,
            details: {},
            error: detailError.message,
          });
        }
      }

      return preview;
    } catch (error) {
      logger.error(`Error al obtener vista previa: ${error.message}`);
      throw error;
    } finally {
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
    }
  }

  /**
   * Duplica una configuración de mapeo
   * @param {string} mappingId - ID del mapeo a duplicar
   * @param {string} newName - Nuevo nombre para el mapeo duplicado
   * @returns {Promise<Object>} - Nuevo mapeo creado
   */
  async duplicateMapping(mappingId, newName) {
    try {
      const originalMapping = await TransferMapping.findById(mappingId);
      if (!originalMapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Crear copia de los datos
      const duplicatedData = {
        name: newName,
        description: `Copia de ${originalMapping.name}`,
        sourceServer: originalMapping.sourceServer,
        targetServer: originalMapping.targetServer,
        tableConfigs: originalMapping.tableConfigs,
        documentTypeRules: originalMapping.documentTypeRules,
        foreignKeyDependencies: originalMapping.foreignKeyDependencies,
        consecutiveConfig: originalMapping.consecutiveConfig
          ? {
              ...originalMapping.consecutiveConfig.toObject(),
              enabled: false, // Deshabilitar consecutivos en la copia
              lastValue: 0, // Resetear contador
            }
          : undefined,
        promotionConfig: originalMapping.promotionConfig,
        markProcessedStrategy: originalMapping.markProcessedStrategy,
        markProcessedConfig: originalMapping.markProcessedConfig,
        active: false, // Crear como inactivo
      };

      // Crear nuevo mapeo
      const newMapping = await this.createMapping(duplicatedData);

      logger.info(`Mapeo duplicado: ${originalMapping.name} -> ${newName}`);
      return newMapping;
    } catch (error) {
      logger.error(`Error al duplicar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exporta una configuración de mapeo a JSON
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Configuración exportada
   */
  async exportMapping(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Crear objeto exportable (sin campos internos)
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        mapping: {
          name: mapping.name,
          description: mapping.description,
          sourceServer: mapping.sourceServer,
          targetServer: mapping.targetServer,
          tableConfigs: mapping.tableConfigs,
          documentTypeRules: mapping.documentTypeRules,
          foreignKeyDependencies: mapping.foreignKeyDependencies,
          consecutiveConfig: mapping.consecutiveConfig,
          promotionConfig: mapping.promotionConfig,
          markProcessedStrategy: mapping.markProcessedStrategy,
          markProcessedConfig: mapping.markProcessedConfig,
        },
      };

      logger.info(`Mapeo exportado: ${mapping.name}`);
      return exportData;
    } catch (error) {
      logger.error(`Error al exportar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Importa una configuración de mapeo desde JSON
   * @param {Object} importData - Datos importados
   * @param {string} newName - Nuevo nombre para el mapeo (opcional)
   * @returns {Promise<Object>} - Mapeo creado
   */
  async importMapping(importData, newName = null) {
    try {
      // Validar estructura de importación
      if (!importData.mapping) {
        throw new Error("Estructura de importación inválida");
      }

      const mappingData = importData.mapping;

      // Asignar nuevo nombre si se proporcionó
      if (newName) {
        mappingData.name = newName;
      }

      // Resetear campos que no deberían importarse
      delete mappingData._id;
      delete mappingData.taskId;
      delete mappingData.createdAt;
      delete mappingData.updatedAt;

      // Resetear consecutivos
      if (mappingData.consecutiveConfig) {
        mappingData.consecutiveConfig.enabled = false;
        mappingData.consecutiveConfig.lastValue = 0;
      }

      // Crear mapeo importado
      const newMapping = await this.createMapping(mappingData);

      logger.info(`Mapeo importado: ${mappingData.name}`);
      return newMapping;
    } catch (error) {
      logger.error(`Error al importar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el historial de ejecuciones de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Array>} - Historial de ejecuciones
   */
  async getMappingExecutionHistory(mappingId, options = {}) {
    try {
      const { limit = 50, status, dateFrom, dateTo } = options;

      const query = { mapping: mappingId };

      if (status) {
        query.status = status;
      }

      if (dateFrom || dateTo) {
        query.startTime = {};
        if (dateFrom) query.startTime.$gte = new Date(dateFrom);
        if (dateTo) query.startTime.$lte = new Date(dateTo);
      }

      const executions = await TaskExecution.find(query)
        .sort({ startTime: -1 })
        .limit(limit);

      // Formatear resultados
      const formattedExecutions = executions.map((execution) => ({
        id: execution._id,
        startTime: execution.startTime,
        endTime: execution.endTime,
        status: execution.status,
        totalDocuments: execution.totalDocuments,
        processedDocuments: execution.processedDocuments,
        failedDocuments: execution.failedDocuments,
        executionTime: execution.executionTime,
        result: execution.result,
      }));

      return formattedExecutions;
    } catch (error) {
      logger.error(
        `Error al obtener historial de ejecuciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Limpia el historial de ejecuciones de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @param {Object} options - Opciones de limpieza
   * @returns {Promise<Object>} - Resultado de la limpieza
   */
  async cleanMappingExecutionHistory(mappingId, options = {}) {
    try {
      const { olderThan = 30, status } = options; // Días

      const query = { mapping: mappingId };

      // Limpiar ejecuciones más antiguas que X días
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThan);
      query.startTime = { $lt: cutoffDate };

      if (status) {
        query.status = status;
      }

      const result = await TaskExecution.deleteMany(query);

      logger.info(
        `Historial de mapeo ${mappingId} limpiado: ${result.deletedCount} registros eliminados`
      );

      return {
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      logger.error(
        `Error al limpiar historial de ejecuciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene métricas agregadas de todos los mapeos
   * @returns {Promise<Object>} - Métricas agregadas
   */
  async getAggregatedMappingMetrics() {
    try {
      const mappings = await TransferMapping.find();
      const totalMappings = mappings.length;
      const activeMappings = mappings.filter((m) => m.active !== false).length;
      const mappingsWithPromotions = mappings.filter(
        (m) => m.promotionConfig?.enabled
      ).length;
      const mappingsWithConsecutives = mappings.filter(
        (m) => m.consecutiveConfig?.enabled
      ).length;

      // Obtener ejecuciones recientes (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentExecutions = await TaskExecution.find({
        startTime: { $gte: thirtyDaysAgo },
      });

      const totalExecutions = recentExecutions.length;
      const successfulExecutions = recentExecutions.filter(
        (e) => e.status === "completed"
      ).length;
      const failedExecutions = recentExecutions.filter(
        (e) => e.status === "failed"
      ).length;
      const totalProcessedDocuments = recentExecutions.reduce(
        (sum, e) => sum + (e.processedDocuments || 0),
        0
      );

      return {
        mappings: {
          total: totalMappings,
          active: activeMappings,
          withPromotions: mappingsWithPromotions,
          withConsecutives: mappingsWithConsecutives,
        },
        executions: {
          total: totalExecutions,
          successful: successfulExecutions,
          failed: failedExecutions,
          successRate:
            totalExecutions > 0
              ? (successfulExecutions / totalExecutions) * 100
              : 0,
        },
        documents: {
          totalProcessed: totalProcessedDocuments,
          avgPerExecution:
            totalExecutions > 0
              ? Math.round(totalProcessedDocuments / totalExecutions)
              : 0,
        },
        period: {
          from: thirtyDaysAgo.toISOString(),
          to: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error(`Error al obtener métricas agregadas: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new DynamicTransferService();
