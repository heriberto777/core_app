// DynamicTransferService.js - VERSIÓN LIMPIA Y ORGANIZADA
const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const BonificationService = require("./BonificationProcessingService");

class DynamicTransferService {
  constructor() {
    this.bonificationService = new BonificationService();
    this.defaultTimeout = 120000; // 2 minutos
  }

  // ====================================
  // MÉTODOS PRINCIPALES DE PROCESAMIENTO
  // ====================================

  /**
   * MÉTODO PRINCIPAL: Procesa documentos según configuración de mapeo
   * Integra consecutivos centralizados y bonificaciones
   * @param {Array} documentIds - IDs de documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {AbortSignal} signal - Señal de cancelación
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    // Configurar timeout de seguridad
    const timeoutId = this._setupTimeout(localAbortController);

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    // Variables para consecutivos centralizados
    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. CARGAR Y VALIDAR CONFIGURACIÓN DE MAPEO
      mapping = await this._loadAndValidateMapping(mappingId);

      // 2. CONFIGURAR CONSECUTIVOS CENTRALIZADOS
      const consecutiveConfig = await this._setupCentralizedConsecutives(
        mapping
      );
      useCentralizedConsecutives = consecutiveConfig.enabled;
      centralizedConsecutiveId = consecutiveConfig.consecutiveId;

      // 3. ESTABLECER CONEXIONES
      const connections = await this._establishConnections(mapping);
      sourceConnection = connections.source;
      targetConnection = connections.target;

      // 4. CREAR REGISTRO DE EJECUCIÓN
      executionId = await this._createExecutionRecord(mappingId, documentIds);

      // 5. PRE-PROCESAR BONIFICACIONES SI ESTÁ HABILITADO
      const documentBonificationMappings = await this._preprocessBonifications(
        documentIds,
        mapping,
        sourceConnection
      );

      // 6. PROCESAR DOCUMENTOS EN LOTES
      const results = await this._processDocumentsBatch(
        documentIds,
        mapping,
        sourceConnection,
        targetConnection,
        useCentralizedConsecutives,
        centralizedConsecutiveId,
        documentBonificationMappings,
        signal
      );

      // 7. FINALIZAR PROCESAMIENTO
      await this._finalizeProcessing(executionId, results);

      clearTimeout(timeoutId);
      return this._buildSuccessResponse(results, mapping);
    } catch (error) {
      clearTimeout(timeoutId);
      await this._handleProcessingError(error, executionId);
      throw error;
    } finally {
      await this._cleanupConnections(sourceConnection, targetConnection);
    }
  }

  /**
   * Procesa un documento individual con bonificaciones
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {boolean} useCentralizedConsecutives - Si usar consecutivos centralizados
   * @param {string} centralizedConsecutiveId - ID del consecutivo centralizado
   * @param {Map} documentBonificationMappings - Mapeo de bonificaciones por documento
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async processDocumentWithBonifications(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null,
    documentBonificationMappings = new Map()
  ) {
    const startTime = Date.now();
    let currentConsecutive = null;
    let processedTables = [];
    let bonificationStats = {
      enabled: false,
      processedDetails: 0,
      totalBonifications: 0,
      mappedBonifications: 0,
      orphanBonifications: 0,
      promotionTypes: {},
      totalPromotions: 0,
      totalDiscountAmount: 0,
    };

    try {
      logger.info(
        `🚀 Procesando documento ${documentId} con configuración ${mapping.name}`
      );

      // Determinar tipo de documento para logs
      const documentType = this._getDocumentType(mapping);

      // PASO 1: PROCESAR TABLA PRINCIPAL
      const mainTableResult = await this._processMainTable(
        documentId,
        mapping,
        sourceConnection,
        targetConnection,
        useCentralizedConsecutives,
        centralizedConsecutiveId
      );

      processedTables.push(mainTableResult);
      currentConsecutive = mainTableResult.consecutive;

      // PASO 2: PROCESAR TABLAS DE DETALLE CON BONIFICACIONES
      for (const detailTable of mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      )) {
        const detailResult = await this._processDetailTableWithBonifications(
          documentId,
          detailTable,
          mapping,
          sourceConnection,
          targetConnection,
          currentConsecutive,
          documentBonificationMappings
        );

        processedTables.push(detailResult);

        // Actualizar estadísticas de bonificaciones
        if (detailResult.bonificationStats) {
          bonificationStats = this._mergeBonificationStats(
            bonificationStats,
            detailResult.bonificationStats
          );
        }
      }

      const processingTime = Date.now() - startTime;
      logger.info(
        `✅ Documento ${documentId} procesado exitosamente en ${processingTime}ms`
      );

      return {
        success: true,
        documentId,
        documentType,
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
        processedTables,
        bonificationStats,
        totalDetailsProcessed: bonificationStats.processedDetails,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando documento ${documentId}: ${error.message}`,
        {
          error: error.message,
          stack: error.stack,
          documentId,
          mappingId: mapping._id || mapping.id,
        }
      );

      return {
        success: false,
        message: error.message,
        documentType: this._getDocumentType(mapping),
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
        processedTables,
        bonificationStats,
        errorDetails: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // ========================================
  // MÉTODOS DE PROCESAMIENTO DE BONIFICACIONES
  // ========================================

  /**
   * Procesa tabla de detalle con lógica de bonificaciones integrada
   * @param {string} documentId - ID del documento
   * @param {Object} detailTable - Configuración de tabla de detalle
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} currentConsecutive - Consecutivo actual
   * @param {Map} documentBonificationMappings - Mapeo de bonificaciones
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async _processDetailTableWithBonifications(
    documentId,
    detailTable,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive,
    documentBonificationMappings
  ) {
    const startTime = Date.now();
    let bonificationStats = { enabled: false, processedDetails: 0 };

    try {
      logger.info(
        `📋 Procesando tabla detalle: ${detailTable.sourceTable} para documento ${documentId}`
      );

      // PASO 1: Obtener detalles originales
      const originalDetails = await this.getOrderDetailsWithPromotions(
        detailTable,
        documentId,
        sourceConnection
      );

      if (originalDetails.length === 0) {
        logger.warn(
          `No se encontraron detalles en ${detailTable.sourceTable} para documento ${documentId}`
        );
        return { success: true, recordsProcessed: 0, bonificationStats };
      }

      logger.info(
        `📦 Procesando ${originalDetails.length} detalles originales`
      );

      let finalDetails = originalDetails;

      // PASO 2: Procesar bonificaciones si están habilitadas
      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        const bonificationResult = await this._processBonificationsForDocument(
          documentId,
          sourceConnection,
          mapping.bonificationConfig
        );

        if (
          bonificationResult.success &&
          bonificationResult.bonificationMapping
        ) {
          finalDetails = this._applyBonificationMapping(
            originalDetails,
            bonificationResult.bonificationMapping,
            mapping.bonificationConfig
          );

          bonificationStats = {
            enabled: true,
            processedDetails: finalDetails.length,
            totalBonifications: bonificationResult.bonifications || 0,
            mappedBonifications: bonificationResult.processed || 0,
            orphanBonifications: bonificationResult.orphanBonifications || 0,
            promotionTypes: bonificationResult.promotionTypes || {},
            totalPromotions: bonificationResult.totalPromotions || 0,
            totalDiscountAmount: bonificationResult.totalDiscountAmount || 0,
          };

          logger.info(
            `✅ Bonificaciones aplicadas: ${bonificationResult.processed} mapeadas, ${bonificationResult.orphanBonifications} huérfanas`
          );
        }
      }

      // PASO 3: Insertar detalles procesados en tabla destino
      const insertResult = await this._insertDetailsToTarget(
        finalDetails,
        detailTable,
        targetConnection,
        currentConsecutive
      );

      const processingTime = Date.now() - startTime;
      logger.info(
        `✅ Tabla ${detailTable.sourceTable} procesada en ${processingTime}ms`
      );

      return {
        success: true,
        table: detailTable.sourceTable,
        recordsProcessed: insertResult.recordsInserted,
        bonificationStats,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando tabla detalle ${detailTable.sourceTable}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene detalles de orden con promociones aplicadas
   * @param {Object} detailTable - Configuración de tabla de detalle
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión a la base de datos
   * @returns {Promise<Array>} Detalles con promociones
   */
  async getOrderDetailsWithPromotions(
    detailTable,
    documentId,
    sourceConnection
  ) {
    try {
      const query = this._buildDetailQuery(detailTable, documentId);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo detalles con promociones: ${error.message}`
      );
      throw error;
    }
  }

  // ===================================
  // MÉTODOS DE CONFIGURACIÓN Y MAPEO
  // ===================================

  /**
   * Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} Lista de configuraciones
   */
  static async getMappings() {
    try {
      return await TransferMapping.find().sort({ name: 1 });
    } catch (error) {
      logger.error(
        `Error obteniendo configuraciones de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene configuración de mapeo por ID
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} Configuración de mapeo
   */
  static async getMappingById(mappingId) {
    try {
      return await TransferMapping.findById(mappingId);
    } catch (error) {
      logger.error(
        `Error obteniendo configuración de mapeo ${mappingId}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Crea nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} Configuración creada
   */
  static async createMapping(mappingData) {
    try {
      // Crear tarea por defecto si no existe
      if (!mappingData.taskId) {
        const taskData = this._buildDefaultTaskData(mappingData);
        const task = new TransferTask(taskData);
        await task.save();
        mappingData.taskId = task._id;
        logger.info(`Tarea por defecto creada para mapeo: ${task._id}`);
      }

      const mapping = new TransferMapping(mappingData);
      await mapping.save();
      return mapping;
    } catch (error) {
      logger.error(`Error creando configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza configuración de mapeo existente
   * @param {string} mappingId - ID de la configuración
   * @param {Object} mappingData - Nuevos datos
   * @returns {Promise<Object>} Configuración actualizada
   */
  static async updateMapping(mappingId, mappingData) {
    try {
      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        { new: true, runValidators: true }
      );

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      return mapping;
    } catch (error) {
      logger.error(
        `Error actualizando configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Elimina configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} True si se eliminó correctamente
   */
  static async deleteMapping(mappingId) {
    try {
      const result = await TransferMapping.findByIdAndDelete(mappingId);
      return !!result;
    } catch (error) {
      logger.error(`Error eliminando configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  // ===============================
  // MÉTODOS PRIVADOS DE UTILIDAD
  // ===============================

  /**
   * Configura timeout de seguridad
   * @private
   */
  _setupTimeout(abortController) {
    return setTimeout(() => {
      if (abortController) {
        logger.warn("Timeout de seguridad activado");
        abortController.abort();
      }
    }, this.defaultTimeout);
  }

  /**
   * Carga y valida configuración de mapeo
   * @private
   */
  async _loadAndValidateMapping(mappingId) {
    const mapping = await TransferMapping.findById(mappingId);
    if (!mapping) {
      throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
    }
    this._ensureDefaultConfigurations(mapping);
    return mapping;
  }

  /**
   * Configura consecutivos centralizados
   * @private
   */
  async _setupCentralizedConsecutives(mapping) {
    if (!mapping.consecutiveConfig?.enabled) {
      return { enabled: false, consecutiveId: null };
    }

    try {
      const consecutiveId = await this.getOrCreateConsecutiveForMapping(
        mapping
      );
      if (consecutiveId) {
        logger.info(
          `✅ Usando consecutivos centralizados para mapping ${mapping.name}`
        );
        return { enabled: true, consecutiveId };
      }
    } catch (error) {
      logger.warn(
        `⚠️ No se pudo usar consecutivo centralizado: ${error.message}`
      );
    }

    return { enabled: false, consecutiveId: null };
  }

  /**
   * Establece conexiones a las bases de datos
   * @private
   */
  async _establishConnections(mapping) {
    const [sourceConnection, targetConnection] = await Promise.all([
      ConnectionService.getConnection(mapping.sourceServer),
      ConnectionService.getConnection(mapping.targetServer),
    ]);

    return { source: sourceConnection, target: targetConnection };
  }

  /**
   * Pre-procesa bonificaciones por documento
   * @private
   */
  async _preprocessBonifications(documentIds, mapping, sourceConnection) {
    const documentBonificationMappings = new Map();

    if (!mapping.hasBonificationProcessing || !mapping.bonificationConfig) {
      return documentBonificationMappings;
    }

    logger.info(
      `🎁 Pre-procesando bonificaciones para ${documentIds.length} documentos`
    );

    for (const documentId of documentIds) {
      try {
        const bonificationResult =
          await this.bonificationService.processBonifications(
            sourceConnection,
            documentId,
            mapping.bonificationConfig
          );

        if (
          bonificationResult.success &&
          bonificationResult.bonificationMapping
        ) {
          documentBonificationMappings.set(
            documentId,
            bonificationResult.bonificationMapping
          );
          logger.debug(
            `✅ Bonificaciones procesadas para documento: ${documentId}`
          );
        }
      } catch (error) {
        logger.error(
          `❌ Error procesando bonificaciones para documento ${documentId}: ${error.message}`
        );
      }
    }

    return documentBonificationMappings;
  }

  /**
   * Aplica mapeo de bonificaciones a los detalles
   * @private
   */
  _applyBonificationMapping(originalDetails, bonificationMapping, config) {
    // Implementar lógica de aplicación de bonificaciones
    // Esta lógica dependerá de cómo esté estructurado el bonificationMapping
    logger.debug(
      `Aplicando mapeo de bonificaciones a ${originalDetails.length} detalles`
    );

    // Por ahora retornamos los detalles originales
    // Aquí iría la lógica específica de aplicación
    return originalDetails;
  }

  /**
   * Combina estadísticas de bonificaciones
   * @private
   */
  _mergeBonificationStats(existing, newStats) {
    return {
      enabled: existing.enabled || newStats.enabled,
      processedDetails:
        existing.processedDetails + (newStats.processedDetails || 0),
      totalBonifications:
        existing.totalBonifications + (newStats.totalBonifications || 0),
      mappedBonifications:
        existing.mappedBonifications + (newStats.mappedBonifications || 0),
      orphanBonifications:
        existing.orphanBonifications + (newStats.orphanBonifications || 0),
      promotionTypes: {
        ...existing.promotionTypes,
        ...newStats.promotionTypes,
      },
      totalPromotions:
        existing.totalPromotions + (newStats.totalPromotions || 0),
      totalDiscountAmount:
        existing.totalDiscountAmount + (newStats.totalDiscountAmount || 0),
    };
  }

  /**
   * Determina el tipo de documento basado en el mapeo
   * @private
   */
  _getDocumentType(mapping) {
    const name = mapping.name.toLowerCase();
    if (name.includes("pedido")) return "Pedido";
    if (name.includes("factura")) return "Factura";
    if (name.includes("cliente")) return "Cliente";
    if (name.includes("articulo")) return "Artículo";
    return "Documento";
  }

  /**
   * Construye query para obtener detalles
   * @private
   */
  _buildDetailQuery(detailTable, documentId) {
    const baseFields = Object.keys(detailTable.fieldMapping).join(", ");
    return `
      SELECT ${baseFields}
      FROM ${detailTable.sourceTable}
      WHERE ${detailTable.relationField} = @documentId
      ORDER BY ${detailTable.orderField || "NUM_LN"}
    `;
  }

  /**
   * Asegura configuraciones por defecto en el mapeo
   * @private
   */
  _ensureDefaultConfigurations(mapping) {
    // Asegurar configuración de bonificaciones por defecto
    if (mapping.hasBonificationProcessing && !mapping.bonificationConfig) {
      mapping.bonificationConfig = {
        enabled: false,
        sourceTable: "",
        bonificationIndicatorField: "",
        bonificationIndicatorValue: "",
        regularArticleField: "",
        bonificationLineReferenceField: "",
        orderField: "",
        lineNumberField: "",
        quantityField: "",
        applyPromotionRules: false,
      };
    }

    // Asegurar configuración de consecutivos por defecto
    if (!mapping.consecutiveConfig) {
      mapping.consecutiveConfig = {
        enabled: false,
        consecutiveType: "",
        prefix: "",
        suffix: "",
        padding: 6,
      };
    }
  }

  /**
   * Construye respuesta de éxito
   * @private
   */
  _buildSuccessResponse(results, mapping) {
    return {
      success: true,
      processed: results.processed,
      failed: results.failed,
      details: results.details,
      consecutivesUsed: results.consecutivesUsed,
      bonificationStats: this._calculateAggregatedBonificationStats(
        results.details
      ),
      processingTimeMs: Date.now() - results.startTime,
      mapping: {
        id: mapping._id,
        name: mapping.name,
        hasBonificationProcessing: mapping.hasBonificationProcessing,
      },
    };
  }

  /**
   * Calcula estadísticas agregadas de bonificaciones
   * @private
   */
  _calculateAggregatedBonificationStats(details) {
    const aggregated = {
      totalDocumentsWithBonifications: 0,
      totalBonifications: 0,
      totalPromotions: 0,
      totalDiscountAmount: 0,
      processedDetails: 0,
      bonificationTypes: {},
    };

    details.forEach((detail) => {
      if (detail.bonificationStats && detail.bonificationStats.enabled) {
        if (detail.bonificationStats.totalBonifications > 0) {
          aggregated.totalDocumentsWithBonifications++;
        }
        aggregated.totalBonifications +=
          detail.bonificationStats.totalBonifications;
        aggregated.totalPromotions += detail.bonificationStats.totalPromotions;
        aggregated.totalDiscountAmount +=
          detail.bonificationStats.totalDiscountAmount;
        aggregated.processedDetails +=
          detail.bonificationStats.processedDetails;

        // Combinar tipos de bonificaciones
        Object.entries(detail.bonificationStats.promotionTypes || {}).forEach(
          ([type, count]) => {
            aggregated.bonificationTypes[type] =
              (aggregated.bonificationTypes[type] || 0) + count;
          }
        );
      }
    });

    return aggregated;
  }

  /**
   * Maneja errores de procesamiento
   * @private
   */
  async _handleProcessingError(error, executionId) {
    logger.error(`Error en procesamiento de documentos: ${error.message}`);

    if (executionId) {
      try {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          error: error.message,
          endTime: new Date(),
        });
      } catch (updateError) {
        logger.error(
          `Error actualizando registro de ejecución: ${updateError.message}`
        );
      }
    }
  }

  /**
   * Limpia conexiones
   * @private
   */
  async _cleanupConnections(sourceConnection, targetConnection) {
    try {
      if (sourceConnection) await sourceConnection.close();
      if (targetConnection) await targetConnection.close();
    } catch (error) {
      logger.warn(`Error cerrando conexiones: ${error.message}`);
    }
  }
}

module.exports = DynamicTransferService;
