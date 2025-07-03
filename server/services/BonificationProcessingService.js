// services/BonificationProcessingService.js
const logger = require("./logger");

class BonificationProcessingService {
  constructor() {
    this.promotionRules = new Map();
    this.initializePromotionRules();
  }

  /**
   * Procesa las bonificaciones para un pedido específico
   * @param {Array} orderDetails - Detalles del pedido desde la BD origen
   * @param {Object} bonificationConfig - Configuración de bonificaciones del mapping
   * @param {string} orderId - ID del pedido
   * @returns {Array} - Detalles procesados con líneas numeradas y referencias
   */
  async processBonifications(orderDetails, bonificationConfig, orderId) {
    try {
      logger.info(
        `🎁 Iniciando procesamiento de bonificaciones para pedido: ${orderId}`
      );

      // Validar configuración
      this.validateBonificationConfig(bonificationConfig);

      const {
        bonificationIndicatorField,
        bonificationIndicatorValue,
        regularArticleField,
        bonificationReferenceField,
        lineNumberField,
        bonificationLineReferenceField,
        quantityField,
      } = bonificationConfig;

      // Separar artículos regulares y bonificaciones
      const { regularItems, bonificationItems } = this.categorizeItems(
        orderDetails,
        bonificationIndicatorField,
        bonificationIndicatorValue
      );

      logger.info(
        `📦 Items regulares: ${regularItems.length}, Bonificaciones: ${bonificationItems.length}`
      );

      // Crear mapa de artículos regulares
      const regularItemsMap = this.createRegularItemsMap(
        regularItems,
        regularArticleField
      );

      // Procesar artículos regulares
      const processedRegularItems = this.processRegularItems(
        regularItems,
        lineNumberField,
        bonificationLineReferenceField
      );

      // Procesar bonificaciones
      const processedBonifications = this.processBonificationItems(
        bonificationItems,
        regularItemsMap,
        bonificationConfig,
        processedRegularItems.length
      );

      // Combinar y ordenar todos los items
      const allProcessedItems = [
        ...processedRegularItems,
        ...processedBonifications,
      ];
      const sortedItems = this.sortItemsByLineNumber(
        allProcessedItems,
        lineNumberField
      );

      // Generar estadísticas
      const stats = this.generateProcessingStats(sortedItems);
      logger.info(`✅ Procesamiento completado: ${JSON.stringify(stats)}`);

      return sortedItems;
    } catch (error) {
      logger.error(`❌ Error procesando bonificaciones: ${error.message}`);
      throw new Error(
        `Error en procesamiento de bonificaciones: ${error.message}`
      );
    }
  }

