// BonificationProcessingService.js - VERSIÓN COMPLETA
const logger = require("./logger");
const { SqlService } = require("./SqlService");

class BonificationProcessingService {
  /**
   * Procesa bonificaciones para un documento específico
   * @param {Object} connection - Conexión a la base de datos
   * @param {string} documentId - ID del documento a procesar
   * @param {Object} bonificationConfig - Configuración de bonificaciones
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processBonifications(connection, documentId, bonificationConfig) {
    const startTime = Date.now();

    try {
      logger.info(
        `🎁 Iniciando procesamiento de bonificaciones para documento: ${documentId}`
      );

      // 1. Validar configuración
      this.validateBonificationConfig(bonificationConfig);

      // 2. Obtener todos los registros del documento de la tabla origen
      const allRecords = await this.getAllRecords(
        connection,
        documentId,
        bonificationConfig
      );

      if (!allRecords || allRecords.length === 0) {
        logger.warn(`No se encontraron registros para documento ${documentId}`);
        return {
          success: true,
          processed: 0,
          message: "No hay registros para procesar",
          bonificationMapping: null,
        };
      }

      // 3. Separar artículos regulares y bonificaciones
      const regularArticles = allRecords.filter(
        (record) =>
          record[bonificationConfig.bonificationIndicatorField] !==
          bonificationConfig.bonificationIndicatorValue
      );

      const bonifications = allRecords.filter(
        (record) =>
          record[bonificationConfig.bonificationIndicatorField] ===
          bonificationConfig.bonificationIndicatorValue
      );

      logger.info(
        `📊 Documento ${documentId}: ${regularArticles.length} regulares, ${bonifications.length} bonificaciones`
      );

      // 4. Si no hay bonificaciones, solo mapear regulares
      if (bonifications.length === 0) {
        logger.info(
          `✅ Documento ${documentId}: No hay bonificaciones que procesar`
        );
        const bonificationMapping = this.createRegularOnlyMapping(
          regularArticles,
          bonificationConfig
        );
        return {
          success: true,
          processed: 0,
          regularArticles: regularArticles.length,
          bonifications: 0,
          message: "No hay bonificaciones en este documento",
          bonificationMapping,
        };
      }

      // 5. Crear el mapeo usando NUM_LN existente
      const bonificationMapping = await this.createBonificationMappingFromNumLn(
        regularArticles,
        bonifications,
        bonificationConfig
      );

      const processingTime = Date.now() - startTime;
      logger.info(
        `✅ Procesamiento de bonificaciones completado para documento ${documentId} en ${processingTime}ms`
      );

      return {
        success: true,
        processed: bonificationMapping.mappedBonifications,
        regularArticles: regularArticles.length,
        bonifications: bonifications.length,
        orphanBonifications: bonificationMapping.orphanBonifications,
        processingTimeMs: processingTime,
        message: `Procesado: ${bonificationMapping.mappedBonifications} bonificaciones mapeadas, ${bonificationMapping.orphanBonifications} huérfanas`,
        bonificationMapping: bonificationMapping,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando bonificaciones para documento ${documentId}:`,
        {
          error: error.message,
          stack: error.stack,
          documentId,
          config: bonificationConfig,
        }
      );

      return {
        success: false,
        error: error.message,
        processed: 0,
        documentId,
        bonificationMapping: null,
      };
    }
  }

  /**
   * ✅ MÉTODO FALTANTE: Aplica reglas de promociones
   * @param {Array} originalDetails - Detalles originales
   * @param {Object} customerContext - Contexto del cliente
   * @param {Object} bonificationConfig - Configuración de bonificaciones
   * @returns {Promise<Array>} - Detalles con promociones aplicadas
   */
  async applyPromotionRules(
    originalDetails,
    customerContext,
    bonificationConfig
  ) {
    try {
      logger.info(
        `🎯 Aplicando reglas de promociones a ${originalDetails.length} detalles`
      );

      // Clonar detalles para no modificar el original
      let enhancedDetails = [...originalDetails];

      // 1. Aplicar promociones por familia
      enhancedDetails = await this._applyFamilyPromotions(
        enhancedDetails,
        customerContext,
        bonificationConfig
      );

      // 2. Aplicar promociones por volumen
      enhancedDetails = await this._applyVolumePromotions(
        enhancedDetails,
        customerContext,
        bonificationConfig
      );

      // 3. Aplicar promociones especiales
      enhancedDetails = await this._applySpecialPromotions(
        enhancedDetails,
        customerContext,
        bonificationConfig
      );

      logger.info(
        `✅ Promociones aplicadas: ${
          enhancedDetails.length - originalDetails.length
        } nuevos items generados`
      );

      return enhancedDetails;
    } catch (error) {
      logger.error(
        `❌ Error aplicando reglas de promociones: ${error.message}`
      );
      return originalDetails; // Retornar original si falla
    }
  }

