// DynamicTransferService.js - VERSIÓN COMPLETA CON TODA LA LÓGICA
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
  }

  // ====================================
  // MÉTODOS PRINCIPALES DE PROCESAMIENTO
  // ====================================

  /**
   * MÉTODO PRINCIPAL: Procesa documentos según configuración de mapeo
   * ✅ INTEGRA: Consecutivos centralizados, bonificaciones, TaskTracker
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    // Timeout de seguridad
    const timeoutId = setTimeout(() => {
      if (localAbortController) {
        logger.warn(`Timeout interno activado para tarea ${mappingId}`);
        localAbortController.abort();
      }
    }, 120000);

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    // Variables para consecutivos centralizados
    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. CARGAR CONFIGURACIÓN DE MAPEO
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Configuraciones por defecto
      this._ensureDefaultConfigurations(mapping);

      // 2. CONFIGURAR CONSECUTIVOS CENTRALIZADOS
      if (mapping.consecutiveConfig?.enabled) {
        try {
          centralizedConsecutiveId =
            await this.getOrCreateConsecutiveForMapping(mapping);
          if (centralizedConsecutiveId) {
            useCentralizedConsecutives = true;
            logger.info(
              `✅ Usando consecutivos centralizados para mapping ${mapping.name}`
            );
          }
        } catch (consecError) {
          logger.warn(
            `⚠️ No se pudo usar consecutivo centralizado: ${consecError.message}`
          );
        }
      }

      // 3. REGISTRAR TAREA Y EJECUCIÓN
      const registrationResult = await this._registerTaskExecution(
        cancelTaskId,
        mapping,
        documentIds,
        signal
      );
      executionId = registrationResult.executionId;

      // 4. ESTABLECER CONEXIONES
      const connections = await this._establishConnections(mapping);
      sourceConnection = connections.source;
      targetConnection = connections.target;

      // 5. PRE-PROCESAR BONIFICACIONES POR DOCUMENTO
      const documentBonificationMappings = await this._preprocessBonifications(
        documentIds,
        mapping,
        sourceConnection
      );

      // 6. PROCESAR DOCUMENTOS
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
      await this._finalizeProcessing(
        results,
        mapping,
        mappingId,
        useCentralizedConsecutives,
        executionId,
        startTime
      );

      clearTimeout(timeoutId);
      return results;
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error(`❌ Error en processDocuments: ${error.message}`);

      if (executionId) {
        await this._updateFailedExecution(
          executionId,
          error,
          Date.now() - startTime
        );
      }

      throw error;
    } finally {
      await this._cleanupResources(
        sourceConnection,
        targetConnection,
        cancelTaskId
      );
    }
  }

  /**
   * Procesa documentos en lotes
   */
  async _processDocumentsBatch(
    documentIds,
    mapping,
    sourceConnection,
    targetConnection,
    useCentralizedConsecutives,
    centralizedConsecutiveId,
    documentBonificationMappings,
    signal
  ) {
    const results = {
      processed: 0,
      failed: 0,
      details: [],
      consecutivesUsed: [],
      startTime: Date.now(),
    };

    for (const documentId of documentIds) {
      if (signal?.aborted) {
        logger.warn(`Procesamiento cancelado por señal de aborto`);
        break;
      }

      try {
        let currentConsecutive = null;

        // Generar consecutivo si está habilitado
        if (useCentralizedConsecutives && centralizedConsecutiveId) {
          try {
            const consecutiveResult =
              await ConsecutiveService.getNextConsecutiveValue(
                centralizedConsecutiveId,
                { segment: null }
              );

            if (consecutiveResult.success) {
              currentConsecutive = {
                value: consecutiveResult.data.value,
                formatted: consecutiveResult.data.formatted,
                isCentralized: true,
              };
              results.consecutivesUsed.push(currentConsecutive);
            }
          } catch (consecutiveError) {
            logger.warn(
              `Error obteniendo consecutivo centralizado: ${consecutiveError.message}`
            );
          }
        } else if (mapping.consecutiveConfig?.enabled) {
          currentConsecutive = await this.generateConsecutive(mapping);
          if (currentConsecutive) {
            results.consecutivesUsed.push(currentConsecutive);
          }
        }

        // Obtener mapeo de bonificaciones para este documento
        const bonificationMapping =
          documentBonificationMappings.get(documentId) || null;

        // Procesar documento individual
        const documentResult = await this.processDocumentWithBonifications(
          documentId,
          mapping,
          sourceConnection,
          targetConnection,
          useCentralizedConsecutives,
          centralizedConsecutiveId,
          documentBonificationMappings
        );

        if (documentResult.success) {
          results.processed++;
        } else {
          results.failed++;
        }

        results.details.push(documentResult);

        logger.info(
          `Documento ${documentId}: ${
            documentResult.success ? "✅ Exitoso" : "❌ Falló"
          }`
        );
      } catch (documentError) {
        results.failed++;
        const errorResult = this._buildDocumentErrorResult(
          documentId,
          documentError,
          mapping
        );
        results.details.push(errorResult);

        logger.error(
          `❌ Error procesando documento ${documentId}: ${documentError.message}`
        );
      }
    }

    return results;
  }

  /**
   * Procesa un documento individual con bonificaciones integradas
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

      // Generar consecutivo si está habilitado
      if (useCentralizedConsecutives && centralizedConsecutiveId) {
        try {
          const consecutiveResult =
            await ConsecutiveService.getNextConsecutiveValue(
              centralizedConsecutiveId,
              { segment: null }
            );

          if (consecutiveResult.success) {
            currentConsecutive = {
              value: consecutiveResult.data.value,
              formatted: consecutiveResult.data.formatted,
              isCentralized: true,
            };
          }
        } catch (consecutiveError) {
          logger.warn(
            `Error obteniendo consecutivo centralizado: ${consecutiveError.message}`
          );
        }
      } else if (mapping.consecutiveConfig?.enabled) {
        currentConsecutive = await this.generateConsecutive(mapping);
      }

      // Determinar tipo de documento
      const documentType = this._determineDocumentType(mapping);

      // Separar tablas principales y de detalle
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);
      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      // Procesar tablas principales
      const orderedMainTables = mainTables.sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      for (const tableConfig of orderedMainTables) {
        try {
          // Obtener datos de origen del encabezado
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

          // Crear contexto del cliente para promociones
          const customerContext = {
            customerId: sourceData.CUSTOMER_ID || sourceData.COD_CLI,
            customerType: sourceData.CUSTOMER_TYPE || "GENERAL",
            priceList: sourceData.PRICE_LIST || sourceData.LST_PRC,
            salesPerson: sourceData.SALESPERSON || sourceData.VENDEDOR,
            zone: sourceData.ZONE || sourceData.ZONA,
            orderAmount: sourceData.TOTAL_AMOUNT || 0,
            orderDate: sourceData.ORDER_DATE || sourceData.FCH_PED,
          };

          // Procesar dependencias FK si existen
          if (mapping.foreignKeyDependencies?.length > 0) {
            await this.processForeignKeyDependencies(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              sourceData
            );
          }

          // Aplicar consecutivo si está configurado
          if (currentConsecutive && mapping.consecutiveConfig?.enabled) {
            sourceData[mapping.consecutiveConfig.targetField] =
              currentConsecutive.formatted;
          }

          // Procesar tabla principal
          const mainTableResult = await this.processTableData(
            documentId,
            tableConfig,
            sourceData,
            sourceConnection,
            targetConnection,
            mapping,
            currentConsecutive
          );

          processedTables.push(mainTableResult);
        } catch (tableError) {
          logger.error(
            `Error procesando tabla principal ${tableConfig.sourceTable}: ${tableError.message}`
          );
          throw tableError;
        }
      }

      // ✅ PROCESAR TABLAS DE DETALLE CON BONIFICACIONES
      for (const detailTable of detailTables) {
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
            continue;
          }

          logger.info(
            `📦 Procesando ${originalDetails.length} detalles originales`
          );

          // ✅ PASO 2: Procesar bonificaciones CORRECTAMENTE
          let bonificationResult = null;
          let bonificationMapping = null;
          let finalDetails = originalDetails;

          if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
            try {
              bonificationResult =
                await this.bonificationService.processBonifications(
                  sourceConnection, // ✅ CORRECTO: conexión
                  documentId, // ✅ CORRECTO: documentId
                  mapping.bonificationConfig // ✅ CORRECTO: configuración
                );

              if (bonificationResult.success) {
                bonificationMapping = bonificationResult.bonificationMapping;
                logger.info(
                  `✅ Bonificaciones procesadas: ${bonificationResult.processed} mapeadas, ${bonificationResult.orphanBonifications} huérfanas`
                );

                // Actualizar estadísticas de bonificaciones
                bonificationStats = {
                  enabled: true,
                  processedDetails: originalDetails.length,
                  totalBonifications: bonificationResult.bonifications || 0,
                  mappedBonifications: bonificationResult.processed || 0,
                  orphanBonifications:
                    bonificationResult.orphanBonifications || 0,
                  promotionTypes: bonificationResult.promotionTypes || {},
                  totalPromotions: bonificationResult.totalPromotions || 0,
                  totalDiscountAmount:
                    bonificationResult.totalDiscountAmount || 0,
                };
              } else {
                logger.warn(
                  `⚠️ Error en bonificaciones: ${bonificationResult.error}`
                );
              }
            } catch (bonificationError) {
              logger.error(
                `❌ Error procesando bonificaciones: ${bonificationError.message}`
              );
              // Continuar sin bonificaciones
            }
          }

          // ✅ PASO 3: Aplicar reglas de promociones si están habilitadas
          if (mapping.bonificationConfig?.applyPromotionRules) {
            try {
              const customerContext = {
                customerId: originalDetails[0]?.COD_CLI,
                customerType: "GENERAL",
                orderAmount: 0,
              };

              finalDetails = await this.bonificationService.applyPromotionRules(
                originalDetails,
                customerContext,
                mapping.bonificationConfig
              );

              logger.info(
                `🎯 Reglas de promociones aplicadas: ${
                  finalDetails.length - originalDetails.length
                } nuevos items`
              );
            } catch (promotionError) {
              logger.error(
                `❌ Error aplicando reglas de promociones: ${promotionError.message}`
              );
              finalDetails = originalDetails;
            }
          }

          // PASO 4: Insertar detalles procesados
          const detailResult = await this.processDetailTableData(
            documentId,
            detailTable,
            finalDetails,
            sourceConnection,
            targetConnection,
            mapping,
            currentConsecutive,
            bonificationMapping
          );

          processedTables.push(detailResult);
        } catch (detailError) {
          logger.error(
            `❌ Error procesando tabla detalle ${detailTable.sourceTable}: ${detailError.message}`
          );
          throw detailError;
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
        `❌ Error procesando documento con bonificaciones ${documentId}: ${error.message}`,
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
        documentType: this._determineDocumentType(mapping),
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

  // =======================================
  // MÉTODOS DE OBTENCIÓN DE DATOS
  // =======================================

  /**
   * Obtiene datos de la tabla origen
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    try {
      const primaryKey =
        tableConfig.primaryKey ||
        this._inferPrimaryKey(tableConfig.sourceTable);
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const selectFields =
        requiredFields.length > 0 ? requiredFields.join(", ") : "*";

      const query = `
        SELECT ${selectFields}
        FROM ${tableConfig.sourceTable}
        WHERE ${primaryKey} = @documentId
        ${
          tableConfig.filterCondition
            ? ` AND ${tableConfig.filterCondition}`
            : ""
        }
      `;

      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });
      return result.recordset?.[0] || null;
    } catch (error) {
      logger.error(`Error obteniendo datos de origen: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene detalles del pedido con información de promociones
   */
  async getOrderDetailsWithPromotions(
    detailConfig,
    documentId,
    sourceConnection
  ) {
    try {
      const orderByColumn = detailConfig.orderByColumn || "NUM_LN";
      const requiredFields =
        this.getRequiredFieldsFromTableConfig(detailConfig);
      const promotionFields = ["ART_BON", "TIPO_ART", "NUM_LN_REF"];
      const allFields = [...new Set([...requiredFields, ...promotionFields])];
      const finalSelectFields = allFields.join(", ");
      const primaryKey = detailConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${finalSelectFields}
        FROM ${detailConfig.sourceTable}
        WHERE ${primaryKey} = @documentId
        ${
          detailConfig.filterCondition
            ? ` AND ${detailConfig.filterCondition}`
            : ""
        }
        ORDER BY ${orderByColumn}
      `;

      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });
      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo detalles con promociones: ${error.message}`
      );

      // Fallback
      try {
        return await this.getDetailDataFromOwnTable(
          detailConfig,
          documentId,
          sourceConnection
        );
      } catch (fallbackError) {
        logger.error(`Error en fallback: ${fallbackError.message}`);
        throw error;
      }
    }
  }

  /**
   * ✅ NUEVO MÉTODO ESTÁTICO: Para uso desde controllers
   * Método estático que crea una instancia y llama al método de instancia
   */
  static async getOrderDetailsWithPromotions(
    detailConfig,
    documentId,
    sourceConnection
  ) {
    const service = new DynamicTransferService();
    return await service.getOrderDetailsWithPromotions(
      detailConfig,
      documentId,
      sourceConnection
    );
  }

  /**
   * Obtiene detalles de su propia tabla
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "NUM_LN";
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);
    const selectFields =
      requiredFields.length > 0 ? requiredFields.join(", ") : "*";
    const primaryKey = detailConfig.primaryKey || "NUM_PED";

    const query = `
      SELECT ${selectFields}
      FROM ${detailConfig.sourceTable}
      WHERE ${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${detailConfig.filterCondition}`
          : ""
      }
      ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
    `;

    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });
    return result.recordset;
  }

  /**
   * Obtiene documentos según filtros especificados
   */
  async getDocuments(mapping, filters, connection = null) {
    try {
      // Validaciones básicas
      if (!mapping?.tableConfigs?.length) {
        throw new Error(
          "La configuración de mapeo no tiene tablas configuradas"
        );
      }

      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable?.sourceTable) {
        throw new Error("No se encontró tabla principal válida");
      }

      // Establecer conexión si no se proporciona
      if (!connection) {
        connection = await ConnectionService.getConnection(
          mapping.sourceServer
        );
      }

      // Construir consulta
      const query = this._buildDocumentQuery(mapping, mainTable, filters);
      const queryParams = this._buildQueryParameters(filters);

      logger.info(`Ejecutando consulta de documentos: ${query}`);
      logger.debug(`Parámetros: ${JSON.stringify(queryParams)}`);

      const result = await SqlService.query(connection, query, queryParams);

      logger.info(`Documentos encontrados: ${result.recordset?.length || 0}`);
      return result.recordset || [];
    } catch (error) {
      logger.error(`Error obteniendo documentos: ${error.message}`);
      throw error;
    }
  }

  // =======================================
  // MÉTODOS DE PROCESAMIENTO DE TABLAS
  // =======================================

  /**
   * Procesa datos de tabla principal
   */
  async processTableData(
    documentId,
    tableConfig,
    sourceData,
    sourceConnection,
    targetConnection,
    mapping,
    currentConsecutive = null
  ) {
    try {
      const targetData = {};
      const columnLengthCache = new Map();

      // Procesar mapeo de campos
      for (const [targetField, fieldMapping] of Object.entries(
        tableConfig.fieldMapping
      )) {
        const processedField = await this.processField(
          targetField,
          fieldMapping,
          sourceData,
          sourceConnection,
          {}
        );

        if (processedField.value !== undefined) {
          // Validar longitud de columna
          await this._validateColumnLength(
            targetField,
            processedField.value,
            tableConfig.targetTable,
            targetConnection,
            columnLengthCache
          );

          targetData[targetField] = processedField.value;
        }
      }

      // Aplicar consecutivo si está configurado
      if (currentConsecutive && mapping.consecutiveConfig?.targetField) {
        targetData[mapping.consecutiveConfig.targetField] =
          currentConsecutive.formatted;
      }

      // Insertar en tabla destino
      const insertResult = await this._insertSingleRecord(
        tableConfig.targetTable,
        targetData,
        targetConnection
      );

      return {
        success: true,
        table: tableConfig.sourceTable,
        targetTable: tableConfig.targetTable,
        recordsProcessed: 1,
        insertResult,
      };
    } catch (error) {
      logger.error(
        `Error procesando tabla ${tableConfig.sourceTable}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Procesa datos de tabla de detalle con bonificaciones
   */
  async processDetailTableData(
    documentId,
    detailConfig,
    detailRecords,
    sourceConnection,
    targetConnection,
    mapping,
    currentConsecutive = null,
    bonificationMapping = null
  ) {
    try {
      const processedRecords = [];
      const columnLengthCache = new Map();

      for (const sourceData of detailRecords) {
        const targetData = {};

        // Procesar mapeo de campos
        for (const [targetField, fieldMapping] of Object.entries(
          detailConfig.fieldMapping
        )) {
          const processedField = await this.processField(
            targetField,
            fieldMapping,
            sourceData,
            sourceConnection,
            {}
          );

          if (processedField.value !== undefined) {
            // Validar longitud de columna
            await this._validateColumnLength(
              targetField,
              processedField.value,
              detailConfig.targetTable,
              targetConnection,
              columnLengthCache
            );

            targetData[targetField] = processedField.value;
          }
        }

        // Aplicar consecutivo de encabezado si está configurado
        if (currentConsecutive && mapping.consecutiveConfig?.targetField) {
          targetData[mapping.consecutiveConfig.targetField] =
            currentConsecutive.formatted;
        }

        // Aplicar información de bonificaciones si existe
        if (bonificationMapping) {
          this._applyBonificationToDetail(
            targetData,
            sourceData,
            bonificationMapping,
            mapping.bonificationConfig
          );
        }

        processedRecords.push(targetData);
      }

      // Insertar registros en lote
      const insertResult = await this._insertBatchRecords(
        detailConfig.targetTable,
        processedRecords,
        targetConnection
      );

      return {
        success: true,
        table: detailConfig.sourceTable,
        targetTable: detailConfig.targetTable,
        recordsProcessed: processedRecords.length,
        insertResult,
      };
    } catch (error) {
      logger.error(
        `Error procesando tabla detalle ${detailConfig.sourceTable}: ${error.message}`
      );
      throw error;
    }
  }

  // =======================================
  // MÉTODOS DE PROCESAMIENTO DE CAMPOS
  // =======================================

  /**
   * Procesa un campo individual con todas las transformaciones
   */
  async processField(
    targetField,
    fieldMapping,
    sourceData,
    sourceConnection,
    lookupResults
  ) {
    let value;

    // PRIORIDAD 1: SQL directo
    if (fieldMapping.directSql) {
      try {
        const result = await SqlService.query(
          sourceConnection,
          fieldMapping.directSql,
          sourceData
        );
        value = result.recordset?.[0]?.[Object.keys(result.recordset[0])[0]];
        logger.debug(`Campo ${targetField} con SQL directo: ${value}`);
        return { value, isDirectSql: true };
      } catch (sqlError) {
        logger.error(
          `Error en SQL directo para ${targetField}: ${sqlError.message}`
        );
        return { value: fieldMapping.defaultValue || null, isDirectSql: false };
      }
    }

    // PRIORIDAD 2: Lookup
    if (fieldMapping.lookupConfig && lookupResults[targetField]) {
      value = lookupResults[targetField];
      logger.debug(`Campo ${targetField} desde lookup: ${value}`);
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 3: Consecutivo
    if (fieldMapping.isConsecutive) {
      // Este se maneja en el nivel superior
      value = fieldMapping.defaultValue || null;
      logger.debug(
        `Campo ${targetField} es consecutivo, se manejará después: ${value}`
      );
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 4: Función personalizada
    if (fieldMapping.customFunction) {
      try {
        value = await this._executeCustomFunction(
          fieldMapping.customFunction,
          sourceData
        );
        logger.debug(
          `Campo ${targetField} con función personalizada: ${value}`
        );
        return { value, isDirectSql: false };
      } catch (funcError) {
        logger.error(
          `Error en función personalizada para ${targetField}: ${funcError.message}`
        );
        value = fieldMapping.defaultValue || null;
        logger.debug(
          `Campo ${targetField} usando valor por defecto tras error en función: ${value}`
        );
        return { value, isDirectSql: false };
      }
    }

    // PRIORIDAD 5: Procesamiento normal de campo
    value = this._getFieldValue(fieldMapping, sourceData, lookupResults);

    // Aplicar transformaciones
    value = this._applyFieldTransformations(fieldMapping, sourceData, value);

    return { value, isDirectSql: false };
  }

  /**
   * Obtiene valor de campo con procesamiento básico
   */
  _getFieldValue(fieldMapping, sourceData, lookupResults) {
    let value;

    if (fieldMapping.sourceField) {
      value = sourceData[fieldMapping.sourceField];

      // Aplicar eliminación de prefijo si está configurado
      if (
        fieldMapping.removePrefix &&
        typeof value === "string" &&
        value.startsWith(fieldMapping.removePrefix)
      ) {
        value = value.substring(fieldMapping.removePrefix.length);
      }
    } else {
      value =
        fieldMapping.defaultValue === "NULL" ? null : fieldMapping.defaultValue;
    }

    // Si el valor es undefined/null pero hay valor por defecto
    if (
      (value === undefined || value === null) &&
      fieldMapping.defaultValue !== undefined
    ) {
      value =
        fieldMapping.defaultValue === "NULL" ? null : fieldMapping.defaultValue;
    }

    return value;
  }

  /**
   * Aplica transformaciones a los campos
   */
  _applyFieldTransformations(fieldMapping, sourceData, value) {
    // Transformación de fecha
    if (fieldMapping.dateTransformation && value) {
      value = this._transformDate(value, fieldMapping.dateTransformation);
    }

    // Transformación de texto
    if (fieldMapping.textTransformation && typeof value === "string") {
      value = this._transformText(value, fieldMapping.textTransformation);
    }

    // Transformación numérica
    if (fieldMapping.numericTransformation && typeof value === "number") {
      value = this._transformNumber(value, fieldMapping.numericTransformation);
    }

    // Concatenación
    if (fieldMapping.concatenation) {
      value = this._applyConcatenation(fieldMapping.concatenation, sourceData);
    }

    // Condiciones
    if (fieldMapping.conditions?.length > 0) {
      value = this._applyConditions(fieldMapping.conditions, sourceData, value);
    }

    return value;
  }

  // =======================================
  // MÉTODOS DE CONSECUTIVOS
  // =======================================

  /**
   * Genera consecutivo local según configuración
   */
  async generateConsecutive(mapping) {
    try {
      if (!mapping.consecutiveConfig?.enabled) {
        return null;
      }

      const lastValue = mapping.consecutiveConfig.lastValue || 0;
      const newValue = lastValue + 1;

      await this.updateLastConsecutive(mapping._id, newValue);

      let formattedValue = String(newValue);
      if (mapping.consecutiveConfig.pattern) {
        formattedValue = this.formatConsecutive(
          mapping.consecutiveConfig.pattern,
          {
            PREFIX: mapping.consecutiveConfig.prefix || "",
            VALUE: newValue,
            YEAR: new Date().getFullYear(),
            MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
            DAY: String(new Date().getDate()).padStart(2, "0"),
          }
        );
      } else if (mapping.consecutiveConfig.prefix) {
        formattedValue = `${mapping.consecutiveConfig.prefix}${newValue}`;
      }

      return {
        value: newValue,
        formatted: formattedValue,
        isCentralized: false,
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene o crea consecutivo centralizado para un mapping
   */
  async getOrCreateConsecutiveForMapping(mapping) {
    try {
      const mappingId = mapping._id.toString();

      // 1. Verificar consecutivos existentes
      let assignedConsecutives =
        await ConsecutiveService.getConsecutivesByEntity("mapping", mappingId);

      if (assignedConsecutives?.length > 0) {
        try {
          const testAccess = await ConsecutiveService.getNextConsecutiveValue(
            assignedConsecutives[0]._id,
            { segment: null }
          );

          if (testAccess?.success) {
            logger.info(
              `✅ Consecutivo existente validado: ${assignedConsecutives[0]._id}`
            );
            return assignedConsecutives[0]._id;
          }
        } catch (accessError) {
          logger.warn(
            `⚠️ Error validando consecutivo existente: ${accessError.message}`
          );
        }
      }

      // 2. Verificar si está habilitado para auto-crear
      if (!mapping.consecutiveConfig?.enabled) {
        return null;
      }

      // 3. Auto-crear consecutivo centralizado
      const consecutiveData = this._buildConsecutiveData(mapping, mappingId);
      const newConsecutive = await ConsecutiveService.createConsecutive(
        consecutiveData
      );

      // 4. Asignar a mapping
      await ConsecutiveService.assignConsecutive(newConsecutive._id, {
        entityType: "mapping",
        entityId: mappingId,
      });

      // 5. Validar funcionamiento
      const validationTest = await ConsecutiveService.getNextConsecutiveValue(
        newConsecutive._id,
        { segment: null }
      );

      if (!validationTest?.success) {
        throw new Error("El consecutivo creado no funciona correctamente");
      }

      logger.info(
        `✅ Consecutivo centralizado creado y validado: ${newConsecutive._id}`
      );
      return newConsecutive._id;
    } catch (error) {
      logger.error(
        `❌ Error en getOrCreateConsecutiveForMapping: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Formatea un consecutivo según el patrón
   */
  formatConsecutive(pattern, values) {
    let result = pattern;

    // Reemplazar variables simples
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`{${key}}`, "g"), value);
    }

    // Reemplazar variables con formato (ej: {VALUE:6} -> "000123")
    const formatRegex = /{([A-Z]+):(\d+)}/g;
    const matches = [...pattern.matchAll(formatRegex)];

    for (const match of matches) {
      const [fullMatch, key, digits] = match;
      if (values[key] !== undefined) {
        const paddedValue = String(values[key]).padStart(
          parseInt(digits, 10),
          "0"
        );
        result = result.replace(fullMatch, paddedValue);
      }
    }

    return result;
  }

  /**
   * Actualiza el último valor consecutivo
   */
  async updateLastConsecutive(mappingId, lastValue) {
    try {
      const result = await TransferMapping.findOneAndUpdate(
        { _id: mappingId, "consecutiveConfig.lastValue": { $lt: lastValue } },
        { "consecutiveConfig.lastValue": lastValue },
        { new: true }
      );

      if (result) {
        logger.info(
          `Último consecutivo actualizado para ${mappingId}: ${lastValue}`
        );
        return true;
      } else {
        logger.debug(
          `No se actualizó consecutivo - valor existente mayor o igual`
        );
        return false;
      }
    } catch (error) {
      logger.error(`Error actualizando último consecutivo: ${error.message}`);
      throw error;
    }
  }

  // =======================================
  // MÉTODOS DE GESTIÓN DE CONFIGURACIONES
  // =======================================

  /**
   * Obtiene todas las configuraciones de mapeo
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
   */
  static async createMapping(mappingData) {
    try {
      // Si no hay taskId, crear una tarea por defecto
      if (!mappingData.taskId) {
        const taskData =
          DynamicTransferService._buildDefaultTaskData(mappingData);
        const task = new TransferTask(taskData);
        await task.save();
        mappingData.taskId = task._id;
        logger.info(`Tarea por defecto creada para mapeo: ${task._id}`);
      }

      const mapping = new TransferMapping(mappingData);
      await mapping.save();
      return mapping;
    } catch (error) {
      logger.error(`Error al crear configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza configuración de mapeo existente
   */
  static async updateMapping(mappingId, mappingData) {
    try {
      const existingMapping = await TransferMapping.findById(mappingId);
      if (!existingMapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Actualizar tarea asociada si es necesario
      if (mappingData.tableConfigs && existingMapping.taskId) {
        await DynamicTransferService._updateAssociatedTask(
          existingMapping,
          mappingData
        );
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        {
          new: true,
          runValidators: true,
        }
      );

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

  // =======================================
  // MÉTODOS PRIVADOS DE UTILIDAD
  // =======================================

  /**
   * Asegura configuraciones por defecto en el mapeo
   */
  _ensureDefaultConfigurations(mapping) {
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
  }

  /**
   * Registra tarea y ejecución
   */
  async _registerTaskExecution(cancelTaskId, mapping, documentIds, signal) {
    TaskTracker.registerTask(
      cancelTaskId,
      `Processing mapping: ${mapping.name}`,
      {
        mappingId: mapping._id,
        documentIds,
        signal,
      }
    );

    const taskExecution = new TaskExecution({
      taskId: mapping.taskId,
      taskName: mapping.name,
      date: new Date(),
      status: "running",
      details: { documentIds, mappingId: mapping._id },
    });

    await taskExecution.save();
    return { executionId: taskExecution._id };
  }

  /**
   * Establece conexiones
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
   */
  async _preprocessBonifications(documentIds, mapping, sourceConnection) {
    const documentBonificationMappings = new Map();

    if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
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
        } catch (bonificationError) {
          logger.error(
            `❌ Error procesando bonificaciones para documento ${documentId}: ${bonificationError.message}`
          );
        }
      }
    }

    return documentBonificationMappings;
  }

  /**
   * Finaliza el procesamiento
   */
  async _finalizeProcessing(
    results,
    mapping,
    mappingId,
    useCentralizedConsecutives,
    executionId,
    startTime
  ) {
    try {
      const processingTime = Date.now() - startTime;

      // Actualizar ejecución de tarea
      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: results.processed > 0 ? "completed" : "failed",
          endTime: new Date(),
          processingTimeMs: processingTime,
          documentsProcessed: results.processed,
          documentsFailed: results.failed,
        });
      }

      // Agregar información de procesamiento
      results.success = true;
      results.processingTimeMs = processingTime;
      results.usedCentralizedConsecutives = useCentralizedConsecutives;
      results.mappingName = mapping.name;

      // Calcular estadísticas agregadas de bonificaciones
      results.bonificationStats = this._calculateAggregatedBonificationStats(
        results.details
      );

      logger.info(
        `✅ Procesamiento finalizado: ${results.processed} exitosos, ${results.failed} fallidos en ${processingTime}ms`
      );
    } catch (error) {
      logger.error(`Error en finalización de procesamiento: ${error.message}`);
    }
  }

  /**
   * Actualiza ejecución fallida
   */
  async _updateFailedExecution(executionId, error, processingTime) {
    try {
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: "failed",
        error: error.message,
        endTime: new Date(),
        processingTimeMs: processingTime,
      });
    } catch (updateError) {
      logger.error(
        `Error actualizando ejecución fallida: ${updateError.message}`
      );
    }
  }

  /**
   * Limpia recursos
   */
  async _cleanupResources(sourceConnection, targetConnection, cancelTaskId) {
    try {
      if (sourceConnection)
        await ConnectionService.releaseConnection(sourceConnection);
      if (targetConnection)
        await ConnectionService.releaseConnection(targetConnection);
      TaskTracker.unregisterTask(cancelTaskId);
    } catch (error) {
      logger.warn(`Error en limpieza de recursos: ${error.message}`);
    }
  }

  /**
   * Construye datos de consecutivo
   */
  _buildConsecutiveData(mapping, mappingId) {
    const config = mapping.consecutiveConfig;

    return {
      name: config.consecutiveName || `MAPPING_${mapping.name}`,
      description: `Consecutivo automático para mapping: ${mapping.name}`,
      format: config.format || config.pattern || "{PREFIX}{VALUE}",
      startValue: config.startValue || 1,
      increment: config.increment || 1,
      currentValue: config.lastValue || config.startValue || 1,
      prefix: config.prefix || "",
      entityType: "mapping",
      entityId: mappingId,
      segments: config.segments || [],
      metadata: {
        mappingName: mapping.name,
        createdBy: "auto-creation",
        sourceServer: mapping.sourceServer,
        targetServer: mapping.targetServer,
        transferType: mapping.transferType,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Construye resultado de error para documento
   */
  _buildDocumentErrorResult(documentId, error, mapping) {
    // Determinar tipo de error específico
    if (error.message?.includes("String or binary data would be truncated")) {
      const columnName =
        error.message.match(/column '([^']+)'/)?.[1] || "desconocida";
      return {
        success: false,
        message: `Error de truncado: El valor es demasiado largo para la columna '${columnName}'.`,
        documentType: this._determineDocumentType(mapping),
        errorCode: "TRUNCATION_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    if (error.message?.includes("Cannot insert the value NULL into column")) {
      const columnName =
        error.message.match(/column '([^']+)'/)?.[1] || "desconocida";
      return {
        success: false,
        message: `No se puede insertar NULL en la columna '${columnName}' que no permite valores nulos.`,
        documentType: this._determineDocumentType(mapping),
        errorCode: "NULL_VALUE_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    return {
      success: false,
      message: error.message || "Error desconocido durante el procesamiento",
      documentType: this._determineDocumentType(mapping),
      errorCode: this._determineErrorCode(error),
      consecutiveUsed: null,
      consecutiveValue: null,
    };
  }

  /**
   * Determina el tipo de documento basado en el mapeo
   */
  _determineDocumentType(mapping) {
    if (!mapping?.name) return "unknown";

    const name = mapping.name.toLowerCase();
    if (name.includes("pedido")) return "Pedido";
    if (name.includes("factura")) return "Factura";
    if (name.includes("cliente")) return "Cliente";
    if (name.includes("articulo")) return "Artículo";
    return "Documento";
  }

  /**
   * Determina el código de error
   */
  _determineErrorCode(error) {
    const message = error.message?.toLowerCase() || "";

    if (message.includes("truncated") || message.includes("too long")) {
      return "TRUNCATION_ERROR";
    } else if (message.includes("null")) {
      return "NULL_VALUE_ERROR";
    } else if (
      message.includes("permission") ||
      message.includes("access denied")
    ) {
      return "PERMISSION_ERROR";
    } else if (
      message.includes("incorrect syntax") ||
      message.includes("syntax error")
    ) {
      return "SQL_SYNTAX_ERROR";
    } else if (
      message.includes("conversion failed") &&
      (message.includes("date") || message.includes("time"))
    ) {
      return "DATE_CONVERSION_ERROR";
    }

    return "GENERAL_ERROR";
  }

  /**
   * Construye datos de tarea por defecto
   */
  static _buildDefaultTaskData(mappingData) {
    let defaultQuery = "SELECT 1";

    if (mappingData.tableConfigs?.length > 0) {
      const mainTable = mappingData.tableConfigs.find(
        (tc) => !tc.isDetailTable
      );
      if (mainTable?.sourceTable) {
        defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
      }
    }

    return {
      name: `Task_${mappingData.name}`,
      type: "manual",
      active: true,
      transferType: mappingData.transferType || "down",
      query: defaultQuery,
      parameters: [],
      status: "pending",
    };
  }

  /**
   * Actualiza tarea asociada
   */
  static async _updateAssociatedTask(existingMapping, mappingData) {
    if (mappingData.tableConfigs && existingMapping.taskId) {
      try {
        const task = await TransferTask.findById(existingMapping.taskId);
        if (task) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable?.sourceTable) {
            task.query = `SELECT * FROM ${mainTable.sourceTable}`;
            await task.save();
            logger.info(`Tarea ${task._id} actualizada automáticamente`);
          }
        }
      } catch (taskError) {
        logger.warn(`Error actualizando tarea asociada: ${taskError.message}`);
      }
    }
  }

  /**
   * Calcula estadísticas agregadas de bonificaciones
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

  // =======================================
  // MÉTODOS DE SOPORTE ADICIONALES
  // =======================================

  /**
   * Obtiene campos requeridos de configuración de tabla
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    // ✅ UNIFICAR: Usar fieldMapping (object) o fieldMappings (array)
    const fieldMappings =
      tableConfig.fieldMapping || tableConfig.fieldMappings || {};

    if (Array.isArray(fieldMappings)) {
      // Si es array (fieldMappings)
      fieldMappings.forEach((fm) => {
        if (fm.sourceField) {
          requiredFields.add(fm.sourceField);
        }
      });
    } else {
      // Si es objeto (fieldMapping)
      Object.values(fieldMappings).forEach((mapping) => {
        if (mapping.sourceField) {
          requiredFields.add(mapping.sourceField);
        }
      });
    }

    // ✅ SOLO agregar campos base que sabemos que existen en la tabla origen
    const commonOriginFields = [
      "NUM_LN",
      "NUM_PED",
      "COD_ART",
      "CANT",
      "TIPO_ART",
    ];

    // Agregar clave primaria si está definida
    const primaryKey =
      tableConfig.primaryKey || this._inferPrimaryKey(tableConfig.sourceTable);
    if (primaryKey) {
      requiredFields.add(primaryKey);
    }

    return Array.from(requiredFields);
  }

  /**
   * ✅ CORREGIDO: Obtiene detalles del pedido SIN incluir campos que no existen
   */
  async getOrderDetailsWithPromotions(
    detailConfig,
    documentId,
    sourceConnection
  ) {
    try {
      const orderByColumn = detailConfig.orderByColumn || "NUM_LN";

      // ✅ SOLO campos que sabemos que existen en la tabla origen
      const requiredFields =
        this.getRequiredFieldsFromTableConfig(detailConfig);

      // ✅ CAMPOS PROMOCIONALES OPCIONALES - Solo agregar si existen
      const optionalPromotionFields = ["ART_BON", "TIPO_ART", "NUM_LN_REF"];

      // ✅ VERIFICAR qué campos realmente existen en la tabla
      const existingFields = await this._getExistingColumns(
        detailConfig.sourceTable,
        sourceConnection
      );

      // ✅ Solo incluir campos que realmente existan
      const validRequiredFields = requiredFields.filter((field) =>
        existingFields.includes(field.toUpperCase())
      );

      const validPromotionFields = optionalPromotionFields.filter((field) =>
        existingFields.includes(field.toUpperCase())
      );

      const allValidFields = [
        ...new Set([...validRequiredFields, ...validPromotionFields]),
      ];
      const finalSelectFields =
        allValidFields.length > 0 ? allValidFields.join(", ") : "*";

      const primaryKey = detailConfig.primaryKey || "NUM_PED";

      const query = `
      SELECT ${finalSelectFields}
      FROM ${detailConfig.sourceTable}
      WHERE ${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${detailConfig.filterCondition}`
          : ""
      }
      ORDER BY ${orderByColumn}
    `;

      logger.debug(`🔍 Query para detalles: ${query}`);
      logger.debug(
        `📋 Campos válidos encontrados: ${allValidFields.join(", ")}`
      );

      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });
      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo detalles con promociones: ${error.message}`
      );

      // ✅ FALLBACK MEJORADO: Solo con campos básicos
      try {
        return await this._getDetailDataBasic(
          detailConfig,
          documentId,
          sourceConnection
        );
      } catch (fallbackError) {
        logger.error(`Error en fallback: ${fallbackError.message}`);
        throw error;
      }
    }
  }

  async _getExistingColumns(tableName, connection) {
    try {
      const query = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
    `;

      const result = await SqlService.query(connection, query, { tableName });
      return result.recordset.map((row) => row.COLUMN_NAME.toUpperCase());
    } catch (error) {
      logger.warn(
        `No se pudo verificar columnas de ${tableName}: ${error.message}`
      );
      // Retornar campos básicos comunes
      return ["NUM_PED", "NUM_LN", "COD_ART", "CANT", "PRECIO", "TOTAL"];
    }
  }

  async _getDetailDataBasic(detailConfig, documentId, sourceConnection) {
    const primaryKey = detailConfig.primaryKey || "NUM_PED";
    const orderByColumn = detailConfig.orderByColumn || "NUM_LN";

    // ✅ Solo campos básicos que casi siempre existen
    const basicFields = [primaryKey, "NUM_LN", "COD_ART", "CANT"];

    const query = `
    SELECT ${basicFields.join(", ")}
    FROM ${detailConfig.sourceTable}
    WHERE ${primaryKey} = @documentId
    ${
      detailConfig.filterCondition ? ` AND ${detailConfig.filterCondition}` : ""
    }
    ORDER BY ${orderByColumn}
  `;

    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });
    return result.recordset || [];
  }

  /**
   * Infiere clave primaria de tabla
   */
  _inferPrimaryKey(tableName) {
    const table = tableName.toLowerCase();

    if (table.includes("ped") || table.includes("order")) return "NUM_PED";
    if (table.includes("fac") || table.includes("invoice")) return "NUM_FAC";
    if (table.includes("cli") || table.includes("customer")) return "COD_CLI";
    if (table.includes("art") || table.includes("item")) return "COD_ART";

    return "ID"; // Por defecto
  }

  /**
   * Construye query de documentos
   */
  _buildDocumentQuery(mapping, mainTable, filters) {
    const selectFields = this._buildSelectFields(mainTable);
    const whereClause = this._buildWhereClause(filters, mainTable);
    const orderClause = filters.orderBy ? `ORDER BY ${filters.orderBy}` : "";
    const limitClause = filters.limit ? `TOP ${filters.limit}` : "";

    return `
      SELECT ${limitClause} ${selectFields}
      FROM ${mainTable.sourceTable}
      ${whereClause}
      ${orderClause}
    `;
  }

  /**
   * Construye campos SELECT
   */
  _buildSelectFields(mainTable) {
    const requiredFields = this.getRequiredFieldsFromTableConfig(mainTable);
    return requiredFields.length > 0 ? requiredFields.join(", ") : "*";
  }

  /**
   * Construye cláusula WHERE
   */
  _buildWhereClause(filters, mainTable) {
    const conditions = [];

    // Filtro de fechas
    if (filters.dateFrom && filters.dateTo) {
      const dateField = filters.dateField || "FCH_PED";
      conditions.push(`${dateField} BETWEEN @dateFrom AND @dateTo`);
    }

    // Filtros adicionales
    if (filters.status) {
      conditions.push(`STATUS = @status`);
    }

    if (filters.customCondition) {
      conditions.push(filters.customCondition);
    }

    // Condición de tabla
    if (mainTable.filterCondition) {
      conditions.push(mainTable.filterCondition);
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  }

  /**
   * Construye parámetros de query
   */
  _buildQueryParameters(filters) {
    const params = {};

    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.status) params.status = filters.status;

    return params;
  }

  /**
   * Valida longitud de columna
   */
  async _validateColumnLength(
    targetField,
    value,
    targetTable,
    targetConnection,
    cache
  ) {
    if (typeof value !== "string" || !value) return;

    const cacheKey = `${targetTable}.${targetField}`;

    if (!cache.has(cacheKey)) {
      try {
        const query = `
          SELECT CHARACTER_MAXIMUM_LENGTH
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
        `;

        const result = await SqlService.query(targetConnection, query, {
          tableName: targetTable,
          columnName: targetField,
        });

        const maxLength = result.recordset?.[0]?.CHARACTER_MAXIMUM_LENGTH;
        cache.set(cacheKey, maxLength);
      } catch (error) {
        cache.set(cacheKey, null);
      }
    }

    const maxLength = cache.get(cacheKey);
    if (maxLength && value.length > maxLength) {
      throw new Error(
        `String or binary data would be truncated in column '${targetField}'. Max length: ${maxLength}, actual: ${value.length}`
      );
    }
  }

  /**
   * Inserta un registro individual
   */
  async _insertSingleRecord(targetTable, targetData, targetConnection) {
    const fields = Object.keys(targetData);
    const values = fields.map((field) => `@${field}`);

    const query = `
      INSERT INTO ${targetTable} (${fields.join(", ")})
      VALUES (${values.join(", ")})
    `;

    return await SqlService.query(targetConnection, query, targetData);
  }

  /**
   * Inserta registros en lote
   */
  async _insertBatchRecords(targetTable, records, targetConnection) {
    if (records.length === 0) return { recordsInserted: 0 };

    const fields = Object.keys(records[0]);
    const batchSize = 100;
    let totalInserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const values = batch
        .map(
          (record, index) =>
            `(${fields.map((field) => `@${field}_${index}`).join(", ")})`
        )
        .join(", ");

      const query = `
        INSERT INTO ${targetTable} (${fields.join(", ")})
        VALUES ${values}
      `;

      const params = {};
      batch.forEach((record, index) => {
        fields.forEach((field) => {
          params[`${field}_${index}`] = record[field];
        });
      });

      await SqlService.query(targetConnection, query, params);
      totalInserted += batch.length;
    }

    return { recordsInserted: totalInserted };
  }

  /**
   * Aplica bonificación a detalle
   */
  _applyBonificationToDetail(
    targetData,
    sourceData,
    bonificationMapping,
    config
  ) {
    if (!bonificationMapping || !config) return;

    // Buscar si este detalle tiene bonificaciones asociadas
    const lineNumber = sourceData[config.lineNumberField];
    const bonification = bonificationMapping.mappings?.find(
      (mapping) =>
        mapping.linkedRegularArticle[config.lineNumberField] === lineNumber
    );

    if (bonification) {
      // Agregar información de bonificación al registro
      targetData.BONIFICATION_APPLIED = true;
      targetData.BONIFICATION_QUANTITY = bonification.bonificationQuantity;
      targetData.BONIFICATION_TYPE =
        bonification.bonification[config.bonificationIndicatorField];
    }
  }

  // =======================================
  // MÉTODOS DE TRANSFORMACIONES
  // =======================================

  /**
   * Transforma fecha
   */
  _transformDate(value, transformation) {
    if (!value) return value;

    try {
      const date = new Date(value);

      switch (transformation.type) {
        case "format":
          return this._formatDate(date, transformation.format);
        case "addDays":
          date.setDate(date.getDate() + transformation.days);
          return date;
        case "addMonths":
          date.setMonth(date.getMonth() + transformation.months);
          return date;
        default:
          return value;
      }
    } catch (error) {
      logger.warn(`Error transformando fecha: ${error.message}`);
      return value;
    }
  }

  /**
   * Transforma texto
   */
  _transformText(value, transformation) {
    if (!value) return value;

    switch (transformation.type) {
      case "uppercase":
        return value.toUpperCase();
      case "lowercase":
        return value.toLowerCase();
      case "trim":
        return value.trim();
      case "replace":
        return value.replace(
          new RegExp(transformation.search, "g"),
          transformation.replace
        );
      case "substring":
        return value.substring(transformation.start, transformation.end);
      default:
        return value;
    }
  }

  /**
   * Transforma número
   */
  _transformNumber(value, transformation) {
    if (typeof value !== "number") return value;

    switch (transformation.type) {
      case "multiply":
        return value * transformation.factor;
      case "divide":
        return value / transformation.factor;
      case "round":
        return (
          Math.round(value * Math.pow(10, transformation.decimals)) /
          Math.pow(10, transformation.decimals)
        );
      case "floor":
        return Math.floor(value);
      case "ceil":
        return Math.ceil(value);
      default:
        return value;
    }
  }

  /**
   * Aplica concatenación
   */
  _applyConcatenation(concatenation, sourceData) {
    const parts = concatenation.parts.map((part) => {
      if (part.type === "field") {
        return sourceData[part.field] || "";
      } else if (part.type === "literal") {
        return part.value || "";
      }
      return "";
    });

    return parts.join(concatenation.separator || "");
  }

  /**
   * Aplica condiciones
   */
  _applyConditions(conditions, sourceData, currentValue) {
    for (const condition of conditions) {
      if (this._evaluateCondition(condition.condition, sourceData)) {
        return condition.value;
      }
    }
    return currentValue;
  }

  /**
   * Evalúa condición
   */
  _evaluateCondition(condition, sourceData) {
    const { field, operator, value } = condition;
    const fieldValue = sourceData[field];

    switch (operator) {
      case "equals":
        return fieldValue === value;
      case "not_equals":
        return fieldValue !== value;
      case "greater_than":
        return fieldValue > value;
      case "less_than":
        return fieldValue < value;
      case "contains":
        return String(fieldValue).includes(value);
      case "is_null":
        return fieldValue === null || fieldValue === undefined;
      case "is_not_null":
        return fieldValue !== null && fieldValue !== undefined;
      default:
        return false;
    }
  }

  /**
   * Ejecuta función personalizada
   */
  async _executeCustomFunction(functionName, sourceData) {
    // Aquí puedes implementar funciones personalizadas específicas
    switch (functionName) {
      case "generateGUID":
        return this._generateGUID();
      case "getCurrentTimestamp":
        return new Date().toISOString();
      case "formatCurrency":
        return this._formatCurrency(sourceData.amount || 0);
      default:
        throw new Error(
          `Función personalizada no implementada: ${functionName}`
        );
    }
  }

  /**
   * Genera GUID
   */
  _generateGUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /**
   * Formatea moneda
   */
  _formatCurrency(amount) {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount);
  }

  /**
   * Formatea fecha
   */
  _formatDate(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return format
      .replace("YYYY", year)
      .replace("MM", month)
      .replace("DD", day)
      .replace("HH", hours)
      .replace("mm", minutes)
      .replace("ss", seconds);
  }

  // =======================================
  // MÉTODOS DE PROCESAMIENTO DE DEPENDENCIAS
  // =======================================

  /**
   * Procesa dependencias de claves foráneas
   */
  async processForeignKeyDependencies(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    try {
      for (const dependency of mapping.foreignKeyDependencies) {
        await this._processSingleFKDependency(
          dependency,
          documentId,
          sourceConnection,
          targetConnection,
          sourceData
        );
      }
    } catch (error) {
      logger.error(`Error procesando dependencias FK: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa una dependencia FK individual
   */
  async _processSingleFKDependency(
    dependency,
    documentId,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    const { sourceTable, targetTable, keyMapping, condition } = dependency;

    // Obtener datos de la tabla dependencia
    const dependencyData = await this._getDependencyData(
      sourceTable,
      documentId,
      condition,
      sourceConnection
    );

    if (dependencyData.length === 0) {
      logger.warn(`No se encontraron datos de dependencia en ${sourceTable}`);
      return;
    }

    // Procesar cada registro de dependencia
    for (const depRecord of dependencyData) {
      const targetData = {};

      // Mapear campos según configuración
      for (const [targetField, sourceField] of Object.entries(keyMapping)) {
        targetData[targetField] =
          depRecord[sourceField] || sourceData[sourceField];
      }

      // Insertar en tabla destino
      await this._insertSingleRecord(targetTable, targetData, targetConnection);
    }

    logger.info(
      `Procesadas ${dependencyData.length} dependencias FK en ${targetTable}`
    );
  }

  /**
   * Obtiene datos de dependencia
   */
  async _getDependencyData(
    sourceTable,
    documentId,
    condition,
    sourceConnection
  ) {
    const query = `
      SELECT *
      FROM ${sourceTable}
      WHERE ${condition}
    `;

    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });
    return result.recordset || [];
  }
}

module.exports = DynamicTransferService;
