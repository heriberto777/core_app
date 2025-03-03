require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");  // Añadido para soporte HTTP
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
const isDev = process.env.NODE_ENV !== 'production';

// Variable para guardar el servidor (HTTP o HTTPS)
let server;

const startServer = async () => {
  try {
    await connectToMongoDB(); // 🔥 Conectar a MongoDB
    console.log("✅ Conexión a MongoDB establecida.");

    await loadConfigurations(); // 🔄 Cargar configuración de servidores SQL desde MongoDB

    try {
      // Intentar conectar a los servidores SQL configurados
      await connectToDB("server1");
      await connectToDB("server2");
    } catch (error) {
      console.error("❌ Error conectando a SQL Server:", error);
    }

    const config = await Config.findOne();
    const executionHour = config?.hour || "03:00";
    console.log(`⏰ Transferencias programadas a las: ${executionHour}`);

    startCronJob(executionHour); // Iniciar cronjob con la hora configurada

    // Iniciar el servidor (HTTPS o HTTP)
    if (isDev) {
      // En desarrollo, podemos usar HTTP para simplificar
      server = http.createServer(app);
      
      server.listen(port, () => {
        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor HTTP iniciado en modo desarrollo: http://localhost:${port}/api/${API_VERSION}/`
        );
      });
    } else {
      // En producción, intentamos HTTPS con certificados
      try {
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
        
        server = https.createServer(credentials, app);
        
        server.listen(port, () => {
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `🔒 Servidor HTTPS iniciado en: https://localhost:${port}/api/${API_VERSION}/`
          );
        });
      } catch (error) {
        console.error("❌ Error al leer los certificados:", error.message);
        
        // Si falla HTTPS, intentamos HTTP como fallback
        console.log("⚠️ Fallback a HTTP debido a error en certificados...");
        
        server = http.createServer(app);
        
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

    // Manejar errores del servidor de manera unificada
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`⚠️ El puerto ${port} está en uso. Abortando...`);
        process.exit(1);
      } else {
        console.error("❌ Error en el servidor:", err);
      }
    });
  } catch (err) {
    console.error("❌ Error al iniciar el servidor:", err);
    process.exit(1);
  }
};

// Manejar errores no capturados
process.on("uncaughtException", (error) => {
  console.error("❌ Error no capturado:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Rechazo de promesa no manejado:", reason);
});

// Manejo de señales para cierre graceful
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM. Cerrando servidor gracefully...');
  if (server) {
    server.close(() => {
      console.log('Servidor cerrado. Proceso terminando...');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

startServer();