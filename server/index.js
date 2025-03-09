// index.js - Versión optimizada
require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");
const logger = require("./services/logger");
const AppBootstrap = require("./services/AppBootstrap");

// Manejo de errores no capturados
process.on("uncaughtException", (error) => {
  console.error("🚨 ERROR NO CAPTURADO:", error);

  try {
    logger.error("Error no capturado en proceso principal:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  } catch (logError) {
    console.error("No se pudo registrar el error en logger:", logError.message);
  }

  // Registrar información de diagnóstico
  console.error("Información del proceso:", {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    env: process.env.NODE_ENV,
  });

  // Sólo terminar en casos graves
  if (isProcessCompromised(error)) {
    console.error("Error fatal detectado, terminando proceso en 5 segundos...");

    // Intentar cerrar recursos limpiamente
    AppBootstrap.shutdown()
      .catch((e) => console.error("Error durante shutdown:", e))
      .finally(() => {
        setTimeout(() => process.exit(1), 5000);
      });
  }
});

// Manejar promesas rechazadas no capturadas
process.on("unhandledRejection", (reason, promise) => {
  console.warn("⚠️ Promesa rechazada no manejada:", reason);

  try {
    logger.warn("Promesa rechazada no manejada:", {
      reason: reason?.message || String(reason),
      stack: reason?.stack,
    });
  } catch (logError) {
    console.error("Error al registrar promesa rechazada:", logError.message);
  }
});

// Detectar errores de memoria y otros problemas de recursos
process.on("warning", (warning) => {
  console.warn("⚠️ Advertencia del proceso:", warning.name, warning.message);

  try {
    logger.warn(`Advertencia ${warning.name}:`, {
      message: warning.message,
      stack: warning.stack,
    });
  } catch (logError) {
    console.error("Error al registrar advertencia:", logError.message);
  }
});

// Capturas específicas para errores de conexión
process.on("SIGPIPE", () => {
  console.warn("⚠️ Recibida señal SIGPIPE (conexión rota)");
});

// Puerto para el servidor
const defaultPort = process.env.PORT || 3979;

// Determinar si estamos en desarrollo o producción
const isDev = process.env.NODE_ENV !== "production";
const isWindows = process.platform === "win32";

// Función para verificar si el puerto está en uso
const isPortInUse = async (port) => {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

// Función para iniciar el servidor con un puerto
const startServerWithPort = async (serverPort) => {
  try {
    console.log(`Intentando iniciar servidor en puerto ${serverPort}...`);

    // Inicializar todos los servicios a través del bootstrap
    console.log("Inicializando servicios...");
    const bootstrapResult = await AppBootstrap.initialize();

    if (!bootstrapResult.success) {
      console.warn(
        "⚠️ Inicialización completada con advertencias, verificar logs"
      );
    } else {
      console.log("✅ Servicios inicializados correctamente");
    }

    // Determinar si podemos usar SSL
    const sslPath =
      process.env.SSL_PATH || "/etc/letsencrypt/live/catelli.ddns.net";
    const hasSSLCerts =
      !isWindows &&
      fs.existsSync(`${sslPath}/privkey.pem`) &&
      fs.existsSync(`${sslPath}/fullchain.pem`);

    console.log(
      `Modo: ${isDev ? "desarrollo" : "producción"}, Sistema: ${
        isWindows ? "Windows" : "Linux/Unix"
      }`
    );
    console.log(`SSL disponible: ${hasSSLCerts ? "Sí" : "No"}`);

    // Iniciar el servidor HTTP o HTTPS
    let server;

    if (isDev || isWindows || !hasSSLCerts) {
      // HTTP para desarrollo, Windows, o sin SSL
      console.log("Iniciando servidor HTTP...");
      server = http.createServer(app);
    } else {
      // HTTPS para producción en Linux con SSL
      try {
        console.log("Cargando certificados SSL para producción...");

        const privateKey = fs.readFileSync(`${sslPath}/privkey.pem`, "utf8");
        const certificate = fs.readFileSync(`${sslPath}/fullchain.pem`, "utf8");
        const ca = fs.readFileSync(`${sslPath}/chain.pem`, "utf8");

        const credentials = { key: privateKey, cert: certificate, ca };

        console.log("✅ Certificados SSL cargados correctamente");
        console.log("Creando servidor HTTPS...");

        server = https.createServer(credentials, app);
      } catch (sslError) {
        // Fallback a HTTP si falla SSL
        console.error("❌ Error al configurar HTTPS:", sslError.message);
        console.log("⚠️ Fallback a HTTP debido a error en SSL...");
        server = http.createServer(app);
      }
    }

    // Configurar eventos del servidor
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Puerto ${serverPort} en uso, intentando otro puerto...`);
        setTimeout(() => startServerWithPort(serverPort + 1), 1000);
      } else {
        console.error("Error en servidor:", err);
      }
    });

    // Iniciar escucha
    return new Promise((resolve, reject) => {
      server.listen(serverPort, () => {
        const protocol = server instanceof https.Server ? "https" : "http";

        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor ${protocol.toUpperCase()} iniciado en puerto ${serverPort}: ${protocol}://localhost:${serverPort}/`
        );

        // Registrar información en el sistema
        logger.info(
          `Servidor iniciado en ${protocol}://localhost:${serverPort}/`
        );

        resolve({ server, port: serverPort, protocol });
      });
    });
  } catch (error) {
    console.error("❌ Error general al iniciar el servidor:", error);
    logger.error("Error al iniciar servidor:", error);
    throw error;
  }
};

