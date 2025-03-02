const mongoose = require("mongoose");

const dbConfigSchema = new mongoose.Schema({
  serverName: { type: String, required: true, unique: true }, // Debe coincidir con JSON
  type: {
    type: String,
    required: true,
    enum: ["mssql", "postgres", "mysql", "mariadb", "mongodb"],
  },
  user: { type: String, required: true },
  password: { type: String, required: true },
  host: { type: String, required: true }, // Antes era "server"
  port: { type: Number, required: true },
  database: { type: String, required: true },
  instance: { type: String, default: null }, // Opcional para MSSQL
  options: {
    encrypt: { type: Boolean, default: true },
    trustServerCertificate: { type: Boolean, default: true },
    enableArithAbort: { type: Boolean, default: true },
    ssl: { type: Boolean, default: false }, // Para PostgreSQL y MySQL
    authSource: { type: String, default: null }, // Para MongoDB
    useNewUrlParser: { type: Boolean, default: true },
    useUnifiedTopology: { type: Boolean, default: true },
  },
});

const DBConfig = mongoose.model("DBConfig", dbConfigSchema);
module.exports = DBConfig;
