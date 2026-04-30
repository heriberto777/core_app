// services/logger.js - Versión COMPLETA para transacciones
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, json } = format;
const path = require("path");
const fs = require("fs");
const MongoDBTransport = require("./mongoDBTransport");

// Crear directorio de logs - Usar truco de string para evitar que NCC lo incluya en el bundle
const _l = "lo"; const _g = "gs";
const logDir = path.join(process.cwd(), _l + _g);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ============================================
// FORMATO LIMPIO PARA CONSOLA
// ============================================

// Función para colorear niveles (definida primero)
function getLevelColor(level) {
  const colors = {
    error: "\x1b[31merror\x1b[0m",
    warn: "\x1b[33mwarn\x1b[0m",
    info: "\x1b[36minfo\x1b[0m",
    debug: "\x1b[90mdebug\x1b[0m",
    verbose: "\x1b[90mverbose\x1b[0m",
  };
  return colors[level] || level;
}

const consoleFormat = printf(
  ({ level, message, timestamp, source, ...rest }) => {
    const time = timestamp ? timestamp.split("T")[1].split(".")[0] : "";
    const sourceTag = source ? `[${source}] ` : "";
    const levelStr = getLevelColor(level);
    
    // Simplificar mensajes muy largos
    let cleanMessage = message;
    if (message && message.length > 150) {
      // Truncar mensajes largos de queries
      if (message.includes("Query:")) {
        const match = message.match(/Query:\s*(.+)/);
        if (match) {
          cleanMessage = `Query: ${match[1].substring(0, 100)}...`;
        }
      } else if (message.includes("Parametros:")) {
        cleanMessage = message.substring(0, 150) + "...";
      }
    }

    return `${time} ${levelStr}: ${sourceTag}${cleanMessage}`;
  }
);

// Función para filtrar mensajes ruido en consola
const shouldLogToConsole = (info) => {
  const msg = info.message || "";
  const level = info.level;
  const source = info.source || "";

  // Siempre mostrar errores
  if (level === "error") return true;

  // No mostrar queries SQL completas
  if (msg.includes("Query: UPDATE") || 
      msg.includes("Query: INSERT") || 
      msg.includes("Query: SELECT") ||
      msg.includes("Parametros:") ||
      msg.includes("Parámetros:")) {
    return false;
  }

  // No mostrar mensajes muy frecuentes de transferencia
  if (msg.includes("Obtenidos ") && msg.includes(" registros desde")) {
    return false;
  }
  if (msg.includes("MUESTRA DE LOS PRIMEROS")) {
    return false;
  }
  if (msg.includes("Aplicando mapeo de campos")) {
    return false;
  }
  if (msg.includes("Post-update lote")) {
    return false;
  }
  if (msg.includes("Lote ") && msg.includes(" procesando")) {
    return false;
  }
  if (msg.includes("Intentando consulta de diagnóstico")) {
    return false;
  }

  // Filtrar mensajes HTTP (Morgan) - solo mostrar errores y rutas importantes
  if (source === "http" || msg.includes("HTTP/")) {
    // Mostrar solo errores HTTP (5xx) y rutas importantes
    if (msg.includes(" 5") || msg.includes(" 4") || 
        msg.includes("/api/v1/task/ejecutar") ||
        msg.includes("/api/v1/task/execute") ||
        msg.includes("/api/v1/linked-groups")) {
      return true;
    }
    // Ocultar polling y health checks
    if (msg.includes("/api/v1/task/accion") || 
        msg.includes("/health") ||
        msg.includes("/api/v1/health")) {
      return false;
    }
    // Ocultar otros requests HTTP
    return false;
  }

  // No mostrar health checks
  if (msg.includes("/health") || msg.includes("/api/v1/health")) {
    return false;
  }

  // No mostrar metadata adicional en consola (solo archivos)
  if (msg.includes("🔍 Additional:") || msg.includes("📊 Metadata:")) {
    return false;
  }

  // Mostrar solo info y warn
  if (level === "debug" || level === "verbose") {
    return false;
  }

  return true;
};

