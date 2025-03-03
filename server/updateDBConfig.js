/**
 * Script para actualizar las configuraciones de conexión SQL en MongoDB al formato correcto
 *
 * Ejecutar con:
 * node updateDBConfig.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const readline = require("readline");

// Modelo para las configuraciones de BD
const DBConfigSchema = new mongoose.Schema(
  {
    serverName: {
      type: String,
      required: true,
      unique: true,
    },
    // Nuevos campos para formato tedious
    host: String,
    user: String,
    password: String,
    database: String,
    instance: String,
    port: Number,
    options: {
      encrypt: Boolean,
      trustServerCertificate: Boolean,
      connectionTimeout: Number,
      requestTimeout: Number,
    },
  },
  { timestamps: true }
);

const DBConfig = mongoose.model("DBConfig", DBConfigSchema);

// Función para conectar a MongoDB
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

// Función para obtener confirmación del usuario
const confirm = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + " (s/n): ", (answer) => {
      rl.close();
      resolve(
        answer.toLowerCase() === "s" ||
          answer.toLowerCase() === "si" ||
          answer.toLowerCase() === "yes" ||
          answer.toLowerCase() === "y"
      );
    });
  });
};

// Función principal
const updateConfigurations = async () => {
  try {
    await connectToMongoDB();

    // Mostrar configuraciones actuales
    const configs = await DBConfig.find();
    console.log("\nConfiguraciones actuales:");
    configs.forEach((config) => {
      console.log(
        `- ${config.serverName}: ${config.host || "N/A"} (${
          config.database || "N/A"
        })`
      );
    });

    // Confirmar actualización
    const shouldUpdate = await confirm(
      "\n¿Desea actualizar las configuraciones al nuevo formato?"
    );
    if (!shouldUpdate) {
      console.log("Operación cancelada");
      return;
    }

    // Actualizar server1
    if (process.env.SERVER1_HOST) {
      const server1Config = {
        host: process.env.SERVER1_HOST,
        user: process.env.SERVER1_USER,
        password: process.env.SERVER1_PASS,
        database: process.env.SERVER1_DB,
        options: {
          encrypt: process.env.SERVER1_ENCRYPT === "true",
          trustServerCertificate:
            process.env.SERVER1_TRUST_SERVER_CERT === "true",
          connectionTimeout: 30000,
          requestTimeout: 60000,
        },
      };

      // Añadir instance solo si está definido
      if (process.env.SERVER1_INSTANCE) {
        server1Config.instance = process.env.SERVER1_INSTANCE;
      }

      const result1 = await DBConfig.updateOne(
        { serverName: "server1" },
        { $set: server1Config },
        { upsert: true }
      );

      console.log(
        `server1 ${result1.modifiedCount ? "actualizado" : "creado"}`
      );
    }

    // Actualizar server2
    if (process.env.SERVER2_HOST) {
      const server2Config = {
        host: process.env.SERVER2_HOST,
        user: process.env.SERVER2_USER,
        password: process.env.SERVER2_PASS,
        database: process.env.SERVER2_DB,
        options: {
          encrypt: process.env.SERVER2_ENCRYPT === "true",
          trustServerCertificate:
            process.env.SERVER2_TRUST_SERVER_CERT === "true",
          connectionTimeout: 30000,
          requestTimeout: 60000,
        },
      };

      // Añadir instance solo si está definido
      if (process.env.SERVER2_INSTANCE) {
        server2Config.instance = process.env.SERVER2_INSTANCE;
      }

      const result2 = await DBConfig.updateOne(
        { serverName: "server2" },
        { $set: server2Config },
        { upsert: true }
      );

      console.log(
        `server2 ${result2.modifiedCount ? "actualizado" : "creado"}`
      );
    }

    // Mostrar configuraciones actualizadas
    const updatedConfigs = await DBConfig.find();
    console.log("\nConfiguraciones actualizadas:");
    updatedConfigs.forEach((config) => {
      console.log(`- ${config.serverName}:`);
      console.log(`  Host: ${config.host || "N/A"}`);
      console.log(`  Database: ${config.database || "N/A"}`);
      console.log(`  Instance: ${config.instance || "N/A"}`);
      console.log(`  User: ${config.user || "N/A"}`);
      console.log(`  Options: ${JSON.stringify(config.options || {})}`);
      console.log();
    });

    console.log("Actualización completada");
  } catch (error) {
    console.error("Error durante la actualización:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Conexión a MongoDB cerrada");
  }
};

// Ejecutar el script
updateConfigurations();
