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

    // Verificar qué campos están disponibles en los datos
    const firstRow = detailData[0] || {};
    const availableFields = Object.keys(firstRow);

    logger.debug(
      `🔧 Campos disponibles en datos: ${availableFields.join(", ")}`
    );
    logger.debug(
      `🔧 Tiene ${fieldConfig.bonusField}: ${availableFields.includes(
        fieldConfig.bonusField
      )} valor: ${firstRow[fieldConfig.bonusField]}`
    );
    logger.debug(
      `🔧 Tiene ${fieldConfig.referenceField}: ${availableFields.includes(
        fieldConfig.referenceField
      )} valor: ${firstRow[fieldConfig.referenceField]}`
    );
    logger.debug(
      `🔧 Tiene ${fieldConfig.discountField}: ${availableFields.includes(
        fieldConfig.discountField
      )} valor: ${firstRow[fieldConfig.discountField]}`
    );

    detailData.forEach((line, index) => {
      const isPromotion = this.isPromotionLine(
        line,
        detailData,
        fieldConfig,
        availableFields
      );

      if (isPromotion.hasPromotion) {
        promotionLines.push({
          ...line,
          promotionType: isPromotion.type,
          originalIndex: index,
          _fieldConfig: fieldConfig,
          _availableFields: availableFields,
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
   * @param {Array} availableFields - Campos disponibles en los datos
   * @returns {Object} - Información sobre la promoción
   */
  static isPromotionLine(line, allLines, fieldConfig, availableFields = null) {
    const result = {
      hasPromotion: false,
      type: null,
      isRegularLine: false,
      isBonusLine: false,
    };

    // Si no se pasaron campos disponibles, obtenerlos
    if (!availableFields) {
      availableFields = Object.keys(line);
    }

    // Verificar si es bonificación (solo si el campo existe)
    if (availableFields.includes(fieldConfig.bonusField)) {
      const bonusValue = line[fieldConfig.bonusField];
      if (bonusValue === "B" || bonusValue === "b") {
        result.hasPromotion = true;
        result.type = "BONUS";
        result.isBonusLine = true;
      }
    }

    // Verificar si tiene descuento (solo si el campo existe)
    if (availableFields.includes(fieldConfig.discountField)) {
      const discountValue = line[fieldConfig.discountField];
      if (discountValue && parseFloat(discountValue) > 0) {
        result.hasPromotion = true;
        result.type = result.type ? "BONUS_WITH_DISCOUNT" : "DISCOUNT";
      }
    }

    // Verificar si es línea regular que dispara promoción (solo si el campo de referencia existe)
    const articleCode = line[fieldConfig.articleField];
    if (articleCode && availableFields.includes(fieldConfig.referenceField)) {
      if (this.hasReferenceInOtherLines(line, allLines, fieldConfig)) {
        result.hasPromotion = true;
        result.isRegularLine = true;
        result.type = result.type ? `${result.type}_TRIGGER` : "TRIGGER";
      }
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

    // Solo buscar referencias si el campo existe
    if (!fieldConfig.referenceField) {
      return false;
    }

    return allLines.some((line) => {
      // Verificar que la línea tenga el campo de referencia
      if (!line.hasOwnProperty(fieldConfig.referenceField)) {
        return false;
      }

      const referenceArticle = line[fieldConfig.referenceField];
      const lineNumber = line[fieldConfig.lineNumberField];

      return (
        referenceArticle === currentArticle &&
        lineNumber !== currentLineNumber &&
        referenceArticle // Asegurar que no sea null/undefined
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
    const currentLineNumber = bonusLine[fieldConfig.lineNumberField];

    // Solo buscar referencia si el campo existe
    let referenceArticle = null;
    let regularLineNumber = null;

    if (
      fieldConfig.referenceField &&
      bonusLine.hasOwnProperty(fieldConfig.referenceField)
    ) {
      referenceArticle = bonusLine[fieldConfig.referenceField];

      logger.debug(
        `🎁 Transformando línea de bonificación ${currentLineNumber}, referencia: ${referenceArticle}`
      );

      // Buscar línea regular usando el mapa
      if (referenceArticle && lineMap[referenceArticle]) {
        const regularLines = lineMap[referenceArticle].filter(
          (line) =>
            line[fieldConfig.lineNumberField] !== currentLineNumber &&
            (!fieldConfig.bonusField ||
              (line[fieldConfig.bonusField] !== "B" &&
                line[fieldConfig.bonusField] !== "b"))
        );

        if (regularLines.length > 0) {
          regularLineNumber = regularLines[0][fieldConfig.lineNumberField];
          logger.debug(
            `🎁 Línea regular encontrada: ${regularLineNumber} para artículo ${referenceArticle}`
          );
        } else {
          logger.warn(
            `🎁 No se encontró línea regular para bonificación ${currentLineNumber} con referencia ${referenceArticle}`
          );
        }
      }
    } else {
      logger.debug(
        `🎁 Transformando línea de bonificación ${currentLineNumber} sin campo de referencia disponible`
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

    console.log("🔧 DEBUG TRANSFORM BONUS:");
    console.log("🔧 fieldConfig.bonusLineRef:", fieldConfig.bonusLineRef);
    console.log("🔧 regularLineNumber:", regularLineNumber);
    console.log(
      "🔧 Campo creado:",
      fieldConfig.bonusLineRef,
      "=",
      transformed[fieldConfig.bonusLineRef]
    );
    console.log("🔧 Objeto completo transformado:", Object.keys(transformed));

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(
      `🎁 ✅ Línea bonificación ${currentLineNumber} -> referencia ${
        regularLineNumber || "N/A"
      }`
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
   * Determina si se deben usar promociones para este mapping
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si se deben usar promociones
   */
  static shouldUsePromotions(mapping) {
    console.log("🔍 DEBUG shouldUsePromotions - INICIANDO");
    console.log("🔍 mapping.name:", mapping.name);
    console.log("🔍 mapping.promotionConfig:", mapping.promotionConfig);

    if (!mapping.promotionConfig?.enabled) {
      console.log("🔍 DEBUG: Promociones deshabilitadas");
      return false;
    }

    const validation = this.validatePromotionConfig(mapping);

    if (!validation.canContinue) {
      console.log("🔍 DEBUG: ❌ Validación falló:", validation.reason);
      return false;
    }

    const detailTables = mapping.tableConfigs.filter((t) => t.isDetailTable);
    console.log(
      "🔍 DEBUG: Tablas de detalle encontradas:",
      detailTables.length
    );

    if (detailTables.length === 0) {
      console.log("🔍 DEBUG: ❌ No hay tablas de detalle");
      return false;
    }

    console.log("🔍 DEBUG: ✅ Promociones activadas");
    return true;
  }

  /**
   * Valida la configuración de promociones
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Resultado de validación con detalles
   */
  static validatePromotionConfig(mapping) {
    try {
      if (
        !mapping ||
        !mapping.promotionConfig ||
        !mapping.promotionConfig.enabled
      ) {
        return {
          valid: false,
          canContinue: false,
          reason: "Promociones deshabilitadas",
        };
      }

      const fieldConfig = this.getFieldConfiguration(mapping);

      // Separar campos críticos de opcionales
      const criticalFields = [
        fieldConfig.lineNumberField,
        fieldConfig.articleField,
        fieldConfig.quantityField,
      ];

      const optionalFields = [
        fieldConfig.bonusField,
        fieldConfig.referenceField,
        fieldConfig.discountField,
      ];

      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );
      let hasValidTable = false;

      for (const detailTable of detailTables) {
        if (!detailTable.fieldMappings) {
          logger.warn(`Tabla ${detailTable.name} no tiene mapeo de campos`);
          continue;
        }

        const mappedFields = detailTable.fieldMappings.map(
          (fm) => fm.sourceField
        );

        // Validar campos críticos
        const missingCritical = criticalFields.filter(
          (field) => !mappedFields.includes(field)
        );

        if (missingCritical.length === 0) {
          hasValidTable = true;

          // Solo advertir sobre campos opcionales
          const missingOptional = optionalFields.filter(
            (field) => !mappedFields.includes(field)
          );
          missingOptional.forEach((field) => {
            logger.warn(
              `Campo requerido para promociones no encontrado: ${field} en tabla ${detailTable.name}`
            );
          });

          logger.info(
            `✅ Tabla ${detailTable.name} puede usar promociones (${
              missingOptional.length === 0 ? "completa" : "básica"
            })`
          );
        } else {
          logger.warn(
            `❌ Tabla ${
              detailTable.name
            } no puede usar promociones - faltan campos críticos: ${missingCritical.join(
              ", "
            )}`
          );
        }
      }

      if (!hasValidTable) {
        return {
          valid: false,
          canContinue: false,
          reason: "No hay tablas válidas para promociones",
        };
      }

      logger.info("✅ Configuración de promociones validada exitosamente");
      return { valid: true, canContinue: true, hasOptionalFields: true };
    } catch (error) {
      logger.error(
        `Error al validar configuración de promociones: ${error.message}`
      );
      return { valid: false, canContinue: false, reason: error.message };
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
