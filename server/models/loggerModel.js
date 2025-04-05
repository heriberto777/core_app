// models/loggerModel.js
const mongoose = require("mongoose");

/**
 * Esquema para almacenar logs en MongoDB
 * Optimizado para consultas eficientes y retention policy
 */
const logSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      required: true,
      enum: ["error", "warn", "info", "debug"],
      index: true, // Indexar para búsquedas más rápidas
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "app",
      index: true, // Para identificar el origen (módulo/servicio)
    },
    stack: {
      type: String,
    }, // Para errores, almacenar stack trace
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    }, // Datos adicionales opcionales
    user: {
      type: String,
    }, // Usuario que realizó la acción (si aplica)
    ip: {
      type: String,
    }, // Dirección IP de origen (si aplica)
  },
  {
    timestamps: true, // Añadir createdAt y updatedAt automáticamente
  }
);

// Método estático para simplificar la creación de logs
logSchema.statics.createLog = async function (level, message, options = {}) {
  try {
    const { source, stack, metadata, user, ip } = options;

    const log = new this({
      level,
      message,
      source,
      stack,
      metadata,
      user,
      ip,
    });

    return await log.save();
  } catch (error) {
    console.error("Error al guardar log:", error);
    // En caso de error, no queremos que falle la aplicación
    return null;
  }
};

// Método estático para limpiar logs antiguos
logSchema.statics.cleanOldLogs = async function (daysToKeep = 30) {
  try {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysToKeep);

    const result = await this.deleteMany({
      timestamp: { $lt: limitDate },
    });

    return result.deletedCount;
  } catch (error) {
    console.error("Error al limpiar logs antiguos:", error);
    return 0;
  }
};

// Crear un índice TTL para eliminar automáticamente logs antiguos
// Solo si no se ha configurado en la aplicación otro mecanismo
if (process.env.AUTO_DELETE_LOGS !== "false") {
  const ttlDays = parseInt(process.env.LOG_TTL_DAYS || "90");
  logSchema.index(
    { timestamp: 1 },
    {
      expireAfterSeconds: ttlDays * 24 * 60 * 60,
      background: true,
    }
  );
}

module.exports = mongoose.model("Log", logSchema);
