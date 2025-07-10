const logger = require("./logger");

/**
 * Procesador de Promociones - Versión Corregida y Mejorada
 * Maneja la detección, transformación y aplicación de promociones automáticamente
 * Corrige los errores identificados en los logs de producción
 */
class PromotionProcessor {
  // ===============================
  // 1. MÉTODOS PRINCIPALES DE PROCESAMIENTO
  // ===============================

  /**
   * Procesa datos con promociones automáticamente - MÉTODO PRINCIPAL CORREGIDO
   * @param {Array} data - Datos a procesar
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} fieldConfig - Configuración de campos (opcional, detectada automáticamente)
   * @returns {Array} - Datos procesados con promociones
   */
  static processPromotionsWithConfig(data, mapping, fieldConfig = null) {
    try {
      logger.info("🎁 INICIANDO PROCESAMIENTO DE PROMOCIONES CORREGIDO");

      if (!this.shouldUsePromotions(mapping)) {
        logger.info("📋 Procesamiento estándar - sin promociones");
        return data.map((row) =>
          this.transformNormalLine(row, fieldConfig || {})
        );
      }

      // ✅ USAR CONFIGURACIÓN DETECTADA O POR DEFECTO
      const effectiveFieldConfig =
        fieldConfig || this.getFieldConfiguration(mapping);

      logger.info(
        `🎁 Configuración de campos utilizada: ${JSON.stringify(
          effectiveFieldConfig,
          null,
          2
        )}`
      );

      // ✅ VALIDAR QUE LOS DATOS TENGAN LOS CAMPOS REQUERIDOS
      if (!this.validateDataFields(data, effectiveFieldConfig)) {
        logger.warn(
          "🎁 ⚠️ Datos no contienen campos requeridos para promociones, procesando sin promociones"
        );
        return data.map((row) =>
          this.transformNormalLine(row, effectiveFieldConfig)
        );
      }

      // ✅ CREAR MAPA DE LÍNEAS CORREGIDO - ALMACENAR MÚLTIPLES LÍNEAS POR ARTÍCULO
      const lineMap = {};
      data.forEach((row, index) => {
        const lineNumber = this.extractValue(
          row,
          effectiveFieldConfig.lineNumberField
        );
        const articleCode = this.extractValue(
          row,
          effectiveFieldConfig.articleField
        );
        const lineType = this.detectLineType(row, effectiveFieldConfig);

        if (lineNumber && articleCode) {
          // ✅ NUEVO: Solo almacenar líneas TRIGGER/NORMAL (no bonificaciones)
          if (lineType !== "BONUS") {
            if (!lineMap[articleCode]) {
              lineMap[articleCode] = [];
            }
            lineMap[articleCode].push({
              ...row,
              lineNumber,
              _originalIndex: index,
            });

            logger.debug(
              `🎁 Línea ${lineType} mapeada: artículo ${articleCode} → línea ${lineNumber} (índice ${index})`
            );
          } else {
            logger.debug(
              `🎁 Línea BONUS omitida del mapa: artículo ${articleCode} → línea ${lineNumber}`
            );
          }
        }
      });

      logger.info(
        `🎁 Mapa de líneas creado: ${Object.keys(lineMap).length} artículos`
      );

      // ✅ Log detallado del mapa para debugging
      Object.entries(lineMap).forEach(([article, lines]) => {
        const lineNumbers = lines.map((l) => l.lineNumber).join(", ");
        logger.debug(`🎁 Artículo ${article}: líneas trigger [${lineNumbers}]`);
      });

      // ✅ PROCESAR LÍNEAS SEGÚN SU TIPO - PASANDO ÍNDICE PARA REFERENCIAS
      const processedData = data.map((row, index) => {
        try {
          const lineType = this.detectLineType(row, effectiveFieldConfig);

          logger.debug(`🎁 Procesando línea ${index + 1}: tipo ${lineType}`);

          switch (lineType) {
            case "BONUS":
              return this.transformBonusLineWithIndex(
                row,
                effectiveFieldConfig,
                lineMap,
                index,
                data
              );
            case "TRIGGER":
              return this.transformTriggerLine(row, effectiveFieldConfig);
            default:
              return this.transformNormalLine(row, effectiveFieldConfig);
          }
        } catch (lineError) {
          logger.error(
            `🎁 ❌ Error procesando línea ${index + 1}: ${lineError.message}`
          );
          logger.error(
            `🎁 Datos de línea problemática: ${JSON.stringify(row, null, 2)}`
          );
          // Procesar como línea normal en caso de error
          return this.transformNormalLine(row, effectiveFieldConfig);
        }
      });

      // Aplicar reglas específicas si están configuradas
      const finalData = this.applyPromotionRules(
        processedData,
        mapping.promotionConfig
      );

      logger.info(
        `🎁 ✅ Promociones procesadas: ${finalData.length} líneas transformadas`
      );

      // Log de resumen
      const bonusLines = finalData.filter((line) => line._IS_BONUS_LINE);
      const triggerLines = finalData.filter((line) => line._IS_TRIGGER_LINE);
      const normalLines = finalData.filter((line) => line._IS_NORMAL_LINE);

      logger.info(
        `🎁 Resumen: ${bonusLines.length} bonificaciones, ${triggerLines.length} triggers, ${normalLines.length} normales`
      );

      return finalData;
    } catch (error) {
      logger.error("❌ Error en procesamiento de promociones:", error);
      logger.error("❌ Stack trace:", error.stack);
      // En caso de error, devolver datos sin procesar
      logger.warn(
        "🎁 Devolviendo datos sin procesamiento de promociones debido al error"
      );
      return data;
    }
  }

