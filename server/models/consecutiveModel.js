const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema para reglas de formato avanzadas
const FormatRuleSchema = new Schema({
  type: {
    type: String,
    enum: [
      "prefix",
      "suffix",
      "padding",
      "date",
      "custom",
      "separator",
      "literal",
    ],
    required: true,
  },
  value: { type: String },
  format: { type: String }, // Para fechas: 'YYYY', 'YYYYMM', etc.
  position: { type: Number, required: true }, // Orden de aplicación
  dynamic: { type: Boolean, default: false }, // Si el valor se calcula dinámicamente
  config: { type: Schema.Types.Mixed }, // Configuración adicional
});

// Schema para reservas de bloques
const BlockReservationSchema = new Schema({
  blockId: { type: String, required: true, unique: true },
  startValue: { type: Number, required: true },
  endValue: { type: Number, required: true },
  usedValues: { type: [Number], default: [] },
  status: {
    type: String,
    enum: ["reserved", "active", "completed", "cancelled"],
    default: "reserved",
  },
  reservedAt: { type: Date, default: Date.now },
  activatedAt: { type: Date },
  completedAt: { type: Date },
  entityId: { type: Schema.Types.ObjectId }, // Entidad que reservó el bloque
  segment: { type: String }, // Segmento asociado
});

