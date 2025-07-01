// scripts/cleanupLegacyBonifications.js
const TransferMapping = require("../models/transferMappingModel");
const MongoDbService = require("../services/mongoDbService"); // ✅ USAR TU SERVICIO EXISTENTE
const logger = require("../services/logger");

/**
 * 🧹 Script de limpieza para eliminar referencias legacy del sistema de bonificaciones
 *
 * CORREGIDO para usar MongoDbService existente y manejar timeouts
 */

class LegacyCleanupService {
  constructor() {
    this.results = {
      total: 0,
      cleaned: 0,
      errors: [],
      skipped: 0,
    };

    // ✅ CONFIGURACIÓN DE TIMEOUTS EXTENDIDOS
    this.queryTimeout = 30000; // 30 segundos
  }

  /**
   * 🎯 EJECUTAR LIMPIEZA COMPLETA
   */
  async runCleanup() {
    try {
      logger.info("🧹 INICIANDO LIMPIEZA DE SISTEMA LEGACY");
      logger.info("=".repeat(60));

      // ✅ 1. CONECTAR USANDO TU SERVICIO EXISTENTE
      await this.ensureMongoConnection();

      // 2. Obtener todos los mappings
      await this.getAllMappings();

      // 3. Limpiar campos legacy
      await this.cleanLegacyFields();

      // 4. Asegurar configuración v2.0
      await this.ensureV2Configuration();

      // 5. Validar resultados
      await this.validateCleanup();

      // 6. Generar reporte
      this.generateReport();

      logger.info("✅ Limpieza completada exitosamente");
      return this.results;
    } catch (error) {
      logger.error(`❌ Error crítico en limpieza: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔗 ASEGURAR CONEXIÓN MONGODB USANDO TU SERVICIO
   */
  async ensureMongoConnection() {
    try {
      logger.info("🔗 Verificando conexión MongoDB...");

      // ✅ USAR TU LÓGICA EXISTENTE
      if (MongoDbService.isConnected()) {
        logger.info("✅ MongoDB ya está conectado");
        return true;
      }

      logger.info("🔗 Conectando a MongoDB usando MongoDbService...");
      const connected = await MongoDbService.connect();

      if (!connected) {
        throw new Error("No se pudo establecer conexión con MongoDB");
      }

      logger.info("✅ Conexión MongoDB establecida exitosamente");

      // ✅ VERIFICAR SALUD DE LA CONEXIÓN
      const healthCheck = await MongoDbService.healthCheck();
      if (!healthCheck.healthy) {
        throw new Error(`MongoDB no está saludable: ${healthCheck.error}`);
      }

      logger.info("✅ Health check MongoDB exitoso");
      return true;
    } catch (error) {
      logger.error(`❌ Error estableciendo conexión MongoDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📋 OBTENER TODOS LOS MAPPINGS CON TIMEOUT EXTENDIDO
   */
  async getAllMappings() {
    try {
      logger.info("📋 Obteniendo todos los mappings...");

      // ✅ USAR TIMEOUT EXTENDIDO
      const mappings = await Promise.race([
        TransferMapping.find({}).lean().exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout obteniendo mappings")),
            this.queryTimeout
          )
        ),
      ]);

      this.results.total = mappings.length;

      logger.info(`📊 Encontrados ${mappings.length} mappings para procesar`);
      return mappings;
    } catch (error) {
      logger.error(`Error obteniendo mappings: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🧹 LIMPIAR CAMPOS LEGACY CON TIMEOUT
   */
  async cleanLegacyFields() {
    try {
      logger.info("🧹 Eliminando campos legacy...");

      // ✅ OPERACIÓN CON TIMEOUT
      const updateResult = await Promise.race([
        TransferMapping.updateMany(
          {}, // Aplicar a todos los documentos
          {
            $unset: {
              hasBonificationProcessing: "",
              bonificationConfig: "",
            },
          }
        ).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout eliminando campos legacy")),
            this.queryTimeout
          )
        ),
      ]);

      logger.info(
        `✅ Campos legacy eliminados de ${updateResult.modifiedCount} documentos`
      );

      return updateResult;
    } catch (error) {
      logger.error(`Error eliminando campos legacy: ${error.message}`);
      this.results.errors.push({
        operation: "cleanLegacyFields",
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 🔧 ASEGURAR CONFIGURACIÓN V2.0 - OPTIMIZADO
   */
  async ensureV2Configuration() {
    try {
      logger.info("🔧 Asegurando configuración v2.0...");

      // ✅ PROCESAR EN LOTES PARA EVITAR TIMEOUT
      const batchSize = 10;
      let processed = 0;
      let hasMore = true;
      let skip = 0;

      while (hasMore) {
        try {
          // Obtener lote de mappings
          const mappingsBatch = await Promise.race([
            TransferMapping.find({}).skip(skip).limit(batchSize).exec(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Timeout obteniendo lote de mappings")),
                this.queryTimeout
              )
            ),
          ]);

          if (mappingsBatch.length === 0) {
            hasMore = false;
            break;
          }

          // Procesar cada mapping en el lote
          for (const mapping of mappingsBatch) {
            try {
              let needsUpdate = false;

              // Asegurar que tenga bonificationProcessor
              if (!mapping.bonificationProcessor) {
                mapping.bonificationProcessor = {
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
                };
                needsUpdate = true;
              }

              // Asegurar versión 2.0
              if (!mapping.version || mapping.version !== "2.0") {
                mapping.version = "2.0";
                needsUpdate = true;
              }

              // Guardar si hay cambios
              if (needsUpdate) {
                await Promise.race([
                  mapping.save(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Timeout guardando mapping")),
                      this.queryTimeout
                    )
                  ),
                ]);

                this.results.cleaned++;
                logger.info(`✅ Actualizado mapping: ${mapping.name}`);
              } else {
                this.results.skipped++;
                logger.debug(`⏭️ Mapping ya actualizado: ${mapping.name}`);
              }

              processed++;
            } catch (mappingError) {
              logger.error(
                `Error procesando mapping ${mapping.name}: ${mappingError.message}`
              );
              this.results.errors.push({
                operation: "ensureV2Configuration",
                mappingId: mapping._id,
                mappingName: mapping.name,
                error: mappingError.message,
              });
            }
          }

          skip += batchSize;
          logger.info(`📊 Progreso: ${processed} mappings procesados...`);

          // Pausa pequeña entre lotes para no sobrecargar
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (batchError) {
          logger.error(
            `Error procesando lote (skip: ${skip}): ${batchError.message}`
          );
          break;
        }
      }

      logger.info(
        `✅ Configuración v2.0 asegurada para ${this.results.cleaned} mappings`
      );
    } catch (error) {
      logger.error(`Error asegurando configuración v2.0: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ VALIDAR LIMPIEZA CON TIMEOUTS
   */
  async validateCleanup() {
    try {
      logger.info("✅ Validando limpieza...");

      // Buscar documentos con campos legacy - CON TIMEOUT
      const legacyDocuments = await Promise.race([
        TransferMapping.find({
          $or: [
            { hasBonificationProcessing: { $exists: true } },
            { bonificationConfig: { $exists: true } },
          ],
        })
          .lean()
          .exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout buscando documentos legacy")),
            this.queryTimeout
          )
        ),
      ]);

      if (legacyDocuments.length > 0) {
        logger.warn(
          `⚠️ Encontrados ${legacyDocuments.length} documentos con campos legacy remanentes`
        );

        // Intentar limpiarlos nuevamente
        for (const doc of legacyDocuments.slice(0, 5)) {
          // Limitar a 5 para evitar timeout
          try {
            await Promise.race([
              TransferMapping.updateOne(
                { _id: doc._id },
                {
                  $unset: {
                    hasBonificationProcessing: "",
                    bonificationConfig: "",
                  },
                }
              ).exec(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("Timeout forzando limpieza")),
                  this.queryTimeout
                )
              ),
            ]);

            logger.info(`🔧 Forzada limpieza de mapping: ${doc.name}`);
          } catch (cleanError) {
            logger.error(
              `Error forzando limpieza de ${doc.name}: ${cleanError.message}`
            );
          }
        }
      }

      // Verificar documentos v2.0 - CON TIMEOUT
      const v2Documents = await Promise.race([
        TransferMapping.countDocuments({
          version: "2.0",
          bonificationProcessor: { $exists: true },
        }).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout contando documentos v2.0")),
            this.queryTimeout
          )
        ),
      ]);

