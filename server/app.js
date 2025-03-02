require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const errorHandler = require("./middlewares/errorHandler");
const logRequests = require("./middlewares/loggerMiddleware");

const API_VERSION = process.env.API_VERSION || "v1";

// 🔹 Middleware de logs
app.use(logRequests);

// 🔹 Middleware de CORS con configuración avanzada
app.use(
  cors({
    origin: "*", // Puedes cambiarlo a ['https://tu-frontend.com'] para mayor seguridad
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔹 Middleware para manejar JSON y datos URL-encoded (sin bodyParser)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 🔹 Rutas
app.use(`/api/${API_VERSION}/`, require("./routes/apiRoutes"));
app.use(`/api/${API_VERSION}/`, require("./routes/auth"));
app.use(`/api/${API_VERSION}/`, require("./routes/transferTaskRoutes"));
app.use(`/api/${API_VERSION}/`, require("./routes/userRoutes"));
app.use(`/api/${API_VERSION}/`, require("./routes/dbRoutes"));

// 🔹 Manejo de errores (SIEMPRE AL FINAL)
app.use(errorHandler);

module.exports = app;
