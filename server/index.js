// index.js - Versión optimizada con HTTPS forzado
require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const logger = require("./services/logger");
const AppBootstrap = require("./services/AppBootstrap");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");

// ✅ AGREGAR INICIALIZACIÓN DE CONNECTIONCENTRALSERVICE
// // const ConnectionCentralService = require(...); // REMOVED
// REMOVED - using DatabaseServiceAdapter


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

// ✅ MANEJAR SEÑALES DE CIERRE GRACEFUL
process.on("SIGTERM", gracefulShutdown("SIGTERM"));
process.on("SIGINT", gracefulShutdown("SIGINT"));

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

    // ⭐ DEBUGGING MEJORADO ⭐
    console.log("🔍 DEBUG - Variables de entorno:");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("SSL_PATH:", process.env.SSL_PATH);
    console.log("isDev:", isDev);
    console.log("isWindows:", isWindows);

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

    // ⭐ DEBUGGING SSL ⭐
    console.log("🔍 DEBUG - Estado SSL:");
    console.log("sslPath:", sslPath);
    console.log("privkey.pem exists:", fs.existsSync(`${sslPath}/privkey.pem`));
    console.log(
      "fullchain.pem exists:",
      fs.existsSync(`${sslPath}/fullchain.pem`)
    );
    console.log("chain.pem exists:", fs.existsSync(`${sslPath}/chain.pem`));

    const hasSSLCerts =
      !isWindows &&
      fs.existsSync(`${sslPath}/privkey.pem`) &&
      fs.existsSync(`${sslPath}/fullchain.pem`);

    console.log("hasSSLCerts:", hasSSLCerts);

    console.log(
      `Modo: ${isDev ? "desarrollo" : "producción"}, Sistema: ${
        isWindows ? "Windows" : "Linux/Unix"
      }`
    );
    console.log(`SSL disponible: ${hasSSLCerts ? "Sí" : "No"}`);

    // Iniciar el servidor HTTP o HTTPS
    let server;

    // ⭐ LÓGICA MEJORADA PARA FORZAR HTTPS ⭐
    if (hasSSLCerts) {
      // SIEMPRE usar HTTPS si hay certificados SSL disponibles
      try {
        console.log("🔒 Cargando certificados SSL para HTTPS...");

        const privateKey = fs.readFileSync(`${sslPath}/privkey.pem`, "utf8");
        const certificate = fs.readFileSync(`${sslPath}/fullchain.pem`, "utf8");

        // chain.pem es opcional, algunos setups no lo necesitan
        let ca = null;
        if (fs.existsSync(`${sslPath}/chain.pem`)) {
          ca = fs.readFileSync(`${sslPath}/chain.pem`, "utf8");
        }

        const credentials = {
          key: privateKey,
          cert: certificate,
          ...(ca && { ca }), // Solo agregar ca si existe
        };

        console.log("✅ Certificados SSL cargados correctamente");
        console.log("🚀 Creando servidor HTTPS...");

        server = https.createServer(credentials, app);

        console.log("🔒 Servidor HTTPS configurado exitosamente");
      } catch (sslError) {
        // Fallback a HTTP si falla SSL
        console.error("❌ Error al configurar HTTPS:", sslError.message);
        console.log("📋 Detalles del error SSL:", sslError);
        console.log("⚠️ Fallback a HTTP debido a error en SSL...");
        server = http.createServer(app);
      }
    } else {
      // HTTP solo si no hay certificados SSL o estamos en Windows
      if (isWindows) {
        console.log("🌐 Iniciando servidor HTTP (Windows detectado)...");
      } else {
        console.log("🌐 Iniciando servidor HTTP (sin certificados SSL)...");
      }
      server = http.createServer(app);
    }

    // Configurar eventos del servidor
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `❌ Puerto ${serverPort} en uso, intentando otro puerto...`
        );
        setTimeout(() => startServerWithPort(serverPort + 1), 1000);
      } else {
        console.error("❌ Error en servidor:", err);
        logger.error("Error en servidor:", err);
      }
    });

    return new Promise((resolve, reject) => {
      server.listen(serverPort, () => {
        const protocol = server instanceof https.Server ? "https" : "http";
        const isSSL = server instanceof https.Server;

        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor ${protocol.toUpperCase()} iniciado en puerto ${serverPort}: ${protocol}://localhost:${serverPort}/`
        );

        // Información adicional
        console.log(`🔒 SSL/TLS: ${isSSL ? "ACTIVADO" : "DESACTIVADO"}`);
        console.log(
          `🌍 Accesible en: ${protocol}://catelli.ddns.net:${serverPort}/`
        );

        if (!isSSL && hasSSLCerts) {
          console.log("⚠️ ADVERTENCIA: SSL disponible pero no se está usando");
        }

        // Registrar información en el sistema
        logger.info(
          `Servidor iniciado en ${protocol}://localhost:${serverPort}/ (SSL: ${isSSL})`
        );

        resolve({ server, port: serverPort, protocol, ssl: isSSL });
      });

      // Timeout para evitar bloqueos
      setTimeout(() => {
        reject(
          new Error(`Timeout al iniciar servidor en puerto ${serverPort}`)
        );
      }, 30000); // 30 segundos timeout
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

    // Log final de estado
    console.log("✅ Servidor iniciado exitosamente:");
    console.log(`   - Puerto: ${serverInfo.port}`);
    console.log(`   - Protocolo: ${serverInfo.protocol.toUpperCase()}`);
    console.log(`   - SSL: ${serverInfo.ssl ? "SÍ" : "NO"}`);
    console.log(`   - Entorno: ${process.env.NODE_ENV || "development"}`);

    return serverInfo;
  } catch (error) {
    console.error("❌ Error al iniciar servidor:", error);
    logger.error("Error al iniciar servidor:", error);
    throw error;
  }
};