  /**
   * Método compatible con la lógica anterior (wrapper)
   * @param {Array} data - Datos a procesar
   * @param {Object} mapping - Configuración de mapping
   * @returns {Array} - Datos procesados
   */
  static processPromotions(data, mapping) {
    return this.processPromotionsWithConfig(data, mapping, null);
  }

  // ===============================
  // 2. MÉTODOS DE DETECCIÓN Y VALIDACIÓN
  // ===============================

  /**
   * Detecta el tipo de línea para promociones - MEJORADO
   * @param {Object} row - Fila de datos
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {string} - Tipo de línea: BONUS, TRIGGER, NORMAL
   */
  static detectLineType(row, fieldConfig) {
    try {
      // 1. Detectar línea bonificada por indicador directo
      const bonusIndicator = this.extractValue(row, fieldConfig.bonusField);
      const bonusReference = this.extractValue(row, fieldConfig.referenceField);

      if (
        bonusIndicator === fieldConfig.bonusIndicatorValue ||
        bonusIndicator === "B" ||
        bonusIndicator === "BONUS" ||
        bonusReference
      ) {
        logger.debug(
          `🎁 Línea bonificada detectada: ${bonusIndicator} / ${bonusReference}`
        );
        return "BONUS";
      }

      // 2. Detectar línea que dispara promoción
      const articleCode = this.extractValue(row, fieldConfig.articleField);
      const quantity = this.extractValue(row, fieldConfig.quantityField);

      if (
        articleCode &&
        bonusIndicator === 0 &&
        quantity &&
        parseFloat(quantity) > 0
      ) {
        logger.debug(
          `🎁 Línea trigger detectada: ${articleCode} (qty: ${quantity})`
        );
        return "TRIGGER";
      }

      logger.debug(`🎁 Línea normal detectada`);
      return "NORMAL";
    } catch (error) {
      logger.warn(`🎁 Error detectando tipo de línea: ${error.message}`);
      return "NORMAL";
    }
  }

  /**
   * Valida que los datos contengan los campos requeridos para promociones
   * @param {Array} data - Datos a validar
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {boolean} - Si los datos son válidos para promociones
   */
  static validateDataFields(data, fieldConfig) {
    if (!data || data.length === 0) {
      return false;
    }

    const firstRecord = data[0];
    const requiredFields = [
      fieldConfig.bonusField,
      fieldConfig.articleField,
      fieldConfig.quantityField,
      fieldConfig.lineNumberField,
    ];

    const missingFields = requiredFields.filter(
      (field) => !field || !firstRecord.hasOwnProperty(field)
    );

    if (missingFields.length > 0) {
      logger.warn(
        `🎁 ⚠️ Campos faltantes para promociones: ${missingFields.join(", ")}`
      );
      logger.debug(
        `🎁 Campos disponibles: ${Object.keys(firstRecord).join(", ")}`
      );
      return false;
    }

    logger.info(`🎁 ✅ Validación de campos completada exitosamente`);
    return true;
  }

  /**
   * Valida configuración de promociones - MEJORADO
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si la configuración es válida
   */
  static validatePromotionConfig(mapping) {
    try {
      if (!mapping.promotionConfig) {
        logger.debug("🎁 No hay configuración de promociones");
        return false;
      }

      if (!mapping.promotionConfig.enabled) {
        logger.debug("🎁 Promociones deshabilitadas");
        return false;
      }

      // Validar campos requeridos básicos
      const detectFields = mapping.promotionConfig.detectFields;
      const targetFields = mapping.promotionConfig.targetFields;

      if (!detectFields || !targetFields) {
        logger.warn(
          "🎁 Configuración de promociones incompleta: faltan detectFields o targetFields"
        );
        return false;
      }

      logger.info("🎁 ✅ Configuración de promociones válida");
      return true;
    } catch (error) {
      logger.error(
        `🎁 Error validando configuración de promociones: ${error.message}`
      );
      return false;
    }
  }