  /**
   * Detecta y clasifica tipos de promociones
   * @param {Array} orderDetails - Detalles del pedido
   * @param {Object} bonificationConfig - Configuración
   * @param {Object} orderData - Datos principales del pedido
   * @returns {Object} - Clasificación de promociones
   */
  detectPromotionTypes(orderDetails, bonificationConfig, orderData = {}) {
    try {
      const promotions = {
        familyDiscounts: [],
        familyBonifications: [],
        productBonifications: [],
        scaledPromotions: [],
        oneTimeOffers: [],
        discountReflections: [],
        summary: {
          totalPromotions: 0,
          totalDiscountAmount: 0,
          totalBonifiedItems: 0,
        },
      };

      const {
        bonificationIndicatorField,
        bonificationIndicatorValue,
        quantityField,
      } = bonificationConfig;

      orderDetails.forEach((item) => {
        // Detectar bonificaciones por tipo
        if (item[bonificationIndicatorField] === bonificationIndicatorValue) {
          this.classifyBonification(item, promotions);
          promotions.summary.totalBonifiedItems += item[quantityField] || 0;
        }

        // Detectar descuentos por familia
        if (item.FAMILY_DISCOUNT_PCT && item.FAMILY_DISCOUNT_PCT > 0) {
          promotions.familyDiscounts.push({
            ...item,
            discountAmount: this.calculateFamilyDiscount(item),
          });
          promotions.summary.totalDiscountAmount +=
            this.calculateFamilyDiscount(item);
        }

        // Detectar ofertas de una sola vez
        if (item.ONE_TIME_OFFER_FLAG) {
          promotions.oneTimeOffers.push(item);
        }

        // Detectar descuentos reflejados en factura
        if (item.REFLECT_AS_DISCOUNT) {
          promotions.discountReflections.push(item);
        }
      });

      promotions.summary.totalPromotions =
        promotions.familyDiscounts.length +
        promotions.familyBonifications.length +
        promotions.productBonifications.length +
        promotions.scaledPromotions.length +
        promotions.oneTimeOffers.length;

      logger.info(
        `🏷️ Promociones detectadas: ${JSON.stringify(promotions.summary)}`
      );
      return promotions;
    } catch (error) {
      logger.error(`Error detectando tipos de promociones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplica reglas de promociones según contexto del cliente
   * @param {Array} orderDetails - Detalles del pedido
   * @param {Object} customerContext - Contexto del cliente
   * @param {Object} bonificationConfig - Configuración
   * @returns {Array} - Items con promociones aplicadas
   */
  async applyPromotionRules(orderDetails, customerContext, bonificationConfig) {
    try {
      logger.info(
        `🎯 Aplicando reglas de promociones para cliente tipo: ${customerContext.customerType}`
      );

      let processedItems = [...orderDetails];

      // Aplicar descuentos por familia por monto
      processedItems = await this.applyFamilyDiscountByAmount(
        processedItems,
        customerContext
      );

      // Aplicar bonificaciones por cantidad de familia
      processedItems = await this.applyFamilyQuantityBonifications(
        processedItems,
        customerContext
      );

      // Aplicar bonificaciones escaladas
      processedItems = await this.applyScaledBonifications(
        processedItems,
        customerContext
      );

      // Aplicar bonificaciones por producto específico
      processedItems = await this.applyProductBonifications(
        processedItems,
        customerContext
      );

      // Marcar ofertas de una sola vez
      processedItems = await this.markOneTimeOffers(
        processedItems,
        customerContext
      );

      return processedItems;
    } catch (error) {
      logger.error(`Error aplicando reglas de promociones: ${error.message}`);
      throw error;
    }
  }

  // =================== MÉTODOS PRIVADOS ===================

  /**
   * Valida la configuración de bonificaciones
   * @private
   */
  validateBonificationConfig(config) {
    const requiredFields = [
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "lineNumberField",
      "bonificationLineReferenceField",
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Campo requerido faltante en configuración: ${field}`);
      }
    }
  }

  /**
   * Categoriza items en regulares y bonificaciones
   * @private
   */
  categorizeItems(orderDetails, indicatorField, indicatorValue) {
    const regularItems = orderDetails.filter(
      (item) => item[indicatorField] !== indicatorValue
    );

    const bonificationItems = orderDetails.filter(
      (item) => item[indicatorField] === indicatorValue
    );

    return { regularItems, bonificationItems };
  }

  /**
   * Crea mapa de artículos regulares con números de línea
   * @private
   */
  createRegularItemsMap(regularItems, articleField) {
    const map = new Map();

    regularItems.forEach((item, index) => {
      const lineNumber = index + 1;
      const articleCode = item[articleField];

      // Si ya existe el artículo, mantener la primera línea
      if (!map.has(articleCode)) {
        map.set(articleCode, lineNumber);
      }
    });

    return map;
  }

  /**
   * Procesa artículos regulares asignando números de línea
   * @private
   */
  processRegularItems(
    regularItems,
    lineNumberField,
    bonificationReferenceField
  ) {
    return regularItems.map((item, index) => ({
      ...item,
      [lineNumberField]: index + 1,
      [bonificationReferenceField]: null,
      ITEM_TYPE: "REGULAR",
      PROCESSING_STATUS: "PROCESSED",
    }));
  }

  /**
   * Procesa items de bonificación
   * @private
   */
  processBonificationItems(
    bonificationItems,
    regularItemsMap,
    config,
    regularItemsCount
  ) {
    const {
      regularArticleField,
      bonificationReferenceField,
      lineNumberField,
      bonificationLineReferenceField,
    } = config;

    return bonificationItems.map((bonificationItem, index) => {
      const referencedArticle = bonificationItem[bonificationReferenceField];
      const referencedLineNumber = regularItemsMap.get(referencedArticle);
      const bonificationLineNumber = regularItemsCount + index + 1;

      if (referencedLineNumber) {
        logger.info(
          `🎁 Bonificación vinculada: Art: ${bonificationItem[regularArticleField]} -> Línea: ${bonificationLineNumber} ref a línea: ${referencedLineNumber}`
        );

        return {
          ...bonificationItem,
          [lineNumberField]: bonificationLineNumber,
          [bonificationLineReferenceField]: referencedLineNumber, // 🔑 ESTO ASIGNA PEDIDO_LINEA_BONIF
          [bonificationReferenceField]: null, // Limpiar COD_ART_RFR
          ITEM_TYPE: "BONIFICATION",
          PROCESSING_STATUS: "PROCESSED",
        };
      } else {
        logger.warn(
          `⚠️ Bonificación huérfana - No se encontró artículo regular para: ${referencedArticle}`
        );

        return {
          ...bonificationItem,
          [lineNumberField]: bonificationLineNumber,
          [bonificationLineReferenceField]: null, // 🔑 NULL cuando no hay referencia
          [bonificationReferenceField]: null,
          ITEM_TYPE: "BONIFICATION_ORPHAN",
          PROCESSING_STATUS: "WARNING",
        };
      }
    });
  }

  /**
   * Clasifica bonificación por tipo
   * @private
   */
  classifyBonification(item, promotions) {
    if (item.PROMOTION_TYPE) {
      switch (item.PROMOTION_TYPE) {
        case "FAMILY_BONUS":
          promotions.familyBonifications.push(item);
          break;
        case "PRODUCT_BONUS":
          promotions.productBonifications.push(item);
          break;
        case "SCALED_BONUS":
          promotions.scaledPromotions.push(item);
          break;
        default:
          promotions.familyBonifications.push(item); // Default
      }
    } else {
      // Clasificación automática basada en otros campos
      if (item.FAMILY_CODE && item.BONUS_BY_FAMILY) {
        promotions.familyBonifications.push(item);
      } else if (item.SCALED_PROMOTION) {
        promotions.scaledPromotions.push(item);
      } else {
        promotions.productBonifications.push(item);
      }
    }
  }

  /**
   * Calcula descuento por familia
   * @private
   */
  calculateFamilyDiscount(item) {
    const lineAmount = item.LINE_AMOUNT || 0;
    const discountPct = item.FAMILY_DISCOUNT_PCT || 0;
    return lineAmount * (discountPct / 100);
  }

  /**
   * Aplica descuentos por familia por monto facturado
   * @private
   */
  async applyFamilyDiscountByAmount(orderDetails, context) {
    const familyAmounts = {};

    // Calcular montos por familia
    orderDetails.forEach((item) => {
      const family = item.FAMILY_CODE;
      if (family) {
        if (!familyAmounts[family]) {
          familyAmounts[family] = 0;
        }
        familyAmounts[family] += item.LINE_AMOUNT || 0;
      }
    });

    // Aplicar reglas específicas según tipo de cliente
    const discountRules = this.getDiscountRules(
      context.customerType,
      context.priceList
    );

    Object.keys(familyAmounts).forEach((family) => {
      const amount = familyAmounts[family];
      const rule = discountRules.find(
        (r) => r.family === family && amount >= r.minAmount
      );

      if (rule) {
        orderDetails.forEach((item) => {
          if (item.FAMILY_CODE === family) {
            item.FAMILY_DISCOUNT_PCT = rule.discountPercent;
            item.FAMILY_DISCOUNT_AMOUNT =
              item.LINE_AMOUNT * (rule.discountPercent / 100);
            item.PROMOTION_TYPE = "FAMILY_DISCOUNT";
            item.PROMOTION_RULE_ID = rule.id;

            logger.info(
              `💰 Descuento aplicado: ${family} - ${rule.discountPercent}% en ${item.COD_ART}`
            );
          }
        });
      }
    });

    return orderDetails;
  }

  /**
   * Aplica bonificaciones por cantidad de familia
   * @private
   */
  async applyFamilyQuantityBonifications(orderDetails, context) {
    const familyQuantities = {};

    // Calcular cantidades por familia
    orderDetails.forEach((item) => {
      const family = item.FAMILY_CODE;
      if (family && item.ITEM_TYPE !== "BONIFICATION") {
        if (!familyQuantities[family]) {
          familyQuantities[family] = 0;
        }
        familyQuantities[family] += item.QUANTITY || 0;
      }
    });

    // Aplicar bonificaciones según reglas
    const bonificationRules = this.getBonificationRules(
      context.customerType,
      context.zone
    );

    Object.keys(familyQuantities).forEach((family) => {
      const quantity = familyQuantities[family];
      const rule = bonificationRules.find(
        (r) => r.family === family && quantity >= r.minQuantity
      );

      if (rule) {
        const bonificationsToAdd =
          Math.floor(quantity / rule.minQuantity) * rule.bonificationQuantity;

        if (bonificationsToAdd > 0) {
          // Encontrar el producto más vendido de la familia para bonificar
          const mostSoldProduct = this.findMostSoldProductInFamily(
            orderDetails,
            family
          );

          orderDetails.push({
            FAMILY_CODE: family,
            COD_ART: rule.bonificationProduct || mostSoldProduct,
            ART_BON: "B",
            COD_ART_RFR: mostSoldProduct,
            QUANTITY: bonificationsToAdd,
            UNIT_PRICE: 0,
            LINE_AMOUNT: 0,
            PROMOTION_TYPE: "FAMILY_QUANTITY_BONUS",
            PROMOTION_RULE_ID: rule.id,
            ITEM_TYPE: "BONIFICATION",
            PROCESSING_STATUS: "GENERATED",
          });

          logger.info(
            `🎁 Bonificación por familia generada: ${family} - ${bonificationsToAdd} unidades de ${
              rule.bonificationProduct || mostSoldProduct
            }`
          );
        }
      }
    });

    return orderDetails;
  }

  /**
   * Aplica bonificaciones escaladas
   * @private
   */
  async applyScaledBonifications(orderDetails, context) {
    const scaledRules = this.getScaledBonificationRules(context.customerType);

    scaledRules.forEach((rule) => {
      if (rule.type === "PRODUCT") {
        // Bonificación escalada por producto específico
        const productItems = orderDetails.filter(
          (item) =>
            item.COD_ART === rule.productCode &&
            item.ITEM_TYPE !== "BONIFICATION"
        );

        const totalQuantity = productItems.reduce(
          (sum, item) => sum + (item.QUANTITY || 0),
          0
        );

        // Encontrar el escalón apropiado
        const applicableScale = rule.scales
          .filter((scale) => totalQuantity >= scale.minQuantity)
          .sort((a, b) => b.minQuantity - a.minQuantity)[0];

        if (applicableScale) {
          orderDetails.push({
            COD_ART: applicableScale.bonificationProduct || rule.productCode,
            ART_BON: "B",
            COD_ART_RFR: rule.productCode,
            QUANTITY: applicableScale.bonificationQuantity,
            UNIT_PRICE: 0,
            LINE_AMOUNT: 0,
            PROMOTION_TYPE: "SCALED_PRODUCT_BONUS",
            PROMOTION_RULE_ID: rule.id,
            SCALE_LEVEL: applicableScale.level,
            ITEM_TYPE: "BONIFICATION",
            PROCESSING_STATUS: "GENERATED",
          });

          logger.info(
            `📈 Bonificación escalada aplicada: ${rule.productCode} - Nivel ${applicableScale.level} - ${applicableScale.bonificationQuantity} unidades`
          );
        }
      }
    });

    return orderDetails;
  }

  /**
   * Aplica bonificaciones por producto específico
   * @private
   */
  async applyProductBonifications(orderDetails, context) {
    const productRules = this.getProductBonificationRules(context.customerType);

    productRules.forEach((rule) => {
      const productItems = orderDetails.filter(
        (item) =>
          item.COD_ART === rule.productCode && item.ITEM_TYPE !== "BONIFICATION"
      );

      const totalQuantity = productItems.reduce(
        (sum, item) => sum + (item.QUANTITY || 0),
        0
      );

      if (totalQuantity >= rule.minQuantity) {
        const bonificationsToAdd =
          Math.floor(totalQuantity / rule.minQuantity) *
          rule.bonificationQuantity;

        if (bonificationsToAdd > 0) {
          orderDetails.push({
            COD_ART: rule.bonificationProduct || rule.productCode,
            ART_BON: "B",
            COD_ART_RFR: rule.productCode,
            QUANTITY: bonificationsToAdd,
            UNIT_PRICE: 0,
            LINE_AMOUNT: 0,
            PROMOTION_TYPE: "PRODUCT_SPECIFIC_BONUS",
            PROMOTION_RULE_ID: rule.id,
            ITEM_TYPE: "BONIFICATION",
            PROCESSING_STATUS: "GENERATED",
          });

          logger.info(
            `🎯 Bonificación por producto aplicada: ${rule.productCode} - ${bonificationsToAdd} unidades`
          );
        }
      }
    });

    return orderDetails;
  }

  /**
   * Marca ofertas de una sola vez
   * @private
   */
  async markOneTimeOffers(orderDetails, context) {
    // Marcar items que son ofertas de una sola vez
    orderDetails.forEach((item) => {
      if (item.ONE_TIME_OFFER_FLAG) {
        item.OFFER_USAGE_RESTRICTION = "ONE_TIME";
        item.CUSTOMER_OFFER_HISTORY_CHECK = true;
        logger.info(
          `🔒 Oferta una sola vez marcada: ${item.COD_ART} para cliente ${context.customerId}`
        );
      }
    });

    return orderDetails;
  }

  /**
   * Ordena items por número de línea
   * @private
   */
  sortItemsByLineNumber(items, lineNumberField) {
    return items.sort(
      (a, b) => (a[lineNumberField] || 0) - (b[lineNumberField] || 0)
    );
  }

  /**
   * Genera estadísticas del procesamiento
   * @private
   */
  generateProcessingStats(processedItems) {
    const stats = {
      totalItems: processedItems.length,
      regularItems: processedItems.filter((i) => i.ITEM_TYPE === "REGULAR")
        .length,
      bonifications: processedItems.filter(
        (i) => i.ITEM_TYPE === "BONIFICATION"
      ).length,
      orphanBonifications: processedItems.filter(
        (i) => i.ITEM_TYPE === "BONIFICATION_ORPHAN"
      ).length,
      generatedPromotions: processedItems.filter(
        (i) => i.PROCESSING_STATUS === "GENERATED"
      ).length,
    };

    return stats;
  }

  /**
   * Encuentra el producto más vendido en una familia
   * @private
   */
  findMostSoldProductInFamily(orderDetails, family) {
    const familyProducts = orderDetails.filter(
      (item) => item.FAMILY_CODE === family && item.ITEM_TYPE !== "BONIFICATION"
    );

    if (familyProducts.length === 0) return null;

    return familyProducts.reduce((max, item) =>
      (item.QUANTITY || 0) > (max.QUANTITY || 0) ? item : max
    ).COD_ART;
  }

  /**
   * Inicializa reglas de promociones
   * @private
   */
  initializePromotionRules() {
    // Estas reglas pueden venir de BD o configuración
    this.promotionRules.set("discountRules", [
      {
        id: "DESCH_FAMILY_DISCOUNT",
        family: "DESECHABLES",
        minAmount: 8000,
        discountPercent: 2,
        customerTypes: ["MAYORISTA", "COLMADO"],
      },
    ]);

    this.promotionRules.set("bonificationRules", [
      {
        id: "BEBIDAS_FAMILY_BONUS",
        family: "BEBIDAS",
        minQuantity: 10,
        bonificationQuantity: 1,
        bonificationProduct: "BEBIDA_PROMO",
      },
    ]);
  }

  /**
   * Obtiene reglas de descuento según contexto
   * @private
   */
  getDiscountRules(customerType, priceList) {
    const allRules = this.promotionRules.get("discountRules") || [];
    return allRules.filter(
      (rule) => !rule.customerTypes || rule.customerTypes.includes(customerType)
    );
  }

  /**
   * Obtiene reglas de bonificación según contexto
   * @private
   */
  getBonificationRules(customerType, zone) {
    const allRules = this.promotionRules.get("bonificationRules") || [];
    return allRules.filter(
      (rule) => !rule.customerTypes || rule.customerTypes.includes(customerType)
    );
  }

  /**
   * Obtiene reglas de bonificación escalada
   * @private
   */
  getScaledBonificationRules(customerType) {
    return [
      {
        id: "PRODUCTO_ESCALADO_1",
        type: "PRODUCT",
        productCode: "PROD_001",
        scales: [
          { level: 1, minQuantity: 20, bonificationQuantity: 1 },
          { level: 2, minQuantity: 50, bonificationQuantity: 3 },
        ],
      },
    ];
  }

  /**
   * Obtiene reglas de bonificación por producto
   * @private
   */
  getProductBonificationRules(customerType) {
    return [
      {
        id: "PRODUCTO_ESPECIFICO_1",
        productCode: "ARTICULO_001",
        minQuantity: 5,
        bonificationQuantity: 1,
        bonificationProduct: "ARTICULO_001", // Mismo producto
      },
    ];
  }
}

module.exports = new BonificationProcessingService();
