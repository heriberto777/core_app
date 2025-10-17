require("dotenv").config();
const app = require("./app");
const {
  connectToMongoDB,
  loadConfigurations,
  connectToDB,
} = require("./services/dbService");
const { startCronJob } = require("./services/cronService");
const Config = require("./models/configModel");
const http = require("http");
const { API_VERSION } = require("./config");

const PORT = process.env.PORT || 3979;

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

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log("******************************");
      console.log("****** API REST CATELLI ******");
      console.log("******************************");
      console.log(
        `🚀 Servidor iniciado en: http://localhost:${PORT}/api/${API_VERSION}/`
      );
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`⚠️ El puerto ${PORT} está en uso, intentando otro...`);
        server.listen(0, () => {
          console.log(`✅ Nuevo puerto asignado: ${server.address().port}`);
        });
      } else {
        console.error("❌ Error en el servidor:", err);
      }
    });
  } catch (err) {
    console.error("❌ Error al iniciar el servidor:", err);
  }
};

startServer();
