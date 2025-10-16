require("dotenv").config();
const mongoose = require("mongoose");
const DBConfig = require("./models/dbConfigModel");

const connectToMongoDB = async () => {
  let MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    const DB_USER = process.env.DB_USER || "heriberto777";
    const DB_PASS = process.env.DB_PASS || "eli112910";
    const DB_HOST = process.env.DB_HOST || "localhost";
    const DB_PORT = process.env.DB_PORT || "27017";
    const DB_NAME = process.env.DB_NAME || "core_app";

    if (DB_USER && DB_PASS) {
      MONGO_URI = `mongodb://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    } else {
      MONGO_URI = `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    }
  }

  console.log(
    `Conectando a MongoDB: ${MONGO_URI.replace(/:[^:]*@/, ":****@")}`
  );

  try {
    await mongoose.connect(MONGO_URI, {
      authSource: "admin",
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conexión a MongoDB establecida");
  } catch (error) {
    console.error("Error al conectar a MongoDB:", error.message);
    process.exit(1);
  }
};

// Función para determinar si un host es una dirección IP
function isIpAddress(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

const updateConfigurations = async () => {
  try {
    await connectToMongoDB();

    // Obtener configuraciones actuales
    const configs = await DBConfig.find();
    console.log("\nConfiguraciones actuales:");
    configs.forEach((config) => {
      console.log(
        `- ${config.serverName}: ${config.host} (${config.database})`
      );
    });

    // Obtener valores desde variables de entorno
    const server1Host = process.env.SERVER1_HOST || "localhost";
    const server2Host = process.env.SERVER2_HOST || "localhost";

    // Determinar si los hosts son IPs
    const server1IsIp = isIpAddress(server1Host);
    const server2IsIp = isIpAddress(server2Host);

    if (server1IsIp) {
      console.log(
        `NOTA: Server1 (${server1Host}) es una dirección IP. Se desactivará encrypt para evitar advertencias TLS.`
      );
    }

    if (server2IsIp) {
      console.log(
        `NOTA: Server2 (${server2Host}) es una dirección IP. Se desactivará encrypt para evitar advertencias TLS.`
      );
    }

    // Configuración actualizada para server1
    const server1Config = {
      serverName: "server1",
      type: "mssql",
      user: process.env.SERVER1_USER || "usuario_server1",
      password: process.env.SERVER1_PASS || "password_server1",
      host: server1Host,
      port: parseInt(process.env.SERVER1_PORT || "1433"),
      database: process.env.SERVER1_DB || "database_server1",
      instance: process.env.SERVER1_INSTANCE || "",
      options: {
        // Si es IP, desactivar encrypt para evitar advertencias
        encrypt: server1IsIp ? false : process.env.SERVER1_ENCRYPT === "true",
        trustServerCertificate: true,
        enableArithAbort: true,
        ssl: false,
        authSource: null,
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
    };

    // Actualizar server1
    const result1 = await DBConfig.findOneAndUpdate(
      { serverName: "server1" },
      server1Config,
      { upsert: true, new: true }
    );

    console.log(`server1 ${result1 ? "actualizado" : "no encontrado"}`);

    // Configuración actualizada para server2
    const server2Config = {
      serverName: "server2",
      type: "mssql",
      user: process.env.SERVER2_USER || "usuario_server2",
      password: process.env.SERVER2_PASS || "password_server2",
      host: server2Host,
      port: parseInt(process.env.SERVER2_PORT || "1433"),
      database: process.env.SERVER2_DB || "database_server2",
      instance: process.env.SERVER2_INSTANCE || "",
      options: {
        // Si es IP, desactivar encrypt para evitar advertencias
        encrypt: server2IsIp ? false : process.env.SERVER2_ENCRYPT === "true",
        trustServerCertificate: true,
        enableArithAbort: true,
        ssl: false,
        authSource: null,
        useNewUrlParser: true,
        useUnifiedTopology: true,
      },
    };

    // Actualizar server2
    const result2 = await DBConfig.findOneAndUpdate(
      { serverName: "server2" },
      server2Config,
      { upsert: true, new: true }
    );

    console.log(`server2 ${result2 ? "actualizado" : "no encontrado"}`);

    // Mostrar configuraciones actualizadas
    const updatedConfigs = await DBConfig.find();
    console.log("\nConfiguraciones actualizadas:");
    updatedConfigs.forEach((config) => {
      console.log(`- ${config.serverName}:`);
      console.log(`  Type: ${config.type}`);
      console.log(`  Host: ${config.host}`);
      console.log(`  Port: ${config.port}`);
      console.log(`  Database: ${config.database}`);
      console.log(`  Instance: ${config.instance || "N/A"}`);
      console.log(`  User: ${config.user}`);
      console.log(`  Encrypt: ${config.options.encrypt}`);
      console.log(
        `  TrustServerCertificate: ${config.options.trustServerCertificate}`
      );
      console.log();
    });

    console.log(
      "Actualización completada. Revise que la opción 'encrypt' esté en FALSE para servidores con dirección IP."
    );
  } catch (error) {
    console.error("Error durante la actualización:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Conexión a MongoDB cerrada");
  }
};

// Ejecutar el script
updateConfigurations();
