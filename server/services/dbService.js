const sql = require("mssql");

const server1Config = {
  user: process.env.SERVER1_USER,
  password: process.env.SERVER1_PASS,
  server: process.env.SERVER1_HOST,
  database: process.env.SERVER1_DB,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 60000, // Incrementa el tiempo de espera a 60 segundos
  pool: {
    max: 10, // Máximo de conexiones en el pool
    min: 0, // Mínimo de conexiones
    idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexiones inactivas
  },
};

const server2Config = {
  user: process.env.SERVER2_USER,
  password: process.env.SERVER2_PASS,
  server: process.env.SERVER2_HOST,
  database: process.env.SERVER2_DB,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    instanceName: process.env.SERVER2_INSTANCE, // Instancia nombrada
  },
  requestTimeout: 60000, // Incrementa el tiempo de espera a 60 segundos
  pool: {
    max: 10, // Máximo de conexiones en el pool
    min: 0, // Mínimo de conexiones
    idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexiones inactivas
  },
};

const connectToServer1 = new sql.ConnectionPool(server1Config)
  .connect()
  .then((pool) => {
    console.log("Conexión a SERVER1_DB establecida");
    return pool;
  })
  .catch((err) => console.error("Error conectando a SERVER1_DB:", err));

const connectToServer2 = new sql.ConnectionPool(server2Config)
  .connect()
  .then((pool) => {
    console.log("Conexión a SERVER2_DB establecida");
    return pool;
  })
  .catch((err) => console.error("Error conectando a SERVER2_DB:", err));

module.exports = { connectToServer1, connectToServer2 };
