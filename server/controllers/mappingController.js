const DynamicTransferService = require("../services/DynamicTransferService");
const logger = require("../services/logger");
const TransferMapping = require("../models/transferMappingModel");
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");
const ConsecutiveService = require("../services/ConsecutiveService");

/**
 * Obtiene todas las configuraciones de mapeo
 */
const getMappings = async (req, res) => {
  try {
    const includeInactive = req.query.all === "true";
    const mappings = await DynamicTransferService.getMappings({ includeInactive });
    res.json({
      success: true,
      data: mappings,
    });
  } catch (error) {
    logger.error(`Error al obtener configuraciones de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "No se pudieron recuperar los mapeos",
      error: error.message,
    });
  }
};

/**
 * Obtiene una configuración de mapeo por ID
 */
const getMappingById = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    logger.error(`Error al obtener configuración de mapeo ${req.params.mappingId}: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al recuperar el mapeo solicitado",
      error: error.message,
    });
  }
};

/**
 * Crea una nueva configuración de mapeo
 */
const createMapping = async (req, res) => {
  try {
    const mappingData = req.body;
    const mapping = await DynamicTransferService.createMapping(mappingData);

    logger.info(`Nuevo mapping creado: ${mapping.name} por ${req.user?.email || "system"}`);

    res.status(201).json({
      success: true,
      message: "Configuración de mapeo creada correctamente",
      data: mapping,
    });
  } catch (error) {
    logger.error(`Error al crear configuración de mapeo: ${error.message}`);
    res.status(400).json({
      success: false,
      message: "No se pudo crear la configuración",
      error: error.message,
    });
  }
};

/**
 * Actualiza una configuración de mapeo existente
 */
const updateMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mappingData = req.body;

    logger.info(`Actualizando mapping: ${mappingId}`);

    const mapping = await DynamicTransferService.updateMapping(mappingId, mappingData);

    res.json({
      success: true,
      message: "Configuración de mapeo actualizada correctamente",
      data: mapping,
    });
  } catch (error) {
    logger.error(`Error al actualizar configuración de mapeo ${req.params.mappingId}: ${error.message}`);
    res.status(400).json({
      success: false,
      message: "Error al actualizar la configuración",
      error: error.message,
    });
  }
};

/**
 * Elimina una configuración de mapeo
 */
const deleteMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const result = await DynamicTransferService.deleteMapping(mappingId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    logger.info(`Mapping eliminado: ${mappingId}`);
    res.json({
      success: true,
      message: "Configuración de mapeo eliminada correctamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar configuración de mapeo ${req.params.mappingId}: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la configuración",
      error: error.message,
    });
  }
};

/**
 * Obtiene documentos según una configuración de mapeo
 */
const getDocumentsByMapping = async (req, res) => {
  let connection = null;

  try {
    const { mappingId } = req.params;
    const filters = req.query;

    logger.info(`Solicitud de documentos para mapeo ${mappingId}`);

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la configuración de mapeo con ID ${mappingId}`,
      });
    }

    const mainTable = mapping.tableConfigs?.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      return res.status(400).json({
        success: false,
        message: "La configuración no tiene una tabla principal definida",
      });
    }

    connection = await DatabaseServiceAdapter.getConnection(mapping.sourceServer);
    if (!connection) {
      return res.status(503).json({
        success: false,
        message: `No se pudo conectar al servidor origen: ${mapping.sourceServer}`,
      });
    }

    const documents = await DynamicTransferService.getDocuments(
      mapping,
      {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        status: filters.status || "all",
        warehouse: filters.warehouse || "all",
        showProcessed: filters.showProcessed === "true",
        dateField: filters.dateField || mapping.tableConfigs?.find(tc => !tc.isDetailTable)?.dateField,
        statusField: filters.statusField || mapping.tableConfigs?.find(tc => !tc.isDetailTable)?.statusField,
        warehouseField: filters.warehouseField || mapping.tableConfigs?.find(tc => !tc.isDetailTable)?.warehouseField,
        searchTerm: filters.searchTerm,
        searchField: filters.searchField
      },
      connection
    );

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    logger.error(`Error en getDocumentsByMapping: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al recuperar documentos desde el servidor origen",
      error: error.message,
    });
  } finally {
    if (connection) {
      await DatabaseServiceAdapter.releaseConnection(connection).catch(e =>
        logger.error(`Error al liberar conexión: ${e.message}`)
      );
    }
  }
};

/**
 * Obtiene detalles de un documento específico
 */
