// debug-config.js
const MongoDbService = require("./services/mongoDbService");
const DBConfig = require("./models/dbConfigModel");
const ConnectionCentralService = require("./services/ConnectionCentralService");

async function debugConfiguration() {
  try {
    console.log("🔍 DEBUG: Verificando configuración paso a paso...\n");

    // 1. Conectar a MongoDB
    console.log("1️⃣  Conectando a MongoDB...");
    const mongoConnected = await MongoDbService.connect();
    if (!mongoConnected) {
      console.error("❌ MongoDB: FALLÓ");
      return;
    }
    console.log("✅ MongoDB: OK\n");

    // 2. Buscar configuración de server2 directamente
    console.log("2️⃣  Buscando configuración server2 en MongoDB...");
    const rawConfig = await DBConfig.findOne({ serverName: "server2" }).lean();

    if (!rawConfig) {
      console.error("❌ No se encontró configuración para server2");
      console.log("Creando configuración...");

      const newConfig = new DBConfig({
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

      await newConfig.save();
      console.log("✅ Configuración creada");

      // Volver a buscar la configuración
      const savedConfig = await DBConfig.findOne({
        serverName: "server2",
      }).lean();
      console.log(
        "📋 Configuración guardada:",
        JSON.stringify(savedConfig, null, 2)
      );
      return;
    }

    console.log("✅ Configuración encontrada en MongoDB:");
    console.log(JSON.stringify(rawConfig, null, 2));
    console.log("");

    // 3. Probar el método _loadConfig
    console.log("3️⃣  Probando método _loadConfig...");
    const loadedConfig = await ConnectionCentralService._loadConfig("server2");

    if (!loadedConfig) {
      console.error("❌ _loadConfig devolvió null");
      return;
    }

    console.log("✅ Configuración cargada por _loadConfig:");
    console.log(JSON.stringify(loadedConfig, null, 2));
    console.log("");

    // 4. Verificar propiedades críticas
    console.log("4️⃣  Verificando propiedades críticas...");
    console.log(
      `   - config.server: "${
        loadedConfig.server
      }" (tipo: ${typeof loadedConfig.server})`
    );
    console.log(
      `   - config.authentication: ${JSON.stringify(
        loadedConfig.authentication
      )}`
    );
    console.log(
      `   - config.options.database: "${loadedConfig.options?.database}"`
    );
    console.log(
      `   - config.options.instanceName: "${loadedConfig.options?.instanceName}"`
    );
    console.log("");

    // 5. Intentar crear conexión directamente
    console.log("5️⃣  Intentando crear conexión con configuración depurada...");
    const { Connection } = require("tedious");

    try {
      const connection = new Connection(loadedConfig);
      console.log("✅ Configuración es válida para tedious");
      connection.close();
    } catch (tediousError) {
      console.error(
        "❌ Error al crear conexión tedious:",
        tediousError.message
      );
    }
  } catch (error) {
    console.error("💥 Error durante debug:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await MongoDbService.disconnect();
    process.exit(0);
  }
}

debugConfiguration();
