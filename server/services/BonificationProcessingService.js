// BonificationProcessingService.js
const logger = require("./logger");
const { SqlService } = require("./SqlService");

class BonificationProcessingService {
  /**
   * Procesa bonificaciones para un documento específico
   * @param {Object} connection - Conexión a la base de datos
   * @param {string} documentId - ID del documento a procesar
   * @param {Object} bonificationConfig - Configuración de bonificaciones
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processBonifications(connection, documentId, bonificationConfig) {
    const startTime = Date.now();

    try {
      logger.info(
        `🎁 Iniciando procesamiento de bonificaciones para documento: ${documentId}`
      );

      // 1. Validar configuración
      this.validateBonificationConfig(bonificationConfig);

      // 2. Obtener todos los registros del documento de la tabla origen
      const allRecords = await this.getAllRecords(
        connection,
        documentId,
        bonificationConfig
      );

      if (!allRecords || allRecords.length === 0) {
        logger.warn(`No se encontraron registros para documento ${documentId}`);
        return {
          success: true,
          processed: 0,
          message: "No hay registros para procesar",
          bonificationMapping: null,
        };
      }

      // 3. Separar artículos regulares y bonificaciones
      const regularArticles = allRecords.filter(
        (record) =>
          record[bonificationConfig.bonificationIndicatorField] !==
          bonificationConfig.bonificationIndicatorValue
      );

      const bonifications = allRecords.filter(
        (record) =>
          record[bonificationConfig.bonificationIndicatorField] ===
          bonificationConfig.bonificationIndicatorValue
      );

      logger.info(
        `📊 Documento ${documentId}: ${regularArticles.length} regulares, ${bonifications.length} bonificaciones`
      );

      // 4. Si no hay bonificaciones, solo mapear regulares
      if (bonifications.length === 0) {
        logger.info(
          `✅ Documento ${documentId}: No hay bonificaciones que procesar`
        );
        const bonificationMapping = this.createRegularOnlyMapping(
          regularArticles,
          bonificationConfig
        );
        return {
          success: true,
          processed: 0,
          regularArticles: regularArticles.length,
          bonifications: 0,
          message: "No hay bonificaciones en este documento",
          bonificationMapping,
        };
      }

      // 5. Crear el mapeo usando NUM_LN existente
      const bonificationMapping = await this.createBonificationMappingFromNumLn(
        regularArticles,
        bonifications,
        bonificationConfig
      );

      const processingTime = Date.now() - startTime;
      logger.info(
        `✅ Procesamiento de bonificaciones completado para documento ${documentId} en ${processingTime}ms`
      );

      return {
        success: true,
        processed: bonificationMapping.mappedBonifications,
        regularArticles: regularArticles.length,
        bonifications: bonifications.length,
        orphanBonifications: bonificationMapping.orphanBonifications,
        processingTimeMs: processingTime,
        message: `Procesado: ${bonificationMapping.mappedBonifications} bonificaciones mapeadas, ${bonificationMapping.orphanBonifications} huérfanas`,
        bonificationMapping: bonificationMapping,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando bonificaciones para documento ${documentId}:`,
        {
          error: error.message,
          stack: error.stack,
          documentId,
          config: bonificationConfig,
        }
      );

      return {
        success: false,
        error: error.message,
        processed: 0,
        documentId,
        bonificationMapping: null,
      };
    }
  }

  /**
   * Crea mapeo solo de productos regulares (cuando no hay bonificaciones)
   */
  createRegularOnlyMapping(regularArticles, config) {
    const regularMapping = new Map();

    regularArticles.forEach((article) => {
      const articleCode = article[config.regularArticleField];
      const numLn = article["NUM_LN"]; // Usar NUM_LN existente

      regularMapping.set(articleCode, {
        ...article,
        lineNumber: numLn,
        isRegular: true,
      });

      logger.debug(`📋 Artículo regular: ${articleCode} → Línea: ${numLn}`);
    });

    return {
      regularMapping,
      bonificationMapping: new Map(),
      mappedBonifications: 0,
      orphanBonifications: 0,
      orphanList: [],
    };
  }

