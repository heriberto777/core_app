const logger = require("./logger");

/**
 * Procesador de Promociones - Versión Completa y Mejorada
 * Maneja la detección, transformación y aplicación de promociones automáticamente
 * INCLUYE: Conversiones de cantidades, referencias de líneas, y lógica de bonificación completa
 */
class PromotionProcessor {
  // ===============================
  // 1. MÉTODOS PRINCIPALES DE PROCESAMIENTO
  // ===============================

  /**
   * Procesa datos con promociones automáticamente - MÉTODO PRINCIPAL MEJORADO
   * @param {Array} data - Datos a procesar
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} fieldConfig - Configuración de campos (opcional, detectada automáticamente)
   * @returns {Array} - Datos procesados con promociones
   */
  static processPromotionsWithConfig(data, mapping, fieldConfig = null) {
    try {
      logger.info("🎁 INICIANDO PROCESAMIENTO DE PROMOCIONES MEJORADO");

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

      // // ✅ PASO 1: APLICAR CONVERSIONES DE CANTIDAD A TODOS LOS DATOS
      // logger.info("🔧 Aplicando conversiones de cantidades...");
      // let processedData = data.map((row) => {
      //   return this.applyQuantityConversions(row, effectiveFieldConfig);
      // });

      // ✅ CAMBIAR POR: Usar datos originales sin conversión
      logger.info("🎁 Procesando promociones sin conversión previa");
      let processedData = data.map((row) => ({ ...row }));

      // ✅ PASO 2: CONSTRUIR REFERENCIAS DE LÍNEAS
      logger.info("🔗 Construyendo referencias de líneas...");
      const lineReferences = this.buildLineReferences(
        processedData,
        effectiveFieldConfig
      );

      // ✅ PASO 3: PROCESAR CADA FILA CON PROMOCIONES
      logger.info("🎁 Procesando promociones por fila...");
      processedData = processedData.map((row) => {
        return this.processPromotionRow(
          row,
          processedData,
          effectiveFieldConfig,
          lineReferences
        );
      });

      // ✅ PASO 4: APLICAR REGLAS ESPECÍFICAS SI ESTÁN CONFIGURADAS
      if (
        mapping.promotionConfig?.rules &&
        mapping.promotionConfig.rules.length > 0
      ) {
        logger.info("📏 Aplicando reglas específicas de promociones...");
        processedData = this.applyPromotionRules(
          processedData,
          mapping.promotionConfig
        );
      }

      // ✅ PASO 5: LIMPIAR DATOS PROCESADOS
      processedData.forEach((row) => {
        this.cleanTransformedData(row);
      });

      // ✅ ESTADÍSTICAS FINALES
      const bonusLines = processedData.filter((line) => line._IS_BONUS_LINE);
      const triggerLines = processedData.filter(
        (line) => line._IS_TRIGGER_LINE
      );
      const regularLines = processedData.filter(
        (line) => !line._IS_BONUS_LINE && !line._IS_TRIGGER_LINE
      );

      logger.info(
        `🎁 ✅ Procesamiento completado: ${regularLines.length} regulares, ${bonusLines.length} bonificaciones, ${triggerLines.length} triggers`
      );

      return processedData;
    } catch (error) {
      logger.error(
        `🎁 Error en procesamiento de promociones: ${error.message}`
      );
      throw new Error(`Error procesando promociones: ${error.message}`);
    }
  }

  /**
   * ✅ NUEVO: Construye referencias entre líneas regulares y bonificaciones
   * @param {Array} allRows - Todas las filas de datos
   * @param {Object} config - Configuración de campos
   * @returns {Map} - Mapa de referencias línea -> NUM_LN
   */

