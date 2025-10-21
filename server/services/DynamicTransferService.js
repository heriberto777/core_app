const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const PromotionProcessor = require("./PromotionProcessor");

/**
 * Servicio dinámico de transferencia de datos con soporte completo para promociones
 * Maneja la transferencia de datos entre bases de datos con procesamiento automático de promociones
 */
class DynamicTransferService {
  constructor() {
    this.cancellationSignals = new Map();
  }

  /**
   * NUEVO: Asegura que tenemos una conexión válida para el servidor especificado
   * @param {string} serverKey - "server1" o "server2"
   * @param {Object|null} currentConnection - Conexión actual (si existe)
   * @returns {Promise<Object>} - Conexión válida
   */
  async _ensureValidConnection(serverKey, currentConnection = null) {
    // Si tenemos una conexión, verificar que funcione
    if (currentConnection) {
      try {
        await SqlService.query(currentConnection, "SELECT 1 AS test");
        logger.debug(`Conexión existente a ${serverKey} está funcionando`);
        return currentConnection;
      } catch (testError) {
        logger.warn(
          `Conexión a ${serverKey} no válida, obteniendo nueva: ${testError.message}`
        );

        // Intentar liberar la conexión inválida
        try {
          await ConnectionService.releaseConnection(currentConnection);
        } catch (releaseError) {
          logger.debug(
            `Error al liberar conexión inválida: ${releaseError.message}`
          );
        }
      }
    }

    // Obtener nueva conexión
    logger.info(`Obteniendo nueva conexión para ${serverKey}...`);
    const newConnection = await ConnectionService.getConnection(serverKey);

    // Validar la nueva conexión
    await SqlService.query(newConnection, "SELECT 1 AS test");
    logger.info(`Nueva conexión a ${serverKey} establecida y validada`);

    return newConnection;
  }

  // ===============================
  // 1. MÉTODOS PRINCIPALES DE PROCESAMIENTO
  // ===============================

