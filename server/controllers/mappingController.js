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
    logger.info("🔍 Obteniendo todas las configuraciones de mapeo");
    const mappings = await DynamicTransferService.getMappings();

    res.json({
      success: true,
      data: mappings,
    });

    logger.info(`✅ ${mappings.length} configuraciones obtenidas exitosamente`);
  } catch (error) {
    logger.error(
      `❌ Error al obtener configuraciones de mapeo: ${error.message}`
    );
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
    logger.info(`🔍 Obteniendo configuración de mapeo: ${mappingId}`);

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

    logger.info(`✅ Configuración obtenida: ${mapping.name}`);
  } catch (error) {
    logger.error(
      `❌ Error al obtener configuración de mapeo: ${error.message}`
    );
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
    logger.info(`📝 Creando nuevo mapeo: ${mappingData.name}`);

    if (!mappingData || !mappingData.name) {
      return res.status(400).json({
        success: false,
        message: "Datos de configuración incompletos",
      });
    }

    // Eliminar _id si viene en la data para creación
    if (mappingData._id) {
      logger.debug("🔧 Eliminando _id de datos de creación");
      delete mappingData._id;
    }

    const mapping = await DynamicTransferService.createMapping(mappingData);

    res.status(201).json({
      success: true,
      data: mapping,
      message: "Configuración de mapeo creada exitosamente",
    });

    logger.info(`✅ Mapeo creado exitosamente: ${mapping.name}`);
  } catch (error) {
    logger.error(`❌ Error al crear configuración de mapeo: ${error.message}`);
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
    logger.info(`📝 Actualizando mapeo: ${mappingId}`);

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
      data: mapping,
      message: "Configuración de mapeo actualizada exitosamente",
    });

    logger.info(`✅ Mapeo actualizado exitosamente: ${mapping.name}`);
  } catch (error) {
    logger.error(
      `❌ Error al actualizar configuración de mapeo: ${error.message}`
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
    logger.info(`🗑️ Eliminando mapeo: ${mappingId}`);

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const deleted = await DynamicTransferService.deleteMapping(mappingId);

    if (deleted) {
      res.json({
        success: true,
        message: "Configuración de mapeo eliminada exitosamente",
      });
      logger.info(`✅ Mapeo eliminado exitosamente: ${mappingId}`);
    } else {
      res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
      logger.warn(`⚠️ Mapeo no encontrado para eliminar: ${mappingId}`);
    }
  } catch (error) {
    logger.error(
      `❌ Error al eliminar configuración de mapeo: ${error.message}`
    );
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
    logger.info(`📊 Obteniendo documentos para mapeo: ${mappingId}`);

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

    logger.info(
      `✅ ${documents.length} documentos obtenidos para mapeo: ${mapping.name}`
    );
  } catch (error) {
    logger.error(`❌ Error al obtener documentos: ${error.message}`);
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
    logger.info(
      `📄 Obteniendo detalles del documento: ${documentId} para mapeo: ${mappingId}`
    );

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

    logger.info(`✅ Detalles obtenidos para documento: ${documentId}`);
  } catch (error) {
    logger.error(
      `❌ Error al obtener detalles del documento: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Procesa documentos según una configuración de mapeo
 */
const processDocumentsByMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { documentIds, limit, filters = {} } = req.body;
    logger.info(`🔄 Procesando documentos para mapeo: ${mappingId}`);

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
      logger.info(`🔄 Procesando ${documentIds.length} documentos específicos`);
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

      const docIds = documents.map(
        (doc) =>
          doc[
            mapping.tableConfigs.find((tc) => !tc.isDetailTable)?.primaryKey ||
              "NUM_PED"
          ]
      );

      logger.info(
        `🔄 Procesando ${docIds.length} documentos obtenidos por filtros`
      );
      result = await DynamicTransferService.processDocuments(docIds, mappingId);
    }

    res.json({
      success: result.success || true,
      data: result,
      message: mapping.hasBonificationProcessing
        ? "Mapping ejecutado exitosamente con procesamiento de bonificaciones"
        : "Mapping ejecutado exitosamente",
    });

    logger.info(
      `✅ Procesamiento completado: ${result.processed} éxitos, ${result.failed} fallos`
    );
  } catch (error) {
    logger.error(`❌ Error procesando documentos: ${error.message}`);
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
    logger.info(
      `🔢 Actualizando configuración de consecutivos para mapeo: ${mappingId}`
    );

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

    logger.info(
      `✅ Configuración de consecutivos actualizada para: ${mapping.name}`
    );
  } catch (error) {
    logger.error(`❌ Error actualizando consecutivos: ${error.message}`);
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
    logger.info(`🔢 Obteniendo siguiente consecutivo para mapeo: ${mappingId}`);

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

    logger.info(`✅ Siguiente consecutivo obtenido: ${nextValue}`);
  } catch (error) {
    logger.error(`❌ Error obteniendo consecutivo: ${error.message}`);
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
    logger.info(
      `🔄 Reseteando consecutivo para mapeo: ${mappingId} a valor: ${newValue}`
    );

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    const success = await DynamicTransferService.resetConsecutive(
      mappingId,
      newValue
    );

    if (success) {
      res.json({
        success: true,
        message: `Consecutivo reseteado a ${newValue}`,
      });
      logger.info(`✅ Consecutivo reseteado exitosamente a: ${newValue}`);
    } else {
      res.status(400).json({
        success: false,
        message: "No se pudo resetear el consecutivo",
      });
      logger.warn(
        `⚠️ No se pudo resetear el consecutivo para mapeo: ${mappingId}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error reseteando consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 FUNCIONES DE BONIFICACIONES (NOMBRES CORREGIDOS)
 */

/**
 * Valida configuración de bonificaciones
 * NOMBRE CORREGIDO: validateBonifications (no validateBonificationConfig)
 */
const validateBonifications = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { config } = req.body;
    logger.info(`🎁 Validando bonificaciones para mapeo: ${mappingId}`);

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

    // Validación básica de configuración
    const validation = {
      isValid: true,
      issues: [],
      warnings: [],
    };

    // Verificar que existe tabla de detalle
    const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
    if (!detailTable) {
      validation.isValid = false;
      validation.issues.push("No se encontró tabla de detalle en el mapping");
    }

    // Verificar configuración de bonificaciones
    if (!mapping.bonificationConfig) {
      validation.isValid = false;
      validation.issues.push("Falta configuración de bonificaciones");
    } else {
      const requiredFields = [
        "bonificationIndicatorField",
        "bonificationIndicatorValue",
        "regularArticleField",
        "bonificationReferenceField",
      ];

      requiredFields.forEach((field) => {
        if (!mapping.bonificationConfig[field]) {
          validation.warnings.push(`Campo de configuración faltante: ${field}`);
        }
      });
    }

    // Validar acceso a tabla de origen si está configurada
    if (mapping.bonificationConfig && mapping.bonificationConfig.sourceTable) {
      try {
        const sourceConnection = await ConnectionManager.getConnection(
          mapping.sourceServer
        );
        try {
          const testQuery = `SELECT TOP 1 * FROM ${mapping.bonificationConfig.sourceTable}`;
          await SqlService.query(sourceConnection, testQuery);
          logger.debug(
            `✅ Acceso a tabla de origen verificado: ${mapping.bonificationConfig.sourceTable}`
          );
        } catch (tableError) {
          validation.warnings.push(
            `No se pudo acceder a la tabla origen: ${mapping.bonificationConfig.sourceTable}`
          );
        } finally {
          await ConnectionManager.releaseConnection(sourceConnection);
        }
      } catch (connError) {
        validation.warnings.push(
          "Error de conexión al validar tabla de origen"
        );
      }
    }

    res.json({
      success: validation.isValid,
      data: validation,
      message: validation.isValid
        ? "Configuración de bonificaciones válida"
        : "Se encontraron problemas en la configuración",
    });

    logger.info(
      `✅ Validación de bonificaciones completada para: ${mapping.name}`
    );
  } catch (error) {
    logger.error(`❌ Error validando bonificaciones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Preview de procesamiento de bonificaciones
 * NOMBRE CORREGIDO: previewBonifications (no previewBonificationProcessing)
 */
const previewBonifications = async (req, res) => {
  let sourceConnection = null;

  try {
    const { mappingId, documentId } = req.params;
    logger.info(
      `🎁 Generando preview de bonificaciones para documento: ${documentId} en mapeo: ${mappingId}`
    );

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere ID de mapping y ID de documento",
      });
    }

    // Verificar que mapping existe ANTES de usarlo
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

    // Obtener conexión
    sourceConnection = await ConnectionManager.getConnection(
      mapping.sourceServer
    );

    // Buscar tabla de detalle
    const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
    if (!detailTable) {
      return res.status(400).json({
        success: false,
        message: "No se encontró tabla de detalle en el mapping",
      });
    }

    // Obtener datos originales
    let originalData = [];

    try {
      if (detailTable.useSameSourceTable) {
        originalData = await DynamicTransferService.getDetailDataFromSameTable(
          detailTable,
          mapping.tableConfigs.find((tc) => !tc.isDetailTable),
          documentId,
          sourceConnection
        );
      } else {
        originalData = await DynamicTransferService.getDetailDataFromOwnTable(
          detailTable,
          documentId,
          sourceConnection
        );
      }
    } catch (dataError) {
      logger.error(
        `❌ Error obteniendo datos originales: ${dataError.message}`
      );
      originalData = [];
    }

    if (originalData.length === 0) {
      return res.json({
        success: true,
        data: {
          documentId,
          original: {
            totalItems: 0,
            regularItems: 0,
            bonifications: 0,
            details: [],
          },
          processed: {
            totalItems: 0,
            regularItems: 0,
            bonifications: 0,
            orphanBonifications: 0,
            linkedBonifications: 0,
            details: [],
          },
          transformation: {
            linesAdded: 0,
            bonificationsLinked: 0,
            orphanBonifications: 0,
          },
        },
        message: "No se encontraron detalles para el documento",
      });
    }

    // Procesar bonificaciones (simulación)
    const processedDetails =
      await DynamicTransferService.simulateBonificationProcessing(
        originalData,
        mapping.bonificationConfig,
        documentId
      );

    // Calcular estadísticas
    const bonificationIndicator =
      mapping.bonificationConfig.bonificationIndicatorField || "ART_BON";
    const bonificationValue =
      mapping.bonificationConfig.bonificationIndicatorValue || "B";

    const originalStats = {
      totalItems: originalData.length,
      regularItems: originalData.filter(
        (item) => item[bonificationIndicator] !== bonificationValue
      ).length,
      bonifications: originalData.filter(
        (item) => item[bonificationIndicator] === bonificationValue
      ).length,
      details: originalData,
    };

    const processedStats = {
      totalItems: processedDetails.length,
      regularItems: processedDetails.filter(
        (item) => item.ITEM_TYPE === "REGULAR"
      ).length,
      bonifications: processedDetails.filter(
        (item) => item.ITEM_TYPE === "BONIFICATION"
      ).length,
      orphanBonifications: processedDetails.filter(
        (item) => item.ITEM_TYPE === "BONIFICATION_ORPHAN"
      ).length,
      linkedBonifications: processedDetails.filter(
        (item) => item.ITEM_TYPE === "BONIFICATION" && item.PEDIDO_LINEA_BONIF
      ).length,
      details: processedDetails,
    };

    const transformation = {
      linesAdded: processedDetails.length - originalData.length,
      bonificationsLinked: processedStats.linkedBonifications,
      orphanBonifications: processedStats.orphanBonifications,
    };

    res.json({
      success: true,
      data: {
        documentId,
        original: originalStats,
        processed: processedStats,
        transformation,
      },
    });

    logger.info(
      `✅ Preview de bonificaciones generado para documento: ${documentId}`
    );
  } catch (error) {
    logger.error(`❌ Error en preview de bonificaciones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    if (sourceConnection) {
      try {
        await ConnectionManager.releaseConnection(sourceConnection);
      } catch (e) {
        logger.error(`❌ Error liberando conexión: ${e.message}`);
      }
    }
  }
};

/**
 * Obtiene estadísticas de bonificaciones
 */
const getBonificationStats = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { dateFrom, dateTo, filters = {} } = req.query;
    logger.info(
      `📊 Obteniendo estadísticas de bonificaciones para mapeo: ${mappingId}`
    );

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

    // Estadísticas básicas - puedes expandir esto según necesites
    const stats = {
      totalDocuments: 0,
      documentsWithBonifications: 0,
      totalBonifications: 0,
      totalPromotions: 0,
      avgBonificationsPerDocument: 0,
      dateRange: { from: dateFrom, to: dateTo },
      message:
        "Estadísticas básicas - implementar lógica específica según necesidades",
    };

    res.json({
      success: true,
      data: stats,
    });

    logger.info(
      `✅ Estadísticas de bonificaciones obtenidas para: ${mapping.name}`
    );
  } catch (error) {
    logger.error(
      `❌ Error obteniendo estadísticas de bonificaciones: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 📤 EXPORTACIONES CORREGIDAS
 */
module.exports = {
  // Funciones básicas de mapping
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

  // Funciones de bonificaciones (NOMBRES CORREGIDOS)
  validateBonifications, // ✅ Antes era validateBonificationConfig
  previewBonifications, // ✅ Antes era previewBonificationProcessing
  getBonificationStats,
};