  /**
   * ✅ MÉTODO FALTANTE: Detecta tipos de promociones en los detalles procesados
   * @param {Array} processedDetails - Detalles procesados
   * @param {Object} bonificationConfig - Configuración de bonificaciones
   * @param {Object} sourceData - Datos de origen del documento
   * @returns {Object} - Información de promociones detectadas
   */
  detectPromotionTypes(processedDetails, bonificationConfig, sourceData) {
    try {
      logger.info(
        `🔍 Detectando tipos de promociones en ${processedDetails.length} detalles`
      );

      const promotions = {
        summary: {
          totalPromotions: 0,
          totalBonifiedItems: 0,
          totalDiscountAmount: 0,
          appliedPromotions: [],
        },
        details: [],
        byType: {},
      };

      // Contadores por tipo
      const typeCounters = {
        FAMILY_BONUS: 0,
        VOLUME_BONUS: 0,
        SPECIAL_OFFER: 0,
        FREE_PRODUCT: 0,
        DISCOUNT: 0,
      };

      // Analizar cada detalle
      for (const detail of processedDetails) {
        const detailPromotion = this._analyzeDetailPromotion(
          detail,
          bonificationConfig,
          sourceData
        );

        if (detailPromotion.isPromotion) {
          promotions.details.push(detailPromotion);
          typeCounters[detailPromotion.type]++;
          promotions.summary.totalPromotions++;

          if (detailPromotion.isBonification) {
            promotions.summary.totalBonifiedItems++;
          }

          if (detailPromotion.discountAmount) {
            promotions.summary.totalDiscountAmount +=
              detailPromotion.discountAmount;
          }
        }
      }

      // Consolidar tipos aplicados
      for (const [type, count] of Object.entries(typeCounters)) {
        if (count > 0) {
          promotions.summary.appliedPromotions.push({
            type,
            count,
            description: this._getPromotionTypeDescription(type),
          });
          promotions.byType[type] = {
            count,
            items: promotions.details.filter((d) => d.type === type),
          };
        }
      }

      logger.info(
        `✅ Promociones detectadas: ${promotions.summary.totalPromotions} promociones de ${promotions.summary.appliedPromotions.length} tipos diferentes`
      );

      return promotions;
    } catch (error) {
      logger.error(`❌ Error detectando promociones: ${error.message}`);
      return {
        summary: {
          totalPromotions: 0,
          totalBonifiedItems: 0,
          totalDiscountAmount: 0,
          appliedPromotions: [],
        },
        details: [],
        byType: {},
      };
    }
  }

