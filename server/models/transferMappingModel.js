const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema para el mapeo de valores
const ValueMapSchema = new Schema({
  sourceValue: { type: Schema.Types.Mixed, required: true },
  targetValue: { type: Schema.Types.Mixed, required: true },
});

// Schema para el mapeo de campos
const FieldMappingSchema = new Schema({
  sourceField: { type: String, required: true },
  targetField: { type: String, required: true },
  defaultValue: { type: Schema.Types.Mixed },
  isSqlFunction: { type: Boolean, default: false },
  valueMappings: [ValueMapSchema],
});

// Schema para la configuración de tabla
const TableConfigSchema = new Schema({
  name: { type: String, required: true },
  sourceTable: { type: String, required: true },
  targetTable: { type: String, required: true },
  primaryKey: { type: String },
  isDetailTable: { type: Boolean, default: false },
  parentTableRef: { type: String }, // Para tablas de detalle, referencia a la tabla padre
  fieldMappings: [FieldMappingSchema],
  filterCondition: { type: String }, // Condición SQL para filtrar registros (WHERE clause)
  customQuery: { type: String }, // Consulta personalizada para casos especiales
});

// Schema para la regla de tipo de documento
const DocumentTypeRuleSchema = new Schema({
  name: { type: String, required: true },
  sourceField: { type: String, required: true },
  sourceValues: [String], // Valores que debe tener el campo para aplicar esta regla
  description: { type: String },
});

// Schema principal para el mapeo
const TransferMappingSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  taskId: { type: Schema.Types.ObjectId, ref: "TransferTask" },
  transferType: { type: String, enum: ["up", "down", "both"], default: "down" },
  active: { type: Boolean, default: true },
  sourceServer: { type: String, enum: ["server1", "server2"], required: true },
  targetServer: { type: String, enum: ["server1", "server2"], required: true },
  documentTypeRules: [DocumentTypeRuleSchema],
  tableConfigs: [TableConfigSchema],
  markProcessedField: { type: String },
  markProcessedValue: { type: Schema.Types.Mixed, default: 1 },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save hook para actualizar fecha
TransferMappingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("TransferMapping", TransferMappingSchema);
