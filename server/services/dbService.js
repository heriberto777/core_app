const sql = require("mssql");

const server1Config = {
  user: process.env.SERVER1_USER,
  password: process.env.SERVER1_PASS,
  server: process.env.SERVER1_HOST,
  database: process.env.SERVER1_DB,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  requestTimeout: 60000,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
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
    enableArithAbort: true,
  },
  requestTimeout: 60000,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
  },
};

// Función para conectarse al servidor 1
const connectToServer1 = async () => {
  try {
    if (!global.server1Pool) {
      global.server1Pool = await new sql.ConnectionPool(
        server1Config
      ).connect();
      console.log("✅ Conexión a SERVER1_DB establecida");
    }
    return global.server1Pool;
  } catch (err) {
    console.error("❌ Error conectando a SERVER1_DB:", err);
    throw err;
  }
};

// Función para conectarse al servidor 2
const connectToServer2 = async () => {
  try {
    if (!global.server2Pool) {
      global.server2Pool = await new sql.ConnectionPool(
        server2Config
      ).connect();
      console.log("✅ Conexión a SERVER2_DB establecida");
    }
    return global.server2Pool;
  } catch (err) {
    console.error("❌ Error conectando a SERVER2_DB:", err);
    throw err;
  }
};

module.exports = { connectToServer1, connectToServer2 };
