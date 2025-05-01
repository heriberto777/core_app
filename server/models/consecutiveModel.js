const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema para reglas de formato
const FormatRuleSchema = new Schema({
  type: {
    type: String,
    enum: ["prefix", "suffix", "padding", "date", "custom"],
    required: true,
  },
  value: { type: String },
  format: { type: String }, // Para fechas: 'YYYY', 'YYYYMM', etc.
  order: { type: Number, default: 0 }, // Orden de aplicación
});

// Schema principal para consecutivos
const ConsecutiveSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  currentValue: { type: Number, default: 0 },
  incrementBy: { type: Number, default: 1 },
  padLength: { type: Number, default: 7 },
  padChar: { type: String, default: "0" },
  prefix: { type: String, default: "" },
  suffix: { type: String, default: "" },
  pattern: { type: String }, // Patrón general: {PREFIX}-{VALUE:6}-{YEAR}
  formatRules: [FormatRuleSchema],

  // Referencias a qué entidades pueden usar este consecutivo
  assignedTo: {
    type: [
      {
        entityType: {
          type: String,
          enum: ["user", "company", "mapping", "other"],
          required: true,
        },
        entityId: { type: Schema.Types.ObjectId, required: true },
        allowedOperations: {
          type: [String],
          enum: ["read", "increment", "reset", "all"],
          default: ["read", "increment"],
        },
      },
    ],
    default: [],
  },

  // Campo para segmentación (permite tener secuencias separadas por, por ejemplo, año o compañía)
  segments: {
    enabled: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ["year", "month", "company", "user", "custom"],
      default: "year",
    },
    field: { type: String }, // Campo para segmentación personalizada
    values: { type: Map, of: Number, default: new Map() }, // Mapa de valores actuales por segmento
  },

  // Historico y auditoría
  history: [
    {
      date: { type: Date, default: Date.now },
      action: {
        type: String,
        enum: ["created", "incremented", "reset", "updated"],
        required: true,
      },
      value: { type: Number },
      segment: { type: String },
      performedBy: {
        userId: { type: Schema.Types.ObjectId },
        userName: { type: String },
      },
    },
  ],

  createdBy: { type: Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
});

// Índices para mejor rendimiento
ConsecutiveSchema.index({ name: 1 }, { unique: true });
ConsecutiveSchema.index({
  "assignedTo.entityType": 1,
  "assignedTo.entityId": 1,
});

// Middleware para actualizar fecha de modificación
ConsecutiveSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Método para formatear el valor según las reglas definidas
ConsecutiveSchema.methods.formatValue = function (value, segmentValue = null) {
  // Obtener el valor adecuado según el segmento
  let useValue = value;

  // Aplicar patrón si existe
  if (this.pattern) {
    let formatted = this.pattern;

    // Reemplazar variables básicas
    formatted = formatted
      .replace("{PREFIX}", this.prefix)
      .replace("{SUFFIX}", this.suffix)
      .replace(/{VALUE:(\d+)}/g, (match, padLen) => {
        return String(useValue).padStart(parseInt(padLen, 10), this.padChar);
      })
      .replace(
        "{VALUE}",
        String(useValue).padStart(this.padLength, this.padChar)
      )
      .replace("{YEAR}", new Date().getFullYear())
      .replace("{MONTH}", String(new Date().getMonth() + 1).padStart(2, "0"))
      .replace("{DAY}", String(new Date().getDate()).padStart(2, "0"));

    return formatted;
  }

  // Si no hay patrón, formateo básico
  const paddedValue = String(useValue).padStart(this.padLength, this.padChar);
  return `${this.prefix}${paddedValue}${this.suffix}`;
};

// Método para obtener el siguiente valor
ConsecutiveSchema.methods.getNextValue = function (segmentValue = null) {
  if (this.segments && this.segments.enabled && segmentValue) {
    // Si usa segmentos y se proporcionó un valor de segmento
    let currentSegmentValue = this.segments.values.get(segmentValue) || 0;
    currentSegmentValue += this.incrementBy;
    this.segments.values.set(segmentValue, currentSegmentValue);

    // Registrar en historial
    this.history.push({
      date: new Date(),
      action: "incremented",
      value: currentSegmentValue,
      segment: segmentValue,
    });

    return this.formatValue(currentSegmentValue, segmentValue);
  } else {
    // Incremento normal sin segmentos
    this.currentValue += this.incrementBy;

    // Registrar en historial
    this.history.push({
      date: new Date(),
      action: "incremented",
      value: this.currentValue,
    });

    return this.formatValue(this.currentValue);
  }
};

module.exports = mongoose.model("Consecutive", ConsecutiveSchema);