      logger.info(
        `✅ Validación completa: ${v2Documents}/${this.results.total} documentos v2.0`
      );
    } catch (error) {
      logger.error(`Error en validación: ${error.message}`);
      // No relanzar error en validación para no bloquear el reporte
    }
  }

  /**
   * 📊 GENERAR REPORTE
   */
  generateReport() {
    logger.info("=".repeat(60));
    logger.info("📊 REPORTE DE LIMPIEZA LEGACY");
    logger.info("=".repeat(60));
    logger.info(`📋 Total de mappings procesados: ${this.results.total}`);
    logger.info(`✅ Mappings limpiados/actualizados: ${this.results.cleaned}`);
    logger.info(`⏭️ Mappings ya actualizados: ${this.results.skipped}`);
    logger.info(`❌ Errores encontrados: ${this.results.errors.length}`);
    logger.info("=".repeat(60));

    if (this.results.errors.length > 0) {
      logger.info("❌ ERRORES DETALLADOS:");
      this.results.errors.forEach((error, index) => {
        logger.info(`   ${index + 1}. ${error.operation}: ${error.error}`);
        if (error.mappingName) {
          logger.info(`      Mapping: ${error.mappingName}`);
        }
      });
      logger.info("=".repeat(60));
    }

    // Calcular porcentaje de éxito
    const successRate = (
      ((this.results.cleaned + this.results.skipped) / this.results.total) *
      100
    ).toFixed(1);
    logger.info(`🎯 Tasa de éxito: ${successRate}%`);

    if (successRate >= 100) {
      logger.info("🎉 ¡LIMPIEZA COMPLETADA CON ÉXITO!");
    } else if (successRate >= 90) {
      logger.info("✅ Limpieza mayormente exitosa, revisar errores menores");
    } else {
      logger.warn("⚠️ Limpieza parcial, se requiere revisión manual");
    }

    logger.info("=".repeat(60));
  }

  /**
   * 🔍 VERIFICAR ESTADO ACTUAL CON TIMEOUTS
   */
  async checkCurrentState() {
    try {
      logger.info("🔍 Verificando estado actual del sistema...");

      // ✅ ASEGURAR CONEXIÓN PRIMERO
      await this.ensureMongoConnection();

      const totalMappings = await Promise.race([
        TransferMapping.countDocuments({}).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout contando total de mappings")),
            this.queryTimeout
          )
        ),
      ]);

      const legacyMappings = await Promise.race([
        TransferMapping.countDocuments({
          $or: [
            { hasBonificationProcessing: { $exists: true } },
            { bonificationConfig: { $exists: true } },
          ],
        }).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout contando mappings legacy")),
            this.queryTimeout
          )
        ),
      ]);

      const v2Mappings = await Promise.race([
        TransferMapping.countDocuments({
          version: "2.0",
          bonificationProcessor: { $exists: true },
        }).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout contando mappings v2.0")),
            this.queryTimeout
          )
        ),
      ]);

      const enabledBonifications = await Promise.race([
        TransferMapping.countDocuments({
          "bonificationProcessor.enabled": true,
        }).exec(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error("Timeout contando bonificaciones habilitadas")),
            this.queryTimeout
          )
        ),
      ]);

      logger.info("📊 ESTADO ACTUAL:");
      logger.info(`   Total de mappings: ${totalMappings}`);
      logger.info(`   Con campos legacy: ${legacyMappings}`);
      logger.info(`   Con configuración v2.0: ${v2Mappings}`);
      logger.info(`   Con bonificaciones habilitadas: ${enabledBonifications}`);

      return {
        total: totalMappings,
        legacy: legacyMappings,
        v2: v2Mappings,
        enabled: enabledBonifications,
        needsCleanup: legacyMappings > 0,
      };
    } catch (error) {
      logger.error(`Error verificando estado: ${error.message}`);
      throw error;
    }
  }
}

