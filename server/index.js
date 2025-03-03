require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");
const {
  connectToMongoDB,
  loadConfigurations,
  connectToDB,
  testEnvBasedConnection,
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

    console.log("Intentando conexiones a SQL Server...");
    try {
      // Usar Promise.all para manejar ambas conexiones en paralelo
      await Promise.all([
        connectToDB("server1").catch((err) => {
          console.warn("⚠️ Error conectando a server1:", err);
          return null;
        }),
        connectToDB("server2").catch((err) => {
          console.warn("⚠️ Error conectando a server2:", err);
          return null;
        }),
      ]);
      console.log("✅ Conexiones a SQL Server probadas.");
    } catch (error) {
      console.error("❌ Error general conectando a SQL Server:", error);
      // Continuamos de todas formas
    }

    console.log("Configurando cronjob...");
    const config = await Config.findOne();
    const executionHour = config?.hour || "03:00";
    console.log(`⏰ Transferencias programadas a las: ${executionHour}`);

    startCronJob(executionHour);
    console.log("✅ Cronjob configurado.");

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

// Manejar errores no capturados
process.on("uncaughtException", (error) => {
  console.error("❌ Error no capturado:", error);
  // En producción, posiblemente quieras reiniciar el servidor
  if (!isDev && server) {
    console.log(
      "Intentando cerrar el servidor gracefully después de un error no capturado..."
    );
    server.close(() => {
      console.log("Servidor cerrado. Saliendo...");
      process.exit(1);
    });

    // Por si server.close() nunca termina
    setTimeout(() => {
      console.log("Forzando salida después de error no capturado");
      process.exit(1);
    }, 5000);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Rechazo de promesa no manejado:", reason);
});

// Manejo de señales para cierre graceful
process.on("SIGTERM", () => {
  console.log("Recibida señal SIGTERM. Cerrando servidor gracefully...");
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