  static buildLineReferences(allRows, config) {
    const lineReferences = new Map();
    const articleToLineMap = new Map(); // COD_ART -> NUM_LN

    logger.debug(`🎁 Construyendo mapa de referencias de líneas...`);

    // ✅ PRIMERA PASADA: Mapear códigos de artículo a números de línea
    allRows.forEach((row) => {
      const codArt = row[config.articleField]; // COD_ART
      const numLn = row[config.lineNumberField]; // NUM_LN

      if (codArt && numLn) {
        // Si ya existe el artículo, mantener una lista de líneas
        if (articleToLineMap.has(codArt)) {
          const existingLines = articleToLineMap.get(codArt);
          if (Array.isArray(existingLines)) {
            existingLines.push(numLn);
          } else {
            articleToLineMap.set(codArt, [existingLines, numLn]);
          }
        } else {
          articleToLineMap.set(codArt, numLn);
        }
      }
    });

    // ✅ SEGUNDA PASADA: Construir referencias para bonificaciones
    allRows.forEach((row) => {
      const artBon = row[config.bonusField]; // ART_BON
      const codArtRfr = row[config.referenceField]; // COD_ART_RFR
      const numLn = row[config.lineNumberField]; // NUM_LN

      if (artBon === "B" && codArtRfr) {
        // ✅ Buscar el NUM_LN del artículo de referencia
        let referencedLineNumber = null;

        if (articleToLineMap.has(codArtRfr)) {
          const lineRef = articleToLineMap.get(codArtRfr);

          // Si hay múltiples líneas para el mismo artículo, usar la primera
          if (Array.isArray(lineRef)) {
            referencedLineNumber = lineRef[0];
            logger.debug(
              `🎁 Múltiples líneas para ${codArtRfr}, usando línea ${referencedLineNumber}`
            );
          } else {
            referencedLineNumber = lineRef;
          }
        }

        if (referencedLineNumber) {
          lineReferences.set(numLn, referencedLineNumber);
          logger.debug(
            `🎁 Referencia creada: Línea ${numLn} -> Línea ${referencedLineNumber} (${codArtRfr})`
          );
        } else {
          logger.warn(
            `🎁 No se encontró línea de referencia para ${codArtRfr}`
          );
        }
      }
    });

    logger.debug(
      `🎁 Referencias de líneas construidas: ${lineReferences.size} referencias`
    );
    return lineReferences;
  }

  /**
   * ✅ MEJORADO: Identifica tipo de promoción con lógica más precisa
   * @param {Object} row - Fila de datos
   * @param {Object} config - Configuración de campos
   * @returns {string} - Tipo de promoción identificado
   */
  static identifyPromotionType(row, config) {
    const artBon = row[config.bonusField]; // ART_BON
    const codArtRfr = row[config.referenceField]; // COD_ART_RFR
    const cantidadBonifica =
      row["CANTIDAD_BONIFICAD"] || row["CANTIDAD_BONIFICADA"];
    const porDscAp = row["POR_DSC_AP"];
    const monDsc = row["MON_DSC"] || row[config.discountField];
    const codArt = row[config.articleField]; // COD_ART

    logger.debug(`🎁 Analizando línea para promoción:`, {
      artBon,
      codArtRfr,
      cantidadBonifica: cantidadBonifica || 0,
      porDscAp: porDscAp || 0,
      monDsc: monDsc || 0,
      codArt,
    });

    // ✅ CASO 1: Línea marcada como bonificación con ART_BON = 'B'
    if (artBon === "B" || artBon === config.bonusIndicatorValue) {
      // ✅ SUBCASO 1A: Bonificación real con cantidad
      if (cantidadBonifica && parseFloat(cantidadBonifica) > 0) {
        logger.debug(
          `🎁 Bonificación por cantidad detectada: ${cantidadBonifica}`
        );
        return "BONUS_QUANTITY";
      }

      // ✅ SUBCASO 1B: "Bonificación" que es realmente descuento (tratar como regular)
      if (
        (!cantidadBonifica || parseFloat(cantidadBonifica) === 0) &&
        ((porDscAp && parseFloat(porDscAp) > 0) ||
          (monDsc && parseFloat(monDsc) > 0))
      ) {
        logger.debug(
          `🎁 Línea con descuento (no bonificación real) - tratando como regular`
        );
        return "REGULAR_WITH_DISCOUNT";
      }

      // ✅ SUBCASO 1C: COD_ART_RFR hace referencia al mismo artículo
      if (codArtRfr === codArt) {
        logger.debug(`🎁 Bonificación del mismo producto detectada`);
        return "SELF_BONUS";
      }

      // ✅ SUBCASO 1D: COD_ART_RFR hace referencia a otro artículo
      if (codArtRfr && codArtRfr !== codArt) {
        logger.debug(
          `🎁 Bonificación cruzada detectada: ${codArtRfr} -> ${codArt}`
        );
        return "CROSS_BONUS";
      }

      logger.debug(`🎁 Bonificación genérica detectada`);
      return "BONUS_GENERIC";
    }

    // ✅ CASO 2: Línea regular
    logger.debug(`🎁 Línea regular detectada`);
    return "REGULAR";
  }