// Función principal para iniciar el servidor
const startServer = async () => {
  try {
    // Verificar si el puerto por defecto está disponible
    const portInUse = await isPortInUse(defaultPort);
    const startPort = portInUse ? defaultPort + 1 : defaultPort;

    if (portInUse) {
      console.warn(
        `⚠️ Puerto ${defaultPort} ya en uso, intentando ${startPort}`
      );
    }

    // Iniciar con el puerto apropiado
    const serverInfo = await startServerWithPort(startPort);

    // Manejar señales para cierre graceful
    setupGracefulShutdown(serverInfo.server);

    return serverInfo;
  } catch (err) {
    console.error("❌ Error crítico al iniciar el servidor:", err);
    logger.error("Error crítico en arranque:", err);

    // No terminamos el proceso para permitir diagnóstico
    console.warn(
      "El servidor no pudo iniciarse pero se mantiene proceso en ejecución"
    );
  }
};

// Configurar manejo de señales para cierre graceful
function setupGracefulShutdown(server) {
  // SIGTERM (señal standard de shutdown)
  process.on("SIGTERM", () => handleShutdown("SIGTERM", server));

  // SIGINT (Ctrl+C)
  process.on("SIGINT", () => handleShutdown("SIGINT", server));
}

// Manejar cierre graceful
async function handleShutdown(signal, server) {
  console.log(`Recibida señal ${signal}. Cerrando servidor gracefully...`);
  logger.info(`Iniciando cierre ordenado por señal ${signal}`);

  // Cierre ordenado de servicios
  await AppBootstrap.shutdown().catch((error) => {
    console.error("Error durante cierre ordenado de servicios:", error);
    logger.error("Error en shutdown:", error);
  });

  // Cerrar servidor HTTP/HTTPS
  if (server) {
    server.close(() => {
      console.log("Servidor cerrado. Proceso terminando...");
      process.exit(0);
    });

    // Salir después de un timeout por si server.close() se bloquea
    setTimeout(() => {
      console.log("Forzando salida después de timeout en server.close()");
      process.exit(0);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Determinar si un error compromete la integridad del proceso
function isProcessCompromised(error) {
  // Casos donde realmente necesitamos reiniciar
  if (
    error.message &&
    (error.message.includes("JavaScript heap out of memory") ||
      error.message.includes("FATAL ERROR: Ineffective mark-compacts") ||
      error.message.includes("FATAL ERROR: CALL_AND_RETRY_LAST"))
  ) {
    return true;
  }

  // Si es un error de sistema (como ENOSPC - sin espacio en disco)
  if (
    error.code &&
    ["ENOSPC", "EMFILE", "ENFILE", "EPIPE"].includes(error.code)
  ) {
    return true;
  }

  // Por defecto, consideramos que el proceso puede seguir funcionando
  return false;
}

// Iniciar el servidor
console.log("Iniciando servidor Catelli...");
startServer().catch((err) => {
  console.error("Error fatal en startServer():", err);
});
