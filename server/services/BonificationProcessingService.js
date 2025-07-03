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

      // 2. Obtener todos los registros del documento
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

      // 4. Si no hay bonificaciones, no hay nada que procesar
      if (bonifications.length === 0) {
        logger.info(
          `✅ Documento ${documentId}: No hay bonificaciones que procesar`
        );
        return {
          success: true,
          processed: 0,
          regularArticles: regularArticles.length,
          bonifications: 0,
          message: "No hay bonificaciones en este documento",
        };
      }

      // 5. Limpiar datos previos (si es reprocesamiento)
      await this.cleanPreviousProcessing(
        connection,
        documentId,
        bonificationConfig
      );

      // 6. Asignar números de línea secuenciales a artículos regulares
      const lineAssignmentResult = await this.assignLineNumbers(
        connection,
        regularArticles,
        bonificationConfig
      );

      // 7. Mapear bonificaciones con artículos regulares
      const mappingResult = await this.mapBonificationsToRegularArticles(
        connection,
        regularArticles,
        bonifications,
        bonificationConfig
      );

      // 8. Limpiar referencias originales en bonificaciones
      await this.cleanOriginalReferences(
        connection,
        bonifications,
        bonificationConfig
      );

      const processingTime = Date.now() - startTime;
      logger.info(
        `✅ Procesamiento de bonificaciones completado para documento ${documentId} en ${processingTime}ms`
      );

      return {
        success: true,
        processed: mappingResult.mapped,
        regularArticles: regularArticles.length,
        bonifications: bonifications.length,
        lineAssignments: lineAssignmentResult.assigned,
        orphanBonifications: mappingResult.orphans,
        processingTimeMs: processingTime,
        message: `Procesado: ${mappingResult.mapped} bonificaciones mapeadas, ${mappingResult.orphans} huérfanas`,
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
      };
    }
  }

  /**
   * Obtiene todos los registros del documento
   */
  async getAllRecords(connection, documentId, config) {
    const query = `
      SELECT * FROM ${config.sourceTable}
      WHERE ${config.orderField} = @documentId
      ORDER BY
        CASE WHEN ${config.bonificationIndicatorField} = @bonificationValue THEN 1 ELSE 0 END,
        ${config.regularArticleField}
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