  /**
   * ✅ NUEVO: Procesa una fila individual aplicando toda la lógica de promociones
   * @param {Object} row - Fila de datos original
   * @param {Array} allRows - Todas las filas para referencias
   * @param {Object} config - Configuración de campos
   * @param {Map} lineReferences - Mapa de referencias de líneas
   * @returns {Object} - Fila procesada
   */
  static processPromotionRow(row, allRows, config, lineReferences) {
    try {
      // ✅ 1. Crear copia de la fila para no modificar original
      let processedRow = { ...row };

      // ✅ 2. Identificar tipo de promoción
      const promotionType = this.identifyPromotionType(processedRow, config);

      // ✅ 3. Procesar según tipo identificado
      switch (promotionType) {
        case "REGULAR_WITH_DISCOUNT":
          // Tratar como línea regular, mantener descuentos
          logger.debug(`🎁 Procesando como regular con descuento`);
          processedRow = this.processRegularLine(processedRow, config);
          processedRow._IS_REGULAR_WITH_DISCOUNT = true;
          break;

        case "BONUS_QUANTITY":
        case "SELF_BONUS":
        case "CROSS_BONUS":
        case "BONUS_GENERIC":
          // Procesar como bonificación real
          logger.debug(`🎁 Procesando bonificación tipo: ${promotionType}`);
          processedRow = this.processBonusLine(
            processedRow,
            config,
            lineReferences
          );
          break;

        case "REGULAR":
        default:
          // Línea regular sin promoción
          logger.debug(`🎁 Procesando línea regular`);
          processedRow = this.processRegularLine(processedRow, config);
          break;
      }

      // ✅ 4. Agregar metadatos de promoción
      processedRow._promotionType = promotionType;
      processedRow._processed = true;

      return processedRow;
    } catch (error) {
      logger.error(`🎁 Error procesando fila de promoción: ${error.message}`);
      return { ...row, _error: error.message };
    }
  }

  /**
   * ✅ NUEVO: Procesa línea regular (sin bonificación)
   * @param {Object} row - Fila de datos
   * @param {Object} config - Configuración de campos
   * @returns {Object} - Fila procesada
   */
  static processRegularLine(row, config) {
    const processedRow = { ...row };

    // ✅ Para líneas REGULARES, CNT_MAX va a CANTIDAD_PEDIDA
    const cantidadPedida = row["CNT_MAX"] || row["CANTIDAD_PEDIDA"] || 0;

    logger.info(`🔍 🔍 DEBUGGING LÍNEA REGULAR:`);
    logger.info(`🔍 🔍 CNT_MAX original: ${row["CNT_MAX"]}`);
    logger.info(`🔍 🔍 Cantidad pedida: ${cantidadPedida}`);

    // ✅ Establecer campos de promoción estándar para línea regular
    processedRow.PEDIDO_LINEA_BONIF = null;
    processedRow.CANTIDAD_BONIFICAD = 0;

    // ✅ Para líneas regulares, CNT_MAX es la cantidad pedida
    processedRow.CANTIDAD_PEDIDA = parseInt(cantidadPedida) || 0; // En cajas (se convertirá después)
    processedRow.CANTIDAD_A_FACTURA = parseInt(cantidadPedida) || 0; // En cajas (se convertirá después)

    // ✅ Marcar como línea regular
    processedRow._IS_BONUS_LINE = false;
    processedRow._IS_TRIGGER_LINE = false;

    // NUEVO: Identificar si es regular con descuento
    const hasDiscount =
      (row["MON_DSC"] && parseFloat(row["MON_DSC"]) > 0) ||
      (row["POR_DSC_AP"] && parseFloat(row["POR_DSC_AP"]) > 0);

    if (hasDiscount && row["ART_BON"] === "B") {
      processedRow._IS_REGULAR_WITH_DISCOUNT = true;
      logger.info(
        `LÍNEA REGULAR CON DESCUENTO detectada - mantiene cantidades normales`
      );
    }

    logger.info(
      `🔍 ✅ Línea regular procesada: ${
        processedRow[config.articleField]
      } - CANTIDAD_PEDIDA: ${processedRow.CANTIDAD_PEDIDA} cajas`
    );

    return processedRow;
  }

