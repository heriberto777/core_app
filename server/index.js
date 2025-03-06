require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");
const {
  connectToMongoDB,
  loadConfigurations,
  testDirectConnection,
  getPoolsStatus,
  testPoolConnection,
  initPools,
  closePools,
} = require("./services/dbService");
const { startCronJob } = require("./services/cronService");
const Config = require("./models/configModel");
const { API_VERSION } = require("./config");

// Configurar manejo global de excepciones no capturadas para evitar reinicios de PM2
process.on("uncaughtException", (error) => {
  console.error("🚨 ERROR NO CAPTURADO:", error);
  console.error("Stack trace:", error.stack);

  try {
    const logger = require("./services/logger");
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

  // NO TERMINAMOS EL PROCESO - Esto es clave para evitar que PM2 reinicie
  // process.exit(1); <- Esto causa que PM2 reinicie, así que lo evitamos

  // Solo en casos extremos donde la aplicación está completamente comprometida
  // consideraremos terminar el proceso
  if (isProcessCompromised(error)) {
    console.error("Error fatal detectado, terminando proceso en 5 segundos...");

    // Intentar cerrar recursos limpiamente
    try {
      // Si tienes el dbService disponible, intenta cerrar pools
      closePools();
    } catch (e) {
      console.error("Error al cerrar pools:", e.message);
    }

    // Dar tiempo a que logs se escriban antes de terminar
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
});

// Función para determinar si el proceso está fatalmente comprometido
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

// Manejar promesas rechazadas no capturadas
process.on("unhandledRejection", (reason, promise) => {
  console.warn("⚠️ Promesa rechazada no manejada:", reason);

  // Intentar registrar en el sistema de logging
  try {
    const logger = require("./services/logger");
    logger.warn("Promesa rechazada no manejada:", {
      reason: reason?.message || String(reason),
      stack: reason?.stack,
    });
  } catch (logError) {
    console.error("Error al registrar promesa rechazada:", logError.message);
  }

  // No terminamos el proceso por esto
});

// Detectar errores de memoria y otros problemas de recursos
process.on("warning", (warning) => {
  console.warn("⚠️ Advertencia del proceso:", warning.name, warning.message);
  console.warn("Stack:", warning.stack);

  try {
    const logger = require("./services/logger");
    logger.warn(`Advertencia ${warning.name}:`, {
      message: warning.message,
      stack: warning.stack,
    });
  } catch (logError) {
    console.error("Error al registrar advertencia:", logError.message);
  }
});

// Capturas específicas para errores de conexión a bases de datos
process.on("SIGPIPE", () => {
  console.warn("⚠️ Recibida señal SIGPIPE (conexión rota)");
  // No hacemos nada, solo evitamos que el error no capturado termine el proceso
});

// Puerto para el servidor - usar el mismo que tu otra aplicación para mantener consistencia
const port = process.env.PORT || 3979;

// Determinar si estamos en desarrollo o producción
const isDev = process.env.NODE_ENV !== "production";
const isWindows = process.platform === "win32";

// Variable para guardar el servidor (HTTP o HTTPS)
let server;

// Función para verificar si el puerto está en uso
const isPortInUse = async (port) => {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

const startServer = async () => {
  try {
    console.log("Iniciando servidor...");

    // Verificar si el puerto está en uso
    const portInUse = await isPortInUse(port);
    if (portInUse) {
      console.error(
        `⚠️ El puerto ${port} ya está en uso. Por favor cierre otras aplicaciones o use otro puerto.`
      );
      // No terminamos el proceso, intentaremos otro puerto
      const newPort = port + 1;
      console.log(`Intentando con puerto alternativo: ${newPort}`);
      startServerWithPort(newPort);
      return;
    }

    await startServerWithPort(port);
  } catch (err) {
    console.error("❌ Error al iniciar el servidor:", err);
    // No terminamos el proceso para evitar reinicios de PM2
    console.error(
      "El servidor no pudo inicializarse correctamente, pero seguirá en ejecución para diagnóstico"
    );
  }
};

const startServerWithPort = async (serverPort) => {
  try {
    console.log(`Intentando iniciar servidor en puerto ${serverPort}...`);

    console.log("Conectando a MongoDB...");
    try {
      await connectToMongoDB();
      console.log("✅ Conexión a MongoDB establecida.");
    } catch (mongoError) {
      console.error("❌ Error al conectar a MongoDB:", mongoError.message);
      console.log("Continuando de todas formas...");
    }

    console.log("Cargando configuraciones...");
    try {
      await loadConfigurations();
      console.log("✅ Configuraciones cargadas.");
    } catch (configError) {
      console.error("❌ Error al cargar configuraciones:", configError.message);
      console.log("Continuando con configuración por defecto...");
    }

    console.log("Inicializando pools de conexiones...");
    try {
      initPools();
      console.log("✅ Pools de conexiones inicializados.");
    } catch (poolError) {
      console.error("❌ Error al inicializar pools:", poolError.message);
      console.log("Continuando sin pools de conexiones...");
    }

    console.log("Probando conexiones a SQL Server...");
    try {
      // Ejecutando diagnóstico de conexión directa con tedious
      try {
        const directTestResult = await testDirectConnection("server2");
        console.log(
          `✅ Prueba directa exitosa. Servidor: ${directTestResult.server}`
        );
        console.log(
          `Versión SQL: ${directTestResult.version.substring(0, 50)}...`
        );
      } catch (directErr) {
        console.error(`❌ Prueba directa fallida: ${directErr.message}`);
        console.log("Continuando de todas formas...");
      }

      // Ejecutando diagnóstico usando el pool
      try {
        const poolTestResult = await testPoolConnection("server2");
        console.log(
          `✅ Prueba de pool exitosa. Servidor: ${poolTestResult.server}`
        );
      } catch (poolErr) {
        console.error(`❌ Prueba de pool fallida: ${poolErr.message}`);
        console.log("Continuando sin pool de conexiones...");
      }

      // Mostrar estado de los pools
      try {
        console.log("Estado de los pools de conexiones:");
        const poolStatus = getPoolsStatus();
        console.log(JSON.stringify(poolStatus, null, 2));
      } catch (statusErr) {
        console.error(
          `❌ Error al obtener estado de pools: ${statusErr.message}`
        );
      }

      console.log("✅ Pruebas de conexión a SQL Server completadas");
    } catch (error) {
      console.error(
        "❌ Error inesperado con las conexiones SQL:",
        error.message
      );
      console.log(
        "Continuando con la inicialización del servidor de todas formas..."
      );
    }

    console.log("Configurando cronjob...");
    let executionHour = "03:00"; // Valor por defecto
    try {
      const config = await Config.findOne();
      if (config && config.hour) {
        executionHour = config.hour;
      }
    } catch (configError) {
      console.warn(
        "⚠️ Error al obtener configuración, usando hora por defecto:",
        configError.message
      );
    }

    console.log(`⏰ Transferencias programadas a las: ${executionHour}`);

    try {
      startCronJob(executionHour);
      console.log("✅ Cronjob configurado.");
    } catch (cronError) {
      console.error("❌ Error al configurar cronjob:", cronError.message);
      console.log("Continuando sin cronjob...");
    }

    // Determinar si podemos usar SSL
    const hasSSLCerts =
      !isWindows &&
      fs.existsSync("/etc/letsencrypt/live/catelli.ddns.net/privkey.pem") &&
      fs.existsSync("/etc/letsencrypt/live/catelli.ddns.net/fullchain.pem");

    console.log(
      `Modo: ${isDev ? "desarrollo" : "producción"}, Sistema: ${
        isWindows ? "Windows" : "Linux/Unix"
      }`
    );
    console.log(`SSL disponible: ${hasSSLCerts ? "Sí" : "No"}`);

    // Iniciar el servidor HTTP o HTTPS
    if (isDev || isWindows || !hasSSLCerts) {
      // En desarrollo, Windows, o sin SSL, usar HTTP
      console.log("Iniciando servidor HTTP...");
      server = http.createServer(app);

      server.on("error", (err) => {
        console.error("❌ Error en servidor HTTP:", err);
        if (err.code === "EADDRINUSE") {
          console.error(
            `El puerto ${serverPort} está en uso. Intentando con otro puerto...`
          );
          setTimeout(() => {
            startServerWithPort(serverPort + 1);
          }, 1000);
          return;
        }
      });

      console.log(`Llamando a server.listen(${serverPort})...`);
      server.listen(serverPort, () => {
        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor HTTP iniciado en puerto ${serverPort}: http://localhost:${serverPort}/api/${API_VERSION}/`
        );
      });
    } else {
      // En Linux producción con SSL, usar HTTPS
      try {
        console.log("Cargando certificados SSL para producción...");
        // Intentar cargar certificados con manejo de errores
        let privateKey, certificate, ca;

        try {
          privateKey = fs.readFileSync(
            "/etc/letsencrypt/live/catelli.ddns.net/privkey.pem",
            "utf8"
          );
          certificate = fs.readFileSync(
            "/etc/letsencrypt/live/catelli.ddns.net/fullchain.pem",
            "utf8"
          );
          ca = fs.readFileSync(
            "/etc/letsencrypt/live/catelli.ddns.net/chain.pem",
            "utf8"
          );
        } catch (sslError) {
          console.error(
            "❌ Error al cargar certificados SSL:",
            sslError.message
          );
          throw new Error("No se pudieron cargar los certificados SSL");
        }

        const credentials = {
          key: privateKey,
          cert: certificate,
          ca: ca,
        };

        console.log("✅ Certificados SSL cargados correctamente");

        console.log("Creando servidor HTTPS...");
        server = https.createServer(credentials, app);

        server.on("error", (err) => {
          console.error("❌ Error en servidor HTTPS:", err);
          if (err.code === "EADDRINUSE") {
            console.error(
              `El puerto ${serverPort} está en uso. Intentando con otro puerto...`
            );
            setTimeout(() => {
              startServerWithPort(serverPort + 1);
            }, 1000);
            return;
          }
        });

        server.listen(serverPort, () => {
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `🔒 Servidor HTTPS iniciado en puerto ${serverPort}: https://localhost:${serverPort}/api/${API_VERSION}/`
          );
        });
      } catch (error) {
        console.error("❌ Error al configurar HTTPS:", error.message);

        // Fallback a HTTP si falla HTTPS
        console.log(
          "⚠️ Fallback a HTTP debido a error en configuración HTTPS..."
        );

        server = http.createServer(app);
        server.on("error", (err) => {
          console.error("❌ Error en servidor HTTP (fallback):", err);
        });

        server.listen(serverPort, () => {
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `⚠️ Servidor HTTP (fallback) iniciado en puerto ${serverPort}: http://localhost:${serverPort}/api/${API_VERSION}/`
          );
        });
      }
    }

    // Registrar cuando el servidor está escuchando
    if (server) {
      server.on("listening", () => {
        console.log(`✓ El servidor está escuchando en el puerto ${serverPort}`);
      });
    }
  } catch (error) {
    console.error("❌ Error general al iniciar el servidor:", error);
    // No terminamos el proceso para evitar reinicios de PM2
    console.error(
      "El servidor no pudo inicializarse pero seguirá en ejecución para diagnóstico"
    );
  }
};