  /**
   * Procesa documentos según una configuración de mapeo (MÉTODO PRINCIPAL)
   * @param {Array} documentIds - IDs de los documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {Object} signal - Señal de AbortController para cancelación
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    // Crear AbortController local si no se proporcionó signal
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    // Configurar timeout interno como medida de seguridad
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

      // 🎯 DETECCIÓN AUTOMÁTICA: Verificar si las promociones están habilitadas
      const shouldUsePromotions = this.shouldUsePromotions(mapping);
      if (shouldUsePromotions) {
        logger.info(
          `🎯 DETECCIÓN AUTOMÁTICA: Promociones habilitadas para mapping ${mapping.name}`
        );
      } else {
        logger.info(
          `📋 PROCESAMIENTO ESTÁNDAR: Sin promociones para mapping ${mapping.name}`
        );
      }

      // Asegurar configuración por defecto para mappings existentes
      if (!mapping.markProcessedStrategy) {
        mapping.markProcessedStrategy = "individual";
      }

      if (!mapping.markProcessedConfig) {
        mapping.markProcessedConfig = {
          batchSize: 100,
          includeTimestamp: true,
          timestampField: "LAST_PROCESSED_DATE",
          allowRollback: false,
        };
      }

      // 2. Verificar consecutivos centralizados
      await this.setupCentralizedConsecutives(mapping, mappingId)
        .then((result) => {
          useCentralizedConsecutives = result.useCentralized;
          centralizedConsecutiveId = result.consecutiveId;
        })
        .catch((error) => {
          logger.warn(`Error al configurar consecutivos: ${error.message}`);
        });

      // 3. Registrar en TaskTracker para permitir cancelación
      TaskTracker.registerTask(
        cancelTaskId,
        localAbortController || { abort: () => {} },
        {
          type: "dynamicProcess",
          mappingName: mapping.name,
          documentIds,
          promotionsEnabled: shouldUsePromotions,
        }
      );

      // 4. Crear registro de ejecución
      const taskExecution = new TaskExecution({
        taskId: mapping.taskId,
        taskName: mapping.name,
        date: new Date(),
        status: "running",
        details: {
          documentIds,
          mappingId,
          promotionsEnabled: shouldUsePromotions,
          useCentralizedConsecutives,
          centralizedConsecutiveId,
        },
      });

      await taskExecution.save();
      executionId = taskExecution._id;

      // 5. Establecer conexiones con validación
      const connections = await this.establishConnections(mapping);
      sourceConnection = connections.source;
      targetConnection = connections.target;

      // 6. Actualizar tarea principal como "en ejecución"
      if (mapping.taskId) {
        await TransferTask.findByIdAndUpdate(mapping.taskId, {
          status: "running",
          progress: 0,
          lastExecutionDate: new Date(),
        });
      }

      // 7. Variables para tracking de resultados
      const results = {
        processed: 0,
        failed: 0,
        details: [],
        byType: {},
        consecutivesUsed: [],
        promotionsProcessed: 0,
      };

      const successfulDocuments = [];
      const failedDocuments = [];
      let hasErrors = false;

      // 8. BUCLE PRINCIPAL: Procesar cada documento
      for (let i = 0; i < documentIds.length; i++) {
        // Verificar cancelación
        if (signal.aborted) {
          logger.warn(
            `Procesamiento cancelado en documento ${i + 1}/${
              documentIds.length
            }`
          );
          break;
        }

        const documentId = documentIds[i];
        let currentConsecutive = null;

        try {
          logger.info(
            `📋 Procesando documento ${i + 1}/${
              documentIds.length
            }: ${documentId} ${
              shouldUsePromotions ? "(CON PROMOCIONES)" : "(ESTÁNDAR)"
            }`
          );

          // NUEVO: Validar conexiones antes de cada documento importante
          if (i > 0 && i % 10 === 0) {
            // Cada 10 documentos
            logger.debug(`Validando conexiones en documento ${i + 1}...`);

            sourceConnection = await this._ensureValidConnection(
              mapping.sourceServer,
              sourceConnection
            );

            targetConnection = await this._ensureValidConnection(
              mapping.targetServer,
              targetConnection
            );
          }

          // Generar consecutivo si es necesario
          if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
            currentConsecutive = await this.generateConsecutiveForDocument(
              mapping,
              documentId,
              useCentralizedConsecutives,
              centralizedConsecutiveId
            );
          }

          // 🧠 PROCESAR DOCUMENTO CON DETECCIÓN AUTOMÁTICA DE PROMOCIONES
          const docResult = await this.processSingleDocumentSimple(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            currentConsecutive
          );

          // Manejar resultado del documento
          await this.handleDocumentResult(
            docResult,
            documentId,
            currentConsecutive,
            useCentralizedConsecutives,
            centralizedConsecutiveId,
            results,
            successfulDocuments,
            failedDocuments,
            mapping,
            sourceConnection
          );

          // Actualizar progreso
          if (mapping.taskId) {
            const progress = Math.round(((i + 1) / documentIds.length) * 100);
            await TransferTask.findByIdAndUpdate(mapping.taskId, { progress });
          }
        } catch (error) {
          hasErrors = true;
          await this.handleDocumentError(
            error,
            documentId,
            currentConsecutive,
            useCentralizedConsecutives,
            centralizedConsecutiveId,
            results,
            failedDocuments
          );
        }
      }

      // 9. Procesos post-procesamiento
      await this.executePostProcessing(
        mapping,
        successfulDocuments,
        failedDocuments,
        hasErrors,
        sourceConnection,
        results
      );

      // 10. Finalización y estadísticas
      const finalResult = await this.finalizationAndStats(
        executionId,
        mapping,
        results,
        hasErrors,
        useCentralizedConsecutives,
        centralizedConsecutiveId,
        startTime
      );

      clearTimeout(timeoutId);
      TaskTracker.completeTask(cancelTaskId, finalResult.status);

      return {
        success: true,
        executionId,
        useCentralizedConsecutives,
        centralizedConsecutiveId,
        ...finalResult,
      };
    } catch (error) {
      return await this.handleProcessingError(
        error,
        signal,
        executionId,
        mapping,
        cancelTaskId,
        timeoutId,
        startTime
      );
    } finally {
      await this.cleanup(sourceConnection, targetConnection, timeoutId);
    }
  }

  /**
   * Procesa un único documento con detección automática de promociones
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {Object} currentConsecutive - Consecutivo generado previamente
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
    let promotionsApplied = false;

    try {
      logger.info(
        `Procesando documento ${documentId} (detección automática de promociones)`
      );

      const columnLengthCache = new Map();

      // 🧠 DETECCIÓN AUTOMÁTICA: Determinar si debe usar promociones
      const shouldUsePromotions = this.shouldUsePromotions(mapping);

      if (shouldUsePromotions) {
        logger.info(
          `🎯 DETECCIÓN AUTOMÁTICA: Promociones habilitadas para documento ${documentId}`
        );
      }

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

      // Ordenar tablas por executionOrder
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
        // NUEVO: Validar conexión origen antes de obtener datos
        sourceConnection = await this._ensureValidConnection(
          mapping.sourceServer,
          sourceConnection
        );

        // Obtener datos de la tabla de origen
        const sourceData = await this.getSourceData(
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

        // Procesar dependencias de foreign key ANTES de insertar datos principales
        if (
          mapping.foreignKeyDependencies &&
          mapping.foreignKeyDependencies.length > 0
        ) {
          // NUEVO: Validar conexiones antes de procesar dependencias
          sourceConnection = await this._ensureValidConnection(
            mapping.sourceServer,
            sourceConnection
          );
          targetConnection = await this._ensureValidConnection(
            mapping.targetServer,
            targetConnection
          );

          await this.processForeignKeyDependencies(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            sourceData
          );
        }

        // 3. Determinar el tipo de documento
        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          sourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // NUEVO: Validar conexión destino antes de insertar
        targetConnection = await this._ensureValidConnection(
          mapping.targetServer,
          targetConnection
        );

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

        logger.info(`Insertados datos principales en ${tableConfig.name}`);
        processedTables.push(tableConfig.name);

        // 5. 🧠 PROCESAMIENTO INTELIGENTE DE TABLAS DE DETALLE
        const detailTables = mapping.tableConfigs.filter(
          (tc) =>
            tc.isDetailTable &&
            (!tc.parentTableRef || tc.parentTableRef === tableConfig.name)
        );

        if (detailTables.length > 0) {
          // ✅ DECISIÓN AUTOMÁTICA: usar método con o sin promociones
          if (shouldUsePromotions) {
            logger.info(
              `🎯 Procesando detalles CON promociones para documento ${documentId}`
            );

            const promotionResult =
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

            if (promotionResult && promotionResult.promotionsApplied) {
              promotionsApplied = true;
              logger.info(
                `✅ Promociones aplicadas automáticamente en documento ${documentId}`
              );
            }
          } else {
            logger.info(
              `📋 Procesando detalles SIN promociones para documento ${documentId}`
            );

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
      }

      return {
        success: true,
        message: promotionsApplied
          ? "Documento procesado exitosamente con promociones aplicadas automáticamente"
          : "Documento procesado exitosamente",
        documentType,
        promotionsApplied,
        consecutiveUsed: currentConsecutive
          ? currentConsecutive.formatted
          : null,
        consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
      };
    } catch (error) {
      return this.handleSingleDocumentError(
        error,
        documentId,
        currentConsecutive,
        mapping
      );
    }
  }

  // ===============================
  // 2. MÉTODOS DE PROMOCIONES
  // ===============================

  /**
   * Determina si se deben usar promociones para este mapping
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si se deben usar promociones
   */
  shouldUsePromotions(mapping) {
    try {
      console.log("🔍 DEBUG shouldUsePromotions - INICIANDO");
      console.log("🔍 mapping.name:", mapping.name);
      console.log("🔍 mapping.promotionConfig:", mapping.promotionConfig);

      // 1. Verificar si las promociones están habilitadas
      if (!mapping.promotionConfig || !mapping.promotionConfig.enabled) {
        console.log("🔍 DEBUG: Promociones deshabilitadas");
        return false;
      }

      // 2. Validar configuración de promociones
      if (!PromotionProcessor.validatePromotionConfig(mapping)) {
        console.log("🔍 DEBUG: Configuración inválida");
        logger.warn("Configuración de promociones inválida");
        return false;
      }

      // 3. Verificar que existan tablas de detalle
      const detailTables =
        mapping.tableConfigs?.filter((tc) => tc.isDetailTable) || [];
      console.log(
        "🔍 DEBUG: Tablas de detalle encontradas:",
        detailTables.length
      );

      if (detailTables.length === 0) {
        console.log("🔍 DEBUG: No hay tablas de detalle");
        return false;
      }

      console.log("🔍 DEBUG: ✅ Promociones activadas");
      logger.info(
        "✅ Condiciones para promociones cumplidas - activando procesamiento automático"
      );
      return true;
    } catch (error) {
      console.log("🔍 DEBUG: Error en shouldUsePromotions:", error.message);
      logger.error(`Error al verificar promociones: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtiene configuración de campos de promociones desde el mapping
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Configuración de campos
   */
  getPromotionFieldConfiguration(mapping) {
    const defaultConfig = {
      bonusField: "ART_BON",
      referenceField: "COD_ART_RFR",
      discountField: "MON_DSC",
      lineNumberField: "NUM_LN",
      articleField: "COD_ART",
      quantityField: "CNT_MAX",
      bonusLineRef: "PEDIDO_LINEA_BONIF",
      orderedQuantity: "CANTIDAD_PEDIDA",
      invoiceQuantity: "CANTIDAD_A_FACTURA",
      bonusQuantity: "CANTIDAD_BONIFICAD",
    };

    // Combinar con configuración del mapping si existe
    if (mapping.promotionConfig) {
      return {
        ...defaultConfig,
        ...mapping.promotionConfig.detectFields,
        ...mapping.promotionConfig.targetFields,
      };
    }

    return defaultConfig;
  }

  /**
   * Procesa las tablas de detalle con soporte para promociones - CON DEBUGGING COMPLETO
   * @param {Array} detailTables - Tablas de detalle a procesar
   * @param {string} documentId - ID del documento
   * @param {Object} sourceData - Datos del encabezado
   * @param {Object} parentTableConfig - Configuración de la tabla padre
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Object} mapping - Configuración de mapping
   * @param {Map} columnLengthCache - Cache de longitudes de columnas
   * @param {Array} processedTables - Tablas ya procesadas
   * @returns {Promise<Object>} - Resultado del procesamiento
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
      `🎯 Procesando ${
        orderedDetailTables.length
      } tablas de detalle CON PROMOCIONES en orden: ${orderedDetailTables
        .map((t) => t.name)
        .join(" -> ")}`
    );

    let totalPromotionsApplied = false;

    for (const detailConfig of orderedDetailTables) {
      logger.error(
        `🎯 🔍 ============ PROCESANDO TABLA: ${detailConfig.name} ============`
      );

      // NUEVO: Validar conexión origen antes de obtener datos de detalle
      sourceConnection = await this._ensureValidConnection(
        mapping.sourceServer,
        sourceConnection
      );

      // ✅ USAR MÉTODO CON PROMOCIONES
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

      logger.error(
        `🎯 🔍 DATOS OBTENIDOS DE getDetailDataWithPromotions: ${detailsData.length} registros`
      );

      // 🔍 VERIFICAR SI REALMENTE SE APLICARON PROMOCIONES
      const hasPromotions = detailsData.some(
        (row) =>
          row._PROMOTION_TYPE &&
          row._PROMOTION_TYPE !== "NONE" &&
          row._PROMOTION_TYPE !== "REGULAR" &&
          row._PROMOTION_TYPE !== "REGULAR_WITH_DISCOUNT" // AGREGAR ESTA LÍNEA
      );

      logger.error(`🎯 🔍 ¿Tiene promociones aplicadas? ${hasPromotions}`);

      if (hasPromotions) {
        totalPromotionsApplied = true;
        logger.info(
          `✅ Promociones detectadas y aplicadas automáticamente en tabla ${detailConfig.name}`
        );

        // ✅ LOG DETALLADO DE PROMOCIONES
        const bonusLines = detailsData.filter((row) => row._IS_BONUS_LINE);
        const triggerLines = detailsData.filter((row) => row._IS_TRIGGER_LINE);
        const normalLines = detailsData.filter((row) => row._IS_NORMAL_LINE);

        logger.error(`🎯 🔍 RESUMEN DE PROMOCIONES EN ${detailConfig.name}:`);
        logger.error(`🎯 🔍   Líneas bonificación: ${bonusLines.length}`);
        logger.error(`🎯 🔍   Líneas trigger: ${triggerLines.length}`);
        logger.error(`🎯 🔍   Líneas normales: ${normalLines.length}`);

        // Log específico de cada bonificación
        bonusLines.forEach((line, index) => {
          logger.error(`🎯 🔍 BONIFICACIÓN ${index + 1}:`);
          logger.error(
            `🎯 🔍   Línea: ${line.NUM_LN} | Artículo: ${line.COD_ART}`
          );
          logger.error(
            `🎯 🔍   PEDIDO_LINEA_BONIF: ${line.PEDIDO_LINEA_BONIF}`
          );
          logger.error(
            `🎯 🔍   CANTIDAD_BONIFICAD: ${line.CANTIDAD_BONIFICAD}`
          );
          logger.error(`🎯 🔍   CANTIDAD_PEDIDA: ${line.CANTIDAD_PEDIDA}`);
          logger.error(
            `🎯 🔍   CANTIDAD_A_FACTURA: ${line.CANTIDAD_A_FACTURA}`
          );
          logger.error(`🎯 🔍   _PROMOTION_TYPE: ${line._PROMOTION_TYPE}`);
        });

        // Log específico de cada trigger
        triggerLines.forEach((line, index) => {
          logger.error(`🎯 🔍 TRIGGER ${index + 1}:`);
          logger.error(
            `🎯 🔍   Línea: ${line.NUM_LN} | Artículo: ${line.COD_ART}`
          );
          logger.error(`🎯 🔍   CANTIDAD_PEDIDA: ${line.CANTIDAD_PEDIDA}`);
          logger.error(
            `🎯 🔍   CANTIDAD_A_FACTURA: ${line.CANTIDAD_A_FACTURA}`
          );
          logger.error(`🎯 🔍   _PROMOTION_TYPE: ${line._PROMOTION_TYPE}`);
        });
      }

      logger.error(`🎯 🔍 DATOS ANTES DE PROCESAR CADA REGISTRO:`);
      detailsData.forEach((record, index) => {
        logger.error(`🎯 🔍 ---- REGISTRO ${index + 1} ----`);
        logger.error(
          `🎯 🔍   Datos completos: ${JSON.stringify(record, null, 2)}`
        );

        // Verificar campos críticos de promoción
        const promotionFields = [
          "PEDIDO_LINEA_BONIF",
          "CANTIDAD_BONIFICAD",
          "CANTIDAD_PEDIDA",
          "CANTIDAD_A_FACTURA",
          "_IS_BONUS_LINE",
          "_IS_TRIGGER_LINE",
          "_PROMOTION_TYPE",
        ];

        const foundPromotionFields = [];
        promotionFields.forEach((field) => {
          if (record.hasOwnProperty(field)) {
            foundPromotionFields.push(`${field}: ${record[field]}`);
          }
        });

        logger.error(
          `🎯 🔍   Campos promoción encontrados: ${
            foundPromotionFields.join(", ") || "NINGUNO"
          }`
        );
      });

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${
          detailConfig.name
        } ${hasPromotions ? "CON PROMOCIONES" : "sin promociones"}`
      );

      // NUEVO: Validar conexión destino antes de procesar registros
      targetConnection = await this._ensureValidConnection(
        mapping.targetServer,
        targetConnection
      );

      // ✅ PROCESAR CADA REGISTRO CON MAPPINGS AUTOMÁTICOS
      for (
        let recordIndex = 0;
        recordIndex < detailsData.length;
        recordIndex++
      ) {
        const record = detailsData[recordIndex];

        logger.error(
          `Procesando registro ${recordIndex + 1}/${detailsData.length}`
        );

        try {
          // EJECUTAR LOOKUPS DINÁMICOS PARA ESTA LÍNEA
          if (this.hasLookupFields(detailConfig)) {
            logger.debug(`Ejecutando lookups para línea ${recordIndex + 1}`);

            const lineLookupResults = await this.executeDetailLineLookups(
              record,
              detailConfig,
              targetConnection
            );

            // Agregar resultados de lookup al registro
            Object.assign(record, lineLookupResults);

            if (Object.keys(lineLookupResults).length > 0) {
              logger.info(
                `Lookups aplicados a línea ${recordIndex + 1}: ${Object.keys(
                  lineLookupResults
                )
                  .map((key) => `${key}=${lineLookupResults[key]}`)
                  .join(", ")}`
              );
            }
          }

          logger.error(
            `Datos que van a processTable: ${JSON.stringify(record, null, 2)}`
          );

          // Procesar con processTable (modificado para no ejecutar lookup interno)
          await this.processTable(
            detailConfig,
            sourceData,
            record, // Ya contiene los campos de promoción Y lookup
            targetConnection,
            currentConsecutive,
            mapping,
            documentId,
            columnLengthCache,
            true // isDetailTable
          );

          logger.error(`Registro ${recordIndex + 1} procesado exitosamente`);
        } catch (recordError) {
          logger.error(
            `Error procesando registro ${recordIndex + 1}: ${
              recordError.message
            }`
          );

          // Log del registro problemático
          logger.error(
            `Registro problemático: ${JSON.stringify(record, null, 2)}`
          );

          // Re-lanzar errores críticos
          if (recordError.message.includes("requerido")) {
            throw recordError;
          }
        }
      }

      processedTables.push(detailConfig.name);
      logger.info(`✅ Tabla ${detailConfig.name} procesada exitosamente`);
    }

    // ✅ RESUMEN FINAL
    logger.error(
      `🎯 🔍 ============ RESUMEN FINAL DE PROCESAMIENTO ============`
    );
    logger.error(`🎯 🔍 Total tablas procesadas: ${processedTables.length}`);
    logger.error(
      `🎯 🔍 Promociones aplicadas: ${totalPromotionsApplied ? "SÍ" : "NO"}`
    );
    logger.error(`🎯 🔍 Tablas procesadas: ${processedTables.join(", ")}`);

    return {
      promotionsApplied: totalPromotionsApplied,
      tablesProcessed: processedTables.length,
      tableNames: processedTables,
    };
  }