  /**
   * ✅ NUEVO: Procesa línea de bonificación
   * @param {Object} row - Fila de datos
   * @param {Object} config - Configuración de campos
   * @param {Map} lineReferences - Referencias de líneas
   * @returns {Object} - Fila procesada
   */
  static processBonusLine(row, config, lineReferences) {
    const processedRow = { ...row };
    const numLn = row[config.lineNumberField];

    // ✅ Establecer referencia de línea si existe
    if (lineReferences && lineReferences.has(numLn)) {
      processedRow.PEDIDO_LINEA_BONIF = lineReferences.get(numLn);
      logger.debug(
        `🎁 Referencia asignada: Línea ${numLn} -> Línea ${processedRow.PEDIDO_LINEA_BONIF}`
      );
    } else {
      processedRow.PEDIDO_LINEA_BONIF = null;
      logger.warn(
        `🎁 No se encontró referencia para línea de bonificación ${numLn}`
      );
    }

    // ✅ CORRECCIÓN CRÍTICA: Usar CNT_MAX para bonificaciones, NO para pedidos
     const cantidadBonifica = row["CNT_MAX"] || 0;

    // ✅ CAMPOS CORRECTOS PARA BONIFICACIONES
    processedRow.CANTIDAD_PEDIDA = 0; // ✅ Bonificaciones NO se piden
    processedRow.CANTIDAD_A_FACTURA = 0; // ✅ Bonificaciones NO se facturan
     processedRow.CANTIDAD_BONIFICAD = parseInt(cantidadBonifica) || 0;

    // ✅ Marcar como línea de bonificación
    processedRow._IS_BONUS_LINE = true;
    processedRow._IS_TRIGGER_LINE = false;
    processedRow._PROMOTION_TYPE = "BONUS";

    logger.debug(
      `🎁 Línea bonificación procesada CORRECTAMENTE: ${
        processedRow[config.articleField]
      } - CANTIDAD_BONIFICAD: ${processedRow.CANTIDAD_BONIFICAD}`
    );

    return processedRow;
  }

  // ===============================
  // 2. MÉTODOS DE VALIDACIÓN Y CONFIGURACIÓN
  // ===============================

  /**
   * Valida configuración de promociones
   * @param {Object} mapping - Configuración de mapping
   * @returns {boolean} - Si la configuración es válida
   */
  static validatePromotionConfig(mapping) {
    try {
      if (!mapping.promotionConfig) {
        logger.debug("🎁 No hay configuración de promociones");
        return false;
      }

      const config = mapping.promotionConfig;

      // Validaciones básicas
      if (!config.enabled) {
        logger.debug("🎁 Promociones deshabilitadas");
        return false;
      }

      // Validar campos requeridos si están definidos
      const requiredFields = ["bonusField", "referenceField", "articleField"];
      const missingFields = requiredFields.filter(
        (field) =>
          config.detectFields &&
          config.detectFields[field] &&
          !config.detectFields[field]
      );

      if (missingFields.length > 0) {
        logger.warn(
          `🎁 Campos requeridos faltantes en configuración: ${missingFields.join(
            ", "
          )}`
        );
        return false;
      }

      logger.debug("🎁 ✅ Configuración de promociones válida");
      return true;
    } catch (error) {
      logger.error(`🎁 Error validando configuración: ${error.message}`);
      return false;
    }
  }

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

