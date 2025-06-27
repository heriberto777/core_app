// check-db-configs.js
const MongoDbService = require("./services/mongoDbService");
const DBConfig = require("./models/dbConfigModel");

async function checkConfigurations() {
  try {
    console.log("🔍 Verificando configuraciones en MongoDB...\n");

    // Conectar a MongoDB
    const mongoConnected = await MongoDbService.connect();
    if (!mongoConnected) {
      console.error("❌ No se pudo conectar a MongoDB");
      process.exit(1);
    }
    console.log("✅ MongoDB conectado\n");

    // Obtener todas las configuraciones
    const configs = await DBConfig.find().lean();
    console.log(`📋 Configuraciones encontradas: ${configs.length}\n`);

    if (configs.length === 0) {
      console.log("⚠️  No hay configuraciones en la base de datos");
      console.log("Creando configuraciones de ejemplo...\n");

      // Crear configuración para server1 (ejemplo)
      const server1Config = new DBConfig({
        serverName: "server1",
        type: "mssql",
        host: "localhost",
        port: 1433,
        user: "sa",
        password: "password",
        database: "master",
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      });

      // Crear configuración para server2 (tu caso)
      const server2Config = new DBConfig({
        serverName: "server2",
        type: "mssql",
        host: "sql-calidad.miami",
        instance: "calidadstdb",
        user: "cliente-catelli",
        password: "Smk1$kE[qVc%5fY",
        database: "stdb_gnd",
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      });

      await server1Config.save();
      await server2Config.save();

      console.log("✅ Configuraciones de ejemplo creadas");
      console.log("   - server1: localhost:1433");
      console.log("   - server2: sql-calidad.miami\\calidadstdb");
    } else {
      // Mostrar configuraciones existentes
      configs.forEach((config, index) => {
        console.log(`${index + 1}. ${config.serverName}:`);
        console.log(`   - Host: ${config.host || "NO DEFINIDO"}`);
        console.log(`   - Instancia: ${config.instance || "N/A"}`);
        console.log(`   - Puerto: ${config.port || "N/A"}`);
        console.log(`   - Usuario: ${config.user || "NO DEFINIDO"}`);
        console.log(`   - Database: ${config.database || "NO DEFINIDO"}`);
        console.log(`   - Tipo: ${config.type || "NO DEFINIDO"}`);
        console.log(`   - Opciones: ${JSON.stringify(config.options || {})}`);

        // Verificar campos críticos
        const missingFields = [];
        if (!config.host) missingFields.push("host");
        if (!config.user) missingFields.push("user");
        if (!config.password) missingFields.push("password");
        if (!config.database) missingFields.push("database");

        if (missingFields.length > 0) {
          console.log(`   ❌ CAMPOS FALTANTES: ${missingFields.join(", ")}`);
        } else {
          console.log(`   ✅ Configuración completa`);
        }
        console.log("");
      });
    }

    // Desconectar
    await MongoDbService.disconnect();
    console.log("✅ Verificación completada");
  } catch (error) {
    console.error("❌ Error durante verificación:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    process.exit(0);
  }
}

// Ejecutar verificación
checkConfigurations();