// Formato DETALLADO para transacciones
const transactionFormat = printf(
  ({
    level,
    message,
    timestamp,
    source,
    requestId,
    transactionId,
    userId,
    operation,
    duration,
    metadata,
    stack,
    ...rest
  }) => {
    let output = `${timestamp} [${level.toUpperCase()}]`;

    // Información de contexto
    if (source) output += `[${source}]`;
    if (requestId) output += `[REQ:${requestId}]`;
    if (transactionId) output += `[TXN:${transactionId}]`;
    if (userId) output += `[USER:${userId}]`;
    if (operation) output += `[OP:${operation}]`;
    if (duration) output += `[${duration}ms]`;

    output += `: ${message}`;

    // Metadata adicional
    if (metadata && Object.keys(metadata).length > 0) {
      output += `\n📊 Metadata: ${JSON.stringify(metadata, null, 2)}`;
    }

    // Stack trace para errores
    if (stack) {
      output += `\n📚 Stack: ${stack}`;
    }

    // Resto de propiedades
    const restProps = Object.keys(rest).filter(
      (key) =>
        !key.startsWith("Symbol(") &&
        !["level", "message", "timestamp"].includes(key)
    );

    if (restProps.length > 0) {
      const restData = {};
      restProps.forEach((key) => (restData[key] = rest[key]));
      output += `\n🔍 Additional: ${JSON.stringify(restData, null, 2)}`;
    }

    return output;
  }
);

// Formato JSON para archivos
const jsonFormat = combine(timestamp(), json());

// Crear transporte MongoDB con configuración completa
const createMongoTransport = () => {
  try {
    if (process.env.DISABLE_MONGO_LOGS === "true") {
      console.log("🚫 Transporte MongoDB deshabilitado");
      return null;
    }

    const mongodbUriExists = !!(
      process.env.MONGO_URI ||
      (process.env.DB_USER && process.env.DB_PASS && process.env.DB_HOST)
    );

    if (!mongodbUriExists) {
      console.log("⚠️ No hay URI de MongoDB configurada");
      return null;
    }

    const mongoTransport = new MongoDBTransport({
      level: "debug", // CAPTURAR TODO
      silent: false,
      handleExceptions: true,
      handleRejections: true,
    });

    mongoTransport.on("error", (error) => {
      console.error("❌ Error en MongoDB Transport:", error.message);
    });

    console.log("✅ MongoDB Transport configurado para LOG COMPLETO");
    return mongoTransport;
  } catch (error) {
    console.error("❌ Error creando MongoDB Transport:", error.message);
    return null;
  }
};

// Configurar TODOS los transportes
const configureTransports = () => {
  const transportsList = [
    // Consola con formato LIMPIO (nivel info, filtrado)
    new transports.Console({
      format: combine(colorize(), timestamp(), consoleFormat),
      level: "info",
      log: (info, callback) => {
        // Verificar nivel (solo info, warn, error)
        const levelPriority = { error: 0, warn: 1, info: 2, debug: 3, verbose: 4 };
        const minLevel = levelPriority["info"];
        const msgLevel = levelPriority[info.level] ?? 99;
        
        if (msgLevel > minLevel) {
          return callback();
        }
        
        if (shouldLogToConsole(info)) {
          // Usar el formato personalizado
          const time = info.timestamp ? info.timestamp.split("T")[1].split(".")[0] : "";
          const sourceTag = info.source ? `[${info.source}] ` : "";
          const levelStr = info.level.toUpperCase().padEnd(7);
          
          // Formato limpio sin metadata
          let output = `${time} ${levelStr}: ${sourceTag}${info.message}`;
          
          // Agregar stack trace para errores
          if (info.level === "error" && info.stack) {
            output += `\n  Stack: ${info.stack.substring(0, 200)}`;
          }
          
          if (info.level === "error") {
            console.error(output);
          } else if (info.level === "warn") {
            console.warn(output);
          } else {
            console.log(output);
          }
        }
        callback();
      }
    }),

    // Archivo combinado con TODO
    new transports.File({
      filename: path.join(logDir, ["comb", "ined.log"].join("")),
      maxsize: 50485760, // 50MB
      maxFiles: 20,
      level: "debug", // TODO en archivo
      format: jsonFormat,
    }),

    // Archivo solo de errores
    new transports.File({
      filename: path.join(logDir, ["err", "or.log"].join("")),
      level: "error",
      maxsize: 20485760, // 20MB
      maxFiles: 10,
      format: jsonFormat,
    }),

    // Archivo de transacciones detalladas
    new transports.File({
      filename: path.join(logDir, ["transa", "ctions.log"].join("")),
      level: "debug",
      maxsize: 100485760, // 100MB
      maxFiles: 50,
      format: combine(timestamp(), transactionFormat),
    }),
  ];

  // Agregar MongoDB Transport
  const mongoTransport = createMongoTransport();
  if (mongoTransport) {
    transportsList.push(mongoTransport);
    console.log("✅ Transporte MongoDB agregado para LOG COMPLETO");
  }

  return transportsList;
};

