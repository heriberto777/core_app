// services/BonificationService.js
const logger = require("./logger");
const { SqlService } = require("./SqlService");

/**
 * 🎁 Servicio especializado en el procesamiento de bonificaciones
 *
 * Este servicio maneja la lógica completa de bonificaciones:
 * - Evita duplicación de procesamiento
 * - Mantiene referencias correctas entre artículos regulares y bonificaciones
 * - Asigna números de línea secuenciales
 * - Control de pedidos ya procesados
 *
 * @author Tu Equipo de Desarrollo
 * @version 2.1.0
 */
class BonificationService {
  constructor(options = {}) {
    this.processedOrders = new Set(); // Control de pedidos ya procesados
    this.debug = options.debug !== undefined ? options.debug : true;
    this.version = "2.1.0";
  }

  /**
   * 🎯 MÉTODO PRINCIPAL: Procesamiento unificado de bonificaciones
   *
   * Este es el punto de entrada principal que decide si procesar bonificaciones
   * o usar el flujo normal de datos.
   *
   * @param {Array} documentIds - IDs de documentos a procesar
   * @param {Object} mapping - Configuración de mapeo completa
   * @param {Object} connection - Conexión a base de datos SQL Server
   * @returns {Promise<Array>} Datos procesados listos para inserción
   */
  async processBonificationsUnified(documentIds, mapping, connection) {
    try {
      // ✅ Resetear estado para nueva ejecución
      this.reset();

      // ✅ Validar entrada
      if (
        !documentIds ||
        !Array.isArray(documentIds) ||
        documentIds.length === 0
      ) {
        logger.warn("⚠️ [BONIF] No hay documentos para procesar");
        return [];
      }

      // ✅ Si no hay configuración de bonificaciones, usar flujo normal
      if (!mapping.hasBonificationProcessing || !mapping.bonificationConfig) {
        logger.info(
          "📦 [BONIF] Sin procesamiento de bonificaciones, usando flujo normal"
        );
        return await this.getRegularSourceData(
          documentIds,
          mapping,
          connection
        );
      }

      // ✅ Validar configuración de bonificaciones
      const validation =
        BonificationService.validateBonificationConfig(mapping);
      if (!validation.valid) {
        throw new Error(
          `Configuración de bonificaciones inválida: ${validation.errors.join(
            ", "
          )}`
        );
      }

      const config = mapping.bonificationConfig;

      logger.info(
        `🎁 [BONIF] Iniciando procesamiento unificado v${this.version}`,
        {
          documents: documentIds.length,
          orderField: config.orderField,
          sourceTable: config.sourceTable,
          indicatorField: config.bonificationIndicatorField,
          indicatorValue: config.bonificationIndicatorValue,
        }
      );

      // ✅ Obtener datos raw de la fuente
      const rawData = await this.getRawSourceData(
        documentIds,
        config,
        connection
      );

      if (rawData.length === 0) {
        logger.warn("⚠️ [BONIF] No se encontraron datos para procesar");
        return [];
      }

      logger.info(
        `📋 [BONIF] Datos obtenidos: ${rawData.length} registros de ${config.sourceTable}`
      );

      // ✅ Procesar bonificaciones por pedido
      const result = await this.processOrdersBonifications(rawData, config);
      const processedData = result.processedData || result; // Compatibilidad

      logger.info(
        `✅ [BONIF] Procesamiento completado: ${processedData.length} registros finales`
      );

      // ✅ Log detallado para debugging
      if (this.debug) {
        this.logProcessingSummary(rawData, processedData, config);
      }

      return processedData;
    } catch (error) {
      logger.error(
        `❌ [BONIF] Error en procesamiento unificado: ${error.message}`,
        {
          stack: error.stack,
          documentIds,
          mappingName: mapping?.name,
        }
      );
      throw error;
    }
  }

