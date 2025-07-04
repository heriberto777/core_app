// DynamicTransferService.js - VERSIÓN COMPLETA Y ORGANIZADA
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
   * ✅ INTEGRA: Consecutivos centralizados y bonificaciones
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
   * Procesa un documento individual con bonificaciones y consecutivos
   */
  async processDocument(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null,
    bonificationMapping = null
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(`Procesando documento ${documentId}`);

      const columnLengthCache = new Map();
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
          documentType,
          consecutiveUsed: currentConsecutive?.formatted || null,
          consecutiveValue: currentConsecutive?.value || null,
        };
      }

      // Ordenar tablas por executionOrder
      const orderedMainTables = [...mainTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );

      // Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
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

        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          sourceData
        );

        // Procesar tabla principal
        await this.processTable(
          tableConfig,
          sourceData,
          null,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false,
          bonificationMapping
        );

        processedTables.push(tableConfig.name);

        // Procesar tablas de detalle
        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable
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
            processedTables,
            bonificationMapping
          );
        }
      }

      return {
        success: true,
        message: "Documento procesado exitosamente",
        documentType,
        processedTables,
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
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

  // =======================================
  // MÉTODOS DE PROCESAMIENTO DE TABLAS
  // =======================================

  /**
   * Procesa una tabla (principal o detalle) con bonificaciones integradas
   */
  async processTable(
    tableConfig,
    sourceData,
    detailRow,
    targetConnection,
    currentConsecutive,
    mapping,
    documentId,
    columnLengthCache,
    isDetailTable = false,
    bonificationMapping = null
  ) {
    const targetData = {};
    const targetFields = [];
    const targetValues = [];
    const directSqlFields = new Set();

    // Para detalles, combinar datos del encabezado y detalle
    const dataForProcessing = isDetailTable
      ? { ...sourceData, ...detailRow }
      : sourceData;

    // Realizar consulta de lookup si es necesario
    let lookupResults = {};
    if (tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)) {
      const lookupExecution = await this.lookupValuesFromTarget(
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
        columnLengthCache,
        bonificationMapping,
        mapping.bonificationConfig
      );

      if (processedField.isDirectSql) {
        targetFields.push(fieldMapping.targetField);
        targetValues.push(processedField.value);
        directSqlFields.add(fieldMapping.targetField);
      } else {
        targetData[fieldMapping.targetField] = processedField.value;
        targetFields.push(fieldMapping.targetField);
        targetValues.push(`@${fieldMapping.targetField}`);
      }
    }

    // Ejecutar inserción
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
   * Procesa las tablas de detalle en orden
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
    processedTables,
    bonificationMapping = null
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
          true,
          bonificationMapping
        );
      }

      processedTables.push(detailConfig.name);
    }
  }

  // =======================================
  // MÉTODOS DE PROCESAMIENTO DE CAMPOS
  // =======================================

  /**
   * Procesa un campo individual con todas las lógicas integradas
   * PRIORIDADES: Lookup → Funciones SQL → Consecutivos → Bonificaciones → Procesamiento normal
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
    columnLengthCache,
    bonificationMapping = null,
    bonificationConfig = null
  ) {
    let value;

    // PRIORIDAD 1: Valores obtenidos por lookup
    if (
      fieldMapping.lookupFromTarget &&
      lookupResults[fieldMapping.targetField] !== undefined
    ) {
      value = lookupResults[fieldMapping.targetField];
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 2: Funciones SQL nativas
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
      "DATEADD",
      "DATEDIFF",
    ];

    const isNativeFunction =
      defaultValue &&
      typeof defaultValue === "string" &&
      sqlNativeFunctions.some((func) =>
        defaultValue.trim().toUpperCase().includes(func)
      );

    if (isNativeFunction) {
      return { value: defaultValue, isDirectSql: true };
    }

    // PRIORIDAD 3: CONSECUTIVOS
    if (
      currentConsecutive &&
      mapping.consecutiveConfig?.enabled &&
      this.shouldReceiveConsecutive(
        fieldMapping,
        mapping.consecutiveConfig,
        tableConfig,
        isDetailTable
      )
    ) {
      value = currentConsecutive.formatted;
      logger.debug(
        `✅ Consecutivo asignado a ${fieldMapping.targetField}: ${value}`
      );
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 4: BONIFICACIONES
    if (bonificationMapping && bonificationConfig) {
      const bonificationFields = [
        bonificationConfig.lineNumberField,
        bonificationConfig.bonificationLineReferenceField,
        bonificationConfig.bonificationQuantityField,
        bonificationConfig.regularQuantityField,
      ].filter(Boolean);

      if (bonificationFields.includes(fieldMapping.targetField)) {
        value = this.getBonificationField(
          fieldMapping.targetField,
          sourceData,
          bonificationMapping,
          bonificationConfig
        );

        if (value !== null && value !== undefined) {
          logger.debug(
            `✅ Campo bonificación ${fieldMapping.targetField}: ${value}`
          );
          return { value, isDirectSql: false };
        }
      }
    }

    // PRIORIDAD 5: Procesamiento normal de campo
    value = this._getFieldValue(fieldMapping, sourceData, lookupResults);

    // Aplicar transformaciones
    value = this._applyFieldTransformations(fieldMapping, sourceData, value);

    return { value, isDirectSql: false };
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
          `No se actualizó consecutivo - valor existente es mayor o igual`
        );
        return false;
      }
    } catch (error) {
      logger.error(`Error al actualizar último consecutivo: ${error.message}`);
      return false;
    }
  }

  /**
   * Verifica si un campo debe recibir el consecutivo
   */
  shouldReceiveConsecutive(
    fieldMapping,
    consecutiveConfig,
    tableConfig,
    isDetailTable
  ) {
    if (isDetailTable) {
      return (
        consecutiveConfig.detailFieldName === fieldMapping.targetField ||
        (consecutiveConfig.applyToTables &&
          consecutiveConfig.applyToTables.some(
            (t) =>
              t.tableName === tableConfig.name &&
              t.fieldName === fieldMapping.targetField
          ))
      );
    } else {
      return (
        consecutiveConfig.fieldName === fieldMapping.targetField ||
        (consecutiveConfig.applyToTables &&
          consecutiveConfig.applyToTables.some(
            (t) =>
              t.tableName === tableConfig.name &&
              t.fieldName === fieldMapping.targetField
          ))
      );
    }
  }

  // =======================================
  // MÉTODOS DE BONIFICACIONES
  // =======================================

  /**
   * Obtiene valor de campo de bonificación específico
   */
  getBonificationField(
    targetField,
    sourceData,
    bonificationMapping,
    bonificationConfig
  ) {
    if (!bonificationConfig || !bonificationMapping) {
      return null;
    }

    const articleCode = sourceData[bonificationConfig.regularArticleField];
    if (!articleCode) {
      return null;
    }

    const articleMapping = this.getArticleMappingFromBonificationData(
      articleCode,
      bonificationMapping
    );
    if (!articleMapping) {
      return null;
    }

    switch (targetField) {
      case bonificationConfig.lineNumberField:
        return articleMapping.lineNumber;

      case bonificationConfig.bonificationLineReferenceField:
        return articleMapping.bonificationLineReference || null;

      case bonificationConfig.bonificationQuantityField:
        if (!articleMapping.isRegular) {
          return sourceData[bonificationConfig.quantityField] || 0;
        }
        return 0;

      case bonificationConfig.regularQuantityField:
        if (articleMapping.isRegular) {
          return sourceData[bonificationConfig.quantityField] || 0;
        }
        return 0;

      default:
        return null;
    }
  }

  /**
   * Obtiene mapeo de artículo desde datos de bonificación
   */
  getArticleMappingFromBonificationData(articleCode, bonificationMapping) {
    if (!bonificationMapping) return null;

    // Verificar si es artículo regular
    if (bonificationMapping.regularMapping?.has(articleCode)) {
      const regular = bonificationMapping.regularMapping.get(articleCode);
      return {
        isRegular: true,
        lineNumber: regular.lineNumber,
        bonificationLineReference: null,
      };
    }

    // Verificar si es bonificación
    if (bonificationMapping.bonificationMapping?.has(articleCode)) {
      const bonification =
        bonificationMapping.bonificationMapping.get(articleCode);
      return {
        isRegular: false,
        lineNumber: bonification.lineNumber,
        bonificationLineReference: bonification.bonificationLineReference,
      };
    }

    return null;
  }

  // =======================================
  // MÉTODOS DE LOOKUP Y VALIDACIONES
  // =======================================

  /**
   * Realiza consultas de lookup en la base de datos destino
   */
  async lookupValuesFromTarget(tableConfig, sourceData, targetConnection) {
    try {
      logger.info(
        `Realizando consultas de lookup en base de datos destino para tabla ${tableConfig.name}`
      );

      const lookupResults = {};
      const failedLookups = [];

      // Identificar campos que requieren lookup
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        return { results: {}, success: true };
      }

      // Ejecutar cada consulta de lookup
      for (const fieldMapping of lookupFields) {
        try {
          const result = await this._executeLookupQuery(
            fieldMapping,
            sourceData,
            targetConnection
          );

          if (result.success) {
            lookupResults[fieldMapping.targetField] = result.value;
          } else if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: result.error,
            });
          } else {
            lookupResults[fieldMapping.targetField] = null;
          }
        } catch (fieldError) {
          const errorMsg = `Error en lookup para ${fieldMapping.targetField}: ${fieldError.message}`;

          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
            });
          } else {
            lookupResults[fieldMapping.targetField] = null;
          }
        }
      }

      // Verificar errores críticos
      const criticalFailures = failedLookups.filter((fail) => {
        const field = lookupFields.find((f) => f.targetField === fail.field);
        return field && field.failIfNotFound;
      });

      if (criticalFailures.length > 0) {
        return {
          results: lookupResults,
          success: false,
          failedFields: criticalFailures,
          error: `Error en validación de datos: ${criticalFailures
            .map((f) => `${f.field}: ${f.error}`)
            .join(", ")}`,
        };
      }

      return {
        results: lookupResults,
        success: true,
        failedFields: failedLookups,
      };
    } catch (error) {
      logger.error(
        `Error general al ejecutar lookup en destino: ${error.message}`
      );
      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  // =======================================
  // MÉTODOS DE CONSULTAS DE DATOS
  // =======================================

  /**
   * Obtiene datos de la tabla de origen
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    if (tableConfig.customQuery) {
      const query = tableConfig.customQuery.replace(/@documentId/g, documentId);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset[0];
    } else {
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const tableAlias = "t1";
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

      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });
      return result.recordset[0];
    }
  }

  /**
   * Obtiene datos de detalle
   */
  async getDetailData(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    if (detailConfig.customQuery) {
      const query = detailConfig.customQuery.replace(
        /@documentId/g,
        documentId
      );
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset;
    } else if (detailConfig.useSameSourceTable) {
      return this.getDetailDataFromSameTable(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );
    } else {
      return this.getDetailDataFromOwnTable(
        detailConfig,
        documentId,
        sourceConnection
      );
    }
  }

  /**
   * Obtiene datos de detalle de la misma tabla que el encabezado
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const tableAlias = "d1";
    const orderByColumn = detailConfig.orderByColumn || "";
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);
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

    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });
    return result.recordset;
  }

  /**
   * Obtiene datos de detalle de su propia tabla
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "";
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);
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

    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });
    return result.recordset;
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
      const promotionFields = ["ART_BON"];
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
   * Obtiene documentos según filtros especificados
   */
  async getDocuments(mapping, filters, connection) {
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

      // Verificar existencia de tabla y obtener columnas
      const tableInfo = await this._validateAndGetTableInfo(
        mainTable.sourceTable,
        connection
      );

      // Construir campos a seleccionar
      const selectFields = this._buildSelectFields(
        mainTable,
        tableInfo.availableColumns
      );

      // Construir y ejecutar consulta
      const query = this._buildDocumentQuery(
        mainTable,
        selectFields,
        filters,
        tableInfo.availableColumns
      );
      const params = this._buildQueryParams(
        filters,
        tableInfo.availableColumns,
        mapping
      );

      const result = await SqlService.query(connection, query, params);
      return result.recordset || [];
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  // =======================================
  // MÉTODOS DE INSERCIÓN Y ACTUALIZACIÓN
  // =======================================

  /**
   * Ejecuta la inserción en la base de datos
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
      // Verificar balance de campos y valores
      if (targetFields.length !== targetValues.length) {
        throw new Error(
          `Desbalance de campos y valores: ${targetFields.length} campos vs ${targetValues.length} valores`
        );
      }

      // Filtrar datos para parámetros
      const filteredTargetData = {};
      for (const field in targetData) {
        if (!directSqlFields.has(field)) {
          filteredTargetData[field] = targetData[field];
        }
      }

      // Verificar parámetros faltantes
      const expectedParams = targetFields.filter(
        (field) => !directSqlFields.has(field)
      );
      const missingParams = expectedParams.filter(
        (field) => !Object.keys(filteredTargetData).includes(field)
      );

      if (missingParams.length > 0) {
        missingParams.forEach((param) => {
          logger.warn(`⚠️ Agregando parámetro faltante ${param} = NULL`);
          filteredTargetData[param] = null;
        });
      }

      // Construir consulta
      const insertFieldsList = targetFields;
      const insertValuesList = targetFields.map((field, index) => {
        return directSqlFields.has(field) ? targetValues[index] : `@${field}`;
      });

      const insertQuery = `
        INSERT INTO ${targetTable} (${insertFieldsList.join(", ")})
        VALUES (${insertValuesList.join(", ")})
      `;

      // Debug para bonificaciones
      if (targetTable.includes("PEDIDO_LINEA")) {
        logger.debug(`🔍 Insertando en ${targetTable}: ${insertQuery}`);
        logger.debug(
          `🔍 Parámetros: ${JSON.stringify(filteredTargetData, null, 2)}`
        );
      }

      await SqlService.query(targetConnection, insertQuery, filteredTargetData);
    } catch (error) {
      logger.error(`❌ Error en inserción a ${targetTable}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca documentos como procesados
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    if (!mapping.markProcessedField || docArray.length === 0) {
      return {
        success: 0,
        failed: 0,
        strategy: "none",
        message: "No hay campo de marcado configurado",
      };
    }

    const strategy = mapping.markProcessedStrategy || "individual";

    switch (strategy) {
      case "individual":
        return await this._markIndividualDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );
      case "batch":
        return await this._markBatchDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );
      case "none":
        return {
          success: 0,
          failed: 0,
          strategy: "none",
          message: "Marcado deshabilitado por configuración",
        };
      default:
        return await this._markIndividualDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );
    }
  }

  // =======================================
  // MÉTODOS DE GESTIÓN DE CONFIGURACIONES
  // =======================================

  /**
   * Crea una nueva configuración de mapeo
   */
  async createMapping(mappingData) {
    try {
      // Si no hay taskId, crear una tarea por defecto
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
      logger.error(`Error al crear configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza una configuración de mapeo existente
   */
  async updateMapping(mappingId, mappingData) {
    try {
      const existingMapping = await TransferMapping.findById(mappingId);
      if (!existingMapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Actualizar tarea asociada si es necesario
      await this._updateAssociatedTask(existingMapping, mappingData);

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

  // =======================================
  // MÉTODOS DE UTILIDAD Y HELPERS
  // =======================================

  /**
   * Aplica conversión de unidades a un valor específico
   */
  applyUnitConversion(sourceData, fieldMapping, originalValue) {
    try {
      if (!fieldMapping.unitConversion?.enabled) {
        return originalValue;
      }

      const config = fieldMapping.unitConversion;

      // Validar configuración completa
      if (
        !config.unitMeasureField ||
        !config.conversionFactorField ||
        !config.fromUnit ||
        !config.toUnit
      ) {
        logger.error(
          `⚠️ Configuración de conversión incompleta para ${fieldMapping.targetField}`
        );
        return originalValue;
      }

      // Buscar campos con diferentes variaciones
      const unitMeasureValue = this._findFieldValue(sourceData, [
        config.unitMeasureField,
        "Unit_Measure",
        "UNIT_MEASURE",
        "UNI_MED",
        "UNIDAD",
      ]);

      const conversionFactorValue = this._findFieldValue(sourceData, [
        config.conversionFactorField,
        "Factor_Conversion",
        "FACTOR_CONVERSION",
        "CNT_MAX",
        "FACTOR",
      ]);

      if (!unitMeasureValue || !conversionFactorValue) {
        logger.warn(`⚠️ Campos de conversión no encontrados`);
        return originalValue;
      }

      const conversionFactor = parseFloat(conversionFactorValue);
      if (isNaN(conversionFactor) || conversionFactor <= 0) {
        logger.error(
          `❌ Factor de conversión inválido: ${conversionFactorValue}`
        );
        return originalValue;
      }

      // Verificar si necesita conversión
      if (!this.shouldApplyUnitConversion(unitMeasureValue, config.fromUnit)) {
        return originalValue;
      }

      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(`⚠️ Valor original no es numérico: ${originalValue}`);
        return originalValue;
      }

      // Realizar conversión
      let convertedValue;
      if (config.operation === "multiply") {
        convertedValue = numericValue * conversionFactor;
      } else if (config.operation === "divide") {
        if (conversionFactor === 0) {
          logger.error(`❌ No se puede dividir por cero`);
          return originalValue;
        }
        convertedValue = numericValue / conversionFactor;
      } else {
        logger.error(
          `❌ Operación de conversión no válida: ${config.operation}`
        );
        return originalValue;
      }

      const roundedValue = Math.round(convertedValue * 100) / 100;

      logger.info(
        `🎉 Conversión completada: ${originalValue} ${config.fromUnit} → ${roundedValue} ${config.toUnit}`
      );
      return roundedValue;
    } catch (error) {
      logger.error(`💥 Error en conversión de unidades: ${error.message}`);
      return originalValue;
    }
  }

  /**
   * Verifica si debe aplicarse conversión basado en la unidad de medida
   */
  shouldApplyUnitConversion(currentUnit, fromUnit) {
    if (!currentUnit || !fromUnit) return false;

    const normalizedCurrent = String(currentUnit).toUpperCase().trim();
    const normalizedFrom = String(fromUnit).toUpperCase().trim();

    // Variaciones de unidades comunes
    const unitVariations = {
      CAJA: ["CAJA", "CJA", "CAJAS", "CJ", "CAJ", "BOX", "BOXES"],
      UNIDAD: [
        "UNIDAD",
        "UND",
        "UNIDADES",
        "U",
        "UN",
        "UNIT",
        "UNITS",
        "PCS",
        "PIEZAS",
      ],
      KILO: ["KILO", "KG", "KILOS", "K", "KILOGRAMO", "KILOGRAMOS"],
      LITRO: ["LITRO", "LT", "LITROS", "L", "LTR"],
      METRO: ["METRO", "M", "METROS", "MTS", "MT"],
      GRAMO: ["GRAMO", "G", "GRAMOS", "GR"],
    };

    // Buscar en variaciones predefinidas
    for (const [baseUnit, variations] of Object.entries(unitVariations)) {
      if (
        variations.includes(normalizedFrom) &&
        variations.includes(normalizedCurrent)
      ) {
        return true;
      }
    }

    // Comparación directa
    return normalizedCurrent === normalizedFrom;
  }

  /**
   * Determina el tipo de documento basado en las reglas
   */
  determineDocumentType(documentTypeRules, sourceData) {
    if (!documentTypeRules || !Array.isArray(documentTypeRules)) {
      return "unknown";
    }

    for (const rule of documentTypeRules) {
      const fieldValue = sourceData[rule.sourceField];
      if (rule.sourceValues && rule.sourceValues.includes(fieldValue)) {
        return rule.name;
      }
    }
    return "unknown";
  }

  /**
   * Obtiene campos requeridos de una configuración de tabla
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    if (tableConfig.fieldMappings?.length > 0) {
      tableConfig.fieldMappings.forEach((fm) => {
        // Campo de origen
        if (fm.sourceField) {
          requiredFields.add(fm.sourceField);
        }

        // Campos para conversión de unidades
        if (fm.unitConversion?.enabled) {
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
   */
  processFilterCondition(filterCondition, tableAlias) {
    return filterCondition.replace(/\b(\w+)\b/g, (match, field) => {
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
      return match;
    });
  }

  /**
   * Formatea fechas en formato SQL Server
   */
  formatSqlDate(dateValue) {
    if (!dateValue) return null;

    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === "string") {
      date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return null;
      }
    } else {
      return null;
    }

    return date.toISOString().split("T")[0];
  }

  // =======================================
  // MÉTODOS DE MANEJO DE ERRORES
  // =======================================

  /**
   * Maneja errores de procesamiento
   */
  handleProcessingError(error, documentId, currentConsecutive, mapping) {
    // Error de conexión
    if (
      error.name === "AggregateError" ||
      error.stack?.includes("AggregateError")
    ) {
      return {
        success: false,
        message: `Error de conexión: Se perdió la conexión con la base de datos.`,
        documentType: "unknown",
        errorCode: "CONNECTION_ERROR",
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
      };
    }

    // Error de truncado
    if (error.message?.includes("String or binary data would be truncated")) {
      const columnName =
        error.message.match(/column '([^']+)'/)?.[1] || "desconocida";
      return {
        success: false,
        message: `Error de truncado: El valor es demasiado largo para la columna '${columnName}'.`,
        documentType: "unknown",
        errorCode: "TRUNCATION_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    // Error de valor NULL
    if (error.message?.includes("Cannot insert the value NULL into column")) {
      const columnName =
        error.message.match(/column '([^']+)'/)?.[1] || "desconocida";
      return {
        success: false,
        message: `No se puede insertar NULL en la columna '${columnName}' que no permite valores nulos.`,
        documentType: "unknown",
        errorCode: "NULL_VALUE_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    // Error general
    return {
      success: false,
      message: error.message || "Error desconocido durante el procesamiento",
      documentType: "unknown",
      errorCode: this._determineErrorCode(error),
      consecutiveUsed: currentConsecutive?.formatted || null,
      consecutiveValue: currentConsecutive?.value || null,
    };
  }

  // =======================================
  // MÉTODOS PRIVADOS DE APOYO
  // =======================================

  /**
   * Asegura configuraciones por defecto
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
    };

    for (const documentId of documentIds) {
      if (signal?.aborted) {
        throw new Error("Procesamiento cancelado por el usuario");
      }

      try {
        // Generar consecutivo por documento
        let currentConsecutive = null;

        if (mapping.consecutiveConfig?.enabled) {
          if (useCentralizedConsecutives && centralizedConsecutiveId) {
            const consecutiveResult =
              await ConsecutiveService.getNextConsecutiveValue(
                centralizedConsecutiveId,
                { segment: null }
              );

            if (consecutiveResult?.success) {
              currentConsecutive = {
                value:
                  consecutiveResult.data.nextValue ||
                  consecutiveResult.data.value,
                formatted:
                  consecutiveResult.data.formattedValue ||
                  consecutiveResult.data.value,
                isCentralized: true,
              };
            }
          } else {
            currentConsecutive = await this.generateConsecutive(mapping);
            if (currentConsecutive) {
              currentConsecutive.isCentralized = false;
            }
          }
        }

        // Obtener mapeo de bonificaciones específico del documento
        const bonificationMapping =
          documentBonificationMappings.get(documentId) || null;

        // Procesar documento
        const result = await this.processDocument(
          documentId,
          mapping,
          sourceConnection,
          targetConnection,
          currentConsecutive,
          bonificationMapping
        );

        if (result.success) {
          results.processed++;
          if (currentConsecutive) {
            results.consecutivesUsed.push({
              documentId,
              consecutive: currentConsecutive.formatted,
              value: currentConsecutive.value,
            });
          }
        } else {
          results.failed++;
        }

        results.details.push(result);
      } catch (error) {
        logger.error(
          `❌ Error procesando documento ${documentId}: ${error.message}`
        );
        results.failed++;
        results.details.push({
          documentId,
          success: false,
          message: error.message,
          consecutiveUsed: null,
        });
      }
    }

    return results;
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
    // Actualizar último consecutivo local si se usó
    if (
      !useCentralizedConsecutives &&
      mapping.consecutiveConfig?.enabled &&
      results.consecutivesUsed.length > 0
    ) {
      const lastConsecutive = Math.max(
        ...results.consecutivesUsed.map((c) => c.value)
      );
      await this.updateLastConsecutive(mappingId, lastConsecutive);
    }

    // Actualizar ejecución
    if (executionId) {
      const executionTime = Date.now() - startTime;
      let finalStatus = "completed";

      if (results.processed === 0 && results.failed > 0) {
        finalStatus = "failed";
      } else if (results.failed > 0) {
        finalStatus = "partial";
      }

      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        executionTime,
        totalRecords: results.processed + results.failed,
        successfulRecords: results.processed,
        failedRecords: results.failed,
        details: results,
      });
    }
  }

  /**
   * Actualiza ejecución fallida
   */
  async _updateFailedExecution(executionId, error, executionTime) {
    try {
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: "failed",
        executionTime,
        error: error.message,
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
   * Aplica transformaciones de campo
   */
  _applyFieldTransformations(fieldMapping, sourceData, value) {
    // Aplicar conversión de unidades
    if (fieldMapping.unitConversion?.enabled) {
      const originalValue = value;
      value = this.applyUnitConversion(sourceData, fieldMapping, value);

      if (originalValue !== value) {
        logger.info(
          `🔄 Conversión aplicada en ${fieldMapping.targetField}: ${originalValue} → ${value}`
        );
      }
    }

    // Formatear fechas
    if (
      typeof value !== "number" &&
      (value instanceof Date ||
        (typeof value === "string" && value.includes("T")))
    ) {
      value = this.formatSqlDate(value);
    }

    return value;
  }

  /**
   * Busca valor de campo con múltiples nombres posibles
   */
  _findFieldValue(sourceData, possibleFieldNames) {
    for (const fieldName of possibleFieldNames) {
      if (
        sourceData[fieldName] !== undefined &&
        sourceData[fieldName] !== null
      ) {
        return sourceData[fieldName];
      }
    }
    return null;
  }

  /**
   * Determina código de error
   */
  _determineErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes("cannot insert the value null into column")) {
      return "NULL_VALUE_ERROR";
    } else if (message.includes("string or binary data would be truncated")) {
      return "TRUNCATION_ERROR";
    } else if (message.includes("connection") || message.includes("timeout")) {
      return "CONNECTION_ERROR";
    } else if (
      message.includes("deadlock") ||
      message.includes("lock request")
    ) {
      return "DEADLOCK_ERROR";
    } else if (message.includes("duplicate key")) {
      return "DUPLICATE_KEY_ERROR";
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
  _buildDefaultTaskData(mappingData) {
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
  async _updateAssociatedTask(existingMapping, mappingData) {
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
        logger.warn(`Error al actualizar tarea asociada: ${taskError.message}`);
      }
    }

    // Crear tarea si no existe
    if (!existingMapping.taskId && !mappingData.taskId) {
      const taskData = this._buildDefaultTaskData(mappingData);
      const task = new TransferTask(taskData);
      await task.save();
      mappingData.taskId = task._id;
      logger.info(`Tarea por defecto creada para mapeo existente: ${task._id}`);
    }
  }

  /**
   * Ejecuta consulta de lookup individual
   */
  async _executeLookupQuery(fieldMapping, sourceData, targetConnection) {
    try {
      let lookupQuery = fieldMapping.lookupQuery;
      const params = {};

      // Preparar parámetros
      if (fieldMapping.lookupParams?.length > 0) {
        for (const param of fieldMapping.lookupParams) {
          if (!param.sourceField || !param.paramName) continue;

          let paramValue = sourceData[param.sourceField];

          // Aplicar eliminación de prefijo si está configurado
          if (
            fieldMapping.removePrefix &&
            typeof paramValue === "string" &&
            paramValue.startsWith(fieldMapping.removePrefix)
          ) {
            paramValue = paramValue.substring(fieldMapping.removePrefix.length);
          }

          params[param.paramName] = paramValue;
        }
      }

      // Asegurar que es una consulta SELECT
      if (!lookupQuery.trim().toUpperCase().startsWith("SELECT")) {
        lookupQuery = `SELECT ${lookupQuery} AS result`;
      }

      const result = await SqlService.query(
        targetConnection,
        lookupQuery,
        params
      );

      if (result.recordset?.length > 0) {
        const value =
          result.recordset[0].result !== undefined
            ? result.recordset[0].result
            : Object.values(result.recordset[0])[0];

        return { success: true, value };
      } else {
        return { success: false, error: "No se encontraron resultados" };
      }
    } catch (error) {
      return {
        success: false,
        error: `Error en consulta SQL: ${error.message}`,
      };
    }
  }

  /**
   * Valida tabla y obtiene información
   */
  async _validateAndGetTableInfo(tableName, connection) {
    let schema = "dbo";
    let table = tableName;

    if (tableName.includes(".")) {
      [schema, table] = tableName.split(".");
    }

    // Verificar existencia
    const checkTableQuery = `
      SELECT COUNT(*) AS table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
    `;

    const tableCheck = await SqlService.query(connection, checkTableQuery);
    if (!tableCheck.recordset || tableCheck.recordset[0].table_exists === 0) {
      throw new Error(`La tabla '${schema}.${table}' no existe`);
    }

    // Obtener columnas
    const columnsQuery = `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'
    `;

    const columnsResult = await SqlService.query(connection, columnsQuery);
    const availableColumns = columnsResult.recordset.map((c) => c.COLUMN_NAME);

    return {
      fullTableName: `${schema}.${table}`,
      availableColumns,
    };
  }

  /**
   * Construye campos de selección
   */
  _buildSelectFields(mainTable, availableColumns) {
    let selectFields = [];

    if (mainTable.fieldMappings?.length > 0) {
      for (const mapping of mainTable.fieldMappings) {
        if (
          mapping.sourceField &&
          availableColumns.includes(mapping.sourceField)
        ) {
          selectFields.push(mapping.sourceField);
        }
      }
    }

    if (selectFields.length === 0) {
      selectFields = availableColumns;
    }

    return selectFields;
  }

  /**
   * Construye consulta de documentos
   */
  _buildDocumentQuery(mainTable, selectFields, filters, availableColumns) {
    const selectFieldsStr = selectFields.join(", ");
    let query = `SELECT TOP 500 ${selectFieldsStr} FROM ${mainTable.sourceTable} WHERE 1=1`;

    // Aplicar filtros de fecha
    const dateField = this._findValidDateField(filters, availableColumns);
    if (dateField) {
      if (filters.dateFrom) {
        query += ` AND ${dateField} >= @dateFrom`;
      }
      if (filters.dateTo) {
        query += ` AND ${dateField} <= @dateTo`;
      }
      query += ` ORDER BY ${dateField} DESC`;
    } else {
      query += ` ORDER BY ${selectFields[0]} DESC`;
    }

    return query;
  }

  /**
   * Construye parámetros de consulta
   */
  _buildQueryParams(filters, availableColumns, mapping) {
    const params = {};

    if (filters.dateFrom) {
      params.dateFrom = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      params.dateTo = new Date(filters.dateTo);
    }

    return params;
  }

  /**
   * Encuentra campo de fecha válido
   */
  _findValidDateField(filters, availableColumns) {
    const possibleDateFields = [
      filters.dateField || "FEC_PED",
      "FECHA",
      "DATE",
      "CREATED_DATE",
      "FECHA_CREACION",
      "FECHA_PEDIDO",
    ];

    return possibleDateFields.find((field) => availableColumns.includes(field));
  }

  /**
   * Marca documentos individualmente
   */
  async _markIndividualDocuments(documentIds, mapping, connection, shouldMark) {
    let success = 0;
    let failed = 0;
    const details = [];

    for (const documentId of documentIds) {
      try {
        const result = await this._markSingleDocument(
          documentId,
          mapping,
          connection,
          shouldMark
        );
        if (result) {
          success++;
          details.push({ documentId, success: true });
        } else {
          failed++;
          details.push({
            documentId,
            success: false,
            error: "No se encontró el documento",
          });
        }
      } catch (error) {
        failed++;
        details.push({ documentId, success: false, error: error.message });
      }
    }

    return {
      success,
      failed,
      strategy: "individual",
      total: documentIds.length,
      details,
      message: `Marcado individual: ${success} éxitos, ${failed} fallos`,
    };
  }

  /**
   * Marca documentos en lotes
   */
  async _markBatchDocuments(documentIds, mapping, connection, shouldMark) {
    try {
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        return {
          success: 0,
          failed: documentIds.length,
          strategy: "batch",
          error: "No se encontró tabla principal",
        };
      }

      const batchSize = mapping.markProcessedConfig?.batchSize || 100;
      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        const result = await this._executeBatchUpdate(
          batch,
          mapping,
          connection,
          shouldMark
        );
        totalSuccess += result.success;
        totalFailed += result.failed;
      }

      return {
        success: totalSuccess,
        failed: totalFailed,
        strategy: "batch",
        total: documentIds.length,
        message: `Marcado en lotes: ${totalSuccess} éxitos, ${totalFailed} fallos`,
      };
    } catch (error) {
      return {
        success: 0,
        failed: documentIds.length,
        strategy: "batch",
        error: error.message,
      };
    }
  }

  /**
   * Ejecuta actualización en lote
   */
  async _executeBatchUpdate(documentIds, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const config = mapping.markProcessedConfig || {};

    let updateFields = `${mapping.markProcessedField} = @processedValue`;
    if (config.includeTimestamp && config.timestampField) {
      updateFields += `, ${config.timestampField} = GETDATE()`;
    }

    const placeholders = documentIds
      .map((_, index) => `@doc${index}`)
      .join(", ");
    const params = {
      processedValue: shouldMark ? mapping.markProcessedValue : null,
    };

    documentIds.forEach((id, index) => {
      params[`doc${index}`] = id;
    });

    const query = `
      UPDATE ${mainTable.sourceTable}
      SET ${updateFields}
      WHERE ${primaryKey} IN (${placeholders})
    `;

    const result = await SqlService.query(connection, query, params);
    return {
      success: result.rowsAffected || 0,
      failed: documentIds.length - (result.rowsAffected || 0),
    };
  }

  /**
   * Marca un documento individual
   */
  async _markSingleDocument(documentId, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) return false;

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const config = mapping.markProcessedConfig || {};

    let updateFields = `${mapping.markProcessedField} = @processedValue`;
    if (config.includeTimestamp && config.timestampField) {
      updateFields += `, ${config.timestampField} = GETDATE()`;
    }

    const query = `
      UPDATE ${mainTable.sourceTable}
      SET ${updateFields}
      WHERE ${primaryKey} = @documentId
    `;

    const params = {
      documentId,
      processedValue: shouldMark ? mapping.markProcessedValue : null,
    };

    const result = await SqlService.query(connection, query, params);
    return result.rowsAffected > 0;
  }
}

module.exports = new DynamicTransferService();
