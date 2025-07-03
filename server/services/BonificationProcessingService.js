const logger = require("./logger");
const { SqlService } = require("./SqlService");

class BonificationProcessingService {
  /**
   * Procesa bonificaciones para un documento específico
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapping
   * @param {Object} sourceConnection - Conexión a la BD origen
   * @returns {Promise<Object>} - Datos procesados con bonificaciones
   */
  async processBonifications(documentId, mapping, sourceConnection) {
    if (!mapping.hasBonificationProcessing) {
      return null;
    }

    const config = mapping.bonificationConfig;

    try {
      logger.info(`🎁 Procesando bonificaciones para documento ${documentId}`);

      // 1. Obtener todos los registros del documento (regulares y bonificaciones)
      const allRecords = await this.getAllDocumentRecords(
        documentId,
        config,
        sourceConnection
      );

      if (!allRecords || allRecords.length === 0) {
        logger.warn(`No se encontraron registros para documento ${documentId}`);
        return null;
      }

      // 2. Separar artículos regulares y bonificaciones
      const regularItems = allRecords.filter(
        (record) =>
          record[config.bonificationIndicatorField] !==
          config.bonificationIndicatorValue
      );

      const bonificationItems = allRecords.filter(
        (record) =>
          record[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue
      );

      logger.info(
        `📦 Documento ${documentId}: ${regularItems.length} regulares, ${bonificationItems.length} bonificaciones`
      );

      // 3. Procesar artículos regulares - Asignar números de línea secuenciales
      this.processRegularItems(regularItems, config);

      // 4. Procesar bonificaciones - Asignar referencias a líneas de productos regulares
      this.processBonificationItems(bonificationItems, regularItems, config);

      // 5. Combinar todos los registros procesados
      const processedRecords = [...regularItems, ...bonificationItems];

      // 6. Actualizar registros en la base de datos
      await this.updateRecordsInDatabase(
        processedRecords,
        config,
        sourceConnection
      );

      logger.info(
        `✅ Bonificaciones procesadas correctamente para documento ${documentId}`
      );

      return {
        totalRecords: processedRecords.length,
        regularItems: regularItems.length,
        bonificationItems: bonificationItems.length,
        processedRecords,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando bonificaciones para documento ${documentId}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene todos los registros de un documento
   * @private
   */
  async getAllDocumentRecords(documentId, config, sourceConnection) {
    const query = `
      SELECT *
      FROM ${config.sourceTable}
      WHERE ${config.orderField} = @documentId
      ORDER BY ${config.regularArticleField}
    `;

    const params = { documentId };
    const result = await SqlService.query(sourceConnection, query, params);

    return result.recordset || [];
  }

  /**
   * Procesa artículos regulares asignando números de línea secuenciales
   * @private
   */
  processRegularItems(regularItems, config) {
    logger.info(`📋 Procesando ${regularItems.length} artículos regulares`);

    regularItems.forEach((item, index) => {
      const lineNumber = index + 1; // Líneas secuenciales empezando en 1
      item[config.lineNumberField] = lineNumber;

      logger.debug(
        `  • Artículo ${
          item[config.regularArticleField]
        } -> Línea ${lineNumber}`
      );
    });
  }

  /**
   * Procesa bonificaciones asignando referencias a artículos regulares
   * @private
   */
  processBonificationItems(bonificationItems, regularItems, config) {
    logger.info(`🎁 Procesando ${bonificationItems.length} bonificaciones`);

    // Crear un mapa de artículos regulares por código para búsqueda rápida
    const regularItemsMap = new Map();
    regularItems.forEach((item) => {
      const articleCode = item[config.regularArticleField];
      const lineNumber = item[config.lineNumberField];
      regularItemsMap.set(articleCode, lineNumber);
    });

    let bonificationLineCounter = regularItems.length + 1; // Continuar numeración después de regulares

    bonificationItems.forEach((bonificationItem) => {
      // Asignar número de línea secuencial a la bonificación
      bonificationItem[config.lineNumberField] = bonificationLineCounter++;

      // Obtener el código del artículo regular al que hace referencia
      const referencedArticleCode =
        bonificationItem[config.bonificationReferenceField];

      if (referencedArticleCode) {
        // Buscar el número de línea del artículo regular correspondiente
        const regularLineNumber = regularItemsMap.get(referencedArticleCode);

        if (regularLineNumber) {
          // 🔑 AQUÍ ESTÁ LA CORRECCIÓN PRINCIPAL:
          // Asignar el número de línea del artículo regular al campo bonificationLineReferenceField
          bonificationItem[config.bonificationLineReferenceField] =
            regularLineNumber;

          logger.debug(
            `  • Bonificación ${
              bonificationItem[config.regularArticleField]
            } (línea ${
              bonificationItem[config.lineNumberField]
            }) -> Referencia línea ${regularLineNumber} del artículo ${referencedArticleCode}`
          );
        } else {
          logger.warn(
            `  ⚠️  No se encontró línea para artículo regular ${referencedArticleCode}`
          );
          // 🔧 IMPORTANTE: No asignar NULL, mantener el campo sin modificar o asignar 0
          bonificationItem[config.bonificationLineReferenceField] = 0;
        }

        // Limpiar el campo de referencia original (como indicaba el flujo en el frontend)
        bonificationItem[config.bonificationReferenceField] = null;
      } else {
        logger.warn(`  ⚠️  Bonificación sin referencia a artículo regular`);
        bonificationItem[config.bonificationLineReferenceField] = 0;
      }
    });
  }

  /**
   * Actualiza los registros procesados en la base de datos
   * @private
   */
  async updateRecordsInDatabase(processedRecords, config, sourceConnection) {
    logger.info(`💾 Actualizando ${processedRecords.length} registros en BD`);

    const updatePromises = processedRecords.map(async (record) => {
      const updateQuery = `
        UPDATE ${config.sourceTable}
        SET
          ${config.lineNumberField} = @lineNumber,
          ${config.bonificationLineReferenceField} = @bonificationLineRef,
          ${config.bonificationReferenceField} = @bonificationRef
        WHERE
          ${config.orderField} = @documentId
          AND ${config.regularArticleField} = @articleCode
      `;

      const params = {
        lineNumber: record[config.lineNumberField],
        bonificationLineRef:
          record[config.bonificationLineReferenceField] || null,
        bonificationRef: record[config.bonificationReferenceField] || null,
        documentId: record[config.orderField],
        articleCode: record[config.regularArticleField],
      };

      try {
        await SqlService.query(sourceConnection, updateQuery, params);
      } catch (error) {
        logger.error(
          `Error actualizando registro ${record[config.regularArticleField]}: ${
            error.message
          }`
        );
        throw error;
      }
    });

    await Promise.all(updatePromises);
    logger.info(`✅ Todos los registros actualizados correctamente`);
  }
}

module.exports = new BonificationProcessingService();