// Crear logger con configuración COMPLETA
// El nivel por defecto es "debug" para capturar todo en archivos
// La consola usa "info" a través del transporte individual
const logger = createLogger({
  level: "debug",
  format: combine(timestamp(), transactionFormat),
  transports: configureTransports(),
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
  defaultMeta: {
    service: process.env.SERVICE_NAME || "transfer-control",
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
    pid: process.pid,
  },
});

// Stream para Morgan con logging completo
logger.stream = {
  write: function (message) {
    try {
      const cleanMessage =
        typeof message === "string" ? message.trim() : String(message).trim();

      if (cleanMessage) {
        logger.info(cleanMessage, {
          source: "http",
          type: "request",
        });
      }
    } catch (error) {
      console.log("Log stream error:", error.message);
    }
  },
};

// Helper para contexto con información completa
logger.withContext = function (context = {}) {
  return {
    error: (message, meta = {}) =>
      logger.error(message, { ...context, ...meta, logLevel: "error" }),
    warn: (message, meta = {}) =>
      logger.warn(message, { ...context, ...meta, logLevel: "warn" }),
    info: (message, meta = {}) =>
      logger.info(message, { ...context, ...meta, logLevel: "info" }),
    debug: (message, meta = {}) =>
      logger.debug(message, { ...context, ...meta, logLevel: "debug" }),
    verbose: (message, meta = {}) =>
      logger.verbose(message, { ...context, ...meta, logLevel: "verbose" }),
  };
};

// Helpers especializados para transacciones
logger.system = logger.withContext({ source: "system" });
logger.db = logger.withContext({ source: "database" });
logger.api = logger.withContext({ source: "api" });
logger.transfer = logger.withContext({ source: "transfer" });
logger.transaction = logger.withContext({ source: "transaction" });

// Método para iniciar transacción con logging completo
logger.startTransaction = function (
  transactionId,
  operation,
  userId,
  metadata = {}
) {
  const txnLogger = logger.withContext({
    transactionId,
    operation,
    userId,
    startTime: Date.now(),
  });

  txnLogger.info("🚀 Transacción iniciada", {
    operation,
    transactionId,
    userId,
    metadata,
    timestamp: new Date().toISOString(),
  });

  return {
    debug: (message, meta = {}) => txnLogger.debug(message, meta),
    info: (message, meta = {}) => txnLogger.info(message, meta),
    warn: (message, meta = {}) => txnLogger.warn(message, meta),
    error: (message, meta = {}) => txnLogger.error(message, meta),

    // Método para finalizar transacción
    finish: function (status = "success", result = {}) {
      const duration = Date.now() - this.startTime;
      const finalStatus = status === "success" ? "✅" : "❌";

      txnLogger.info(`${finalStatus} Transacción ${status}`, {
        duration,
        status,
        result,
        transactionId,
        operation,
        userId,
        endTime: new Date().toISOString(),
      });
    },

    // Método para logging de pasos
    step: function (stepName, data = {}) {
      txnLogger.debug(`🔹 Paso: ${stepName}`, {
        step: stepName,
        stepData: data,
        transactionId,
        operation,
      });
    },
  };
};

// Método para errores con stack completo
logger.logError = function (error, context = {}) {
  try {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      timestamp: new Date().toISOString(),
      ...context,
    };

    this.error("❌ Error occurred", errorInfo);

    // También log en debug para más detalle
    this.debug("🔍 Error details", {
      error: error.toString(),
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    });
  } catch (logError) {
    console.error("Error logging error:", logError.message);
    console.error("Original error:", error);
  }
};