  // ===============================
  // 3. MÉTODOS DE TRANSFORMACIÓN DE LÍNEAS
  // ===============================

  /**
   * Transforma línea bonificada - CORREGIDO COMPLETAMENTE
   * @param {Object} bonusLine - Línea bonificada
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas para referencias
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, lineMap) {
    try {
      const referenceArticle = this.extractValue(
        bonusLine,
        fieldConfig.referenceField
      );
      const lineNumber = this.extractValue(
        bonusLine,
        fieldConfig.lineNumberField
      );
      const articleCode = this.extractValue(
        bonusLine,
        fieldConfig.articleField
      );
      const bonusQuantity = this.extractValue(
        bonusLine,
        fieldConfig.quantityField
      );

      // Buscar línea de referencia
      // const referenceLineNumber = lineMap[referenceArticle]?.lineNumber || 1;
      let referenceLineNumber = null;

      if (referenceArticle && lineMap[referenceArticle]) {
        referenceLineNumber = lineMap[referenceArticle].lineNumber;
        logger.error(
          `🎁 ✅ Línea trigger encontrada: artículo ${referenceArticle} está en línea ${referenceLineNumber}`
        );
      } else {
        logger.warn(
          `🎁 ⚠️ No se encontró línea trigger para artículo ${referenceArticle}`
        );
        logger.error(
          `🎁 Artículos disponibles en lineMap: ${Object.keys(lineMap).join(
            ", "
          )}`
        );
        referenceLineNumber = 1; // Fallback
      }

      logger.error(
        `🎁 ============ TRANSFORMANDO LÍNEA BONIFICADA ============`
      );
      logger.error(`🎁 Línea: ${lineNumber} | Artículo: ${articleCode}`);
      logger.error(
        `🎁 Referencia: ${referenceArticle} -> línea ${referenceLineNumber}`
      );
      logger.error(`🎁 Cantidad bonificada: ${bonusQuantity}`);

      // ✅ CREAR TRANSFORMACIÓN CORRECTA PARA LÍNEA BONIFICADA
      const transformed = {
        ...bonusLine,

        // ✅ CAMPOS CORRECTOS PARA LÍNEA BONIFICADA
        PEDIDO_LINEA_BONIF: referenceLineNumber, // ✅ Referencia a línea regular
        CANTIDAD_BONIFICAD: this.parseNumericValue(bonusQuantity), // ✅ Cantidad bonificada

        // ✅ CAMPOS QUE DEBEN SER NULL PARA LÍNEAS BONIFICADAS
        CANTIDAD_PEDIDA: null, // ❌ Era: bonusQuantity
        CANTIDAD_A_FACTURA: null, // ❌ Era: bonusQuantity
        CANTIDAD_FACTURADA: 0,
        CANTIDAD_RESERVADA: 0,
        CANTIDAD_CANCELADA: 0,

        // ✅ ELIMINAR CAMPOS DUPLICADOS/INCORRECTOS
        // NO agregar CANTIDAD_BONIF
        // NO agregar CANTIDAD_A_FACTURA

        // Metadatos para debugging
        _IS_BONUS_LINE: true,
        _REFERENCE_ARTICLE: referenceArticle,
        _REFERENCE_LINE_NUMBER: referenceLineNumber,
        _PROMOTION_TYPE: "BONUS",
        _ORIGINAL_LINE_NUMBER: lineNumber,
      };

      // ✅ LIMPIAR DATOS PROBLEMÁTICOS
      this.cleanTransformedData(transformed);

      // ✅ LOG DETALLADO DE DATOS CORRECTOS
      logger.error(
        `🎁 ============ DATOS LÍNEA BONIFICADA CORREGIDOS ============`
      );
      logger.error(`🎁 CANTIDAD_BONIFICAD: ${transformed.CANTIDAD_BONIFICAD}`);
      logger.error(
        `🎁 CANTIDAD_PEDIDA: ${transformed.CANTIDAD_PEDIDA} (debe ser null)`
      );
      logger.error(
        `🎁 CANTIDAD_A_FACTURA: ${transformed.CANTIDAD_A_FACTURA} (debe ser null)`
      );
      logger.error(`🎁 PEDIDO_LINEA_BONIF: ${transformed.PEDIDO_LINEA_BONIF}`);
      logger.error(
        `🎁 DATOS FINALES BONIFICACIÓN: ${JSON.stringify(
          {
            CANTIDAD_BONIFICAD: transformed.CANTIDAD_BONIFICAD,
            CANTIDAD_PEDIDA: transformed.CANTIDAD_PEDIDA,
            CANTIDAD_A_FACTURA: transformed.CANTIDAD_A_FACTURA,
            PEDIDO_LINEA_BONIF: transformed.PEDIDO_LINEA_BONIF,
          },
          null,
          2
        )}`
      );

      return transformed;
    } catch (error) {
      logger.error(
        `🎁 ❌ Error transformando línea bonificada: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Transforma línea que dispara promoción - CORREGIDO
   * @param {Object} triggerLine - Línea que dispara promoción
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformTriggerLine(triggerLine, fieldConfig) {
    try {
      const lineNumber = this.extractValue(
        triggerLine,
        fieldConfig.lineNumberField
      );
      const articleCode = this.extractValue(
        triggerLine,
        fieldConfig.articleField
      );
      const quantity = this.extractValue(
        triggerLine,
        fieldConfig.quantityField
      );

      logger.error(`🎯 ============ TRANSFORMANDO LÍNEA TRIGGER ============`);
      logger.error(`🎯 Línea: ${lineNumber} | Artículo: ${articleCode}`);
      logger.error(`🎯 Cantidad: ${quantity}`);

      // ✅ CREAR TRANSFORMACIÓN CORRECTA PARA LÍNEA TRIGGER
      const transformed = {
        ...triggerLine,

        // ✅ CAMPOS CORRECTOS PARA LÍNEA TRIGGER (NORMAL)
        CANTIDAD_PEDIDA: this.parseNumericValue(quantity), // ✅ Cantidad real
        CANTIDAD_A_FACTURA: this.parseNumericValue(quantity), // ✅ Cantidad real
        CANTIDAD_FACTURADA: 0,
        CANTIDAD_RESERVADA: 0,
        CANTIDAD_CANCELADA: 0,

        // ✅ CAMPOS QUE DEBEN SER NULL PARA LÍNEAS NORMALES
        PEDIDO_LINEA_BONIF: null, // ❌ Era: valor
        CANTIDAD_BONIFICAD: null, // ❌ Era: valor

        // ✅ NO agregar campos duplicados/incorrectos

        // Metadatos
        _IS_TRIGGER_LINE: true,
        _PROMOTION_TYPE: "TRIGGER",
        _ORIGINAL_LINE_NUMBER: lineNumber,
      };

      // ✅ FORZAR CAMPOS A null SI VIENEN CON VALORES INCORRECTOS
      if (transformed.PEDIDO_LINEA_BONIF !== null) {
        logger.warn(
          `🎯 ⚠️ CORRIGIENDO PEDIDO_LINEA_BONIF de ${transformed.PEDIDO_LINEA_BONIF} a null`
        );
        transformed.PEDIDO_LINEA_BONIF = null;
      }

      if (transformed.CANTIDAD_BONIFICAD !== null) {
        logger.warn(
          `🎯 ⚠️ CORRIGIENDO CANTIDAD_BONIFICAD de ${transformed.CANTIDAD_BONIFICAD} a null`
        );
        transformed.CANTIDAD_BONIFICAD = null;
      }

      // ✅ LIMPIAR DATOS PROBLEMÁTICOS
      this.cleanTransformedData(transformed);

      // ✅ LOG DETALLADO DE DATOS CORRECTOS
      logger.error(
        `🎯 ============ DATOS LÍNEA TRIGGER CORREGIDOS ============`
      );
      logger.error(`🎯 CANTIDAD_PEDIDA: ${transformed.CANTIDAD_PEDIDA}`);
      logger.error(`🎯 CANTIDAD_A_FACTURA: ${transformed.CANTIDAD_A_FACTURA}`);
      logger.error(
        `🎯 CANTIDAD_BONIFICAD: ${transformed.CANTIDAD_BONIFICAD} (debe ser null)`
      );
      logger.error(
        `🎯 PEDIDO_LINEA_BONIF: ${transformed.PEDIDO_LINEA_BONIF} (debe ser null)`
      );
      logger.error(
        `🎯 DATOS FINALES TRIGGER: ${JSON.stringify(
          {
            CANTIDAD_PEDIDA: transformed.CANTIDAD_PEDIDA,
            CANTIDAD_A_FACTURA: transformed.CANTIDAD_A_FACTURA,
            CANTIDAD_BONIFICAD: transformed.CANTIDAD_BONIFICAD,
            PEDIDO_LINEA_BONIF: transformed.PEDIDO_LINEA_BONIF,
          },
          null,
          2
        )}`
      );

      return transformed;
    } catch (error) {
      logger.error(`🎯 ❌ Error transformando línea trigger: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transforma línea bonificada - MÉTODO ORIGINAL MANTENIDO COMO FALLBACK
   * @param {Object} bonusLine - Línea bonificada
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas para referencias
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, lineMap) {
    // Usar el nuevo método con índice 0 como fallback
    return this.transformBonusLineWithIndex(
      bonusLine,
      fieldConfig,
      lineMap,
      0,
      []
    );
  }

  /**
   * Transforma línea bonificada con búsqueda de línea trigger más cercana - NUEVO MÉTODO
   * @param {Object} bonusLine - Línea bonificada
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Object} lineMap - Mapa de líneas para referencias (ahora con arrays)
   * @param {number} bonusLineIndex - Índice de la línea bonificada en el array original
   * @param {Array} originalData - Array completo de datos originales
   * @returns {Object} - Línea transformada
   */
  static transformBonusLineWithIndex(
    bonusLine,
    fieldConfig,
    lineMap,
    bonusLineIndex,
    originalData
  ) {
    try {
      const referenceArticle = this.extractValue(
        bonusLine,
        fieldConfig.referenceField
      );
      const lineNumber = this.extractValue(
        bonusLine,
        fieldConfig.lineNumberField
      );
      const articleCode = this.extractValue(
        bonusLine,
        fieldConfig.articleField
      );
      const bonusQuantity = this.extractValue(
        bonusLine,
        fieldConfig.quantityField
      );

      // ✅ NUEVO: Buscar línea trigger más cercana hacia atrás
      let referenceLineNumber = null;

      if (referenceArticle && lineMap[referenceArticle]) {
        const triggerLines = lineMap[referenceArticle];

        logger.debug(
          `🎁 Buscando línea trigger para artículo ${referenceArticle}. Disponibles: ${triggerLines.length} líneas`
        );

        // Filtrar líneas que están ANTES de la línea de bonificación
        const eligibleTriggerLines = triggerLines.filter(
          (tLine) => tLine._originalIndex < bonusLineIndex
        );

        logger.debug(
          `🎁 Líneas trigger elegibles (antes de índice ${bonusLineIndex}): ${eligibleTriggerLines.length}`
        );

        if (eligibleTriggerLines.length > 0) {
          // Tomar la línea trigger más cercana (mayor índice menor al de bonificación)
          const closestTriggerLine = eligibleTriggerLines.reduce(
            (closest, current) =>
              current._originalIndex > closest._originalIndex
                ? current
                : closest
          );

          referenceLineNumber = closestTriggerLine.lineNumber;

          logger.error(
            `🎁 ✅ Línea trigger más cercana encontrada: línea ${referenceLineNumber} (artículo ${referenceArticle}, índice ${closestTriggerLine._originalIndex}) dispara bonificación línea ${lineNumber} (índice ${bonusLineIndex})`
          );
        } else {
          logger.warn(
            `🎁 ❌ NO hay líneas trigger de artículo ${referenceArticle} ANTES de la línea bonificación ${lineNumber} (índice ${bonusLineIndex})`
          );

          // Como fallback, usar la primera línea trigger disponible
          if (triggerLines.length > 0) {
            referenceLineNumber = triggerLines[0].lineNumber;
            logger.warn(
              `🎁 ⚠️ Usando primera línea trigger disponible como fallback: línea ${referenceLineNumber}`
            );
          } else {
            referenceLineNumber = 1; // Fallback absoluto
            logger.warn(`🎁 ⚠️ Usando fallback absoluto: línea 1`);
          }
        }
      } else {
        logger.warn(
          `🎁 ⚠️ No se encontró ninguna línea trigger para artículo ${referenceArticle}`
        );
        logger.error(
          `🎁 Artículos disponibles en lineMap: ${Object.keys(lineMap).join(
            ", "
          )}`
        );
        referenceLineNumber = 1; // Fallback
      }

      logger.error(
        `🎁 ============ TRANSFORMANDO LÍNEA BONIFICADA ============`
      );
      logger.error(
        `🎁 Línea: ${lineNumber} (índice ${bonusLineIndex}) | Artículo: ${articleCode}`
      );
      logger.error(
        `🎁 Referencia: ${referenceArticle} -> línea ${referenceLineNumber}`
      );
      logger.error(`🎁 Cantidad bonificada: ${bonusQuantity}`);

      // ✅ CREAR TRANSFORMACIÓN CORRECTA PARA LÍNEA BONIFICADA
      const transformed = {
        ...bonusLine,

        // ✅ CAMPOS CORRECTOS PARA LÍNEA BONIFICADA
        PEDIDO_LINEA_BONIF: referenceLineNumber, // ✅ Referencia a línea trigger más cercana
        CANTIDAD_BONIFICAD: this.parseNumericValue(bonusQuantity), // ✅ Cantidad bonificada

        // ✅ CAMPOS QUE DEBEN SER NULL PARA LÍNEAS BONIFICADAS
        CANTIDAD_PEDIDA: null,
        CANTIDAD_A_FACTURA: null,
        CANTIDAD_FACTURADA: 0,
        CANTIDAD_RESERVADA: 0,
        CANTIDAD_CANCELADA: 0,

        // Metadatos para debugging
        _IS_BONUS_LINE: true,
        _REFERENCE_ARTICLE: referenceArticle,
        _REFERENCE_LINE_NUMBER: referenceLineNumber,
        _PROMOTION_TYPE: "BONUS",
        _ORIGINAL_LINE_NUMBER: lineNumber,
        _BONUS_LINE_INDEX: bonusLineIndex,
      };

      // ✅ LIMPIAR DATOS PROBLEMÁTICOS
      this.cleanTransformedData(transformed);

      // ✅ LOG DETALLADO DE DATOS CORRECTOS
      logger.error(
        `🎁 ============ DATOS LÍNEA BONIFICADA CORREGIDOS ============`
      );
      logger.error(`🎁 CANTIDAD_BONIFICAD: ${transformed.CANTIDAD_BONIFICAD}`);
      logger.error(
        `🎁 CANTIDAD_PEDIDA: ${transformed.CANTIDAD_PEDIDA} (debe ser null)`
      );
      logger.error(
        `🎁 CANTIDAD_A_FACTURA: ${transformed.CANTIDAD_A_FACTURA} (debe ser null)`
      );
      logger.error(`🎁 PEDIDO_LINEA_BONIF: ${transformed.PEDIDO_LINEA_BONIF}`);
      logger.error(
        `🎁 DATOS FINALES BONIFICACIÓN: ${JSON.stringify(
          {
            CANTIDAD_BONIFICAD: transformed.CANTIDAD_BONIFICAD,
            CANTIDAD_PEDIDA: transformed.CANTIDAD_PEDIDA,
            CANTIDAD_A_FACTURA: transformed.CANTIDAD_A_FACTURA,
            PEDIDO_LINEA_BONIF: transformed.PEDIDO_LINEA_BONIF,
          },
          null,
          2
        )}`
      );

      return transformed;
    } catch (error) {
      logger.error(
        `🎁 ❌ Error transformando línea bonificada: ${error.message}`
      );
      throw error;
    }
  }