  /**
   * 🔍 Obtiene datos raw de la tabla fuente
   *
   * Ejecuta la consulta SQL para obtener todos los registros (regulares y bonificaciones)
   * de los documentos especificados, ordenados correctamente.
   */
  async getRawSourceData(documentIds, config, connection) {
    try {
      if (!documentIds.length) return [];

      // Construir parámetros IN para la consulta
      const inClause = documentIds.map((_, index) => `@doc${index}`).join(", ");
      const parameters = {};
      documentIds.forEach((id, index) => {
        parameters[`doc${index}`] = id;
      });

      // Consulta SQL optimizada
      const query = `
        SELECT *
        FROM ${config.sourceTable}
        WHERE ${config.orderField} IN (${inClause})
        ORDER BY ${config.orderField}, ${config.lineOrderField || "NUM_LN"}
      `;

      if (this.debug) {
        logger.debug(`🔍 [BONIF] Ejecutando consulta:`, {
          query: query.replace(/\s+/g, " ").trim(),
          documents: documentIds,
          parameters,
        });
      }

      const result = await SqlService.query(connection, query, parameters);
      return result.recordset || [];
    } catch (error) {
      logger.error(`❌ [BONIF] Error obteniendo datos raw: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔧 Obtiene datos usando flujo normal (sin bonificaciones)
   *
   * Método de fallback para cuando no hay procesamiento de bonificaciones configurado.
   * Utiliza la configuración de tablas estándar del mapping.
   */
  async getRegularSourceData(documentIds, mapping, connection) {
    try {
      logger.info(`📦 [BONIF] Obteniendo datos con flujo normal`);

      // Buscar la tabla principal
      const mainTable = mapping.tableConfigs?.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      // Construir consulta básica
      const inClause = documentIds.map((_, index) => `@doc${index}`).join(", ");
      const parameters = {};
      documentIds.forEach((id, index) => {
        parameters[`doc${index}`] = id;
      });

      const primaryKey = mainTable.primaryKey || "NUM_PED";
      const query = `
        SELECT *
        FROM ${mainTable.sourceTable}
        WHERE ${primaryKey} IN (${inClause})
        ORDER BY ${primaryKey}
      `;

      const result = await SqlService.query(connection, query, parameters);
      return result.recordset || [];
    } catch (error) {
      logger.error(`❌ [BONIF] Error en flujo normal: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔧 CORREGIDO: Procesa múltiples pedidos con mejor control de errores
   */
  async processOrdersBonifications(rawData, config) {
    try {
      // Validar configuración
      this.validateConfig(config);

      // Agrupar por NUM_PED
      const groupedByOrder = this.groupDataByField(rawData, config.orderField);
      const finalProcessedData = [];
      const errors = [];

      logger.info(
        `📦 [BONIF] Procesando ${groupedByOrder.size} pedidos únicos`
      );

      for (const [orderNumber, orderRecords] of groupedByOrder) {
        try {
          // Control anti-duplicados
          if (this.processedOrders.has(orderNumber)) {
            logger.warn(
              `⚠️ [BONIF] Pedido ${orderNumber} ya procesado, omitiendo`
            );
            continue;
          }

          // Validar datos del pedido
          const validation = this.validateOrderData(orderRecords, config);
          if (!validation.isValid) {
            errors.push({
              orderNumber,
              error: validation.error,
              details: validation.details,
            });
            logger.error(
              `❌ [BONIF] Pedido ${orderNumber} inválido: ${validation.error}`
            );
            continue;
          }

          // Procesar pedido
          const processedOrder = await this.processSingleOrder(
            orderRecords,
            config,
            orderNumber
          );

          finalProcessedData.push(...processedOrder);
          this.processedOrders.add(orderNumber);
        } catch (orderError) {
          errors.push({
            orderNumber,
            error: orderError.message,
            stack: orderError.stack,
          });
          logger.error(
            `❌ [BONIF] Error procesando pedido ${orderNumber}: ${orderError.message}`
          );
        }
      }

      // Log de resultados finales
      logger.info(`✅ [BONIF] Procesamiento completado:`);
      logger.info(
        `✅ [BONIF] - Líneas procesadas: ${finalProcessedData.length}`
      );
      logger.info(`✅ [BONIF] - Pedidos con errores: ${errors.length}`);

      if (errors.length > 0) {
        logger.warn(`⚠️ [BONIF] Errores encontrados:`, errors);
      }

      return {
        processedData: finalProcessedData,
        errors: errors,
        stats: {
          totalLines: finalProcessedData.length,
          totalOrders: groupedByOrder.size,
          errorOrders: errors.length,
        },
      };
    } catch (error) {
      logger.error(
        `❌ [BONIF] Error general procesando pedidos: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🔧 CORREGIDO: Procesa un pedido individual manteniendo orden NUM_LN
   */
  async processSingleOrder(orderRecords, config, orderNumber) {
    try {
      const processedRecords = [];
      const regularArticleMap = new Map(); // COD_ART → {lineNumber, originalData}

      if (this.debug) {
        logger.debug(
          `📋 [BONIF] Procesando pedido ${orderNumber}: ${orderRecords.length} registros`
        );
      }

      // 🔥 PASO 1: Ordenar por NUM_LN para mantener secuencia original
      const sortedRecords = [...orderRecords].sort((a, b) => {
        const numLnA = parseInt(a[config.lineOrderField] || a.NUM_LN || 0);
        const numLnB = parseInt(b[config.lineOrderField] || b.NUM_LN || 0);
        return numLnA - numLnB;
      });

      // 🔥 PASO 2: Primera pasada - mapear artículos regulares
      let currentLineNumber = 1;

      sortedRecords.forEach((record) => {
        const isRegularArticle =
          record[config.bonificationIndicatorField] !==
          config.bonificationIndicatorValue;

        if (isRegularArticle) {
          const articleCode = record[config.regularArticleField];
          regularArticleMap.set(articleCode, {
            lineNumber: currentLineNumber,
            originalData: record,
            originalNumLn: record[config.lineOrderField] || record.NUM_LN,
          });

          if (this.debug) {
            logger.debug(
              `✅ [BONIF] Artículo regular: ${articleCode} → línea ${currentLineNumber} (NUM_LN original: ${record.NUM_LN})`
            );
          }

          currentLineNumber++;
        }
      });

      // 🔥 PASO 3: Segunda pasada - procesar todos los registros en orden
      currentLineNumber = 1;

      for (const record of sortedRecords) {
        const isBonification =
          record[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue;

        if (!isBonification) {
          // 📦 ARTÍCULO REGULAR
          const processedArticle = {
            ...record,
            // Campos destino correctos
            [config.lineNumberField || "PEDIDO_LINEA"]: currentLineNumber,
            [config.bonificationLineReferenceField || "PEDIDO_LINEA_BONIF"]:
              null,
            // Limpiar referencia original
            [config.bonificationReferenceField]: null,
            // Agregar campos calculados
            CALCULATED_PEDIDO_LINEA: currentLineNumber,
            CALCULATED_PEDIDO_LINEA_BONIF: null,
          };

          processedRecords.push(processedArticle);

          if (this.debug) {
            logger.debug(
              `📦 [BONIF] Regular procesado: ${
                record[config.regularArticleField]
              } línea ${currentLineNumber}`
            );
          }

          currentLineNumber++;
        } else {
          // 🎁 BONIFICACIÓN
          const referencedArticleCode =
            record[config.bonificationReferenceField];
          const referencedArticle = regularArticleMap.get(
            referencedArticleCode
          );

          // 🔥 VALIDACIÓN CRÍTICA: Verificar que existe el artículo regular
          if (!referencedArticle) {
            logger.error(
              `❌ [BONIF] ERROR CRÍTICO: Bonificación huérfana en pedido ${orderNumber}`
            );
            logger.error(
              `❌ [BONIF] Artículo bonificación: ${
                record[config.regularArticleField]
              }`
            );
            logger.error(
              `❌ [BONIF] Referencia: ${referencedArticleCode} (NO ENCONTRADO)`
            );
            logger.error(
              `❌ [BONIF] Artículos regulares disponibles: ${Array.from(
                regularArticleMap.keys()
              ).join(", ")}`
            );

            // Continuar procesando pero marcar como error
            const processedBonification = {
              ...record,
              [config.lineNumberField || "PEDIDO_LINEA"]: currentLineNumber,
              [config.bonificationLineReferenceField || "PEDIDO_LINEA_BONIF"]:
                null, // ERROR: Sin referencia
              [config.bonificationReferenceField]: null,
              // Campos calculados
              CALCULATED_PEDIDO_LINEA: currentLineNumber,
              CALCULATED_PEDIDO_LINEA_BONIF: null,
              // Marcar como problemático
              _BONIFICATION_ERROR: `REFERENCIA_NO_ENCONTRADA: ${referencedArticleCode}`,
            };

            processedRecords.push(processedBonification);
          } else {
            // ✅ BONIFICACIÓN VÁLIDA
            const processedBonification = {
              ...record,
              [config.lineNumberField || "PEDIDO_LINEA"]: currentLineNumber,
              [config.bonificationLineReferenceField || "PEDIDO_LINEA_BONIF"]:
                referencedArticle.lineNumber,
              [config.bonificationReferenceField]: null, // Limpiar COD_ART_RFR
              // Campos calculados
              CALCULATED_PEDIDO_LINEA: currentLineNumber,
              CALCULATED_PEDIDO_LINEA_BONIF: referencedArticle.lineNumber,

              // 🔥 CORREGIR CANTIDAD: Usar CNT_MAX correctamente
              [config.quantityField || "CNT_MAX"]: this.validateQuantity(
                record[config.quantityField || "CNT_MAX"]
              ),
            };

            processedRecords.push(processedBonification);

            if (this.debug) {
              logger.debug(
                `🎁 [BONIF] Bonificación procesada: ${
                  record[config.regularArticleField]
                } línea ${currentLineNumber} → referencia línea ${
                  referencedArticle.lineNumber
                }`
              );
              logger.debug(
                `🎁 [BONIF] Cantidad bonificación: ${
                  processedBonification[config.quantityField || "CNT_MAX"]
                }`
              );
            }
          }

          currentLineNumber++;
        }
      }

      logger.info(
        `✅ [BONIF] Pedido ${orderNumber} completado: ${processedRecords.length} líneas procesadas`
      );

      return processedRecords;
    } catch (error) {
      logger.error(
        `❌ [BONIF] Error procesando pedido ${orderNumber}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🔧 NUEVO: Validar y corregir cantidad de bonificación
   */
  validateQuantity(quantity) {
    if (quantity === null || quantity === undefined) {
      logger.warn(`⚠️ [BONIF] Cantidad null/undefined, usando 0`);
      return 0;
    }

    const numericQuantity = parseFloat(quantity);
    if (isNaN(numericQuantity)) {
      logger.warn(`⚠️ [BONIF] Cantidad inválida: ${quantity}, usando 0`);
      return 0;
    }

    // Las bonificaciones pueden tener cantidad negativa o positiva
    return numericQuantity;
  }

  /**
   * 🔧 NUEVO: Validar configuración de bonificaciones
   */
  validateConfig(config) {
    const requiredFields = [
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "orderField",
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Campo de configuración requerido faltante: ${field}`);
      }
    }
  }

  /**
   * 🔧 NUEVO: Validar datos de un pedido
   */
  validateOrderData(orderRecords, config) {
    if (!Array.isArray(orderRecords) || orderRecords.length === 0) {
      return {
        isValid: false,
        error: "Pedido sin registros",
        details: { recordCount: orderRecords?.length || 0 },
      };
    }

    // Verificar que todos los registros tienen NUM_PED
    const orderNumbers = new Set();
    for (const record of orderRecords) {
      const orderNum = record[config.orderField];
      if (!orderNum) {
        return {
          isValid: false,
          error: `Registro sin ${config.orderField}`,
          details: { record },
        };
      }
      orderNumbers.add(orderNum);
    }

    // Verificar que todos pertenecen al mismo pedido
    if (orderNumbers.size > 1) {
      return {
        isValid: false,
        error: "Registros de múltiples pedidos mezclados",
        details: { orderNumbers: Array.from(orderNumbers) },
      };
    }

    return { isValid: true };
  }

  /**
   * 🔧 Agrupar datos por campo específico
   */
  groupDataByField(data, fieldName) {
    const grouped = new Map();

    for (const item of data) {
      const key = item[fieldName];
      if (!key) {
        logger.warn(`⚠️ [BONIF] Registro sin ${fieldName}, omitiendo:`, item);
        continue;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(item);
    }

    return grouped;
  }

  /**
   * Valida la configuración de bonificaciones
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Object} Resultado de validación
   */
  static validateBonificationConfig(mapping) {
    const errors = [];

    if (!mapping.bonificationConfig) {
      errors.push("Configuración de bonificaciones faltante");
      return { valid: false, errors };
    }

    const config = mapping.bonificationConfig;

    // ✅ Campos requeridos
    const requiredFields = [
      "sourceTable",
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "orderField",
    ];

    requiredFields.forEach((field) => {
      if (!config[field]) {
        errors.push(`Campo requerido faltante: ${field}`);
      }
    });

    // ✅ Validaciones adicionales
    if (
      config.bonificationIndicatorValue &&
      config.bonificationIndicatorValue.length === 0
    ) {
      errors.push("bonificationIndicatorValue no puede estar vacío");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resetea el estado interno para nueva ejecución
   */
  reset() {
    this.processedOrders.clear();
    if (this.debug) {
      logger.debug(`🔄 [BONIF] Estado reseteado para nueva ejecución`);
    }
  }

  /**
   * Genera log detallado del procesamiento para debug
   */
  logProcessingSummary(rawData, processedData, config) {
    try {
      const regularCount = rawData.filter(
        (r) =>
          r[config.bonificationIndicatorField] !==
          config.bonificationIndicatorValue
      ).length;
      const bonificationCount = rawData.filter(
        (r) =>
          r[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue
      ).length;

      logger.debug(`📊 [BONIF] RESUMEN DE PROCESAMIENTO:`);
      logger.debug(`📊 [BONIF] - Registros originales: ${rawData.length}`);
      logger.debug(`📊 [BONIF] - Artículos regulares: ${regularCount}`);
      logger.debug(`📊 [BONIF] - Bonificaciones: ${bonificationCount}`);
      logger.debug(
        `📊 [BONIF] - Registros procesados: ${processedData.length}`
      );
      logger.debug(
        `📊 [BONIF] - Pedidos únicos: ${
          new Set(rawData.map((r) => r[config.orderField])).size
        }`
      );
    } catch (error) {
      logger.warn(`⚠️ [BONIF] Error generando resumen: ${error.message}`);
    }
  }
}

module.exports = BonificationService;
