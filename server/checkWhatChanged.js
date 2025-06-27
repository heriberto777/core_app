// checkWhatChanged.js - Ver qué cambió en la configuración
const MongoDbService = require("./services/mongoDbService");
const DBConfig = require("./models/dbConfigModel");

async function checkConfigChanges() {
  try {
    if (!MongoDbService.isConnected()) {
      await MongoDbService.connect();
    }

    console.log("🔍 Verificando configuración actual de server2...");

    const server2Config = await DBConfig.findOne({
      serverName: "server2",
    }).lean();

    if (server2Config) {
      console.log("📋 Configuración actual de server2:");
      console.log("   ServerName:", server2Config.serverName);
      console.log("   Host:", server2Config.host);
      console.log("   Instance:", server2Config.instance);
      console.log("   Port:", server2Config.port);
      console.log("   Database:", server2Config.database);
      console.log("   User:", server2Config.user);
      console.log(
        "   Password length:",
        server2Config.password ? server2Config.password.length : 0
      );
      console.log(
        "   Password starts with:",
        server2Config.password
          ? server2Config.password.substring(0, 3) + "..."
          : "no password"
      );
      console.log("   Type:", server2Config.type);

      // Verificar si coincide con los valores esperados
      const expectedConfig = {
        host: "sql-calidad.miami",
        instance: "calidadstdb",
        database: "stdb_gnd",
        user: "cliente-catelli",
        passwordLength: 17,
      };

      console.log("\n✅ Verificación de configuración:");
      console.log(
        `   Host correcto: ${
          server2Config.host === expectedConfig.host ? "✅" : "❌"
        }`
      );
      console.log(
        `   Instancia correcta: ${
          server2Config.instance === expectedConfig.instance ? "✅" : "❌"
        }`
      );
      console.log(
        `   Database correcta: ${
          server2Config.database === expectedConfig.database ? "✅" : "❌"
        }`
      );
      console.log(
        `   Usuario correcto: ${
          server2Config.user === expectedConfig.user ? "✅" : "❌"
        }`
      );
      console.log(
        `   Password length correcto: ${
          server2Config.password?.length === expectedConfig.passwordLength
            ? "✅"
            : "❌"
        }`
      );
    } else {
      console.log("❌ No se encontró configuración para server2");
    }
  } catch (error) {
    console.error("❌ Error verificando configuración:", error);
  }

  process.exit(0);
}

if (require.main === module) {
  checkConfigChanges();
}
