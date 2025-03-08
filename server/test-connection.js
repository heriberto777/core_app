require("dotenv").config();
const { Connection, Request } = require("tedious");

console.log("Test de conexión directa a SQL Server");

// Configuración desde variables de entorno
const config = {
  server: process.env.SERVER1_HOST || "localhost",
  authentication: {
    type: "default",
    options: {
      userName: process.env.SERVER1_USER || "sa",
      password: process.env.SERVER1_PASS || "",
    },
  },
  options: {
    encrypt: process.env.SERVER1_ENCRYPT === "true",
    trustServerCertificate: true,
    database: process.env.SERVER1_DB || "master",
    port: parseInt(process.env.SERVER1_PORT || "1433"),
    connectTimeout: 35000,
  },
};

// Si hay una instancia, agregarla
if (process.env.SERVER1_INSTANCE) {
  config.options.instanceName = process.env.SERVER1_INSTANCE;
}

console.log("Intentando conexión con:");
console.log("Server:", config.server);
console.log("Database:", config.options.database);
console.log("User:", config.authentication.options.userName);
console.log("Instance:", config.options.instanceName || "DEFAULT");
console.log("Port:", config.options.port);

const connection = new Connection(config);

connection.on("connect", (err) => {
  if (err) {
    console.error("ERROR DE CONEXIÓN:");
    console.error(err);
    process.exit(1);
  }

  console.log("¡CONEXIÓN EXITOSA!");

  // Realizar una consulta simple de prueba
  console.log("Ejecutando consulta de prueba...");

  const request = new Request(
    "SELECT @@VERSION as version",
    (err, rowCount, rows) => {
      if (err) {
        console.error("Error en consulta:", err);
      } else {
        console.log("Versión SQL Server:");
        if (rows && rows.length > 0 && rows[0].length > 0) {
          console.log(rows[0][0].value);
        }
      }

      console.log("Cerrando conexión...");
      connection.close();
    }
  );

  connection.execSql(request);
});

connection.on("error", (err) => {
  console.error("Error en conexión:", err);
});

connection.connect();
