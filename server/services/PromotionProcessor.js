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

      logger.info(`Procesando promociones para ${detailData.length} líneas`);

      // Detectar líneas con promociones
      const promotionLines = this.detectPromotionLines(detailData);

      if (promotionLines.length === 0) {
        logger.debug("No se detectaron promociones en el documento");
        return detailData;
      }

      logger.info(`Detectadas ${promotionLines.length} líneas con promociones`);

      // Transformar datos según promociones
      const transformedData = this.transformPromotionData(
        detailData,
        promotionLines
      );

      logger.info(`Transformación de promociones completada`);
      return transformedData;
    } catch (error) {
      logger.error(`Error al procesar promociones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detecta líneas que contienen promociones
   * @param {Array} detailData - Datos de detalle
   * @returns {Array} - Líneas con promociones detectadas
   */
  static detectPromotionLines(detailData) {
    const promotionLines = [];

    for (const line of detailData) {
      const isPromotion = this.isPromotionLine(line);

      if (isPromotion.hasPromotion) {
        promotionLines.push({
          ...line,
          promotionType: isPromotion.type,
          originalIndex: detailData.indexOf(line),
        });
      }
    }

    return promotionLines;
  }

  /**
   * Determina si una línea es una promoción
   * @param {Object} line - Línea de detalle
   * @returns {Object} - Información sobre la promoción
   */
  static isPromotionLine(line) {
    const result = {
      hasPromotion: false,
      type: null,
      isRegularLine: false,
      isBonusLine: false,
    };

    // Verificar si es bonificación (ART_BON = 'B')
    if (line.ART_BON === "B" || line.ART_BON === "b") {
      result.hasPromotion = true;
      result.type = "BONUS";
      result.isBonusLine = true;
    }

    // Verificar si tiene descuento (MON_DSC > 0)
    if (line.MON_DSC && parseFloat(line.MON_DSC) > 0) {
      result.hasPromotion = true;
      result.type = result.type ? "BONUS_WITH_DISCOUNT" : "DISCOUNT";
    }

    // Verificar si es línea regular que dispara promoción (COD_ART_RFR presente en otras líneas)
    if (line.COD_ART && this.hasReferenceInOtherLines(line, detailData)) {
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
   * @returns {boolean}
   */
  static hasReferenceInOtherLines(currentLine, allLines) {
    return allLines.some(
      (line) =>
        line.COD_ART_RFR === currentLine.COD_ART &&
        line.NUM_LN !== currentLine.NUM_LN
    );
  }

  /**
   * Transforma los datos aplicando la lógica de promociones
   * @param {Array} originalData - Datos originales
   * @param {Array} promotionLines - Líneas con promociones
   * @returns {Array} - Datos transformados
   */
  static transformPromotionData(originalData, promotionLines) {
    const transformedData = [];
    const processedLines = new Set();

    for (const line of originalData) {
      const lineIndex = originalData.indexOf(line);

      if (processedLines.has(lineIndex)) {
        continue;
      }

      const promotionInfo = this.isPromotionLine(line);

      if (promotionInfo.isBonusLine) {
        // Línea de bonificación
        const transformedLine = this.transformBonusLine(line, originalData);
        transformedData.push(transformedLine);
      } else if (promotionInfo.isRegularLine) {
        // Línea regular que dispara promoción
        const transformedLine = this.transformRegularLine(line, originalData);
        transformedData.push(transformedLine);
      } else {
        // Línea normal sin promoción
        transformedData.push(this.transformNormalLine(line));
      }

      processedLines.add(lineIndex);
    }

    return transformedData;
  }

  /**
   * Transforma una línea de bonificación
   * @param {Object} bonusLine - Línea de bonificación
   * @param {Array} allLines - Todas las líneas
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, allLines) {
    const regularLine = this.findRegularLineForBonus(bonusLine, allLines);

    const transformed = {
      ...bonusLine,
      // Asignar la línea de referencia
      PEDIDO_LINEA_BONIF: regularLine ? regularLine.NUM_LN : null,

      // Mover cantidad a campo de bonificación
      CANTIDAD_BONIF: bonusLine.CND_MAX || bonusLine.QTY,
      CANTIDAD_PEDIDA: null,
      CANTIDAD_A_FACTURAR: null,

      // Marcar como línea de bonificación
      _IS_BONUS_LINE: true,
      _PROMOTION_TYPE: "BONUS",
    };

    // ELIMINAR CAMPOS PROBLEMÁTICOS
    delete transformed.CANTIDAD;

    logger.debug(
      `Línea de bonificación transformada: ${bonusLine.NUM_LN} -> referencia: ${transformed.PEDIDO_LINEA_BONIF}`
    );

    return transformed;
  }

  /**
   * Transforma una línea regular que dispara promoción
   * @param {Object} regularLine - Línea regular
   * @param {Array} allLines - Todas las líneas
   * @returns {Object} - Línea transformada
   */
  static transformRegularLine(regularLine, allLines) {
    const transformed = {
      ...regularLine,
      PEDIDO_LINEA_BONIF: null,
      CANTIDAD_PEDIDA: regularLine.CND_MAX || regularLine.QTY,
      CANTIDAD_A_FACTURAR: regularLine.CND_MAX || regularLine.QTY,
      CANTIDAD_BONIF: null,

      // Marcar como línea que dispara promoción
      _IS_TRIGGER_LINE: true,
      _PROMOTION_TYPE: "TRIGGER",
    };

    // ELIMINAR CAMPOS PROBLEMÁTICOS
    delete transformed.CANTIDAD;

    logger.debug(
      `Línea regular transformada: ${regularLine.NUM_LN} (dispara promoción)`
    );

    return transformed;
  }

  /**
   * Transforma una línea normal sin promoción
   * @param {Object} normalLine - Línea normal
   * @returns {Object} - Línea transformada
   */
  static transformNormalLine(normalLine) {
    const transformed = {
      ...normalLine,
      PEDIDO_LINEA_BONIF: null,
      CANTIDAD_PEDIDA: normalLine.CND_MAX || normalLine.QTY,
      CANTIDAD_A_FACTURAR: normalLine.CND_MAX || normalLine.QTY,
      CANTIDAD_BONIF: null,

      _IS_NORMAL_LINE: true,
      _PROMOTION_TYPE: "NONE",
    };

    // ELIMINAR CAMPOS PROBLEMÁTICOS
    delete transformed.CANTIDAD;

    return transformed;
  }

  /**
   * Encuentra la línea regular asociada a una bonificación
   * @param {Object} bonusLine - Línea de bonificación
   * @param {Array} allLines - Todas las líneas
   * @returns {Object|null} - Línea regular encontrada
   */
  static findRegularLineForBonus(bonusLine, allLines) {
    if (!bonusLine.COD_ART_RFR) {
      logger.warn(
        `Línea de bonificación ${bonusLine.NUM_LN} no tiene COD_ART_RFR definido`
      );
      return null;
    }

    const regularLine = allLines.find(
      (line) =>
        line.COD_ART === bonusLine.COD_ART_RFR &&
        line.NUM_LN !== bonusLine.NUM_LN
    );

    if (!regularLine) {
      logger.warn(
        `No se encontró línea regular para bonificación ${bonusLine.NUM_LN} con COD_ART_RFR: ${bonusLine.COD_ART_RFR}`
      );
    }

    return regularLine;
  }

  /**
   * Valida la configuración de promociones
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si la configuración es válida
   */
  static validatePromotionConfig(mapping) {
    try {
      // Verificar que existan los campos necesarios en el mapping
      const requiredFields = ["ART_BON", "COD_ART_RFR", "NUM_LN", "COD_ART"];
      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      for (const detailTable of detailTables) {
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
    if (!promotionRules || !promotionRules.enabled) {
      return detailData;
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
  }

  /**
   * Aplica una regla específica de promoción
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla específica
   * @returns {Array} - Datos con regla aplicada
   */
  static applySpecificRule(data, rule) {
    switch (rule.type) {
      case "FAMILY_DISCOUNT":
        return this.applyFamilyDiscountRule(data, rule);
      case "QUANTITY_BONUS":
        return this.applyQuantityBonusRule(data, rule);
      case "SCALED_BONUS":
        return this.applyScaledBonusRule(data, rule);
      case "PRODUCT_BONUS":
        return this.applyProductBonusRule(data, rule);
      case "INVOICE_DISCOUNT":
        return this.applyInvoiceDiscountRule(data, rule);
      case "ONE_TIME_OFFER":
        return this.applyOneTimeOfferRule(data, rule);
      default:
        logger.warn(`Tipo de regla desconocida: ${rule.type}`);
        return data;
    }
  }

  /**
   * Aplica regla de descuento por familia
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyFamilyDiscountRule(data, rule) {
    // Implementar lógica para descuento por familia
    // Ejemplo: 2% descuento en familia Desechables por monto facturado
    logger.debug(`Aplicando regla de descuento por familia: ${rule.name}`);
    return data;
  }

  /**
   * Aplica regla de bonificación por cantidad
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyQuantityBonusRule(data, rule) {
    // Implementar lógica para bonificación por cantidad
    // Ejemplo: X unidades facturadas dan X cantidad en bonificación
    logger.debug(`Aplicando regla de bonificación por cantidad: ${rule.name}`);
    return data;
  }

  /**
   * Aplica regla de bonificación escalada
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyScaledBonusRule(data, rule) {
    // Implementar lógica para bonificación escalada
    // Ejemplo: Diferentes bonificaciones según cantidad (20, 50, etc.)
    logger.debug(`Aplicando regla de bonificación escalada: ${rule.name}`);
    return data;
  }

  /**
   * Aplica regla de bonificación por producto
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyProductBonusRule(data, rule) {
    // Implementar lógica para bonificación por producto específico
    logger.debug(`Aplicando regla de bonificación por producto: ${rule.name}`);
    return data;
  }

  /**
   * Aplica regla de descuento en factura
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyInvoiceDiscountRule(data, rule) {
    // Implementar lógica para mostrar descuento en lugar de línea con costo cero
    logger.debug(`Aplicando regla de descuento en factura: ${rule.name}`);
    return data;
  }

  /**
   * Aplica regla de oferta única
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyOneTimeOfferRule(data, rule) {
    // Implementar lógica para ofertas que solo se pueden aplicar una vez
    logger.debug(`Aplicando regla de oferta única: ${rule.name}`);
    return data;
  }
}

module.exports = PromotionProcessor;
