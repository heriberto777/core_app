// models/consecutivoModel.js
const mongoose = require("mongoose");

const consecutivoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  valor: { type: String, default: "" }, // <-- antes era Number, ahora es String
});

module.exports = mongoose.model("Consecutivo", consecutivoSchema);
