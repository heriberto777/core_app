const DynamicTransferService = require("../services/DynamicTransferService");
const { SqlService } = require("../services/SqlService");
const ConnectionManager = require("../services/ConnectionCentralService");
const logger = require("../services/logger");
const TransferMapping = require("../models/transferMappingModel");
const BonificationProcessingService = require("../services/BonificationProcessingService");
const bonificationService = new BonificationProcessingService();

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
  try {
    const mappingData = req.body;

    if (!mappingData || !mappingData.name) {
      return res.status(400).json({
        success: false,
        message: "Datos de configuración incompletos",
      });
    }

    // 🔧 IMPORTANTE: Eliminar _id si viene en la data para creación
    if (mappingData._id) {
      console.log("🔧 Eliminando _id de datos de creación");
      delete mappingData._id;
    }

    console.log("✨ Creando nuevo mapping:", mappingData.name);

    const mapping = await DynamicTransferService.createMapping(mappingData);

    res.status(201).json({
      success: true,
      message: "Configuración de mapeo creada exitosamente",
      data: mapping,
    });
  } catch (error) {
    console.error("Error al crear configuración de mapeo:", error);
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

    try {
      // Procesar documentos
      const result = await DynamicTransferService.processDocuments(
        documentIds,
        mappingId
      );

      logger.info(
        `Procesamiento completado: ${result.processed} éxitos, ${result.failed} fallos`
      );

      // Incluir información detallada de errores si hay algún fallo
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
            ? `Se procesaron ${result.processed} documentos correctamente y fallaron ${result.failed}`
            : `Se procesaron ${result.processed} documentos correctamente`,
        data: result,
      });
    } catch (processingError) {
      // Capturar explícitamente errores durante el procesamiento
      logger.error(
        `Error durante el procesamiento de documentos: ${processingError.message}`
      );
      return res.status(500).json({
        success: false,
        message: processingError.message || "Error al procesar documentos",
        errorDetails: processingError.stack,
      });
    }
  } catch (error) {
    logger.error(
      `Error general en processDocumentsByMapping: ${error.message}`
    );
    return res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
      errorDetails: error.stack,
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
 * Procesa un documento específico con bonificaciones
 */
const processDocumentWithBonifications = async (req, res) => {
  try {
    const { mappingId, documentId } = req.params;
    const { applyPromotionRules = false } = req.body;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere ID de mapping y ID de documento",
      });
    }

    // Obtener configuración de mapping
    const mapping = await DynamicTransferService.getMappingById(mappingId);

    if (!mapping.hasBonificationProcessing) {
      return res.status(400).json({
        success: false,
        message:
          "Este mapping no tiene habilitado el procesamiento de bonificaciones",
      });
    }

    // Aplicar reglas de promociones si se solicita
    if (applyPromotionRules) {
      mapping.bonificationConfig.applyPromotionRules = true;
    }

    // Obtener conexiones
    const sourceConnection = await ConnectionManager.getConnection(
      mapping.sourceServer
    );
    const targetConnection = await ConnectionManager.getConnection(
      mapping.targetServer
    );

    // Procesar documento
    const result =
      await DynamicTransferService.processDocumentWithBonifications(
        mapping,
        documentId,
        sourceConnection,
        targetConnection
      );

    res.json({
      success: result.success,
      data: result.data,
      message: result.success
        ? "Documento procesado exitosamente con bonificaciones"
        : `Error: ${result.error}`,
    });
  } catch (error) {
    logger.error(`Error en processDocumentWithBonifications: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 NUEVO: Ejecuta un mapping con soporte completo para bonificaciones
 */
const executeMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const {
      limit,
      applyPromotionRules = false,
      documentIds,
      filters = {},
    } = req.body;

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

    // Configurar reglas de promociones si se solicita
    if (applyPromotionRules && mapping.hasBonificationProcessing) {
      mapping.bonificationConfig.applyPromotionRules = true;
      logger.info(
        `🎯 Reglas de promociones habilitadas para mapping: ${mapping.name}`
      );
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
            bonificationStats: {
              totalDocumentsWithBonifications: 0,
              totalBonifications: 0,
              totalPromotions: 0,
              totalDiscountAmount: 0,
              processedDetails: 0,
            },
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
      success: result.success,
      data: result,
      message: mapping.hasBonificationProcessing
        ? "Mapping ejecutado exitosamente con procesamiento de bonificaciones"
        : "Mapping ejecutado exitosamente",
    });
  } catch (error) {
    logger.error(`Error ejecutando mapping: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 NUEVO: Previsualiza el procesamiento de bonificaciones para un documento
 */
const previewBonificationProcessing = async (req, res) => {
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

    // Obtener datos originales
    const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
    if (!detailTable) {
      return res.status(400).json({
        success: false,
        message: "No se encontró configuración de tabla de detalle",
      });
    }

    const originalDetails =
      await DynamicTransferService.getOrderDetailsWithPromotions(
        detailTable,
        documentId,
        sourceConnection
      );

    if (originalDetails.length === 0) {
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
            details: [],
          },
          promotions: {
            summary: {
              totalPromotions: 0,
              totalBonifiedItems: 0,
              totalDiscountAmount: 0,
            },
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

    // Procesar bonificaciones en modo preview

    // const processedDetails = await BonificationService.processBonifications(
    //   originalDetails,
    //   mapping.bonificationConfig,
    //   documentId
    // );
    const processedDetails = await bonificationService.processBonifications(
      sourceConnection,
      documentId,
      mapping.bonificationConfig
    );

    const promotions = bonificationService.detectPromotionTypes(
      processedDetails,
      mapping.bonificationConfig
    );

    res.json({
      success: true,
      data: {
        documentId,
        original: {
          totalItems: originalDetails.length,
          regularItems: originalDetails.filter((i) => i.ART_BON !== "B").length,
          bonifications: originalDetails.filter((i) => i.ART_BON === "B")
            .length,
          details: originalDetails,
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
          linesAdded: processedDetails.length - originalDetails.length,
          bonificationsLinked: processedDetails.filter(
            (i) => i.ITEM_TYPE === "BONIFICATION" && i.PEDIDO_LINEA_BONIF
          ).length,
          orphanBonifications: processedDetails.filter(
            (i) => i.ITEM_TYPE === "BONIFICATION_ORPHAN"
          ).length,
        },
      },
    });
  } catch (error) {
    logger.error(`Error en previewBonificationProcessing: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 NUEVO: Valida configuración de bonificaciones
 */
const validateBonificationConfig = async (req, res) => {
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

    const configToValidate = config || mapping.bonificationConfig;
    const warnings = [];

    try {
      // Validar que el servicio de bonificaciones puede cargar la configuración

      bonificationService.validateBonificationConfig(configToValidate);

      // Validar acceso a la tabla de origen
      const sourceConnection = await ConnectionManager.getConnection(
        mapping.sourceServer
      );

      try {
        const testQuery = `SELECT TOP 1 * FROM ${configToValidate.sourceTable}`;
        await SqlService.query(sourceConnection, testQuery);
      } catch (tableError) {
        warnings.push(
          `No se pudo acceder a la tabla origen: ${configToValidate.sourceTable}`
        );
      }

      // Validar que los campos existen en la tabla
      try {
        const fieldsToCheck = [
          configToValidate.bonificationIndicatorField,
          configToValidate.regularArticleField,
          configToValidate.bonificationReferenceField,
          configToValidate.orderField,
          configToValidate.quantityField,
        ].filter(Boolean);

        if (fieldsToCheck.length > 0) {
          const fieldCheckQuery = `SELECT TOP 1 ${fieldsToCheck.join(
            ", "
          )} FROM ${configToValidate.sourceTable}`;
          await SqlService.query(sourceConnection, fieldCheckQuery);
        }
      } catch (fieldError) {
        warnings.push(
          "Algunos campos especificados no existen en la tabla origen"
        );
      }

      res.json({
        success: true,
        message: "Configuración de bonificaciones válida",
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (validationError) {
      res.status(400).json({
        success: false,
        message: `Error de validación: ${validationError.message}`,
        warnings,
      });
    }
  } catch (error) {
    logger.error(
      `Error validando configuración de bonificaciones: ${error.message}`
    );
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 🎁 NUEVO: Obtiene estadísticas de bonificaciones
 */
const getBonificationStats = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const { timeRange = "30d", dateFrom, dateTo } = req.query;

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

    // Calcular fechas según el rango
    let startDate, endDate;
    endDate = new Date();

    switch (timeRange) {
      case "7d":
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        if (dateFrom && dateTo) {
          startDate = new Date(dateFrom);
          endDate = new Date(dateTo);
        } else {
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }
    }

    // Obtener estadísticas de la base de datos
    const sourceConnection = await ConnectionManager.getConnection(
      mapping.sourceServer
    );

    try {
      // Query para obtener estadísticas básicas
      const statsQuery = `
        SELECT
          COUNT(DISTINCT ${
            mapping.bonificationConfig.orderField
          }) as documentsProcessed,
          COUNT(CASE WHEN ${
            mapping.bonificationConfig.bonificationIndicatorField
          } = '${
        mapping.bonificationConfig.bonificationIndicatorValue
      }' THEN 1 END) as totalBonifications,
          COUNT(DISTINCT CASE WHEN ${
            mapping.bonificationConfig.bonificationIndicatorField
          } = '${mapping.bonificationConfig.bonificationIndicatorValue}' THEN ${
        mapping.bonificationConfig.orderField
      } END) as documentsWithBonifications,
          ISNULL(SUM(CASE WHEN ${
            mapping.bonificationConfig.bonificationIndicatorField
          } = '${mapping.bonificationConfig.bonificationIndicatorValue}' THEN ${
        mapping.bonificationConfig.quantityField || 1
      } ELSE 0 END), 0) as totalBonifiedItems
        FROM ${mapping.bonificationConfig.sourceTable}
        WHERE 1=1
      `;

      const statsResult = await SqlService.query(sourceConnection, statsQuery);
      const stats = statsResult.recordset[0] || {};

      // Simular algunas estadísticas adicionales (puedes mejorar esto con datos reales)
      const mockStats = {
        documentsProcessed: stats.documentsProcessed || 0,
        documentsWithBonifications: stats.documentsWithBonifications || 0,
        totalBonifications: stats.totalBonifications || 0,
        totalBonifiedItems: stats.totalBonifiedItems || 0,
        totalDiscountAmount: (stats.totalBonifications || 0) * 15.5, // Estimación
        activePromotions: 5, // Datos simulados
        averageSavings:
          stats.totalBonifications > 0
            ? (stats.totalBonifications * 15.5) /
              stats.documentsWithBonifications
            : 0,
        topPromotionTypes: [
          {
            type: "Bonificación por familia",
            count: Math.floor((stats.totalBonifications || 0) * 0.6),
          },
          {
            type: "Bonificación por producto",
            count: Math.floor((stats.totalBonifications || 0) * 0.3),
          },
          {
            type: "Bonificación escalada",
            count: Math.floor((stats.totalBonifications || 0) * 0.1),
          },
        ].filter((p) => p.count > 0),
      };

      res.json({
        success: true,
        data: mockStats,
      });
    } catch (queryError) {
      logger.warn(
        `Error ejecutando query de estadísticas: ${queryError.message}`
      );

      // Respuesta con datos simulados si falla la query
      res.json({
        success: true,
        data: {
          documentsProcessed: 0,
          documentsWithBonifications: 0,
          totalBonifications: 0,
          totalBonifiedItems: 0,
          totalDiscountAmount: 0,
          activePromotions: 0,
          averageSavings: 0,
          topPromotionTypes: [],
        },
        message:
          "Estadísticas simuladas - no se pudo acceder a los datos reales",
      });
    }
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
  processDocumentWithBonifications,
  executeMapping,
  previewBonificationProcessing,
  validateBonificationConfig,
  getBonificationStats,
};
