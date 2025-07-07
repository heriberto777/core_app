const logger = require("./logger");

/**
 * Procesador de promociones y bonificaciones
 * Maneja la lógica de detección y transformación de promociones
 */
class PromotionProcessor {
  /**
   * Procesa promociones en los datos de detalle
   * @param {Array} detailData - Datos de detalle del documento
   * @param {Object} mapping - Configuración de mapping
   * @returns {Array} - Datos transformados con promociones procesadas
   */
  static processPromotions(detailData, mapping) {
    try {
      if (
        !detailData ||
        !Array.isArray(detailData) ||
        detailData.length === 0
      ) {
        logger.debug("No hay datos de detalle para procesar promociones");
        return detailData;
      }

      logger.info(`🎁 Procesando promociones para ${detailData.length} líneas`);

      // Obtener configuración de campos desde el mapping
      const fieldConfig = this.getFieldConfiguration(mapping);
      logger.debug(`Configuración de campos: ${JSON.stringify(fieldConfig)}`);

      // Crear mapa de líneas para referencias rápidas
      const lineMap = this.createLineMap(detailData, fieldConfig);
      logger.debug(
        `Mapa de líneas creado: ${Object.keys(lineMap).length} artículos`
      );

      // Detectar líneas con promociones
      const promotionLines = this.detectPromotionLines(detailData, fieldConfig);

      if (promotionLines.length === 0) {
        logger.debug("No se detectaron promociones en el documento");
        return detailData;
      }

      logger.info(
        `🎁 Detectadas ${promotionLines.length} líneas con promociones`
      );

      // Transformar datos según promociones
      const transformedData = this.transformPromotionData(
        detailData,
        promotionLines,
        fieldConfig,
        lineMap
      );

      logger.info(`🎁 Transformación de promociones completada`);
      return transformedData;
    } catch (error) {
      logger.error(`Error al procesar promociones: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Obtiene configuración de campos desde el mapping
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Configuración de campos
   */
  static getFieldConfiguration(mapping) {
    const defaultConfig = {
      bonusField: "ART_BON",
      referenceField: "COD_ART_RFR",
      discountField: "MON_DSC",
      lineNumberField: "NUM_LN",
      articleField: "COD_ART",
      quantityField: "CND_MAX",
      bonusLineRef: "PEDIDO_LINEA_BONIF",
      orderedQuantity: "CANTIDAD_PEDIDA",
      invoiceQuantity: "CANTIDAD_A_FACTURAR",
      bonusQuantity: "CANTIDAD_BONIFICAD",
    };

    // Combinar con configuración del mapping si existe
    if (mapping.promotionConfig) {
      return {
        ...defaultConfig,
        ...mapping.promotionConfig.detectFields,
        ...mapping.promotionConfig.targetFields,
      };
    }

    return defaultConfig;
  }

  /**
   * Crea un mapa de líneas para referencias rápidas
   * @param {Array} detailData - Datos de detalle
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Mapa de artículos a líneas
   */
  static createLineMap(detailData, fieldConfig) {
    const lineMap = {};

    detailData.forEach((line, index) => {
      const articleCode = line[fieldConfig.articleField];
      const lineNumber = line[fieldConfig.lineNumberField];

      if (articleCode && lineNumber) {
        if (!lineMap[articleCode]) {
          lineMap[articleCode] = [];
        }
        lineMap[articleCode].push({
          ...line,
          _originalIndex: index,
        });
      }
    });

    return lineMap;
  }

  /**
   * Detecta líneas que contienen promociones
   * @param {Array} detailData - Datos de detalle
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Array} - Líneas con promociones detectadas
   */
  static detectPromotionLines(detailData, fieldConfig) {
    const promotionLines = [];

    detailData.forEach((line, index) => {
      const isPromotion = this.isPromotionLine(line, detailData, fieldConfig);

      if (isPromotion.hasPromotion) {
        promotionLines.push({
          ...line,
          promotionType: isPromotion.type,
          originalIndex: index,
          _fieldConfig: fieldConfig,
        });
      }
    });

    return promotionLines;
  }

  /**
   * Determina si una línea es una promoción
   * @param {Object} line - Línea de detalle
   * @param {Array} allLines - Todas las líneas para verificar referencias
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Información sobre la promoción
   */
  static isPromotionLine(line, allLines, fieldConfig) {
    const result = {
      hasPromotion: false,
      type: null,
      isRegularLine: false,
      isBonusLine: false,
    };

    // Verificar si es bonificación
    const bonusValue = line[fieldConfig.bonusField];
    if (bonusValue === "B" || bonusValue === "b") {
      result.hasPromotion = true;
      result.type = "BONUS";
      result.isBonusLine = true;
    }

    // Verificar si tiene descuento
    const discountValue = line[fieldConfig.discountField];
    if (discountValue && parseFloat(discountValue) > 0) {
      result.hasPromotion = true;
      result.type = result.type ? "BONUS_WITH_DISCOUNT" : "DISCOUNT";
    }

    // Verificar si es línea regular que dispara promoción
    const articleCode = line[fieldConfig.articleField];
    if (
      articleCode &&
      this.hasReferenceInOtherLines(line, allLines, fieldConfig)
    ) {
      result.hasPromotion = true;
      result.isRegularLine = true;
      result.type = result.type ? `${result.type}_TRIGGER` : "TRIGGER";
    }

    return result;
  }

  /**
   * Verifica si un artículo es referenciado por otras líneas
   * @param {Object} currentLine - Línea actual
   * @param {Array} allLines - Todas las líneas
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {boolean}
   */
  static hasReferenceInOtherLines(currentLine, allLines, fieldConfig) {
    const currentArticle = currentLine[fieldConfig.articleField];
    const currentLineNumber = currentLine[fieldConfig.lineNumberField];

    return allLines.some((line) => {
      const referenceArticle = line[fieldConfig.referenceField];
      const lineNumber = line[fieldConfig.lineNumberField];

      return (
        referenceArticle === currentArticle && lineNumber !== currentLineNumber
      );
    });
  }

  /**
   * Transforma los datos aplicando la lógica de promociones
   * @param {Array} originalData - Datos originales
   * @param {Array} promotionLines - Líneas con promociones
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas por artículo
   * @returns {Array} - Datos transformados
   */
  static transformPromotionData(
    originalData,
    promotionLines,
    fieldConfig,
    lineMap
  ) {
    const transformedData = [];
    const processedLines = new Set();

    originalData.forEach((line, index) => {
      if (processedLines.has(index)) {
        return;
      }

      const promotionInfo = this.isPromotionLine(
        line,
        originalData,
        fieldConfig
      );

      if (promotionInfo.isBonusLine) {
        // Línea de bonificación
        const transformedLine = this.transformBonusLine(
          line,
          fieldConfig,
          lineMap
        );
        transformedData.push(transformedLine);
      } else if (promotionInfo.isRegularLine) {
        // Línea regular que dispara promoción
        const transformedLine = this.transformRegularLine(line, fieldConfig);
        transformedData.push(transformedLine);
      } else {
        // Línea normal sin promoción
        transformedData.push(this.transformNormalLine(line, fieldConfig));
      }

      processedLines.add(index);
    });

    return transformedData;
  }

  /**
   * Transforma una línea de bonificación
   * @param {Object} bonusLine - Línea de bonificación
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas por artículo
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, lineMap) {
    const referenceArticle = bonusLine[fieldConfig.referenceField];
    const currentLineNumber = bonusLine[fieldConfig.lineNumberField];

    logger.debug(
      `🎁 Transformando línea de bonificación ${currentLineNumber}, referencia: ${referenceArticle}`
    );

    // Buscar línea regular usando el mapa
    let regularLineNumber = null;
    if (referenceArticle && lineMap[referenceArticle]) {
      const regularLines = lineMap[referenceArticle].filter(
        (line) =>
          line[fieldConfig.lineNumberField] !== currentLineNumber &&
          line[fieldConfig.bonusField] !== "B" &&
          line[fieldConfig.bonusField] !== "b"
      );

      if (regularLines.length > 0) {
        // Tomar la primera línea regular encontrada
        regularLineNumber = regularLines[0][fieldConfig.lineNumberField];
        logger.debug(
          `🎁 Línea regular encontrada: ${regularLineNumber} para artículo ${referenceArticle}`
        );
      } else {
        logger.warn(
          `🎁 No se encontró línea regular para bonificación ${currentLineNumber} con referencia ${referenceArticle}`
        );
      }
    } else {
      logger.warn(
        `🎁 Línea de bonificación ${currentLineNumber} no tiene referencia válida`
      );
    }

    const transformed = {
      ...bonusLine,
      // ✅ ASIGNAR CORRECTAMENTE LA REFERENCIA
      [fieldConfig.bonusLineRef]: regularLineNumber,
      [fieldConfig.bonusQuantity]:
        bonusLine[fieldConfig.quantityField] || bonusLine.QTY,
      [fieldConfig.orderedQuantity]: null,
      [fieldConfig.invoiceQuantity]: null,

      // Campos de metadatos
      _IS_BONUS_LINE: true,
      _PROMOTION_TYPE: "BONUS",
      _REFERENCE_LINE: regularLineNumber,
      _REFERENCE_ARTICLE: referenceArticle,
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(
      `🎁 ✅ Línea bonificación ${currentLineNumber} -> referencia ${regularLineNumber}`
    );

    return transformed;
  }

  /**
   * Transforma una línea regular que dispara promoción
   * @param {Object} regularLine - Línea regular
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformRegularLine(regularLine, fieldConfig) {
    const lineNumber = regularLine[fieldConfig.lineNumberField];

    const transformed = {
      ...regularLine,
      [fieldConfig.bonusLineRef]: null,
      [fieldConfig.orderedQuantity]:
        regularLine[fieldConfig.quantityField] || regularLine.QTY,
      [fieldConfig.invoiceQuantity]:
        regularLine[fieldConfig.quantityField] || regularLine.QTY,
      [fieldConfig.bonusQuantity]: null,

      // Campos de metadatos
      _IS_TRIGGER_LINE: true,
      _PROMOTION_TYPE: "TRIGGER",
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.debug(
      `🎁 Línea regular transformada: ${lineNumber} (dispara promoción)`
    );
    return transformed;
  }

  /**
   * Transforma una línea normal sin promoción
   * @param {Object} normalLine - Línea normal
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformNormalLine(normalLine, fieldConfig) {
    const transformed = {
      ...normalLine,
      [fieldConfig.bonusLineRef]: null,
      [fieldConfig.orderedQuantity]:
        normalLine[fieldConfig.quantityField] || normalLine.QTY,
      [fieldConfig.invoiceQuantity]:
        normalLine[fieldConfig.quantityField] || normalLine.QTY,
      [fieldConfig.bonusQuantity]: null,

      // Campos de metadatos
      _IS_NORMAL_LINE: true,
      _PROMOTION_TYPE: "NONE",
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    return transformed;
  }

  /**
   * Valida la configuración de promociones
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si la configuración es válida
   */
  static validatePromotionConfig(mapping) {
    try {
      if (
        !mapping ||
        !mapping.promotionConfig ||
        !mapping.promotionConfig.enabled
      ) {
        return false;
      }

      const fieldConfig = this.getFieldConfiguration(mapping);
      const requiredFields = [
        fieldConfig.bonusField,
        fieldConfig.referenceField,
        fieldConfig.lineNumberField,
        fieldConfig.articleField,
      ];

      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      for (const detailTable of detailTables) {
        if (!detailTable.fieldMappings) {
          logger.warn(`Tabla ${detailTable.name} no tiene mapeo de campos`);
          continue;
        }

        const mappedFields = detailTable.fieldMappings.map(
          (fm) => fm.sourceField
        );

        for (const requiredField of requiredFields) {
          if (!mappedFields.includes(requiredField)) {
            logger.warn(
              `Campo requerido para promociones no encontrado: ${requiredField} en tabla ${detailTable.name}`
            );
          }
        }
      }

      logger.info("✅ Configuración de promociones validada exitosamente");
      return true;
    } catch (error) {
      logger.error(
        `Error al validar configuración de promociones: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Aplica reglas de promoción específicas
   * @param {Array} detailData - Datos de detalle
   * @param {Object} promotionRules - Reglas de promoción
   * @returns {Array} - Datos con reglas aplicadas
   */
  static applyPromotionRules(detailData, promotionRules) {
    try {
      if (!promotionRules || !promotionRules.enabled || !detailData) {
        return detailData || [];
      }

      logger.info(
        `Aplicando reglas de promoción: ${
          promotionRules.rules?.length || 0
        } reglas`
      );

      let processedData = [...detailData];

      // Aplicar cada regla definida
      for (const rule of promotionRules.rules || []) {
        processedData = this.applySpecificRule(processedData, rule);
      }

      return processedData;
    } catch (error) {
      logger.error(`Error aplicando reglas de promoción: ${error.message}`);
      return detailData || [];
    }
  }

  /**
   * Aplica una regla específica de promoción
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla específica
   * @returns {Array} - Datos con regla aplicada
   */
  static applySpecificRule(data, rule) {
    try {
      switch (rule.type) {
        case "FAMILY_DISCOUNT":
          return this.applyFamilyDiscountRule(data, rule);
        case "QUANTITY_BONUS":
          return this.applyQuantityBonusRule(data, rule);
        default:
          logger.warn(`Tipo de regla no reconocido: ${rule.type}`);
          return data;
      }
    } catch (error) {
      logger.error(`Error aplicando regla específica: ${error.message}`);
      return data;
    }
  }

  /**
   * Aplica regla de descuento por familia
   * @private
   */
  static applyFamilyDiscountRule(data, rule) {
    logger.debug("Aplicando regla de descuento por familia");
    return data;
  }

  /**
   * Aplica regla de bonificación por cantidad
   * @private
   */
  static applyQuantityBonusRule(data, rule) {
    logger.debug("Aplicando regla de bonificación por cantidad");
    return data;
  }
}

module.exports = PromotionProcessor;
