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

      // ✅ SOLUCIÓN: Mostrar correctamente
      logger.debug(
        `🎁 Líneas de promoción detectadas: ${promotionLines.length}`
      );
      logger.debug(
        `🎁 Detalle de promociones: ${JSON.stringify(promotionLines, null, 2)}`
      );

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
      quantityField: "CNT_MAX",
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
   * Detecta líneas con promociones - MEJORADO con debugging completo
   * @param {Array} detailData - Datos de detalle
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Array} - Líneas con promociones
   */
  static detectPromotionLines(detailData, fieldConfig) {
    const promotionLines = [];

    logger.debug(
      `🎁 🔍 INICIANDO detectPromotionLines con ${detailData.length} líneas`
    );
    logger.debug(
      `🎁 🔍 Configuración de campos: ${JSON.stringify(fieldConfig, null, 2)}`
    );

    detailData.forEach((line, index) => {
      logger.debug(`🎁 🔍 Procesando línea ${index + 1}:`);
      logger.debug(`🎁 🔍   Datos de línea: ${JSON.stringify(line, null, 2)}`);

      const promotionInfo = this.isPromotionLine(line, detailData, fieldConfig);

      logger.debug(
        `🎁 🔍   Resultado isPromotionLine: ${JSON.stringify(
          promotionInfo,
          null,
          2
        )}`
      );

      if (promotionInfo.hasPromotion) {
        promotionLines.push({
          line,
          index,
          info: promotionInfo,
        });

        logger.info(
          `🎁 ✅ PROMOCIÓN DETECTADA en línea ${index + 1}: ${
            promotionInfo.type
          }`
        );
      } else {
        logger.debug(`🎁 ❌ Sin promoción en línea ${index + 1}`);
      }
    });

    logger.info(
      `🎁 🔍 RESULTADO FINAL: ${promotionLines.length} promociones detectadas de ${detailData.length} líneas`
    );

    // Mostrar resumen de promociones detectadas
    if (promotionLines.length > 0) {
      promotionLines.forEach((promo, idx) => {
        const lineNum = promo.line[fieldConfig.lineNumberField];
        const articleCode = promo.line[fieldConfig.articleField];
        logger.info(
          `🎁   Promoción ${
            idx + 1
          }: Línea ${lineNum}, Artículo ${articleCode}, Tipo: ${
            promo.info.type
          }`
        );
      });
    }

    return promotionLines;
  }

  /**
   * Determina si una línea es de promoción - DEBUGGING COMPLETO
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

    logger.debug(
      `🎁 🔍 ANALIZANDO línea ${lineNumber}, artículo ${articleCode}`
    );
    logger.debug(`🎁 🔍   Campos disponibles: ${availableFields.join(", ")}`);
    logger.debug(
      `🎁 🔍   Buscando campo bonificación: ${fieldConfig.bonusField}`
    );

    logger.debug(`🎁 🔍   Recibimos line: ${JSON.stringify(line, null, 2)}`);

    logger.debug(
      `🎁 🔍   Recibimos allLines: ${JSON.stringify(allLines, null, 2)}`
    );

    logger.debug(
      `🎁 🔍   Recibimos fieldConfig: ${JSON.stringify(fieldConfig, null, 2)}`
    );

    // 🔍 VERIFICAR SI ES LÍNEA DE BONIFICACIÓN
    if (availableFields.includes(fieldConfig.bonusField)) {
      const bonusValue = line[fieldConfig.bonusField];
      logger.debug(
        `🎁 🔍   ✅ Campo bonificación encontrado: ${
          fieldConfig.bonusField
        } = ${bonusValue} (tipo: ${typeof bonusValue})`
      );

      // Mostrar todas las condiciones
      logger.debug(`🎁 🔍   Verificando condiciones:`);
      logger.debug(`🎁 🔍     bonusValue === "B": ${bonusValue === "B"}`);
      logger.debug(`🎁 🔍     bonusValue === "S": ${bonusValue === "S"}`);
      logger.debug(`🎁 🔍     bonusValue === "Y": ${bonusValue === "Y"}`);
      logger.debug(`🎁 🔍     bonusValue === 1: ${bonusValue === 1}`);
      logger.debug(`🎁 🔍     bonusValue === true: ${bonusValue === true}`);

      if (
        bonusValue === "B" ||
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
          logger.debug(
            `🎁 🔍   Bonificación CON descuento: ${
              line[fieldConfig.discountField]
            }`
          );
        } else {
          result.type = "BONUS";
          logger.debug(`🎁 🔍   Bonificación SIN descuento`);
        }

        const referenceArticle = line[fieldConfig.referenceField];
        logger.info(
          `🎁 ✅ LÍNEA BONIFICACIÓN detectada: línea ${lineNumber}, artículo bonificado ${articleCode}, referencia artículo ${referenceArticle}`
        );
      } else {
        logger.debug(
          `🎁 🔍   ❌ Valor de bonificación NO reconocido: "${bonusValue}" (tipo: ${typeof bonusValue})`
        );
        logger.debug(`🎁 🔍   Valores esperados: "B", "S", "Y", 1, true`);
      }
    } else {
      logger.debug(
        `🎁 🔍   ❌ Campo bonificación (${fieldConfig.bonusField}) NO encontrado`
      );
      logger.debug(`🎁 🔍   Campos disponibles: ${availableFields.join(", ")}`);
    }

    // 🔍 VERIFICAR SI ES LÍNEA REGULAR QUE DISPARA PROMOCIÓN
    logger.debug(`🎁 🔍   Verificando si es línea trigger...`);
    logger.debug(`🎁 🔍   articleCode: ${articleCode}`);
    logger.debug(
      `🎁 🔍   Campo referencia disponible: ${availableFields.includes(
        fieldConfig.referenceField
      )}`
    );

    if (articleCode && availableFields.includes(fieldConfig.referenceField)) {
      const hasReference = this.hasReferenceInOtherLines(
        line,
        allLines,
        fieldConfig
      );

      logger.debug(
        `🎁 🔍   hasReferenceInOtherLines resultado: ${hasReference}`
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

    // 📊 RESULTADO FINAL
    if (!result.hasPromotion) {
      logger.debug(
        `🎁 🔍   📋 Línea NORMAL: línea ${lineNumber}, artículo ${articleCode}`
      );
    }

    logger.debug(`🎁 🔍   RESULTADO: ${JSON.stringify(result, null, 2)}`);
    return result;
  }

  /**
   * Verifica si un artículo es referenciado por otras líneas - CORREGIDO
   * @param {Object} currentLine - Línea actual
   * @param {Array} allLines - Todas las líneas
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {boolean}
   */
  static hasReferenceInOtherLines(currentLine, allLines, fieldConfig) {
    const currentArticle = currentLine[fieldConfig.articleField];
    const currentLineNumber = currentLine[fieldConfig.lineNumberField];

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
      const bonusValue = line[fieldConfig.bonusField]; // ✅ AGREGAR ESTA LÍNEA

      // ✅ VERIFICAR QUE SEA UNA LÍNEA DE BONIFICACIÓN QUE REFERENCIA AL ARTÍCULO ACTUAL
      if (
        referenceArticle === currentArticle &&
        lineNumber !== currentLineNumber &&
        referenceArticle &&
        bonusValue === "B" // ✅ AGREGAR ESTA CONDICIÓN
      ) {
        foundReferences++;
        referencingLines.push(lineNumber);
      }
    });

    if (foundReferences > 0) {
      logger.debug(
        `🎁 Artículo ${currentArticle} (línea ${currentLineNumber}) es referenciado por ${foundReferences} líneas de bonificación: ${referencingLines.join(
          ", "
        )}`
      );
      return true;
    }

    return false;
  }

  /**
   * Transforma datos según promociones por artículo
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
      [fieldConfig.orderedQuantity]: null, // Línea bonificada no tiene cantidad pedida
      [fieldConfig.invoiceQuantity]: null, // Línea bonificada no tiene cantidad a facturar
      [fieldConfig.bonusQuantity]:
        bonusLine[fieldConfig.quantityField] || bonusLine.QTY, // ✅ Cantidad bonificada (CND_MAX)

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
   * Aplica reglas específicas de promoción
   * @param {Array} processedData - Datos ya procesados
   * @param {Object} promotionConfig - Configuración de promociones
   * @returns {Array} - Datos con reglas aplicadas
   */
  static applyPromotionRules(processedData, promotionConfig) {
    if (!promotionConfig || !promotionConfig.rules) {
      return processedData;
    }

    logger.info(
      `🎁 Aplicando ${promotionConfig.rules.length} reglas de promoción`
    );

    // Aquí puedes implementar reglas específicas según sea necesario
    // Por ahora, simplemente retornamos los datos procesados

    return processedData;
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
      console.log("🔍 DEBUG: Configuración inválida");
      return false;
    }

    const detailTables =
      mapping.tableConfigs?.filter((tc) => tc.isDetailTable) || [];
    console.log(
      "🔍 DEBUG: Tablas de detalle encontradas:",
      detailTables.length
    );

    if (detailTables.length === 0) {
      console.log("🔍 DEBUG: No hay tablas de detalle");
      return false;
    }

    console.log("🔍 DEBUG: ✅ Promociones activadas");
    logger.info(
      "✅ Condiciones para promociones cumplidas - activando procesamiento automático"
    );
    return true;
  }

  /**
   * Valida la configuración de promociones
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Resultado de validación
   */
  static validatePromotionConfig(mapping) {
    const result = {
      canContinue: true,
      errors: [],
      warnings: [],
    };

    if (!mapping.promotionConfig) {
      result.canContinue = false;
      result.errors.push("No existe configuración de promociones");
      return result;
    }

    if (!mapping.promotionConfig.enabled) {
      result.canContinue = false;
      result.errors.push("Promociones deshabilitadas");
      return result;
    }

    // Validar campos requeridos
    const requiredFields = [
      "bonusField",
      "referenceField",
      "articleField",
      "quantityField",
    ];
    const detectFields = mapping.promotionConfig.detectFields || {};

    requiredFields.forEach((field) => {
      if (!detectFields[field]) {
        result.warnings.push(
          `Campo ${field} no configurado, usando valor por defecto`
        );
      }
    });

    logger.info(
      `🎁 Validación promociones: ${result.errors.length} errores, ${result.warnings.length} warnings`
    );

    return result;
  }
}

module.exports = PromotionProcessor;
