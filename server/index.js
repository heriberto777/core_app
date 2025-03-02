require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const {
  connectToMongoDB,
  loadConfigurations,
  connectToDB,
} = require("./services/dbService");
const { startCronJob } = require("./services/cronService");
const Config = require("./models/configModel");
const { API_VERSION } = require("./config");

// Puerto para HTTPS - usar el mismo que tu otra aplicación para mantener consistencia
const port = process.env.PORT || 3979;

// Cargar certificados SSL
let credentials;
try {
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

  credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca,
  };
  console.log("✅ Certificados SSL cargados correctamente");
} catch (error) {
  console.error("❌ Error al leer los certificados:", error.message);
  process.exit(1); // Salir si no podemos cargar los certificados, como en tu versión original
}

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

    // Crear e iniciar servidor HTTPS (único servidor)
    const httpsServer = https.createServer(credentials, app);

    httpsServer.listen(port, () => {
      console.log("******************************");
      console.log("****** API REST CATELLI ******");
      console.log("******************************");
      console.log(
        `🔒 Servidor HTTPS iniciado en: https://localhost:${port}/api/${API_VERSION}/`
      );
    });

    // Manejar errores del servidor HTTPS
    httpsServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`⚠️ El puerto ${port} está en uso. Abortando...`);
        process.exit(1);
      } else {
        console.error("❌ Error en el servidor HTTPS:", err);
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

startServer();