  /**
   * Valida que los datos contengan campos requeridos para promociones
   * @param {Array} data - Datos a validar
   * @param {Object} config - Configuración de campos
   * @returns {boolean} - Si los datos son válidos para promociones
   */
  static validateDataFields(data, config) {
    if (!data || data.length === 0) {
      return false;
    }

    const firstRecord = data[0];
    const requiredFields = [
      config.bonusField,
      config.referenceField,
      config.articleField,
      config.lineNumberField,
    ];

    const missingFields = requiredFields.filter(
      (field) => !firstRecord.hasOwnProperty(field)
    );

    if (missingFields.length > 0) {
      logger.warn(
        `🎁 Campos requeridos faltantes en datos: ${missingFields.join(", ")}`
      );
      return false;
    }

    return true;
  }

  // ===============================
  // 3. MÉTODOS DE TRANSFORMACIÓN Y LIMPIEZA
  // ===============================

  /**
   * Transforma línea normal (sin promociones)
   * @param {Object} row - Fila de datos
   * @param {Object} config - Configuración
   * @returns {Object} - Fila transformada
   */
  static transformNormalLine(row, config) {
    const transformed = { ...row };

    // Establecer valores por defecto para campos de promoción
    transformed.PEDIDO_LINEA_BONIF = null;
    transformed.CANTIDAD_BONIFICAD = 0;

    // Asegurar cantidades básicas
    if (!transformed.CANTIDAD_PEDIDA && config.quantityField) {
      transformed.CANTIDAD_PEDIDA = transformed[config.quantityField] || 0;
    }

    if (!transformed.CANTIDAD_A_FACTURA) {
      transformed.CANTIDAD_A_FACTURA = transformed.CANTIDAD_PEDIDA || 0;
    }

    return transformed;
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

  // ===============================
  // 4. MÉTODOS DE REGLAS DE PROMOCIÓN
  // ===============================

  /**
   * Aplica reglas específicas de promociones
   * @param {Array} data - Datos procesados
   * @param {Object} promotionConfig - Configuración de promociones
   * @returns {Array} - Datos con reglas aplicadas
   */
  static applyPromotionRules(data, promotionConfig) {
    try {
      if (!promotionConfig.rules || promotionConfig.rules.length === 0) {
        logger.debug("🎁 No hay reglas específicas de promoción configuradas");
        return data;
      }

      logger.info(
        `🎁 Aplicando ${promotionConfig.rules.length} reglas de promoción`
      );

      let processedData = [...data];

      for (const rule of promotionConfig.rules) {
        if (rule.enabled !== false) {
          processedData = this.applyPromotionRule(processedData, rule);
        }
      }

      return processedData;
    } catch (error) {
      logger.error(`🎁 Error aplicando reglas de promoción: ${error.message}`);
      return data;
    }
  }

  /**
   * Aplica una regla específica de promoción
   * @param {Array} data - Datos
   * @param {Object} rule - Regla a aplicar
   * @returns {Array} - Datos procesados
   */
  static applyPromotionRule(data, rule) {
    try {
      logger.debug(`🎁 Aplicando regla: ${rule.name} (${rule.type})`);

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
        case "MINIMUM_QUANTITY":
          return this.applyMinimumQuantityRule(data, rule);
        case "PERCENTAGE_BONUS":
          return this.applyPercentageBonusRule(data, rule);
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

    return data.map((row) => {
      // Lógica específica para descuentos por familia
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const processedRow = { ...row };

        if (rule.actions?.discount) {
          const discount = parseFloat(rule.actions.discount);
          if (!isNaN(discount)) {
            processedRow.POR_DSC_AP = discount;
            processedRow._FAMILY_DISCOUNT_APPLIED = true;
            logger.debug(
              `🎁 Descuento familia aplicado: ${discount}% a ${row.COD_ART}`
            );
          }
        }

        return processedRow;
      }
      return row;
    });
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

    const enhancedData = [...data];

    data.forEach((row, index) => {
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const quantity = parseFloat(row.CANTIDAD_PEDIDA || row.CNT_MAX || 0);

        if (
          rule.actions?.bonusThreshold &&
          quantity >= rule.actions.bonusThreshold
        ) {
          const bonusQuantity =
            Math.floor(quantity / rule.actions.bonusThreshold) *
            (rule.actions.bonusAmount || 1);

          if (bonusQuantity > 0) {
            // Crear línea de bonificación
            const bonusLine = {
              ...row,
              ART_BON: "B",
              COD_ART_RFR: row.COD_ART,
              CANTIDAD_BONIFICAD: bonusQuantity,
              CANTIDAD_PEDIDA: bonusQuantity,
              CANTIDAD_A_FACTURA: 0,
              PEDIDO_LINEA_BONIF: row.NUM_LN,
              _IS_BONUS_LINE: true,
              _QUANTITY_BONUS_APPLIED: true,
              NUM_LN: data.length + enhancedData.length - data.length + 1, // Nuevo número de línea
            };

            enhancedData.push(bonusLine);
            logger.debug(
              `🎁 Bonificación por cantidad creada: ${bonusQuantity} de ${row.COD_ART}`
            );
          }
        }
      }
    });

    return enhancedData;
  }