  /**
   * Crea el mapeo de bonificaciones en memoria
   */
  async createBonificationMapping(regularArticles, bonifications, config) {
    logger.info(`🔗 Creando mapeo de bonificaciones en memoria`);

    // 1. Asignar números de línea secuenciales a artículos regulares
    const regularMapping = new Map();
    const lineNumberMapping = new Map(); // codigo_articulo -> numero_linea

    regularArticles.forEach((article, index) => {
      const lineNumber = index + 1;
      const articleCode = article[config.regularArticleField];

      regularMapping.set(articleCode, {
        ...article,
        lineNumber: lineNumber, // Este será el PEDIDO_LINEA en destino
      });

      lineNumberMapping.set(articleCode, lineNumber);

      logger.debug(
        `📋 Artículo regular: ${articleCode} → Línea: ${lineNumber}`
      );
    });

    // 2. Mapear bonificaciones con artículos regulares
    const bonificationMapping = new Map();
    let mappedBonifications = 0;
    let orphanBonifications = 0;
    const orphanList = [];

    bonifications.forEach((bonification) => {
      const bonificationCode = bonification[config.regularArticleField];
      const regularArticleCode =
        bonification[config.bonificationReferenceField];

      if (!regularArticleCode) {
        logger.warn(
          `⚠️ Bonificación ${bonificationCode} sin referencia a artículo regular`
        );
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          reason: "Sin referencia a artículo regular",
        });
        return;
      }

      const regularLineNumber = lineNumberMapping.get(regularArticleCode);

      if (!regularLineNumber) {
        logger.warn(
          `⚠️ No se encontró artículo regular para código: ${regularArticleCode}`
        );
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          regularArticleCode,
          reason: "Artículo regular no encontrado",
        });
        return;
      }

      // Mapear bonificación
      bonificationMapping.set(bonificationCode, {
        ...bonification,
        lineNumber: 0, // Las bonificaciones pueden tener línea 0 o secuencial
        bonificationLineReference: regularLineNumber, // PEDIDO_LINEA_BONIF = línea del artículo regular
      });

      mappedBonifications++;
      logger.debug(
        `✅ Bonificación: ${bonificationCode} → Línea regular: ${regularLineNumber}`
      );
    });

    logger.info(
      `✅ Mapeo completado: ${mappedBonifications} mapeadas, ${orphanBonifications} huérfanas`
    );

    if (orphanBonifications > 0) {
      logger.warn(`⚠️ Bonificaciones huérfanas:`, orphanList);
    }

    return {
      regularMapping, // Map de artículos regulares con números de línea
      bonificationMapping, // Map de bonificaciones con referencias a líneas regulares
      mappedBonifications,
      orphanBonifications,
      orphanList,
    };
  }

  /**
   * Crea el mapeo de bonificaciones usando NUM_LN existente
   */
  async createBonificationMappingFromNumLn(
    regularArticles,
    bonifications,
    config
  ) {
    logger.info(`🔗 Creando mapeo de bonificaciones usando NUM_LN existente`);

    // 1. Crear mapa de artículos regulares: COD_ART → NUM_LN
    const regularMapping = new Map();
    const articleToLineMap = new Map(); // COD_ART → NUM_LN

    regularArticles.forEach((article) => {
      const articleCode = article[config.regularArticleField];
      const numLn = article["NUM_LN"];

      regularMapping.set(articleCode, {
        ...article,
        lineNumber: numLn,
        isRegular: true,
      });

      articleToLineMap.set(articleCode, numLn);

      logger.debug(`📋 Artículo regular: ${articleCode} → Línea: ${numLn}`);
    });

    // 2. Mapear bonificaciones con artículos regulares usando COD_ART_RFR
    const bonificationMapping = new Map();
    let mappedBonifications = 0;
    let orphanBonifications = 0;
    const orphanList = [];

    bonifications.forEach((bonification) => {
      const bonificationCode = bonification[config.regularArticleField]; // COD_ART de la bonificación
      const regularArticleCode =
        bonification[config.bonificationReferenceField]; // COD_ART_RFR
      const bonificationNumLn = bonification["NUM_LN"]; // NUM_LN de la bonificación

      logger.debug(
        `🎁 Procesando bonificación: ${bonificationCode}, refiere a: ${regularArticleCode}, NUM_LN: ${bonificationNumLn}`
      );

      if (!regularArticleCode) {
        logger.warn(
          `⚠️ Bonificación ${bonificationCode} sin referencia a artículo regular (COD_ART_RFR)`
        );
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          reason: "Sin COD_ART_RFR",
        });
        return;
      }

      // Buscar el NUM_LN del artículo regular usando COD_ART_RFR
      const regularLineNumber = articleToLineMap.get(regularArticleCode);

      if (!regularLineNumber) {
        logger.warn(
          `⚠️ No se encontró NUM_LN para artículo regular: ${regularArticleCode}`
        );
        orphanBonifications++;
        orphanList.push({
          bonificationCode,
          regularArticleCode,
          reason: "Artículo regular no encontrado o sin NUM_LN",
        });
        return;
      }

      // Mapear bonificación
      bonificationMapping.set(bonificationCode, {
        ...bonification,
        lineNumber: bonificationNumLn, // PEDIDO_LINEA = NUM_LN de la bonificación
        bonificationLineReference: regularLineNumber, // PEDIDO_LINEA_BONIF = NUM_LN del artículo regular
        isRegular: false,
        referencedArticle: regularArticleCode,
      });

      mappedBonifications++;
      logger.debug(
        `✅ Bonificación: ${bonificationCode} (línea ${bonificationNumLn}) → refiere línea regular ${regularLineNumber} (${regularArticleCode})`
      );
    });

    logger.info(
      `✅ Mapeo completado: ${mappedBonifications} mapeadas, ${orphanBonifications} huérfanas`
    );

    if (orphanBonifications > 0) {
      logger.warn(`⚠️ Bonificaciones huérfanas:`, orphanList);
    }

    return {
      regularMapping,
      bonificationMapping,
      mappedBonifications,
      orphanBonifications,
      orphanList,
    };
  }

  /**
   * Obtiene el mapeo para un artículo específico
   */
  getArticleMapping(articleCode, bonificationMapping) {
    if (!bonificationMapping) return null;

    // Verificar si es artículo regular
    if (bonificationMapping.regularMapping.has(articleCode)) {
      const regular = bonificationMapping.regularMapping.get(articleCode);
      return {
        isRegular: true,
        lineNumber: regular.lineNumber,
        bonificationLineReference: null,
      };
    }

    // Verificar si es bonificación
    if (bonificationMapping.bonificationMapping.has(articleCode)) {
      const bonification =
        bonificationMapping.bonificationMapping.get(articleCode);
      return {
        isRegular: false,
        lineNumber: bonification.lineNumber,
        bonificationLineReference: bonification.bonificationLineReference,
      };
    }

    return null;
  }

  /**
   * Obtiene todos los registros del documento
   */
  async getAllRecords(connection, documentId, config) {
    const query = `
      SELECT *, NUM_LN FROM ${config.sourceTable}
      WHERE ${config.orderField} = @documentId
      ORDER BY NUM_LN ASC
    `;

    logger.debug(`🔍 Consulta registros: ${query}`);

    const result = await SqlService.query(connection, query, {
      documentId,
      bonificationValue: config.bonificationIndicatorValue,
    });

    return result.recordset;
  }

  /**
   * Limpia procesamiento previo (para reprocesar)
   */
  async cleanPreviousProcessing(connection, documentId, config) {
    logger.info(
      `🧹 Limpiando procesamiento previo para documento ${documentId}`
    );

    // Limpiar números de línea anteriores
    const cleanLinesQuery = `
      UPDATE ${config.sourceTable}
      SET ${config.lineNumberField} = NULL
      WHERE ${config.orderField} = @documentId
    `;

    // Limpiar referencias de bonificaciones anteriores
    const cleanBonifQuery = `
      UPDATE ${config.sourceTable}
      SET ${config.bonificationLineReferenceField} = NULL
      WHERE ${config.orderField} = @documentId
      AND ${config.bonificationIndicatorField} = @bonificationValue
    `;

    await SqlService.query(connection, cleanLinesQuery, { documentId });
    await SqlService.query(connection, cleanBonifQuery, {
      documentId,
      bonificationValue: config.bonificationIndicatorValue,
    });
  }

  /**
   * Asigna números de línea secuenciales a artículos regulares
   */
  async assignLineNumbers(connection, regularArticles, config) {
    logger.info(
      `🔢 Asignando números de línea a ${regularArticles.length} artículos regulares`
    );

    let assigned = 0;

    for (let i = 0; i < regularArticles.length; i++) {
      const article = regularArticles[i];
      const lineNumber = i + 1;

      try {
        const updateQuery = `
          UPDATE ${config.sourceTable}
          SET ${config.lineNumberField} = @lineNumber
          WHERE ${config.orderField} = @documentId
          AND ${config.regularArticleField} = @articleCode
          AND (${config.bonificationIndicatorField} IS NULL
               OR ${config.bonificationIndicatorField} != @bonificationValue)
        `;

        const result = await SqlService.query(connection, updateQuery, {
          lineNumber,
          documentId: article[config.orderField],
          articleCode: article[config.regularArticleField],
          bonificationValue: config.bonificationIndicatorValue,
        });

        if (result.rowsAffected > 0) {
          article[config.lineNumberField] = lineNumber;
          assigned++;
          logger.debug(
            `✅ Línea ${lineNumber} asignada a artículo ${
              article[config.regularArticleField]
            }`
          );
        } else {
          logger.warn(
            `⚠️ No se pudo asignar línea a artículo ${
              article[config.regularArticleField]
            }`
          );
        }
      } catch (error) {
        logger.error(
          `❌ Error asignando línea a artículo ${
            article[config.regularArticleField]
          }:`,
          error
        );
        throw error;
      }
    }

    logger.info(
      `✅ Asignadas ${assigned} líneas de ${regularArticles.length} artículos regulares`
    );
    return { assigned, total: regularArticles.length };
  }

  /**
   * Mapea bonificaciones con artículos regulares y asigna PEDIDO_LINEA_BONIF
   */
  async mapBonificationsToRegularArticles(
    connection,
    regularArticles,
    bonifications,
    config
  ) {
    logger.info(
      `🔗 Mapeando ${bonifications.length} bonificaciones con artículos regulares`
    );

    // Crear mapa de artículos regulares por código
    const regularMap = new Map();
    regularArticles.forEach((article) => {
      const articleCode = article[config.regularArticleField];
      const lineNumber = article[config.lineNumberField];
      if (articleCode && lineNumber) {
        regularMap.set(articleCode, lineNumber);
      }
    });

    let mapped = 0;
    let orphans = 0;
    const orphanList = [];

    for (const bonification of bonifications) {
      try {
        // Obtener el código del artículo regular al que pertenece esta bonificación
        const regularArticleCode =
          bonification[config.bonificationReferenceField];

        if (!regularArticleCode) {
          logger.warn(
            `⚠️ Bonificación ${
              bonification[config.regularArticleField]
            } sin referencia a artículo regular`
          );
          orphans++;
          orphanList.push({
            bonificationCode: bonification[config.regularArticleField],
            reason: "Sin referencia a artículo regular",
          });
          continue;
        }

        // Buscar el número de línea del artículo regular
        const regularLineNumber = regularMap.get(regularArticleCode);

        if (!regularLineNumber) {
          logger.warn(
            `⚠️ No se encontró artículo regular para código: ${regularArticleCode}`
          );
          orphans++;
          orphanList.push({
            bonificationCode: bonification[config.regularArticleField],
            regularArticleCode,
            reason: "Artículo regular no encontrado",
          });
          continue;
        }

        // Asignar PEDIDO_LINEA_BONIF con el número de línea del artículo regular
        const updateQuery = `
          UPDATE ${config.sourceTable}
          SET ${config.bonificationLineReferenceField} = @regularLineNumber
          WHERE ${config.orderField} = @documentId
          AND ${config.regularArticleField} = @bonificationCode
          AND ${config.bonificationIndicatorField} = @bonificationValue
        `;

        const result = await SqlService.query(connection, updateQuery, {
          regularLineNumber,
          documentId: bonification[config.orderField],
          bonificationCode: bonification[config.regularArticleField],
          bonificationValue: config.bonificationIndicatorValue,
        });

        if (result.rowsAffected > 0) {
          mapped++;
          logger.debug(
            `✅ Bonificación ${
              bonification[config.regularArticleField]
            } → Línea regular ${regularLineNumber}`
          );
        } else {
          logger.warn(
            `⚠️ No se pudo mapear bonificación ${
              bonification[config.regularArticleField]
            }`
          );
          orphans++;
          orphanList.push({
            bonificationCode: bonification[config.regularArticleField],
            regularArticleCode,
            reason: "Error en actualización de base de datos",
          });
        }
      } catch (error) {
        logger.error(
          `❌ Error mapeando bonificación ${
            bonification[config.regularArticleField]
          }:`,
          error
        );
        orphans++;
        orphanList.push({
          bonificationCode: bonification[config.regularArticleField],
          reason: `Error: ${error.message}`,
        });
      }
    }

    logger.info(
      `✅ Mapeo completado: ${mapped} mapeadas, ${orphans} huérfanas`
    );

    if (orphans > 0) {
      logger.warn(`⚠️ Bonificaciones huérfanas:`, orphanList);
    }

    return { mapped, orphans, orphanList };
  }

  /**
   * Limpia las referencias originales en bonificaciones
   */
  async cleanOriginalReferences(connection, bonifications, config) {
    if (bonifications.length === 0) return;

    logger.info(
      `🧹 Limpiando referencias originales de ${bonifications.length} bonificaciones`
    );

    try {
      // Limpiar todas las referencias de una vez
      const cleanQuery = `
        UPDATE ${config.sourceTable}
        SET ${config.bonificationReferenceField} = NULL
        WHERE ${config.orderField} = @documentId
        AND ${config.bonificationIndicatorField} = @bonificationValue
      `;

      const result = await SqlService.query(connection, cleanQuery, {
        documentId: bonifications[0][config.orderField], // Todos tienen el mismo documento
        bonificationValue: config.bonificationIndicatorValue,
      });

      logger.info(`✅ Limpiadas ${result.rowsAffected} referencias originales`);
    } catch (error) {
      logger.error(`❌ Error limpiando referencias originales:`, error);
      throw error;
    }
  }

  /**
   * Valida la configuración de bonificaciones
   */
  validateBonificationConfig(config) {
    const required = [
      "sourceTable",
      "bonificationIndicatorField",
      "bonificationIndicatorValue",
      "regularArticleField",
      "bonificationReferenceField",
      "orderField",
      "lineNumberField",
      "bonificationLineReferenceField",
    ];

    const missing = required.filter((field) => !config[field]);

    if (missing.length > 0) {
      throw new Error(
        `Campos requeridos faltantes en configuración de bonificaciones: ${missing.join(
          ", "
        )}`
      );
    }

    // Validaciones adicionales
    if (config.bonificationIndicatorField === config.regularArticleField) {
      throw new Error(
        "El campo indicador de bonificación no puede ser el mismo que el campo de artículo regular"
      );
    }

    if (config.lineNumberField === config.bonificationLineReferenceField) {
      throw new Error(
        "El campo de número de línea no puede ser el mismo que el campo de referencia de bonificación"
      );
    }

    return true;
  }

  /**
   * Obtiene estadísticas de bonificaciones para un documento
   */
  async getBonificationStats(connection, documentId, config) {
    try {
      const statsQuery = `
        SELECT
          COUNT(*) as total_records,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue THEN 1 END) as bonifications,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} != @bonificationValue OR ${config.bonificationIndicatorField} IS NULL THEN 1 END) as regular_articles,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue AND ${config.bonificationLineReferenceField} IS NOT NULL THEN 1 END) as mapped_bonifications,
          COUNT(CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue AND ${config.bonificationLineReferenceField} IS NULL THEN 1 END) as orphan_bonifications
        FROM ${config.sourceTable}
        WHERE ${config.orderField} = @documentId
      `;

      const result = await SqlService.query(connection, statsQuery, {
        documentId,
        bonificationValue: config.bonificationIndicatorValue,
      });

      return result.recordset[0];
    } catch (error) {
      logger.error(`Error obteniendo estadísticas de bonificaciones:`, error);
      return null;
    }
  }
}

module.exports = BonificationProcessingService;
