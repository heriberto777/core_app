// services/BonificationIntegrationService.js
const logger = require("./logger");

class BonificationIntegrationService {
  /**
   * Procesa bonificaciones en los datos obtenidos, integrándose con el flujo existente
   */
  async processBonificationsInData(sourceData, detailData, bonificationConfig) {
    if (
      !bonificationConfig ||
      !Array.isArray(detailData) ||
      detailData.length === 0
    ) {
      logger.debug("No hay configuración de bonificaciones o datos de detalle");
      return {
        processedData: detailData,
        bonificationStats: null,
        hasBonifications: false,
      };
    }

    logger.info(
      `🎁 Procesando bonificaciones en ${detailData.length} registros de detalle`
    );

    try {
      // Separar registros regulares y bonificaciones
      const regularRecords = [];
      const bonificationRecords = [];

      detailData.forEach((record, index) => {
        const indicatorValue =
          record[bonificationConfig.bonificationIndicatorField];

        if (indicatorValue === bonificationConfig.bonificationIndicatorValue) {
          bonificationRecords.push({ ...record, originalIndex: index });
        } else {
          regularRecords.push({ ...record, originalIndex: index });
        }
      });

      logger.info(
        `📊 Separación: ${regularRecords.length} regulares, ${bonificationRecords.length} bonificaciones`
      );

      if (bonificationRecords.length === 0) {
        return {
          processedData: detailData,
          bonificationStats: {
            totalRegular: regularRecords.length,
            totalBonifications: 0,
            mappedBonifications: 0,
            orphanBonifications: 0,
          },
          hasBonifications: false,
        };
      }

      // Crear índice de artículos regulares
      const regularIndex = new Map();
      regularRecords.forEach((record) => {
        const articleCode = record[bonificationConfig.regularArticleField];
        const lineNumber = record.NUM_LN;
        if (articleCode && lineNumber) {
          regularIndex.set(articleCode, {
            lineNumber,
            record,
          });
        }
      });

      // Procesar bonificaciones
      const processedRecords = [...regularRecords]; // Empezar con regulares
      let mappedBonifications = 0;
      let orphanBonifications = 0;
      const orphanDetails = [];

      bonificationRecords.forEach((bonification) => {
        const bonificationCode =
          bonification[bonificationConfig.regularArticleField];
        const referenceCode =
          bonification[bonificationConfig.bonificationReferenceField];
        const bonificationLine = bonification.NUM_LN;

        if (!referenceCode) {
          orphanBonifications++;
          orphanDetails.push({
            line: bonificationLine,
            article: bonificationCode,
            reason: "Sin código de referencia",
          });
          logger.warn(
            `⚠️ Bonificación sin referencia en línea ${bonificationLine}`
          );
          return;
        }

        const regularInfo = regularIndex.get(referenceCode);
        if (!regularInfo) {
          orphanBonifications++;
          orphanDetails.push({
            line: bonificationLine,
            article: bonificationCode,
            reference: referenceCode,
            reason: "Artículo regular no encontrado",
          });
          logger.warn(
            `⚠️ Bonificación huérfana: artículo ${referenceCode} no encontrado para línea ${bonificationLine}`
          );
          return;
        }

        // Mapeo exitoso: agregar campo de referencia de línea
        const mappedBonification = {
          ...bonification,
          [bonificationConfig.bonificationLineReferenceField]:
            regularInfo.lineNumber,
          _isMappedBonification: true,
          _referencedLine: regularInfo.lineNumber,
          _referencedArticle: referenceCode,
        };

        processedRecords.push(mappedBonification);
        mappedBonifications++;

        logger.debug(
          `✅ Bonificación mapeada: línea ${bonificationLine} → referencia línea ${regularInfo.lineNumber}`
        );
      });

      // Ordenar por línea original para mantener orden
      processedRecords.sort((a, b) => (a.NUM_LN || 0) - (b.NUM_LN || 0));

      const stats = {
        totalRegular: regularRecords.length,
        totalBonifications: bonificationRecords.length,
        mappedBonifications,
        orphanBonifications,
        orphanDetails,
        successRate:
          bonificationRecords.length > 0
            ? (
                (mappedBonifications / bonificationRecords.length) *
                100
              ).toFixed(2)
            : 0,
      };

      logger.info(`🎯 Procesamiento de bonificaciones completado:`, stats);

      return {
        processedData: processedRecords,
        bonificationStats: stats,
        hasBonifications: true,
      };
    } catch (error) {
      logger.error(`❌ Error procesando bonificaciones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica si un mapping debe procesar bonificaciones
   */
  shouldProcessBonifications(mapping) {
    return !!(
      mapping.hasBonificationProcessing &&
      mapping.bonificationConfig &&
      mapping.bonificationConfig.sourceTable
    );
  }

  /**
   * Enriquece la consulta de detalle para incluir campos necesarios para bonificaciones
   */
  enrichDetailQueryForBonifications(baseQuery, bonificationConfig) {
    if (!bonificationConfig) return baseQuery;

    // Asegurar que los campos necesarios estén en la consulta
    const requiredFields = [
      bonificationConfig.bonificationIndicatorField,
      bonificationConfig.regularArticleField,
      bonificationConfig.bonificationReferenceField,
      "NUM_LN",
    ];

    // Esta es una implementación simple - en producción podrías analizar la consulta
    // y agregar campos faltantes de manera más sofisticada
    logger.debug(
      `Campos requeridos para bonificaciones: ${requiredFields.join(", ")}`
    );

    return baseQuery;
  }
}

module.exports = new BonificationIntegrationService();
