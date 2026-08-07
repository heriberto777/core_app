// scripts/ensureConfigSingletonIndex.js
//
// La app corre con mongoose.set("autoIndex", false) en producción
// (mongoDbService.js), así que declarar "unique: true" en un schema NO crea
// un índice real por sí solo — hay que crearlo a mano, igual que este script
// hace. Sin este índice, dos upserts concurrentes sobre el documento Config
// (scheduler) podrían crear dos documentos en vez de uno solo.
//
// Ejecutar una sola vez por entorno: node scripts/ensureConfigSingletonIndex.js

const Config = require("../models/configModel");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

async function ensureConfigSingletonIndex() {
  try {
    console.log("🚀 Verificando índice único de Config...");

    await connectToDatabase();

    // Documentos existentes (de antes de este fix) no tienen el campo
    // "singleton" — sin backfillearlos primero, el filtro {singleton:
    // "singleton"} que usa transferTaskController no los encontraría y
    // terminaría creando un documento nuevo en vez de reutilizar el actual.
    const backfillResult = await Config.updateMany(
      { singleton: { $exists: false } },
      { $set: { singleton: "singleton" } }
    );
    console.log(`🔧 Documentos actualizados con singleton: ${backfillResult.modifiedCount}`);

    const count = await Config.countDocuments();
    if (count > 1) {
      console.warn(
        `⚠️ Hay ${count} documentos en Config — el índice único no se puede crear ` +
        `hasta resolver manualmente cuál es el correcto y eliminar los demás.`
      );
      return { success: false, reason: "duplicate_documents", count };
    }

    await Config.collection.createIndex(
      { singleton: 1 },
      { unique: true, name: "singleton_unique" }
    );
    console.log("✅ Índice único 'singleton_unique' creado (o ya existía)");

    return { success: true };
  } catch (error) {
    console.error("❌ Error creando índice único de Config:", error);
    throw error;
  } finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  ensureConfigSingletonIndex()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { ensureConfigSingletonIndex };
