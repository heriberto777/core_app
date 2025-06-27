// quick-test.js
const { Connection, Request } = require("tedious");

// Configuración directa para server2
const config = {
  server: "sql-calidad.miami",
  authentication: {
    type: "default",
    options: {
      userName: "cliente-catelli",
      password: "Smk1$kE[qVc%5fY",
    },
  },
  options: {
    database: "stdb_gnd",
    instanceName: "calidadstdb", // Instancia nombrada
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 120000, // 2 minutos
    requestTimeout: 180000, // 3 minutos
    rowCollectionOnRequestCompletion: true,
    useColumnNames: true,
  },
};

async function quickTest() {
  console.log("🚀 PRUEBA RÁPIDA DE SERVER2");
  console.log("===========================\n");

  console.log("🔧 Configuración:");
  console.log(`   - Servidor: ${config.server}`);
  console.log(`   - Instancia: ${config.options.instanceName}`);
  console.log(`   - Base de datos: ${config.options.database}`);
  console.log(`   - Usuario: ${config.authentication.options.userName}`);
  console.log(`   - Timeout: ${config.options.connectTimeout}ms\n`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    const connection = new Connection(config);
    let resolved = false;

    // Timeout de seguridad
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        connection.removeAllListeners();
        try {
          connection.close();
        } catch (e) {}

        const totalTime = Date.now() - startTime;
        console.log(`⏰ TIMEOUT después de ${totalTime}ms`);
        console.log("❌ La conexión tardó demasiado tiempo");
        resolve(false);
      }
    }, 125000); // 125 segundos

    // Evento de conexión exitosa
    connection.on("connect", (err) => {
      if (resolved) return;

      clearTimeout(timeout);
      resolved = true;

      const connectTime = Date.now() - startTime;

      if (err) {
        console.log(`❌ ERROR DE CONEXIÓN (${connectTime}ms)`);
        console.log(`   - Mensaje: ${err.message}`);
        console.log(`   - Código: ${err.code || "N/A"}`);
        console.log(`   - Estado: ${err.state || "N/A"}`);
        resolve(false);
      } else {
        console.log(`✅ CONEXIÓN EXITOSA! (${connectTime}ms)`);

        // Probar una consulta simple
        const testQuery = new Request(
          "SELECT @@SERVERNAME AS ServerName, DB_NAME() AS Database, GETDATE() AS CurrentTime",
          (queryErr, rowCount) => {
            try {
              connection.close();
            } catch (e) {}

            if (queryErr) {
              console.log(`❌ Error en consulta: ${queryErr.message}`);
              resolve(false);
            } else {
              console.log(
                `✅ Consulta ejecutada exitosamente (${rowCount} filas)`
              );
              resolve(true);
            }
          }
        );

        let queryData = [];
        testQuery.on("row", (columns) => {
          const row = {};
          columns.forEach((column) => {
            row[column.metadata.colName] = column.value;
          });
          queryData.push(row);
        });

        testQuery.on("done", () => {
          const totalTime = Date.now() - startTime;
          console.log(`\n📊 RESULTADOS DE LA CONSULTA:`);
          console.log(
            `   - Servidor SQL: ${queryData[0]?.ServerName || "N/A"}`
          );
          console.log(`   - Base de datos: ${queryData[0]?.Database || "N/A"}`);
          console.log(`   - Fecha/Hora: ${queryData[0]?.CurrentTime || "N/A"}`);
          console.log(`   - Tiempo total: ${totalTime}ms`);

          try {
            connection.close();
          } catch (e) {}
          resolve(true);
        });

        connection.execSql(testQuery);
      }
    });

    // Evento de error
    connection.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;

        const totalTime = Date.now() - startTime;
        console.log(`❌ ERROR DE CONEXIÓN (${totalTime}ms)`);
        console.log(`   - Mensaje: ${err.message}`);
        console.log(`   - Código: ${err.code || "N/A"}`);
        resolve(false);
      }
    });

    // Iniciar conexión
    console.log("🔄 Iniciando conexión...");
    connection.connect();
  });
}

// Ejecutar prueba
quickTest().then((success) => {
  console.log("\n🏁 RESULTADO FINAL:");
  console.log(
    success
      ? "✅ ÉXITO - Server2 funciona correctamente!"
      : "❌ FALLO - Revisar configuración"
  );
  process.exit(success ? 0 : 1);
});
