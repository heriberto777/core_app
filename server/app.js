require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const errorHandler = require("./middlewares/errorHandler");
const logRequests = require("./middlewares/loggerMiddleware");
const simpleLoggerMiddleware = require("./middlewares/simpleLoggerMiddleware");

const API_VERSION = process.env.API_VERSION || "v1";

// Middleware de logs con manejo de errores
try {
  app.use(logRequests);
  console.log("✅ Middleware de logging principal configurado correctamente");
} catch (err) {
  console.error("❌ Error al configurar middleware de logging principal:", err);
  console.log("⚠️ Usando middleware de logging alternativo...");
  app.use(simpleLoggerMiddleware);
}

// Middleware de CORS
app.use(
  cors({
    origin: "*", // Puedes cambiarlo a ['https://tu-frontend.com'] para mayor seguridad
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware para JSON y datos URL-encoded
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Rutas
app.use(`/api/${API_VERSION}/`, require("./routes/auth"));
app.use(`/api/${API_VERSION}/task`, require("./routes/transferTaskRoutes"));
app.use(`/api/${API_VERSION}/`, require("./routes/userRoutes"));
app.use(`/api/${API_VERSION}/`, require("./routes/dbRoutes"));
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

// Ruta para health check básico
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
    version: process.env.API_VERSION || "v1",
  });
});

// Manejo de errores (SIEMPRE AL FINAL)
app.use(errorHandler);

module.exports = app;
