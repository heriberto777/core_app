const logger = require("./logger");

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

      logger.info(`🎁 ===== INICIANDO PROCESAMIENTO DE PROMOCIONES =====`);
      logger.info(`🎁 Datos de entrada: ${detailData.length} líneas`);

      // Obtener configuración de campos
      const fieldConfig = this.getFieldConfiguration(mapping);
      logger.info(`🎁 Configuración de campos:`);
      logger.info(
        `🎁   Campo bonificación: ${fieldConfig.bonusField} (buscando "B")`
      );
      logger.info(
        `🎁   Campo referencia: ${fieldConfig.referenceField} (código artículo que dispara)`
      );
      logger.info(`🎁   Campo artículo: ${fieldConfig.articleField}`);
      logger.info(`🎁   Campo línea: ${fieldConfig.lineNumberField}`);

      // 📊 ANÁLISIS INICIAL: Mostrar todas las líneas
      logger.info(`🎁 ANÁLISIS DE LÍNEAS DE ENTRADA:`);
      detailData.forEach((line, index) => {
        const lineNum = line[fieldConfig.lineNumberField];
        const article = line[fieldConfig.articleField];
        const artBon = line[fieldConfig.bonusField];
        const artRef = line[fieldConfig.referenceField];

        logger.info(
          `🎁   Línea ${lineNum}: ${article}, ART_BON="${artBon}", COD_ART_RFR="${artRef}"`
        );
      });

      // Crear mapa de líneas para referencias rápidas
      const lineMap = this.createLineMap(detailData, fieldConfig);

      // Detectar líneas con promociones
      const promotionLines = this.detectPromotionLines(detailData, fieldConfig);

      if (promotionLines.length === 0) {
        logger.info(`🎁 No se detectaron promociones en el documento`);
        return detailData;
      }

      logger.info(
        `🎁 ===== PROMOCIONES DETECTADAS: ${promotionLines.length} =====`
      );

      // Transformar datos según promociones
      const transformedData = this.transformPromotionData(
        detailData,
        promotionLines,
        fieldConfig,
        lineMap
      );

      logger.info(`🎁 ===== PROMOCIONES PROCESADAS EXITOSAMENTE =====`);
      return transformedData;
    } catch (error) {
      logger.error(`❌ Error al procesar promociones: ${error.message}`);
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
      bonusField: "ART_BON", // ✅ Campo que indica bonificación (valor "B")
      referenceField: "COD_ART_RFR", // ✅ Campo con código del artículo que dispara
      discountField: "MON_DSC", // Campo de descuento
      lineNumberField: "NUM_LN", // Número de línea
      articleField: "COD_ART", // Código de artículo
      quantityField: "CND_MAX", // Campo cantidad (puede ser QTY también)
      bonusLineRef: "PEDIDO_LINEA_BONIF", // Campo destino: referencia a línea regular
      orderedQuantity: "CANTIDAD_PEDIDA", // Campo destino: cantidad pedida
      invoiceQuantity: "CANTIDAD_A_FACTURAR", // Campo destino: cantidad a facturar
      bonusQuantity: "CANTIDAD_BONIFICAD", // Campo destino: cantidad bonificada
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
      if (articleCode) {
        lineMap[articleCode] = line;
      }
    });

    return lineMap;
  }

  /**
   * Detecta líneas con promociones
   * @param {Array} detailData - Datos de detalle
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Array} - Líneas con promociones
   */
  static detectPromotionLines(detailData, fieldConfig) {
    const promotionLines = [];

    detailData.forEach((line, index) => {
      const promotionInfo = this.isPromotionLine(line, detailData, fieldConfig);

      if (promotionInfo.hasPromotion) {
        promotionLines.push({
          line,
          index,
          info: promotionInfo,
        });
      }
    });

    return promotionLines;
  }

  /**
   * Determina si una línea es de promoción
   * @param {Object} line - Línea a evaluar
   * @param {Array} allLines - Todas las líneas del documento
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Información sobre la promoción
   */
  static isPromotionLine(line, allLines, fieldConfig) {
    const result = {
      hasPromotion: false,
      isBonusLine: false,
      isRegularLine: false,
      type: null,
    };

    // Obtener campos disponibles en la línea
    const availableFields = Object.keys(line);
    const lineNumber = line[fieldConfig.lineNumberField];
    const articleCode = line[fieldConfig.articleField];

    logger.debug(`🎁 Analizando línea ${lineNumber}, artículo ${articleCode}`);

    // 🔍 VERIFICAR SI ES LÍNEA DE BONIFICACIÓN (ART_BON = "B")
    if (availableFields.includes(fieldConfig.bonusField)) {
      const bonusValue = line[fieldConfig.bonusField];
      logger.debug(
        `🎁   Campo bonificación (${fieldConfig.bonusField}): "${bonusValue}"`
      );

      // ✅ CORRECCIÓN: Buscar específicamente "B" para bonificaciones
      if (bonusValue === "B") {
        result.hasPromotion = true;
        result.isBonusLine = true;

        // Verificar si también tiene descuento
        if (
          availableFields.includes(fieldConfig.discountField) &&
          line[fieldConfig.discountField] > 0
        ) {
          result.type = "BONUS_WITH_DISCOUNT";
        } else {
          result.type = "BONUS";
        }

        const referenceArticle = line[fieldConfig.referenceField]; // COD_ART_RFR
        logger.info(`🎁 ✅ LÍNEA BONIFICACIÓN detectada:`);
        logger.info(`🎁   Línea bonificación: ${lineNumber}`);
        logger.info(`🎁   Artículo bonificado: ${articleCode}`);
        logger.info(
          `🎁   Artículo que dispara (COD_ART_RFR): ${referenceArticle}`
        );
        logger.info(`🎁   ART_BON: "${bonusValue}"`);
      } else {
        logger.debug(
          `🎁   ART_BON = "${bonusValue}" (no es "B", línea normal)`
        );
      }
    }

    // 🔍 VERIFICAR SI ES LÍNEA REGULAR QUE DISPARA PROMOCIÓN
    if (articleCode && availableFields.includes(fieldConfig.referenceField)) {
      const hasReference = this.hasReferenceInOtherLines(
        line,
        allLines,
        fieldConfig
      );
      if (hasReference) {
        result.hasPromotion = true;
        result.isRegularLine = true;
        result.type = result.type ? `${result.type}_TRIGGER` : "TRIGGER";

        logger.info(`🎁 ✅ LÍNEA TRIGGER detectada:`);
        logger.info(`🎁   Línea regular: ${lineNumber}`);
        logger.info(`🎁   Artículo que dispara: ${articleCode}`);
        logger.info(`🎁   Es referenciado por líneas bonificadas`);
      }
    }

    if (!result.hasPromotion) {
      logger.debug(
        `📋 Línea normal: línea ${lineNumber}, artículo ${articleCode}`
      );
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
    const currentArticle = currentLine[fieldConfig.articleField]; // COD_ART de la línea actual
    const currentLineNumber = currentLine[fieldConfig.lineNumberField];

    // Solo buscar referencias si el campo existe
    if (!fieldConfig.referenceField) {
      return false;
    }

    let foundReferences = 0;
    const referencingLines = [];

    allLines.forEach((line) => {
      // Verificar que la línea tenga el campo de referencia y sea bonificación
      if (
        !line.hasOwnProperty(fieldConfig.referenceField) ||
        !line.hasOwnProperty(fieldConfig.bonusField)
      ) {
        return;
      }

      const isBonus = line[fieldConfig.bonusField] === "B";
      const referenceArticle = line[fieldConfig.referenceField]; // COD_ART_RFR
      const lineNumber = line[fieldConfig.lineNumberField];

      // ✅ Una línea bonificada (ART_BON="B") que referencia (COD_ART_RFR) al artículo actual
      if (
        isBonus &&
        referenceArticle === currentArticle &&
        lineNumber !== currentLineNumber &&
        referenceArticle
      ) {
        foundReferences++;
        referencingLines.push(lineNumber);
      }
    });

    if (foundReferences > 0) {
      logger.debug(
        `🎁 Artículo ${currentArticle} (línea ${currentLineNumber}) es referenciado por ${foundReferences} líneas bonificadas: ${referencingLines.join(
          ", "
        )}`
      );
      return true;
    }

    return false;
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
        const transformedLine = this.transformTriggerLine(line, fieldConfig);
        transformedData.push(transformedLine);
      } else {
        // Línea normal sin promoción
        const transformedLine = this.transformNormalLine(line, fieldConfig);
        transformedData.push(transformedLine);
      }

      processedLines.add(index);
    });

    return transformedData;
  }

  /**
   * Transforma una línea de bonificación
   * @param {Object} bonusLine - Línea de bonificación
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, lineMap) {
    // 🔍 COD_ART_RFR contiene el código del artículo regular que dispara la bonificación
    const referenceArticle = bonusLine[fieldConfig.referenceField]; // COD_ART_RFR
    let referenceLineNumber = null;

    const bonusLineNumber = bonusLine[fieldConfig.lineNumberField];
    const bonusArticleCode = bonusLine[fieldConfig.articleField];

    logger.debug(`🎁 Procesando línea bonificación:`);
    logger.debug(`🎁   Línea: ${bonusLineNumber}`);
    logger.debug(`🎁   Artículo bonificado: ${bonusArticleCode}`);
    logger.debug(
      `🎁   COD_ART_RFR (artículo que dispara): ${referenceArticle}`
    );

    // ✅ Buscar la línea del artículo regular que dispara esta bonificación
    if (referenceArticle && lineMap[referenceArticle]) {
      referenceLineNumber =
        lineMap[referenceArticle][fieldConfig.lineNumberField];
      logger.info(`🎁 ✅ REFERENCIA ENCONTRADA:`);
      logger.info(
        `🎁   Línea bonificación: ${bonusLineNumber} (${bonusArticleCode})`
      );
      logger.info(
        `🎁   → Referencia línea: ${referenceLineNumber} (${referenceArticle})`
      );
    } else {
      logger.warn(
        `🎁 ❌ NO se encontró línea regular para artículo: ${referenceArticle}`
      );
      logger.debug(
        `🎁 Artículos disponibles en lineMap: ${Object.keys(lineMap).join(
          ", "
        )}`
      );
    }

    const transformed = {
      ...bonusLine,
      [fieldConfig.bonusLineRef]: referenceLineNumber, // ✅ Número de línea del artículo regular
      [fieldConfig.orderedQuantity]: 0, // Línea bonificada: cantidad pedida = 0
      [fieldConfig.invoiceQuantity]: 0, // Línea bonificada: cantidad a facturar = 0
      [fieldConfig.bonusQuantity]:
        bonusLine[fieldConfig.quantityField] || bonusLine.QTY, // Cantidad bonificada

      // Campos de metadatos para debugging
      _IS_BONUS_LINE: true,
      _REFERENCE_ARTICLE: referenceArticle,
      _REFERENCE_LINE_NUMBER: referenceLineNumber,
      _PROMOTION_TYPE: "BONUS",
      _ART_BON: "B", // Confirmar que es bonificación
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(`🎁 ✅ LÍNEA BONIFICACIÓN TRANSFORMADA:`);
    logger.info(
      `🎁   PEDIDO_LINEA_BONIF: ${referenceLineNumber} (referencia a línea regular)`
    );
    logger.info(
      `🎁   CANTIDAD_BONIFICAD: ${transformed[fieldConfig.bonusQuantity]}`
    );
    logger.info(`🎁   CANTIDAD_PEDIDA: 0`);
    logger.info(`🎁   CANTIDAD_A_FACTURAR: 0`);

    return transformed;
  }

  /**
   * Transforma una línea que dispara promoción
   * @param {Object} triggerLine - Línea que dispara promoción
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformTriggerLine(triggerLine, fieldConfig) {
    const lineNumber = triggerLine[fieldConfig.lineNumberField];
    const articleCode = triggerLine[fieldConfig.articleField];
    const quantity = triggerLine[fieldConfig.quantityField] || triggerLine.QTY;

    const transformed = {
      ...triggerLine,
      [fieldConfig.bonusLineRef]: null, // Línea regular no tiene referencia
      [fieldConfig.orderedQuantity]: quantity, // Cantidad pedida normal
      [fieldConfig.invoiceQuantity]: quantity, // Cantidad a facturar normal
      [fieldConfig.bonusQuantity]: 0, // Línea regular: cantidad bonificada = 0

      // Campos de metadatos
      _IS_TRIGGER_LINE: true,
      _PROMOTION_TYPE: "TRIGGER",
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(`🎁 ✅ LÍNEA TRIGGER TRANSFORMADA:`);
    logger.info(`🎁   Línea: ${lineNumber} (${articleCode})`);
    logger.info(`🎁   CANTIDAD_PEDIDA: ${quantity}`);
    logger.info(`🎁   CANTIDAD_A_FACTURAR: ${quantity}`);
    logger.info(`🎁   CANTIDAD_BONIFICAD: 0`);
    logger.info(`🎁   PEDIDO_LINEA_BONIF: null`);

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
   * @returns {Object} - Resultado de la validación
   */
  static validatePromotionConfig(mapping) {
    const result = {
      canContinue: false,
      reason: null,
      warnings: [],
    };

    if (!mapping.promotionConfig) {
      result.reason = "No hay configuración de promociones";
      return result;
    }

    if (!mapping.promotionConfig.enabled) {
      result.reason = "Promociones deshabilitadas";
      return result;
    }

    // Validar campos requeridos
    const requiredFields = ["detectFields", "targetFields"];
    for (const field of requiredFields) {
      if (!mapping.promotionConfig[field]) {
        result.reason = `Configuración incompleta: falta ${field}`;
        return result;
      }
    }

    result.canContinue = true;
    return result;
  }

  /**
   * Aplica reglas específicas de promoción
   * @param {Array} data - Datos procesados
   * @param {Object} promotionConfig - Configuración de promociones
   * @returns {Array} - Datos con reglas aplicadas
   */
  static applyPromotionRules(data, promotionConfig) {
    if (!promotionConfig.rules || promotionConfig.rules.length === 0) {
      return data;
    }

    logger.info(
      `🎁 Aplicando ${promotionConfig.rules.length} reglas de promoción`
    );

    let processedData = [...data];

    promotionConfig.rules.forEach((rule) => {
      if (rule.enabled) {
        processedData = this.applyRule(processedData, rule);
      }
    });

    return processedData;
  }

  /**
   * Aplica una regla específica
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos con regla aplicada
   */
  static applyRule(data, rule) {
    switch (rule.type) {
      case "QUANTITY_BONUS":
        return this.applyQuantityBonusRule(data, rule);
      case "FAMILY_DISCOUNT":
        return this.applyFamilyDiscountRule(data, rule);
      case "SCALED_BONUS":
        return this.applyScaledBonusRule(data, rule);
      default:
        logger.warn(`Tipo de regla no soportado: ${rule.type}`);
        return data;
    }
  }

  /**
   * Aplica regla de bonificación por cantidad
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos con regla aplicada
   */
  static applyQuantityBonusRule(data, rule) {
    return data.map((line) => {
      if (line._IS_BONUS_LINE && rule.conditions.minQuantity) {
        const orderedQty = line.CANTIDAD_PEDIDA || 0;
        if (orderedQty >= rule.conditions.minQuantity) {
          line.CANTIDAD_BONIFICAD =
            rule.actions.bonusQuantity || line.CANTIDAD_BONIFICAD;
        }
      }
      return line;
    });
  }

  /**
   * Aplica regla de descuento por familia
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos con regla aplicada
   */
  static applyFamilyDiscountRule(data, rule) {
    return data.map((line) => {
      if (rule.conditions.familyCode) {
        // Lógica específica para descuentos por familia
        // Esto dependerá de la estructura de datos específica
      }
      return line;
    });
  }

  /**
   * Aplica regla de bonificación escalonada
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos con regla aplicada
   */
  static applyScaledBonusRule(data, rule) {
    return data.map((line) => {
      if (line._IS_BONUS_LINE && rule.conditions.minAmount) {
        // Lógica para bonificación escalonada
        // Esto dependerá de la estructura de datos específica
      }
      return line;
    });
  }
}

module.exports = PromotionProcessor;