  /**
   * Procesa las tablas de detalle SIN promociones (método estándar)
   * @param {Array} detailTables - Tablas de detalle a procesar
   * @param {string} documentId - ID del documento
   * @param {Object} sourceData - Datos del encabezado
   * @param {Object} parentTableConfig - Configuración de la tabla padre
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Object} mapping - Configuración de mapping
   * @param {Map} columnLengthCache - Cache de longitudes de columnas
   * @param {Array} processedTables - Tablas ya procesadas
   * @returns {Promise<Object>} - Resultado del procesamiento
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
        .join(" -> ")} (ESTÁNDAR)`
    );

    for (const detailConfig of orderedDetailTables) {
      logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);

      // NUEVO: Validar conexión origen antes de obtener datos
      sourceConnection = await this._ensureValidConnection(
        mapping.sourceServer,
        sourceConnection
      );

      // Usar método estándar
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
        `Procesando ${detailsData.length} registros de detalle en ${detailConfig.name} (modo estándar)`
      );

      // NUEVO: Validar conexión destino antes de insertar detalles
      targetConnection = await this._ensureValidConnection(
        mapping.targetServer,
        targetConnection
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
      }

      logger.info(`Insertados detalles en ${detailConfig.name}`);
      processedTables.push(detailConfig.name);
    }

    return {
      promotionsApplied: false,
    };
  }

  /**
   * Detecta campos de promociones que deben procesarse pero no están en el mapping
   * @param {Object} dataForProcessing - Datos a procesar
   * @param {Object} promotionFieldConfig - Configuración de campos de promoción
   * @param {Set} processedFieldNames - Nombres de campos ya procesados
   * @returns {Array} - Lista de campos de promoción a procesar
   */
  detectPromotionFieldsToProcess(
    dataForProcessing,
    promotionFieldConfig,
    processedFieldNames
  ) {
    const fieldsToProcess = [];

    // Lista de campos de promoción que pueden necesitar procesamiento
    const promotionFields = [
      {
        sourceField: promotionFieldConfig.bonusLineRef,
        targetField: promotionFieldConfig.bonusLineRef,
        description: "Referencia línea bonificación",
      },
      {
        sourceField: promotionFieldConfig.orderedQuantity,
        targetField: promotionFieldConfig.orderedQuantity,
        description: "Cantidad pedida",
      },
      {
        sourceField: promotionFieldConfig.invoiceQuantity,
        targetField: promotionFieldConfig.invoiceQuantity,
        description: "Cantidad a facturar",
      },
      {
        sourceField: promotionFieldConfig.bonusQuantity,
        targetField: promotionFieldConfig.bonusQuantity,
        description: "Cantidad bonificación",
      },
    ];

    // Verificar cada campo de promoción
    for (const field of promotionFields) {
      const targetFieldLower = field.targetField.toLowerCase();

      // Si el campo NO fue procesado ya Y existe en los datos
      if (
        !processedFieldNames.has(targetFieldLower) &&
        dataForProcessing.hasOwnProperty(field.sourceField)
      ) {
        fieldsToProcess.push(field);
        logger.debug(
          `🎯 Campo promoción detectado para procesar: ${field.sourceField} -> ${field.targetField} (${field.description})`
        );
      }
    }

    return fieldsToProcess;
  }

  /**
   * Verifica campos alternativos para promociones
   * @param {string} sourceField - Campo origen solicitado
   * @param {Object} sourceData - Datos origen
   * @param {Object} mapping - Configuración de mapping
   * @returns {*} - Valor encontrado o null
   */
  checkPromotionFieldAlternatives(sourceField, sourceData, mapping) {
    if (!mapping.promotionConfig?.enabled) {
      return null;
    }

    const promotionConfig = this.getPromotionFieldConfiguration(mapping);

    // Mapeo de campos alternativos
    const fieldAlternatives = {
      [promotionConfig.bonusLineRef]: [
        "PEDIDO_LINEA_BONIF",
        "LINEA_BONIFICACION",
        "REF_LINEA_BONUS",
      ],
      [promotionConfig.orderedQuantity]: [
        "CANTIDAD_PEDIDA",
        "QTY_PEDIDA",
        "CANT_PEDIDA",
      ],
      [promotionConfig.invoiceQuantity]: [
        "CANTIDAD_A_FACTURA",
        "QTY_FACTURAR",
        "CANT_FACTURAR",
      ],
      [promotionConfig.bonusQuantity]: [
        "CANTIDAD_BONIFICAD",
        "QTY_BONUS",
        "CANT_BONIFICADA",
      ],
    };

    // Buscar alternativas para el campo solicitado
    for (const [mainField, alternatives] of Object.entries(fieldAlternatives)) {
      if (sourceField === mainField || alternatives.includes(sourceField)) {
        // Buscar en el orden de prioridad
        for (const alternative of [mainField, ...alternatives]) {
          if (sourceData.hasOwnProperty(alternative)) {
            logger.debug(
              `🎯 Campo promoción encontrado: ${sourceField} -> ${alternative} = ${sourceData[alternative]}`
            );
            return sourceData[alternative];
          }
        }
      }
    }

    return null;
  }

  // ===============================
  // 3. MÉTODOS DE OBTENCIÓN DE DATOS
  // ===============================

