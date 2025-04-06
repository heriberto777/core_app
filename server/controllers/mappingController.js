const DynamicTransferService = require("../services/DynamicTransferService");
const ConnectionManager = require("../services/ConnectionManager");
const logger = require("../services/logger");
const TransferMapping = require("../models/transferMappingModel");

/**
 * Obtiene todas las configuraciones de mapeo
 */
const getMappings = async (req, res) => {
  try {
    const mappings = await DynamicTransferService.getMappings();

    res.json({
      success: true,
      data: mappings,
    });
  } catch (error) {
    logger.error(`Error al obtener configuraciones de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene una configuración de mapeo por ID
 */
const getMappingById = async (req, res) => {
  console.log("getDocumentsByMapping", req.params, req.query);
  try {
    const { mappingId } = req.params;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    logger.error(`Error al obtener configuración de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Crea una nueva configuración de mapeo
 */
const createMapping = async (req, res) => {
  try {
    const mappingData = req.body;

    if (!mappingData || !mappingData.name) {
      return res.status(400).json({
        success: false,
        message: "Datos de configuración incompletos",
      });
    }

    const mapping = await DynamicTransferService.createMapping(mappingData);

    res.status(201).json({
      success: true,
      message: "Configuración de mapeo creada correctamente",
      data: mapping,
    });
  } catch (error) {
    logger.error(`Error al crear configuración de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
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

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    if (!mappingData) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron datos para actualizar",
      });
    }

    const mapping = await DynamicTransferService.updateMapping(
      mappingId,
      mappingData
    );

    res.json({
      success: true,
      message: "Configuración de mapeo actualizada correctamente",
      data: mapping,
    });
  } catch (error) {
    logger.error(
      `Error al actualizar configuración de mapeo: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Elimina una configuración de mapeo
 */
const deleteMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const result = await DynamicTransferService.deleteMapping(mappingId);

    if (result) {
      res.json({
        success: true,
        message: "Configuración de mapeo eliminada correctamente",
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }
  } catch (error) {
    logger.error(`Error al eliminar configuración de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
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

    logger.info(`Recibida solicitud de documentos para mapeo ${mappingId}`);
    logger.debug(`Filtros recibidos: ${JSON.stringify(filters)}`);

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración de mapeo",
      });
    }

    // Validación básica de filtros
    if (!filters.dateFrom || !filters.dateTo) {
      return res.status(400).json({
        success: false,
        message: "Se requieren los parámetros 'dateFrom' y 'dateTo'",
      });
    }

    // Obtener configuración de mapeo
    try {
      logger.info(`Buscando configuración de mapeo ${mappingId}`);
      const mapping = await DynamicTransferService.getMappingById(mappingId);

      if (!mapping) {
        return res.status(404).json({
          success: false,
          message: `No se encontró la configuración de mapeo con ID ${mappingId}`,
        });
      }

      logger.info(`Configuración encontrada: ${mapping.name}`);

      // Validar que haya al menos una tabla principal
      const mainTable = mapping.tableConfigs?.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        return res.status(400).json({
          success: false,
          message: "La configuración no tiene una tabla principal definida",
        });
      }

      logger.info(
        `Tabla principal: ${mainTable.name}, sourceTable: ${mainTable.sourceTable}`
      );

      // Obtener conexión al servidor origen
      logger.info(`Conectando a servidor origen: ${mapping.sourceServer}`);
      const connectionResult = await ConnectionManager.enhancedRobustConnect(
        mapping.sourceServer
      );

      if (!connectionResult.success) {
        return res.status(500).json({
          success: false,
          message: `No se pudo establecer conexión a ${mapping.sourceServer}: ${
            connectionResult.error?.message || "Error desconocido"
          }`,
        });
      }

      connection = connectionResult.connection;
      logger.info(
        `Conexión establecida exitosamente a ${mapping.sourceServer}`
      );

      // Obtener documentos
      try {
        logger.info(`Obteniendo documentos usando los filtros...`);
        const documents = await DynamicTransferService.getDocuments(
          mapping,
          {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            status: filters.status || "all",
            warehouse: filters.warehouse || "all",
            showProcessed:
              filters.showProcessed === "true" ||
              filters.showProcessed === true,
            dateField: filters.dateField,
            statusField: filters.statusField,
            warehouseField: filters.warehouseField,
          },
          connection
        );

        logger.info(`Documentos obtenidos: ${documents.length}`);

        return res.json({
          success: true,
          data: documents,
        });
      } catch (docError) {
        logger.error(`Error obteniendo documentos: ${docError.message}`);
        return res.status(500).json({
          success: false,
          message: docError.message,
        });
      }
    } catch (mappingError) {
      logger.error(
        `Error obteniendo configuración de mapeo: ${mappingError.message}`
      );
      return res.status(500).json({
        success: false,
        message: `Error obteniendo configuración: ${mappingError.message}`,
      });
    }
  } catch (error) {
    logger.error(`Error general en getDocumentsByMapping: ${error.message}`);

    // Asegurarse de enviar siempre una respuesta JSON incluso en caso de error
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  } finally {
    // Liberar conexión
    if (connection) {
      try {
        await ConnectionManager.releaseConnection(connection);
        logger.info("Conexión liberada correctamente");
      } catch (e) {
        logger.error(`Error al liberar conexión: ${e.message}`);
      }
    }
  }
};

/**
 * Obtiene detalles de un documento según una configuración de mapeo
 */
const getDocumentDetailsByMapping = async (req, res) => {
  let connection = null;

  console.log("getDocumentsByMapping 2", req.params, req.query);
  try {
    const { mappingId, documentId } = req.params;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren los IDs de la configuración y del documento",
      });
    }

    // Obtener configuración de mapeo
    const mapping = await DynamicTransferService.getMappingById(mappingId);

    // Obtener conexión al servidor origen
    const connectionResult = await ConnectionManager.enhancedRobustConnect(
      mapping.sourceServer
    );
    if (!connectionResult.success) {
      throw new Error(
        `No se pudo establecer conexión a ${mapping.sourceServer}: ${
          connectionResult.error?.message || "Error desconocido"
        }`
      );
    }

    connection = connectionResult.connection;

    // Buscar configuraciones de tablas de detalle
    const detailTableConfigs = mapping.tableConfigs.filter(
      (tc) => tc.isDetailTable
    );

    if (detailTableConfigs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontraron configuraciones de tablas de detalle",
      });
    }

    // Obtener datos para cada tabla de detalle
    const details = {};

    for (const detailConfig of detailTableConfigs) {
      let query;

      if (detailConfig.customQuery) {
        query = detailConfig.customQuery.replace(/@documentId/g, documentId);
      } else {
        query = `
          SELECT * FROM ${detailConfig.sourceTable} 
          WHERE ${detailConfig.primaryKey || "NUM_PED"} = @documentId
          ${
            detailConfig.filterCondition
              ? ` AND ${detailConfig.filterCondition}`
              : ""
          }
          ORDER BY SECUENCIA
        `;
      }

      const result = await SqlService.query(connection, query, { documentId });
      details[detailConfig.name] = result.recordset || [];
    }

    res.json({
      success: true,
      data: {
        documentId,
        details,
      },
    });
  } catch (error) {
    logger.error(`Error al obtener detalles de documento: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    // Liberar conexión
    if (connection) {
      try {
        await ConnectionManager.releaseConnection(connection);
      } catch (e) {
        logger.error(`Error al liberar conexión: ${e.message}`);
      }
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

    logger.info(`Procesando documentos para mapeo ${mappingId}`);
    logger.debug(`Documentos a procesar: ${documentIds?.length || 0}`);

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración de mapeo",
      });
    }

    if (
      !documentIds ||
      !Array.isArray(documentIds) ||
      documentIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Se requiere un array de IDs de documentos",
      });
    }

    // Verificar que el mapeo exista y tenga un taskId asociado
    const mapping = await TransferMapping.findById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la configuración de mapeo con ID ${mappingId}`,
      });
    }

    // Si no tiene taskId, crear una tarea temporal para el procesamiento
    if (!mapping.taskId) {
      logger.warn(
        `El mapeo ${mappingId} no tiene taskId asociado, creando una tarea temporal para procesamiento`
      );

      const TransferTask = require("../models/transferTaks");

      // Determinar tabla principal para consulta por defecto
      const mainTable = mapping.tableConfigs?.find((tc) => !tc.isDetailTable);
      let defaultQuery = "SELECT 1";

      if (mainTable && mainTable.sourceTable) {
        defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
      }

      const taskData = {
        name: `ProcessTask_${mapping.name}_${Date.now()}`,
        type: "manual",
        active: true,
        transferType: mapping.transferType || "down",
        query: defaultQuery,
        parameters: [],
        status: "pending",
      };

      // Crear tarea temporal
      const tempTask = new TransferTask(taskData);
      await tempTask.save();

      // Actualizar el mapeo con la tarea creada
      mapping.taskId = tempTask._id;
      await mapping.save();

      logger.info(`Tarea temporal creada y asociada al mapeo: ${tempTask._id}`);
    }

    // Procesar documentos
    const result = await DynamicTransferService.processDocuments(
      documentIds,
      mappingId
    );

    logger.info(
      `Procesamiento completado: ${result.processed} éxitos, ${result.failed} fallos`
    );

    return res.json({
      success: true,
      message: `Se procesaron ${result.processed} documentos correctamente`,
      data: result,
      details: result.details,
    });
  } catch (error) {
    logger.error(`Error al procesar documentos: ${error.message}`, {
      stack: error.stack,
      requestParams: req.params,
      requestBody: req.body,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Error al procesar documentos",
      errorDetails: error.stack,
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
};