/**
 * 🚀 FUNCIÓN PRINCIPAL PARA EJECUTAR LIMPIEZA
 */
async function runLegacyCleanup() {
  const cleanup = new LegacyCleanupService();
  return await cleanup.runCleanup();
}

/**
 * 🔍 FUNCIÓN PARA VERIFICAR ESTADO SIN LIMPIAR
 */
async function checkLegacyState() {
  const cleanup = new LegacyCleanupService();
  return await cleanup.checkCurrentState();
}

/**
 * 🎯 FUNCIÓN PARA LIMPIEZA ESPECÍFICA DE UN MAPPING
 */
async function cleanSpecificMapping(mappingId) {
  try {
    logger.info(`🎯 Limpiando mapping específico: ${mappingId}`);

    // ✅ ASEGURAR CONEXIÓN
    if (!MongoDbService.isConnected()) {
      await MongoDbService.connect();
    }

    const mapping = await TransferMapping.findById(mappingId);
    if (!mapping) {
      throw new Error(`Mapping ${mappingId} no encontrado`);
    }

    // Remover campos legacy
    await TransferMapping.updateOne(
      { _id: mappingId },
      {
        $unset: {
          hasBonificationProcessing: "",
          bonificationConfig: "",
        },
      }
    );

    // Asegurar configuración v2.0
    mapping.version = "2.0";
    if (!mapping.bonificationProcessor) {
      mapping.bonificationProcessor = {
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
      };
    }

    await mapping.save();

    logger.info(`✅ Mapping ${mapping.name} limpiado exitosamente`);
    return { success: true, mapping: mapping };
  } catch (error) {
    logger.error(`Error limpiando mapping específico: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 🔧 FUNCIÓN PARA VERIFICAR Y REPARAR CONEXIÓN MONGODB
 */
async function repairMongoConnection() {
  try {
    logger.info("🔧 Verificando y reparando conexión MongoDB...");

    // Verificar estado actual
    const connectionState = MongoDbService.getConnectionState();
    logger.info(`Estado actual: ${connectionState.stateName}`);

    if (connectionState.state === 1) {
      logger.info("✅ MongoDB ya está conectado correctamente");
      return { success: true, message: "MongoDB ya conectado" };
    }

    // Intentar desconectar y reconectar
    if (connectionState.state !== 0) {
      logger.info("🔄 Desconectando MongoDB...");
      await MongoDbService.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2 segundos
    }

    // Reconectar
    logger.info("🔗 Reconectando MongoDB...");
    const connected = await MongoDbService.connect();

    if (connected) {
      logger.info("✅ Conexión MongoDB reparada exitosamente");
      return { success: true, message: "Conexión reparada" };
    } else {
      throw new Error("No se pudo establecer conexión");
    }
  } catch (error) {
    logger.error(`Error reparando conexión MongoDB: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  LegacyCleanupService,
  runLegacyCleanup,
  checkLegacyState,
  cleanSpecificMapping,
  repairMongoConnection,
};

// 🚀 Si se ejecuta directamente
if (require.main === module) {
  const operation = process.argv[2] || "cleanup";

  switch (operation) {
    case "check":
      checkLegacyState()
        .then((state) => {
          console.log("Estado verificado. Ver logs para detalles.");
          console.log(
            `Resumen: ${state.legacy} legacy, ${state.v2} v2.0, ${state.total} total`
          );
          process.exit(state.needsCleanup ? 1 : 0);
        })
        .catch((error) => {
          console.error("Error verificando estado:", error.message);
          process.exit(1);
        });
      break;

    case "repair":
      repairMongoConnection()
        .then((result) => {
          console.log(
            result.success ? "Conexión reparada" : "Error reparando conexión"
          );
          process.exit(result.success ? 0 : 1);
        })
        .catch((error) => {
          console.error("Error reparando conexión:", error.message);
          process.exit(1);
        });
      break;

    case "cleanup":
    default:
      runLegacyCleanup()
        .then((results) => {
          console.log("Limpieza completada. Ver logs para detalles.");
          console.log(
            `Resumen: ${results.cleaned} limpiados, ${results.errors.length} errores`
          );
          process.exit(results.errors.length > 0 ? 1 : 0);
        })
        .catch((error) => {
          console.error("Error en limpieza:", error.message);
          process.exit(1);
        });
      break;
  }
}
