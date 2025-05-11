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
  name: { type: String, required: true, unique: true },
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

  // Bloqueo para evitar concurrencia
  locked: { type: Boolean, default: false },
  lockedAt: { type: Date },
  lockedBy: { type: String },

  // Historico y auditoría
  history: [
    {
      date: { type: Date, default: Date.now },
      action: {
        type: String,
        enum: [
          "created",
          "incremented",
          "reset",
          "updated",
          "reserved",
          "commited",
        ],
        required: true,
      },
      value: { type: Number },
      segment: { type: String },
      performedBy: {
        userId: { type: Schema.Types.ObjectId },
        userName: { type: String },
      },
      details: { type: Map, of: String },
    },
  ],

  // Reservas temporales para evitar duplicados
  reservations: [
    {
      value: { type: Number },
      reservedBy: { type: String },
      expiresAt: { type: Date },
      status: {
        type: String,
        enum: ["reserved", "committed", "expired"],
        default: "reserved",
      },
      createdAt: { type: Date, default: Date.now },
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
ConsecutiveSchema.index({ "reservations.expiresAt": 1 }); // Para limpiar reservas expiradas
ConsecutiveSchema.index({ "reservations.value": 1, "reservations.status": 1 });

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

// Método para obtener el siguiente valor con bloqueo atómico
ConsecutiveSchema.methods.getNextValue = async function (
  segmentValue = null,
  quantity = 1,
  reservedBy = "system"
) {
  // const session = await mongoose.startSession();
  // session.startTransaction();

  try {
    // Bloqueo pesimista para evitar concurrencia
    const consecutiveLocked = await mongoose
      .model("Consecutive")
      .findOneAndUpdate(
        {
          _id: this._id,
          $or: [
            { locked: false },
            { locked: true, lockedAt: { $lt: new Date(Date.now() - 5000) } }, // Auto-unlock después de 5s
          ],
        },
        {
          locked: true,
          lockedAt: new Date(),
          lockedBy: reservedBy,
        },
        { new: true }
      );

    if (!consecutiveLocked) {
      throw new Error("No se pudo obtener bloqueo del consecutivo");
    }

    let values = [];
    let currentValue;

    if (this.segments && this.segments.enabled && segmentValue) {
      // Si usa segmentos y se proporcionó un valor de segmento
      currentValue = this.segments.values.get(segmentValue) || 0;

      for (let i = 0; i < quantity; i++) {
        currentValue += this.incrementBy;
        this.segments.values.set(segmentValue, currentValue);

        const formattedValue = this.formatValue(currentValue, segmentValue);
        values.push({
          numeric: currentValue,
          formatted: formattedValue,
          segment: segmentValue,
        });

        // Crear reserva temporal
        const reservation = {
          value: currentValue,
          reservedBy: reservedBy,
          expiresAt: new Date(Date.now() + 60000), // Expira en 1 minuto
          status: "reserved",
        };

        this.reservations.push(reservation);
      }

      // Registrar en historial
      this.history.push({
        date: new Date(),
        action: "reserved",
        value: currentValue,
        segment: segmentValue,
        details: new Map([
          ["quantity", String(quantity)],
          ["reservedBy", reservedBy],
        ]),
      });
    } else {
      // Incremento normal sin segmentos
      currentValue = this.currentValue;

      for (let i = 0; i < quantity; i++) {
        currentValue += this.incrementBy;

        const formattedValue = this.formatValue(currentValue);
        values.push({
          numeric: currentValue,
          formatted: formattedValue,
          segment: null,
        });

        // Crear reserva temporal
        const reservation = {
          value: currentValue,
          reservedBy: reservedBy,
          expiresAt: new Date(Date.now() + 60000), // Expira en 1 minuto
          status: "reserved",
        };

        this.reservations.push(reservation);
      }

      this.currentValue = currentValue;

      // Registrar en historial
      this.history.push({
        date: new Date(),
        action: "reserved",
        value: currentValue,
        details: new Map([
          ["quantity", String(quantity)],
          ["reservedBy", reservedBy],
        ]),
      });
    }

    // Guardar los cambios
    await this.save();

    // Liberar bloqueo
    await mongoose.model("Consecutive").findByIdAndUpdate(this._id, {
      locked: false,
      lockedBy: null,
      lockedAt: null,
    });

    // await session.commitTransaction();
    return values;
  } catch (error) {
    // await session.abortTransaction();

    // Intentar liberar bloqueo en caso de error
    await mongoose.model("Consecutive").findByIdAndUpdate(this._id, {
      locked: false,
      lockedBy: null,
      lockedAt: null,
    });

    throw error;
  }
};

// Método para confirmar reservas
ConsecutiveSchema.methods.commitReservations = async function (
  values,
  reservedBy = "system"
) {
  // const session = await mongoose.startSession();
  // session.startTransaction();

  try {
    for (const value of values) {
      const reservation = this.reservations.find(
        (r) =>
          r.value === value.numeric &&
          r.reservedBy === reservedBy &&
          r.status === "reserved"
      );

      if (reservation) {
        reservation.status = "committed";
      } else {
        throw new Error(`Reserva no encontrada para valor ${value.numeric}`);
      }
    }

    // Limpiar reservas confirmadas antiguas (mantener solo últimas 100)
    const committedReservations = this.reservations
      .filter((r) => r.status === "committed")
      .sort((a, b) => b.createdAt - a.createdAt);

    if (committedReservations.length > 100) {
      const toRemove = committedReservations.slice(100);
      this.reservations = this.reservations.filter(
        (r) => !toRemove.some((tr) => tr._id.toString() === r._id.toString())
      );
    }

    // Registrar en historial
    this.history.push({
      date: new Date(),
      action: "committed",
      value: values[values.length - 1].numeric,
      details: new Map([
        ["committedCount", String(values.length)],
        ["reservedBy", reservedBy],
      ]),
    });

    await this.save();
    // await session.commitTransaction();
  } catch (error) {
    // await session.abortTransaction();
    throw error;
  }
};

// Limpiar reservas expiradas
ConsecutiveSchema.methods.cleanExpiredReservations = async function () {
  const now = new Date();
  this.reservations = this.reservations.filter(
    (r) => r.status === "committed" || r.expiresAt > now
  );
  await this.save();
};

module.exports = mongoose.model("Consecutive", ConsecutiveSchema);