const getDocumentDetailsByMapping = async (req, res) => {
  let connection = null;
  try {
    const { mappingId, documentId } = req.params;

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    connection = await DatabaseServiceAdapter.getConnection(mapping.sourceServer);
    const details = {};

    // 1. Fetch main header
    const mainTable = mapping.tableConfigs.find(tc => !tc.isDetailTable);
    if (mainTable) {
      const headerQuery = `
        SELECT * FROM ${mainTable.sourceTable}
        WHERE ${mainTable.primaryKey} = @documentId
      `;
      const headerResult = await DatabaseServiceAdapter.query(connection, headerQuery, { documentId });
      details[mainTable.name] = headerResult.recordset || [];
    }

    // 2. Fetch details
    const detailConfigs = mapping.tableConfigs.filter((tc) => tc.isDetailTable);
    for (const detailConfig of detailConfigs) {
      let query;
      const orderByColumn = detailConfig.orderByColumn || "";
      const fk = detailConfig.foreignKey || (mainTable ? mainTable.primaryKey : "NUM_PED");

      query = `
        SELECT * FROM ${detailConfig.sourceTable}
        WHERE ${fk} = @documentId
        ${detailConfig.filterCondition ? ` AND ${detailConfig.filterCondition}` : ""}
        ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
      `;

      const result = await DatabaseServiceAdapter.query(connection, query, { documentId });
      details[detailConfig.name] = result.recordset || [];
    }

    res.json({
      success: true,
      data: { documentId, details },
    });
  } catch (error) {
    logger.error(`Error al obtener detalles de documento: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al recuperar detalles del servidor origen",
      error: error.message,
    });
  } finally {
    if (connection) {
      await DatabaseServiceAdapter.releaseConnection(connection).catch(e => logger.error(`Error release: ${e.message}`));
    }
  }
};

/**
 * Procesa documentos según una configuración de mapeo
 */
const processDocumentsByMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { documentIds } = req.body;

    logger.info(`Procesando documentos para mapeo ${mappingId} (Auto-promociones)`);

    // Iniciar proceso en segundo plano
    DynamicTransferService.processDocuments(documentIds, mappingId)
      .then(result => logger.info(`Asíncrono finalizado para ${mappingId}`))
      .catch(err => logger.error(`Error asíncrono ${mappingId}:`, err, {
        level: "error",
        source: "api",
        operationType: "TRANSFER",
        mappingId: mappingId,
        endpoint: req.originalUrl,
        originalStack: err.stack,
        errorDetails: {
          message: err.message,
          mappingId: mappingId,
          documentCount: documentIds?.length,
        }
      }));

    const mapping = await TransferMapping.findById(mappingId);
    res.json({
      success: true,
      message: "Procesamiento iniciado",
      async: true,
      taskId: mapping?.taskId
    });
  } catch (error) {
    logger.error(`Error en procesamiento de documentos:`, error, {
      level: "error",
      source: "api",
      operationType: "TRANSFER",
      mappingId: req.params.mappingId,
      endpoint: req.originalUrl,
      method: req.method,
      originalStack: error.stack,
      errorDetails: {
        message: error.message,
        mappingId: req.params.mappingId,
        documentCount: req.body.documentIds?.length,
      }
    });
    res.status(500).json({
      success: false,
      message: "Error durante el procesamiento de transferencia",
      error: error.message,
    });
  }
};

/**
 * Actualiza la configuración de consecutivos de un mapeo
 */
const updateConsecutiveConfig = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const consecutiveConfig = req.body;

    const mapping = await TransferMapping.findByIdAndUpdate(
      mappingId,
      { consecutiveConfig: consecutiveConfig },
      { new: true }
    );

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    res.json({
      success: true,
      message: "Configuración de consecutivos actualizada correctamente",
      data: mapping.consecutiveConfig,
    });
  } catch (error) {
    logger.error(`Error al actualizar configuración de consecutivos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al actualizar configuración de consecutivos",
      error: error.message,
    });
  }
};

/**
 * Reinicia el consecutivo de un mapeo
 */
const resetConsecutive = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { value } = req.query;
    const initialValue = parseInt(value || "0", 10);

    const mapping = await TransferMapping.findByIdAndUpdate(
      mappingId,
      { "consecutiveConfig.lastValue": initialValue },
      { new: true }
    );

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    res.json({
      success: true,
      message: `Consecutivo reiniciado a ${initialValue}`,
    });
  } catch (error) {
    logger.error(`Error al reiniciar consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al reiniciar consecutivo",
      error: error.message,
    });
  }
};

/**
 * Obtiene detalles de documento con soporte explícito de promociones
 */
const getDocumentDetailsWithPromotions = async (req, res) => {
  let connection = null;
  try {
    const { mappingId, documentId } = req.params;

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    connection = await DatabaseServiceAdapter.getConnection(mapping.sourceServer);
    const detailConfigs = mapping.tableConfigs.filter((tc) => tc.isDetailTable);
    const details = {};

    for (const detailConfig of detailConfigs) {
      const detailData = await DynamicTransferService.getDetailDataWithPromotions(
        documentId,
        detailConfig,
        connection,
        mapping
      );
      details[detailConfig.name] = detailData || [];
    }

    res.json({
      success: true,
      data: { documentId, details, promotionConfig: mapping.promotionConfig || null },
    });
  } catch (error) {
    logger.error(`Error al obtener detalles con promociones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al recuperar detalles con promociones",
      error: error.message,
    });
  } finally {
    if (connection) {
      await DatabaseServiceAdapter.releaseConnection(connection).catch(e => logger.error(`Error release: ${e.message}`));
    }
  }
};