  /**
   * Aplica regla de bonificación escalada
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyScaledBonusRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de bonificación escalada: ${rule.name}`);

    return data.map((row) => {
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const processedRow = { ...row };
        const quantity = parseFloat(row.CANTIDAD_PEDIDA || row.CNT_MAX || 0);

        // Evaluar escalas de bonificación
        if (rule.actions?.scales) {
          for (const scale of rule.actions.scales) {
            if (
              quantity >= scale.minQuantity &&
              (scale.maxQuantity === undefined || quantity <= scale.maxQuantity)
            ) {
              processedRow.CANTIDAD_BONIFICAD =
                (processedRow.CANTIDAD_BONIFICAD || 0) + scale.bonusAmount;
              processedRow._SCALED_BONUS_APPLIED = true;
              logger.debug(
                `🎁 Bonificación escalada aplicada: ${scale.bonusAmount} por escala`
              );
              break;
            }
          }
        }

        return processedRow;
      }
      return row;
    });
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

    const enhancedData = [...data];

    data.forEach((row) => {
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        if (rule.actions?.bonusProducts) {
          rule.actions.bonusProducts.forEach((bonusProduct) => {
            const bonusLine = {
              ...row,
              COD_ART: bonusProduct.productCode,
              ART_BON: "B",
              COD_ART_RFR: row.COD_ART,
              CANTIDAD_BONIFICAD: bonusProduct.quantity || 1,
              CANTIDAD_PEDIDA: bonusProduct.quantity || 1,
              CANTIDAD_A_FACTURA: 0,
              PEDIDO_LINEA_BONIF: row.NUM_LN,
              _IS_BONUS_LINE: true,
              _PRODUCT_BONUS_APPLIED: true,
              NUM_LN: data.length + enhancedData.length - data.length + 1,
            };

            enhancedData.push(bonusLine);
            logger.debug(
              `🎁 Producto bonificación creado: ${bonusProduct.productCode}`
            );
          });
        }
      }
    });

    return enhancedData;
  }

  /**
   * Aplica regla de descuento en factura
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyInvoiceDiscountRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de descuento en factura: ${rule.name}`);

    const totalInvoice = data.reduce((sum, row) => {
      const amount = parseFloat(row.MON_TOT || row.MONTO_TOTAL || 0);
      return sum + amount;
    }, 0);

    if (
      rule.actions?.minimumAmount &&
      totalInvoice >= rule.actions.minimumAmount
    ) {
      return data.map((row) => {
        const processedRow = { ...row };
        if (rule.actions.discountPercentage) {
          processedRow.POR_DSC_FACTURA = rule.actions.discountPercentage;
          processedRow._INVOICE_DISCOUNT_APPLIED = true;
          logger.debug(
            `🎁 Descuento factura aplicado: ${rule.actions.discountPercentage}%`
          );
        }
        return processedRow;
      });
    }

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

    let offerApplied = false;

    return data.map((row) => {
      if (
        !offerApplied &&
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const processedRow = { ...row };

        if (rule.actions?.specialPrice) {
          processedRow.PRECIO_ESPECIAL = rule.actions.specialPrice;
          processedRow._ONE_TIME_OFFER_APPLIED = true;
          offerApplied = true;
          logger.debug(
            `🎁 Oferta única aplicada: precio especial ${rule.actions.specialPrice}`
          );
        }

        return processedRow;
      }
      return row;
    });
  }

  /**
   * Aplica regla de cantidad mínima
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyMinimumQuantityRule(data, rule) {
    logger.debug(`🎁 Aplicando regla de cantidad mínima: ${rule.name}`);

    return data.map((row) => {
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const processedRow = { ...row };
        const currentQuantity = parseFloat(
          row.CANTIDAD_PEDIDA || row.CNT_MAX || 0
        );

        if (
          rule.actions?.minimumQuantity &&
          currentQuantity < rule.actions.minimumQuantity
        ) {
          processedRow.CANTIDAD_PEDIDA = rule.actions.minimumQuantity;
          processedRow.CANTIDAD_A_FACTURA = rule.actions.minimumQuantity;
          processedRow._MINIMUM_QUANTITY_APPLIED = true;
          logger.debug(
            `🎁 Cantidad mínima aplicada: ${rule.actions.minimumQuantity}`
          );
        }

        return processedRow;
      }
      return row;
    });
  }

  /**
   * Aplica regla de bonificación por porcentaje
   * @param {Array} data - Datos
   * @param {Object} rule - Regla
   * @returns {Array} - Datos procesados
   */
  static applyPercentageBonusRule(data, rule) {
    logger.debug(
      `🎁 Aplicando regla de bonificación por porcentaje: ${rule.name}`
    );

    return data.map((row) => {
      if (
        rule.conditions &&
        this.evaluateRuleConditions(row, rule.conditions)
      ) {
        const processedRow = { ...row };
        const baseQuantity = parseFloat(
          row.CANTIDAD_PEDIDA || row.CNT_MAX || 0
        );

        if (rule.actions?.bonusPercentage && baseQuantity > 0) {
          const bonusAmount = Math.floor(
            baseQuantity * (rule.actions.bonusPercentage / 100)
          );
          processedRow.CANTIDAD_BONIFICAD =
            (processedRow.CANTIDAD_BONIFICAD || 0) + bonusAmount;
          processedRow._PERCENTAGE_BONUS_APPLIED = true;
          logger.debug(
            `🎁 Bonificación porcentaje aplicada: ${bonusAmount} (${rule.actions.bonusPercentage}%)`
          );
        }

        return processedRow;
      }
      return row;
    });
  }

