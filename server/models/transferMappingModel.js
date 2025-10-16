const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema para el mapeo de valores
const ValueMapSchema = new Schema({
  sourceValue: { type: Schema.Types.Mixed, required: true },
  targetValue: { type: Schema.Types.Mixed, required: true },
});

// Schema para dependencias de foreign key
const ForeignKeyDependencySchema = new Schema({
  fieldName: { type: String, required: true }, // Campo que causa la dependencia
  dependentTable: { type: String, required: true }, // Tabla donde debe existir/insertarse
  dependentFields: [
    {
      // Campos a insertar en la tabla dependiente
      sourceField: { type: String }, // Campo origen
      targetField: { type: String, required: true }, // Campo destino en tabla dependiente
      defaultValue: { type: Schema.Types.Mixed },
      isKey: { type: Boolean, default: false }, // Si es la clave que se referencia
    },
  ],
  insertIfNotExists: { type: Boolean, default: true }, // Si crear el registro si no existe
  validateOnly: { type: Boolean, default: false }, // Solo validar que existe
  executionOrder: { type: Number, default: 0 }, // Orden de ejecución (menor primero)
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
      sourceField: { type: String }, // Campo de origen para el parámetro
      paramName: { type: String }, // Nombre del parámetro en la consulta
      removePrefix: { type: String }, // Prefijo a eliminar del valor
    },
  ],
  validateExistence: { type: Boolean, default: false }, // Si debe validarse que existe el registro
  failIfNotFound: { type: Boolean, default: false }, // Si debe fallar el proceso si no se encuentra
  // Campos para conversión de unidades
  unitConversion: {
    enabled: { type: Boolean, default: false },
    unitMeasureField: { type: String }, // Campo que indica la unidad (ej: "Unit_Measure")
    conversionFactorField: { type: String }, // Campo con el factor de conversión (ej: "Factor_Conversion")
    fromUnit: { type: String }, // Unidad origen (ej: "Caja")
    toUnit: { type: String }, // Unidad destino (ej: "Und")
    operation: {
      type: String,
      enum: ["multiply", "divide"],
      default: "multiply",
    }, // Operación a realizar
  },
  // Campos para controlar la visualización y edición
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
  executionOrder: { type: Number, default: 0 }, // Orden de procesamiento
  dependsOn: [String], // Nombres de tablas que deben procesarse primero
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

// NUEVO: Schema para configuración de marcado procesado
const MarkProcessedConfigSchema = new Schema({
  batchSize: { type: Number, default: 100 }, // Para lotes grandes
  includeTimestamp: { type: Boolean, default: true }, // Si agregar fecha de procesamiento
  timestampField: { type: String, default: "LAST_PROCESSED_DATE" }, // Campo de fecha
  allowRollback: { type: Boolean, default: false }, // Si permitir rollback en errores
});

const PromotionConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  detectFields: {
    bonusField: { type: String, default: "ART_BON" }, // Campo que indica bonificación
    referenceField: { type: String, default: "COD_ART_RFR" }, // Campo de referencia
    discountField: { type: String, default: "MON_DSC" }, // Campo de descuento
    lineNumberField: { type: String, default: "NUM_LN" }, // Campo número de línea
    articleField: { type: String, default: "COD_ART" }, // Campo código artículo
    quantityField: { type: String, default: "CNT_MAX" }, // Campo cantidad
  },
  targetFields: {
    bonusLineRef: { type: String, default: "PEDIDO_LINEA_BONIF" }, // Campo referencia bonificación
    orderedQuantity: { type: String, default: "CANTIDAD_PEDIDA" }, // Campo cantidad pedida
    invoiceQuantity: { type: String, default: "CANTIDAD_A_FACTURAR" }, // Campo cantidad a facturar
    bonusQuantity: { type: String, default: "CANTIDAD_BONIF" }, // Campo cantidad bonificación
  },
  rules: [
    {
      name: { type: String, required: true },
      type: {
        type: String,
        enum: [
          "FAMILY_DISCOUNT",
          "QUANTITY_BONUS",
          "SCALED_BONUS",
          "PRODUCT_BONUS",
          "INVOICE_DISCOUNT",
          "ONE_TIME_OFFER",
        ],
        required: true,
      },
      enabled: { type: Boolean, default: true },
      conditions: {
        familyCode: { type: String }, // Para descuentos por familia
        minAmount: { type: Number }, // Monto mínimo
        minQuantity: { type: Number }, // Cantidad mínima
        productCode: { type: String }, // Código de producto específico
        customerType: { type: String }, // Tipo de cliente
        priceList: { type: String }, // Lista de precios
        zone: { type: String }, // Zona
      },
      actions: {
        discountPercent: { type: Number }, // Porcentaje de descuento
        bonusQuantity: { type: Number }, // Cantidad de bonificación
        bonusProduct: { type: String }, // Producto de bonificación
        scaleRules: [
          {
            // Para bonificaciones escaladas
            fromQuantity: { type: Number },
            toQuantity: { type: Number },
            bonusQuantity: { type: Number },
            bonusProduct: { type: String },
          },
        ],
      },
      priority: { type: Number, default: 0 }, // Prioridad de aplicación
      isOneTime: { type: Boolean, default: false }, // Si es oferta única
      description: { type: String },
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
  // NUEVO: Configuración de estrategia de marcado
  markProcessedStrategy: {
    type: String,
    enum: ["individual", "batch", "none"],
    default: "individual",
  },
  markProcessedConfig: MarkProcessedConfigSchema,
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  entityType: {
    type: String,
    enum: ["orders", "customers", "invoices", "other"],
    default: "orders",
  },
  consecutiveConfig: ConsecutiveConfigSchema,
  foreignKeyDependencies: [ForeignKeyDependencySchema],
  promotionConfig: PromotionConfigSchema,
});

// Pre-save hook para actualizar fecha
TransferMappingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("TransferMapping", TransferMappingSchema);
