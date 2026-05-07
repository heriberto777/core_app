// models/transferTask.js
const mongoose = require("mongoose");

const transferTaskSchema = new mongoose.Schema(
  {
    // Nombre único de la tarea
    name: { type: String, required: true, unique: true },

    // Tipo de tarea: manual, auto, both
    type: {
      type: String,
      enum: ["manual", "auto", "both"],
      default: "both",
    },

    // ¿Está activa la tarea?
    active: { type: Boolean, default: true },

    // ID del mapeo asociado (si aplica)
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransferMapping",
      default: null,
      index: true,
    },

    // Consulta SQL base (SELECT, MERGE, etc.)
    query: { type: String, required: true },

    // Parámetros para construir el WHERE (field, operator, value)
    parameters: [
      {
        field: { type: String, required: true },
        operator: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
      },
    ],

    // Reglas de validación (campos obligatorios, existenciaCheck)
    validationRules: {
      requiredFields: [String],
      existenceCheck: {
        table: String,
        key: String,
      },
    },

    // Estado actual de la tarea
    status: {
      type: String,
      enum: ["pending", "running", "completed", "error", "cancelled"],
      default: "pending",
    },

    // Porcentaje de progreso (0..100)
    progress: { type: Number, default: 0 },

    // Seguimiento de Workflows
    currentStep: { type: String, default: "" }, // Nombre del mapping actual
    totalSteps: { type: Number, default: 1 },    // Total de mappings en la cadena

    // transferType (indica dirección: up/down)
    transferType: {
      type: String,
      enum: ["up", "down", "internal", ""],
      default: "",
    },

    // executionMode (normal o batchesSSE)
    executionMode: {
      type: String,
      enum: ["normal", "batchesSSE"],
      default: "normal",
    },

    // Borrar registros antes de insertar
    clearBeforeInsert: {
      type: Boolean,
      default: false,
      description:
        "Si se deben borrar registros de la tabla destino antes de insertar",
    },

    // Configuración de tabla destino para transferencias internas
    targetTable: {
      type: String,
      default: null,
      description: "Tabla destino para transferencias internas en Server1",
    },

    // Ejemplo de flag para ejecutar un procedimiento almacenado antes
    executeProcedureBefore: { type: Boolean, default: false },

    // Configuración del procedimiento almacenado (opcional)
    procedureConfig: {
      name: { type: String },
      parameters: [
        {
          field: { type: String, required: true },
          value: { type: mongoose.Schema.Types.Mixed, required: true },
        },
      ],
    },

    // Consulta post-transferencia
    postUpdateQuery: { type: String, default: null },

    // Mapeo para post-update
    postUpdateMapping: {
      viewKey: { type: String, default: null }, // Clave en la vista
      tableKey: { type: String, default: null }, // Clave en la tabla real
    },

    // Seguimiento de ejecuciones
    lastExecutionDate: {
      type: Date,
      default: null,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecutionResult: {
      success: Boolean,
      message: String,
      affectedRecords: Number,
      errorDetails: String,
    },
    lastProcessingResult: { type: mongoose.Schema.Types.Mixed, default: null },

    // Mapeo de campos para transferencias "down"
    fieldMapping: {
      sourceTable: { type: String }, // Tabla origen en server2
      targetTable: { type: String }, // Tabla destino en server1
      sourceFields: [String], // Campos en la tabla origen (server2)
      targetFields: [String], // Campos correspondientes en la tabla destino (server1)
      defaultValues: [
        {
          // Valores por defecto para campos
          field: String,
          value: mongoose.Schema.Types.Mixed,
        },
      ],
      // Transformaciones existentes
      transformations: [
        {
          sourceField: String,
          targetField: String,
          transformationType: {
            type: String,
            enum: ["split", "join", "default", "custom"],
            default: "custom",
          },
          transformationParams: mongoose.Schema.Types.Mixed,
        },
      ],
    },

    // Tareas encadenadas (para transferencias DOWN)
    nextTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TransferTask",
      },
    ],

    // 🔗 NUEVOS CAMPOS PARA TAREAS VINCULADAS

    // Tareas vinculadas directamente (array de IDs)
    linkedTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TransferTask",
        description: "IDs de tareas vinculadas que se ejecutan juntas",
      },
    ],

    // Grupo de vinculación (nombre del grupo)
    linkedGroup: {
      type: String,
      default: null,
      index: true,
      description:
        "Nombre del grupo de tareas vinculadas (ej: 'IMPLT_Accounts_Group')",
    },

    // Si debe ejecutar tareas vinculadas automáticamente
    executeLinkedTasks: {
      type: Boolean,
      default: false,
      description:
        "Si debe ejecutar tareas vinculadas automáticamente (DEPRECATED - ahora siempre se ejecutan si están vinculadas)",
    },

    // Orden de ejecución dentro del grupo vinculado
    linkedExecutionOrder: {
      type: Number,
      default: 0,
      description:
        "Orden de ejecución dentro del grupo vinculado (0 = primera)",
    },

    // Si debe esperar a que terminen las tareas vinculadas antes del post-update
    delayPostUpdate: {
      type: Boolean,
      default: false,
      description:
        "Si debe esperar a que terminen las tareas vinculadas antes del post-update (DEPRECATED - ahora siempre coordinado)",
    },

    // Configuración de coordinación para tareas vinculadas
    coordinationConfig: {
      // Si debe esperar a tareas vinculadas
      waitForLinkedTasks: {
        type: Boolean,
        default: false,
        description: "Si debe esperar a que terminen las tareas vinculadas",
      },

      // Tiempo máximo de espera para coordinación
      maxWaitTime: {
        type: Number,
        default: 300000, // 5 minutos
        description: "Tiempo máximo de espera en milisegundos",
      },

      // Estrategia de post-update
      postUpdateStrategy: {
        type: String,
        enum: ["individual", "coordinated", "delayed"],
        default: "individual",
        description: "Estrategia para ejecutar post-updates",
      },
    },

    // Metadatos adicionales para vinculación
    linkingMetadata: {
      // Si esta tarea es coordinadora del post-update del grupo
      isCoordinator: {
        type: Boolean,
        default: false,
        description: "Si esta tarea coordina el post-update del grupo",
      },

      // Última vez que se ejecutó como parte de un grupo
      lastGroupExecution: {
        type: Date,
        default: null,
        description: "Última vez que se ejecutó como parte de un grupo",
      },

      // ID de la ejecución de grupo más reciente
      lastGroupExecutionId: {
        type: String,
        default: null,
        description: "ID de la última ejecución de grupo",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Índices para mejorar el rendimiento
transferTaskSchema.index({ linkedGroup: 1, active: 1 });
transferTaskSchema.index({ linkedTasks: 1 });
transferTaskSchema.index({ status: 1, type: 1 });
// transferTaskSchema.index({ name: 1, active: 1 });

// Métodos de instancia
transferTaskSchema.methods.hasLinkedTasks = function () {
  return (
    (this.linkedGroup && this.linkedGroup.trim() !== "") ||
    (this.linkedTasks && this.linkedTasks.length > 0)
  );
};

transferTaskSchema.methods.isPartOfGroup = function () {
  return this.linkedGroup && this.linkedGroup.trim() !== "";
};

transferTaskSchema.methods.hasDirectLinkedTasks = function () {
  return this.linkedTasks && this.linkedTasks.length > 0;
};

// Métodos estáticos
transferTaskSchema.statics.findByLinkedGroup = function (groupName) {
  return this.find({ linkedGroup: groupName, active: true });
};

transferTaskSchema.statics.findLinkedTasks = function (taskId) {
  return this.find({ linkedTasks: taskId, active: true });
};

// Middleware pre-save para validaciones
transferTaskSchema.pre("save", function (next) {
  // Si tiene linkedGroup, automáticamente debería ejecutar tareas vinculadas
  if (this.linkedGroup && this.linkedGroup.trim() !== "") {
    this.executeLinkedTasks = true;
  }

  // Si es coordinadora, debe tener post-update query
  if (
    this.linkingMetadata &&
    this.linkingMetadata.isCoordinator &&
    !this.postUpdateQuery
  ) {
    return next(
      new Error("Una tarea coordinadora debe tener postUpdateQuery definido")
    );
  }

  next();
});

const TransferTask = mongoose.model("TransferTask", transferTaskSchema);
module.exports = TransferTask;
