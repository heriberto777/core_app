// index.js - Versión optimizada con HTTPS forzado + AUTO-WRAPPER
require("dotenv").config();

// ⭐ AUTO-WRAPPER SYSTEM - DEBE IR AL INICIO ⭐
const path = require("path");
const Module = require("module");

// Función helper para verificar si un objeto tiene métodos wrappables
function hasWrappableMethods(obj) {
  if (typeof obj !== "function" && typeof obj !== "object") return false;
  if (obj === null) return false;

  const methods = Object.getOwnPropertyNames(obj).filter(
    (prop) =>
      typeof obj[prop] === "function" &&
      !["length", "name", "constructor"].includes(prop)
  );

  return methods.length > 0;
}

// Interceptor de require() para auto-wrapping
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  const result = originalRequire.apply(this, arguments);

  // Solo procesar módulos de nuestro proyecto
  if (
    this.filename &&
    this.filename.includes("/server/") &&
    !id.includes("node_modules") &&
    (id.startsWith("./") || id.startsWith("../"))
  ) {
    const fileName = path.basename(id, ".js");

    // Patrones para auto-wrapping
    if (
      /Service$|Controller$|Manager$|Helper$|Utils?$|Repository$|Provider$/.test(
        fileName
      )
    ) {
      if (hasWrappableMethods(result)) {
        try {
          // Cargar el serviceWrapper solo cuando se necesite
          const { wrapService } = require("./utils/serviceWrapper");
          console.log(`🔧 Auto-wrapped: ${fileName}`);
          return wrapService(result, fileName);
        } catch (wrapError) {
          console.warn(`⚠️ Error wrapping ${fileName}:`, wrapError.message);
          return result; // Retornar original si falla el wrapping
        }
      }
    }
  }

  return result;
};

console.log("✅ Auto-wrapper system initialized");
// ⭐ FIN AUTO-WRAPPER SYSTEM ⭐

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

    // ⭐ MEJORAR LOGGING AL INICIAR ⭐
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

        // ⭐ INFORMACIÓN ADICIONAL ⭐
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

      // ⭐ TIMEOUT PARA EVITAR BLOQUEOS ⭐
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

    // ⭐ LOG FINAL DE ESTADO ⭐
    console.log("✅ Servidor iniciado exitosamente:");
    console.log(`   - Puerto: ${serverInfo.port}`);
    console.log(`   - Protocolo: ${serverInfo.protocol.toUpperCase()}`);
    console.log(`   - SSL: ${serverInfo.ssl ? "Sí" : "No"}`);
    console.log(
      `   - URL: ${serverInfo.protocol}://catelli.ddns.net:${serverInfo.port}/`
    );

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

// ⭐ LOGGING MEJORADO AL INICIO ⭐
console.log("🚀 Iniciando servidor Catelli...");
console.log("📋 Configuración:");
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`   - Puerto por defecto: ${defaultPort}`);
console.log(`   - Plataforma: ${process.platform}`);
console.log(`   - Versión Node.js: ${process.version}`);
console.log(`   - Auto-wrapper: ✅ Activado`);

// Iniciar el servidor
startServer().catch((err) => {
  console.error("❌ Error fatal en startServer():", err);
  process.exit(1);
});
