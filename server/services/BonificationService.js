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
 * @version 2.0.0
 */
class BonificationService {
  constructor() {
    this.processedOrders = new Set(); // Control de pedidos ya procesados
    this.debug = true; // Activar logs detallados para testing
    this.version = "2.0.0";
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
      const validation = this.validateBonificationConfig(mapping);
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
      const processedData = await this.processOrdersBonifications(
        rawData,
        config
      );

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
          mappingName: mapping.name,
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
   *
   * @param {Array} documentIds - IDs de documentos
   * @param {Object} config - Configuración de bonificaciones
   * @param {Object} connection - Conexión SQL Server
   * @returns {Promise<Array>} Datos raw sin procesar
   */
  async getRawSourceData(documentIds, config, connection) {
    try {
      // ✅ Preparar parámetros para consulta SQL
      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};

      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      // ✅ Query optimizada con orden correcto
      const query = `
        SELECT * FROM ${config.sourceTable}
        WHERE ${config.orderField} IN (${placeholders})
        ORDER BY ${config.orderField}, ${config.lineOrderField || "NUM_LN"}
      `;

      if (this.debug) {
        logger.debug(`🔍 [BONIF] Ejecutando query:`, {
          query: query.replace(/\s+/g, " ").trim(),
          params,
          documentCount: documentIds.length,
        });
      }

      // ✅ Ejecutar consulta usando SqlService
      const result = await SqlService.query(connection, query, params);
      const data = result.recordset || [];

      logger.info(
        `📊 [BONIF] Query ejecutada exitosamente: ${data.length} registros obtenidos`
      );

      return data;
    } catch (error) {
      logger.error(`❌ [BONIF] Error obteniendo datos raw: ${error.message}`, {
        query: error.query,
        params: error.params,
      });
      throw error;
    }
  }