  /**
   * Obtiene datos de detalle con procesamiento de promociones - COMPLETO CORREGIDO
   * @param {Object} detailConfig - Configuración de la tabla de detalle
   * @param {Object} parentTableConfig - Configuración de la tabla padre
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} mapping - Configuración de mapping
   * @returns {Promise<Array>} - Datos de detalle procesados
   */
  async getDetailDataWithPromotions(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection,
    mapping
  ) {
    try {
      logger.info(
        `🎯 Obteniendo datos con promociones para documento ${documentId}`
      );

      // ✅ PASO 1: Verificar si las promociones están habilitadas
      if (!mapping.promotionConfig || !mapping.promotionConfig.enabled) {
        logger.debug(
          "Promociones deshabilitadas, procesando datos normalmente"
        );
        return await this.getDetailData(
          detailConfig,
          parentTableConfig,
          documentId,
          sourceConnection
        );
      }

      if (!PromotionProcessor.validatePromotionConfig(mapping)) {
        logger.warn(
          "Configuración de promociones inválida, procesando sin promociones"
        );
        return await this.getDetailData(
          detailConfig,
          parentTableConfig,
          documentId,
          sourceConnection
        );
      }

      // NUEVO: Asegurar conexión válida antes de obtener datos
      sourceConnection = await this._ensureValidConnection(
        mapping.sourceServer,
        sourceConnection
      );

      // ✅ PASO 2: Obtener datos CON campos de promociones garantizados
      const detailData = await this.getDetailDataWithPromotionFields(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection,
        mapping
      );

      if (!detailData || detailData.length === 0) {
        logger.warn(
          `No se obtuvieron datos de detalle para documento ${documentId}`
        );
        return [];
      }

      logger.debug(`📊 Datos obtenidos: ${detailData.length} registros`);

      // ✅ PASO 3: Usar configuración detectada si está disponible
      let fieldConfigToUse = null;
      if (detailData.length > 0 && detailData[0]._DETECTED_PROMOTION_CONFIG) {
        fieldConfigToUse = detailData[0]._DETECTED_PROMOTION_CONFIG;
        logger.info(
          `🎯 ✅ Usando configuración de campos detectada automáticamente`
        );

        // Limpiar el campo temporal de los datos
        detailData.forEach((record) => {
          delete record._DETECTED_PROMOTION_CONFIG;
        });
      } else {
        fieldConfigToUse = PromotionProcessor.getFieldConfiguration(mapping);
        logger.info(`🎯 Usando configuración de campos por defecto`);
      }

      // ✅ PASO 4: Verificar que llegaron los campos de promoción
      const firstRecord = detailData[0];
      const missingFields = [];
      const requiredFields = [
        fieldConfigToUse.bonusField,
        fieldConfigToUse.referenceField,
        fieldConfigToUse.discountField,
        fieldConfigToUse.lineNumberField,
        fieldConfigToUse.articleField,
        fieldConfigToUse.quantityField,
      ];

      requiredFields.forEach((field) => {
        if (!firstRecord.hasOwnProperty(field)) {
          missingFields.push(field);
        }
      });

      if (missingFields.length > 0) {
        logger.error(
          `🎯 ❌ CAMPOS DE PROMOCIÓN FALTANTES: ${missingFields.join(", ")}`
        );
        logger.error(
          `🎯 Campos disponibles: ${Object.keys(firstRecord).join(", ")}`
        );
        throw new Error(
          `Faltan campos requeridos para promociones: ${missingFields.join(
            ", "
          )}`
        );
      }

      logger.info(`🎯 ✅ Todos los campos de promoción están presentes`);

      // ✅ PASO 5: Los datos pasan directamente sin conversión (se aplicará en processField)
      logger.info(
        `🎯 Procesando promociones para documento ${documentId} (conversión se aplicará después)`
      );

      // ✅ PASO 6: PROCESAR PROMOCIONES CON DATOS YA CONVERTIDOS
      logger.info(
        `🎯 Procesando promociones con datos convertidos para documento ${documentId}`
      );

      const processedData = PromotionProcessor.processPromotionsWithConfig(
        detailData, // ← Datos originales sin conversión
        mapping,
        fieldConfigToUse
      );

      // ✅ PASO 7: Aplicar reglas específicas si están configuradas
      const finalData = PromotionProcessor.applyPromotionRules(
        processedData,
        mapping.promotionConfig
      );

      // ✅ PASO 8: Log de resultados y verificación
      const bonusLines = finalData.filter((line) => line._IS_BONUS_LINE);
      const triggerLines = finalData.filter((line) => line._IS_TRIGGER_LINE);
      const regularLines = finalData.filter(
        (line) => !line._IS_BONUS_LINE && !line._IS_TRIGGER_LINE
      );

      logger.info(
        `🎯 ✅ Procesamiento completado: ${regularLines.length} regulares, ${bonusLines.length} bonificaciones, ${triggerLines.length} líneas trigger`
      );

      // ✅ PASO 9: Verificación crítica de cantidades
      finalData.forEach((line, index) => {
        if (line._IS_BONUS_LINE) {
          logger.debug(`🎯 Línea bonificación ${index + 1}:`);
          logger.debug(
            `  CANTIDAD_PEDIDA: ${line.CANTIDAD_PEDIDA} (debe ser 0)`
          );
          logger.debug(
            `  CANTIDAD_A_FACTURA: ${line.CANTIDAD_A_FACTURA} (debe ser 0)`
          );
          logger.debug(
            `  CANTIDAD_BONIFICAD: ${line.CANTIDAD_BONIFICAD} (debe tener valor)`
          );
          logger.debug(
            `  PEDIDO_LINEA_BONIF: ${line.PEDIDO_LINEA_BONIF} (referencia)`
          );
        }
      });

      return finalData;
    } catch (error) {
      logger.error(`Error en getDetailDataWithPromotions: ${error.message}`);
      throw new Error(
        `Error al obtener datos con promociones: ${error.message}`
      );
    }
  }

  /**
   * Obtiene datos de detalle (método estándar)
   * @param {Object} detailConfig - Configuración de la tabla de detalle
   * @param {Object} parentTableConfig - Configuración de la tabla padre
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión origen
   * @returns {Promise<Array>} - Datos de detalle
   */
  async getDetailData(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    // NUEVO: Asegurar conexión válida antes de obtener datos
    sourceConnection = await this._ensureValidConnection(
      // Obtener serverKey desde mapping o usar default
      sourceConnection._serverKey || "server1",
      sourceConnection
    );

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

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

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

    // Construir la lista de campos
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

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    return result.recordset;
  }

