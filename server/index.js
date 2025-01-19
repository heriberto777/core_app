require("dotenv").config();
const app = require("./app");
const mongoose = require("mongoose");
const https = require("https");
const { startCronJob } = require("./services/cronService");
const Config = require("./models/configModel");
const {
  API_VERSION,
  IP_SERVER,
  PORT_DB,
  USERNAME,
  PASSWORD,
} = require("./config");

const port = process.env.PORT || 3000;

// Conexión a MongoDB
mongoose
  .connect(
    `mongodb://${USERNAME}:${PASSWORD}@${IP_SERVER}:${PORT_DB}/core_app`,
    {
      authSource: "admin",
    }
  )
  .then(async () => {
    console.log("Conexión a MongoDB establecida.");

    // Recuperar el intervalo y arrancar la tarea programada
    const config = await Config.findOne();
    const interval = config ? config.interval : 10; // Valor por defecto: 10 minutos
    startCronJob(interval);

    console.log("La conexión a la base de datos es correcta.");

    // Servidor HTTPS
    app.listen(port, () => {
      console.log("******************************");
      console.log("******************************");
      console.log("****** API REST CATELLI ******");
      console.log("******************************");
      console.log("******************************");
      console.log(`http://${IP_SERVER}:${port}/api/${API_VERSION}/`);
    });
  })
  .catch((err) => console.error("Error al conectar a MongoDB:", err));
