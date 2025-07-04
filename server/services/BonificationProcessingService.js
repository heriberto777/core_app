// BonificationProcessingService.js - VERSIÓN LIMPIA Y COMPLETA
const logger = require("./logger");
const { SqlService } = require("./SqlService");

class BonificationProcessingService {
  constructor() {
    this.defaultConfig = {
      bonificationIndicatorField: "TIPO_ART",
      bonificationIndicatorValue: "B",
      regularArticleField: "COD_ART",
      bonificationLineReferenceField: "NUM_LN_REF",
      orderField: "NUM_PED",
      lineNumberField: "NUM_LN",
      quantityField: "CANT",
      sourceTable: "PED_VEN_REN",
    };
  }

  // ================================
  // MÉTODOS PRINCIPALES
  // ================================

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

      // 1. Validar y normalizar configuración
      const config = this._validateAndNormalizeConfig(bonificationConfig);

      // 2. Obtener todos los registros del documento
      const allRecords = await this._getAllRecords(
        connection,
        documentId,
        config
      );

      if (!allRecords || allRecords.length === 0) {
        logger.warn(`No se encontraron registros para documento ${documentId}`);
        return this._buildEmptyResult();
      }

      // 3. Separar artículos regulares y bonificaciones
      const { regularArticles, bonifications } =
        this._separateArticlesAndBonifications(allRecords, config);

      logger.info(
        `📊 Documento ${documentId}: ${regularArticles.length} regulares, ${bonifications.length} bonificaciones`
      );

      // 4. Si no hay bonificaciones, solo mapear regulares
      if (bonifications.length === 0) {
        return this._buildRegularOnlyResult(regularArticles, config);
      }

      // 5. Crear mapeo usando números de línea existentes
      const bonificationMapping =
        await this._createBonificationMappingFromNumLn(
          regularArticles,
          bonifications,
          config
        );

      // 6. Detectar tipos de promociones
      const promotionAnalysis = this._detectPromotionTypes(allRecords, config, {
        regularArticles,
        bonifications,
      });

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
        promotionTypes: promotionAnalysis.byType,
        totalPromotions: promotionAnalysis.summary.totalPromotions,
        totalDiscountAmount: promotionAnalysis.summary.totalDiscountAmount,
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
   * Aplica reglas de promociones a los detalles
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
   * Detecta tipos de promociones en los detalles procesados
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

      // Establecer contadores por tipo
      promotions.byType = typeCounters;

      logger.info(
        `✅ Promociones detectadas: ${promotions.summary.totalPromotions} total, ${promotions.summary.totalBonifiedItems} bonificados`
      );

