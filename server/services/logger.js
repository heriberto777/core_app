// services/logger.js - Versión COMPLETA con interceptores automáticos
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, json } = format;
const path = require("path");
const fs = require("fs");
const Module = require("module");
const MongoDBTransport = require("./mongoDBTransport");

// Crear directorio de logs
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

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
    caller,
    suggestions,
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

    // ⭐ INFORMACIÓN DEL CALLER ⭐
    if (caller) {
      const fileName = path.basename(caller.fileName || "unknown");
      const lineInfo = `${fileName}:${caller.lineNumber}`;
      const functionInfo = caller.functionName
        ? `${caller.functionName}()`
        : "<anonymous>";
      output += `\n📍 Ubicación: ${lineInfo} en ${functionInfo}`;
    }

    // ⭐ SUGERENCIAS AUTOMÁTICAS ⭐
    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
      output += `\n💡 Sugerencias:`;
      suggestions.forEach((suggestion, index) => {
        output += `\n   ${index + 1}. ${suggestion}`;
      });
    }

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
      level: "debug",
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
    new transports.Console({
      format: combine(colorize(), timestamp(), transactionFormat),
      level: "debug",
    }),
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 50485760,
      maxFiles: 20,
      level: "debug",
      format: jsonFormat,
    }),
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 20485760,
      maxFiles: 10,
      format: jsonFormat,
    }),
    new transports.File({
      filename: path.join(logDir, "transactions.log"),
      level: "debug",
      maxsize: 100485760,
      maxFiles: 50,
      format: combine(timestamp(), transactionFormat),
    }),
  ];

  const mongoTransport = createMongoTransport();
  if (mongoTransport) {
    transportsList.push(mongoTransport);
    console.log("✅ Transporte MongoDB agregado para LOG COMPLETO");
  }

  return transportsList;
};

// Crear logger con configuración COMPLETA
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

// ⭐ INTERCEPTORES AUTOMÁTICOS DE ERRORES ⭐

// Helper para obtener información del caller
function getCaller() {
  const originalFunc = Error.prepareStackTrace;
  let callerInfo = {
    fileName: "unknown",
    lineNumber: 0,
    functionName: "unknown",
  };

  try {
    const err = new Error();
    Error.prepareStackTrace = (err, stack) => stack;
    const stack = err.stack;

    for (let i = 1; i < stack.length; i++) {
      const caller = stack[i];
      const fileName = caller.getFileName();

      if (
        fileName &&
        !fileName.includes("node_modules") &&
        !fileName.includes("logger.js") &&
        !fileName.includes("internal/") &&
        fileName.includes("server/")
      ) {
        callerInfo = {
          fileName: fileName.replace(process.cwd(), ""),
          lineNumber: caller.getLineNumber(),
          functionName:
            caller.getFunctionName() || caller.getMethodName() || "<anonymous>",
          typeName: caller.getTypeName(),
        };
        break;
      }
    }
  } catch (e) {
    // Silencioso si falla
  }

  Error.prepareStackTrace = originalFunc;
  return callerInfo;
}

// ⭐ INTERCEPTOR DE CONSOLE.ERROR ⭐
const originalConsoleError = console.error;
console.error = function (...args) {
  originalConsoleError.apply(console, args);

  const errorMessage = args.join(" ");
  const caller = getCaller();

  logger.error(`🔍 CONSOLE ERROR INTERCEPTADO: ${errorMessage}`, {
    source: "console_error",
    caller: caller,
    args: args,
    stack: new Error().stack,
  });
};

// ⭐ INTERCEPTOR DE REQUIRE() ⭐
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (error) {
    const caller = getCaller();

    if (error.code === "MODULE_NOT_FOUND") {
      logger.error(`❌ MÓDULO NO ENCONTRADO: ${id}`, {
        source: "require_error",
        errorCode: error.code,
        requestedModule: id,
        caller: caller,
        availablePaths: module.paths.slice(0, 3),
        stack: error.stack,
        suggestions: [
          `¿Existe el archivo/módulo ${id}?`,
          `¿La ruta es correcta?`,
          `¿Está instalado el paquete npm?`,
        ],
      });
    } else {
      logger.error(`❌ ERROR AL CARGAR MÓDULO: ${id}`, {
        source: "require_error",
        errorCode: error.code,
        requestedModule: id,
        caller: caller,
        errorMessage: error.message,
        stack: error.stack,
      });
    }

    throw error;
  }
};

