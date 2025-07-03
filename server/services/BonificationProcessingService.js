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
    try {
      logger.info(
        `🎁 Iniciando procesamiento de bonificaciones para documento: ${documentId}`
      );

      // 1. Obtener todos los registros del documento (regulares y bonificaciones)
      const allRecords = await this.getAllRecords(
        connection,
        documentId,
        bonificationConfig
      );

      if (!allRecords || allRecords.length === 0) {
        logger.warn(`No se encontraron registros para documento ${documentId}`);
        return { success: true, processed: 0 };
      }

      // 2. Separar artículos regulares y bonificaciones
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

      // 3. Asignar números de línea secuenciales a artículos regulares
      await this.assignLineNumbers(
        connection,
        regularArticles,
        bonificationConfig
      );

      // 4. Mapear bonificaciones con artículos regulares y asignar PEDIDO_LINEA_BONIF
      await this.mapBonificationsToRegularArticles(
        connection,
        regularArticles,
        bonifications,
        bonificationConfig
      );

      // 5. Limpiar referencias originales en bonificaciones
      await this.cleanOriginalReferences(
        connection,
        bonifications,
        bonificationConfig
      );

      logger.info(
        `✅ Procesamiento de bonificaciones completado para documento ${documentId}`
      );

      return {
        success: true,
        processed: bonifications.length,
        regularArticles: regularArticles.length,
        bonifications: bonifications.length,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando bonificaciones para documento ${documentId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtiene todos los registros del documento
   */
  async getAllRecords(connection, documentId, config) {
    const query = `
      SELECT * FROM ${config.sourceTable}
      WHERE ${config.orderField} = @documentId
      ORDER BY ${config.regularArticleField}
    `;

    const result = await SqlService.query(connection, query, { documentId });
    return result.recordset;
  }

  /**
   * Asigna números de línea secuenciales a artículos regulares
   */
  async assignLineNumbers(connection, regularArticles, config) {
    logger.info(
      `🔢 Asignando números de línea a ${regularArticles.length} artículos regulares`
    );

    for (let i = 0; i < regularArticles.length; i++) {
      const article = regularArticles[i];
      const lineNumber = i + 1;

      // Actualizar el número de línea
      const updateQuery = `
        UPDATE ${config.sourceTable}
        SET ${config.lineNumberField} = @lineNumber
        WHERE ${config.orderField} = @documentId
        AND ${config.regularArticleField} = @articleCode
        AND ${config.bonificationIndicatorField} != @bonificationValue
      `;

      await SqlService.query(connection, updateQuery, {
        lineNumber,
        documentId: article[config.orderField],
        articleCode: article[config.regularArticleField],
        bonificationValue: config.bonificationIndicatorValue,
      });

      // Actualizar en memoria para el siguiente paso
      article[config.lineNumberField] = lineNumber;
    }
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

    // Crear mapa de artículos regulares por código de artículo
    const regularMap = new Map();
    regularArticles.forEach((article) => {
      regularMap.set(
        article[config.regularArticleField],
        article[config.lineNumberField]
      );
    });

    for (const bonification of bonifications) {
      // Obtener el código del artículo regular al que pertenece esta bonificación
      const regularArticleCode =
        bonification[config.bonificationReferenceField];

      if (!regularArticleCode) {
        logger.warn(
          `⚠️ Bonificación sin referencia a artículo regular: ${JSON.stringify(
            bonification
          )}`
        );
        continue;
      }

      // Buscar el número de línea del artículo regular
      const regularLineNumber = regularMap.get(regularArticleCode);

      if (!regularLineNumber) {
        logger.warn(
          `⚠️ No se encontró artículo regular para código: ${regularArticleCode}`
        );
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

      await SqlService.query(connection, updateQuery, {
        regularLineNumber,
        documentId: bonification[config.orderField],
        bonificationCode: bonification[config.regularArticleField],
        bonificationValue: config.bonificationIndicatorValue,
      });

      logger.debug(
        `✅ Bonificación ${
          bonification[config.regularArticleField]
        } → Línea regular ${regularLineNumber}`
      );
    }
  }

  /**
   * Limpia las referencias originales en bonificaciones
   */
  async cleanOriginalReferences(connection, bonifications, config) {
    if (bonifications.length === 0) return;

    logger.info(
      `🧹 Limpiando referencias originales de ${bonifications.length} bonificaciones`
    );

    for (const bonification of bonifications) {
      const updateQuery = `
        UPDATE ${config.sourceTable}
        SET ${config.bonificationReferenceField} = NULL
        WHERE ${config.orderField} = @documentId
        AND ${config.regularArticleField} = @bonificationCode
        AND ${config.bonificationIndicatorField} = @bonificationValue
      `;

      await SqlService.query(connection, updateQuery, {
        documentId: bonification[config.orderField],
        bonificationCode: bonification[config.regularArticleField],
        bonificationValue: config.bonificationIndicatorValue,
      });
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

    for (const field of required) {
      if (!config[field]) {
        throw new Error(
          `Campo requerido faltante en configuración de bonificaciones: ${field}`
        );
      }
    }

    return true;
  }
}

module.exports = BonificationProcessingService;