// Manejar señales para cierre graceful
process.on("SIGTERM", () => {
  console.log("Recibida señal SIGTERM. Cerrando servidor gracefully...");

  // Cerrar pools de conexiones
  try {
    closePools();
    console.log("Pools de conexiones cerrados correctamente");
  } catch (poolError) {
    console.error("Error al cerrar pools de conexiones:", poolError);
  }

  if (server) {
    server.close(() => {
      console.log("Servidor cerrado. Proceso terminando...");
      process.exit(0);
    });

    // Salir después de un timeout si server.close() no completa
    setTimeout(() => {
      console.log("Forzando salida después de timeout en server.close()");
      process.exit(0);
    }, 10000);
  } else {
    process.exit(0);
  }
});

// Manejar Ctrl+C
process.on("SIGINT", () => {
  console.log("Recibida señal SIGINT (Ctrl+C). Cerrando servidor...");

  // Cerrar pools de conexiones
  try {
    closePools();
    console.log("Pools de conexiones cerrados correctamente");
  } catch (poolError) {
    console.error("Error al cerrar pools de conexiones:", poolError);
  }

  if (server) {
    server.close(() => {
      console.log("Servidor cerrado. Saliendo...");
      process.exit(0);
    });

    setTimeout(() => {
      console.log("Forzando salida después de Ctrl+C");
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
});

console.log("Llamando a startServer()...");
startServer();