// Schema principal para consecutivos
const ConsecutiveSchema = new Schema(
  {
    // Identificación
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    description: { type: String },

    // Configuración básica
    currentValue: { type: Number, default: 0 },
    incrementBy: { type: Number, default: 1, min: 1 },
    initialValue: { type: Number, default: 1 },
    minValue: { type: Number, default: 1 },
    maxValue: { type: Number, default: 999999999 },

    // Formateo
    padLength: { type: Number, default: 7, min: 1 },
    padChar: { type: String, default: "0", maxlength: 1 },
    pattern: { type: String }, // Ejemplo: "{PREFIX}-{YEAR}-{VALUE:6}-{SUFFIX}"
    formatRules: [FormatRuleSchema],

    // Segmentación avanzada
    segments: {
      enabled: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["year", "month", "day", "company", "branch", "custom"],
        default: "year",
      },
      field: { type: String }, // Campo para segmentación personalizada
      values: {
        type: Map,
        of: new Schema({
          currentValue: { type: Number, default: 0 },
          lastUsed: { type: Date },
        }),
        default: new Map(),
      },
    },

    // Asignación a entidades
    assignedTo: [
      {
        entityType: {
          type: String,
          enum: ["user", "company", "mapping", "department", "process"],
          required: true,
        },
        entityId: { type: Schema.Types.ObjectId, required: true },
        permissions: {
          reserve: { type: Boolean, default: true },
          use: { type: Boolean, default: true },
          admin: { type: Boolean, default: false },
        },
        limits: {
          daily: { type: Number },
          monthly: { type: Number },
        },
      },
    ],

    // Reservas de bloques
    blockReservations: [BlockReservationSchema],

    // Control de concurrencia
    lock: {
      active: { type: Boolean, default: false },
      processId: { type: String },
      lockedAt: { type: Date },
      expiresAt: { type: Date },
    },

    // Histórico y auditoría
    history: [
      {
        timestamp: { type: Date, default: Date.now },
        action: {
          type: String,
          enum: [
            "create",
            "increment",
            "reset",
            "update",
            "reserve",
            "use",
            "release",
            "expire",
          ],
          required: true,
        },
        value: { type: Number },
        endValue: { type: Number }, // Para rangos
        segment: { type: String },
        user: {
          id: { type: Schema.Types.ObjectId },
          name: { type: String },
        },
        metadata: { type: Schema.Types.Mixed },
      },
    ],

    // Configuración de seguridad
    requiresAuth: { type: Boolean, default: false },
    allowedRoles: [{ type: String }],

    // Estado
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices para optimización

ConsecutiveSchema.index({
  "assignedTo.entityType": 1,
  "assignedTo.entityId": 1,
});
ConsecutiveSchema.index({ "blockReservations.entityId": 1 });
ConsecutiveSchema.index({ "blockReservations.status": 1 });
ConsecutiveSchema.index({ "segments.values": 1 });

// Middlewares
ConsecutiveSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

ConsecutiveSchema.pre("updateOne", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Métodos del modelo

/**
 * Reserva un bloque de consecutivos
 */
ConsecutiveSchema.methods.reserveBlock = async function (
  quantity,
  options = {}
) {
  if (this.lock.active && this.lock.expiresAt > new Date()) {
    throw new Error("Consecutivo bloqueado por otro proceso");
  }

  // Aplicar bloqueo
  this.lock = {
    active: true,
    processId: options.processId || "system",
    lockedAt: new Date(),
    expiresAt: new Date(Date.now() + 30000), // 30 segundos de bloqueo
  };

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Obtener el siguiente bloque disponible
    const { startValue, endValue } = this.calculateNextBlock(
      quantity,
      options.segment
    );

    // Crear reserva
    const reservation = {
      blockId: mongoose.Types.ObjectId().toString(),
      startValue,
      endValue,
      status: "reserved",
      reservedAt: new Date(),
      entityId: options.entityId,
      segment: options.segment,
    };

    this.blockReservations.push(reservation);
    this.history.push({
      action: "reserve",
      value: startValue,
      endValue: endValue,
      segment: options.segment,
      user: options.user,
      metadata: { quantity },
    });

    await this.save({ session });
    await session.commitTransaction();

    return {
      success: true,
      blockId: reservation.blockId,
      startValue,
      endValue,
      formattedStart: this.formatValue(startValue, options.segment),
      formattedEnd: this.formatValue(endValue, options.segment),
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
    this.lock.active = false;
    await this.save();
  }
};

/**
 * Usa un valor de un bloque reservado
 */
ConsecutiveSchema.methods.useFromBlock = async function (
  blockId,
  options = {}
) {
  const reservation = this.blockReservations.id(blockId);
  if (!reservation) throw new Error("Reserva no encontrada");

  if (reservation.status !== "reserved" && reservation.status !== "active") {
    throw new Error("Bloque no está disponible para uso");
  }

  const nextValue = reservation.startValue + reservation.usedValues.length;
  if (nextValue > reservation.endValue) {
    throw new Error("No quedan valores disponibles en este bloque");
  }

  reservation.usedValues.push(nextValue);
  if (reservation.status === "reserved") {
    reservation.status = "active";
    reservation.activatedAt = new Date();
  }

  // Si se usaron todos los valores, marcar como completado
  if (nextValue === reservation.endValue) {
    reservation.status = "completed";
    reservation.completedAt = new Date();
  }

  this.history.push({
    action: "use",
    value: nextValue,
    segment: reservation.segment,
    user: options.user,
    metadata: { blockId },
  });

  await this.save();
  return this.formatValue(nextValue, reservation.segment);
};

/**
 * Formatea un valor según las reglas
 */
ConsecutiveSchema.methods.formatValue = function (value, segmentValue = null) {
  // Validar el valor
  if (value < this.minValue || value > this.maxValue) {
    throw new Error(
      `Valor ${value} fuera de rango (${this.minValue}-${this.maxValue})`
    );
  }

  // Si hay patrón definido, usarlo
  if (this.pattern) {
    let formatted = this.pattern;

    // Reemplazar variables básicas
    formatted = formatted
      .replace(/{PREFIX}/g, this.prefix || "")
      .replace(/{SUFFIX}/g, this.suffix || "")
      .replace(/{VALUE:(\d+)}/g, (match, padLen) => {
        return String(value).padStart(parseInt(padLen, 10), this.padChar);
      })
      .replace(/{VALUE}/g, String(value).padStart(this.padLength, this.padChar))
      .replace(/{YEAR}/g, new Date().getFullYear())
      .replace(/{MONTH}/g, String(new Date().getMonth() + 1).padStart(2, "0"))
      .replace(/{DAY}/g, String(new Date().getDate()).padStart(2, "0"))
      .replace(/{SEGMENT}/g, segmentValue || "");

    return formatted;
  }

  // Aplicar reglas de formato en orden
  if (this.formatRules && this.formatRules.length > 0) {
    const sortedRules = [...this.formatRules].sort(
      (a, b) => a.position - b.position
    );
    let parts = [];

    sortedRules.forEach((rule) => {
      switch (rule.type) {
        case "prefix":
          parts.unshift(rule.value);
          break;
        case "suffix":
          parts.push(rule.value);
          break;
        case "padding":
          parts.push(
            String(value).padStart(rule.value || this.padLength, this.padChar)
          );
          break;
        case "date":
          parts.push(this.formatDate(rule.format));
          break;
        case "separator":
          parts.push(rule.value || "-");
          break;
        case "literal":
          parts.push(rule.value);
          break;
      }
    });

    return parts.join("");
  }

  // Formato por defecto
  const paddedValue = String(value).padStart(this.padLength, this.padChar);
  return `${this.prefix || ""}${paddedValue}${this.suffix || ""}`;
};

// Métodos auxiliares
ConsecutiveSchema.methods.calculateNextBlock = function (
  quantity,
  segmentValue = null
) {
  if (quantity <= 0) throw new Error("Cantidad debe ser positiva");

  let startValue, endValue;

  if (this.segments.enabled && segmentValue) {
    const segmentData = this.segments.values.get(segmentValue) || {
      currentValue: 0,
    };
    startValue = segmentData.currentValue + 1;
    endValue = startValue + quantity - 1;

    // Actualizar valor del segmento
    this.segments.values.set(segmentValue, {
      currentValue: endValue,
      lastUsed: new Date(),
    });
  } else {
    startValue = this.currentValue + 1;
    endValue = startValue + quantity - 1;
    this.currentValue = endValue;
  }

  // Validar límites
  if (endValue > this.maxValue) {
    throw new Error(
      `Bloque excede el valor máximo permitido (${this.maxValue})`
    );
  }

  return { startValue, endValue };
};

ConsecutiveSchema.methods.formatDate = function (format) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  switch (format) {
    case "YYYY":
      return year;
    case "YY":
      return String(year).slice(-2);
    case "YYYYMM":
      return `${year}${month}`;
    case "YYYYMMDD":
      return `${year}${month}${day}`;
    default:
      return format;
  }
};

// Static methods
ConsecutiveSchema.statics.findByEntity = function (entityType, entityId) {
  return this.find({
    "assignedTo.entityType": entityType,
    "assignedTo.entityId": entityId,
    active: true,
  });
};

ConsecutiveSchema.statics.reserveBlockForEntity = async function (
  entityType,
  entityId,
  quantity,
  options = {}
) {
  const consecutive = await this.findOne({
    "assignedTo.entityType": entityType,
    "assignedTo.entityId": entityId,
    active: true,
  });

  if (!consecutive) {
    throw new Error(
      `No hay consecutivo configurado para ${entityType}/${entityId}`
    );
  }

  return consecutive.reserveBlock(quantity, {
    ...options,
    entityId,
  });
};

// Virtuals
ConsecutiveSchema.virtual("prefix").get(function () {
  const prefixRule = this.formatRules?.find((r) => r.type === "prefix");
  return prefixRule ? prefixRule.value : "";
});

ConsecutiveSchema.virtual("suffix").get(function () {
  const suffixRule = this.formatRules?.find((r) => r.type === "suffix");
  return suffixRule ? suffixRule.value : "";
});

module.exports = mongoose.model("Consecutive", ConsecutiveSchema);
