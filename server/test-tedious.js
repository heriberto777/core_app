// test-tedious.js
const { Connection, Request } = require("tedious");

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
    instanceName: "calidadstdb",
    trustServerCertificate: true,
    rowCollectionOnRequestCompletion: true,
  },
};

const connection = new Connection(config);

connection.on("connect", function (err) {
  if (err) {
    console.error("Error de conexión:", err);
    process.exit(1);
  }

  console.log("Conectado a SQL Server");

  // Ejecutar una consulta simple
  const request = new Request("SELECT * FROM dbo.IMPLT_accounts", function (
    err,
    rowCount,
    rows
  ) {
    if (err) {
      console.error("Error en consulta:", err);
    } else {
      console.log("Versión SQL Server:", rows[0]);
    }
    connection.close();
  });

  connection.execSql(request);
});

connection.connect();
