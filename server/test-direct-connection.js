// test-direct-connection.js
const { Connection, Request } = require("tedious");
const MongoDbService = require("./services/mongoDbService");
const DBConfig = require("./models/dbConfigModel");

async function testDirectConnection() {
  try {
    console.log("🔍 TEST DIRECTO DE CONEXIÓN A SERVER2\n");

    // Conectar a MongoDB y obtener configuración
    await MongoDbService.connect();
    const dbConfig = await DBConfig.findOne({ serverName: "server2" }).lean();

    if (!dbConfig) {
      console.error("❌ No se encontró configuración para server2");
      return;
    }

    console.log("📋 Configuración desde MongoDB:");
    console.log(`   - Host: ${dbConfig.host}`);
    console.log(`   - Instance: ${dbConfig.instance}`);
    console.log(`   - User: ${dbConfig.user}`);
    console.log(`   - Database: ${dbConfig.database}`);
    console.log("");

    // Crear configuración Tedious manualmente
    const tediousConfig = {
      server: dbConfig.host, // ESTO DEBE SER STRING
      authentication: {
        type: "default",
        options: {
          userName: dbConfig.user,
          password: dbConfig.password,
        },
      },
      options: {
        database: dbConfig.database,
        instanceName: dbConfig.instance, // Para instancia nombrada
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 120000, // 2 minutos
        requestTimeout: 180000, // 3 minutos
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,
      },
    };

    console.log("🔧 Configuración Tedious creada:");
    console.log(
      `   - server: "${
        tediousConfig.server
      }" (tipo: ${typeof tediousConfig.server})`
    );
    console.log(`   - instanceName: "${tediousConfig.options.instanceName}"`);
    console.log(`   - database: "${tediousConfig.options.database}"`);
    console.log(
      `   - userName: "${tediousConfig.authentication.options.userName}"`
    );
    console.log("");

    // Probar conexión
    console.log("🚀 Iniciando conexión...");

    return new Promise((resolve) => {
      const startTime = Date.now();
      const connection = new Connection(tediousConfig);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          connection.removeAllListeners();
          try {
            connection.close();
          } catch (e) {}
          console.log("⏰ TIMEOUT después de 2 minutos");
          resolve(false);
        }
      }, 125000);

      connection.on("connect", (err) => {
        if (resolved) return;
        clearTimeout(timeout);
        resolved = true;

        const connectionTime = Date.now() - startTime;

        if (err) {
          console.log(`❌ ERROR DE CONEXIÓN (${connectionTime}ms):`);
          console.log(`   - Mensaje: ${err.message}`);
          console.log(`   - Código: ${err.code || "N/A"}`);
          console.log(`   - Estado: ${err.state || "N/A"}`);
          resolve(false);
        } else {
          console.log(`✅ CONEXIÓN EXITOSA! (${connectionTime}ms)`);

          // Probar consulta
          const testRequest = new Request(
            "SELECT @@SERVERNAME AS ServerName, DB_NAME() AS Database",
            (queryErr, rowCount) => {
              try {
                connection.close();
              } catch (e) {}

              if (queryErr) {
                console.log(`❌ Error en consulta: ${queryErr.message}`);
                resolve(false);
              } else {
                console.log(`✅ Consulta exitosa (${rowCount} filas)`);
                resolve(true);
              }
            }
          );

          let queryData = [];
          testRequest.on("row", (columns) => {
            const row = {};
            columns.forEach((column) => {
              row[column.metadata.colName] = column.value;
            });
            queryData.push(row);
          });

          testRequest.on("done", () => {
            console.log("\n📊 RESULTADOS:");
            console.log(
              `   - Servidor SQL: ${queryData[0]?.ServerName || "N/A"}`
            );
            console.log(
              `   - Base de datos: ${queryData[0]?.Database || "N/A"}`
            );

            try {
              connection.close();
            } catch (e) {}
            resolve(true);
          });

          connection.execSql(testRequest);
        }
      });

      connection.on("error", (err) => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          console.log(`❌ ERROR: ${err.message}`);
          resolve(false);
        }
      });

      connection.connect();
    });
  } catch (error) {
    console.error("💥 Error:", error.message);
    return false;
  } finally {
    await MongoDbService.disconnect();
  }
}

// Ejecutar test
testDirectConnection().then((success) => {
  console.log("\n🏁 RESULTADO:");
  console.log(success ? "✅ CONEXIÓN EXITOSA" : "❌ CONEXIÓN FALLÓ");
  process.exit(success ? 0 : 1);
});