// ⭐ MÉTODO PARA CAPTURA INTELIGENTE DE ERRORES ⭐
logger.captureError = function (error, context = {}) {
  const caller = getCaller();
  const errorType = error.constructor.name;
  const errorMessage = error.message || error.toString() || "Error sin mensaje";

  let errorCategory = "general_error";
  let suggestions = [];

  if (
    errorMessage.includes("Cannot read prop") ||
    errorMessage.includes("undefined")
  ) {
    errorCategory = "undefined_property";
    suggestions = [
      "¿El objeto está correctamente inicializado?",
      "¿Importaste todos los módulos necesarios?",
      "¿Verificaste que la variable no sea null/undefined?",
    ];
  } else if (errorMessage.includes("is not a function")) {
    errorCategory = "not_a_function";
    suggestions = [
      "¿El método existe en el objeto?",
      "¿Importaste correctamente el módulo?",
      "¿El objeto tiene ese método disponible?",
    ];
  } else if (errorMessage.includes("Cannot find module")) {
    errorCategory = "module_not_found";
    suggestions = [
      "¿Existe el archivo en la ruta especificada?",
      "¿La ruta relativa es correcta?",
      "¿Instalaste el paquete npm?",
    ];
  } else if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    errorCategory = "connection_error";
    suggestions = [
      "¿El servidor de base de datos está corriendo?",
      "¿La configuración de conexión es correcta?",
      "¿Hay problemas de red o firewall?",
    ];
  }

  this.error(`🚨 ${errorCategory.toUpperCase()}: ${errorMessage}`, {
    source: "error_capture",
    errorType: errorType,
    errorCategory: errorCategory,
    caller: caller,
    context: context,
    stack: error.stack,
    suggestions: suggestions,
    timestamp: new Date().toISOString(),
  });
};

// Stream para Morgan
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

// Resto de métodos existentes (logQuery, logRequest, logTransfer, etc.)
logger.logQuery = function (query, duration, result, context = {}) {
  const queryInfo = {
    query: query.length > 200 ? query.substring(0, 200) + "..." : query,
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
  this.debug("🔍 Transfer details", {
    ...transferInfo,
    detailedStats: {
      avgTimePerRecord: `${(duration / recordCount).toFixed(2)}ms`,
      efficiency: recordCount > 0 ? "high" : "low",
    },
  });
};

// ⭐ AUTO-CAPTURA DE PROMISES RECHAZADAS ⭐
process.on("unhandledRejection", (reason, promise) => {
  const caller = getCaller();

  logger.error("❌ PROMESA RECHAZADA NO MANEJADA", {
    source: "unhandled_rejection",
    reason: reason?.message || reason,
    promiseDetails: promise.toString(),
    caller: caller,
    stack: reason?.stack,
    suggestions: [
      "Agrega .catch() a todas las promesas",
      "Usa try-catch en funciones async",
      "Verifica que todos los await tengan manejo de errores",
    ],
  });
});

// ⭐ AUTO-CAPTURA DE EXCEPCIONES NO MANEJADAS ⭐
process.on("uncaughtException", (error) => {
  const caller = getCaller();

  logger.error("💥 EXCEPCIÓN NO CAPTURADA - CRÍTICO", {
    source: "uncaught_exception",
    error: error.message,
    caller: caller,
    stack: error.stack,
    suggestions: [
      "Revisa el stack trace para encontrar el origen",
      "Agrega try-catch apropiado",
      "Verifica inicializaciones de objetos",
    ],
  });

  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Graceful shutdown
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
  logger.close();
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Log de inicialización con interceptores
logger.system.info("🚀 Sistema de logging inicializado", {
  level: "debug",
  transports: logger.transports.length,
  mongoEnabled: logger.transports.some((t) => t.name === "mongodb"),
  interceptors: [
    "console.error",
    "Module.require",
    "unhandledRejection",
    "uncaughtException",
  ],
  timestamp: new Date().toISOString(),
});

module.exports = logger;
