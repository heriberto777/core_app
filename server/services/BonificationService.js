// services/BonificationProcessor.js
const logger = require("./logger");

class BonificationProcessor {
  constructor(config = {}) {
    this.config = {
      enabled: false,
      detailTable: "FAC_DET_PED",
      groupByField: "NUM_PED",
      lineNumberField: "NUM_LN",
      bonificationMarkerField: "ART_BON",
      bonificationMarkerValue: "B",
      regularMarkerValue: "0",
      articleCodeField: "COD_ART",
      bonificationRefField: "COD_ART_RFR",
      targetLineField: "PEDIDO_LINEA",
      targetBonifRefField: "PEDIDO_LINEA_BONIF",
      preserveOriginalOrder: false,
      createOrphanBonifications: true,
      logLevel: "detailed",
      ...config,
    };

    this.stats = this.resetStats();
  }

  resetStats() {
    return {
      totalProcessed: 0,
      regularItems: 0,
      bonifications: 0,
      orphanBonifications: 0,
      documentsProcessed: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * 🟢 MÉTODO PRINCIPAL: Procesa datos con bonificaciones
   */
  async processData(rawData) {
    if (!this.config.enabled || !rawData || rawData.length === 0) {
      return this.createPassthroughResult(rawData);
    }

    this.stats = this.resetStats();
    this.stats.startTime = Date.now();

    try {
      // Paso 1: Clasificar y agrupar datos
      const groupedData = this.classifyAndGroup(rawData);

      // Paso 2: Procesar cada grupo independientemente
      const processedGroups = await this.processGroups(groupedData);

      // Paso 3: Consolidar resultados
      const finalResult = this.consolidateResults(processedGroups);

      this.stats.endTime = Date.now();
      this.logFinalStats();

      return finalResult;
    } catch (error) {
      logger.error(
        `🔥 Error en procesamiento de bonificaciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🟢 PASO 1: Clasificar registros y agrupar por documento
   */
  classifyAndGroup(rawData) {
    const groups = new Map();

    rawData.forEach((record) => {
      const groupKey = record[this.config.groupByField];
      const isBonification =
        record[this.config.bonificationMarkerField] ===
        this.config.bonificationMarkerValue;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey,
          regulars: [],
          bonifications: [],
          allRecords: [],
        });
      }

      const group = groups.get(groupKey);
      group.allRecords.push(record);

      if (isBonification) {
        group.bonifications.push(record);
      } else {
        group.regulars.push(record);
      }
    });

    this.logStep1Stats(groups);
    return groups;
  }

  /**
   * 🟢 PASO 2: Procesar cada grupo de forma independiente
   */
  async processGroups(groupedData) {
    const processedGroups = new Map();

    for (const [groupKey, group] of groupedData) {
      try {
        const processedGroup = await this.processIndividualGroup(group);
        processedGroups.set(groupKey, processedGroup);
        this.stats.documentsProcessed++;
      } catch (error) {
        logger.error(`❌ Error procesando grupo ${groupKey}: ${error.message}`);
        // Crear grupo de fallback con datos originales
        processedGroups.set(groupKey, {
          ...group,
          processed: group.allRecords.map((record) => ({
            ...record,
            _processingError: true,
          })),
          hasErrors: true,
        });
      }
    }

    return processedGroups;
  }

  /**
   * 🟢 CORE: Procesar un grupo individual
   */
  async processIndividualGroup(group) {
    const { groupKey, regulars, bonifications } = group;

    // Crear mapa de artículos regulares con sus nuevas líneas
    const articleToLineMap = new Map();
    const processedRecords = [];
    let currentLineNumber = 1;

    // Fase 1: Procesar productos regulares
    regulars.forEach((regular) => {
      const articleCode = regular[this.config.articleCodeField];
      const processedRegular = {
        ...regular,
        [`_CALC_${this.config.targetLineField}`]: currentLineNumber,
        [`_CALC_${this.config.targetBonifRefField}`]: null,
        _itemType: "regular",
        _originalLineNumber: regular[this.config.lineNumberField],
      };

      articleToLineMap.set(articleCode, currentLineNumber);
      processedRecords.push(processedRegular);
      currentLineNumber++;
      this.stats.regularItems++;
    });

    // Fase 2: Procesar bonificaciones
    bonifications.forEach((bonification) => {
      const referencedArticle = bonification[this.config.bonificationRefField];
      const referencedLineNumber = articleToLineMap.get(referencedArticle);

      const processedBonification = {
        ...bonification,
        [`_CALC_${this.config.targetLineField}`]: currentLineNumber,
        [`_CALC_${this.config.targetBonifRefField}`]:
          referencedLineNumber || null,
        [this.config.bonificationRefField]: null, // Limpiar campo original
        _itemType: "bonification",
        _originalLineNumber: bonification[this.config.lineNumberField],
        _referencedArticle: referencedArticle,
        _isOrphan: !referencedLineNumber,
      };

      if (!referencedLineNumber) {
        this.stats.orphanBonifications++;
        if (this.config.logLevel === "debug") {
          logger.warn(
            `🔗 Bonificación huérfana en grupo ${groupKey}: artículo ${referencedArticle} no encontrado`
          );
        }
      } else {
        if (this.config.logLevel === "debug") {
          logger.debug(
            `🎁 Bonificación vinculada: línea ${currentLineNumber} → línea ${referencedLineNumber}`
          );
        }
      }

      processedRecords.push(processedBonification);
      currentLineNumber++;
      this.stats.bonifications++;
    });

    // Fase 3: Aplicar opciones de ordenamiento
    const finalRecords = this.applyOrderingOptions(processedRecords, group);

    return {
      ...group,
      processed: finalRecords,
      articleMap: articleToLineMap,
      hasErrors: false,
      stats: {
        regulars: regulars.length,
        bonifications: bonifications.length,
        total: finalRecords.length,
      },
    };
  }

  /**
   * 🟢 PASO 3: Aplicar opciones de ordenamiento
   */
  applyOrderingOptions(records, originalGroup) {
    if (this.config.preserveOriginalOrder) {
      // Mantener orden original de NUM_LN
      return records.sort(
        (a, b) => (a._originalLineNumber || 0) - (b._originalLineNumber || 0)
      );
    } else {
      // Orden: regulares primero, luego bonificaciones
      return records.sort((a, b) => {
        if (a._itemType !== b._itemType) {
          return a._itemType === "regular" ? -1 : 1;
        }
        return (a._originalLineNumber || 0) - (b._originalLineNumber || 0);
      });
    }
  }

  /**
   * 🟢 PASO 4: Consolidar todos los resultados
   */
  consolidateResults(processedGroups) {
    const allProcessedRecords = [];
    const processingMeta = {
      groups: processedGroups.size,
      hasErrors: false,
      errorGroups: [],
    };

    for (const [groupKey, group] of processedGroups) {
      allProcessedRecords.push(...group.processed);

      if (group.hasErrors) {
        processingMeta.hasErrors = true;
        processingMeta.errorGroups.push(groupKey);
      }
    }

    this.stats.totalProcessed = allProcessedRecords.length;

    return {
      data: allProcessedRecords,
      meta: processingMeta,
      stats: { ...this.stats },
      config: { ...this.config },
    };
  }

  /**
   * 🟢 UTILIDAD: Crear resultado directo sin procesamiento
   */
  createPassthroughResult(data) {
    return {
      data: data || [],
      meta: {
        processed: false,
        reason: this.config.enabled
          ? "No data provided"
          : "Processing disabled",
      },
      stats: this.stats,
      config: this.config,
    };
  }

  /**
   * 🟢 UTILIDAD: Verificar si un campo es calculado
   */
  isCalculatedField(fieldName) {
    return fieldName.startsWith("_CALC_");
  }

  /**
   * 🟢 UTILIDAD: Obtener valor de campo calculado
   */
  getCalculatedFieldValue(record, targetFieldName) {
    const calcFieldName = `_CALC_${targetFieldName}`;
    return record[calcFieldName];
  }

  /**
   * 🟢 LOGGING: Estadísticas detalladas
   */
  logStep1Stats(groups) {
    if (this.config.logLevel === "minimal") return;

    logger.info(
      `📊 Clasificación completada: ${groups.size} grupos encontrados`
    );

    if (this.config.logLevel === "debug") {
      for (const [key, group] of groups) {
        logger.debug(
          `  📋 Grupo ${key}: ${group.regulars.length} regulares, ${group.bonifications.length} bonificaciones`
        );
      }
    }
  }

  logFinalStats() {
    if (this.config.logLevel === "minimal") return;

    const duration = this.stats.endTime - this.stats.startTime;
    logger.info(
      `✅ Procesamiento de bonificaciones completado en ${duration}ms:`,
      {
        documentos: this.stats.documentsProcessed,
        regulares: this.stats.regularItems,
        bonificaciones: this.stats.bonifications,
        huérfanas: this.stats.orphanBonifications,
        total: this.stats.totalProcessed,
      }
    );
  }
}

module.exports = BonificationProcessor;