  // ===============================
  // 4. MÉTODOS DE EXTRACCIÓN Y LIMPIEZA DE DATOS
  // ===============================

  /**
   * ✅ NUEVO: Extrae valor real de configuración de campo o datos directos
   * @param {Object} data - Datos de la fila
   * @param {string|Object} fieldConfig - Configuración del campo
   * @returns {*} - Valor extraído
   */
  static extractValue(data, fieldConfig) {
    if (!fieldConfig) {
      return null;
    }

    // Si es string simple, buscar directamente
    if (typeof fieldConfig === "string") {
      return data[fieldConfig];
    }

    // Si es objeto de configuración, extraer correctamente
    if (typeof fieldConfig === "object" && fieldConfig.sourceField) {
      let value = data[fieldConfig.sourceField];

      // ✅ APLICAR CONVERSIONES SI ESTÁN CONFIGURADAS
      if (fieldConfig.unitConversion?.enabled && typeof value === "number") {
        value = this.applyUnitConversion(value, fieldConfig.unitConversion);
      }

      // ✅ USAR VALOR POR DEFECTO SI NO HAY VALOR
      if (
        (value === null || value === undefined) &&
        fieldConfig.defaultValue !== undefined
      ) {
        value = fieldConfig.defaultValue;
      }

      return value;
    }

    // Si es valor directo
    return fieldConfig;
  }