  /**
   * Obtiene todos los registros del documento
   */
  async getAllRecords(connection, documentId, config) {
    try {
      const query = `
        SELECT *
        FROM ${config.sourceTable}
        WHERE ${config.orderField} = @documentId
        ORDER BY ${config.lineNumberField || "NUM_LN"}
      `;

      const result = await SqlService.query(connection, query, { documentId });

      logger.debug(
        `📊 Obtenidos ${result.recordset.length} registros para documento ${documentId}`
      );

      // Verificar si NUM_LN existe
      if (result.recordset.length > 0) {
        const firstRecord = result.recordset[0];
        const hasNumLn = firstRecord.hasOwnProperty("NUM_LN");

        if (!hasNumLn) {
          logger.warn(
            `⚠️ Campo NUM_LN no encontrado en ${result.recordset.length} registros`
          );
        } else {
          logger.debug(
            `✅ Columna NUM_LN encontrada en ${result.recordset.length} registros`
          );
        }
      }

      return result.recordset;
    } catch (error) {
      logger.error(`Error obteniendo registros: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea mapeo solo de productos regulares
   */
  createRegularOnlyMapping(regularArticles, config) {
    const regularMapping = new Map();

    regularArticles.forEach((article) => {
      const articleCode = article[config.regularArticleField];
      const numLn = article["NUM_LN"] || article[config.lineNumberField];

      regularMapping.set(articleCode, {
        ...article,
        lineNumber: numLn,
        isRegular: true,
      });

      logger.debug(`📋 Artículo regular: ${articleCode} → Línea: ${numLn}`);
    });

    return {
      regularMapping,
      bonificationMapping: new Map(),
      mappedBonifications: 0,
      orphanBonifications: 0,
      orphanList: [],
    };
  }

  /**
   * Crea el mapeo de bonificaciones usando NUM_LN existente
   */
  async createBonificationMappingFromNumLn(
    regularArticles,
    bonifications,
    config
  ) {
    logger.info(`🔗 Creando mapeo de bonificaciones usando NUM_LN existente`);

    // 1. Crear mapa de artículos regulares: COD_ART → NUM_LN
    const regularMapping = new Map();
    const articleToLineMap = new Map();

    regularArticles.forEach((article) => {
      const articleCode = article[config.regularArticleField];
      const numLn = article["NUM_LN"] || article[config.lineNumberField];

      regularMapping.set(articleCode, {
        ...article,
        lineNumber: numLn,
        isRegular: true,
      });

      articleToLineMap.set(articleCode, numLn);
      logger.debug(`📋 Artículo regular: ${articleCode} → Línea: ${numLn}`);
    });

    // 2. Mapear bonificaciones con artículos regulares
    const bonificationMapping = new Map();
    let mappedBonifications = 0;
    let orphanBonifications = 0;
    const orphanList = [];

    bonifications.forEach((bonification) => {
      const bonificationCode = bonification[config.regularArticleField];
      const regularArticleCode =
        bonification[config.bonificationReferenceField];
      const bonificationNumLn =
        bonification["NUM_LN"] || bonification[config.lineNumberField];

      logger.debug(
        `🎁 Procesando bonificación: ${bonificationCode}, refiere a: ${regularArticleCode}, NUM_LN: ${bonificationNumLn}`
      );

      if (!regularArticleCode) {
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          reason: "Sin COD_ART_RFR",
        });
        return;
      }

      const regularLineNumber = articleToLineMap.get(regularArticleCode);

      if (!regularLineNumber) {
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          regularArticleCode,
          reason: "Artículo regular no encontrado",
        });
        return;
      }

      bonificationMapping.set(bonificationCode, {
        ...bonification,
        lineNumber: bonificationNumLn,
        bonificationLineReference: regularLineNumber,
        isRegular: false,
        referencedArticle: regularArticleCode,
      });

      mappedBonifications++;
      logger.debug(
        `✅ Bonificación: ${bonificationCode} (línea ${bonificationNumLn}) → refiere línea regular ${regularLineNumber}`
      );
    });

    logger.info(
      `✅ Mapeo completado: ${mappedBonifications} mapeadas, ${orphanBonifications} huérfanas`
    );

    if (orphanBonifications > 0) {
      logger.warn(`⚠️ Bonificaciones huérfanas:`, orphanList);
    }

    return {
      regularMapping,
      bonificationMapping,
      mappedBonifications,
      orphanBonifications,
      orphanList,
    };
  }

  /**
   * Valida la configuración de bonificaciones
   */
  validateBonificationConfig(config) {
    const required = [
      "sourceTable",
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "orderField",
      "lineNumberField",
      "bonificationLineReferenceField",
    ];

    const missing = required.filter((field) => !config[field]);

    if (missing.length > 0) {
      throw new Error(
        `Campos requeridos faltantes en configuración de bonificaciones: ${missing.join(
          ", "
        )}`
      );
    }

    // Validaciones adicionales
    if (config.bonificationIndicatorField === config.regularArticleField) {
      throw new Error(
        "El campo indicador de bonificación no puede ser el mismo que el campo de artículo regular"
      );
    }

    if (config.lineNumberField === config.bonificationLineReferenceField) {
      throw new Error(
        "El campo de número de línea no puede ser el mismo que el campo de referencia de bonificación"
      );
    }

    return true;
  }

  /**
   * Obtiene estadísticas de bonificaciones para un documento
   */
  async getBonificationStats(connection, documentId, config) {
    try {
      const statsQuery = `
        SELECT
          COUNT(*) as total_records,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue THEN 1 END) as bonifications,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} != @bonificationValue OR ${config.bonificationIndicatorField} IS NULL THEN 1 END) as regular_articles,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue AND ${config.bonificationLineReferenceField} IS NOT NULL THEN 1 END) as mapped_bonifications,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue AND ${config.bonificationLineReferenceField} IS NULL THEN 1 END) as orphan_bonifications
        FROM ${config.sourceTable}
        WHERE ${config.orderField} = @documentId
      `;

      const result = await SqlService.query(connection, statsQuery, {
        documentId,
        bonificationValue: config.bonificationIndicatorValue,
      });

      return result.recordset[0];
    } catch (error) {
      logger.error(`Error obteniendo estadísticas de bonificaciones:`, error);
      return null;
    }
  }

  // ===================================================
  // MÉTODOS PRIVADOS PARA PROMOCIONES
  // ===================================================

  /**
   * Aplica promociones por familia de productos
   * @private
   */
  async _applyFamilyPromotions(details, customerContext, config) {
    // Implementación básica - puede expandirse según reglas específicas
    logger.debug(`🏷️ Aplicando promociones por familia`);

    // Por ahora retornamos los detalles sin cambios
    // Aquí iría la lógica específica de promociones por familia
    return details;
  }

  /**
   * Aplica promociones por volumen
   * @private
   */
  async _applyVolumePromotions(details, customerContext, config) {
    logger.debug(`📦 Aplicando promociones por volumen`);

    // Implementación básica - puede expandirse según reglas específicas
    return details;
  }

  /**
   * Aplica promociones especiales
   * @private
   */
  async _applySpecialPromotions(details, customerContext, config) {
    logger.debug(`⭐ Aplicando promociones especiales`);

    // Implementación básica - puede expandirse según reglas específicas
    return details;
  }

  /**
   * Analiza un detalle individual para detectar promociones
   * @private
   */
  _analyzeDetailPromotion(detail, config, sourceData) {
    const isBonus =
      detail[config.bonificationIndicatorField] ===
      config.bonificationIndicatorValue;

    // Análisis básico
    if (isBonus) {
      return {
        isPromotion: true,
        isBonification: true,
        type: "FREE_PRODUCT",
        articleCode: detail[config.regularArticleField],
        quantity: detail[config.quantityField] || 0,
        discountAmount: 0,
        description: "Producto bonificado",
      };
    }

    // Verificar si es promoción sin ser bonificación
    const hasSpecialPrice = detail.PRECIO_ESPECIAL || detail.DESCUENTO;
    if (hasSpecialPrice) {
      return {
        isPromotion: true,
        isBonification: false,
        type: "DISCOUNT",
        articleCode: detail[config.regularArticleField],
        quantity: detail[config.quantityField] || 0,
        discountAmount: detail.DESCUENTO || 0,
        description: "Descuento especial",
      };
    }

    return {
      isPromotion: false,
      isBonification: false,
      type: null,
    };
  }

  /**
   * Obtiene descripción del tipo de promoción
   * @private
   */
  _getPromotionTypeDescription(type) {
    const descriptions = {
      FAMILY_BONUS: "Bonificación por familia",
      VOLUME_BONUS: "Bonificación por volumen",
      SPECIAL_OFFER: "Oferta especial",
      FREE_PRODUCT: "Producto gratis",
      DISCOUNT: "Descuento aplicado",
    };

    return descriptions[type] || "Promoción desconocida";
  }
}

module.exports = BonificationProcessingService;
