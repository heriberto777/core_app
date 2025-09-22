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

      // 🎁 DETECCIÓN AUTOMÁTICA: Verificar si las promociones están habilitadas
      const shouldUsePromotions = this.shouldUsePromotions(mapping);
      if (shouldUsePromotions) {
        logger.info(
          `🎁 DETECCIÓN AUTOMÁTICA: Promociones habilitadas para mapping ${mapping.name}`
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

      // 5. Establecer conexiones
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
          `🎁 DETECCIÓN AUTOMÁTICA: Promociones habilitadas para documento ${documentId}`
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
              `🎁 Procesando detalles CON promociones para documento ${documentId}`
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
      `🎁 Procesando ${
        orderedDetailTables.length
      } tablas de detalle CON PROMOCIONES en orden: ${orderedDetailTables
        .map((t) => t.name)
        .join(" -> ")}`
    );

    let totalPromotionsApplied = false;

    for (const detailConfig of orderedDetailTables) {
      logger.error(
        `🎁 🔍 ============ PROCESANDO TABLA: ${detailConfig.name} ============`
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
        `🎁 🔍 DATOS OBTENIDOS DE getDetailDataWithPromotions: ${detailsData.length} registros`
      );

      // 🔍 VERIFICAR SI REALMENTE SE APLICARON PROMOCIONES
      const hasPromotions = detailsData.some(
        (row) => row._PROMOTION_TYPE && row._PROMOTION_TYPE !== "NONE"
      );

      logger.error(`🎁 🔍 ¿Tiene promociones aplicadas? ${hasPromotions}`);

      if (hasPromotions) {
        totalPromotionsApplied = true;
        logger.info(
          `✅ Promociones detectadas y aplicadas automáticamente en tabla ${detailConfig.name}`
        );

        // ✅ LOG DETALLADO DE PROMOCIONES
        const bonusLines = detailsData.filter((row) => row._IS_BONUS_LINE);
        const triggerLines = detailsData.filter((row) => row._IS_TRIGGER_LINE);
        const normalLines = detailsData.filter((row) => row._IS_NORMAL_LINE);

        logger.error(`🎁 🔍 RESUMEN DE PROMOCIONES EN ${detailConfig.name}:`);
        logger.error(`🎁 🔍   Líneas bonificación: ${bonusLines.length}`);
        logger.error(`🎁 🔍   Líneas trigger: ${triggerLines.length}`);
        logger.error(`🎁 🔍   Líneas normales: ${normalLines.length}`);

        // Log específico de cada bonificación
        bonusLines.forEach((line, index) => {
          logger.error(`🎁 🔍 BONIFICACIÓN ${index + 1}:`);
          logger.error(
            `🎁 🔍   Línea: ${line.NUM_LN} | Artículo: ${line.COD_ART}`
          );
          logger.error(
            `🎁 🔍   PEDIDO_LINEA_BONIF: ${line.PEDIDO_LINEA_BONIF}`
          );
          logger.error(
            `🎁 🔍   CANTIDAD_BONIFICAD: ${line.CANTIDAD_BONIFICAD}`
          );
          logger.error(`🎁 🔍   CANTIDAD_PEDIDA: ${line.CANTIDAD_PEDIDA}`);
          logger.error(
            `🎁 🔍   CANTIDAD_A_FACTURA: ${line.CANTIDAD_A_FACTURA}`
          );
          logger.error(`🎁 🔍   _PROMOTION_TYPE: ${line._PROMOTION_TYPE}`);
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

      logger.error(`🎁 🔍 DATOS ANTES DE PROCESAR CADA REGISTRO:`);
      detailsData.forEach((record, index) => {
        logger.error(`🎁 🔍 ---- REGISTRO ${index + 1} ----`);
        logger.error(
          `🎁 🔍   Datos completos: ${JSON.stringify(record, null, 2)}`
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
          `🎁 🔍   Campos promoción encontrados: ${
            foundPromotionFields.join(", ") || "NINGUNO"
          }`
        );
      });

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${
          detailConfig.name
        } ${hasPromotions ? "CON PROMOCIONES" : "sin promociones"}`
      );

      // ✅ PROCESAR CADA REGISTRO CON MAPPINGS AUTOMÁTICOS
      for (
        let recordIndex = 0;
        recordIndex < detailsData.length;
        recordIndex++
      ) {
        const record = detailsData[recordIndex];

        logger.error(
          `🎁 🔍 ============ PROCESANDO REGISTRO ${recordIndex + 1}/${
            detailsData.length
          } ============`
        );
        logger.error(
          `🎁 🔍 Datos que van a processTable: ${JSON.stringify(
            record,
            null,
            2
          )}`
        );

        try {
          await this.processTable(
            detailConfig,
            sourceData,
            record, // ⬅️ ESTE DEBE CONTENER LOS CAMPOS DE PROMOCIÓN
            targetConnection,
            currentConsecutive,
            mapping,
            documentId,
            columnLengthCache,
            true // isDetailTable
          );

          logger.error(
            `🎁 🔍 ✅ Registro ${recordIndex + 1} procesado exitosamente`
          );
        } catch (recordError) {
          logger.error(
            `🎁 🔍 ❌ Error procesando registro ${recordIndex + 1}: ${
              recordError.message
            }`
          );

          // Log del registro problemático
          logger.error(
            `🎁 🔍 Registro problemático: ${JSON.stringify(record, null, 2)}`
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
      `🎁 🔍 ============ RESUMEN FINAL DE PROCESAMIENTO ============`
    );
    logger.error(`🎁 🔍 Total tablas procesadas: ${processedTables.length}`);
    logger.error(
      `🎁 🔍 Promociones aplicadas: ${totalPromotionsApplied ? "SÍ" : "NO"}`
    );
    logger.error(`🎁 🔍 Tablas procesadas: ${processedTables.join(", ")}`);

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
          `🎁 Campo promoción detectado para procesar: ${field.sourceField} -> ${field.targetField} (${field.description})`
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
              `🎁 Campo promoción encontrado: ${sourceField} -> ${alternative} = ${sourceData[alternative]}`
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
        `🎁 Obteniendo datos con promociones para documento ${documentId}`
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
          `🎁 ✅ Usando configuración de campos detectada automáticamente`
        );

        // Limpiar el campo temporal de los datos
        detailData.forEach((record) => {
          delete record._DETECTED_PROMOTION_CONFIG;
        });
      } else {
        fieldConfigToUse = PromotionProcessor.getFieldConfiguration(mapping);
        logger.info(`🎁 Usando configuración de campos por defecto`);
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
          `🎁 ❌ CAMPOS DE PROMOCIÓN FALTANTES: ${missingFields.join(", ")}`
        );
        logger.error(
          `🎁 Campos disponibles: ${Object.keys(firstRecord).join(", ")}`
        );
        throw new Error(
          `Faltan campos requeridos para promociones: ${missingFields.join(
            ", "
          )}`
        );
      }

      logger.info(`🎁 ✅ Todos los campos de promoción están presentes`);

      // ✅ PASO 5: APLICAR CONVERSIONES DE UNIDADES PRIMERO (CRÍTICO)
      logger.info(
        `🔧 Aplicando conversiones de unidades ANTES de procesar promociones`
      );

      let dataWithConversions = detailData.map((row) => {
        const originalRow = { ...row };
        const convertedRow = PromotionProcessor.applyQuantityConversions(
          originalRow,
          fieldConfigToUse
        );

        // Marcar que ya fue convertido para evitar doble conversión
        convertedRow._conversionApplied = true;

        // Log detallado de conversiones aplicadas
        const quantityFields = [
          "CNT_MAX",
          "CANTIDAD_BONIFICA",
          "CANTIDAD_BONIFICADA",
        ];
        quantityFields.forEach((field) => {
          if (originalRow[field] !== convertedRow[field]) {
            logger.info(
              `🔧 Conversión aplicada en ${field}: ${originalRow[field]} → ${convertedRow[field]}`
            );
          }
        });

        return convertedRow;
      });

      logger.info(
        `🔧 ✅ Conversiones aplicadas a ${dataWithConversions.length} registros`
      );

      // ✅ PASO 6: PROCESAR PROMOCIONES CON DATOS YA CONVERTIDOS
      logger.info(
        `🎁 Procesando promociones con datos convertidos para documento ${documentId}`
      );

      const processedData = PromotionProcessor.processPromotionsWithConfig(
        dataWithConversions, // ← Datos ya convertidos
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
        `🎁 ✅ Procesamiento completado: ${regularLines.length} regulares, ${bonusLines.length} bonificaciones, ${triggerLines.length} líneas trigger`
      );

      // ✅ PASO 9: Verificación crítica de cantidades
      finalData.forEach((line, index) => {
        if (line._IS_BONUS_LINE) {
          logger.debug(`🎁 Línea bonificación ${index + 1}:`);
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
      `🔧 🔍 ============ INICIANDO processTable: ${tableConfig.name} ============`
    );
    logger.error(`🔧 🔍 isDetailTable: ${isDetailTable}`);
    logger.error(
      `🔧 🔍 dataForProcessing claves: ${Object.keys(dataForProcessing).join(
        ", "
      )}`
    );

    // 🎁 MEJORA: VERIFICAR SI HAY DATOS DE PROMOCIONES CON TU LÓGICA MEJORADA
    const hasPromotionData = this.detectPromotionData(dataForProcessing);
    logger.error(`🔧 🔍 ¿Detecta promociones? ${hasPromotionData}`);

    // Validar configuración de campos
    if (!tableConfig.fieldMappings || tableConfig.fieldMappings.length === 0) {
      logger.warn(
        `⚠️ Tabla ${tableConfig.name} no tiene fieldMappings definidos`
      );
      return;
    }

    // ✅ LÓGICA MEJORADA PARA PROMOCIONES - MANTENIENDO TU ESTRUCTURA
    let allFieldMappings = [];

    if (hasPromotionData) {
      logger.error(
        `🎁 ✅ DATOS DE PROMOCIONES DETECTADOS en tabla ${tableConfig.name}`
      );

      // ✅ 1. MARCAR CAMPOS YA PROCESADOS DEL MAPPING ORIGINAL (TU LÓGICA)
      tableConfig.fieldMappings.forEach((fm) => {
        if (fm.targetField) {
          processedFieldNames.add(fm.targetField.toLowerCase());
          logger.error(
            `🎁 🔍   Original: ${fm.sourceField || "null"} -> ${fm.targetField}`
          );
        }
      });

      // ✅ 2. GENERAR MAPPINGS AUTOMÁTICOS USANDO TU MÉTODO MEJORADO
      const promotionFieldMappings = this.generatePromotionFieldMappings(
        dataForProcessing,
        mapping,
        processedFieldNames
      );

      logger.error(
        `🎁 🔍 MAPPINGS AUTOMÁTICOS GENERADOS: ${promotionFieldMappings.length}`
      );
      promotionFieldMappings.forEach((pm) => {
        logger.error(
          `🎁 🔍   Auto: ${pm.sourceField} -> ${pm.targetField} = ${
            dataForProcessing[pm.sourceField]
          } (${pm.description})`
        );
      });

      // ✅ 3. VALIDAR QUE SE GENERARON CAMPOS DE PROMOCIÓN
      const promotionFieldsGenerated = promotionFieldMappings.filter(
        (pm) => pm.isPromotionField
      );

      if (promotionFieldsGenerated.length === 0) {
        logger.error(
          `🎁 ❌ ERROR: Se detectaron promociones pero no se generaron mappings de promoción`
        );
        logger.error(
          `🎁 Datos disponibles: ${Object.keys(dataForProcessing).join(", ")}`
        );
      } else {
        logger.info(
          `🎁 ✅ ${promotionFieldsGenerated.length} campos de promoción listos para procesamiento`
        );
      }

      // ✅ 4. INTEGRAR MAPPINGS (ORIGINALES + AUTOMÁTICOS)
      allFieldMappings = [
        ...tableConfig.fieldMappings,
        ...promotionFieldMappings,
      ];

      logger.error(
        `🎁 🔍 MAPPINGS TOTALES: ${tableConfig.fieldMappings.length} originales + ${promotionFieldMappings.length} automáticos = ${allFieldMappings.length}`
      );

      // ✅ 5. RESET PROCESSED FIELD NAMES PARA INCLUIR LOS NUEVOS
      processedFieldNames.clear();
    } else {
      // ✅ FLUJO NORMAL SIN PROMOCIONES
      allFieldMappings = tableConfig.fieldMappings;
      logger.error(
        `🔧 🔍 ❌ NO se detectaron promociones, usando ${allFieldMappings.length} mappings normales`
      );
    }

    // Ejecutar lookup si está configurado (tu lógica existente)
    let lookupResults = {};
    if (this.hasLookupFields(tableConfig)) {
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
    }

    logger.error(
      `🔧 🔍 PROCESANDO ${allFieldMappings.length} campos del mapping para tabla ${tableConfig.name}`
    );

    // ✅ PROCESAR TODOS LOS CAMPOS (originales + automáticos)
    for (
      let fieldIndex = 0;
      fieldIndex < allFieldMappings.length;
      fieldIndex++
    ) {
      const fieldMapping = allFieldMappings[fieldIndex];

      if (!fieldMapping.targetField) {
        logger.warn(
          `⚠️ Campo sin targetField definido en tabla ${tableConfig.name}`
        );
        continue;
      }

      const targetFieldLower = fieldMapping.targetField.toLowerCase();
      if (processedFieldNames.has(targetFieldLower)) {
        logger.warn(
          `⚠️ Campo duplicado: ${fieldMapping.targetField} en tabla ${tableConfig.name}`
        );
        continue;
      }

      logger.error(
        `🔧 🔍 ---- PROCESANDO CAMPO ${fieldIndex + 1}/${
          allFieldMappings.length
        } ----`
      );
      logger.error(
        `🔧 🔍 Campo: ${fieldMapping.sourceField || "(automático)"} -> ${
          fieldMapping.targetField
        }`
      );
      logger.error(
        `🔧 🔍 Es promoción: ${fieldMapping.isPromotionField || false}`
      );

      try {
        // ✅ USAR TU MÉTODO processField MEJORADO
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
              `🔧 🔍 ✅ Campo SQL directo: ${fieldMapping.targetField} = ${processedField.value}`
            );
          } else {
            // ✅ INCLUIR TODOS LOS CAMPOS, INCLUSO NULL SI NO ES REQUERIDO
            if (
              processedField.value !== null ||
              fieldMapping.isRequired ||
              fieldMapping.isPromotionField
            ) {
              targetData[fieldMapping.targetField] = processedField.value;
              targetFields.push(fieldMapping.targetField);
              targetValues.push(`@${fieldMapping.targetField}`);

              // ✅ LOG ESPECÍFICO PARA CAMPOS DE PROMOCIÓN
              if (fieldMapping.isPromotionField) {
                logger.error(
                  `🎁 ✅ CAMPO PROMOCIÓN PROCESADO: ${fieldMapping.targetField} = ${processedField.value}`
                );
              } else {
                logger.error(
                  `🔧 🔍 ✅ Campo normal procesado: ${fieldMapping.targetField} = ${processedField.value}`
                );
              }
            } else {
              logger.error(
                `🔧 🔍 ❌ Campo omitido (valor null y no requerido): ${fieldMapping.targetField}`
              );
            }
          }
        } else {
          logger.error(
            `🔧 🔍 ❌ Campo no procesado: ${fieldMapping.targetField}`
          );
        }
      } catch (fieldError) {
        logger.error(
          `❌ Error procesando campo ${fieldMapping.targetField}: ${fieldError.message}`
        );
        if (fieldMapping.isRequired) {
          throw fieldError;
        }
      }
    }

    // 🔧 LOG FINAL DE CAMPOS A INSERTAR CON VALIDACIÓN DE PROMOCIONES
    logger.error(
      `🔧 🔍 ============ RESUMEN FINAL PARA ${tableConfig.targetTable} ============`
    );
    logger.error(`🔧 🔍 Total campos a insertar: ${targetFields.length}`);

    // Identificar y destacar campos de promoción
    const promotionFieldsInTarget = targetFields.filter(
      (field) =>
        field.includes("CANTIDAD_") ||
        field.includes("PEDIDO_LINEA_BONIF") ||
        field.includes("BONIF")
    );

    if (promotionFieldsInTarget.length > 0) {
      logger.error(
        `🎁 🔍 CAMPOS DE PROMOCIÓN A INSERTAR: ${promotionFieldsInTarget.join(
          ", "
        )}`
      );
    } else if (hasPromotionData) {
      logger.error(`🎁 🔍 ❌ NO HAY CAMPOS DE PROMOCIÓN PARA INSERTAR`);
    }

    // ✅ VERIFICACIÓN CRÍTICA: Asegurar coherencia entre detección y inserción
    if (hasPromotionData && promotionFieldsInTarget.length === 0) {
      logger.error(
        `🎁 ❌ ERROR CRÍTICO: Se detectaron promociones pero NO hay campos de promoción en la inserción`
      );
      logger.error(
        `🎁 Datos de promoción disponibles: ${Object.keys(dataForProcessing)
          .filter((k) => k.includes("BONIF") || k.includes("CANTIDAD_"))
          .join(", ")}`
      );
      logger.error(`🎁 TargetFields generados: ${targetFields.join(", ")}`);
    }

    // Validación final
    if (targetFields.length === 0) {
      logger.warn(
        `⚠️ No hay campos válidos para insertar en tabla ${tableConfig.targetTable}`
      );
      return;
    }

    // Ejecutar inserción usando tu método existente
    logger.error(
      `🚀 🔍 EJECUTANDO INSERCIÓN EN ${tableConfig.targetTable} con ${targetFields.length} campos`
    );

    await this.executeInsert(
      tableConfig.targetTable,
      targetFields,
      targetValues,
      targetData,
      directSqlFields,
      targetConnection
    );

    logger.error(`✅ 🔍 Tabla ${tableConfig.name} procesada exitosamente`);
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
      `🔧 Procesando campo: ${fieldMapping.sourceField || "(automático)"} -> ${
        fieldMapping.targetField
      }`
    );

    // ✅ LÓGICA AUTOMÁTICA PARA CAMPOS DE PROMOCIONES MEJORADA
    const isPromotionField = this.isPromotionTargetField(
      fieldMapping.targetField
    );

    if (isPromotionField && !fieldMapping.sourceField) {
      logger.info(
        `🎁 CAMPO DE PROMOCIÓN DETECTADO: ${fieldMapping.targetField}`
      );

      // ✅ USAR NUEVO MÉTODO MEJORADO DEL PROMOTIONPROCESSOR
      const promotionValue = this.findPromotionValue(
        fieldMapping.targetField,
        sourceData,
        mapping
      );

      if (promotionValue !== null && promotionValue !== undefined) {
        logger.info(
          `🎁 ✅ VALOR ENCONTRADO AUTOMÁTICAMENTE: ${fieldMapping.targetField} = ${promotionValue}`
        );
        value = promotionValue;
      } else {
        logger.debug(
          `🎁 No se encontró valor para ${fieldMapping.targetField}, usando defaultValue`
        );
        value =
          fieldMapping.defaultValue === "NULL"
            ? null
            : fieldMapping.defaultValue;
      }
    }
    // ✅ LÓGICA PARA CAMPOS DE PROMOCIÓN CON sourceField DEFINIDO MEJORADA
    else if (fieldMapping.isPromotionField && fieldMapping.sourceField) {
      logger.info(
        `🎁 CAMPO DE PROMOCIÓN CON SOURCE: ${fieldMapping.sourceField} -> ${fieldMapping.targetField}`
      );

      // ✅ USAR NUEVO MÉTODO MEJORADO PARA BUSCAR VALORES
      value = this.findFieldValueInData(
        fieldMapping.sourceField,
        sourceData,
        mapping
      );

      if (value !== null && value !== undefined) {
        logger.info(
          `🎁 ✅ VALOR PROMOCIÓN ENCONTRADO: ${fieldMapping.targetField} = ${value}`
        );
      } else {
        logger.debug(
          `🎁 No se encontró valor para ${fieldMapping.sourceField}, usando defaultValue`
        );
        value =
          fieldMapping.defaultValue === "NULL"
            ? null
            : fieldMapping.defaultValue;
      }
    }
    // ✅ LÓGICA NORMAL MANTENIENDO TU ESTRUCTURA EXISTENTE
    else {
      try {
        // 1. Verificar si tiene sourceField definido
        if (fieldMapping.sourceField) {
          // 🔥 MANTENER TU CORRECCIÓN CRÍTICA: Extraer valor real de objetos de configuración
          let sourceValue = sourceData[fieldMapping.sourceField];

          // ✅ DETECTAR Y CORREGIR OBJETOS DE CONFIGURACIÓN
          if (typeof sourceValue === "object" && sourceValue !== null) {
            // Si es un objeto de configuración con sourceField, extraer el valor real
            if (sourceValue.sourceField) {
              logger.warn(
                `🔧 ⚠️ Objeto de configuración detectado para ${fieldMapping.targetField}`
              );
              const realSourceField = sourceValue.sourceField;
              const realValue = sourceData[realSourceField];
              logger.debug(
                `🔧 Extrayendo valor real: ${realSourceField} = ${realValue}`
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

        // 🔥 4. USAR TUS MÉTODOS EXISTENTES DE CONSECUTIVOS
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
            `🔢 Consecutivo asignado usando tu sistema centralizado: ${value}`
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

    // ✅ VALIDACIONES Y TRANSFORMACIONES FINALES

    // Verificar campo requerido
    if (
      fieldMapping.isRequired &&
      (value === null || value === undefined || value === "")
    ) {
      throw new Error(`Campo requerido ${fieldMapping.targetField} está vacío`);
    }

    // 🔥 CAMBIO MÍNIMO: Conversión universal de unidades
    if (value !== null) {
      // ✅ NUEVA LÓGICA: Aplicar conversión universal a campos de cantidad
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
              `🔄 Conversión universal: ${fieldMapping.targetField}: ${originalValue} -> ${value}`
            );
          }
        } catch (conversionError) {
          logger.error(
            `Error en conversión universal para ${fieldMapping.targetField}: ${conversionError.message}`
          );
          // Mantener valor original si falla la conversión
        }
      }
      // ✅ MANTENER conversión específica configurada en fieldMapping (para casos especiales)
      else if (
        fieldMapping.unitConversion &&
        fieldMapping.unitConversion.enabled
      ) {
        try {
          // ✅ VERIFICAR QUE EL VALOR SEA REALMENTE NUMÉRICO
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

          // ✅ APLICAR TU MÉTODO EXISTENTE DE CONVERSIÓN
          const originalValue = value;
          value = await this.applyUnitConversion(
            sourceData,
            fieldMapping,
            value
          );

          if (value !== originalValue) {
            logger.debug(
              `🔧 Conversión específica aplicada: ${originalValue} -> ${value}`
            );
          }
        } catch (conversionError) {
          logger.error(
            `Error en conversión de unidades para ${fieldMapping.targetField}: ${conversionError.message}`
          );

          // ✅ USAR VALOR POR DEFECTO EN CASO DE ERROR
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

    // Aplicar mapeo de valores si está configurado (tu lógica existente)
    if (fieldMapping.valueMappings && fieldMapping.valueMappings.length > 0) {
      const mappedValue = this.applyValueMapping(
        fieldMapping.valueMappings,
        value
      );
      if (mappedValue !== null) {
        value = mappedValue;
      }
    }

    // Remover prefijo si está configurado (tu lógica existente)
    if (fieldMapping.removePrefix && value && typeof value === "string") {
      value = value.replace(new RegExp(`^${fieldMapping.removePrefix}`), "");
    }

    // ✅ USAR TU LÓGICA EXISTENTE PARA LONGITUD MÁXIMA
    if (
      value &&
      typeof value === "string" &&
      fieldMapping.maxLength &&
      value.length > fieldMapping.maxLength
    ) {
      const originalValue = value;
      value = value.substring(0, fieldMapping.maxLength);
      logger.warn(
        `✂️ Valor truncado en ${fieldMapping.targetField}: "${originalValue}" -> "${value}"`
      );
    }

    // ✅ TU VALIDACIÓN AUTOMÁTICA EXISTENTE PARA CAMPOS DE FECHA
    if (
      (value === null || value === undefined) &&
      fieldMapping.targetField &&
      (fieldMapping.targetField.toUpperCase().includes("FECHA") ||
        fieldMapping.targetField.toUpperCase().includes("DATE") ||
        fieldMapping.targetField.toUpperCase().includes("FEC_"))
    ) {
      logger.warn(
        `⚠️ Campo fecha ${fieldMapping.targetField} es null, usando GETDATE() automáticamente`
      );
      return { value: "GETDATE()", isDirectSql: true };
    }

    // Manejar valores SQL directos (tu lógica existente)
    const isDirectSql =
      typeof value === "string" &&
      (value.includes("GETDATE()") ||
        value.includes("NEWID()") ||
        value.includes("@@"));

    // ✅ LOG DETALLADO FINAL PARA CAMPOS DE PROMOCIÓN
    if (fieldMapping.isPromotionField) {
      logger.info(
        `🎁 CAMPO PROMOCIÓN FINAL: ${
          fieldMapping.targetField
        } = ${value} (tipo: ${typeof value})`
      );
    } else {
      logger.debug(
        `🔧 Valor final para ${
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
  // En DynamicTransferService.js - método executeLookupInTarget
  async executeLookupInTarget(tableConfig, sourceData, targetConnection) {
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

          // ✅ CORREGIR: Validar parámetros requeridos correctamente
          if (
            fieldMapping.lookupParams &&
            fieldMapping.lookupParams.length > 0
          ) {
            let allParamsAvailable = true;

            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                continue;
              }

              let paramValue = sourceData[param.sourceField];

              // Aplicar eliminación de prefijo
              if (
                param.removePrefix &&
                paramValue &&
                typeof paramValue === "string"
              ) {
                paramValue = paramValue.replace(
                  new RegExp(`^${param.removePrefix}`),
                  ""
                );
              }

              if (paramValue === null || paramValue === undefined) {
                if (param.required !== false) {
                  // Si no está marcado como opcional
                  allParamsAvailable = false;
                  break;
                }
              } else {
                params[param.paramName] = paramValue;
              }
            }

            // Si faltan parámetros requeridos
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
                continue;
              }
            }
          }

          // Ejecutar consulta
          const result = await SqlService.query(
            targetConnection,
            fieldMapping.lookupQuery,
            params
          );

          if (result.recordset && result.recordset.length > 0) {
            const lookupValue = Object.values(result.recordset[0])[0];
            lookupResults[fieldMapping.targetField] = lookupValue;
            logger.debug(
              `✅ Lookup exitoso para ${fieldMapping.targetField}: ${lookupValue}`
            );
          } else {
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
        return {
          results: {},
          success: false,
          failedFields: criticalFailures,
        };
      }

      return {
        results: lookupResults,
        success: true,
        failedFields: failedLookups,
      };
    } catch (error) {
      logger.error(`Error general en lookup: ${error.message}`);
      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extrae parámetros de una consulta SQL
   * @param {string} query - Consulta SQL
   * @returns {Array} - Lista de parámetros
   */
  extractParametersFromQuery(query) {
    const paramRegex = /@(\w+)/g;
    const params = [];
    let match;

    while ((match = paramRegex.exec(query)) !== null) {
      if (!params.includes(match[1])) {
        params.push(match[1]);
      }
    }

    return params;
  }

  // ===============================
  // 7. MÉTODOS DE INSERCIÓN Y BASE DE DATOS
  // ===============================

  /**
   * Ejecuta inserción en la base de datos - CON VISUALIZACIÓN COMPLETA JSON
   * @param {string} targetTable - Tabla destino
   * @param {Array} targetFields - Campos a insertar
   * @param {Array} targetValues - Valores a insertar
   * @param {Object} targetData - Datos para parámetros
   * @param {Set} directSqlFields - Campos con SQL directo
   * @param {Object} targetConnection - Conexión destino
   */
  async executeInsert(
    targetTable,
    targetFields,
    targetValues,
    targetData,
    directSqlFields,
    targetConnection
  ) {
    try {
      // ✅ 1. MOSTRAR DATOS COMPLETOS EN JSON ANTES DE PROCESAR
      logger.error(
        `🔍 ============ DATOS RECIBIDOS PARA INSERCIÓN ============`
      );
      logger.error(`🔍 Tabla destino: ${targetTable}`);
      logger.error(
        `🔍 CAMPOS RECIBIDOS (${targetFields.length}): ${JSON.stringify(
          targetFields,
          null,
          2
        )}`
      );
      logger.error(
        `🔍 VALUES RECIBIDOS (${targetValues.length}): ${JSON.stringify(
          targetValues,
          null,
          2
        )}`
      );
      logger.error(
        `🔍 TARGET DATA RECIBIDO: ${JSON.stringify(targetData, null, 2)}`
      );
      logger.error(
        `🔍 DIRECT SQL FIELDS: ${JSON.stringify(
          Array.from(directSqlFields),
          null,
          2
        )}`
      );

      // ✅ 2. VALIDAR Y LIMPIAR DATOS
      const validatedParams = {};
      const problematicFields = [];

      Object.keys(targetData).forEach((key) => {
        const value = targetData[key];

        if (typeof value === "object" && value !== null) {
          if (value.sourceField || value.targetField || value.unitConversion) {
            problematicFields.push({
              field: key,
              type: "configuration_object",
              value: value,
            });

            if (value.defaultValue !== undefined) {
              validatedParams[key] = value.defaultValue;
            }
          } else {
            validatedParams[key] = value;
          }
        } else {
          validatedParams[key] = value;
        }
      });

      if (problematicFields.length > 0) {
        logger.error(
          `🔍 ❌ OBJETOS DE CONFIGURACIÓN PROBLEMÁTICOS: ${JSON.stringify(
            problematicFields,
            null,
            2
          )}`
        );
        throw new Error(
          `Campos contienen objetos de configuración: ${problematicFields
            .map((pf) => pf.field)
            .join(", ")}`
        );
      }

      // ✅ 3. CONSTRUIR DATOS FINALES PARA INSERCIÓN
      const finalInsertData = {
        tabla: targetTable,
        campos: [],
        valores: [],
        parametros: {},
        camposSQL: [],
        query: "",
        resumenCampos: {
          total: 0,
          promocion: 0,
          regulares: 0,
          sqlDirecto: 0,
        },
      };

      // Procesar cada campo
      targetFields.forEach((field, index) => {
        const fieldInfo = {
          nombre: field,
          tipo: "",
          valor: null,
          esPromocion:
            field.includes("BONIF") ||
            field.includes("CANTIDAD_") ||
            field.includes("PEDIDO_LINEA"),
          esSqlDirecto: directSqlFields.has(field),
        };

        if (directSqlFields.has(field)) {
          // Campo SQL directo
          fieldInfo.tipo = "SQL_DIRECTO";
          fieldInfo.valor = targetValues[index];
          finalInsertData.campos.push(field);
          finalInsertData.valores.push(targetValues[index]);
          finalInsertData.camposSQL.push(field);
          finalInsertData.resumenCampos.sqlDirecto++;
        } else if (validatedParams.hasOwnProperty(field)) {
          // Campo con parámetro
          fieldInfo.tipo = "PARAMETRO";
          fieldInfo.valor = validatedParams[field];
          finalInsertData.campos.push(field);
          finalInsertData.valores.push(`@${field}`);
          finalInsertData.parametros[field] = validatedParams[field];
        } else {
          // Campo omitido
          fieldInfo.tipo = "OMITIDO";
          fieldInfo.valor = null;
        }

        if (fieldInfo.tipo !== "OMITIDO") {
          finalInsertData.resumenCampos.total++;
          if (fieldInfo.esPromocion) {
            finalInsertData.resumenCampos.promocion++;
          } else {
            finalInsertData.resumenCampos.regulares++;
          }
        }
      });

      // Construir query
      finalInsertData.query = `INSERT INTO ${targetTable} (${finalInsertData.campos.join(
        ", "
      )}) VALUES (${finalInsertData.valores.join(", ")})`;

      // ✅ 4. MOSTRAR TODOS LOS VALORES A INSERTAR EN FORMATO JSON SÚPER CLARO
      logger.error(
        `🎁 ============ ESTOS SON LOS VALORES A INSERTAR YA CON PROMOCIONES INCLUIDA ============`
      );
      logger.error(
        `🎁 DATOS COMPLETOS PARA INSERCIÓN: ${JSON.stringify(
          finalInsertData,
          null,
          2
        )}`
      );

      // ✅ 5. MOSTRAR RESUMEN EJECUTIVO
      logger.error(`🎁 ============ RESUMEN EJECUTIVO ============`);
      logger.error(`🎁 Tabla destino: ${finalInsertData.tabla}`);
      logger.error(
        `🎁 Total campos a insertar: ${finalInsertData.resumenCampos.total}`
      );
      logger.error(
        `🎁 Campos de PROMOCIÓN: ${finalInsertData.resumenCampos.promocion}`
      );
      logger.error(
        `🎁 Campos REGULARES: ${finalInsertData.resumenCampos.regulares}`
      );
      logger.error(
        `🎁 Campos SQL directo: ${finalInsertData.resumenCampos.sqlDirecto}`
      );

      // ✅ 6. MOSTRAR ESPECÍFICAMENTE LOS CAMPOS DE PROMOCIÓN
      const camposPromocion = [];
      Object.keys(finalInsertData.parametros).forEach((campo) => {
        if (
          campo.includes("BONIF") ||
          campo.includes("CANTIDAD_") ||
          campo.includes("PEDIDO_LINEA")
        ) {
          camposPromocion.push({
            campo: campo,
            valor: finalInsertData.parametros[campo],
            tipo: typeof finalInsertData.parametros[campo],
          });
        }
      });

      if (camposPromocion.length > 0) {
        logger.error(
          `🎁 ============ CAMPOS DE PROMOCIÓN INCLUIDOS ============`
        );
        logger.error(
          `🎁 CAMPOS DE PROMOCIÓN (${camposPromocion.length}): ${JSON.stringify(
            camposPromocion,
            null,
            2
          )}`
        );
      } else {
        logger.error(`🎁 ❌ NO HAY CAMPOS DE PROMOCIÓN EN LA INSERCIÓN`);
      }

      // ✅ 7. MOSTRAR QUERY Y PARÁMETROS FINALES
      logger.error(`🎁 ============ QUERY Y PARÁMETROS FINALES ============`);
      logger.error(`🎁 QUERY SQL: ${finalInsertData.query}`);
      logger.error(
        `🎁 PARÁMETROS: ${JSON.stringify(finalInsertData.parametros, null, 2)}`
      );

      // ✅ 8. VALIDACIÓN FINAL
      if (finalInsertData.campos.length === 0) {
        throw new Error(
          `No hay campos válidos para insertar en ${targetTable}`
        );
      }

      // ✅ 9. EJECUTAR INSERCIÓN
      logger.error(`🚀 EJECUTANDO INSERCIÓN...`);

      const startTime = Date.now();
      const result = await SqlService.query(
        targetConnection,
        finalInsertData.query,
        finalInsertData.parametros
      );
      const executionTime = Date.now() - startTime;

      // ✅ 10. MOSTRAR RESULTADO FINAL
      const resultadoFinal = {
        estado: "ÉXITO",
        tabla: targetTable,
        tiempoEjecucion: `${executionTime}ms`,
        filasAfectadas: result.rowsAffected ? result.rowsAffected[0] : "N/A",
        camposInsertados: finalInsertData.campos,
        camposPromocionInsertados: camposPromocion.map((cp) => cp.campo),
        totalCampos: finalInsertData.resumenCampos.total,
        camposPromocion: finalInsertData.resumenCampos.promocion,
      };

      logger.error(`🎁 ============ RESULTADO FINAL DE INSERCIÓN ============`);
      logger.error(
        `🎁 RESULTADO COMPLETO: ${JSON.stringify(resultadoFinal, null, 2)}`
      );

      if (finalInsertData.resumenCampos.promocion > 0) {
        logger.error(`🎁 ✅ ¡INSERCIÓN CON PROMOCIONES EXITOSA!`);
        logger.error(
          `🎁 Se insertaron ${finalInsertData.resumenCampos.promocion} campos de promoción en ${targetTable}`
        );
      } else {
        logger.error(`📋 ✅ Inserción estándar exitosa (sin promociones)`);
      }

      return result;
    } catch (error) {
      logger.error(`🎁 ============ ERROR EN INSERCIÓN ============`);
      const errorInfo = {
        estado: "ERROR",
        tabla: targetTable,
        mensaje: error.message,
        stack: error.stack,
        datosProblematicos: {
          targetFields: targetFields,
          targetValues: targetValues,
          targetData: targetData,
        },
      };

      logger.error(`🎁 ERROR COMPLETO: ${JSON.stringify(errorInfo, null, 2)}`);

      throw error;
    }
  }

  /**
   * Obtiene las columnas de una tabla específica
   * @param {Object} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<Array>} - Lista de columnas
   */
  async getTableColumns(connection, tableName) {
    try {
      // Separar esquema y tabla
      let schema = null;
      let table = tableName;

      if (tableName.includes(".")) {
        const parts = tableName.split(".");
        schema = parts[0];
        table = parts[1];
      }

      // Limpiar nombres de corchetes
      if (schema) {
        schema = schema.replace(/\[|\]/g, "");
      }
      table = table.replace(/\[|\]/g, "");

      let query;
      let params;

      if (schema) {
        query = `
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
          ORDER BY ORDINAL_POSITION
        `;
        params = { schema, table };
      } else {
        query = `
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, TABLE_SCHEMA
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @table
          ORDER BY TABLE_SCHEMA, ORDINAL_POSITION
        `;
        params = { table };
      }

      const result = await SqlService.query(connection, query, params);

      if (!result.recordset || result.recordset.length === 0) {
        // Intentar con esquemas comunes
        const commonSchemas = ["dbo", "CATELLI", "sys"];
        for (const testSchema of commonSchemas) {
          try {
            const testResult = await SqlService.query(
              connection,
              `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
               FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
               ORDER BY ORDINAL_POSITION`,
              { schema: testSchema, table }
            );

            if (testResult.recordset && testResult.recordset.length > 0) {
              logger.info(
                `✅ Tabla encontrada en esquema: ${testSchema}.${table}`
              );
              return testResult.recordset;
            }
          } catch (testError) {
            // Continuar con el siguiente esquema
          }
        }
        logger.warn(`No se encontraron columnas para ${tableName}`);
        return [];
      }

      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo columnas de ${tableName}: ${error.message}`
      );
      return [];
    }
  }

  // ===============================
  // 8. MÉTODOS AUXILIARES Y UTILIDADES
  // ===============================

  /**
   * Establece conexiones con los servidores origen y destino
   * @param {Object} mapping - Configuración de mapping
   * @returns {Promise<Object>} - Conexiones establecidas
   */
  async establishConnections(mapping) {
    const sourceConnection = await ConnectionService.getConnection(
      mapping.sourceServer
    );
    if (!sourceConnection) {
      throw new Error(
        `No se pudo conectar al servidor origen: ${mapping.sourceServer}`
      );
    }

    const targetConnection = await ConnectionService.getConnection(
      mapping.targetServer
    );
    if (!targetConnection) {
      throw new Error(
        `No se pudo conectar al servidor destino: ${mapping.targetServer}`
      );
    }

    logger.info(`Conexiones establecidas correctamente`);
    return { source: sourceConnection, target: targetConnection };
  }

  /**
   * Maneja el resultado de procesamiento de un documento
   * @param {Object} docResult - Resultado del documento
   * @param {string} documentId - ID del documento
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {boolean} useCentralized - Si usa consecutivos centralizados
   * @param {string} centralizedId - ID del consecutivo centralizado
   * @param {Object} results - Resultados acumulados
   * @param {Array} successfulDocuments - Documentos exitosos
   * @param {Array} failedDocuments - Documentos fallidos
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} sourceConnection - Conexión origen
   * @returns {Promise<void>}
   */
  async handleDocumentResult(
    docResult,
    documentId,
    currentConsecutive,
    useCentralized,
    centralizedId,
    results,
    successfulDocuments,
    failedDocuments,
    mapping,
    sourceConnection
  ) {
    // Confirmar o cancelar reserva de consecutivo centralizado
    if (
      useCentralized &&
      currentConsecutive &&
      currentConsecutive.reservationId
    ) {
      if (docResult.success) {
        await ConsecutiveService.commitReservation(
          centralizedId,
          currentConsecutive.reservationId,
          [
            {
              numeric: currentConsecutive.value,
              formatted: currentConsecutive.formatted,
            },
          ]
        );
      } else {
        await ConsecutiveService.cancelReservation(
          centralizedId,
          currentConsecutive.reservationId
        );
      }
    }

    // Procesar resultados
    if (docResult.success) {
      successfulDocuments.push(documentId);
      results.processed++;

      if (docResult.promotionsApplied) {
        results.promotionsProcessed++;
        logger.info(
          `✅ Promociones aplicadas automáticamente en documento ${documentId}`
        );
      }

      if (!results.byType[docResult.documentType]) {
        results.byType[docResult.documentType] = { processed: 0, failed: 0 };
      }
      results.byType[docResult.documentType].processed++;

      if (docResult.consecutiveUsed) {
        results.consecutivesUsed.push({
          documentId,
          consecutive: docResult.consecutiveUsed,
        });
      }

      // Marcado individual si está configurado
      if (
        mapping.markProcessedStrategy === "individual" &&
        mapping.markProcessedField
      ) {
        try {
          await this.markDocumentsAsProcessed(
            [documentId],
            mapping,
            sourceConnection,
            true
          );
        } catch (markError) {
          logger.warn(
            `⚠️ Error al marcar documento ${documentId}: ${markError.message}`
          );
        }
      }
    } else {
      results.failed++;
      failedDocuments.push(documentId);

      if (docResult.documentType && !results.byType[docResult.documentType]) {
        results.byType[docResult.documentType] = { processed: 0, failed: 0 };
      }
      if (docResult.documentType) {
        results.byType[docResult.documentType].failed++;
      }
    }

    results.details.push({ documentId, ...docResult });

    logger.info(
      `Documento ${documentId} procesado: ${
        docResult.success ? "✅ ÉXITO" : "❌ ERROR"
      }${docResult.promotionsApplied ? " (con promociones automáticas)" : ""}${
        currentConsecutive
          ? ` (consecutivo: ${currentConsecutive.formatted})`
          : ""
      }`
    );
  }

  /**
   * Maneja errores de procesamiento de documentos
   * @param {Error} error - Error ocurrido
   * @param {string} documentId - ID del documento
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {boolean} useCentralized - Si usa consecutivos centralizados
   * @param {string} centralizedId - ID del consecutivo centralizado
   * @param {Object} results - Resultados acumulados
   * @param {Array} failedDocuments - Documentos fallidos
   * @returns {Promise<void>}
   */
  async handleDocumentError(
    error,
    documentId,
    currentConsecutive,
    useCentralized,
    centralizedId,
    results,
    failedDocuments
  ) {
    failedDocuments.push(documentId);
    results.failed++;

    results.details.push({
      documentId,
      success: false,
      error: error.message,
      errorDetails: error.stack,
    });

    logger.error(`❌ Error al procesar documento ${documentId}:`, error);

    // Cancelar reserva si hubo error
    if (
      useCentralized &&
      currentConsecutive &&
      currentConsecutive.reservationId
    ) {
      try {
        await ConsecutiveService.cancelReservation(
          centralizedId,
          currentConsecutive.reservationId
        );
      } catch (cancelError) {
        logger.error(`❌ Error cancelando reserva: ${cancelError.message}`);
      }
    }
  }

  /**
   * Ejecuta procesos post-procesamiento
   * @param {Object} mapping - Configuración de mapping
   * @param {Array} successfulDocuments - Documentos exitosos
   * @param {Array} failedDocuments - Documentos fallidos
   * @param {boolean} hasErrors - Si hubo errores
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} results - Resultados acumulados
   * @returns {Promise<void>}
   */
  async executePostProcessing(
    mapping,
    successfulDocuments,
    failedDocuments,
    hasErrors,
    sourceConnection,
    results
  ) {
    // Marcado masivo si está configurado
    if (
      mapping.markProcessedStrategy === "batch" &&
      mapping.markProcessedField &&
      successfulDocuments.length > 0
    ) {
      try {
        logger.info(
          `Marcando ${successfulDocuments.length} documentos exitosos como procesados (modo batch)`
        );
        await this.markDocumentsAsProcessed(
          successfulDocuments,
          mapping,
          sourceConnection,
          true
        );
        logger.info("✅ Marcado masivo completado exitosamente");
      } catch (markError) {
        logger.warn(`⚠️ Error en marcado masivo: ${markError.message}`);
      }
    }

    // Rollback si está configurado y hay errores
    if (
      hasErrors &&
      mapping.markProcessedConfig?.allowRollback &&
      successfulDocuments.length > 0
    ) {
      try {
        logger.warn(
          `Ejecutando rollback para ${successfulDocuments.length} documentos debido a errores`
        );
        await this.markDocumentsAsProcessed(
          successfulDocuments,
          mapping,
          sourceConnection,
          false
        );
        logger.info("✅ Rollback ejecutado exitosamente");
        results.rollbackExecuted = true;
      } catch (rollbackError) {
        logger.error(`❌ Error en rollback: ${rollbackError.message}`);
        results.rollbackError = rollbackError.message;
      }
    }
  }

  /**
   * Finaliza el procesamiento y actualiza estadísticas
   * @param {string} executionId - ID de la ejecución
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} results - Resultados del procesamiento
   * @param {boolean} hasErrors - Si hubo errores
   * @param {boolean} useCentralized - Si usa consecutivos centralizados
   * @param {string} centralizedId - ID del consecutivo centralizado
   * @param {number} startTime - Tiempo de inicio
   * @returns {Promise<Object>} - Resultado final
   */
  async finalizationAndStats(
    executionId,
    mapping,
    results,
    hasErrors,
    useCentralized,
    centralizedId,
    startTime
  ) {
    const executionTime = Date.now() - startTime;

    // Determinar estado final
    let finalStatus = "completed";
    if (results.processed === 0 && results.failed > 0) {
      finalStatus = "failed";
    } else if (results.failed > 0) {
      finalStatus = "partial";
    }

    // Actualizar registro de ejecución
    await TaskExecution.findByIdAndUpdate(executionId, {
      status: finalStatus,
      executionTime,
      totalRecords: results.processed + results.failed,
      successfulRecords: results.processed,
      failedRecords: results.failed,
      promotionsProcessed: results.promotionsProcessed,
      useCentralizedConsecutives: useCentralized,
      centralizedConsecutiveId: centralizedId,
      details: results,
    });

    // Mensaje final
    const promotionsMessage =
      results.promotionsProcessed > 0
        ? `, promociones aplicadas automáticamente: ${results.promotionsProcessed}`
        : "";
    const consecutiveMessage = useCentralized
      ? ` (consecutivos centralizados)`
      : ` (consecutivos locales)`;

    const finalMessage = hasErrors
      ? `Procesamiento completado con errores: ${results.processed} éxitos, ${results.failed} fallos${promotionsMessage}${consecutiveMessage}`
      : `Procesamiento completado con éxito: ${results.processed} documentos procesados${promotionsMessage}${consecutiveMessage}`;

    // Actualizar tarea principal
    await TransferTask.findByIdAndUpdate(mapping.taskId, {
      status: finalStatus,
      progress: 100,
      lastExecutionDate: new Date(),
      lastExecutionResult: {
        success: !hasErrors,
        message: finalMessage,
        affectedRecords: results.processed,
        promotionsProcessed: results.promotionsProcessed,
        useCentralizedConsecutives: useCentralized,
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

    logger.info(
      `✅ Procesamiento completado: ${results.processed} éxitos, ${results.failed} fallos${promotionsMessage}${consecutiveMessage}`
    );

    return {
      status: finalStatus,
      ...results,
    };
  }

  /**
   * Maneja errores generales del procesamiento
   * @param {Error} error - Error ocurrido
   * @param {Object} signal - Señal de cancelación
   * @param {string} executionId - ID de la ejecución
   * @param {Object} mapping - Configuración de mapping
   * @param {string} cancelTaskId - ID de la tarea de cancelación
   * @param {number} timeoutId - ID del timeout
   * @param {number} startTime - Tiempo de inicio
   * @returns {Promise<Object>} - Resultado del error
   */
  async handleProcessingError(
    error,
    signal,
    executionId,
    mapping,
    cancelTaskId,
    timeoutId,
    startTime
  ) {
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

      TaskTracker.completeTask(cancelTaskId, "cancelled");

      return {
        success: false,
        message: "Tarea cancelada por el usuario",
        executionId,
      };
    }

    logger.error(`Error al procesar documentos: ${error.message}`);

    // Actualizar registros en caso de error
    if (executionId) {
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: "failed",
        executionTime: Date.now() - startTime,
        errorMessage: error.message,
      });
    }

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

    TaskTracker.completeTask(cancelTaskId, "failed");

    throw error;
  }

  /**
   * Maneja errores de procesamiento de un documento individual
   * @param {Error} error - Error ocurrido
   * @param {string} documentId - ID del documento
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Resultado del error
   */
  handleSingleDocumentError(error, documentId, currentConsecutive, mapping) {
    logger.error(`Error procesando documento ${documentId}: ${error.message}`);

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
   * Limpia recursos al final del procesamiento
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {number} timeoutId - ID del timeout
   * @returns {Promise<void>}
   */
  async cleanup(sourceConnection, targetConnection, timeoutId) {
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

    clearTimeout(timeoutId);
  }

  /**
   * Método auxiliar para recopilar todos los campos necesarios de una configuración de tabla
   * @param {Object} tableConfig - Configuración de la tabla
   * @returns {Array} - Lista de campos requeridos
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
   * @param {string} filterCondition - Condición de filtro
   * @param {string} tableAlias - Alias de la tabla
   * @returns {string} - Condición procesada
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
   * Extrae valor correcto de un objeto promoción
   * @param {Object} promotionObject - Objeto de promoción
   * @param {string} targetField - Campo destino
   * @param {string} sourceField - Campo origen
   * @returns {*} - Valor extraído o null
   */
  extractValueFromPromotionObject(promotionObject, targetField, sourceField) {
    // Mapeo de campos comunes para extraer el valor correcto
    const fieldMappings = {
      CANTIDAD_PEDIDA: ["CNT_MAX", "CANTIDAD", "QTY", "CND_MAX"],
      CANTIDAD_A_FACTURA: ["CNT_MAX", "CANTIDAD", "QTY", "CND_MAX"],
      CANTIDAD_FACTURADA: ["CNT_MAX", "CANTIDAD", "QTY", "CND_MAX"],
      CANTIDAD_BONIFICAD: ["CNT_MAX", "CANTIDAD", "QTY", "CND_MAX"],
      ARTICULO: ["COD_ART", "CODIGO_ARTICULO", "ITEM_CODE"],
      PRECIO_UNITARIO: ["MON_PRC_MN", "PRECIO", "PRICE", "UNIT_PRICE"],
      PEDIDO: ["NUM_PED", "PEDIDO_ID", "ORDER_ID"],
      LINEA_USUARIO: ["NUM_LN", "LINE_NUMBER", "LINEA"],
    };

    // Buscar campos candidatos para este target field
    const candidates = fieldMappings[targetField.toUpperCase()] || [];

    // Intentar extraer valor de campos candidatos
    for (const candidate of candidates) {
      if (
        promotionObject.hasOwnProperty(candidate) &&
        promotionObject[candidate] !== null
      ) {
        logger.debug(
          `✅ Extraído valor de objeto promoción: ${targetField} <- ${candidate} = ${promotionObject[candidate]}`
        );
        return promotionObject[candidate];
      }
    }

    // Si no encuentra candidatos específicos, buscar campos numéricos válidos para cantidades
    if (targetField.toUpperCase().includes("CANTIDAD")) {
      const numericFields = Object.keys(promotionObject).filter((key) => {
        const val = promotionObject[key];
        return (
          typeof val === "number" || (!isNaN(val) && val !== null && val !== "")
        );
      });

      if (numericFields.length > 0) {
        const preferredField =
          numericFields.find(
            (key) =>
              key.includes("CNT") ||
              key.includes("MAX") ||
              key.includes("CANTIDAD")
          ) || numericFields[0];

        logger.warn(
          `⚠️ Usando campo numérico por defecto para ${targetField}: ${preferredField} = ${promotionObject[preferredField]}`
        );
        return promotionObject[preferredField];
      }
    }

    // Para campos de texto, buscar campos string válidos
    if (typeof promotionObject[sourceField] === "string") {
      logger.debug(
        `✅ Usando valor string del campo original: ${sourceField} = ${promotionObject[sourceField]}`
      );
      return promotionObject[sourceField];
    }

    return null;
  }

  /**
   * Prepara tabla para consulta verificando existencia y estructura
   * @param {Object} mainTable - Configuración de tabla principal
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Object>} - Información de la tabla
   */
  async prepareTableForQuery(mainTable, connection) {
    let schema = "dbo";
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

    const availableColumns = columnsResult.recordset.map((c) => c.COLUMN_NAME);
    logger.info(
      `Tabla ${schema}.${tableName} encontrada con ${availableColumns.length} columnas`
    );

    return {
      fullTableName: `${schema}.${tableName}`,
      availableColumns,
      schema,
      tableName,
    };
  }

  /**
   * Construye consulta para obtener documentos
   * @param {Object} mainTable - Configuración de tabla principal
   * @param {Object} filters - Filtros para la consulta
   * @param {Object} tableInfo - Información de la tabla
   * @returns {Object} - Consulta y parámetros
   */
  buildDocumentQuery(mainTable, filters, tableInfo) {
    // Construir campos a seleccionar
    let selectFields = [];

    if (mainTable.fieldMappings && mainTable.fieldMappings.length > 0) {
      for (const mapping of mainTable.fieldMappings) {
        if (
          mapping.sourceField &&
          tableInfo.availableColumns.includes(mapping.sourceField)
        ) {
          selectFields.push(mapping.sourceField);
        }
      }
    }

    // Si no hay campos válidos, seleccionar todas las columnas disponibles
    if (selectFields.length === 0) {
      selectFields = tableInfo.availableColumns;
    }

    const limit = filters.limit || 100;
    const selectFieldsStr = selectFields.join(", ");

    let query = `SELECT TOP ${limit} ${selectFieldsStr} FROM ${tableInfo.fullTableName} WHERE 1=1`;
    const params = {};

    // Verificar y aplicar filtros de fecha
    let dateField = filters.dateField || "FEC_PED";
    const alternativeDateFields = [
      "FEC_PED",
      "FECHA_PEDIDO",
      "FECHA",
      "DATE_CREATED",
      "CREATED_DATE",
      "FEC_CREACION",
      "FEC_DOC",
      "FECHA_DOC",
    ];

    if (!tableInfo.availableColumns.includes(dateField)) {
      dateField = alternativeDateFields.find((field) =>
        tableInfo.availableColumns.includes(field)
      );
    }

    if (dateField) {
      if (filters.dateFrom) {
        query += ` AND ${dateField} >= @dateFrom`;
        params.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        query += ` AND ${dateField} <= @dateTo`;
        params.dateTo = filters.dateTo;
      }
    }

    // Filtros adicionales
    if (filters.status && tableInfo.availableColumns.includes("STATUS")) {
      query += ` AND STATUS = @status`;
      params.status = filters.status;
    }

    if (filters.processed !== undefined) {
      const processedField = filters.processedField || "PROCESSED";
      if (tableInfo.availableColumns.includes(processedField)) {
        query += ` AND ${processedField} = @processed`;
        params.processed = filters.processed;
      }
    }

    // Aplicar filtro personalizado si existe
    if (mainTable.filterCondition) {
      query += ` AND ${mainTable.filterCondition}`;
    }

    // Ordenar por clave primaria
    const primaryKey = mainTable.primaryKey || "NUM_PED";
    if (tableInfo.availableColumns.includes(primaryKey)) {
      query += ` ORDER BY ${primaryKey} DESC`;
    } else if (selectFields.length > 0) {
      query += ` ORDER BY ${selectFields[0]} DESC`;
    }

    return { query, params };
  }

  /**
   * ✅ NUEVO: Identifica si un campo es de cantidad
   * @param {string} fieldName - Nombre del campo
   * @returns {boolean}
   */
  isQuantityField(fieldName) {
    const quantityFields = [
      "CANTIDAD_PEDIDA",
      "CANTIDAD_A_FACTURA",
      "CANTIDAD_BONIFICAD",
      "CANTIDAD_BONIF",
      "CNT_MAX",
      "CANTIDAD_BONIFICACION",
      "QTY_PEDIDA",
      "QTY_BONIF",
    ];

    return quantityFields.includes(fieldName.toUpperCase());
  }

  /**
   * ✅ NUEVO: Aplica conversión universal a cualquier campo de cantidad
   * @param {Object} sourceData - Datos completos de la línea
   * @param {number} originalValue - Valor original
   * @param {string} fieldName - Nombre del campo
   * @returns {number} - Valor convertido
   */
  async applyUniversalUnitConversion(sourceData, originalValue, fieldName) {
    try {
      // Buscar Unit_Measure
      const unitMeasure =
        sourceData["Unit_Measure"] ||
        sourceData["UNIT_MEASURE"] ||
        sourceData["UNI_MED"];

      // Buscar Factor_Conversion (tu lógica actual)
      const conversionFactor =
        sourceData["Factor_Conversion"] ||
        sourceData["FACTOR_CONVERSION"] ||
        sourceData["CNT_MAX"];

      if (!unitMeasure || !conversionFactor) {
        return originalValue;
      }

      // Usar tu método existente shouldApplyUnitConversion
      if (!this.shouldApplyUnitConversion(unitMeasure, "CAJA")) {
        return originalValue;
      }

      const factor = parseFloat(conversionFactor);
      if (isNaN(factor) || factor <= 0) {
        logger.error(`Factor inválido: ${conversionFactor}`);
        return originalValue;
      }

      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        return originalValue;
      }

      // ✅ APLICAR TU LÓGICA: cantidad * factor = unidades
      const convertedValue = Math.round(numericValue * factor);

      logger.info(
        `🔄 Conversión universal: ${numericValue} ${unitMeasure} × ${factor} = ${convertedValue} UND`
      );

      return convertedValue;
    } catch (error) {
      logger.error(`Error en conversión universal: ${error.message}`);
      return originalValue;
    }
  }

  /**
   * Verifica si debe aplicarse conversión basado en la unidad de medida - VERSIÓN MEJORADA
   * @param {string} currentUnit - Unidad actual
   * @param {string} fromUnit - Unidad que requiere conversión
   * @returns {boolean}
   */
  // En DynamicTransferService.js - método shouldApplyUnitConversion MEJORADO
  shouldApplyUnitConversion(currentUnit, fromUnit) {
    try {
      if (!currentUnit || !fromUnit) {
        logger.debug(
          `Unidades faltantes: actual='${currentUnit}', configurada='${fromUnit}'`
        );
        return false;
      }

      const normalizedCurrent = String(currentUnit).toUpperCase().trim();
      const normalizedFrom = String(fromUnit).toUpperCase().trim();

      logger.debug(
        `Comparando unidades: '${normalizedCurrent}' vs '${normalizedFrom}'`
      );

      // **MAPEO COMPLETO DE UNIDADES QUE REQUIEREN CONVERSIÓN**
      const unitsRequiringConversion = {
        // Cajas y empaques
        CAJA: [
          "CAJA",
          "CAJAS",
          "CJA",
          "CJ",
          "CAJ",
          "CAJITA",
          "CJTA",
          "BOX",
          "BOXES",
        ],
        PACK: ["PACK", "PAQUETE", "PAQUETES", "PAQ", "PACKAGE", "PKG"],

        // Docenas y múltiplos
        DOCENA: ["DOCENA", "DOCENAS", "DOC", "DZ", "DOZEN"],
        MEDIA_DOCENA: ["MEDIA_DOCENA", "MEDIA_DOC", "6UND"],

        // Rollos y bobinas
        ROLLO: ["ROLLO", "ROLLOS", "RL", "ROLL", "BOBINA", "BOBINAS"],

        // Otros contenedores
        BOLSA: ["BOLSA", "BOLSAS", "SACO", "SACOS", "BAG", "BAGS"],
        DISPLAY: ["DISPLAY", "DISPLAYS", "DSP", "EXHIBIDOR"],

        // Medidas de peso que pueden venir en múltiplos
        KILO_MULTIPLE: ["KILO_X", "KG_X", "KILOS_X"], // Para casos como "KILO_X_12"
      };

      // **UNIDADES QUE NO REQUIEREN CONVERSIÓN (ya están en unidades base)**
      const unitsNotRequiringConversion = [
        "UNIDAD",
        "UNIDADES",
        "UND",
        "U",
        "UN",
        "UNIT",
        "UNITS",
        "PCS",
        "PIEZAS",
        "PZ",
        "PIEZA",
        "CADA",
        "C/U",
      ];

      // **1. VERIFICAR SI LA UNIDAD ACTUAL NO REQUIERE CONVERSIÓN**
      if (unitsNotRequiringConversion.includes(normalizedCurrent)) {
        logger.debug(
          `Unidad ${normalizedCurrent} ya está en unidades base - no requiere conversión`
        );
        return false;
      }

      // **2. VERIFICAR SI fromUnit ESTÁ EN UNIDADES QUE REQUIEREN CONVERSIÓN**
      let fromUnitRequiresConversion = false;
      let matchedGroup = null;

      for (const [group, variations] of Object.entries(
        unitsRequiringConversion
      )) {
        if (variations.includes(normalizedFrom)) {
          fromUnitRequiresConversion = true;
          matchedGroup = group;
          break;
        }
      }

      if (!fromUnitRequiresConversion) {
        logger.debug(
          `fromUnit '${normalizedFrom}' no está configurado para conversión`
        );
        return false;
      }

      // **3. VERIFICAR SI LA UNIDAD ACTUAL COINCIDE CON EL GRUPO**
      const groupVariations = unitsRequiringConversion[matchedGroup];
      const isMatch = groupVariations.includes(normalizedCurrent);

      if (isMatch) {
        logger.info(
          `✅ Conversión requerida: ${normalizedCurrent} coincide con grupo ${matchedGroup}`
        );
        return true;
      }

      // **4. VERIFICACIONES ADICIONALES MÁS FLEXIBLES**

      // Verificación por contenido parcial
      for (const variation of groupVariations) {
        if (
          normalizedCurrent.includes(variation) ||
          variation.includes(normalizedCurrent)
        ) {
          logger.info(
            `✅ Conversión requerida: ${normalizedCurrent} contiene variación ${variation}`
          );
          return true;
        }
      }

      // Verificación sin caracteres especiales
      const cleanCurrent = normalizedCurrent.replace(/[^A-Z0-9]/g, "");
      const cleanFrom = normalizedFrom.replace(/[^A-Z0-9]/g, "");

      if (cleanCurrent === cleanFrom) {
        logger.info(
          `✅ Conversión requerida: coincidencia limpia ${cleanCurrent}`
        );
        return true;
      }

      // **5. CASOS ESPECIALES DE MÚLTIPLOS**
      // Ejemplo: "CAJA_X_12", "PACK_DE_6", etc.
      const multiplePattern = /(\w+)[_\-\s]*(X|DE|OF)[_\-\s]*(\d+)/i;
      const currentMatch = normalizedCurrent.match(multiplePattern);

      if (currentMatch) {
        const baseUnit = currentMatch[1];
        const multiplier = parseInt(currentMatch[3]);

        // Verificar si la unidad base requiere conversión
        for (const [group, variations] of Object.entries(
          unitsRequiringConversion
        )) {
          if (
            variations.includes(baseUnit) &&
            variations.includes(normalizedFrom)
          ) {
            logger.info(
              `✅ Conversión requerida: múltiple detectado ${baseUnit} x ${multiplier}`
            );
            return true;
          }
        }
      }

      logger.debug(
        `❌ No se requiere conversión: ${normalizedCurrent} vs ${normalizedFrom}`
      );
      return false;
    } catch (error) {
      logger.error(`Error en verificación de unidades: ${error.message}`);
      return false;
    }
  }

  // ===============================
  // 9. MÉTODOS DE DEPENDENCIAS Y REGLAS
  // ===============================

  /**
   * Procesa dependencias de foreign key
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} sourceData - Datos origen
   * @returns {Promise<void>}
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
   * @param {Array} documentTypeRules - Reglas de tipo de documento
   * @param {Object} sourceData - Datos origen
   * @returns {string} - Tipo de documento determinado
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

  // ===============================
  // 10. MÉTODOS DE MARCADO DE DOCUMENTOS
  // ===============================

  /**
   * Marca documentos como procesados - LIMPIO sin método flag
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
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    logger.info(
      `${shouldMark ? "Marcando" : "Desmarcando"} ${
        docArray.length
      } documento(s) como procesado(s)`
    );

    try {
      // ✅ 1. VERIFICAR SI EL MARCADO ESTÁ CONFIGURADO
      if (
        !mapping.markProcessedField &&
        !mapping.markProcessedConfig?.processedField
      ) {
        logger.info(
          `📋 No hay campo de marcado configurado, omitiendo marcado`
        );
        logger.info(
          `✅ Documentos procesados exitosamente sin marcado: ${docArray.length}`
        );
        return {
          success: docArray.length,
          failed: 0,
          errors: [],
          skipped: true,
          reason: "No processed field configured",
        };
      }

      // ✅ 2. OBTENER CONFIGURACIÓN DE MARCADO DESDE MAPPING
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        logger.warn(
          "⚠️ No se encontró tabla principal para marcado, omitiendo marcado"
        );
        return { success: docArray.length, failed: 0, errors: [] };
      }

      // ✅ 3. DETERMINAR CAMPO DE MARCADO DESDE CONFIGURACIÓN
      const config = mapping.markProcessedConfig || {};
      const processedFieldName =
        mapping.markProcessedField || config.processedField || "PROCESSED"; // fallback solo si no está configurado

      logger.debug(`🔍 Campo de marcado configurado: ${processedFieldName}`);

      // ✅ 4. VERIFICAR SI LA COLUMNA CONFIGURADA EXISTE
      let hasConfiguredColumn = false;
      try {
        const columns = await this.getTableColumns(
          connection,
          mainTable.sourceTable
        );
        hasConfiguredColumn = columns.some(
          (col) =>
            col.COLUMN_NAME &&
            col.COLUMN_NAME.toUpperCase() === processedFieldName.toUpperCase()
        );

        logger.debug(
          `🔍 Verificación columna ${processedFieldName} en ${
            mainTable.sourceTable
          }: ${hasConfiguredColumn ? "EXISTE" : "NO EXISTE"}`
        );
      } catch (columnError) {
        logger.warn(
          `⚠️ Error verificando columnas en ${mainTable.sourceTable}: ${columnError.message}`
        );
        hasConfiguredColumn = false;
      }

      // ✅ 5. DECIDIR QUÉ HACER SEGÚN CONFIGURACIÓN
      if (!hasConfiguredColumn) {
        if (config.requiredForSuccess) {
          logger.error(
            `❌ Campo de marcado requerido ${processedFieldName} no existe en ${mainTable.sourceTable}`
          );
          throw new Error(
            `Campo de marcado requerido '${processedFieldName}' no encontrado en tabla ${mainTable.sourceTable}`
          );
        } else {
          logger.info(
            `⚠️ Campo de marcado ${processedFieldName} no existe en ${mainTable.sourceTable}, omitiendo marcado`
          );
          logger.info(
            `📋 Documentos procesados exitosamente sin marcado: ${docArray.length}`
          );
          return {
            success: docArray.length,
            failed: 0,
            errors: [],
            skipped: true,
            reason: `Column '${processedFieldName}' does not exist`,
          };
        }
      }

      // ✅ 6. EJECUTAR ESTRATEGIA DE MARCADO (SIN FLAG)
      const strategy = mapping.markProcessedStrategy || "individual";
      logger.info(
        `📋 Ejecutando estrategia de marcado: ${strategy} con campo ${processedFieldName}`
      );

      let result;
      switch (strategy) {
        case "individual":
          result = await this.markDocumentsIndividually(
            docArray,
            mapping,
            connection,
            shouldMark,
            config,
            processedFieldName
          );
          break;
        case "batch":
          result = await this.markDocumentsBatch(
            docArray,
            mapping,
            connection,
            shouldMark,
            config,
            processedFieldName
          );
          break;
        case "none":
          logger.info(`📋 Estrategia 'none' configurada, omitiendo marcado`);
          result = { success: docArray.length, failed: 0, errors: [] };
          break;
        default:
          logger.warn(
            `⚠️ Estrategia desconocida: ${strategy}, usando 'individual' por defecto`
          );
          result = await this.markDocumentsIndividually(
            docArray,
            mapping,
            connection,
            shouldMark,
            config,
            processedFieldName
          );
      }

      return result;
    } catch (error) {
      logger.error(
        `Error al ${shouldMark ? "marcar" : "desmarcar"} documentos: ${
          error.message
        }`
      );

      // ✅ DECIDIR SI EL ERROR ES CRÍTICO O NO
      const config = mapping.markProcessedConfig || {};
      if (config.requiredForSuccess) {
        throw error;
      } else {
        logger.warn(
          `⚠️ Continuando procesamiento a pesar del error de marcado no crítico`
        );
        return {
          success: 0,
          failed: docArray.length,
          errors: [{ error: error.message }],
          nonCritical: true,
        };
      }
    }
  }

  /**
   * Marca documentos individualmente - MÉTODO MANTENIDO
   */
  async markDocumentsIndividually(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config,
    processedFieldName
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";

    for (const documentId of documentIds) {
      try {
        let query;
        let params = { documentId };

        if (shouldMark) {
          let setClause = `${processedFieldName} = 1`;
          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }
          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        } else {
          let setClause = `${processedFieldName} = 0`;
          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }
          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        }

        await SqlService.query(connection, query, params);
        results.success++;

        logger.debug(
          `✅ Documento ${documentId} ${
            shouldMark ? "marcado" : "desmarcado"
          } exitosamente usando campo ${processedFieldName}`
        );
      } catch (error) {
        results.failed++;
        results.errors.push({ documentId, error: error.message });
        logger.error(
          `❌ Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } documento ${documentId}: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Marca documentos en lotes - MÉTODO MANTENIDO
   */
  async markDocumentsBatch(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config,
    processedFieldName
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const batchSize = config.batchSize || 100;

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
          let setClause = `${processedFieldName} = 1`;
          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }
          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        } else {
          let setClause = `${processedFieldName} = 0`;
          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }
          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        }

        await SqlService.query(connection, query, params);
        results.success += batch.length;

        logger.debug(
          `✅ Lote de ${batch.length} documentos ${
            shouldMark ? "marcados" : "desmarcados"
          } exitosamente usando campo ${processedFieldName}`
        );
      } catch (error) {
        results.failed += batch.length;
        batch.forEach((docId) => {
          results.errors.push({ documentId: docId, error: error.message });
        });
        logger.error(
          `❌ Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } lote de documentos: ${error.message}`
        );
      }
    }

    return results;
  }

  // ===============================
  // 11. MÉTODOS DE GESTIÓN DE CONFIGURACIÓN
  // ===============================

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
        mappingData.taskId = savedTask._id;
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        { new: true }
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

  // ===============================
  // 12. MÉTODOS DE VALIDACIÓN Y TESTING
  // ===============================

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
        }
      }

      // Validar configuración de promociones si está habilitada
      if (mappingData.promotionConfig && mappingData.promotionConfig.enabled) {
        const promotionErrors = this.validatePromotionConfiguration(
          mappingData.promotionConfig
        );
        errors.push(...promotionErrors);
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
   * @param {Object} promotionConfig - Configuración de promociones
   * @returns {Array} - Lista de errores
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

      results.overall =
        results.sourceConnection?.success && results.targetConnection?.success;

      return results;
    } catch (error) {
      logger.error(`Error al probar conexiones del mapeo: ${error.message}`);
      throw error;
    }
  }

  // ===============================
  // 13. MÉTODOS DE ESTADÍSTICAS Y REPORTES
  // ===============================

  /**
   * Obtiene una vista previa de los datos que se procesarían
   * @param {string} mappingId - ID del mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {number} limit - Límite de registros
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
              enabled: false,
              lastValue: 0,
            }
          : undefined,
        promotionConfig: originalMapping.promotionConfig,
        markProcessedStrategy: originalMapping.markProcessedStrategy,
        markProcessedConfig: originalMapping.markProcessedConfig,
        active: false,
      };

      const newMapping = await this.createMapping(duplicatedData);

      logger.info(`Mapeo duplicado: ${originalMapping.name} -> ${newName}`);
      return newMapping;
    } catch (error) {
      logger.error(`Error al duplicar mapeo: ${error.message}`);
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

  /**
   * 🔧 NUEVO MÉTODO: Detecta TODOS los campos de promoción disponibles en los datos
   * @param {Object} dataForProcessing - Datos a procesar
   * @param {Object} promotionFieldConfig - Configuración de campos de promoción
   * @param {Set} processedFieldNames - Nombres de campos ya procesados
   * @returns {Array} - Lista completa de campos de promoción a procesar
   */
  detectAllPromotionFieldsInData(
    dataForProcessing,
    promotionFieldConfig,
    processedFieldNames
  ) {
    const fieldsToProcess = [];

    logger.debug(`🎁 Detectando campos de promoción en datos...`);
    logger.debug(
      `🎁 Campos disponibles en datos: ${Object.keys(dataForProcessing).join(
        ", "
      )}`
    );

    // Lista COMPLETA de campos de promoción que pueden existir
    const allPromotionFields = [
      // Campos principales de promoción
      {
        sourceField: "PEDIDO_LINEA_BONIF",
        targetField: "PEDIDO_LINEA_BONIF",
        description: "Referencia línea bonificación",
      },
      {
        sourceField: "CANTIDAD_PEDIDA",
        targetField: "CANTIDAD_PEDIDA",
        description: "Cantidad pedida",
      },
      {
        sourceField: "CANTIDAD_A_FACTURA",
        targetField: "CANTIDAD_A_FACTURA",
        description: "Cantidad a facturar",
      },
      {
        sourceField: "CANTIDAD_BONIFICAD",
        targetField: "CANTIDAD_BONIFICAD",
        description: "Cantidad bonificación",
      },
      // Campos configurados en el mapping
      {
        sourceField: promotionFieldConfig.bonusLineRef,
        targetField: promotionFieldConfig.bonusLineRef,
        description: "Referencia línea bonificación (config)",
      },
      {
        sourceField: promotionFieldConfig.orderedQuantity,
        targetField: promotionFieldConfig.orderedQuantity,
        description: "Cantidad pedida (config)",
      },
      {
        sourceField: promotionFieldConfig.invoiceQuantity,
        targetField: promotionFieldConfig.invoiceQuantity,
        description: "Cantidad a facturar (config)",
      },
      {
        sourceField: promotionFieldConfig.bonusQuantity,
        targetField: promotionFieldConfig.bonusQuantity,
        description: "Cantidad bonificación (config)",
      },
      // Campos alternativos comunes
      {
        sourceField: "QTY_PEDIDA",
        targetField: "CANTIDAD_PEDIDA",
        description: "Cantidad pedida (alternativo)",
      },
      {
        sourceField: "QTY_FACTURAR",
        targetField: "CANTIDAD_A_FACTURA",
        description: "Cantidad a facturar (alternativo)",
      },
      {
        sourceField: "QTY_BONUS",
        targetField: "CANTIDAD_BONIFICAD",
        description: "Cantidad bonificación (alternativo)",
      },
      {
        sourceField: "LINEA_BONIFICACION",
        targetField: "PEDIDO_LINEA_BONIF",
        description: "Línea bonificación (alternativo)",
      },
    ];

    // Verificar cada campo de promoción posible
    for (const field of allPromotionFields) {
      // Evitar duplicados
      if (fieldsToProcess.some((f) => f.targetField === field.targetField)) {
        continue;
      }

      const targetFieldLower = field.targetField.toLowerCase();

      // Si el campo NO fue procesado ya Y existe en los datos
      if (
        !processedFieldNames.has(targetFieldLower) &&
        dataForProcessing.hasOwnProperty(field.sourceField)
      ) {
        fieldsToProcess.push(field);
        logger.debug(
          `🎁 ✅ Campo promoción detectado: ${field.sourceField} -> ${field.targetField} (${field.description})`
        );
      }
    }

    // 🔧 NUEVO: Detectar cualquier campo que comience con CANTIDAD_ o termine con _BONIF
    Object.keys(dataForProcessing).forEach((key) => {
      const isQuantityField =
        key.startsWith("CANTIDAD_") ||
        key.includes("QTY") ||
        key.includes("CANT");
      const isBonusField =
        key.includes("BONIF") || key.includes("BONUS") || key.includes("REF");

      if (
        (isQuantityField || isBonusField) &&
        !processedFieldNames.has(key.toLowerCase())
      ) {
        // Verificar que no esté ya en la lista
        if (
          !fieldsToProcess.some(
            (f) => f.sourceField === key || f.targetField === key
          )
        ) {
          fieldsToProcess.push({
            sourceField: key,
            targetField: key,
            description: `Campo promoción auto-detectado: ${key}`,
          });
          logger.debug(`🎁 🔍 Campo promoción auto-detectado: ${key}`);
        }
      }
    });

    logger.info(
      `🎁 Total de campos de promoción a procesar: ${fieldsToProcess.length}`
    );
    return fieldsToProcess;
  }

  /**
   * 🔧 NUEVO MÉTODO: Busca un valor de campo en los datos usando múltiples estrategias
   * @param {string} sourceField - Campo origen a buscar
   * @param {Object} sourceData - Datos origen
   * @param {Object} mapping - Configuración de mapping
   * @returns {*} - Valor encontrado o null
   */
  findFieldValueInData(sourceField, sourceData, mapping) {
    // 1. Buscar el campo exacto
    if (sourceData.hasOwnProperty(sourceField)) {
      logger.debug(`🔍 Campo encontrado exacto: ${sourceField}`);
      return sourceData[sourceField];
    }

    // 2. Buscar en campos de promoción alternativos
    const promotionValue = this.checkPromotionFieldAlternatives(
      sourceField,
      sourceData,
      mapping
    );
    if (promotionValue !== null) {
      logger.debug(`🎁 Campo encontrado en promociones: ${sourceField}`);
      return promotionValue;
    }

    // 3. Buscar campo case-insensitive
    const lowerSourceField = sourceField.toLowerCase();
    for (const [key, value] of Object.entries(sourceData)) {
      if (key.toLowerCase() === lowerSourceField) {
        logger.debug(
          `🔍 Campo encontrado case-insensitive: ${key} -> ${sourceField}`
        );
        return value;
      }
    }

    // 4. Buscar campos similares (sin guiones bajos, espacios, etc.)
    const normalizedSourceField = sourceField
      .replace(/[_\s-]/g, "")
      .toLowerCase();
    for (const [key, value] of Object.entries(sourceData)) {
      const normalizedKey = key.replace(/[_\s-]/g, "").toLowerCase();
      if (normalizedKey === normalizedSourceField) {
        logger.debug(
          `🔍 Campo encontrado normalizado: ${key} -> ${sourceField}`
        );
        return value;
      }
    }

    // 5. Buscar por patrones comunes
    const patterns = {
      CANTIDAD_PEDIDA: ["QTY_PEDIDA", "CANT_PEDIDA", "CNT_PED", "CANTIDAD_PED"],
      CANTIDAD_A_FACTURA: [
        "QTY_FACTURAR",
        "CANT_FACTURAR",
        "CNT_FACT",
        "CANTIDAD_FACT",
      ],
      CANTIDAD_BONIFICAD: [
        "QTY_BONUS",
        "CANT_BONIF",
        "CNT_BON",
        "CANTIDAD_BON",
      ],
      PEDIDO_LINEA_BONIF: [
        "LINEA_BONIF",
        "REF_BONIF",
        "BONIF_REF",
        "LINEA_BONUS",
      ],
    };

    const sourceFieldUpper = sourceField.toUpperCase();
    if (patterns[sourceFieldUpper]) {
      for (const pattern of patterns[sourceFieldUpper]) {
        if (sourceData.hasOwnProperty(pattern)) {
          logger.debug(
            `🔍 Campo encontrado por patrón: ${pattern} -> ${sourceField}`
          );
          return sourceData[pattern];
        }
      }
    }

    logger.debug(`❌ Campo no encontrado: ${sourceField}`);
    return null;
  }

  /**
   * 🔧 NUEVO: Detecta si hay datos de promociones en el registro
   * @param {Object} dataForProcessing - Datos a analizar
   * @returns {boolean} - Si contiene datos de promociones
   */
  detectPromotionData(dataForProcessing) {
    if (!dataForProcessing) return false;

    // Verificar indicadores directos de promociones
    const promotionIndicators = [
      "_IS_BONUS_LINE",
      "_IS_TRIGGER_LINE",
      "_PROMOTION_TYPE",
      "PEDIDO_LINEA_BONIF",
      "CANTIDAD_BONIFICAD",
    ];

    const hasDirectIndicators = promotionIndicators.some(
      (indicator) =>
        dataForProcessing.hasOwnProperty(indicator) &&
        dataForProcessing[indicator] !== null &&
        dataForProcessing[indicator] !== undefined
    );

    if (hasDirectIndicators) {
      logger.debug(`🎁 Promociones detectadas por indicadores directos`);
      return true;
    }

    return false;
  }

  /**
   * 🔧 CORREGIDO: Genera fieldMappings automáticos para campos de promoción - COMPLETO
   * @param {Object} dataForProcessing - Datos con promociones
   * @param {Object} mapping - Configuración de mapping
   * @param {Set} processedFieldNames - Campos ya procesados
   * @returns {Array} - Array COMPLETO de fieldMappings para promociones
   */
  generatePromotionFieldMappings(
    dataForProcessing,
    mapping,
    processedFieldNames
  ) {
    const promotionFieldMappings = [];

    logger.debug(`🎁 Generando mappings automáticos para promociones...`);

    // ✅ USAR CAMPOS ESENCIALES DEL NUEVO PROMOTIONPROCESSOR
    const essentialPromotionFields = [
      {
        sourceField: "PEDIDO_LINEA_BONIF",
        targetField: "PEDIDO_LINEA_BONIF",
        description: "Referencia línea bonificación",
        fieldType: "number",
        isPromotionField: true,
      },
      {
        sourceField: "CANTIDAD_BONIFICAD",
        targetField: "CANTIDAD_BONIFICAD",
        description: "Cantidad bonificación",
        fieldType: "number",
        isPromotionField: true,
      },
      {
        sourceField: "CANTIDAD_PEDIDA",
        targetField: "CANTIDAD_PEDIDA",
        description: "Cantidad pedida",
        fieldType: "number",
        isPromotionField: true,
      },
      {
        sourceField: "CANTIDAD_A_FACTURA",
        targetField: "CANTIDAD_A_FACTURA",
        description: "Cantidad a facturar",
        fieldType: "number",
        isPromotionField: true,
      },
    ];

    // ✅ USAR TU LÓGICA EXISTENTE PARA EVITAR DUPLICADOS
    for (const field of essentialPromotionFields) {
      const targetFieldLower = field.targetField.toLowerCase();

      if (
        dataForProcessing.hasOwnProperty(field.sourceField) &&
        !processedFieldNames.has(targetFieldLower)
      ) {
        promotionFieldMappings.push({
          ...field,
          isRequired: false,
        });

        processedFieldNames.add(targetFieldLower);
        logger.debug(
          `🎁 ✅ Mapping promoción generado: ${field.sourceField} -> ${field.targetField}`
        );
      }
    }

    logger.info(
      `🎁 Mappings de promoción generados: ${promotionFieldMappings.length}`
    );
    return promotionFieldMappings;
  }

  /**
   * 🎁 NUEVO: Obtiene valor de un campo de promoción desde los datos procesados
   * @param {string} targetField - Campo destino a buscar
   * @param {Object} sourceData - Datos procesados (incluye datos de promociones)
   * @param {Object} mapping - Configuración de mapping
   * @returns {*} - Valor del campo de promoción o null
   */
  getPromotionFieldValueFromData(targetField, sourceData, mapping) {
    // Lista de campos de promoción que pueden estar en los datos
    const promotionFields = [
      "PEDIDO_LINEA_BONIF",
      "CANTIDAD_BONIFICAD",
      "CANTIDAD_PEDIDA",
      "CANTIDAD_A_FACTURA",
      "CANTIDAD_A_FACTURA", // Variante
    ];

    // Obtener configuración de promociones
    const promotionConfig = this.getPromotionFieldConfiguration(mapping);

    // Agregar campos de configuración personalizada
    const configFields = [
      promotionConfig.bonusLineRef,
      promotionConfig.bonusQuantity,
      promotionConfig.orderedQuantity,
      promotionConfig.invoiceQuantity,
    ].filter((field) => field); // Filtrar campos válidos

    const allPromotionFields = [...promotionFields, ...configFields];

    // Buscar el campo exacto
    if (
      allPromotionFields.includes(targetField) &&
      sourceData.hasOwnProperty(targetField)
    ) {
      const value = sourceData[targetField];
      logger.debug(
        `🎁 Campo promoción encontrado directo: ${targetField} = ${value}`
      );
      return value;
    }

    // Buscar campos relacionados (para casos como CANTIDAD_A_FACTURA vs CANTIDAD_A_FACTURA)
    const fieldMappings = {
      CANTIDAD_A_FACTURA: [
        "CANTIDAD_A_FACTURA",
        "CNT_FACTURAR",
        "QTY_FACTURAR",
      ],
      CANTIDAD_A_FACTURA: [
        "CANTIDAD_A_FACTURA",
        "CNT_FACTURAR",
        "QTY_FACTURAR",
      ],
      PEDIDO_LINEA_BONIF: ["LINEA_BONIF", "REF_BONIF", "BONIF_REF"],
      CANTIDAD_BONIFICAD: ["QTY_BONIF", "CNT_BONIF", "CANT_BONIF"],
    };

    if (fieldMappings[targetField]) {
      for (const alternative of fieldMappings[targetField]) {
        if (sourceData.hasOwnProperty(alternative)) {
          const value = sourceData[alternative];
          logger.debug(
            `🎁 Campo promoción encontrado alternativo: ${alternative} -> ${targetField} = ${value}`
          );
          return value;
        }
      }
    }

    // Verificar campos meta de promociones (para debugging)
    if (
      sourceData._IS_BONUS_LINE ||
      sourceData._IS_TRIGGER_LINE ||
      sourceData._PROMOTION_TYPE
    ) {
      logger.debug(
        `🎁 Datos de promoción presentes pero campo ${targetField} no encontrado`
      );
      logger.debug(
        `🎁 Campos disponibles: ${Object.keys(sourceData).join(", ")}`
      );
    }

    return null;
  }

  /**
   * ✅ Determina si un campo es de promociones
   * @param {string} targetField - Campo destino
   * @returns {boolean} - Si es campo de promociones
   */
  isPromotionTargetField(targetField) {
    const promotionFields = [
      "PEDIDO_LINEA_BONIF",
      "CANTIDAD_BONIFICAD",
      "CANTIDAD_BONIF",
      "CANTIDAD_PEDIDA",
      "CANTIDAD_A_FACTURA",
      "CANTIDAD_A_FACTURA",
      "CANTIDAD_FACTURADA",
      "LINEA_BONIFICACION",
      "REF_BONIFICACION",
      "BONIFICACION_REF",
    ];

    const upperField = targetField.toUpperCase();
    const isPromotionField =
      promotionFields.includes(upperField) ||
      upperField.includes("BONIF") ||
      upperField.includes("CANTIDAD_");

    if (isPromotionField) {
      logger.debug(`🎁 Campo identificado como promoción: ${targetField}`);
    }

    return isPromotionField;
  }

  /**
   * ✅ Busca automáticamente el valor de un campo de promociones
   * @param {string} targetField - Campo destino
   * @param {Object} sourceData - Datos origen
   * @param {Object} mapping - Configuración de mapping
   * @returns {*} - Valor encontrado o null
   */
  findPromotionValue(targetField, sourceData, mapping) {
    logger.debug(`🎁 Buscando valor para campo promoción: ${targetField}`);
    logger.debug(`🎁 Datos disponibles: ${Object.keys(sourceData).join(", ")}`);

    // 1. Buscar campo exacto
    if (sourceData.hasOwnProperty(targetField)) {
      logger.info(
        `🎁 ✅ Campo encontrado exacto: ${targetField} = ${sourceData[targetField]}`
      );
      return sourceData[targetField];
    }

    // 2. Buscar usando patrones de promociones
    const promotionPatterns = {
      PEDIDO_LINEA_BONIF: [
        "PEDIDO_LINEA_BONIF",
        "LINEA_BONIFICACION",
        "REF_BONIFICACION",
        "BONIFICACION_REF",
        "LINEA_BONIF",
        "REF_BONIF",
        "BONIF_REF",
      ],
      CANTIDAD_BONIFICAD: [
        "CANTIDAD_BONIFICAD",
        "CANTIDAD_BONIF",
        "CANTIDAD_BONIFICACION",
        "QTY_BONIFICACION",
        "QTY_BONIF",
        "CANT_BONIFICACION",
        "CANT_BONIF",
        "CNT_BONIF",
      ],
      CANTIDAD_BONIF: [
        "CANTIDAD_BONIF",
        "CANTIDAD_BONIFICAD",
        "CANTIDAD_BONIFICACION",
        "QTY_BONIFICACION",
        "QTY_BONIF",
        "CANT_BONIFICACION",
        "CANT_BONIF",
        "CNT_BONIF",
      ],
      CANTIDAD_PEDIDA: [
        "CANTIDAD_PEDIDA",
        "QTY_PEDIDA",
        "CANT_PEDIDA",
        "CNT_PEDIDA",
        "CANTIDAD_PED",
        "QTY_PED",
      ],
      CANTIDAD_A_FACTURA: [
        "CANTIDAD_A_FACTURA",
        "CANTIDAD_A_FACTURA",
        "QTY_FACTURAR",
        "CANT_FACTURAR",
        "CNT_FACTURAR",
        "CANTIDAD_FACT",
        "QTY_FACT",
      ],
      CANTIDAD_A_FACTURA: [
        "CANTIDAD_A_FACTURA",
        "CANTIDAD_A_FACTURA",
        "QTY_FACTURAR",
        "CANT_FACTURAR",
        "CNT_FACTURAR",
        "CANTIDAD_FACT",
        "QTY_FACT",
      ],
    };

    const upperTargetField = targetField.toUpperCase();
    const patterns = promotionPatterns[upperTargetField] || [];

    for (const pattern of patterns) {
      if (sourceData.hasOwnProperty(pattern)) {
        logger.info(
          `🎁 ✅ Campo encontrado por patrón: ${pattern} -> ${targetField} = ${sourceData[pattern]}`
        );
        return sourceData[pattern];
      }
    }

    // 3. Buscar case-insensitive
    const lowerTargetField = targetField.toLowerCase();
    for (const [key, value] of Object.entries(sourceData)) {
      if (key.toLowerCase() === lowerTargetField) {
        logger.info(
          `🎁 ✅ Campo encontrado case-insensitive: ${key} -> ${targetField} = ${value}`
        );
        return value;
      }
    }

    // 4. Verificar campos meta de promociones
    if (sourceData._IS_BONUS_LINE || sourceData._IS_TRIGGER_LINE) {
      logger.debug(
        `🎁 Línea tiene metadatos de promoción pero no se encontró ${targetField}`
      );
      logger.debug(`🎁 Tipo de línea: ${sourceData._PROMOTION_TYPE}`);

      // Para líneas de bonificación, algunos campos deben ser null
      if (sourceData._IS_BONUS_LINE) {
        if (
          upperTargetField.includes("PEDIDA") ||
          upperTargetField.includes("FACTURA")
        ) {
          logger.debug(`🎁 Línea bonificación: ${targetField} = null`);
          return null;
        }
      }

      // Para líneas regulares, algunos campos deben ser null
      if (sourceData._IS_TRIGGER_LINE) {
        if (upperTargetField.includes("BONIF")) {
          logger.debug(`🎁 Línea trigger: ${targetField} = null`);
          return null;
        }
      }
    }

    logger.debug(`🎁 ❌ No se encontró valor para ${targetField}`);
    return null;
  }

  /**
   * ✅ Obtiene datos de detalle garantizando campos de promociones - CON DETECCIÓN AUTOMÁTICA
   * @param {Object} detailConfig - Configuración de la tabla de detalle
   * @param {Object} parentTableConfig - Configuración de la tabla padre
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} mapping - Configuración de mapping
   * @returns {Promise<Array>} - Datos de detalle con campos de promoción
   */
  async getDetailDataWithPromotionFields(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection,
    mapping
  ) {
    logger.debug(`🎁 Obteniendo datos con campos de promoción garantizados...`);

    // ✅ DETECTAR AUTOMÁTICAMENTE LOS NOMBRES CORRECTOS DE CAMPOS
    const promotionFieldConfig = await this.detectPromotionFieldNames(
      sourceConnection,
      detailConfig.sourceTable,
      mapping
    );

    // Campos requeridos para promociones (con nombres detectados)
    const requiredPromotionFields = [
      promotionFieldConfig.bonusField,
      promotionFieldConfig.referenceField,
      promotionFieldConfig.discountField,
      promotionFieldConfig.lineNumberField,
      promotionFieldConfig.articleField,
      promotionFieldConfig.quantityField, // ✅ Ahora será CNT_MAX
    ];

    logger.info(
      `🎁 Campos detectados para promociones: ${requiredPromotionFields.join(
        ", "
      )}`
    );

    if (detailConfig.customQuery) {
      logger.debug(`🎁 Usando query personalizada existente`);
      const query = detailConfig.customQuery.replace(
        /@documentId/g,
        documentId
      );
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      // ✅ Guardar configuración detectada para uso posterior
      result.recordset.forEach((record) => {
        record._DETECTED_PROMOTION_CONFIG = promotionFieldConfig;
      });

      return result.recordset || [];
    }

    // Construir query con campos detectados
    const sourceTable = detailConfig.sourceTable;
    const primaryKey = parentTableConfig.primaryKey || "NUM_PED";

    // Obtener campos del mapping existente
    const mappingFields = [];
    if (detailConfig.fieldMappings && detailConfig.fieldMappings.length > 0) {
      detailConfig.fieldMappings.forEach((fm) => {
        if (fm.sourceField) {
          mappingFields.push(fm.sourceField);
        }
      });
    }

    // Combinar campos del mapping + campos de promoción detectados
    const allFields = [
      ...new Set([...mappingFields, ...requiredPromotionFields]),
    ];

    logger.debug(`🎁 Campos finales para query: ${allFields.join(", ")}`);
    logger.debug(
      `🎁 Total campos: ${allFields.length} (${mappingFields.length} mapping + ${requiredPromotionFields.length} promoción)`
    );

    // Construir query
    const fieldsStr = allFields.join(", ");
    let query = `SELECT ${fieldsStr} FROM ${sourceTable} WHERE ${primaryKey} = @documentId`;

    if (detailConfig.filterCondition) {
      query += ` AND ${detailConfig.filterCondition}`;
    }

    if (detailConfig.orderByColumn) {
      query += ` ORDER BY ${detailConfig.orderByColumn}`;
    }

    logger.debug(`🎁 Query construida: ${query}`);

    try {
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });
      const data = result.recordset || [];

      logger.info(
        `🎁 ✅ Datos obtenidos con promociones: ${data.length} registros`
      );

      // ✅ Agregar configuración detectada a cada registro
      data.forEach((record) => {
        record._DETECTED_PROMOTION_CONFIG = promotionFieldConfig;
      });

      if (data.length > 0) {
        const firstRecord = data[0];
        logger.debug(
          `🎁 Campos en primer registro: ${Object.keys(firstRecord).join(", ")}`
        );

        // Verificar que los campos de promoción están presentes
        requiredPromotionFields.forEach((field) => {
          if (firstRecord.hasOwnProperty(field)) {
            logger.debug(
              `🎁 ✅ Campo presente: ${field} = ${firstRecord[field]}`
            );
          } else {
            logger.warn(`🎁 ❌ Campo faltante: ${field}`);
          }
        });
      }

      return data;
    } catch (error) {
      logger.error(`Error ejecutando query con promociones: ${error.message}`);
      logger.error(`Query: ${query}`);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Detecta automáticamente los nombres de campos en la tabla
   * @param {Object} sourceConnection - Conexión origen
   * @param {string} tableName - Nombre de la tabla
   * @param {Object} mapping - Configuración de mapping
   * @returns {Promise<Object>} - Configuración de campos detectada
   */
  async detectPromotionFieldNames(sourceConnection, tableName, mapping) {
    try {
      logger.debug(`🎁 Detectando nombres de campos en tabla ${tableName}...`);

      // Obtener columnas de la tabla
      const columns = await this.getTableColumns(sourceConnection, tableName);
      const columnNames = columns.map((col) => col.COLUMN_NAME.toUpperCase());

      logger.debug(`🎁 Columnas disponibles: ${columnNames.join(", ")}`);

      const defaultConfig = {
        bonusField: "ART_BON",
        referenceField: "COD_ART_RFR",
        discountField: "MON_DSC",
        lineNumberField: "NUM_LN",
        articleField: "COD_ART",
        quantityField: "CNT_MAX", // Valor por defecto corregido
        bonusLineRef: "PEDIDO_LINEA_BONIF",
        orderedQuantity: "CANTIDAD_PEDIDA",
        invoiceQuantity: "CANTIDAD_A_FACTURA",
        bonusQuantity: "CANTIDAD_BONIFICAD",
      };

      // ✅ DETECTAR AUTOMÁTICAMENTE VARIANTES DE NOMBRES
      const fieldVariants = {
        quantityField: [
          "CNT_MAX",
          "CND_MAX",
          "CANTIDAD_MAX",
          "QTY_MAX",
          "CANTIDAD",
        ],
        bonusField: ["ART_BON", "BONIFICACION", "BONUS", "IS_BONUS"],
        referenceField: [
          "COD_ART_RFR",
          "ARTICULO_REF",
          "ART_REF",
          "CODIGO_REF",
        ],
        discountField: ["MON_DSC", "DESCUENTO", "DISCOUNT", "DSC_AMT"],
        lineNumberField: ["NUM_LN", "LINEA", "LINE_NUM", "NUMERO_LINEA"],
        articleField: ["COD_ART", "ARTICULO", "CODIGO_ARTICULO", "ITEM_CODE"],
      };

      const detectedConfig = { ...defaultConfig };

      // Detectar nombres reales de campos
      Object.keys(fieldVariants).forEach((configKey) => {
        const variants = fieldVariants[configKey];

        for (const variant of variants) {
          if (columnNames.includes(variant.toUpperCase())) {
            if (detectedConfig[configKey] !== variant) {
              logger.info(
                `🎁 ✅ Campo detectado: ${configKey} = ${variant} (era ${detectedConfig[configKey]})`
              );
              detectedConfig[configKey] = variant;
            }
            break;
          }
        }
      });

      // Combinar con configuración del mapping si existe
      if (mapping.promotionConfig) {
        const finalConfig = {
          ...detectedConfig,
          ...mapping.promotionConfig.detectFields,
          ...mapping.promotionConfig.targetFields,
        };

        logger.debug(
          `🎁 Configuración final: ${JSON.stringify(finalConfig, null, 2)}`
        );
        return finalConfig;
      }

      logger.debug(
        `🎁 Configuración detectada: ${JSON.stringify(detectedConfig, null, 2)}`
      );
      return detectedConfig;
    } catch (error) {
      logger.error(`Error detectando campos de promoción: ${error.message}`);

      // Fallback a configuración por defecto corregida
      const fallbackConfig = {
        bonusField: "ART_BON",
        referenceField: "COD_ART_RFR",
        discountField: "MON_DSC",
        lineNumberField: "NUM_LN",
        articleField: "COD_ART",
        quantityField: "CNT_MAX", // ✅ Corregido
        bonusLineRef: "PEDIDO_LINEA_BONIF",
        orderedQuantity: "CANTIDAD_PEDIDA",
        invoiceQuantity: "CANTIDAD_A_FACTURA",
        bonusQuantity: "CANTIDAD_BONIFICAD",
      };

      if (mapping.promotionConfig) {
        return {
          ...fallbackConfig,
          ...mapping.promotionConfig.detectFields,
          ...mapping.promotionConfig.targetFields,
        };
      }

      return fallbackConfig;
    }
  }
}

module.exports = new DynamicTransferService();