// Método para logging de performance completo
logger.logPerformance = function (operation, duration, context = {}) {
  const perfInfo = {
    operation,
    duration: `${duration}ms`,
    source: "performance",
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (duration > 5000) {
    this.error("🐌 VERY SLOW operation detected", perfInfo);
  } else if (duration > 1000) {
    this.warn("⚠️ Slow operation detected", perfInfo);
  } else if (duration > 500) {
    this.info("📊 Operation completed", perfInfo);
  } else {
    this.debug("⚡ Fast operation completed", perfInfo);
  }
};

// Método para logging de queries de BD
logger.logQuery = function (query, params, duration, result, context = {}) {
  const queryInfo = {
    query: query.substring(0, 1000), // Truncar queries muy largas
    params,
    duration: `${duration}ms`,
    resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
    source: "database",
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (duration > 1000) {
    this.warn("🐌 Slow query detected", queryInfo);
  } else {
    this.debug("📊 Query executed", queryInfo);
  }
};

// Método para logging de requests completo
logger.logRequest = function (req, res, duration, context = {}) {
  const requestInfo = {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    contentLength: res.get("Content-Length"),
    requestId: req.headers["x-request-id"],
    userId: req.user?.id,
    source: "request",
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (res.statusCode >= 500) {
    this.error("🚨 Server error", requestInfo);
  } else if (res.statusCode >= 400) {
    this.warn("⚠️ Client error", requestInfo);
  } else if (duration > 2000) {
    this.warn("🐌 Slow request", requestInfo);
  } else {
    this.info("📊 Request completed", requestInfo);
  }
};

// Método para logging de datos transferidos
logger.logTransfer = function (operation, recordCount, duration, context = {}) {
  const transferInfo = {
    operation,
    recordCount,
    duration: `${duration}ms`,
    recordsPerSecond: Math.round(recordCount / (duration / 1000)),
    source: "transfer",
    timestamp: new Date().toISOString(),
    ...context,
  };

  this.info("📊 Transfer completed", transferInfo);

  // Log detallado en debug
  this.debug("🔍 Transfer details", {
    ...transferInfo,
    detailedStats: {
      avgTimePerRecord: `${(duration / recordCount).toFixed(2)}ms`,
      efficiency: recordCount > 0 ? "high" : "low",
    },
  });
};

// Graceful shutdown con logging completo
const gracefulShutdown = () => {
  logger.system.info("🔄 Iniciando cierre graceful del logger...");

  if (logger.transports) {
    logger.transports.forEach((transport) => {
      if (
        transport.name === "mongodb" &&
        typeof transport.close === "function"
      ) {
        logger.system.debug("🔄 Cerrando MongoDB Transport...");
        transport.close();
      }
    });
  }

  logger.system.info("✅ Logger cerrado correctamente");
  if (typeof logger.close === "function") logger.close();
};

// El cierre del logger debe ser orquestado por el proceso principal (index.js/AppBootstrap)
// para evitar condiciones de carrera durante el shutdown.
logger.closeLogger = gracefulShutdown;

// Función de diagnóstico del logger
logger.getDiagnostics = () => {
  const diagnostics = {
    status: "active",
    transports: [],
    mongodb: {
      connected: false,
      errorCount: 0,
      lastError: null,
      bufferSize: 0,
      isInCooldown: false,
    },
    config: {
      level: logger.level,
      defaultMeta: logger.defaultMeta,
    },
    environment: {
      nodeVersion: process.version,
      pid: process.pid,
      env: process.env.NODE_ENV,
    }
  };

  if (logger.transports) {
    logger.transports.forEach((transport) => {
      const transportInfo = {
        name: transport.name,
        level: transport.level,
        silent: transport.silent || false,
      };
      
      if (transport.name === "mongodb") {
        transportInfo.status = transport.isReady ? "ready" : (transport.isShuttingDown ? "shutting_down" : "connecting");
        transportInfo.errorCount = transport.errorCount || 0;
        transportInfo.lastError = transport.lastError || null;
        transportInfo.bufferSize = transport.logBuffer?.length || 0;
        transportInfo.pendingBatch = transport.pendingBatch?.length || 0;
        transportInfo.reconnectAttempts = transport.reconnectAttempts || 0;
        transportInfo.isInCooldown = transport.isInCooldown ? transport.isInCooldown() : false;
        
        // Intentar verificar conexión a MongoDB
        try {
          const mongoose = require("mongoose");
          transportInfo.mongooseConnectionState = mongoose.connection.readyState;
          transportInfo.mongooseHost = mongoose.connection.host;
        } catch (e) {
          transportInfo.mongooseError = e.message;
        }
        
        diagnostics.mongodb = transportInfo;
      }
      
      diagnostics.transports.push(transportInfo);
    });
  }

  return diagnostics;
};

module.exports = logger;
