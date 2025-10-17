// services/logger.js - Versión COMPLETA con interceptores automáticos y corrección robusta
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

    if (source) output += `[${source}]`;
    if (requestId) output += `[REQ:${requestId}]`;
    if (transactionId) output += `[TXN:${transactionId}]`;
    if (userId) output += `[USER:${userId}]`;
    if (operation) output += `[OP:${operation}]`;
    if (duration) output += `[${duration}ms]`;

    output += `: ${message}`;

    if (caller) {
      const fileName = path.basename(caller.fileName || "unknown");
      const lineInfo = `${fileName}:${caller.lineNumber}`;
      const functionInfo = caller.functionName
        ? `${caller.functionName}()`
        : "<anonymous>";
      output += `\n🔍 Ubicación: ${lineInfo} en ${functionInfo}`;
    }

    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
      output += `\n💡 Sugerencias:`;
      suggestions.forEach((s, i) => (output += `\n   ${i + 1}. ${s}`));
    }

    if (metadata && Object.keys(metadata).length > 0) {
      output += `\n📊 Metadata: ${JSON.stringify(metadata, null, 2)}`;
    }

    if (stack) output += `\n📚 Stack: ${stack}`;

    const restProps = Object.keys(rest).filter(
      (k) => !["level", "message", "timestamp"].includes(k)
    );
    if (restProps.length > 0) {
      const restData = {};
      restProps.forEach((k) => (restData[k] = rest[k]));
      output += `\n🔍 Additional: ${JSON.stringify(restData, null, 2)}`;
    }

    return output;
  }
);

// Formato JSON para archivos
const jsonFormat = combine(timestamp(), json());

// Crear transporte MongoDB
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
      handleExceptions: true,
      handleRejections: true,
    });

    mongoTransport.on("error", (err) =>
      console.error("❌ Error en MongoDB Transport:", err.message)
    );

    console.log("✅ MongoDB Transport configurado para LOG COMPLETO");
    return mongoTransport;
  } catch (error) {
    console.error("❌ Error creando MongoDB Transport:", error.message);
    return null;
  }
};

// Configurar transportes
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
  if (mongoTransport) transportsList.push(mongoTransport);

  return transportsList;
};

// Crear logger base
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

// Obtener información del caller
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
        fileName.includes("server/")
      ) {
        callerInfo = {
          fileName: fileName.replace(process.cwd(), ""),
          lineNumber: caller.getLineNumber(),
          functionName:
            caller.getFunctionName() || caller.getMethodName() || "<anonymous>",
        };
        break;
      }
    }
  } catch {}
  Error.prepareStackTrace = originalFunc;
  return callerInfo;
}

// Interceptar console.error
const originalConsoleError = console.error;
console.error = function (...args) {
  originalConsoleError.apply(console, args);
  const errorMessage = args.join(" ");
  const caller = getCaller();
  logger.error(`🔍 CONSOLE ERROR INTERCEPTADO: ${errorMessage}`, {
    source: "console_error",
    caller,
    args,
    stack: new Error().stack,
  });
};

// Método principal de captura de errores
logger.captureError = function (error, context = {}) {
  const caller = getCaller();
  const errorType = error.constructor.name;
  const errorMessage = error.message || error.toString() || "Error sin mensaje";

  let errorCategory = "general_error";
  let suggestions = [];

  if (errorMessage.includes("is not a function")) {
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
  }

  this.error(`🚨 ${errorCategory.toUpperCase()}: ${errorMessage}`, {
    source: "error_capture",
    errorType,
    errorCategory,
    caller,
    context,
    stack: error.stack,
    suggestions,
  });
};

// Stream para Morgan
logger.stream = {
  write: (msg) => {
    const clean = typeof msg === "string" ? msg.trim() : String(msg).trim();
    if (clean) logger.info(clean, { source: "http", type: "request" });
  },
};

// Métodos de contexto
logger.withContext = (context = {}) => ({
  error: (m, meta = {}) => logger.error(m, { ...context, ...meta }),
  warn: (m, meta = {}) => logger.warn(m, { ...context, ...meta }),
  info: (m, meta = {}) => logger.info(m, { ...context, ...meta }),
  debug: (m, meta = {}) => logger.debug(m, { ...context, ...meta }),
});

// Contextos especializados
logger.system = logger.withContext({ source: "system" });
logger.db = logger.withContext({ source: "database" });
logger.api = logger.withContext({ source: "api" });
logger.transfer = logger.withContext({ source: "transfer" });

// Exportación robusta
const exportedLogger = {
  ...logger,
  captureError: (error, ctx = {}) => logger.captureError(error, ctx),
  capture: (error, ctx = {}) => logger.captureError(error, ctx),
  withContext: (ctx = {}) => logger.withContext(ctx),
  system: logger.system,
  db: logger.db,
  api: logger.api,
  transfer: logger.transfer,
  stream: logger.stream,
  close: logger.close.bind(logger),
  transports: logger.transports,
};

// 🔒 Alias para compatibilidad con { logger } imports incorrectos
exportedLogger.logger = exportedLogger;

// Inicialización
logger.system.info("🚀 Logger inicializado correctamente", {
  transports: logger.transports.length,
  timestamp: new Date().toISOString(),
});

console.log("🔍 Logger methods disponibles:", Object.keys(exportedLogger));

module.exports = exportedLogger;
