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

      logger.info(`🎁 Procesando promociones para ${detailData.length} líneas`);

      // Obtener configuración de campos desde el mapping
      const fieldConfig = this.getFieldConfiguration(mapping);
      logger.debug(`Configuración de campos: ${JSON.stringify(fieldConfig)}`);

      // Crear mapa de líneas para referencias rápidas
      const lineMap = this.createLineMap(detailData, fieldConfig);

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
   * Crea un mapa de líneas para referencias rápidas - MEJORADO
   * @param {Array} detailData - Datos de detalle
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Mapa de artículos a líneas
   */
  static createLineMap(detailData, fieldConfig) {
    const lineMap = {};

    logger.debug(
      `🎁 Creando mapa de líneas con ${detailData.length} registros`
    );

    detailData.forEach((line, index) => {
      const articleCode = line[fieldConfig.articleField];
      if (articleCode) {
        lineMap[articleCode] = line;
        logger.debug(
          `🎁 Mapeado: artículo ${articleCode} → línea ${
            line[fieldConfig.lineNumberField]
          }`
        );
      }
    });

    logger.info(
      `🎁 Mapa de líneas creado: ${
        Object.keys(lineMap).length
      } artículos mapeados`
    );
    logger.debug(`🎁 Artículos en mapa: ${Object.keys(lineMap).join(", ")}`);

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
   * Determina si una línea es de promoción - MEJORADO con mejor logging
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

    logger.info(`🎁 Analizando línea ${lineNumber}, artículo ${articleCode}`);

    // 🔍 VERIFICAR SI ES LÍNEA DE BONIFICACIÓN
    if (availableFields.includes(fieldConfig.bonusField)) {
      const bonusValue = line[fieldConfig.bonusField];
      logger.info(
        `🎁   Campo bonificación (${fieldConfig.bonusField}): ${bonusValue}`
      );

      if (
        bonusValue === "S" ||
        bonusValue === "Y" ||
        bonusValue === 1 ||
        bonusValue === true
      ) {
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

        const referenceArticle = line[fieldConfig.referenceField];
        logger.info(
          `🎁 ✅ LÍNEA BONIFICACIÓN detectada: línea ${lineNumber}, artículo bonificado ${articleCode}, referencia artículo ${referenceArticle}`
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

        logger.info(
          `🎁 ✅ LÍNEA TRIGGER detectada: línea ${lineNumber}, artículo ${articleCode} dispara bonificaciones`
        );
      }
    }

    if (!result.hasPromotion) {
      logger.debug(
        `🎁 Línea normal: línea ${lineNumber}, artículo ${articleCode}`
      );
    }

    return result;
  }

  /**
   * Verifica si un artículo es referenciado por otras líneas - MEJORADO
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

    let foundReferences = 0;
    const referencingLines = [];

    allLines.forEach((line) => {
      // Verificar que la línea tenga el campo de referencia
      if (!line.hasOwnProperty(fieldConfig.referenceField)) {
        return;
      }

      const referenceArticle = line[fieldConfig.referenceField];
      const lineNumber = line[fieldConfig.lineNumberField];

      if (
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
        `🎁 Artículo ${currentArticle} (línea ${currentLineNumber}) es referenciado por ${foundReferences} líneas: ${referencingLines.join(
          ", "
        )}`
      );
      return true;
    }

    return false;
  }

  /**
   * Transforma los datos aplicando la lógica de promociones - MEJORADO con mejor logging
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

    logger.info(
      `🎁 Transformando ${originalData.length} líneas con ${promotionLines.length} promociones detectadas`
    );

    // Mostrar el mapa de líneas para debugging
    logger.debug(`🎁 Mapa de artículos disponible:`);
    Object.entries(lineMap).forEach(([article, line]) => {
      logger.debug(
        `🎁   Artículo ${article} → Línea ${line[fieldConfig.lineNumberField]}`
      );
    });

    originalData.forEach((line, index) => {
      if (processedLines.has(index)) {
        return;
      }

      const promotionInfo = this.isPromotionLine(
        line,
        originalData,
        fieldConfig
      );
      const lineNumber = line[fieldConfig.lineNumberField];
      const articleCode = line[fieldConfig.articleField];

      if (promotionInfo.isBonusLine) {
        // 🎁 LÍNEA DE BONIFICACIÓN
        logger.info(
          `🎁 Procesando línea bonificación ${lineNumber} (artículo ${articleCode})`
        );
        const transformedLine = this.transformBonusLine(
          line,
          fieldConfig,
          lineMap
        );
        transformedData.push(transformedLine);
      } else if (promotionInfo.isRegularLine) {
        // 🎯 LÍNEA REGULAR QUE DISPARA PROMOCIÓN
        logger.info(
          `🎁 Procesando línea trigger ${lineNumber} (artículo ${articleCode})`
        );
        const transformedLine = this.transformTriggerLine(line, fieldConfig);
        transformedData.push(transformedLine);
      } else {
        // 📋 LÍNEA NORMAL SIN PROMOCIÓN
        logger.debug(
          `📋 Procesando línea normal ${lineNumber} (artículo ${articleCode})`
        );
        const transformedLine = this.transformNormalLine(line, fieldConfig);
        transformedData.push(transformedLine);
      }

      processedLines.add(index);
    });

    // 📊 RESUMEN FINAL
    const bonusLines = transformedData.filter((line) => line._IS_BONUS_LINE);
    const triggerLines = transformedData.filter(
      (line) => line._IS_TRIGGER_LINE
    );
    const normalLines = transformedData.filter((line) => line._IS_NORMAL_LINE);

    logger.info(`🎁 ✅ TRANSFORMACIÓN COMPLETADA:`);
    logger.info(`🎁   Líneas bonificación: ${bonusLines.length}`);
    logger.info(`🎁   Líneas trigger: ${triggerLines.length}`);
    logger.info(`📋   Líneas normales: ${normalLines.length}`);

    // Log detallado de referencias
    bonusLines.forEach((line) => {
      const bonusLineNum = line[fieldConfig.lineNumberField];
      const referenceLineNum = line[fieldConfig.bonusLineRef];
      const bonusArticle = line[fieldConfig.articleField];
      const referenceArticle = line._REFERENCE_ARTICLE;

      logger.info(
        `🎁 BONIFICACIÓN: Línea ${bonusLineNum} (${bonusArticle}) → referencia línea ${referenceLineNum} (${referenceArticle})`
      );
    });

    return transformedData;
  }

  /**
   * Transforma una línea de bonificación - CORREGIDO
   * @param {Object} bonusLine - Línea de bonificación
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, lineMap) {
    // 🔍 ENCONTRAR LA LÍNEA REGULAR QUE DISPARA ESTA BONIFICACIÓN
    const referenceArticle = bonusLine[fieldConfig.referenceField]; // COD_ART_RFR
    let referenceLineNumber = null;

    logger.debug(
      `🎁 Procesando línea bonificación: línea ${
        bonusLine[fieldConfig.lineNumberField]
      }, articulo bonificado: ${bonusLine[fieldConfig.articleField]}`
    );
    logger.debug(
      `🎁 Buscando línea regular que referencia articulo: ${referenceArticle}`
    );

    // Buscar la línea regular que tiene este artículo
    if (referenceArticle && lineMap[referenceArticle]) {
      referenceLineNumber =
        lineMap[referenceArticle][fieldConfig.lineNumberField];
      logger.info(
        `🎁 ✅ ENCONTRADA línea regular: línea ${referenceLineNumber} (artículo ${referenceArticle}) dispara bonificación línea ${
          bonusLine[fieldConfig.lineNumberField]
        }`
      );
    } else {
      logger.warn(
        `🎁 ❌ NO se encontró línea regular para artículo referenciado: ${referenceArticle}`
      );
      logger.warn(
        `🎁 Artículos disponibles en lineMap: ${Object.keys(lineMap).join(
          ", "
        )}`
      );
    }

    const transformed = {
      ...bonusLine,
      [fieldConfig.bonusLineRef]: referenceLineNumber, // ✅ REFERENCIA A LA LÍNEA REGULAR
      [fieldConfig.orderedQuantity]: 0, // Línea bonificada no tiene cantidad pedida
      [fieldConfig.invoiceQuantity]: 0, // Línea bonificada no tiene cantidad a facturar
      [fieldConfig.bonusQuantity]:
        bonusLine[fieldConfig.quantityField] || bonusLine.QTY, // Cantidad bonificada

      // Campos de metadatos para debugging
      _IS_BONUS_LINE: true,
      _REFERENCE_ARTICLE: referenceArticle,
      _REFERENCE_LINE_NUMBER: referenceLineNumber,
      _PROMOTION_TYPE: "BONUS",
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(`🎁 Línea bonificación transformada:`);
    logger.info(
      `🎁   Línea bonificación: ${bonusLine[fieldConfig.lineNumberField]}`
    );
    logger.info(
      `🎁   Artículo bonificado: ${bonusLine[fieldConfig.articleField]}`
    );
    logger.info(`🎁   Referencia a línea regular: ${referenceLineNumber}`);
    logger.info(`🎁   Artículo que dispara: ${referenceArticle}`);
    logger.info(
      `🎁   Cantidad bonificada: ${transformed[fieldConfig.bonusQuantity]}`
    );

    return transformed;
  }

  /**
   * Transforma una línea que dispara promoción - MEJORADO
   * @param {Object} triggerLine - Línea que dispara promoción
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformTriggerLine(triggerLine, fieldConfig) {
    const lineNumber = triggerLine[fieldConfig.lineNumberField];
    const articleCode = triggerLine[fieldConfig.articleField];

    const transformed = {
      ...triggerLine,
      [fieldConfig.bonusLineRef]: null, // Línea regular no tiene referencia
      [fieldConfig.orderedQuantity]:
        triggerLine[fieldConfig.quantityField] || triggerLine.QTY,
      [fieldConfig.invoiceQuantity]:
        triggerLine[fieldConfig.quantityField] || triggerLine.QTY,
      [fieldConfig.bonusQuantity]: null, // Línea regular no tiene cantidad bonificada

      // Campos de metadatos
      _IS_TRIGGER_LINE: true,
      _PROMOTION_TYPE: "TRIGGER",
    };

    // Limpiar campos problemáticos
    delete transformed.CANTIDAD;
    delete transformed.QTY;

    logger.info(`🎁 Línea trigger transformada:`);
    logger.info(`🎁   Línea regular: ${lineNumber}`);
    logger.info(`🎁   Artículo que dispara: ${articleCode}`);
    logger.info(
      `🎁   Cantidad pedida: ${transformed[fieldConfig.orderedQuantity]}`
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
