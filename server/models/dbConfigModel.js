const mongoose = require("mongoose");

const dbConfigSchema = new mongoose.Schema({
  serverName: { type: String, required: true, unique: true },
  type: {
    type: String,
    required: true,
    enum: ["mssql", "postgres", "mysql", "mariadb", "mongodb"],
  },
  user: { type: String, required: true },
  password: { type: String, required: true },
  host: { type: String, required: true },
  port: { type: Number, required: true },
  database: { type: String, required: true },
  // Nombre del schema del ERP dentro de esta base (ej. "CATELLI", o "GND" en
  // una instalación futura con otra nomenclatura) -- antes estaba
  // hardcodeado como "CATELLI" en ~74 lugares del código. Solo tiene sentido
  // para server1 (el único que habla con el ERP real); en server2 no se usa.
  // Default "CATELLI" para que ninguna instalación existente necesite
  // migrar nada.
  erpSchema: { type: String, default: "CATELLI" },
  instance: { type: String, default: null },
  options: {
    mssqlEncrypt: { type: Boolean, default: true },
    trustServerCertificate: { type: Boolean, default: true },
    enableArithAbort: { type: Boolean, default: true },
    ssl: { type: Boolean, default: false },
    authSource: { type: String, default: null },
    useNewUrlParser: { type: Boolean, default: true },
    useUnifiedTopology: { type: Boolean, default: true },
  },
});

const DBConfig = mongoose.model("DBConfig", dbConfigSchema);
module.exports = DBConfig;
