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

// Puerto para el servidor - usar el mismo que tu otra aplicación para mantener consistencia
const port = process.env.PORT || 3979;

// Determinar si estamos en desarrollo o producción
const isDev = process.env.NODE_ENV !== "production";

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

// Determina si un error es fatal y requiere terminar el proceso
function isFatalError(error) {
  // Personaliza esta lógica según tus necesidades

  const fatalErrorTypes = [
    "RangeError",
    "TypeError", // Solo ciertos tipos podrían ser fatales
  ];

  // Si es un error de memoria, es fatal
  if (
    error.message &&
    (error.message.includes("heap out of memory") ||
      error.message.includes("JavaScript heap out of memory"))
  ) {
    return true;
  }

  return false;
}

const startServer = async () => {
  try {
    console.log("Iniciando servidor...");

    // Verificar si el puerto está en uso
    const portInUse = await isPortInUse(port);
    if (portInUse) {
      console.error(
        `⚠️ El puerto ${port} ya está en uso. Por favor cierre otras aplicaciones o use otro puerto.`
      );
      process.exit(1);
    }

    console.log("Conectando a MongoDB...");
    await connectToMongoDB();
    console.log("✅ Conexión a MongoDB establecida.");

    console.log("Cargando configuraciones...");
    await loadConfigurations();
    console.log("✅ Configuraciones cargadas.");

    console.log("Inicializando pools de conexiones...");
    initPools();
    console.log("✅ Pools de conexiones inicializados.");

    console.log("Intentando conexiones a SQL Server con timeout...");
    try {
      // Ejecutando diagnóstico de conexión directa con tedious
      console.log("Ejecutando diagnóstico de conexión directa con tedious...");
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
      }

      // Ejecutando diagnóstico usando el pool
      console.log("Ejecutando diagnóstico de conexión usando el pool...");
      try {
        const poolTestResult = await testPoolConnection("server2");
        console.log(
          `✅ Prueba de pool exitosa. Servidor: ${poolTestResult.server}`
        );
        console.log(
          `Versión SQL: ${poolTestResult.version.substring(0, 50)}...`
        );
      } catch (poolErr) {
        console.error(`❌ Prueba de pool fallida: ${poolErr.message}`);
      }

      // Mostrar estado de los pools
      console.log("Estado de los pools de conexiones:");
      const poolStatus = getPoolsStatus();
      console.log(JSON.stringify(poolStatus, null, 2));

      console.log(
        "✅ Pruebas de conexión a SQL Server completadas (con o sin éxito)"
      );
    } catch (error) {
      console.error("❌ Error inesperado con las conexiones SQL:", error);
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
      console.error("❌ Error al configurar cronjob:", cronError);
      console.log(
        "Continuando con la inicialización del servidor de todas formas..."
      );
    }

    // Iniciar el servidor (HTTPS o HTTP)
    console.log(
      `Iniciando servidor en modo: ${isDev ? "desarrollo" : "producción"}`
    );

    if (isDev) {
      // En desarrollo, podemos usar HTTP para simplificar
      console.log("Iniciando servidor HTTP para desarrollo...");
      server = http.createServer(app);

      server.on("error", (err) => {
        console.error("❌ Error en servidor HTTP:", err);
        if (err.code === "EADDRINUSE") {
          console.error(`El puerto ${port} está en uso. Abortando...`);
          process.exit(1);
        }
      });

      console.log("Llamando a server.listen() para HTTP...");
      server.listen(port, () => {
        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor HTTP iniciado en modo desarrollo: http://localhost:${port}/api/${API_VERSION}/`
        );
      });
      console.log(`Esperando que el servidor HTTP inicie en puerto ${port}...`);
    } else {
      // En producción, intentamos HTTPS con certificados
      try {
        console.log("Cargando certificados SSL para producción...");
        // Cargar certificados SSL
        const privateKey = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/privkey.pem",
          "utf8"
        );
        const certificate = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/fullchain.pem",
          "utf8"
        );
        const ca = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/chain.pem",
          "utf8"
        );

        const credentials = {
          key: privateKey,
          cert: certificate,
          ca: ca,
        };

        console.log("✅ Certificados SSL cargados correctamente");

        console.log("Paso 1: Creando servidor HTTPS...");
        server = https.createServer(credentials, app);
        console.log("Paso 2: Servidor HTTPS creado correctamente");

        // Configurar manejadores de eventos ANTES de listen()
        console.log("Paso 3: Configurando event handlers...");
        server.on("error", (err) => {
          console.error("❌ Error en servidor HTTPS:", err);
          if (err.code === "EADDRINUSE") {
            console.error(`El puerto ${port} está en uso. Abortando...`);
            process.exit(1);
          }
        });

        // Agregar un timeout para capturar errores silenciosos
        setTimeout(() => {
          if (server && !server.listening) {
            console.error(
              "⚠️ El servidor no pudo iniciar después de 5 segundos, verificando estado..."
            );
          }
        }, 5000);

        console.log("Paso 4: Llamando a server.listen() para HTTPS...");
        server.listen(port, () => {
          console.log("Paso 5: Callback de listen() ejecutado correctamente");
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `🔒 Servidor HTTPS iniciado en: https://localhost:${port}/api/${API_VERSION}/`
          );
        });
        console.log(
          "Paso 6: Llamada a server.listen() completada, esperando callback..."
        );
      } catch (error) {
        console.error("❌ Error crítico al configurar HTTPS:", error);

        // Si falla HTTPS, intentamos HTTP como fallback
        console.log("⚠️ Fallback a HTTP debido a error en certificados...");

        server = http.createServer(app);

        server.on("error", (err) => {
          console.error("❌ Error en servidor HTTP (fallback):", err);
          if (err.code === "EADDRINUSE") {
            console.error(`El puerto ${port} está en uso. Abortando...`);
            process.exit(1);
          }
        });

        server.listen(port, () => {
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `⚠️ Servidor HTTP (fallback) iniciado en: http://localhost:${port}/api/${API_VERSION}/`
          );
        });
      }
    }

    // Registrar cuando el servidor está escuchando (backup)
    if (server) {
      server.on("listening", () => {
        console.log(`✓ El servidor está escuchando en el puerto ${port}`);
      });
    }
  } catch (err) {
    console.error("❌ Error al iniciar el servidor:", err);
    process.exit(1);
  }
};

// Manejar errores no capturados de manera más robusta
process.on("uncaughtException", (error) => {
  console.error("⚠️ Error no capturado:", error);

  // Intenta registrar el error en el sistema de logging
  try {
    const logger = require("./services/logger");
    logger.error("Error no capturado en el proceso principal:", error);
  } catch (logError) {
    console.error("No se pudo registrar el error en el logger:", logError);
  }

  // En producción, no queremos que el servidor se detenga por errores no críticos
  if (isFatalError(error)) {
    console.error("Error fatal detectado. Terminando proceso...");

    // Cerrar pools de conexiones antes de terminar
    try {
      closePools();
    } catch (e) {
      console.error("Error al cerrar pools antes de terminar:", e);
    }

    process.exit(1);
  }
});

// Manejar rechazos de promesas no capturados
process.on("unhandledRejection", (reason, promise) => {
  console.warn("⚠️ Promesa rechazada no manejada:", reason);

  // Intenta registrar en el logger
  try {
    const logger = require("./services/logger");
    logger.warn("Promesa rechazada no manejada:", reason);
  } catch (logError) {
    console.error("No se pudo registrar el rechazo en el logger:", logError);
  }

  // No terminamos el proceso por rechazos de promesas no manejados
});

// Manejo de señales para cierre graceful
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