  /**
   * 🎯 Procesa bonificaciones agrupadas por pedido
   *
   * Agrupa los datos por pedido y procesa cada uno individualmente
   * para evitar mezclar líneas de diferentes pedidos.
   *
   * @param {Array} rawData - Datos raw de la consulta
   * @param {Object} config - Configuración de bonificaciones
   * @returns {Promise<Array>} Datos procesados
   */
  async processOrdersBonifications(rawData, config) {
    try {
      // ✅ Agrupar datos por campo de orden (ej: NUM_PED)
      const groupedByOrder = this.groupDataByField(rawData, config.orderField);
      const finalProcessedData = [];

      logger.info(
        `📦 [BONIF] Procesando ${groupedByOrder.size} pedidos únicos`
      );

      // ✅ Procesar cada pedido individualmente
      for (const [orderNumber, orderRecords] of groupedByOrder) {
        // ✅ Control anti-duplicados
        if (this.processedOrders.has(orderNumber)) {
          logger.warn(
            `⚠️ [BONIF] Pedido ${orderNumber} ya fue procesado anteriormente, omitiendo`
          );
          continue;
        }

        if (this.debug) {
          logger.debug(
            `📋 [BONIF] Procesando pedido: ${orderNumber} (${orderRecords.length} líneas)`
          );
        }

        // ✅ Procesar pedido individual
        const processedOrder = await this.processSingleOrder(
          orderRecords,
          config,
          orderNumber
        );
        finalProcessedData.push(...processedOrder);

        // ✅ Marcar pedido como procesado
        this.processedOrders.add(orderNumber);
      }

      logger.info(
        `✅ [BONIF] Todos los pedidos procesados: ${finalProcessedData.length} líneas totales`
      );
      return finalProcessedData;
    } catch (error) {
      logger.error(`❌ [BONIF] Error procesando pedidos: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📦 Procesa un pedido individual con sus bonificaciones
   *
   * Lógica principal de procesamiento:
   * 1. Separa artículos regulares de bonificaciones
   * 2. Asigna líneas secuenciales a artículos regulares
   * 3. Mapea bonificaciones con sus artículos regulares correspondientes
   * 4. Genera campos calculados para la tabla destino
   *
   * @param {Array} orderRecords - Registros del pedido
   * @param {Object} config - Configuración de bonificaciones
   * @param {string} orderNumber - Número del pedido
   * @returns {Promise<Array>} Registros procesados del pedido
   */
  async processSingleOrder(orderRecords, config, orderNumber) {
    try {
      const processedRecords = [];
      const articleLineMap = new Map(); // Mapeo: artículo regular → línea final
      let finalLineCounter = 1;

      // ✅ Separar artículos regulares de bonificaciones
      const regularArticles = orderRecords.filter(
        (record) =>
          record[config.bonificationIndicatorField] !==
          config.bonificationIndicatorValue
      );

      const bonifications = orderRecords.filter(
        (record) =>
          record[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue
      );

      if (this.debug) {
        logger.debug(
          `📊 [BONIF] Pedido ${orderNumber}: ${regularArticles.length} regulares, ${bonifications.length} bonificaciones`
        );
      }

      // ✅ FASE 1: Procesar artículos regulares primero
      for (const article of regularArticles) {
        const processedArticle = {
          ...article, // Mantener todos los campos originales
          // ✅ Campos calculados para tabla destino
          CALCULATED_PEDIDO_LINEA: finalLineCounter,
          CALCULATED_PEDIDO_LINEA_BONIF: null, // Artículos regulares no tienen referencia
          [config.bonificationReferenceField]: null, // Limpiar campo de referencia original
        };

        // ✅ Mapear artículo regular a su línea final
        const articleCode = article[config.regularArticleField];
        articleLineMap.set(articleCode, finalLineCounter);

        processedRecords.push(processedArticle);

        if (this.debug) {
          logger.debug(
            `✅ [BONIF] Regular: ${articleCode} → línea ${finalLineCounter}`
          );
        }

        finalLineCounter++;
      }

      // ✅ FASE 2: Procesar bonificaciones con referencias
      for (const bonification of bonifications) {
        const referencedArticle =
          bonification[config.bonificationReferenceField];
        const referencedLine = articleLineMap.get(referencedArticle);

        const processedBonification = {
          ...bonification, // Mantener todos los campos originales
          // ✅ Campos calculados para tabla destino
          CALCULATED_PEDIDO_LINEA: finalLineCounter,
          CALCULATED_PEDIDO_LINEA_BONIF: referencedLine || null, // Referencia a línea del artículo regular
          [config.bonificationReferenceField]: null, // Limpiar campo de referencia original
        };

        // ✅ Validar si la bonificación tiene referencia válida
        if (!referencedLine) {
          logger.warn(
            `⚠️ [BONIF] Bonificación huérfana en pedido ${orderNumber}: artículo referenciado '${referencedArticle}' no encontrado`
          );
        } else {
          if (this.debug) {
            const bonifCode = bonification[config.regularArticleField];
            logger.debug(
              `🎁 [BONIF] Bonificación: ${bonifCode} línea ${finalLineCounter} → referencia línea ${referencedLine}`
            );
          }
        }

        processedRecords.push(processedBonification);
        finalLineCounter++;
      }

      if (this.debug) {
        logger.debug(
          `✅ [BONIF] Pedido ${orderNumber} completado: ${processedRecords.length} líneas procesadas`
        );
      }

      return processedRecords;
    } catch (error) {
      logger.error(
        `❌ [BONIF] Error procesando pedido ${orderNumber}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🔧 Obtiene datos usando flujo normal (sin bonificaciones)
   *
   * Método de fallback para cuando no hay procesamiento de bonificaciones configurado.
   * Utiliza la configuración de tablas estándar del mapping.
   *
   * @param {Array} documentIds - IDs de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión SQL Server
   * @returns {Promise<Array>} Datos obtenidos normalmente
   */
  async getRegularSourceData(documentIds, mapping, connection) {
    try {
      // ✅ Buscar tabla principal en la configuración
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error(
          "No se encontró tabla principal en la configuración de mapeo"
        );
      }

      const primaryKey = mainTable.primaryKey || "NUM_PED";
      const sourceTable = mainTable.sourceTable;

      // ✅ Preparar consulta
      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};

      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      const query = `
        SELECT * FROM ${sourceTable}
        WHERE ${primaryKey} IN (${placeholders})
        ORDER BY ${primaryKey}
      `;

      if (this.debug) {
        logger.debug(`🔍 [BONIF] Query normal (sin bonificaciones):`, {
          table: sourceTable,
          primaryKey,
          documentCount: documentIds.length,
        });
      }

      // ✅ Ejecutar consulta
      const result = await SqlService.query(connection, query, params);
      const data = result.recordset || [];

      logger.info(
        `📦 [BONIF] Datos normales obtenidos: ${data.length} registros de ${sourceTable}`
      );
      return data;
    } catch (error) {
      logger.error(
        `❌ [BONIF] Error obteniendo datos regulares: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🔧 UTILIDADES Y HELPERS
   */

  /**
   * Agrupa array de datos por un campo específico
   * @param {Array} data - Datos a agrupar
   * @param {string} field - Campo por el cual agrupar
   * @returns {Map} Map con datos agrupados
   */
  groupDataByField(data, field) {
    const grouped = new Map();

    data.forEach((record) => {
      const key = record[field];
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return grouped;
  }

  /**
   * Valida la configuración de bonificaciones
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Object} Resultado de validación
   */
  validateBonificationConfig(mapping) {
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
   * Genera log detallado del procesamiento para debugging
   * @param {Array} rawData - Datos originales
   * @param {Array} processedData - Datos procesados
   * @param {Object} config - Configuración utilizada
   */
  logProcessingSummary(rawData, processedData, config) {
    try {
      // ✅ Calcular estadísticas
      const totalBonifications = rawData.filter(
        (r) =>
          r[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue
      ).length;

      const totalRegular = rawData.length - totalBonifications;

      const processedBonifications = processedData.filter(
        (r) => r.CALCULATED_PEDIDO_LINEA_BONIF !== null
      ).length;

      const orphanedBonifications = processedData.filter(
        (r) =>
          r[config.bonificationIndicatorField] ===
            config.bonificationIndicatorValue &&
          r.CALCULATED_PEDIDO_LINEA_BONIF === null
      ).length;

      // ✅ Log resumen completo
      logger.info(`📊 [BONIF] === RESUMEN DEL PROCESAMIENTO ===`, {
        version: this.version,
        datosOriginales: rawData.length,
        articulosRegulares: totalRegular,
        bonificacionesOriginales: totalBonifications,
        datosProcesados: processedData.length,
        bonificacionesConReferencia: processedBonifications,
        bonificacionesHuerfanas: orphanedBonifications,
        pedidosProcesados: this.processedOrders.size,
        eficiencia: `${(
          (processedBonifications / totalBonifications) *
          100
        ).toFixed(1)}%`,
      });
    } catch (error) {
      logger.warn(`⚠️ [BONIF] Error generando resumen: ${error.message}`);
    }
  }

  /**
   * Habilita o deshabilita el modo debug
   * @param {boolean} enabled - True para habilitar debug
   */
  setDebugMode(enabled) {
    this.debug = enabled;
    logger.info(
      `🔧 [BONIF] Modo debug ${enabled ? "habilitado" : "deshabilitado"}`
    );
  }

  /**
   * Obtiene estadísticas del estado actual
   * @returns {Object} Estadísticas
   */
  getStats() {
    return {
      version: this.version,
      processedOrders: this.processedOrders.size,
      debugMode: this.debug,
      ordersInMemory: Array.from(this.processedOrders),
    };
  }
}

// ✅ Exportar instancia singleton
module.exports = new BonificationService();
