// BonificationService.js - VERSIÓN CORREGIDA
class BonificationService {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.processedOrders = new Set();
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
            [config.lineNumberField]: currentLineNumber,
            [config.bonificationLineReferenceField]: null,
            // Limpiar referencia original
            [config.bonificationReferenceField]: null,
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
              [config.lineNumberField]: currentLineNumber,
              [config.bonificationLineReferenceField]: null, // ERROR: Sin referencia
              [config.bonificationReferenceField]: null,
              // Marcar como problemático
              _BONIFICATION_ERROR: `REFERENCIA_NO_ENCONTRADA: ${referencedArticleCode}`,
            };

            processedRecords.push(processedBonification);
          } else {
            // ✅ BONIFICACIÓN VÁLIDA
            const processedBonification = {
              ...record,
              [config.lineNumberField]: currentLineNumber,
              [config.bonificationLineReferenceField]:
                referencedArticle.lineNumber,
              [config.bonificationReferenceField]: null, // Limpiar COD_ART_RFR

              // 🔥 CORREGIR CANTIDAD: Usar CNT_MAX correctamente
              [config.quantityField]: this.validateQuantity(
                record[config.quantityField]
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
                  processedBonification[config.quantityField]
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
   * 🔧 MEJORADO: Procesar múltiples pedidos con mejor control de errores
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
   * 🔧 NUEVO: Validar configuración de bonificaciones
   */
  validateConfig(config) {
    const requiredFields = [
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "orderField",
      "lineNumberField",
      "bonificationLineReferenceField",
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
}

module.exports = BonificationService;
