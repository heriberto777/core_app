const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema para el mapeo de valores
const ValueMapSchema = new Schema({
  sourceValue: { type: Schema.Types.Mixed, required: true },
  targetValue: { type: Schema.Types.Mixed, required: true },
});

// Schema para el mapeo de campos
const FieldMappingSchema = new Schema({
  sourceField: { type: String },
  targetField: { type: String, required: true },
  defaultValue: { type: Schema.Types.Mixed },
  isRequired: { type: Boolean, default: false },
  removePrefix: { type: String }, // Prefijo a eliminar (ej: "CN")
  valueMappings: [ValueMapSchema],
  // Campos para lookup en BD destino
  lookupFromTarget: { type: Boolean, default: false }, // Indica si el campo debe consultarse en la BD destino
  lookupQuery: { type: String }, // Consulta SQL para obtener el valor desde la BD destino
  lookupParams: [
    {
      // Parámetros para la consulta de lookup
      sourceField: { type: String }, // Campo de origen para usar como parámetro
      paramName: { type: String }, // Nombre del parámetro en la consulta SQL
    },
  ],
  validateExistence: { type: Boolean, default: false }, // Si debe validarse que existe el registro
  failIfNotFound: { type: Boolean, default: false }, // Si debe fallar el proceso si no se encuentra
  // Nuevos campos para controlar la visualización y edición
  isEditable: { type: Boolean, default: true }, // Si el campo se puede editar en formularios
  showInList: { type: Boolean, default: false }, // Si el campo aparece en vistas de lista
  displayOrder: { type: Number, default: 0 }, // Orden de visualización (menor número = primero)
  displayName: { type: String }, // Nombre amigable para mostrar en la interfaz
  fieldGroup: { type: String }, // Grupo al que pertenece en formularios
  fieldType: {
    type: String,
    enum: [
      "text",
      "number",
      "date",
      "boolean",
      "select",
      "textarea",
      "email",
      "tel",
      "hidden",
    ],
    default: "text",
  }, // Tipo de campo para formularios
  options: [
    {
      // Opciones para tipo 'select'
      label: { type: String },
      value: { type: String },
    },
  ],
});

// Schema para la configuración de tabla
const TableConfigSchema = new Schema({
  name: { type: String, required: true },
  sourceTable: { type: String, required: true },
  targetTable: { type: String, required: true },
  primaryKey: { type: String }, // Clave primaria en tabla origen
  targetPrimaryKey: { type: String }, // Clave primaria en tabla destino
  isDetailTable: { type: Boolean, default: false },
  parentTableRef: { type: String }, // Para tablas de detalle, referencia a la tabla padre
  useSameSourceTable: { type: Boolean, default: false }, // Indica si usa la misma tabla del header
  fieldMappings: [FieldMappingSchema],
  filterCondition: { type: String }, // Condición SQL para filtrar registros (WHERE clause)
  customQuery: { type: String }, // Consulta personalizada para casos especiales
  orderByColumn: { type: String }, // Columna para ordenamiento de detalles
});

// Schema para la regla de tipo de documento
const DocumentTypeRuleSchema = new Schema({
  name: { type: String, required: true },
  sourceField: { type: String },
  sourceValues: [String], // Valores que debe tener el campo para aplicar esta regla
  description: { type: String },
});

const ConsecutiveConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  fieldName: { type: String }, // Campo en la tabla principal donde se guardará el consecutivo
  detailFieldName: { type: String }, // Campo en las tablas de detalle
  lastValue: { type: Number, default: 0 }, // Último valor usado
  prefix: { type: String, default: "" }, // Prefijo opcional (ej: "INV-")
  pattern: { type: String }, // Patrón de formato (ej: "{PREFIX}{YEAR}{VALUE:6}")
  updateAfterTransfer: { type: Boolean, default: true }, // Si se actualiza después de la transferencia
  startValue: { type: Number, default: 1 }, // Valor inicial si no hay último valor
  applyToTables: [
    {
      tableName: { type: String, required: true }, // Nombre de la tabla
      fieldName: { type: String, required: true }, // Nombre del campo en esa tabla
    },
  ],
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
  entityType: {
    type: String,
    enum: ["orders", "customers", "invoices", "other"],
    default: "orders",
  },
  consecutiveConfig: ConsecutiveConfigSchema,
});

// Pre-save hook para actualizar fecha
TransferMappingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("TransferMapping", TransferMappingSchema);
