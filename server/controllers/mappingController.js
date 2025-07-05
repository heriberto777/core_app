const DynamicTransferService = require("../services/DynamicTransferService");
const { SqlService } = require("../services/SqlService");
const ConnectionManager = require("../services/ConnectionCentralService");
const logger = require("../services/logger");
const TransferMapping = require("../models/transferMappingModel");

/**
 * 📋 FUNCIONES BÁSICAS DE MAPPING
 */

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

    logger.debug("Mapping obtenido:", mapping.name);
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

    // Eliminar _id si viene en la data para creación
    if (mappingData._id) {
      delete mappingData._id;
    }

    const mapping = await DynamicTransferService.createMapping(mappingData);

    res.status(201).json({
      success: true,
      data: mapping,
      message: "Configuración de mapeo creada exitosamente",
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
 * Actualiza una configuración de mapeo
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

    const mapping = await DynamicTransferService.updateMapping(
      mappingId,
      mappingData
    );

    res.json({
      success: true,
      data: mapping,
      message: "Configuración de mapeo actualizada exitosamente",
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

    await DynamicTransferService.deleteMapping(mappingId);

    res.json({
      success: true,
      message: "Configuración de mapeo eliminada exitosamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar configuración de mapeo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 📄 FUNCIONES DE DOCUMENTOS
 */

/**
 * Obtiene documentos por configuración de mapeo
 */
const getDocumentsByMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { limit = 50, offset = 0, filters = {} } = req.query;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    const documents = await DynamicTransferService.getDocuments(mapping, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      filters: filters,
    });

    res.json({
      success: true,
      data: documents,
      message: `${documents.length} documentos encontrados`,
    });
  } catch (error) {
    logger.error(`Error al obtener documentos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene detalles de un documento específico
 */
const getDocumentDetailsByMapping = async (req, res) => {
  try {
    const { mappingId, documentId } = req.params;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere ID de mapping y ID de documento",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    const details = await DynamicTransferService.getDocumentDetails(
      mapping,
      documentId
    );

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    logger.error(`Error al obtener detalles del documento: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Procesa documentos por configuración de mapeo
 */
const processDocumentsByMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { documentIds, limit, filters = {} } = req.body;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    let result;

    if (documentIds && documentIds.length > 0) {
      // Procesar documentos específicos
      result = await DynamicTransferService.processDocuments(
        documentIds,
        mappingId
      );
    } else {
      // Obtener documentos según filtros y límite
      const documents = await DynamicTransferService.getDocuments(mapping, {
        ...filters,
        limit: limit || 10,
      });

      if (documents.length === 0) {
        return res.json({
          success: true,
          data: {
            processed: 0,
            failed: 0,
            skipped: 0,
            details: [],
          },
          message: "No se encontraron documentos para procesar",
        });
      }

      const documentIds = documents.map(
        (doc) =>
          doc[
            mapping.tableConfigs.find((tc) => !tc.isDetailTable)?.primaryKey ||
              "NUM_PED"
          ]
      );
      result = await DynamicTransferService.processDocuments(
        documentIds,
        mappingId
      );
    }

    res.json({
      success: result.success || true,
      data: result,
      message: mapping.hasBonificationProcessing
        ? "Mapping ejecutado exitosamente con procesamiento de bonificaciones"
        : "Mapping ejecutado exitosamente",
    });
  } catch (error) {
    logger.error(`Error procesando documentos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🏁 FUNCIONES DE CONSECUTIVOS
 */

/**
 * Actualiza configuración de consecutivos
 */
const updateConsecutiveConfig = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { consecutiveConfig } = req.body;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const mapping = await DynamicTransferService.updateMapping(mappingId, {
      consecutiveConfig,
    });

    res.json({
      success: true,
      data: mapping,
      message: "Configuración de consecutivos actualizada",
    });
  } catch (error) {
    logger.error(`Error actualizando consecutivos: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene el siguiente valor de consecutivo
 */
const getNextConsecutiveValue = async (req, res) => {
  try {
    const { mappingId } = req.params;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping || !mapping.consecutiveConfig) {
      return res.status(404).json({
        success: false,
        message: "Configuración de consecutivos no encontrada",
      });
    }

    const nextValue = await DynamicTransferService.getNextConsecutive(mapping);

    res.json({
      success: true,
      data: { nextValue },
    });
  } catch (error) {
    logger.error(`Error obteniendo consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Resetea consecutivo
 */
const resetConsecutive = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { newValue = 1 } = req.body;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    await DynamicTransferService.resetConsecutive(mappingId, newValue);

    res.json({
      success: true,
      message: `Consecutivo reseteado a ${newValue}`,
    });
  } catch (error) {
    logger.error(`Error reseteando consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 FUNCIONES DE BONIFICACIONES (CORREGIDAS)
 */

/**
 * Valida configuración de bonificaciones
 */
const validateBonifications = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { config } = req.body;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del mapping",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Mapping no encontrado",
      });
    }

    if (!mapping.hasBonificationProcessing) {
      return res.status(400).json({
        success: false,
        message:
          "Este mapping no tiene habilitado el procesamiento de bonificaciones",
      });
    }

    // Aquí puedes agregar lógica de validación específica
    const validation = await DynamicTransferService.validateBonificationConfig(
      mapping,
      config
    );

    res.json({
      success: validation.isValid,
      data: validation,
      message: validation.isValid
        ? "Configuración de bonificaciones válida"
        : "Se encontraron problemas en la configuración",
    });
  } catch (error) {
    logger.error(`Error validando bonificaciones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Preview de procesamiento de bonificaciones (FUNCIÓN CORREGIDA)
 */
const previewBonifications = async (req, res) => {
  try {
    const { mappingId, documentId } = req.params;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere ID de mapping y ID de documento",
      });
    }

    // AQUÍ ESTABA EL PROBLEMA: Asegurar que mapping esté definido
    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Mapping no encontrado",
      });
    }

    if (!mapping.hasBonificationProcessing) {
      return res.status(400).json({
        success: false,
        message:
          "Este mapping no tiene habilitado el procesamiento de bonificaciones",
      });
    }

    const sourceConnection = await ConnectionManager.getConnection(
      mapping.sourceServer
    );

    try {
      // Buscar tabla de detalle
      const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
      if (!detailTable) {
        return res.status(400).json({
          success: false,
          message: "No se encontró tabla de detalle en el mapping",
        });
      }

      // Obtener datos originales
      let originalData;
      if (detailTable.useSameSourceTable) {
        originalData = await DynamicTransferService.getDetailDataFromSameTable(
          detailTable,
          mapping.tableConfigs.find((tc) => !tc.isDetailTable),
          documentId,
          sourceConnection
        );
      } else {
        originalData = await DynamicTransferService.getDetailData(
          detailTable,
          documentId,
          sourceConnection
        );
      }

      if (originalData.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No se encontraron datos para el documento especificado",
        });
      }

      // Procesar bonificaciones
      const processedDetails =
        await DynamicTransferService.processBonifications(
          originalData,
          mapping.bonificationConfig
        );

      // Obtener promociones si están habilitadas
      let promotions = [];
      if (mapping.bonificationConfig.applyPromotionRules) {
        promotions = await DynamicTransferService.getPromotionsForDocument(
          documentId,
          sourceConnection,
          mapping.bonificationConfig
        );
      }

      res.json({
        success: true,
        data: {
          documentId,
          original: {
            totalItems: originalData.length,
            details: originalData,
          },
          processed: {
            totalItems: processedDetails.length,
            regularItems: processedDetails.filter(
              (i) => i.ITEM_TYPE === "REGULAR"
            ).length,
            bonifications: processedDetails.filter(
              (i) => i.ITEM_TYPE === "BONIFICATION"
            ).length,
            orphanBonifications: processedDetails.filter(
              (i) => i.ITEM_TYPE === "BONIFICATION_ORPHAN"
            ).length,
            details: processedDetails,
          },
          promotions,
          transformation: {
            linesAdded: processedDetails.length - originalData.length,
            bonificationsLinked: processedDetails.filter(
              (i) => i.ITEM_TYPE === "BONIFICATION" && i.PEDIDO_LINEA_BONIF
            ).length,
            orphanBonifications: processedDetails.filter(
              (i) => i.ITEM_TYPE === "BONIFICATION_ORPHAN"
            ).length,
          },
        },
      });
    } finally {
      if (sourceConnection && sourceConnection.close) {
        await sourceConnection.close();
      }
    }
  } catch (error) {
    logger.error(`Error en preview de bonificaciones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene estadísticas de bonificaciones
 */
const getBonificationStats = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { dateFrom, dateTo, filters = {} } = req.query;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID del mapping",
      });
    }

    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Mapping no encontrado",
      });
    }

    if (!mapping.hasBonificationProcessing) {
      return res.status(400).json({
        success: false,
        message:
          "Este mapping no tiene habilitado el procesamiento de bonificaciones",
      });
    }

    const stats = await DynamicTransferService.getBonificationStats(mapping, {
      dateFrom,
      dateTo,
      filters,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(
      `Error obteniendo estadísticas de bonificaciones: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  // Funciones básicas
  getMappings,
  getMappingById,
  createMapping,
  updateMapping,
  deleteMapping,

  // Funciones de documentos
  getDocumentsByMapping,
  getDocumentDetailsByMapping,
  processDocumentsByMapping,

  // Funciones de consecutivos
  updateConsecutiveConfig,
  getNextConsecutiveValue,
  resetConsecutive,

  // Funciones de bonificaciones
  validateBonifications,
  previewBonifications,
  getBonificationStats,
};