  /**
   * Evalúa condiciones de una regla
   * @param {Object} row - Fila de datos
   * @param {Object} conditions - Condiciones a evaluar
   * @returns {boolean} - Si las condiciones se cumplen
   */
  static evaluateRuleConditions(row, conditions) {
    try {
      if (!conditions) return true;

      // Evaluar condiciones simples
      for (const [field, condition] of Object.entries(conditions)) {
        const value = row[field];

        if (condition.equals !== undefined && value !== condition.equals) {
          return false;
        }

        if (
          condition.greaterThan !== undefined &&
          parseFloat(value) <= condition.greaterThan
        ) {
          return false;
        }

        if (
          condition.lessThan !== undefined &&
          parseFloat(value) >= condition.lessThan
        ) {
          return false;
        }

        if (
          condition.includes !== undefined &&
          !condition.includes.includes(value)
        ) {
          return false;
        }

        if (
          condition.excludes !== undefined &&
          condition.excludes.includes(value)
        ) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error(`🎁 Error evaluando condiciones: ${error.message}`);
      return false;
    }
  }

  // ===============================
  // 5. MÉTODOS DE UTILIDAD Y ESTADÍSTICAS
  // ===============================

  /**
   * Genera estadísticas de procesamiento de promociones
   * @param {Array} originalData - Datos originales
   * @param {Array} processedData - Datos procesados
   * @returns {Object} - Estadísticas
   */
  static generatePromotionStats(originalData, processedData) {
    try {
      const stats = {
        original: {
          totalLines: originalData.length,
          bonusLines: originalData.filter((row) => row.ART_BON === "B").length,
          regularLines: originalData.filter((row) => row.ART_BON !== "B")
            .length,
        },
        processed: {
          totalLines: processedData.length,
          bonusLines: processedData.filter((row) => row._IS_BONUS_LINE).length,
          triggerLines: processedData.filter((row) => row._IS_TRIGGER_LINE)
            .length,
          regularLines: processedData.filter(
            (row) => !row._IS_BONUS_LINE && !row._IS_TRIGGER_LINE
          ).length,
        },
        changes: {
          linesAdded: processedData.length - originalData.length,
          promotionsDetected: processedData.filter(
            (row) => row._promotionType && row._promotionType !== "REGULAR"
          ).length,
          conversionsApplied: processedData.filter((row) => row._processed)
            .length,
        },
      };

      logger.info(
        `🎁 📊 Estadísticas de promociones: ${JSON.stringify(stats, null, 2)}`
      );
      return stats;
    } catch (error) {
      logger.error(`🎁 Error generando estadísticas: ${error.message}`);
      return null;
    }
  }

  /**
   * Valida integridad de datos procesados
   * @param {Array} processedData - Datos procesados
   * @returns {Object} - Resultado de validación
   */
  static validateProcessedData(processedData) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      processedData.forEach((row, index) => {
        // Validar que las bonificaciones tengan referencia
        if (row._IS_BONUS_LINE && !row.PEDIDO_LINEA_BONIF) {
          validation.warnings.push(
            `Línea ${index + 1}: Bonificación sin referencia de línea`
          );
        }

        // Validar cantidades numéricas
        const quantityFields = [
          "CANTIDAD_PEDIDA",
          "CANTIDAD_A_FACTURA",
          "CANTIDAD_BONIFICAD",
        ];
        quantityFields.forEach((field) => {
          if (
            row[field] !== null &&
            row[field] !== undefined &&
            isNaN(parseFloat(row[field]))
          ) {
            validation.errors.push(
              `Línea ${index + 1}: ${field} no es numérico: ${row[field]}`
            );
            validation.isValid = false;
          }
        });

        // Validar coherencia de bonificaciones
        if (
          row._IS_BONUS_LINE &&
          parseFloat(row.CANTIDAD_BONIFICAD || 0) <= 0
        ) {
          validation.warnings.push(
            `Línea ${index + 1}: Bonificación sin cantidad válida`
          );
        }
      });

      logger.info(
        `🎁 ✅ Validación completada: ${
          validation.isValid ? "VÁLIDO" : "ERRORES"
        }`
      );
      if (validation.errors.length > 0) {
        logger.error(`🎁 Errores encontrados: ${validation.errors.join(", ")}`);
      }
      if (validation.warnings.length > 0) {
        logger.warn(`🎁 Advertencias: ${validation.warnings.join(", ")}`);
      }

      return validation;
    } catch (error) {
      logger.error(`🎁 Error en validación: ${error.message}`);
      return {
        isValid: false,
        errors: [`Error de validación: ${error.message}`],
        warnings: [],
      };
    }
  }
}

module.exports = PromotionProcessor;