  /**
   * Obtiene datos de la tabla de origen
   * @param {string} documentId - ID del documento
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} sourceConnection - Conexión origen
   * @returns {Promise<Object>} - Datos de origen
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    // NUEVO: Asegurar conexión válida antes de obtener datos
    sourceConnection = await this._ensureValidConnection(
      sourceConnection._serverKey || "server1",
      sourceConnection
    );

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

      logger.debug(`Ejecutando consulta principal: ${query}`);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      return result.recordset[0];
    }
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
      // Validar que el mapeo sea válido
      if (
        !mapping ||
        !mapping.tableConfigs ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error("Configuración de mapeo inválida");
      }

      // Determinar tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable || !mainTable.sourceTable) {
        throw new Error(
          "No se encontró configuración de tabla principal válida"
        );
      }

      logger.info(
        `Obteniendo documentos de ${mainTable.sourceTable} en ${mapping.sourceServer}`
      );

      // NUEVO: Asegurar conexión válida antes de consultar
      connection = await this._ensureValidConnection(
        mapping.sourceServer,
        connection
      );

      // Verificar y preparar tabla
      const tableInfo = await this.prepareTableForQuery(mainTable, connection);

      // Construir consulta
      const queryBuilder = this.buildDocumentQuery(
        mainTable,
        filters,
        tableInfo
      );

      logger.info(`Ejecutando consulta: ${queryBuilder.query}`);
      const result = await SqlService.query(
        connection,
        queryBuilder.query,
        queryBuilder.params
      );

      logger.info(
        `Consulta ejecutada exitosamente. Documentos encontrados: ${result.recordset.length}`
      );
      return result.recordset;
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  // ===============================
  // 4. MÉTODOS DE PROCESAMIENTO DE CAMPOS Y TABLAS
  // ===============================

  /**
   * Procesa una tabla individual - MEJORADO para promociones con tu lógica existente
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} sourceData - Datos de origen (encabezado)
   * @param {Object} tableData - Datos específicos de la tabla
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Object} mapping - Configuración de mapping
   * @param {string} documentId - ID del documento
   * @param {Map} columnLengthCache - Cache de longitudes de columnas
   * @param {boolean} isDetailTable - Si es tabla de detalle
   * @returns {Promise<void>}
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
    const processedFieldNames = new Set();

    // Determinar qué datos usar para procesamiento
    const dataForProcessing = isDetailTable ? tableData : sourceData;

    logger.error(
      `============ INICIANDO processTable: ${tableConfig.name} ============`
    );
    logger.error(`isDetailTable: ${isDetailTable}`);
    logger.error(
      `dataForProcessing claves: ${Object.keys(dataForProcessing).join(", ")}`
    );

    // Verificar si hay datos de promociones
    const hasPromotionData = this.detectPromotionData(dataForProcessing);
    logger.error(`¿Detecta promociones? ${hasPromotionData}`);

    // Validar configuración de campos
    if (!tableConfig.fieldMappings || tableConfig.fieldMappings.length === 0) {
      logger.warn(`Tabla ${tableConfig.name} no tiene fieldMappings definidos`);
      return;
    }

    // DEBUGGING específico
    if (dataForProcessing._IS_REGULAR_WITH_DISCOUNT) {
      logger.error(`LÍNEA REGULAR CON DESCUENTO - debe usar flujo normal`);
    }

    if (dataForProcessing._IS_BONUS_LINE) {
      logger.error(`LÍNEA BONIFICACIÓN REAL - debe usar flujo de promociones`);
    }

    // Lógica mejorada para promociones
    let allFieldMappings = [];

    if (hasPromotionData && dataForProcessing._IS_BONUS_LINE) {
      logger.error(
        `DATOS DE PROMOCIONES DETECTADOS en tabla ${tableConfig.name}`
      );

      // Marcar campos ya procesados del mapping original
      tableConfig.fieldMappings.forEach((fm) => {
        if (fm.targetField) {
          processedFieldNames.add(fm.targetField.toLowerCase());
          logger.error(
            `Original: ${fm.sourceField || "null"} -> ${fm.targetField}`
          );
        }
      });

      // Generar mappings automáticos
      const promotionFieldMappings = this.generatePromotionFieldMappings(
        dataForProcessing,
        mapping,
        processedFieldNames
      );

      logger.error(
        `MAPPINGS AUTOMÁTICOS GENERADOS: ${promotionFieldMappings.length}`
      );

      // Integrar mappings (originales + automáticos)
      allFieldMappings = [
        ...tableConfig.fieldMappings,
        ...promotionFieldMappings,
      ];

      logger.error(
        `MAPPINGS TOTALES: ${tableConfig.fieldMappings.length} originales + ${promotionFieldMappings.length} automáticos = ${allFieldMappings.length}`
      );

      // Reset processed field names para incluir los nuevos
      processedFieldNames.clear();
    } else {
      // Flujo normal sin promociones
      allFieldMappings = tableConfig.fieldMappings;
      logger.error(
        `NO se detectaron promociones, usando ${allFieldMappings.length} mappings normales`
      );
    }

    // Ejecutar lookup SOLO si no es detalle (los detalles ya tienen lookup aplicado)
    let lookupResults = {};
    if (this.hasLookupFields(tableConfig) && !isDetailTable) {
      logger.info("Ejecutando lookup para tabla de encabezado");

      // NUEVO: Asegurar conexión válida antes de lookup
      targetConnection = await this._ensureValidConnection(
        mapping.targetServer,
        targetConnection
      );

      const lookupExecution = await this.executeLookupInTarget(
        tableConfig,
        dataForProcessing,
        targetConnection
      );
      if (!lookupExecution.success) {
        throw new Error(
          `Falló la validación de lookup para tabla ${tableConfig.name}`
        );
      }
      lookupResults = lookupExecution.results;
    } else if (isDetailTable) {
      logger.debug(
        "Omitiendo lookup interno para detalle (ya aplicado previamente)"
      );
    }

    logger.error(
      `PROCESANDO ${allFieldMappings.length} campos del mapping para tabla ${tableConfig.name}`
    );

    // Procesar todos los campos (originales + automáticos)
    for (
      let fieldIndex = 0;
      fieldIndex < allFieldMappings.length;
      fieldIndex++
    ) {
      const fieldMapping = allFieldMappings[fieldIndex];

      if (!fieldMapping.targetField) {
        logger.warn(
          `Campo sin targetField definido en tabla ${tableConfig.name}`
        );
        continue;
      }

      const targetFieldLower = fieldMapping.targetField.toLowerCase();
      if (processedFieldNames.has(targetFieldLower)) {
        logger.warn(
          `Campo duplicado: ${fieldMapping.targetField} en tabla ${tableConfig.name}`
        );
        continue;
      }

      logger.error(
        `---- PROCESANDO CAMPO ${fieldIndex + 1}/${
          allFieldMappings.length
        } ----`
      );
      logger.error(
        `Campo: ${fieldMapping.sourceField || "(automático)"} -> ${
          fieldMapping.targetField
        }`
      );
      logger.error(`Es promoción: ${fieldMapping.isPromotionField || false}`);

      try {
        // Usar método processField mejorado
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

        if (processedField && processedField.value !== undefined) {
          processedFieldNames.add(targetFieldLower);

          if (processedField.isDirectSql) {
            targetFields.push(fieldMapping.targetField);
            targetValues.push(processedField.value);
            directSqlFields.add(fieldMapping.targetField);
            logger.error(
              `Campo SQL directo: ${fieldMapping.targetField} = ${processedField.value}`
            );
          } else {
            // Incluir todos los campos, incluso null si no es requerido
            if (
              processedField.value !== null ||
              fieldMapping.isRequired ||
              fieldMapping.isPromotionField
            ) {
              targetData[fieldMapping.targetField] = processedField.value;
              targetFields.push(fieldMapping.targetField);
              targetValues.push(`@${fieldMapping.targetField}`);

              // Log específico para campos de promoción
              if (fieldMapping.isPromotionField) {
                logger.error(
                  `CAMPO PROMOCIÓN PROCESADO: ${fieldMapping.targetField} = ${processedField.value}`
                );
              } else {
                logger.error(
                  `Campo normal procesado: ${fieldMapping.targetField} = ${processedField.value}`
                );
              }
            } else {
              logger.error(
                `Campo omitido (valor null y no requerido): ${fieldMapping.targetField}`
              );
            }
          }
        } else {
          logger.error(`Campo no procesado: ${fieldMapping.targetField}`);
        }
      } catch (fieldError) {
        logger.error(
          `Error procesando campo ${fieldMapping.targetField}: ${fieldError.message}`
        );
        if (fieldMapping.isRequired) {
          throw fieldError;
        }
      }
    }

    // NUEVO: Agregar campos de lookup que están en los datos pero no en fieldMappings (SOLO para detalles)
    if (isDetailTable) {
      logger.info(
        "Verificando campos de lookup adicionales en datos de detalle..."
      );

      // Buscar campos que sean resultados de lookup pero no están procesados
      const lookupFieldsFromData = Object.keys(dataForProcessing).filter(
        (key) => {
          // Verificar si este campo tiene configuración de lookup
          const hasLookupConfig = tableConfig.fieldMappings.some(
            (fm) => fm.lookupFromTarget && fm.targetField === key
          );

          // Si hay configuración de lookup para este campo Y no está ya procesado
          const isAlreadyProcessed = processedFieldNames.has(key.toLowerCase());

          if (hasLookupConfig && !isAlreadyProcessed) {
            logger.info(
              `Campo lookup encontrado en datos: ${key} = ${dataForProcessing[key]}`
            );
            return true;
          }

          return false;
        }
      );

      logger.info(
        `Campos de lookup encontrados en datos: ${lookupFieldsFromData.join(
          ", "
        )}`
      );

      // Agregar estos campos a la inserción
      for (const lookupField of lookupFieldsFromData) {
        const value = dataForProcessing[lookupField];
        if (value !== null && value !== undefined) {
          targetData[lookupField] = value;
          targetFields.push(lookupField);
          targetValues.push(`@${lookupField}`);
          processedFieldNames.add(lookupField.toLowerCase());

          logger.info(
            `Campo lookup agregado para inserción: ${lookupField} = ${value}`
          );
        } else {
          logger.warn(`Campo lookup con valor nulo omitido: ${lookupField}`);
        }
      }
    }

    // Log final de campos a insertar
    logger.error(
      `============ RESUMEN FINAL PARA ${tableConfig.targetTable} ============`
    );
    logger.error(`Total campos a insertar: ${targetFields.length}`);

    // Identificar campos de promoción
    const promotionFieldsInTarget = targetFields.filter(
      (field) =>
        field.includes("CANTIDAD_") ||
        field.includes("PEDIDO_LINEA_BONIF") ||
        field.includes("BONIF")
    );

    if (promotionFieldsInTarget.length > 0) {
      logger.error(
        `CAMPOS DE PROMOCIÓN A INSERTAR: ${promotionFieldsInTarget.join(", ")}`
      );
    }

    // Identificar campos de lookup
    const lookupFieldsInTarget = targetFields.filter((field) => {
      return tableConfig.fieldMappings.some(
        (fm) => fm.lookupFromTarget && fm.targetField === field
      );
    });

    if (lookupFieldsInTarget.length > 0) {
      logger.error(
        `CAMPOS DE LOOKUP A INSERTAR: ${lookupFieldsInTarget
          .map((field) => `${field}=${targetData[field]}`)
          .join(", ")}`
      );
    }

    // Filtrar campos auxiliares antes de inserción
    const auxiliaryFields = [
      "Unit_Measure",
      "Factor_Conversion",
      "_IS_BONUS_LINE",
      "_IS_TRIGGER_LINE",
      "_promotionType",
      "_processed",
      "_DETECTED_PROMOTION_CONFIG",
      "_PROMOTION_TYPE",
    ];

    const filteredTargetFields = [];
    const filteredTargetValues = [];
    const filteredTargetData = {};
    const filteredDirectSqlFields = new Set();

    targetFields.forEach((field, index) => {
      if (!auxiliaryFields.includes(field)) {
        filteredTargetFields.push(field);
        filteredTargetValues.push(targetValues[index]);

        if (targetData.hasOwnProperty(field)) {
          filteredTargetData[field] = targetData[field];
        }

        if (directSqlFields.has(field)) {
          filteredDirectSqlFields.add(field);
        }
      } else {
        logger.debug(`Campo auxiliar filtrado: ${field}`);
      }
    });

    logger.info(
      `Campos después del filtro: ${filteredTargetFields.length} (eliminados ${
        targetFields.length - filteredTargetFields.length
      } auxiliares)`
    );

    // Validación final
    if (filteredTargetFields.length === 0) {
      logger.warn(
        `No hay campos válidos para insertar en tabla ${tableConfig.targetTable} después del filtrado`
      );
      return;
    }

    // NUEVO: Asegurar conexión válida antes de ejecutar inserción
    targetConnection = await this._ensureValidConnection(
      mapping.targetServer,
      targetConnection
    );

    // Ejecutar inserción usando campos filtrados
    logger.error(
      `EJECUTANDO INSERCIÓN EN ${tableConfig.targetTable} con ${filteredTargetFields.length} campos`
    );

    await this.executeInsert(
      tableConfig.targetTable,
      filteredTargetFields,
      filteredTargetValues,
      filteredTargetData,
      filteredDirectSqlFields,
      targetConnection
    );

    logger.error(`Tabla ${tableConfig.name} procesada exitosamente`);
  }

  /**
   * Procesa un campo individual - COMPLETO CORREGIDO con conversiones mejoradas
   * @param {Object} fieldMapping - Configuración del campo
   * @param {Object} sourceData - Datos origen
   * @param {Object} lookupResults - Resultados de lookup
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} tableConfig - Configuración de tabla
   * @param {boolean} isDetailTable - Si es tabla de detalle
   * @param {Object} targetConnection - Conexión destino
   * @param {Map} columnLengthCache - Cache de longitudes
   * @returns {Promise<Object>} - Campo procesado
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

    logger.debug(
      `Procesando campo: ${fieldMapping.sourceField || "(automático)"} -> ${
        fieldMapping.targetField
      }`
    );

    // NUEVO: Para detalles, verificar si este campo ya tiene valor de lookup
    if (
      isDetailTable &&
      fieldMapping.lookupFromTarget &&
      sourceData[fieldMapping.targetField] !== undefined
    ) {
      const lookupValue = sourceData[fieldMapping.targetField];
      logger.info(
        `Usando valor de lookup para ${fieldMapping.targetField}: ${lookupValue}`
      );
      return {
        value: lookupValue,
        isDirectSql: false,
        fieldName: fieldMapping.targetField,
        success: true,
      };
    }

    // Lógica automática para campos de promociones mejorada
    const isPromotionField = this.isPromotionTargetField(
      fieldMapping.targetField
    );

    if (isPromotionField && !fieldMapping.sourceField) {
      logger.info(`Campo de promoción detectado: ${fieldMapping.targetField}`);

      // Usar método mejorado del PromotionProcessor
      const promotionValue = this.findPromotionValue(
        fieldMapping.targetField,
        sourceData,
        mapping
      );

      if (promotionValue !== null && promotionValue !== undefined) {
        logger.info(
          `Valor encontrado automáticamente: ${fieldMapping.targetField} = ${promotionValue}`
        );
        value = promotionValue;
      } else {
        logger.debug(
          `No se encontró valor para ${fieldMapping.targetField}, usando defaultValue`
        );
        value =
          fieldMapping.defaultValue === "NULL"
            ? null
            : fieldMapping.defaultValue;
      }
    }
    // Lógica para campos de promoción con sourceField definido mejorada
    else if (fieldMapping.isPromotionField && fieldMapping.sourceField) {
      logger.info(
        `Campo de promoción con source: ${fieldMapping.sourceField} -> ${fieldMapping.targetField}`
      );

      // Usar método mejorado para buscar valores
      value = this.findFieldValueInData(
        fieldMapping.sourceField,
        sourceData,
        mapping
      );

      if (value !== null && value !== undefined) {
        logger.info(
          `Valor promoción encontrado: ${fieldMapping.targetField} = ${value}`
        );
      } else {
        logger.debug(
          `No se encontró valor para ${fieldMapping.sourceField}, usando defaultValue`
        );
        value =
          fieldMapping.defaultValue === "NULL"
            ? null
            : fieldMapping.defaultValue;
      }
    }
    // Lógica normal manteniendo la estructura existente
    else {
      try {
        // 1. Verificar si tiene sourceField definido
        if (fieldMapping.sourceField) {
          // Mantener corrección crítica: Extraer valor real de objetos de configuración
          let sourceValue = sourceData[fieldMapping.sourceField];

          // Detectar y corregir objetos de configuración
          if (typeof sourceValue === "object" && sourceValue !== null) {
            // Si es un objeto de configuración con sourceField, extraer el valor real
            if (sourceValue.sourceField) {
              logger.warn(
                `Objeto de configuración detectado para ${fieldMapping.targetField}`
              );
              const realSourceField = sourceValue.sourceField;
              const realValue = sourceData[realSourceField];
              logger.debug(
                `Extrayendo valor real: ${realSourceField} = ${realValue}`
              );
              value = realValue;
            }
            // Si es un objeto con valor directo pero no es de configuración
            else if (sourceValue.hasOwnProperty("value")) {
              value = sourceValue.value;
            }
            // Si es un objeto complejo, usar como está (puede ser válido para algunos casos)
            else {
              value = sourceValue;
            }
          } else {
            value = sourceValue;
          }

          if (value === null || value === undefined) {
            logger.debug(
              `Campo ${fieldMapping.sourceField} no encontrado en datos`
            );
          }
        }

        // 2. Si no se encontró valor, usar defaultValue
        if (
          (value === null || value === undefined) &&
          fieldMapping.defaultValue !== undefined
        ) {
          value =
            fieldMapping.defaultValue === "NULL"
              ? null
              : fieldMapping.defaultValue;
          logger.debug(
            `Usando defaultValue para ${fieldMapping.targetField}: ${value}`
          );
        }

        // 3. Procesar lookup si está configurado
        if (
          fieldMapping.lookupFromTarget &&
          lookupResults[fieldMapping.targetField]
        ) {
          value = lookupResults[fieldMapping.targetField];
          logger.debug(
            `Valor obtenido por lookup: ${fieldMapping.targetField} = ${value}`
          );
        }

        // 4. Usar métodos existentes de consecutivos
        if (
          this.isConsecutiveField(fieldMapping, mapping) &&
          currentConsecutive
        ) {
          value = this.getConsecutiveValue(
            fieldMapping,
            currentConsecutive,
            isDetailTable
          );
          logger.debug(
            `Consecutivo asignado usando sistema centralizado: ${value}`
          );
        }
      } catch (error) {
        logger.error(
          `Error procesando campo ${fieldMapping.targetField}: ${error.message}`
        );
        if (fieldMapping.isRequired) {
          throw error;
        }
        value =
          fieldMapping.defaultValue === "NULL"
            ? null
            : fieldMapping.defaultValue;
      }
    }

    // Validaciones y transformaciones finales

    // Verificar campo requerido
    if (
      fieldMapping.isRequired &&
      (value === null || value === undefined || value === "")
    ) {
      throw new Error(`Campo requerido ${fieldMapping.targetField} está vacío`);
    }

    // Conversión universal de unidades
    if (value !== null) {
      // Aplicar conversión universal a campos de cantidad
      if (this.isQuantityField(fieldMapping.targetField)) {
        try {
          const originalValue = value;
          value = await this.applyUniversalUnitConversion(
            sourceData,
            value,
            fieldMapping.targetField
          );

          if (value !== originalValue) {
            logger.info(
              `Conversión universal: ${fieldMapping.targetField}: ${originalValue} -> ${value}`
            );
          }
        } catch (conversionError) {
          logger.error(
            `Error en conversión universal para ${fieldMapping.targetField}: ${conversionError.message}`
          );
          // Mantener valor original si falla la conversión
        }
      }
      // Mantener conversión específica configurada en fieldMapping (para casos especiales)
      else if (
        fieldMapping.unitConversion &&
        fieldMapping.unitConversion.enabled
      ) {
        try {
          // Verificar que el valor sea realmente numérico
          let numericValue;

          if (typeof value === "number") {
            numericValue = value;
          } else if (typeof value === "string") {
            numericValue = parseFloat(value);
          } else {
            throw new Error(`Valor no convertible a número: ${typeof value}`);
          }

          if (isNaN(numericValue)) {
            throw new Error(`Valor no numérico para conversión: ${value}`);
          }

          // Aplicar conversión específica configurada
          const originalValue = value;
          // Aplicar conversión simple sin método externo
          const factor = fieldMapping.unitConversion.factor || 1;
          switch (fieldMapping.unitConversion.operation || "multiply") {
            case "multiply":
              value = numericValue * factor;
              break;
            case "divide":
              value = factor !== 0 ? numericValue / factor : numericValue;
              break;
            case "add":
              value = numericValue + factor;
              break;
            case "subtract":
              value = numericValue - factor;
              break;
            default:
              value = numericValue;
          }

          if (value !== originalValue) {
            logger.debug(
              `Conversión específica aplicada: ${originalValue} -> ${value}`
            );
          }
        } catch (conversionError) {
          logger.error(
            `Error en conversión de unidades para ${fieldMapping.targetField}: ${conversionError.message}`
          );

          // Usar valor por defecto en caso de error
          if (fieldMapping.defaultValue !== undefined) {
            value =
              fieldMapping.defaultValue === "NULL"
                ? null
                : fieldMapping.defaultValue;
          } else {
            value = 0; // Valor seguro para campos numéricos
          }

          if (fieldMapping.isRequired) {
            throw conversionError;
          }
        }
      }
    }

    // Aplicar mapeo de valores si está configurado
    if (fieldMapping.valueMappings && fieldMapping.valueMappings.length > 0) {
      const mappedValue = this.applyValueMapping(
        fieldMapping.valueMappings,
        value
      );
      if (mappedValue !== null) {
        value = mappedValue;
      }
    }

    // Remover prefijo si está configurado
    if (fieldMapping.removePrefix && value && typeof value === "string") {
      value = value.replace(new RegExp(`^${fieldMapping.removePrefix}`), "");
    }

    // Usar lógica existente para longitud máxima
    if (
      value &&
      typeof value === "string" &&
      fieldMapping.maxLength &&
      value.length > fieldMapping.maxLength
    ) {
      const originalValue = value;
      value = value.substring(0, fieldMapping.maxLength);
      logger.warn(
        `Valor truncado en ${fieldMapping.targetField}: "${originalValue}" -> "${value}"`
      );
    }

    // Validación automática existente para campos de fecha
    if (
      (value === null || value === undefined) &&
      fieldMapping.targetField &&
      (fieldMapping.targetField.toUpperCase().includes("FECHA") ||
        fieldMapping.targetField.toUpperCase().includes("DATE") ||
        fieldMapping.targetField.toUpperCase().includes("FEC_"))
    ) {
      logger.warn(
        `Campo fecha ${fieldMapping.targetField} es null, usando GETDATE() automáticamente`
      );
      return { value: "GETDATE()", isDirectSql: true };
    }

    // Manejar valores SQL directos
    const isDirectSql =
      typeof value === "string" &&
      (value.includes("GETDATE()") ||
        value.includes("NEWID()") ||
        value.includes("@@"));

    // Log detallado final para campos de promoción
    if (fieldMapping.isPromotionField) {
      logger.info(
        `Campo promoción final: ${
          fieldMapping.targetField
        } = ${value} (tipo: ${typeof value})`
      );
    } else {
      logger.debug(
        `Valor final para ${
          fieldMapping.targetField
        }: ${value} (tipo: ${typeof value})`
      );
    }

    return {
      value,
      isDirectSql,
      fieldName: fieldMapping.targetField,
      success: true,
    };
  }

  // ===============================
  // 5. MÉTODOS DE CONSECUTIVOS
  // ===============================

  /**
   * Configura consecutivos centralizados para el mapping
   * @param {Object} mapping - Configuración de mapping
   * @param {string} mappingId - ID del mapping
   * @returns {Promise<Object>} - Configuración de consecutivos
   */
  async setupCentralizedConsecutives(mapping, mappingId) {
    logger.info(
      `🔍 Verificando sistema de consecutivos para mapping ${mappingId}`
    );

    let useCentralized = false;
    let consecutiveId = null;

    if (!mapping.consecutiveConfig?.enabled) {
      logger.info(
        `❌ Consecutivos deshabilitados en la configuración del mapping`
      );
      return { useCentralized, consecutiveId };
    }

    try {
      // Verificar configuración explícita
      if (
        mapping.consecutiveConfig.useCentralizedSystem &&
        mapping.consecutiveConfig.selectedCentralizedConsecutive
      ) {
        const consecutive = await ConsecutiveService.getConsecutiveById(
          mapping.consecutiveConfig.selectedCentralizedConsecutive
        );
        if (consecutive && consecutive.active) {
          useCentralized = true;
          consecutiveId =
            mapping.consecutiveConfig.selectedCentralizedConsecutive;
          logger.info(
            `✅ Usando consecutivo centralizado configurado: ${consecutiveId}`
          );
        }
      }

      // Si no hay configuración explícita, buscar asignados automáticamente
      if (!useCentralized) {
        const assignedConsecutives =
          await ConsecutiveService.getConsecutivesByEntity(
            "mapping",
            mappingId
          );
        if (assignedConsecutives && assignedConsecutives.length > 0) {
          useCentralized = true;
          consecutiveId = assignedConsecutives[0]._id;
          logger.info(
            `✅ Usando consecutivo centralizado asignado: ${consecutiveId}`
          );
        }
      }

      if (!useCentralized) {
        logger.info(
          `❌ No se encontraron consecutivos centralizados para ${mappingId}. Usando sistema local.`
        );
      }

      return { useCentralized, consecutiveId };
    } catch (error) {
      logger.warn(
        `❌ Error al verificar consecutivos centralizados: ${error.message}`
      );
      return { useCentralized: false, consecutiveId: null };
    }
  }