/**
 * Procesa documentos con soporte explícito para promociones
 */
const processDocumentsWithPromotions = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { documentIds } = req.body;

    logger.info(`Procesando documentos con promociones explícitas para mapeo ${mappingId}`);

    const result = await DynamicTransferService.processDocuments(documentIds, mappingId);

    res.json({
      success: true,
      message: result.failed > 0 ? `Procesamiento completado con errores` : "Procesamiento exitoso",
      data: result,
    });
  } catch (error) {
    logger.error(`Error en procesamiento con promociones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error en procesamiento con promociones",
      error: error.message,
    });
  }
};

/**
 * Valida la configuración de promociones de un mapeo
 */
const validatePromotionConfig = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    const config = mapping.promotionConfig || {};
    const issues = [];

    if (!config.enabled) {
      return res.json({
        success: true,
        isValid: true,
        message: "Las promociones están desactivadas para este mapeo",
        data: { enabled: false }
      });
    }

    // Validaciones técnicas
    if (!config.promotionTable) issues.push("Falta definir la tabla de promociones origen");
    if (!config.targetPromotionTable) issues.push("Falta definir la tabla de promociones destino");
    if (!config.mappingRules || config.mappingRules.length === 0) {
      issues.push("No hay reglas de mapeo definidas para promociones");
    }

    const isValid = issues.length === 0;

    res.json({
      success: true,
      isValid,
      issues,
      message: isValid ? "Configuración de promociones válida" : "Se encontraron problemas en la configuración",
      data: config
    });
  } catch (error) {
    logger.error(`Error en validatePromotionConfig: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Error al validar configuración de promociones",
      error: error.message,
    });
  }
};

/**
 * Consulta un valor dinámico (secuencia o lookup) para un campo
 */
const queryDynamicValue = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { fieldConfig, currentData } = req.body;

    if (!mappingId || !fieldConfig) {
      return res.status(400).json({
        success: false,
        message: "Datos insuficientes para la consulta dinámica",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      throw new Error("Mapeo no encontrado");
    }

    // 1. Caso: Secuencia (Consecutivo)
    if (fieldConfig.queryType === "sequence") {
      const consecutiveId = fieldConfig.consecutiveId || fieldConfig.consecutiveName;
      if (!consecutiveId) {
        throw new Error("No se especificó un ID de consecutivo para la secuencia");
      }

      // Obtener el siguiente valor (esto incrementa el contador)
      const nextValue = await ConsecutiveService.getNextConsecutiveValue(
        consecutiveId,
        { segment: currentData?.segment },
        req.user || { id: "SYSTEM", name: "System" }
      );

      return res.json({
        success: true,
        nextValue,
        queryType: "sequence"
      });
    }

    // 2. Caso: Lookup (Consulta SQL)
    if (fieldConfig.queryType === "lookup") {
      if (!fieldConfig.lookupQuery) {
        throw new Error("No se especificó una consulta para el lookup");
      }

      // Reemplazar variables en la consulta con datos actuales (@campo o :campo)
      let query = fieldConfig.lookupQuery;
      if (currentData) {
        Object.entries(currentData).forEach(([key, val]) => {
          if (val === null || val === undefined) val = "";
          // Soporta @campo y :campo
          const regexAt = new RegExp(`@${key}`, 'gi');
          const regexCol = new RegExp(`:${key}`, 'gi');
          query = query.replace(regexAt, val).replace(regexCol, val);
        });
      }

      // Ejecutar en el servidor origen del mapeo
      const result = await DatabaseServiceAdapter.query(
        mapping.sourceServer,
        query
      );

      // Retornar el primer valor de la primera fila
      let value = null;
      if (result && result.length > 0) {
        const firstRow = result[0];
        value = Object.values(firstRow)[0];
      }

      return res.json({
        success: true,
        value,
        queryType: "lookup"
      });
    }

    return res.status(400).json({
      success: false,
      message: `Tipo de consulta dinámica "${fieldConfig.queryType}" no soportado`
    });

  } catch (error) {
    logger.error(`Error en queryDynamicValue: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getMappings,
  getMappingById,
  createMapping,
  updateMapping,
  deleteMapping,
  getDocumentsByMapping,
  getDocumentDetailsByMapping,
  processDocumentsByMapping,
  updateConsecutiveConfig,
  resetConsecutive,
  getDocumentDetailsWithPromotions,
  processDocumentsWithPromotions,
  queryDynamicValue,
  validatePromotionConfig,
};