let server = null;

// Función para cierre graceful
function gracefulShutdown(signal) {
  return async () => {
    console.log(
      `\n📴 Señal ${signal} recibida. Cerrando servidor gracefully...`
    );
    logger.info(`Iniciando cierre ordenado por señal ${signal}`);

    // Cierre ordenado de servicios
    await AppBootstrap.shutdown().catch((error) => {
      console.error("Error durante cierre ordenado de servicios:", error);
      logger.error("Error en shutdown:", error);
    });

    // ✅ CERRAR CONNECTIONCENTRALSERVICE
    try {
      console.log("🔌 Cerrando servicio de conexiones...");
      await DatabaseServiceAdapter.shutdown();
      console.log("✅ Servicio de conexiones cerrado");
    } catch (error) {
      console.error("Error cerrando ConnectionCentralService:", error);
    }

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
  };
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

// Logging al inicio
console.log("🚀 Iniciando servidor Catelli...");
console.log("📋 Configuración:");
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`   - Puerto por defecto: ${defaultPort}`);
console.log(`   - Plataforma: ${process.platform}`);
console.log(`   - Versión Node.js: ${process.version}`);

// ✅ INICIALIZAR CONNECTIONCENTRALSERVICE ANTES DEL SERVIDOR
(async () => {
  try {
    console.log("🔌 Inicializando servicio de conexiones...");
    await DatabaseServiceAdapter.initialize();
    console.log("✅ Servicio de conexiones inicializado");

    // Inicializar AppBootstrap
    console.log("🚀 Inicializando servicios de aplicación...");
    await AppBootstrap.initialize();
    console.log("✅ Servicios de aplicación inicializados");

    // Iniciar el servidor después de inicializar conexiones
    const serverInfo = await startServer();
    server = serverInfo.server; // Guardar referencia para cierre graceful
  } catch (err) {
    console.error("❌ Error fatal en inicialización:", err);
    process.exit(1);
  }
})();