      return promotions;
    } catch (error) {
      logger.error(
        `❌ Error detectando tipos de promociones: ${error.message}`
      );
      return {
        summary: {
          totalPromotions: 0,
          totalBonifiedItems: 0,
          totalDiscountAmount: 0,
        },
        details: [],
        byType: {},
      };
    }
  }

  /**
   * Obtiene estadísticas de bonificaciones para un documento
   * @param {Object} connection - Conexión a la base de datos
   * @param {string} documentId - ID del documento
   * @param {Object} config - Configuración de bonificaciones
   * @returns {Promise<Object>} - Estadísticas
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

  // ================================
  // MÉTODOS PRIVADOS PRINCIPALES
  // ================================

  /**
   * Valida y normaliza la configuración de bonificaciones
   * @private
   */
  _validateAndNormalizeConfig(bonificationConfig) {
    if (!bonificationConfig) {
      throw new Error("Configuración de bonificaciones requerida");
    }

    // Combinar con configuración por defecto
    const config = { ...this.defaultConfig, ...bonificationConfig };

    // Validaciones específicas
    this._validateConfig(config);

    return config;
  }

  /**
   * Valida la configuración de bonificaciones
   * @private
   */
  _validateConfig(config) {
    const requiredFields = [
      "sourceTable",
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "orderField",
      "lineNumberField",
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Campo requerido faltante en configuración: ${field}`);
      }
    }

    // Validaciones adicionales
    if (
      config.bonificationIndicatorValue === null ||
      config.bonificationIndicatorValue === undefined
    ) {
      throw new Error(
        "El valor indicador de bonificación no puede ser null o undefined"
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
   * Obtiene todos los registros del documento
   * @private
   */
  async _getAllRecords(connection, documentId, config) {
    try {
      const query = `
        SELECT *
        FROM ${config.sourceTable}
        WHERE ${config.orderField} = @documentId
        ORDER BY ${config.lineNumberField}
      `;

      const result = await SqlService.query(connection, query, { documentId });
      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo registros del documento ${documentId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Separa artículos regulares de bonificaciones
   * @private
   */
  _separateArticlesAndBonifications(allRecords, config) {
    const regularArticles = allRecords.filter(
      (record) =>
        record[config.bonificationIndicatorField] !==
        config.bonificationIndicatorValue
    );

    const bonifications = allRecords.filter(
      (record) =>
        record[config.bonificationIndicatorField] ===
        config.bonificationIndicatorValue
    );

    return { regularArticles, bonifications };
  }

  /**
   * Crea mapeo de bonificaciones usando números de línea
   * @private
   */
  async _createBonificationMappingFromNumLn(
    regularArticles,
    bonifications,
    config
  ) {
    try {
      logger.info(
        `🔗 Creando mapeo de bonificaciones usando ${config.bonificationLineReferenceField}`
      );

      const mappingResult = {
        mappedBonifications: 0,
        orphanBonifications: 0,
        mappings: [],
        orphanList: [],
      };

      // Crear índice de artículos regulares por número de línea
      const regularByLineNumber = new Map();
      regularArticles.forEach((article) => {
        const lineNumber = article[config.lineNumberField];
        if (lineNumber) {
          regularByLineNumber.set(lineNumber, article);
        }
      });

      // Procesar cada bonificación
      for (const bonification of bonifications) {
        const referenceLineNumber =
          bonification[config.bonificationLineReferenceField];

        if (
          referenceLineNumber &&
          regularByLineNumber.has(referenceLineNumber)
        ) {
          // Bonificación mapeada correctamente
          const linkedRegularArticle =
            regularByLineNumber.get(referenceLineNumber);

          mappingResult.mappings.push({
            bonification,
            linkedRegularArticle,
            lineReference: referenceLineNumber,
            regularArticleCode:
              linkedRegularArticle[config.regularArticleField],
            bonificationQuantity: bonification[config.quantityField] || 0,
          });

          mappingResult.mappedBonifications++;

          logger.debug(
            `✅ Bonificación mapeada: ${
              bonification[config.regularArticleField]
            } -> línea ${referenceLineNumber}`
          );
        } else {
          // Bonificación huérfana
          mappingResult.orphanList.push({
            bonification,
            referenceLineNumber,
            reason: referenceLineNumber
              ? "Línea de referencia no encontrada"
              : "Sin línea de referencia",
          });

          mappingResult.orphanBonifications++;

          logger.warn(
            `⚠️ Bonificación huérfana: ${
              bonification[config.regularArticleField]
            } (ref: ${referenceLineNumber})`
          );
        }
      }

      logger.info(
        `✅ Mapeo completado: ${mappingResult.mappedBonifications} mapeadas, ${mappingResult.orphanBonifications} huérfanas`
      );

      return mappingResult;
    } catch (error) {
      logger.error(
        `❌ Error creando mapeo de bonificaciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Construye resultado para documento sin bonificaciones
   * @private
   */
  _buildRegularOnlyResult(regularArticles, config) {
    logger.info(
      `✅ Documento sin bonificaciones: ${regularArticles.length} artículos regulares`
    );

    return {
      success: true,
      processed: 0,
      regularArticles: regularArticles.length,
      bonifications: 0,
      orphanBonifications: 0,
      message: "No hay bonificaciones en este documento",
      bonificationMapping: {
        mappedBonifications: 0,
        orphanBonifications: 0,
        mappings: [],
        orphanList: [],
      },
      promotionTypes: {},
      totalPromotions: 0,
      totalDiscountAmount: 0,
    };
  }

  /**
   * Construye resultado vacío
   * @private
   */
  _buildEmptyResult() {
    return {
      success: true,
      processed: 0,
      regularArticles: 0,
      bonifications: 0,
      orphanBonifications: 0,
      message: "No hay registros para procesar",
      bonificationMapping: null,
      promotionTypes: {},
      totalPromotions: 0,
      totalDiscountAmount: 0,
    };
  }

  // =======================================
  // MÉTODOS DE REGLAS DE PROMOCIONES
  // =======================================

  /**
   * Aplica promociones por familia de productos
   * @private
   */
  async _applyFamilyPromotions(details, customerContext, config) {
    logger.debug(`🏷️ Aplicando promociones por familia`);

    try {
      // Agrupar por familia de productos
      const familyGroups = this._groupByFamily(details);
      let promotionsApplied = 0;

      // Reglas de ejemplo por familia
      const familyRules = {
        LACTEOS: { minQuantity: 10, bonusPercentage: 0.1 },
        CARNES: { minQuantity: 5, bonusPercentage: 0.15 },
        BEBIDAS: { minQuantity: 12, bonusPercentage: 0.08 },
      };

      for (const [family, items] of Object.entries(familyGroups)) {
        const rule = familyRules[family];
        if (!rule) continue;

        const totalQuantity = items.reduce(
          (sum, item) => sum + (item.CANT || 0),
          0
        );

        if (totalQuantity >= rule.minQuantity) {
          // Aplicar bonificación por familia
          const bonusQuantity = Math.floor(
            totalQuantity * rule.bonusPercentage
          );

          if (bonusQuantity > 0) {
            // Agregar artículo bonificado
            const bonusItem = this._createFamilyBonusItem(
              items[0],
              bonusQuantity,
              family
            );
            details.push(bonusItem);
            promotionsApplied++;

            logger.debug(
              `✅ Promoción familia ${family}: +${bonusQuantity} unidades`
            );
          }
        }
      }

      logger.info(`🏷️ Promociones por familia aplicadas: ${promotionsApplied}`);
      return details;
    } catch (error) {
      logger.error(`Error aplicando promociones por familia: ${error.message}`);
      return details;
    }
  }

  /**
   * Aplica promociones por volumen
   * @private
   */
  async _applyVolumePromotions(details, customerContext, config) {
    logger.debug(`📦 Aplicando promociones por volumen`);

    try {
      let promotionsApplied = 0;

      // Reglas de volumen por artículo
      const volumeRules = [
        { minQuantity: 50, bonusQuantity: 5, description: "50+5 gratis" },
        { minQuantity: 100, bonusQuantity: 12, description: "100+12 gratis" },
        { minQuantity: 200, bonusQuantity: 30, description: "200+30 gratis" },
      ];

      // Agrupar por código de artículo
      const articleGroups = this._groupByArticle(details);

      for (const [articleCode, items] of Object.entries(articleGroups)) {
        const totalQuantity = items.reduce(
          (sum, item) => sum + (item.CANT || 0),
          0
        );

        // Encontrar la mejor regla aplicable
        const applicableRule = volumeRules
          .filter((rule) => totalQuantity >= rule.minQuantity)
          .pop(); // Tomar la de mayor volumen

        if (applicableRule) {
          const bonusItem = this._createVolumeBonusItem(
            items[0],
            applicableRule.bonusQuantity,
            applicableRule.description
          );
          details.push(bonusItem);
          promotionsApplied++;

          logger.debug(
            `✅ Promoción volumen ${articleCode}: ${applicableRule.description}`
          );
        }
      }

      logger.info(`📦 Promociones por volumen aplicadas: ${promotionsApplied}`);
      return details;
    } catch (error) {
      logger.error(`Error aplicando promociones por volumen: ${error.message}`);
      return details;
    }
  }

  /**
   * Aplica promociones especiales
   * @private
   */
  async _applySpecialPromotions(details, customerContext, config) {
    logger.debug(`⭐ Aplicando promociones especiales`);

    try {
      let promotionsApplied = 0;

      // Promociones especiales por cliente
      if (customerContext?.isVIP) {
        const vipBonus = this._applyVIPPromotion(details);
        if (vipBonus.length > 0) {
          details.push(...vipBonus);
          promotionsApplied += vipBonus.length;
          logger.debug(`✅ Promoción VIP aplicada: ${vipBonus.length} items`);
        }
      }

      // Promociones estacionales
      const seasonalBonus = this._applySeasonalPromotions(details);
      if (seasonalBonus.length > 0) {
        details.push(...seasonalBonus);
        promotionsApplied += seasonalBonus.length;
        logger.debug(
          `✅ Promociones estacionales aplicadas: ${seasonalBonus.length} items`
        );
      }

      logger.info(`⭐ Promociones especiales aplicadas: ${promotionsApplied}`);
      return details;
    } catch (error) {
      logger.error(`Error aplicando promociones especiales: ${error.message}`);
      return details;
    }
  }

  // =======================================
  // MÉTODOS DE ANÁLISIS DE PROMOCIONES
  // =======================================

  /**
   * Analiza un detalle individual para detectar promociones
   * @private
   */
  _analyzeDetailPromotion(detail, config, sourceData) {
    const isBonus =
      detail[config.bonificationIndicatorField] ===
      config.bonificationIndicatorValue;

    // Análisis de bonificación
    if (isBonus) {
      return {
        isPromotion: true,
        isBonification: true,
        type: "FREE_PRODUCT",
        articleCode: detail[config.regularArticleField],
        quantity: detail[config.quantityField] || 0,
        discountAmount: 0,
        description: "Producto bonificado",
        lineNumber: detail[config.lineNumberField],
        referenceLineNumber: detail[config.bonificationLineReferenceField],
      };
    }

    // Análisis de descuentos especiales
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
        lineNumber: detail[config.lineNumberField],
      };
    }

    // Análisis de promociones por volumen
    if (detail.CANT && detail.CANT >= 50) {
      return {
        isPromotion: true,
        isBonification: false,
        type: "VOLUME_BONUS",
        articleCode: detail[config.regularArticleField],
        quantity: detail[config.quantityField] || 0,
        discountAmount: 0,
        description: "Promoción por volumen",
        lineNumber: detail[config.lineNumberField],
      };
    }

    return {
      isPromotion: false,
      isBonification: false,
      type: null,
    };
  }

  /**
   * Detecta tipos de promociones
   * @private
   */
  _detectPromotionTypes(processedDetails, config, sourceData) {
    const promotions = {
      summary: {
        totalPromotions: 0,
        totalBonifiedItems: 0,
        totalDiscountAmount: 0,
        appliedPromotions: [],
      },
      details: [],
      byType: {
        FAMILY_BONUS: 0,
        VOLUME_BONUS: 0,
        SPECIAL_OFFER: 0,
        FREE_PRODUCT: 0,
        DISCOUNT: 0,
      },
    };

    // Analizar cada detalle
    for (const detail of processedDetails) {
      const detailPromotion = this._analyzeDetailPromotion(
        detail,
        config,
        sourceData
      );

      if (detailPromotion.isPromotion) {
        promotions.details.push(detailPromotion);
        promotions.byType[detailPromotion.type]++;
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

    return promotions;
  }

  // =======================================
  // MÉTODOS DE UTILIDAD
  // =======================================

  /**
   * Agrupa detalles por familia
   * @private
   */
  _groupByFamily(details) {
    const groups = {};
    details.forEach((detail) => {
      const family = detail.FAMILIA || "SIN_FAMILIA";
      if (!groups[family]) groups[family] = [];
      groups[family].push(detail);
    });
    return groups;
  }

  /**
   * Agrupa detalles por artículo
   * @private
   */
  _groupByArticle(details) {
    const groups = {};
    details.forEach((detail) => {
      const articleCode = detail.COD_ART || detail.CODIGO_ARTICULO;
      if (!groups[articleCode]) groups[articleCode] = [];
      groups[articleCode].push(detail);
    });
    return groups;
  }

  /**
   * Crea item de bonificación por familia
   * @private
   */
  _createFamilyBonusItem(baseItem, bonusQuantity, family) {
    return {
      ...baseItem,
      CANT: bonusQuantity,
      TIPO_ART: "B",
      NUM_LN: this._generateNewLineNumber(),
      NUM_LN_REF: baseItem.NUM_LN,
      DESCRIPCION: `Bonificación familia ${family}`,
      PRECIO: 0,
      TOTAL: 0,
      ES_PROMOCION: true,
      TIPO_PROMOCION: "FAMILY_BONUS",
    };
  }

  /**
   * Crea item de bonificación por volumen
   * @private
   */
  _createVolumeBonusItem(baseItem, bonusQuantity, description) {
    return {
      ...baseItem,
      CANT: bonusQuantity,
      TIPO_ART: "B",
      NUM_LN: this._generateNewLineNumber(),
      NUM_LN_REF: baseItem.NUM_LN,
      DESCRIPCION: description,
      PRECIO: 0,
      TOTAL: 0,
      ES_PROMOCION: true,
      TIPO_PROMOCION: "VOLUME_BONUS",
    };
  }

  /**
   * Aplica promoción VIP
   * @private
   */
  _applyVIPPromotion(details) {
    // Lógica específica para clientes VIP
    const vipItems = [];
    const highValueItems = details.filter((item) => (item.PRECIO || 0) > 1000);

    highValueItems.forEach((item) => {
      if (Math.random() > 0.7) {
        // 30% de probabilidad
        vipItems.push({
          ...item,
          CANT: 1,
          TIPO_ART: "B",
          NUM_LN: this._generateNewLineNumber(),
          DESCRIPCION: "Bonificación VIP",
          PRECIO: 0,
          TOTAL: 0,
          ES_PROMOCION: true,
          TIPO_PROMOCION: "SPECIAL_OFFER",
        });
      }
    });

    return vipItems;
  }

  /**
   * Aplica promociones estacionales
   * @private
   */
  _applySeasonalPromotions(details) {
    const seasonalItems = [];
    const currentMonth = new Date().getMonth() + 1;

    // Promociones navideñas (diciembre)
    if (currentMonth === 12) {
      const giftItems = details.filter(
        (item) =>
          (item.DESCRIPCION || "").toLowerCase().includes("regalo") ||
          (item.FAMILIA || "").toLowerCase().includes("juguete")
      );

      giftItems.forEach((item) => {
        seasonalItems.push({
          ...item,
          CANT: 1,
          TIPO_ART: "B",
          NUM_LN: this._generateNewLineNumber(),
          DESCRIPCION: "Promoción Navideña",
          PRECIO: 0,
          TOTAL: 0,
          ES_PROMOCION: true,
          TIPO_PROMOCION: "SPECIAL_OFFER",
        });
      });
    }

    return seasonalItems;
  }

  /**
   * Genera nuevo número de línea
   * @private
   */
  _generateNewLineNumber() {
    return Math.floor(Math.random() * 9000) + 1000;
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