  /**
   * Genera consecutivo para un documento específico
   * @param {Object} mapping - Configuración de mapping
   * @param {string} documentId - ID del documento
   * @param {boolean} useCentralized - Si usar consecutivos centralizados
   * @param {string} centralizedId - ID del consecutivo centralizado
   * @returns {Promise<Object>} - Consecutivo generado
   */
  async generateConsecutiveForDocument(
    mapping,
    documentId,
    useCentralized,
    centralizedId
  ) {
    logger.info(`🔍 Generando consecutivo para documento ${documentId}`);

    if (useCentralized && centralizedId) {
      try {
        const reservation = await ConsecutiveService.reserveConsecutiveValues(
          centralizedId,
          1,
          { segment: null },
          { id: mapping._id.toString(), name: "mapping" }
        );

        const consecutive = {
          value: reservation.values[0].numeric,
          formatted: reservation.values[0].formatted,
          isCentralized: true,
          reservationId: reservation.reservationId,
        };

        logger.info(
          `✅ Consecutivo centralizado reservado: ${consecutive.formatted}`
        );
        return consecutive;
      } catch (error) {
        logger.error(
          `❌ Error generando consecutivo centralizado: ${error.message}`
        );
        throw error;
      }
    } else {
      try {
        const consecutive = await this.generateLocalConsecutive(mapping);
        logger.info(`✅ Consecutivo local generado: ${consecutive?.formatted}`);
        return consecutive;
      } catch (error) {
        logger.error(`❌ Error generando consecutivo local: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Genera un consecutivo local
   * @param {Object} mapping - Configuración de mapping
   * @returns {Promise<Object>} - Consecutivo local generado
   */
  async generateLocalConsecutive(mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return null;
    }

    const nextValue = (consecutiveConfig.lastValue || 0) + 1;
    let formatted = nextValue.toString();

    if (consecutiveConfig.pattern) {
      formatted = consecutiveConfig.pattern
        .replace(/{PREFIX}/g, consecutiveConfig.prefix || "")
        .replace(/{VALUE:(\d+)}/g, (match, digits) =>
          nextValue.toString().padStart(parseInt(digits), "0")
        )
        .replace(/{VALUE}/g, nextValue.toString())
        .replace(/{YEAR}/g, new Date().getFullYear().toString())
        .replace(
          /{MONTH}/g,
          (new Date().getMonth() + 1).toString().padStart(2, "0")
        )
        .replace(/{DAY}/g, new Date().getDate().toString().padStart(2, "0"));
    } else {
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
   * Verifica si un campo es un campo de consecutivo
   * @param {Object} fieldMapping - Configuración del campo
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si es campo de consecutivo
   */
  isConsecutiveField(fieldMapping, mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return false;
    }

    // Verificar si es el campo general para encabezado
    if (fieldMapping.targetField === consecutiveConfig.fieldName) {
      return true;
    }

    // Verificar si es el campo para detalle
    if (fieldMapping.targetField === consecutiveConfig.detailFieldName) {
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
   * @param {Object} fieldMapping - Configuración del campo
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {boolean} isDetailTable - Si es tabla de detalle
   * @returns {*} - Valor del consecutivo
   */
  getConsecutiveValue(fieldMapping, currentConsecutive, isDetailTable) {
    return currentConsecutive.formatted;
  }

  // ===============================
  // 6. MÉTODOS DE LOOKUP Y VALIDACIÓN
  // ===============================

  /**
   * Verifica si una tabla tiene campos de lookup
   * @param {Object} tableConfig - Configuración de la tabla
   * @returns {boolean} - Si tiene campos de lookup
   */
  hasLookupFields(tableConfig) {
    return (
      tableConfig.fieldMappings &&
      tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)
    );
  }

  /**
   * Ejecuta lookup en la base de datos destino
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} sourceData - Datos origen
   * @param {Object} targetConnection - Conexión destino
   * @returns {Promise<Object>} - Resultados del lookup
   */
  async executeLookupInTarget(
    tableConfig,
    sourceData,
    targetConnection,
    headerData = null
  ) {
    try {
      logger.info(
        `Realizando consultas de lookup en BD destino para tabla ${tableConfig.name}`
      );

      const lookupResults = {};
      const failedLookups = [];

      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        return { results: {}, success: true };
      }

      for (const fieldMapping of lookupFields) {
        try {
          const params = {};

          if (
            fieldMapping.lookupParams &&
            fieldMapping.lookupParams.length > 0
          ) {
            let allParamsAvailable = true;

            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                continue;
              }

              // MEJORA: Buscar en múltiples fuentes de datos
              let paramValue = null;

              // 1. Buscar primero en datos actuales (detalle o encabezado)
              if (sourceData[param.sourceField] !== undefined) {
                paramValue = sourceData[param.sourceField];
                logger.debug(
                  `Param ${param.paramName} encontrado en sourceData: ${paramValue}`
                );
              }
              // 2. Si no se encuentra y hay headerData, buscar allí
              else if (
                headerData &&
                headerData[param.sourceField] !== undefined
              ) {
                paramValue = headerData[param.sourceField];
                logger.debug(
                  `Param ${param.paramName} encontrado en headerData: ${paramValue}`
                );
              }

              // Aplicar eliminación de prefijo si está configurado
              if (
                param.removePrefix &&
                paramValue &&
                typeof paramValue === "string"
              ) {
                const originalValue = paramValue;
                paramValue = paramValue.replace(
                  new RegExp(`^${param.removePrefix}`),
                  ""
                );
                logger.debug(
                  `Prefijo removido: "${originalValue}" -> "${paramValue}"`
                );
              }

              if (paramValue === null || paramValue === undefined) {
                if (param.required !== false) {
                  logger.warn(
                    `Parámetro requerido faltante: ${param.sourceField} para ${param.paramName}`
                  );
                  allParamsAvailable = false;
                  break;
                }
              } else {
                params[param.paramName] = paramValue;
              }
            }

            if (!allParamsAvailable) {
              if (fieldMapping.failIfNotFound) {
                failedLookups.push({
                  field: fieldMapping.targetField,
                  error: "Parámetros requeridos faltantes",
                  isCritical: true,
                });
                continue;
              } else {
                lookupResults[fieldMapping.targetField] =
                  fieldMapping.defaultValue || null;
                logger.debug(
                  `Usando defaultValue para ${fieldMapping.targetField}: ${fieldMapping.defaultValue}`
                );
                continue;
              }
            }
          }

          // Ejecutar consulta con debugging mejorado
          logger.debug(`Ejecutando lookup para ${fieldMapping.targetField}:`);
          logger.debug(`Query: ${fieldMapping.lookupQuery}`);
          logger.debug(`Params: ${JSON.stringify(params)}`);

          const result = await SqlService.query(
            targetConnection,
            fieldMapping.lookupQuery,
            params
          );

          if (result.recordset && result.recordset.length > 0) {
            const lookupValue = Object.values(result.recordset[0])[0];
            lookupResults[fieldMapping.targetField] = lookupValue;
            logger.info(
              `Lookup exitoso para ${fieldMapping.targetField}: ${lookupValue}`
            );
          } else {
            logger.warn(
              `No se encontraron resultados para lookup ${fieldMapping.targetField}`
            );

            if (fieldMapping.failIfNotFound) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: "No se encontraron resultados",
                isCritical: true,
              });
            } else {
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
            }
          }
        } catch (fieldError) {
          logger.error(
            `Error en lookup ${fieldMapping.targetField}: ${fieldError.message}`
          );
          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: fieldError.message,
              isCritical: true,
            });
          } else {
            lookupResults[fieldMapping.targetField] =
              fieldMapping.defaultValue || null;
          }
        }
      }

      // Verificar fallos críticos
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
   * Verifica si una tabla tiene campos de lookup configurados
   * @param {Object} tableConfig - Configuración de la tabla
   * @returns {boolean} - True si tiene campos de lookup
   */
  hasLookupFields(tableConfig) {
    return (
      tableConfig.fieldMappings &&
      tableConfig.fieldMappings.some(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      )
    );
  }

  /**
   * Procesa un documento individual de forma simple
   * @param {Object} document - Documento a procesar
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connections - Conexiones a las BD
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentSimple(document, mapping, connections) {
    const startTime = Date.now();
    logger.info(
      `Iniciando procesamiento de documento ID: ${document.id || "N/A"}`
    );

    try {
      // Validar configuración de mapping
      if (!mapping || !mapping.tables || mapping.tables.length === 0) {
        throw new Error("Configuración de mapping inválida o vacía");
      }

      // Validar conexiones
      await this.validateConnections(connections);

      const results = {
        success: true,
        processedTables: [],
        errors: [],
        warnings: [],
        documentId: document.id,
        processingTime: 0,
      };

      // Procesar cada tabla configurada
      for (const tableConfig of mapping.tables) {
        try {
          logger.info(
            `Procesando tabla: ${tableConfig.name} (${tableConfig.type})`
          );

          const tableResult = await this.processTable(
            tableConfig,
            document,
            mapping,
            connections
          );

          if (tableResult.success) {
            results.processedTables.push({
              tableName: tableConfig.name,
              recordsProcessed: tableResult.recordsProcessed || 0,
              operation: tableResult.operation || "insert",
            });
            logger.info(
              `Tabla ${tableConfig.name} procesada exitosamente: ${
                tableResult.recordsProcessed || 0
              } registros`
            );
          } else {
            results.errors.push({
              table: tableConfig.name,
              error: tableResult.error || "Error desconocido",
            });
            logger.error(
              `Error procesando tabla ${tableConfig.name}: ${tableResult.error}`
            );

            // Si la tabla es crítica, fallar todo el proceso
            if (tableConfig.required || tableConfig.isCritical) {
              results.success = false;
              throw new Error(
                `Error crítico en tabla ${tableConfig.name}: ${tableResult.error}`
              );
            }
          }
        } catch (tableError) {
          const errorMsg = `Error en tabla ${tableConfig.name}: ${tableError.message}`;
          logger.error(errorMsg);

          results.errors.push({
            table: tableConfig.name,
            error: tableError.message,
          });

          // Si la tabla es crítica, fallar todo el proceso
          if (tableConfig.required || tableConfig.isCritical) {
            results.success = false;
            throw tableError;
          }
        }
      }

      // Calcular tiempo de procesamiento
      results.processingTime = Date.now() - startTime;

      logger.info(
        `Documento procesado ${
          results.success ? "exitosamente" : "con errores"
        } en ${results.processingTime}ms`
      );

      return results;
    } catch (error) {
      logger.error(
        `Error general procesando documento: ${error.message}`,
        error
      );

      return {
        success: false,
        error: error.message,
        documentId: document.id,
        processingTime: Date.now() - startTime,
        processedTables: [],
        errors: [
          {
            table: "general",
            error: error.message,
          },
        ],
      };
    }
  }

  /**
   * Valida que las conexiones estén disponibles y sean válidas
   * @param {Object} connections - Objeto con las conexiones
   * @throws {Error} - Si las conexiones no son válidas
   */
  async validateConnections(connections) {
    try {
      if (!connections) {
        throw new Error("Objeto de conexiones es null o undefined");
      }

      // Validar conexión de origen
      if (!connections.source) {
        throw new Error("Conexión de origen no disponible");
      }

      // Validar conexión de destino
      if (!connections.target) {
        throw new Error("Conexión de destino no disponible");
      }

      // Probar conexiones con una consulta simple
      try {
        await SqlService.query(connections.source, "SELECT 1 as test");
        logger.debug("Conexión de origen validada exitosamente");
      } catch (sourceError) {
        throw new Error(
          `Error validando conexión de origen: ${sourceError.message}`
        );
      }

      try {
        await SqlService.query(connections.target, "SELECT 1 as test");
        logger.debug("Conexión de destino validada exitosamente");
      } catch (targetError) {
        throw new Error(
          `Error validando conexión de destino: ${targetError.message}`
        );
      }

      logger.info("Todas las conexiones validadas exitosamente");
    } catch (error) {
      logger.error(`Error validando conexiones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene los datos de origen para una tabla específica
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} document - Documento fuente
   * @param {Object} sourceConnection - Conexión a BD origen
   * @returns {Promise<Array>} - Array de datos de origen
   */
  async getSourceData(tableConfig, document, sourceConnection) {
    try {
      logger.info(`Obteniendo datos de origen para tabla: ${tableConfig.name}`);

      // Si tiene query personalizada, usarla
      if (tableConfig.sourceQuery) {
        const params = this.extractQueryParams(
          tableConfig.sourceQuery,
          document
        );
        const result = await SqlService.query(
          sourceConnection,
          tableConfig.sourceQuery,
          params
        );

        logger.info(
          `Query personalizada ejecutada: ${
            result.recordset?.length || 0
          } registros`
        );
        return result.recordset || [];
      }

      // Si es una tabla de encabezado, retornar el documento como array
      if (tableConfig.type === "header") {
        logger.info("Tabla de encabezado detectada, usando documento directo");
        return [document];
      }

      // Si es una tabla de detalle, buscar en propiedades del documento
      if (tableConfig.type === "detail" && tableConfig.sourceProperty) {
        const detailData = document[tableConfig.sourceProperty];
        if (Array.isArray(detailData)) {
          logger.info(
            `Datos de detalle encontrados: ${detailData.length} registros`
          );
          return detailData;
        } else {
          logger.warn(
            `Propiedad ${tableConfig.sourceProperty} no es un array o no existe`
          );
          return [];
        }
      }

      // Fallback: retornar documento como array
      logger.info("Usando documento como datos de origen (fallback)");
      return [document];
    } catch (error) {
      logger.error(
        `Error obteniendo datos de origen para ${tableConfig.name}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Extrae parámetros de una query basándose en el documento
   * @param {string} query - Query SQL con parámetros
   * @param {Object} document - Documento fuente
   * @returns {Object} - Objeto con los parámetros extraídos
   */
  extractQueryParams(query, document) {
    try {
      const params = {};

      // Buscar parámetros en formato :paramName o @paramName
      const paramMatches = query.match(/[:@](\w+)/g);

      if (paramMatches) {
        paramMatches.forEach((match) => {
          const paramName = match.substring(1); // Quitar : o @
          if (document[paramName] !== undefined) {
            params[paramName] = document[paramName];
            logger.debug(
              `Parámetro extraído: ${paramName} = ${document[paramName]}`
            );
          } else {
            logger.warn(`Parámetro ${paramName} no encontrado en documento`);
          }
        });
      }

      return params;
    } catch (error) {
      logger.error(`Error extrayendo parámetros de query: ${error.message}`);
      return {};
    }
  }

  /**
   * Aplica reglas de negocio específicas antes de la inserción
   * @param {Object} processedData - Datos ya procesados
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} originalData - Datos originales
   * @returns {Object} - Datos con reglas aplicadas
   */
  applyBusinessRules(processedData, tableConfig, originalData) {
    try {
      let finalData = { ...processedData };

      // Aplicar reglas de negocio si están configuradas
      if (
        tableConfig.businessRules &&
        Array.isArray(tableConfig.businessRules)
      ) {
        for (const rule of tableConfig.businessRules) {
          try {
            finalData = this.applyBusinessRule(rule, finalData, originalData);
          } catch (ruleError) {
            logger.error(
              `Error aplicando regla de negocio ${rule.name || "unnamed"}: ${
                ruleError.message
              }`
            );

            // Si la regla es crítica, lanzar error
            if (rule.critical) {
              throw ruleError;
            }
          }
        }
      }

      // Aplicar validaciones finales
      if (tableConfig.finalValidations) {
        this.validateFinalData(finalData, tableConfig.finalValidations);
      }

      return finalData;
    } catch (error) {
      logger.error(`Error aplicando reglas de negocio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplica una regla de negocio específica
   * @param {Object} rule - Regla a aplicar
   * @param {Object} data - Datos a procesar
   * @param {Object} originalData - Datos originales
   * @returns {Object} - Datos con la regla aplicada
   */
  applyBusinessRule(rule, data, originalData) {
    try {
      switch (rule.type) {
        case "conditional_value":
          return this.applyConditionalValue(rule, data, originalData);

        case "calculated_field":
          return this.applyCalculatedField(rule, data, originalData);

        case "data_validation":
          return this.applyDataValidation(rule, data, originalData);

        case "field_transformation":
          return this.applyFieldTransformation(rule, data, originalData);

        default:
          logger.warn(`Tipo de regla de negocio desconocido: ${rule.type}`);
          return data;
      }
    } catch (error) {
      logger.error(`Error aplicando regla ${rule.type}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplica valor condicional basado en condiciones
   * @param {Object} rule - Regla de valor condicional
   * @param {Object} data - Datos a procesar
   * @param {Object} originalData - Datos originales
   * @returns {Object} - Datos modificados
   */
  applyConditionalValue(rule, data, originalData) {
    try {
      const { conditions, targetField, value, elseValue } = rule;

      let conditionMet = true;

      if (conditions && Array.isArray(conditions)) {
        conditionMet = conditions.every((condition) => {
          const fieldValue =
            data[condition.field] || originalData[condition.field];

          switch (condition.operator) {
            case "equals":
              return fieldValue == condition.value;
            case "not_equals":
              return fieldValue != condition.value;
            case "greater_than":
              return parseFloat(fieldValue) > parseFloat(condition.value);
            case "less_than":
              return parseFloat(fieldValue) < parseFloat(condition.value);
            case "contains":
              return String(fieldValue).includes(condition.value);
            case "not_null":
              return fieldValue !== null && fieldValue !== undefined;
            case "is_null":
              return fieldValue === null || fieldValue === undefined;
            default:
              return true;
          }
        });
      }

      if (conditionMet && targetField) {
        data[targetField] = value;
        logger.debug(`Valor condicional aplicado: ${targetField} = ${value}`);
      } else if (!conditionMet && elseValue !== undefined && targetField) {
        data[targetField] = elseValue;
        logger.debug(
          `Valor alternativo aplicado: ${targetField} = ${elseValue}`
        );
      }

      return data;
    } catch (error) {
      logger.error(`Error en valor condicional: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplica campo calculado
   * @param {Object} rule - Regla de campo calculado
   * @param {Object} data - Datos a procesar
   * @param {Object} originalData - Datos originales
   * @returns {Object} - Datos modificados
   */
  applyCalculatedField(rule, data, originalData) {
    try {
      const { targetField, calculation, sourceFields } = rule;

      if (!targetField || !calculation) {
        throw new Error("Configuración incompleta para campo calculado");
      }

      let result = null;

      switch (calculation.type) {
        case "sum":
          result = sourceFields.reduce((sum, field) => {
            const value = parseFloat(data[field] || originalData[field] || 0);
            return sum + (isNaN(value) ? 0 : value);
          }, 0);
          break;

        case "multiply":
          result = sourceFields.reduce((product, field) => {
            const value = parseFloat(data[field] || originalData[field] || 1);
            return product * (isNaN(value) ? 1 : value);
          }, 1);
          break;

        case "percentage":
          if (sourceFields.length >= 2) {
            const value1 = parseFloat(
              data[sourceFields[0]] || originalData[sourceFields[0]] || 0
            );
            const value2 = parseFloat(
              data[sourceFields[1]] || originalData[sourceFields[1]] || 0
            );
            result = value2 !== 0 ? (value1 / value2) * 100 : 0;
          }
          break;

        case "concat":
          result = sourceFields
            .map((field) => String(data[field] || originalData[field] || ""))
            .join(calculation.separator || "");
          break;

        default:
          logger.warn(`Tipo de cálculo desconocido: ${calculation.type}`);
          return data;
      }

      data[targetField] = result;
      logger.debug(`Campo calculado: ${targetField} = ${result}`);

      return data;
    } catch (error) {
      logger.error(`Error en campo calculado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Valida datos finales antes de insertar
   * @param {Object} data - Datos a validar
   * @param {Object} validations - Validaciones a aplicar
   * @throws {Error} - Si la validación falla
   */
  validateFinalData(data, validations) {
    try {
      if (!validations || !Array.isArray(validations)) {
        return;
      }

      for (const validation of validations) {
        const { field, rule, message } = validation;
        const value = data[field];

        switch (rule.type) {
          case "required":
            if (value === null || value === undefined || value === "") {
              throw new Error(message || `Campo ${field} es requerido`);
            }
            break;

          case "min_value":
            if (parseFloat(value) < rule.value) {
              throw new Error(
                message || `Campo ${field} debe ser mayor a ${rule.value}`
              );
            }
            break;

          case "max_value":
            if (parseFloat(value) > rule.value) {
              throw new Error(
                message || `Campo ${field} debe ser menor a ${rule.value}`
              );
            }
            break;

          case "pattern":
            if (
              typeof value === "string" &&
              !new RegExp(rule.pattern).test(value)
            ) {
              throw new Error(
                message || `Campo ${field} no cumple el patrón requerido`
              );
            }
            break;

          default:
            logger.warn(`Tipo de validación desconocido: ${rule.type}`);
        }
      }

      logger.debug("Validaciones finales completadas exitosamente");
    } catch (error) {
      logger.error(`Error en validaciones finales: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DynamicTransferService;