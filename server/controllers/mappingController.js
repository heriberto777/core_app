const DynamicTransferService = require("../services/DynamicTransferService");
const { SqlService } = require("../services/SqlService");
const ConnectionManager = require("../services/ConnectionCentralService");
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

    console.log("Mapping obtenida:", mapping);
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
  console.log("createMapping", req.body);
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
  console.log("updateMapping", req.params, req.body);
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

    logger.info(`Se ha actualizando el mapping: ${mappingData}`);
    console.log("Aqui estamos actualizando", mappingData);
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
      } else if (detailConfig.useSameSourceTable) {
        // Caso especial: usa la misma tabla que el encabezado
        // Buscamos la tabla principal asociada
        const parentTable = mapping.tableConfigs.find(
          (tc) => tc.name === detailConfig.parentTableRef
        );

        if (!parentTable) {
          logger.warn(
            `No se encontró la tabla padre ${detailConfig.parentTableRef} para el detalle ${detailConfig.name}`
          );
          continue;
        }

        // Usar el mismo filtro que la tabla principal, pero seleccionar solo los campos mapeados
        const tableAlias = "d1";
        const orderByColumn = detailConfig.orderByColumn || "";

        // Construir la lista de campos a seleccionar basada en los mappings
        let selectFields = "*"; // Default to all fields
        if (
          detailConfig.fieldMappings &&
          detailConfig.fieldMappings.length > 0
        ) {
          const fieldList = detailConfig.fieldMappings
            .filter((fm) => fm.sourceField) // Solo campos con origen definido
            .map((fm) => `${tableAlias}.${fm.sourceField}`)
            .join(", ");

          if (fieldList) {
            selectFields = fieldList;
          }
        }

        query = `
          SELECT ${selectFields} FROM ${parentTable.sourceTable} ${tableAlias}
          WHERE ${tableAlias}.${
          detailConfig.primaryKey || parentTable.primaryKey || "NUM_PED"
        } = @documentId
          ${
            detailConfig.filterCondition
              ? ` AND ${detailConfig.filterCondition.replace(
                  /\b(\w+)\b/g,
                  (m, field) => {
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
                  }
                )}`
              : ""
          }
          ${orderByColumn ? ` ORDER BY ${tableAlias}.${orderByColumn}` : ""}
        `;
      } else {
        // Tabla de detalle normal con su propia fuente
        const orderByColumn = detailConfig.orderByColumn || "";

        // Construir la lista de campos a seleccionar
        let selectFields = "*"; // Default to all fields
        if (
          detailConfig.fieldMappings &&
          detailConfig.fieldMappings.length > 0
        ) {
          const fieldList = detailConfig.fieldMappings
            .filter((fm) => fm.sourceField) // Solo campos con origen definido
            .map((fm) => fm.sourceField)
            .join(", ");

          if (fieldList) {
            selectFields = fieldList;
          }
        }

        query = `
          SELECT ${selectFields} FROM ${detailConfig.sourceTable}
          WHERE ${detailConfig.primaryKey || "NUM_PED"} = @documentId
          ${
            detailConfig.filterCondition
              ? ` AND ${detailConfig.filterCondition}`
              : ""
          }
          ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
        `;
      }

      logger.debug(`Ejecutando consulta para detalles: ${query}`);
      const result = await SqlService.query(connection, query, { documentId });

      // Aplicar transformaciones de acuerdo al mapeo
      const transformedData = result.recordset.map((record) => {
        const transformedRecord = {};

        // Aplicar reglas de mapeo y transformaciones
        detailConfig.fieldMappings.forEach((mapping) => {
          // Solo procesar si hay campo origen definido
          if (mapping.sourceField) {
            let value = record[mapping.sourceField];

            // Aplicar eliminación de prefijo si está configurado
            if (
              mapping.removePrefix &&
              typeof value === "string" &&
              value.startsWith(mapping.removePrefix)
            ) {
              value = value.substring(mapping.removePrefix.length);
            }

            // Aplicar mapeo de valores si existe
            if (
              value !== null &&
              value !== undefined &&
              mapping.valueMappings?.length > 0
            ) {
              const valueMap = mapping.valueMappings.find(
                (vm) => vm.sourceValue === value
              );
              if (valueMap) {
                value = valueMap.targetValue;
              }
            }

            // Usar valor por defecto si es null/undefined y hay default definido
            if (
              (value === null || value === undefined) &&
              mapping.defaultValue !== undefined
            ) {
              value =
                mapping.defaultValue === "NULL" ? null : mapping.defaultValue;
            }

            // Guardar en el objeto transformado con el nombre del campo destino
            transformedRecord[mapping.targetField] = value;
          } else if (mapping.defaultValue !== undefined) {
            // Si no hay campo origen pero sí valor por defecto
            transformedRecord[mapping.targetField] =
              mapping.defaultValue === "NULL" ? null : mapping.defaultValue;
          }
        });

        // Agregar metadatos para identificación
        transformedRecord._detailTableName = detailConfig.name;
        transformedRecord._targetTable = detailConfig.targetTable;

        return transformedRecord;
      });

      details[detailConfig.name] = transformedData || [];
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

    logger.info(
      `📋 Procesando documentos para mapeo ${mappingId} (detección automática de promociones)`
    );

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

    // ✅ USAR MÉTODO PRINCIPAL CON DETECCIÓN AUTOMÁTICA
    const result = await DynamicTransferService.processDocuments(
      documentIds,
      mappingId
    );

    // 📊 LOGGING CON INFORMACIÓN DE PROMOCIONES
    const promotionsMessage = result.promotionsProcessed
      ? `, promociones aplicadas automáticamente: ${result.promotionsProcessed}`
      : "";

    logger.info(
      `Procesamiento completado: ${result.processed} éxitos, ${result.failed} fallos${promotionsMessage}`
    );

    if (result.failed > 0) {
      const errorDetails = result.details
        .filter((detail) => !detail.success)
        .map((detail) => ({
          documentId: detail.documentId,
          error: detail.message || detail.error || "Error desconocido",
          details: detail.errorDetails || null,
        }));

      result.errorDetails = errorDetails;
    }

    // 📋 RESPUESTA CON INFORMACIÓN DE PROMOCIONES
    const successMessage =
      result.failed > 0
        ? `Procesamiento completado con ${result.failed} errores${promotionsMessage}`
        : `Todos los documentos fueron procesados exitosamente${promotionsMessage}`;

    return res.json({
      success: true,
      message: successMessage,
      data: {
        ...result,
        promotionsProcessed: result.promotionsProcessed || 0, // ✅ INCLUIR CONTADOR
      },
    });
  } catch (error) {
    logger.error(`Error en procesamiento de documentos: ${error}`);
    res.status(500).json({
      success: false,
      message: error.message,
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

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    // Actualizar solo la configuración de consecutivos
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
    logger.error(
      `Error al actualizar configuración de consecutivos: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Reinicia el consecutivo de un mapeo a un valor específico
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
      data: {
        lastValue: mapping.consecutiveConfig?.lastValue || initialValue,
      },
    });
  } catch (error) {
    logger.error(`Error al reiniciar consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene el siguiente valor del consecutivo para un mapeo específico
 */
const getNextConsecutiveValue = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { segment } = req.query;

    if (!mappingId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la configuración",
      });
    }

    // Buscar el mapping
    const mapping = await TransferMapping.findById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración no encontrada",
      });
    }

    // Verificar si está configurado para usar consecutivos
    if (!mapping.consecutiveConfig || !mapping.consecutiveConfig.enabled) {
      return res.status(400).json({
        success: false,
        message:
          "Esta configuración no tiene habilitada la numeración consecutiva",
      });
    }

    let consecutiveValue;

    // Intentar obtener desde el sistema centralizado primero
    try {
      // Comprobar si existe un consecutivo asignado a este mapeo
      const assignedConsecutives =
        await ConsecutiveService.getConsecutivesByEntity("mapping", mappingId);

      if (assignedConsecutives.length > 0) {
        // Usar el primer consecutivo asignado
        const consecutive = assignedConsecutives[0];

        // Obtener el siguiente valor
        const result = await ConsecutiveService.getNextConsecutiveValue(
          consecutive._id,
          { segment: segment || null }
        );

        consecutiveValue = result.data.value;
      } else {
        // Usar el sistema anterior
        consecutiveValue = this.formatConsecutiveValue(
          mapping.consecutiveConfig.lastValue + 1,
          mapping.consecutiveConfig
        );

        // Actualizar el último valor en la configuración
        mapping.consecutiveConfig.lastValue += 1;
        await mapping.save();
      }
    } catch (error) {
      // Si falla el sistema centralizado, usar el anterior
      logger.warn(
        `Error al obtener consecutivo centralizado: ${error.message}. Usando sistema anterior.`
      );

      consecutiveValue = await DynamicTransferService.getNextConsecutiveValue(
        mappingId,
        segment
      );
    }

    res.json({
      success: true,
      data: {
        value: consecutiveValue,
        mapping: mapping.name,
      },
    });
  } catch (error) {
    logger.error(`Error al obtener siguiente consecutivo: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Obtiene detalles de documento con procesamiento de promociones
 */
const getDocumentDetailsWithPromotions = async (req, res) => {
  let connection = null;

  try {
    const { mappingId, documentId } = req.params;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren mappingId y documentId",
      });
    }

    // Obtener configuración de mapeo
    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapeo no encontrada",
      });
    }

    // Establecer conexión
    connection = await ConnectionManager.getConnection(mapping.sourceServer);

    // Obtener configuraciones de tablas de detalle
    const detailConfigs = mapping.tableConfigs.filter((tc) => tc.isDetailTable);
    const details = {};

    // Procesar cada tabla de detalle
    for (const detailConfig of detailConfigs) {
      logger.info(
        `Procesando detalles con promociones para tabla ${detailConfig.name}`
      );

      // Usar método con soporte para promociones
      const detailData =
        await DynamicTransferService.getDetailDataWithPromotions(
          documentId,
          detailConfig,
          connection,
          mapping
        );

      details[detailConfig.name] = detailData || [];
    }

    res.json({
      success: true,
      data: {
        documentId,
        details,
        promotionConfig: mapping.promotionConfig || null,
      },
    });
  } catch (error) {
    logger.error(`Error al obtener detalles con promociones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
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
 * Procesa documentos con soporte para promociones
 */
const processDocumentsWithPromotions = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { documentIds } = req.body;

    logger.info(
      `Procesando documentos con promociones para mapeo ${mappingId}`
    );

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

    // Procesar documentos con soporte para promociones
    const result = await DynamicTransferService.processDocuments(
      documentIds,
      mappingId
    );

    logger.info(
      `Procesamiento completado: ${result.processed} éxitos, ${result.failed} fallos`
    );

    if (result.failed > 0) {
      const errorDetails = result.details
        .filter((detail) => !detail.success)
        .map((detail) => ({
          documentId: detail.documentId,
          error: detail.message || detail.error || "Error desconocido",
          details: detail.errorDetails || null,
        }));

      result.errorDetails = errorDetails;
    }

    return res.json({
      success: true,
      message:
        result.failed > 0
          ? `Procesamiento completado con ${result.failed} errores`
          : "Todos los documentos fueron procesados exitosamente",
      data: result,
    });
  } catch (error) {
    logger.error(`Error en procesamiento con promociones: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Valida configuración de promociones
 */
const validatePromotionConfig = async (token, mappingId) => {
  try {
    const response = await fetch(
      `${this.baseUrl}/mapping/${mappingId}/validate-promotions`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error al validar configuración de promociones:", error);
    throw error;
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
  getNextConsecutiveValue,
  resetConsecutive,
  getDocumentDetailsWithPromotions,
  processDocumentsWithPromotions,
  validatePromotionConfig,
};
