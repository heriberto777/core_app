// models/loggerModel.js - Versión corregida
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
    timestamps: false, // Ya tenemos timestamp manual
    collection: "logs", // Especificar nombre de colección
    versionKey: false, // Quitar __v
  }
);

logSchema.index({ timestamp: -1 });

// Índices compuestos para consultas comunes
logSchema.index({ level: 1, timestamp: -1 }); // Buscar por nivel y fecha
logSchema.index({ source: 1, timestamp: -1 }); // Buscar por fuente y fecha
logSchema.index({ level: 1, source: 1, timestamp: -1 }); // Búsqueda combinada

// ✅ ÍNDICE TTL MEJORADO - Solo si está habilitado
if (process.env.AUTO_DELETE_LOGS !== "false") {
  const ttlDays = parseInt(process.env.LOG_TTL_DAYS || "90");
  // Solo crear el índice TTL si no existe ya el índice principal de timestamp
  logSchema.index(
    { timestamp: 1 }, // Ascendente para TTL
    {
      expireAfterSeconds: ttlDays * 24 * 60 * 60,
      background: true,
      name: "log_ttl_index", // Nombre específico para evitar conflictos
    }
  );
}

// Método estático mejorado para crear logs (sin sesiones)
logSchema.statics.createLog = async function (level, message, options = {}) {
  try {
    const { source, stack, metadata, user, ip } = options;

    // Validar nivel
    const validLevels = ["error", "warn", "info", "debug"];
    const sanitizedLevel = validLevels.includes(level) ? level : "info";

    // Validar y sanitizar mensaje
    if (!message || typeof message !== "string") {
      message = String(message || "Empty log message");
    }
    const sanitizedMessage = message.substring(0, 1000);

    const sanitizedSource = String(source || "app").substring(0, 100);

    const logData = {
      level: sanitizedLevel,
      message: sanitizedMessage,
      timestamp: new Date(),
      source: sanitizedSource,
    };

    // Agregar campos opcionales solo si tienen valor
    if (stack && typeof stack === "string") {
      logData.stack = stack.substring(0, 2000);
    }

    if (metadata) {
      logData.metadata = this.sanitizeMetadata(metadata);
    }

    if (user && typeof user === "string") {
      logData.user = user.substring(0, 100);
    }

    if (ip && typeof ip === "string") {
      logData.ip = ip.substring(0, 45);
    }

    const log = new this(logData);

    // ✅ Usar save con opciones específicas para evitar problemas de sesión
    return await log.save({
      session: null,
      validateBeforeSave: true,
      // Usar writeConcern menos estricto para mejor rendimiento
      writeConcern: { w: 1, j: false },
    });
  } catch (error) {
    // Solo emitir evento si no es un error de validación simple
    if (error.name !== "ValidationError") {
      process.emit("logError", {
        originalError: error,
        context: "createLog",
        level,
        message:
          typeof message === "string"
            ? message.substring(0, 100)
            : "Invalid message",
      });
    }
    return null;
  }
};

// Método para sanitizar metadata
logSchema.statics.sanitizeMetadata = function (metadata) {
  if (!metadata || typeof metadata !== "object") return undefined;

  try {
    // Convertir a JSON para verificar serializabilidad
    const jsonStr = JSON.stringify(metadata);

    // Limitar tamaño para evitar documentos muy grandes
    if (jsonStr.length > 5000) {
      return {
        _truncated: true,
        _originalSize: jsonStr.length,
        _sample: JSON.parse(jsonStr.substring(0, 1000) + "}"),
      };
    }

    return metadata;
  } catch (error) {
    return { _error: "Error serializando metadata" };
  }
};

// Método estático mejorado para limpiar logs antiguos
logSchema.statics.cleanOldLogs = async function (
  daysToKeep = 30,
  batchSize = 1000
) {
  try {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysToKeep);

    let totalDeleted = 0;
    let deletedInBatch = 0;

    // Eliminar en lotes para evitar timeouts en colecciones grandes
    do {
      const result = await this.deleteMany(
        { timestamp: { $lt: limitDate } },
        { limit: batchSize }
      );

      deletedInBatch = result.deletedCount;
      totalDeleted += deletedInBatch;

      // Pausa pequeña entre lotes para no sobrecargar la DB
      if (deletedInBatch > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (deletedInBatch === batchSize);

    return totalDeleted;
  } catch (error) {
    process.emit("logError", error);
    return 0;
  }
};

// Método para obtener estadísticas de logs
logSchema.statics.getLogStats = async function (hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await this.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await this.countDocuments({ timestamp: { $gte: since } });

    return {
      total,
      byLevel: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      period: `${hours} hours`,
    };
  } catch (error) {
    process.emit("logError", error);
    return { total: 0, byLevel: {}, error: error.message };
  }
};

// Middleware pre-save para validaciones adicionales
logSchema.pre("save", function (next) {
  // Asegurar que el timestamp sea válido
  if (!this.timestamp || isNaN(this.timestamp.getTime())) {
    this.timestamp = new Date();
  }

  // Truncar campos si son muy largos
  if (this.message && this.message.length > 1000) {
    this.message = this.message.substring(0, 997) + "...";
  }

  if (this.stack && this.stack.length > 2000) {
    this.stack = this.stack.substring(0, 1997) + "...";
  }

  next();
});

module.exports = mongoose.model("Log", logSchema);
