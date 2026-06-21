require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
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

// Fix #13 — Orígenes CORS desde variable de entorno para evitar valores hardcodeados.
// En .env: CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,...
// Si la variable no existe, usa el listado por defecto como fallback.
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
  "http://localhost:5180",
  "https://localhost:3000",
  "https://catelli.ddns.net",
  "https://catelli.ddns.net:3979",
  "http://catelli.ddns.net",
  "http://catelli.ddns.net:3979",
  "https://catelli.ddns.net:8085",
];

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : DEFAULT_CORS_ORIGINS;

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir peticiones sin origin (Postman, apps móviles, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.error(`🚩 CORS BLOQUEADO: Origen "${origin}" no está en la lista blanca.`);
      callback(new Error("No permitido por política CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Cache-Control",
    "X-File-Name",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // Cache preflight por 24 horas
  preflightContinue: false,
};

app.use(cors(corsOptions));

// Middleware adicional para manejar preflight requests
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET,PUT,POST,DELETE,PATCH,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    return res.status(200).end();
  }
  next();
});

// Middleware para JSON y datos URL-encoded
app.use(express.json({ limit: MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ limit: MAX_REQUEST_SIZE, extended: true }));

// ⭐ AÑADIR ESTAS LÍNEAS PARA SERVIR ARCHIVOS ESTÁTICOS ⭐
// Servir archivos estáticos desde la carpeta uploads - Usar truco de string para evitar que NCC lo incluya
const _u = "up"; const _lo = "loads";
const uploadBaseDir = path.join(process.cwd(), _u + _lo);
app.use("/uploads", express.static(uploadBaseDir));
console.log("📁 Sirviendo archivos estáticos desde:", uploadBaseDir);

// Crear directorios de uploads si no existen
if (!fs.existsSync(uploadBaseDir)) {
  fs.mkdirSync(uploadBaseDir, { recursive: true });
}
const avatarDir = path.join(uploadBaseDir, "avatar");
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

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
app.use(`/api/${API_VERSION}/modules`, require("./routes/moduleRoutes"));
app.use(`/api/${API_VERSION}/task`, require("./routes/transferTaskRoutes"));
app.use(`/api/${API_VERSION}/users`, require("./routes/userRoutes"));
app.use(`/api/${API_VERSION}/config`, require("./routes/dbRoutes"));
app.use(`/api/${API_VERSION}/scheduler`, require("./routes/schedulerRoutes"));
app.use(`/api/${API_VERSION}/cache`, require("./routes/cacheRoutes"));

app.use(
  `/api/${API_VERSION}/email-recipients`,
  require("./routes/emailRecipientRoutes")
);
app.use(
  `/api/${API_VERSION}/summaries`,
  require("./routes/transferSummaryRoutes")
);
app.use(`/api/${API_VERSION}/roles`, require("./routes/roleRoutes"));

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
app.use(`/api/${API_VERSION}/loads`, require("./routes/loadsRoutes"));
app.use(`/api/${API_VERSION}/telemetry`, require("./routes/telemetryRoutes"));
app.use(`/api/${API_VERSION}/customers`, require("./routes/customerRoutes"));
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
