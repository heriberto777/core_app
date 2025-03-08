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
  instance: { type: String, default: null },
  options: {
    encrypt: { type: Boolean, default: true },
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