  /**
   * ✅ NUEVO: Convierte valor a numérico de manera segura
   * @param {*} value - Valor a convertir
   * @returns {number|null} - Valor numérico o null
   */
  static parseNumericValue(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return isNaN(value) ? null : value;
    }

    if (typeof value === "string") {
      const numericValue = parseFloat(value);
      return isNaN(numericValue) ? null : numericValue;
    }

    return null;
  }

  /**
   * ✅ NUEVO: Aplica conversión de unidades de manera segura
   * @param {number} value - Valor a convertir
   * @param {Object} conversion - Configuración de conversión
   * @returns {number} - Valor convertido
   */
  static applyUnitConversion(value, conversion) {
    if (!conversion.enabled || typeof value !== "number" || isNaN(value)) {
      return value;
    }

    try {
      const factor = conversion.factor || 1;

      switch (conversion.operation) {
        case "multiply":
          return value * factor;
        case "divide":
          return factor !== 0 ? value / factor : value;
        default:
          return value;
      }
    } catch (error) {
      logger.warn(`🎁 Error en conversión de unidades: ${error.message}`);
      return value;
    }
  }

  /**
   * ✅ NUEVO: Limpia datos transformados de objetos problemáticos
   * @param {Object} transformed - Datos transformados
   */
  static cleanTransformedData(transformed) {
    // ✅ ELIMINAR CAMPOS PROBLEMÁTICOS CONOCIDOS
    const problematicFields = [
      "CANTIDAD",
      "QTY",
      "CANTIDAD_BONIF", // ❌ Campo incorrecto
      "CANTIDAD_A_FACTURAR", // ❌ Duplicado de CANTIDAD_A_FACTURA
    ];

    problematicFields.forEach((field) => {
      if (transformed.hasOwnProperty(field)) {
        logger.warn(
          `🧹 Removiendo campo problemático: ${field} = ${transformed[field]}`
        );
        delete transformed[field];
      }
    });

    // ✅ LIMPIAR OBJETOS DE CONFIGURACIÓN
    Object.keys(transformed).forEach((key) => {
      const value = transformed[key];

      if (
        typeof value === "object" &&
        value !== null &&
        value.sourceField &&
        value.targetField
      ) {
        logger.warn(`🧹 Removiendo objeto de configuración: ${key}`);
        delete transformed[key];
      }

      if (value === undefined) {
        transformed[key] = null;
      }
    });

    logger.error(
      `🧹 DATOS DESPUÉS DE LIMPIEZA: ${JSON.stringify(transformed, null, 2)}`
    );
  }

  // ===============================
  // 5. MÉTODOS DE CONFIGURACIÓN
  // ===============================

  /**
   * Obtiene configuración de campos de promociones - MEJORADO
   * @param {Object} mapping - Configuración de mapping
   * @returns {Object} - Configuración de campos
   */
  static getFieldConfiguration(mapping) {
    const defaultConfig = {
      // Campos de detección
      bonusField: "ART_BON",
      bonusIndicatorValue: "B",
      referenceField: "COD_ART_RFR",
      discountField: "MON_DSC",
      lineNumberField: "NUM_LN",
      articleField: "COD_ART",
      quantityField: "CNT_MAX",

      // Campos destino
      bonusLineRef: "PEDIDO_LINEA_BONIF",
      orderedQuantity: "CANTIDAD_PEDIDA",
      invoiceQuantity: "CANTIDAD_A_FACTURA",
      bonusQuantity: "CANTIDAD_BONIFICAD",
    };

    // ✅ COMBINAR CON CONFIGURACIÓN DEL MAPPING
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
   * Determina si se deben usar promociones para este mapping
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si se deben usar promociones
   */
  static shouldUsePromotions(mapping) {
    try {
      // 1. Verificar si las promociones están habilitadas
      if (!mapping.promotionConfig?.enabled) {
        logger.debug("🎁 Promociones deshabilitadas en configuración");
        return false;
      }

      // 2. Validar configuración de promociones
      if (!this.validatePromotionConfig(mapping)) {
        logger.debug("🎁 Configuración de promociones inválida");
        return false;
      }

      // 3. Verificar que existan tablas de detalle
      const detailTables =
        mapping.tableConfigs?.filter((tc) => tc.isDetailTable) || [];
      if (detailTables.length === 0) {
        logger.debug("🎁 No hay tablas de detalle configuradas");
        return false;
      }

      logger.info("🎁 ✅ Condiciones para promociones cumplidas");
      return true;
    } catch (error) {
      logger.error(`🎁 Error verificando promociones: ${error.message}`);
      return false;
    }
  }

  // ===============================
  // 6. MÉTODOS DE REGLAS Y APLICACIÓN
  // ===============================

  /**
   * Aplica reglas específicas de promoción
   * @param {Array} data - Datos procesados
   * @param {Object} promotionConfig - Configuración de promociones
   * @returns {Array} - Datos con reglas aplicadas
   */
  static applyPromotionRules(data, promotionConfig) {
    if (!promotionConfig?.rules || promotionConfig.rules.length === 0) {
      logger.debug("🎁 No hay reglas específicas de promoción configuradas");
      return data;
    }

    logger.info(
      `🎁 Aplicando ${promotionConfig.rules.length} reglas de promoción`
    );

    let processedData = [...data];

    promotionConfig.rules.forEach((rule, index) => {
      if (rule.enabled) {
        try {
          logger.debug(
            `🎁 Aplicando regla ${index + 1}: ${rule.name} (${rule.type})`
          );
          processedData = this.applyRule(processedData, rule);
        } catch (ruleError) {
          logger.error(
            `🎁 ❌ Error aplicando regla ${rule.name}: ${ruleError.message}`
          );
        }
      }
    });

    return processedData;
  }

  /**
   * Aplica una regla específica de promoción
   * @param {Array} data - Datos a procesar
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos con regla aplicada
   */
  static applyRule(data, rule) {
    try {
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
          logger.warn(`🎁 Tipo de regla no soportado: ${rule.type}`);
          return data;
      }
    } catch (error) {
      logger.error(`🎁 Error aplicando regla ${rule.type}: ${error.message}`);
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
    logger.debug(`🎁 Aplicando regla de descuento por familia: ${rule.name}`);
    // Implementar lógica específica según necesidades
    return data;
  }

  /**
   * Aplica regla de bonificación por cantidad
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyQuantityBonusRule(data, rule) {
    logger.debug(
      `🎁 Aplicando regla de bonificación por cantidad: ${rule.name}`
    );
    // Implementar lógica específica según necesidades
    return data;
  }

  /**
   * Aplica regla de bonificación escalada
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyScaledBonusRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de bonificación escalada: ${rule.name}`);
    // Implementar lógica específica según necesidades
    return data;
  }

  /**
   * Aplica regla de bonificación por producto
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyProductBonusRule(data, rule) {
    logger.debug(
      `🎁 Aplicando regla de bonificación por producto: ${rule.name}`
    );
    // Implementar lógica específica según necesidades
    return data;
  }

  /**
   * Aplica regla de descuento en factura
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyInvoiceDiscountRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de descuento en factura: ${rule.name}`);
    // Implementar lógica específica según necesidades
    return data;
  }

  /**
   * Aplica regla de oferta única
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyOneTimeOfferRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de oferta única: ${rule.name}`);
    // Implementar lógica específica según necesidades
    return data;
  }

  // ===============================
  // 7. MÉTODOS DE UTILIDADES Y DEBUGGING
  // ===============================

  /**
   * Obtiene estadísticas de procesamiento de promociones
   * @param {Array} processedData - Datos procesados
   * @returns {Object} - Estadísticas
   */
  static getProcessingStats(processedData) {
    const stats = {
      total: processedData.length,
      bonusLines: processedData.filter((line) => line._IS_BONUS_LINE).length,
      triggerLines: processedData.filter((line) => line._IS_TRIGGER_LINE)
        .length,
      normalLines: processedData.filter((line) => line._IS_NORMAL_LINE).length,
      promotionTypes: {},
    };

    // Contar tipos de promoción
    processedData.forEach((line) => {
      const type = line._PROMOTION_TYPE || "UNKNOWN";
      stats.promotionTypes[type] = (stats.promotionTypes[type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Valida datos después del procesamiento
   * @param {Array} processedData - Datos procesados
   * @returns {Object} - Resultado de validación
   */
  static validateProcessedData(processedData) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    processedData.forEach((line, index) => {
      // Validar que las líneas bonificadas tengan referencia
      if (line._IS_BONUS_LINE && !line.PEDIDO_LINEA_BONIF) {
        validation.errors.push(
          `Línea ${index + 1}: Bonificación sin referencia`
        );
        validation.isValid = false;
      }

      // Validar que los valores numéricos sean válidos
      const numericFields = [
        "CANTIDAD_PEDIDA",
        "CANTIDAD_A_FACTURA",
        "CANTIDAD_BONIFICAD",
      ];
      numericFields.forEach((field) => {
        if (line[field] !== null && line[field] !== undefined) {
          if (isNaN(parseFloat(line[field]))) {
            validation.warnings.push(
              `Línea ${index + 1}: ${field} no es numérico`
            );
          }
        }
      });
    });

    return validation;
  }

  /**
   * Genera reporte de procesamiento de promociones
   * @param {Array} originalData - Datos originales
   * @param {Array} processedData - Datos procesados
   * @returns {Object} - Reporte detallado
   */
  static generateProcessingReport(originalData, processedData) {
    const originalStats = {
      total: originalData.length,
    };

    const processedStats = this.getProcessingStats(processedData);
    const validation = this.validateProcessedData(processedData);

    return {
      timestamp: new Date().toISOString(),
      original: originalStats,
      processed: processedStats,
      validation,
      summary: {
        promotionsApplied: processedStats.bonusLines > 0,
        totalPromotions: processedStats.bonusLines,
        isValid: validation.isValid,
        hasWarnings: validation.warnings.length > 0,
      },
    };
  }
}

module.exports = PromotionProcessor;
