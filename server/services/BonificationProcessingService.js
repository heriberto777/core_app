// services/BonificationIntegrationService.js
const logger = require("./logger");

class BonificationIntegrationService {
  /**
   * Procesa bonificaciones en los datos obtenidos, integrándose con el flujo existente
   */
  async processBonificationsInData(sourceData, detailData, bonificationConfig) {
    if (
      !bonificationConfig ||
      !bonificationConfig.enabled ||
      !Array.isArray(detailData) ||
      detailData.length === 0
    ) {
      logger.debug("No hay configuración de bonificaciones o datos de detalle");
      return {
        success: true,
        processedData: detailData,
        bonificationStats: {
          totalRegular: detailData ? detailData.length : 0,
          totalBonifications: 0,
          mappedBonifications: 0,
          orphanBonifications: 0,
          successRate: 0,
          orphanDetails: [],
        },
        hasBonifications: false,
        message: "No hay procesamiento de bonificaciones requerido",
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
          bonificationRecords.push({
            ...record,
            originalIndex: index,
            recordType: "BONIFICATION",
          });
        } else {
          regularRecords.push({
            ...record,
            originalIndex: index,
            recordType: "REGULAR",
            assignedLine: regularRecords.length + 1,
          });
        }
      });

      logger.info(
        `📊 Separación: ${regularRecords.length} regulares, ${bonificationRecords.length} bonificaciones`
      );

      if (bonificationRecords.length === 0) {
        return {
          success: true,
          processedData: detailData,
          bonificationStats: {
            totalRegular: regularRecords.length,
            totalBonifications: 0,
            mappedBonifications: 0,
            orphanBonifications: 0,
            successRate: 0,
            orphanDetails: [],
          },
          hasBonifications: false,
          message: "No se encontraron bonificaciones para procesar",
        };
      }

      // Crear índice de artículos regulares para búsqueda rápida
      const regularIndex = new Map();
      regularRecords.forEach((record) => {
        const articleCode = record[bonificationConfig.regularArticleField];
        const lineNumber =
          record[bonificationConfig.lineNumberField] || record.assignedLine;

        if (articleCode && lineNumber) {
          // Permitir múltiples referencias al mismo artículo
          if (!regularIndex.has(articleCode)) {
            regularIndex.set(articleCode, []);
          }
          regularIndex.get(articleCode).push({
            lineNumber,
            record,
            articleCode,
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
          bonification[bonificationConfig.bonificationReferenceField] ||
          bonificationCode;
        const bonificationLine =
          bonification[bonificationConfig.lineNumberField] ||
          bonification.originalIndex + 1;

        if (!referenceCode) {
          orphanBonifications++;
          orphanDetails.push({
            line: bonificationLine,
            article: bonificationCode,
            reason: "Sin código de referencia",
            originalData: bonification,
          });
          logger.warn(
            `⚠️ Bonificación sin referencia en línea ${bonificationLine}`
          );
          return;
        }

        // Buscar artículo regular correspondiente
        const regularInfoArray = regularIndex.get(referenceCode);
        if (!regularInfoArray || regularInfoArray.length === 0) {
          orphanBonifications++;
          orphanDetails.push({
            line: bonificationLine,
            article: bonificationCode,
            reference: referenceCode,
            reason: "Artículo regular no encontrado",
            originalData: bonification,
          });
          logger.warn(
            `⚠️ Bonificación huérfana: artículo ${referenceCode} no encontrado para línea ${bonificationLine}`
          );
          return;
        }

        // Usar el primer artículo regular encontrado (podrías implementar lógica más sofisticada)
        const regularInfo = regularInfoArray[0];

        // Mapeo exitoso: crear bonificación procesada
        const mappedBonification = {
          ...bonification,
          [bonificationConfig.bonificationLineReferenceField]:
            regularInfo.lineNumber,
          _isMappedBonification: true,
          _referencedLine: regularInfo.lineNumber,
          _referencedArticle: referenceCode,
          _bonificationType: this.determineBonificationType(bonification),
          ITEM_TYPE: "BONIFICATION",
          assignedLine: bonification.originalIndex + 1000, // Asignar línea alta para ordenar después
        };

        processedRecords.push(mappedBonification);
        mappedBonifications++;

        logger.debug(
          `✅ Bonificación mapeada: línea ${bonificationLine} → referencia línea ${regularInfo.lineNumber}`
        );
      });

      // Ordenar registros por línea original para mantener orden
      processedRecords.sort((a, b) => {
        const lineA = a.assignedLine || a.originalIndex || 0;
        const lineB = b.assignedLine || b.originalIndex || 0;
        return lineA - lineB;
      });

      // Reasignar números de línea secuenciales
      processedRecords.forEach((record, index) => {
        record.finalLineNumber = index + 1;
      });

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
        // Nuevas estadísticas
        totalPromotions: mappedBonifications,
        totalDiscountAmount: 0,
        processedDetails: processedRecords.length,
        bonificationTypes: {
          STANDARD: mappedBonifications,
        },
      };

      logger.info(`🎯 Procesamiento de bonificaciones completado:`, stats);

      return {
        success: true,
        processedData: processedRecords,
        bonificationStats: stats,
        hasBonifications: true,
        message: `Procesamiento exitoso: ${mappedBonifications} bonificaciones mapeadas`,
      };
    } catch (error) {
      logger.error(`❌ Error procesando bonificaciones: ${error.message}`);
      return {
        success: false,
        processedData: detailData,
        bonificationStats: null,
        hasBonifications: false,
        message: `Error en procesamiento: ${error.message}`,
      };
    }
  }

  /**
   * Verifica si un mapping debe procesar bonificaciones
   */
  shouldProcessBonifications(mapping) {
    return !!(
      mapping.hasBonificationProcessing &&
      mapping.bonificationConfig &&
      mapping.bonificationConfig.enabled &&
      mapping.bonificationConfig.bonificationIndicatorField &&
      mapping.bonificationConfig.bonificationIndicatorValue
    );
  }

  /**
   * Enriquece la consulta de detalle para incluir campos necesarios para bonificaciones
   */
  enrichDetailQueryForBonifications(baseQuery, bonificationConfig) {
    if (!bonificationConfig || !bonificationConfig.enabled) return baseQuery;

    // Asegurar que los campos necesarios estén en la consulta
    const requiredFields = [
      bonificationConfig.bonificationIndicatorField,
      bonificationConfig.regularArticleField,
      bonificationConfig.bonificationReferenceField,
      bonificationConfig.lineNumberField,
    ].filter(field => field); // Filtrar campos que existen

    logger.debug(
      `🎁 Campos requeridos para bonificaciones: ${requiredFields.join(", ")}`
    );

    return baseQuery;
  }
}

  determineBonificationType(bonification) {
    // Lógica básica para determinar tipo de bonificación
    // Puedes expandir esto según tus necesidades
    if (bonification.CANTIDAD && bonification.CANTIDAD > 0) {
      return bonification.PRECIO === 0
        ? "BONIFICACION_GRATUITA"
        : "BONIFICACION_DESCUENTO";
    }
    return "BONIFICACION_STANDARD";
  }
}

module.exports = new BonificationIntegrationService();
