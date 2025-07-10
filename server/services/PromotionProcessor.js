const logger = require("./logger");

/**
 * Procesador de Promociones - Versión Corregida y Mejorada
 * Maneja la detección, transformación y aplicación de promociones automáticamente
 * CORRIGE: Asignación correcta de líneas de referencia para productos bonus
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

      // ✅ CORREGIDO: Crear mapa de líneas ordenado por número de línea
      const sortedData = [...data].sort((a, b) => {
        const lineA = this.extractValue(
          a,
          effectiveFieldConfig.lineNumberField
        );
        const lineB = this.extractValue(
          b,
          effectiveFieldConfig.lineNumberField
        );
        return (lineA || 0) - (lineB || 0);
      });

      logger.info(
        `🎁 Datos ordenados por línea: ${sortedData.length} registros`
      );

      // Procesar líneas según su tipo
      const processedData = sortedData.map((row, index) => {
        try {
          const lineType = this.detectLineType(row, effectiveFieldConfig);

          logger.debug(`🎁 Procesando línea ${index + 1}: tipo ${lineType}`);

          switch (lineType) {
            case "BONUS":
              return this.transformBonusLine(
                row,
                effectiveFieldConfig,
                sortedData // ✅ CORREGIDO: Pasar todos los datos ordenados
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
   * ✅ CORREGIDO: Transforma línea bonificada con lógica correcta de asignación de línea de referencia
   * @param {Object} bonusLine - Línea bonificada
   * @param {Object} fieldConfig - Configuración de campos
   * @param {Array} allSortedData - Todos los datos ordenados por línea
   * @returns {Object} - Línea transformada
   */
  static transformBonusLine(bonusLine, fieldConfig, allSortedData) {
    try {
      const referenceArticle = this.extractValue(
        bonusLine,
        fieldConfig.referenceField
      );
      const currentLineNumber = this.extractValue(
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

      logger.error(
        `🎁 ============ TRANSFORMANDO LÍNEA BONIFICADA ============`
      );
      logger.error(
        `🎁 Línea BONUS: ${currentLineNumber} | Artículo: ${articleCode}`
      );
      logger.error(`🎁 Busca referencia a artículo: ${referenceArticle}`);

      // ✅ NUEVA LÓGICA: Buscar la línea trigger más cercana
      const referenceLineNumber = this.findBestTriggerLine(
        referenceArticle,
        currentLineNumber,
        allSortedData,
        fieldConfig
      );

      logger.error(
        `🎁 ✅ LÍNEA TRIGGER ENCONTRADA: línea ${referenceLineNumber} (artículo ${referenceArticle})`
      );

      // ✅ CREAR TRANSFORMACIÓN CORRECTA PARA LÍNEA BONIFICADA
      const transformed = {
        ...bonusLine,

        // ✅ CAMPOS CORRECTOS PARA LÍNEA BONIFICADA
        PEDIDO_LINEA_BONIF: referenceLineNumber, // ✅ Referencia a línea trigger correcta
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

      return transformed;
    } catch (error) {
      logger.error(
        `🎁 ❌ Error transformando línea bonificada: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Encuentra la línea trigger más apropiada para una línea bonus
   * @param {string} referenceArticle - Artículo de referencia
   * @param {number} currentLineNumber - Número de línea actual (bonus)
   * @param {Array} allSortedData - Todos los datos ordenados
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {number} - Número de línea trigger encontrada
   */
  static findBestTriggerLine(
    referenceArticle,
    currentLineNumber,
    allSortedData,
    fieldConfig
  ) {
    logger.error(`🎯 BUSCANDO LÍNEA TRIGGER PARA:`);
    logger.error(`🎯   Artículo referencia: ${referenceArticle}`);
    logger.error(`🎯   Línea bonus actual: ${currentLineNumber}`);

    // ✅ ESTRATEGIA 1: Buscar hacia arriba (líneas anteriores)
    const linesAbove = allSortedData.filter((line) => {
      const lineNumber = this.extractValue(line, fieldConfig.lineNumberField);
      const articleCode = this.extractValue(line, fieldConfig.articleField);
      const bonusField = this.extractValue(line, fieldConfig.bonusField);

      return (
        lineNumber < currentLineNumber &&
        articleCode === referenceArticle &&
        (bonusField === 0 || bonusField === null || bonusField === "")
      );
    });

    if (linesAbove.length > 0) {
      // Tomar la línea más cercana hacia arriba
      const closestAbove = linesAbove[linesAbove.length - 1];
      const lineNumber = this.extractValue(
        closestAbove,
        fieldConfig.lineNumberField
      );
      logger.error(`🎯 ✅ ENCONTRADA línea trigger ARRIBA: ${lineNumber}`);
      return lineNumber;
    }

    // ✅ ESTRATEGIA 2: Buscar hacia abajo (líneas posteriores)
    const linesBelow = allSortedData.filter((line) => {
      const lineNumber = this.extractValue(line, fieldConfig.lineNumberField);
      const articleCode = this.extractValue(line, fieldConfig.articleField);
      const bonusField = this.extractValue(line, fieldConfig.bonusField);

      return (
        lineNumber > currentLineNumber &&
        articleCode === referenceArticle &&
        (bonusField === 0 || bonusField === null || bonusField === "")
      );
    });

    if (linesBelow.length > 0) {
      // Tomar la línea más cercana hacia abajo
      const closestBelow = linesBelow[0];
      const lineNumber = this.extractValue(
        closestBelow,
        fieldConfig.lineNumberField
      );
      logger.error(`🎯 ✅ ENCONTRADA línea trigger ABAJO: ${lineNumber}`);
      return lineNumber;
    }

    // ✅ ESTRATEGIA 3: Fallback - buscar cualquier línea con el artículo
    const anyLine = allSortedData.find((line) => {
      const articleCode = this.extractValue(line, fieldConfig.articleField);
      return articleCode === referenceArticle;
    });

    if (anyLine) {
      const lineNumber = this.extractValue(
        anyLine,
        fieldConfig.lineNumberField
      );
      logger.error(`🎯 ⚠️ FALLBACK - usando línea: ${lineNumber}`);
      return lineNumber;
    }

    // ✅ ÚLTIMO RECURSO: Línea 1
    logger.error(`🎯 ❌ NO encontrada línea trigger, usando línea 1`);
    return 1;
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
        PEDIDO_LINEA_BONIF: null,
        CANTIDAD_BONIFICAD: null,

        // Metadatos
        _IS_TRIGGER_LINE: true,
        _PROMOTION_TYPE: "TRIGGER",
      };

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

      return transformed;
    } catch (error) {
      logger.error(`🎯 ❌ Error transformando línea trigger: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transforma línea normal sin promoción - CORREGIDO
   * @param {Object} normalLine - Línea normal
   * @param {Object} fieldConfig - Configuración de campos
   * @returns {Object} - Línea transformada
   */
  static transformNormalLine(normalLine, fieldConfig) {
    try {
      const quantity = this.extractValue(
        normalLine,
        fieldConfig.quantityField || "CNT_MAX"
      );

      // ✅ CREAR TRANSFORMACIÓN ESTÁNDAR
      const transformed = {
        ...normalLine,

        // ✅ CAMPOS ESTÁNDAR CON VALORES REALES
        [fieldConfig.bonusLineRef || "PEDIDO_LINEA_BONIF"]: null,
        [fieldConfig.orderedQuantity || "CANTIDAD_PEDIDA"]:
          this.parseNumericValue(quantity),
        [fieldConfig.invoiceQuantity || "CANTIDAD_A_FACTURA"]:
          this.parseNumericValue(quantity),
        [fieldConfig.bonusQuantity || "CANTIDAD_BONIFICAD"]: null,

        // ✅ CAMPOS ESPECÍFICOS ADICIONALES
        PEDIDO_LINEA_BONIF: null,
        CANTIDAD_PEDIDA: this.parseNumericValue(quantity),
        CANTIDAD_A_FACTURA: this.parseNumericValue(quantity),
        CANTIDAD_BONIFICAD: null,
        CANTIDAD_BONIF: null,

        // Metadatos
        _IS_NORMAL_LINE: true,
        _PROMOTION_TYPE: "NONE",
      };

      // ✅ LIMPIAR DATOS PROBLEMÁTICOS
      this.cleanTransformedData(transformed);

      return transformed;
    } catch (error) {
      logger.error(`🎁 ❌ Error transformando línea normal: ${error.message}`);
      logger.error(`🎁 Datos de línea: ${JSON.stringify(normalLine, null, 2)}`);
      // Devolver línea original si hay error
      return { ...normalLine, _IS_NORMAL_LINE: true, _PROMOTION_TYPE: "NONE" };
    }
  }

  // ===============================
  // 4. MÉTODOS DE EXTRACCIÓN Y LIMPIEZA DE DATOS
  // ===============================

  /**
   * ✅ MEJORADO: Extrae valor real de configuración de campo o datos directos
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
   * ✅ MEJORADO: Convierte valor a numérico de manera segura
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
   * ✅ MEJORADO: Aplica conversión de unidades de manera segura y completa
   * @param {number} value - Valor a convertir
   * @param {Object} conversion - Configuración de conversión
   * @returns {number} - Valor convertido
   */
  static applyUnitConversion(value, conversion) {
    if (
      !conversion ||
      !conversion.enabled ||
      typeof value !== "number" ||
      isNaN(value)
    ) {
      return value;
    }

    try {
      let factor = conversion.factor || 1;

      // Si hay campo de factor dinámico, usar ese valor
      if (conversion.conversionFactorField && conversion.sourceData) {
        const dynamicFactor =
          conversion.sourceData[conversion.conversionFactorField];
        if (dynamicFactor !== undefined && dynamicFactor !== null) {
          factor = parseFloat(dynamicFactor);
          if (isNaN(factor)) {
            logger.warn(
              `🔧 Factor de conversión inválido: ${dynamicFactor}, usando factor por defecto`
            );
            factor = conversion.factor || 1;
          }
        }
      }

      let convertedValue = value;

      switch (conversion.operation) {
        case "multiply":
          convertedValue = value * factor;
          break;
        case "divide":
          convertedValue = factor !== 0 ? value / factor : value;
          break;
        case "add":
          convertedValue = value + factor;
          break;
        case "subtract":
          convertedValue = value - factor;
          break;
        default:
          convertedValue = value;
      }

      // Aplicar redondeo si está configurado
      if (conversion.decimalPlaces !== undefined) {
        convertedValue = parseFloat(
          convertedValue.toFixed(conversion.decimalPlaces)
        );
      }

      logger.debug(
        `🔧 Conversión aplicada: ${value} ${conversion.operation} ${factor} = ${convertedValue}`
      );

      return convertedValue;
    } catch (error) {
      logger.warn(`🎁 Error en conversión de unidades: ${error.message}`);
      return value;
    }
  }

  /**
   * ✅ MEJORADO: Limpia datos transformados de objetos problemáticos
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

    logger.debug(`🧹 Datos limpiados para inserción`);
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
