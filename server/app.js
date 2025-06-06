require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const errorHandler = require("./middlewares/errorHandler");
const logRequests = require("./middlewares/loggerMiddleware");
const simpleLoggerMiddleware = require("./middlewares/simpleLoggerMiddleware");

const logger = require("./services/logger");

// Configuración dinámica
const API_VERSION = process.env.API_VERSION || "v1";
const MAX_REQUEST_SIZE = process.env.MAX_REQUEST_SIZE || "50mb";
const SERVER_NAME = process.env.SERVER_NAME || "API Catelli";

// Registro de inicio de aplicación
logger.info(`Iniciando ${SERVER_NAME} v${API_VERSION}`);

// Middleware de logs con manejo de errores
try {
  app.use(logRequests);
  logger.info("✅ Middleware de logging principal configurado correctamente");
} catch (err) {
  logger.error("❌ Error al configurar middleware de logging principal:", err);
  logger.info("⚠️ Usando middleware de logging alternativo...");
  app.use(simpleLoggerMiddleware);
}

// Middleware de CORS mejorado

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*", // Agrega todos los origins que necesites
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // ✅ Asegúrate de incluir PATCH
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // Caché de preflight por 24 horas
};

app.use(cors(corsOptions));

// Middleware para JSON y datos URL-encoded
app.use(express.json({ limit: MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ limit: MAX_REQUEST_SIZE, extended: true }));

// ⭐ AÑADIR ESTAS LÍNEAS PARA SERVIR ARCHIVOS ESTÁTICOS ⭐
// Servir archivos estáticos desde la carpeta uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
console.log(
  "📁 Sirviendo archivos estáticos desde:",
  path.join(__dirname, "uploads")
);

// Crear directorio de uploads si no existe
const fs = require("fs");
const uploadDirs = [
  path.join(__dirname, "uploads"),
  path.join(__dirname, "uploads/avatar"),
];

uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Directorio creado: ${dir}`);
  }
});

// Middleware para manejar errores de parsing JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    logger.error("Error de sintaxis en JSON:", err.message);
    return res.status(400).json({
      success: false,
      error: "JSON inválido",
      message: "La solicitud contiene JSON mal formado",
    });
  }
  next(err);
});

// Rutas
app.use(`/api/${API_VERSION}/auth`, require("./routes/auth"));
app.use(`/api/${API_VERSION}/task`, require("./routes/transferTaskRoutes"));
app.use(`/api/${API_VERSION}/users`, require("./routes/userRoutes"));
app.use(`/api/${API_VERSION}/config`, require("./routes/dbRoutes"));
app.use(
  `/api/${API_VERSION}/email-recipients`,
  require("./routes/emailRecipientRoutes")
);
app.use(
  `/api/${API_VERSION}/summaries`,
  require("./routes/transferSummaryRoutes")
);

// Nueva ruta para pruebas de conexión y diagnóstico
app.use(
  `/api/${API_VERSION}/connection`,
  require("./routes/connectionTestRoutes")
);

app.use(`/api/${API_VERSION}/stats`, require("./routes/statsRoutes"));
app.use(`/api/${API_VERSION}/logs`, require("./routes/logRoutes"));
app.use(`/api/${API_VERSION}/orders`, require("./routes/ordersRoutes"));
app.use(`/api/${API_VERSION}/mappings`, require("./routes/mappingRoutes"));
app.use(
  `/api/${API_VERSION}/cancellation`,
  require("./routes/cancelationRoutes")
);
app.use(
  `/api/${API_VERSION}/consecutives`,
  require("./routes/consecutiveRoutes")
);
app.use(`/api/${API_VERSION}/transfer`, require("./routes/progressRoutes"));
app.use(
  `/api/${API_VERSION}/linked-groups`,
  require("./routes/linkedGroupsRoutes")
);
app.use(
  `/api/${API_VERSION}/email-config`,
  require("./routes/emailConfigRoutes")
);
//Comentario
// Ruta para health check mejorada
app.get("/health", async (req, res) => {
  try {
    // Obtener estado del sistema
    const HealthMonitor = require("./services/healthMonitorService");
    const health = await HealthMonitor.checkConnectionHealth();

    // Obtener información de memoria
    const MemoryManager = require("./services/MemoryManager");
    const memory = MemoryManager.getStats().current;

    // Obtener métricas de telemetría
    const Telemetry = require("./services/Telemetry");
    const metrics = Telemetry.getMetrics(false);

    res.json({
      status:
        health.mongodb?.connected &&
        (health.server1?.connected || health.server2?.connected)
          ? "UP"
          : "DEGRADED",
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "development",
      version: API_VERSION,
      connections: {
        mongodb: health.mongodb?.connected ? "OK" : "ERROR",
        server1: health.server1?.connected ? "OK" : "ERROR",
        server2: health.server2?.connected ? "OK" : "ERROR",
      },
      memory: {
        heapUsedMB: memory.heapUsedMB,
        heapTotalMB: memory.heapTotalMB,
        rssMB: memory.rssMB,
        usage: memory.usagePercentage,
      },
      metrics: {
        transfers: metrics.transfers,
        dbQueries: metrics.db.queries.total,
        performance: metrics.performance,
      },
    });
  } catch (error) {
    // Si hay error, devolver respuesta básica
    res.json({
      status: "UP",
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "development",
      version: API_VERSION,
      note: "Error al obtener información detallada",
    });
  }
});

// // Ruta para mantenimiento y diagnóstico (protegida en producción)
// if (
//   process.env.NODE_ENV !== "production" ||
//   process.env.ENABLE_ADMIN_ROUTES === "true"
// ) {
//   app.use(`/api/${API_VERSION}/admin`, require("./routes/adminRoutes"));
//   logger.info("✅ Rutas de administración habilitadas");
// }

// Middleware 404 para rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada",
    path: req.path,
  });
});

// Manejo de errores (SIEMPRE AL FINAL)
app.use(errorHandler);

module.exports = app;
