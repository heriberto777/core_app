const TransferTask = require("../models/transferTaks");
const TransferSummary = require("../models/transferSummaryModel");
const Consecutivo = require("../models/consecutivoModej");
const {
  executeTransferManual,
  insertInBatchesSSE,
  upsertTransferTask: upsertTransferTaskService,
} = require("../services/transferService");
const Config = require("../models/configModel");
const { startCronJob } = require("../services/cronService");
const { executeDynamicSelect } = require("../services/dynamicQueryService");
const { formatDateToYYYYMMDD } = require("../utils/formatDate");
const obtenerConsecutivo = require("../utils/obtenerConsecutivo");
const { realizarTraspaso } = require("../services/traspasoService");
const { withConnection } = require("../utils/dbUtils");
const logger = require("../services/logger");
const ConnectionManager = require("../services/ConnectionCentralService");
const TaskTracker = require("../services/TaskTracker");
const transferService = require("../services/transferService");
const { SqlService } = require("../services/SqlService");
const ConnectionDiagnostic = require("../services/connectionDiagnostic");
const DBConfig = require("../models/dbConfigModel");
const { default: mongoose } = require("mongoose");
const DynamicTransferService = require("../services/DynamicTransferService");
const LinkedTasksService = require("../services/LinkedTasksService");
const {
  sendTransferResultsEmail,
  sendCriticalErrorEmail,
} = require("../services/emailService");

/**
 * Obtener todas las tareas de transferencia
 */
const getTransferTasks = async (req, res) => {
  try {
    const tasks = await TransferTask.find().sort({ name: 1 });
    res.json(tasks);
  } catch (error) {
    logger.error("Error al obtener tareas de transferencia:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener tareas",
      error: error.message,
    });
  }
};

/**
 * Obtener una tarea específica por nombre
 */
const getTransferTask = async (req, res) => {
  const { name } = req.params;
  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const task = await TransferTask.findOne({ name });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    res.json({ success: true, task });
  } catch (error) {
    logger.error(`Error al obtener tarea ${name}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al obtener tarea",
      error: error.message,
    });
  }
};

/**
 * Crear o actualizar una tarea de transferencia en MongoDB
 */
const upsertTransferTaskController = async (req, res) => {
  console.log(
    "🚀 ~ file: transferTaskController.js ~ line 108 ~ upsertTransferTaskController ~ req.body",
    req.body
  );
  try {
    // ✅ VALIDACIÓN Y SANITIZACIÓN TEMPRANA DE TIPOS
    const sanitizedBody = { ...req.body };

    // ✅ CORRECCIÓN PRINCIPAL: Sanitizar executeLinkedTasks antes de usar
    if (sanitizedBody.executeLinkedTasks !== undefined) {
      // Convertir string a boolean si es necesario
      if (typeof sanitizedBody.executeLinkedTasks === "string") {
        console.warn(
          `⚠️ Convirtiendo executeLinkedTasks de string a boolean: "${sanitizedBody.executeLinkedTasks}"`
        );
        sanitizedBody.executeLinkedTasks =
          sanitizedBody.executeLinkedTasks === "true" ||
          (sanitizedBody.executeLinkedTasks !== "" &&
            sanitizedBody.executeLinkedTasks !== "false" &&
            sanitizedBody.executeLinkedTasks !== "0");
      }
    }

    // ✅ Sanitizar linkedGroup
    if (
      sanitizedBody.linkedGroup !== undefined &&
      typeof sanitizedBody.linkedGroup !== "string"
    ) {
      if (
        sanitizedBody.linkedGroup === null ||
        sanitizedBody.linkedGroup === undefined
      ) {
        sanitizedBody.linkedGroup = null;
      } else {
        sanitizedBody.linkedGroup = String(sanitizedBody.linkedGroup);
      }
    }

    // ✅ Sanitizar linkedExecutionOrder
    if (sanitizedBody.linkedExecutionOrder !== undefined) {
      sanitizedBody.linkedExecutionOrder =
        parseInt(sanitizedBody.linkedExecutionOrder) || 0;
    }

    // Extraer todos los campos necesarios del req.body sanitizado
    const {
      name,
      type,
      active,
      query,
      parameters,
      transferType,
      validationRules,
      executionMode,
      postUpdateQuery,
      postUpdateMapping,
      clearBeforeInsert,
      fieldMapping,
      nextTasks,
      targetTable, // Para transferencias internas
      // 🔗 CAMPOS DE VINCULACIÓN - Con validación mejorada
      linkedTasks = [], // ← Valor por defecto
      linkedGroup,
      executeLinkedTasks = false, // ← Valor por defecto
      linkedExecutionOrder = 0, // ← Valor por defecto
      delayPostUpdate = false, // ← Valor por defecto (deprecated)
      coordinationConfig,
      linkingMetadata,
      _id, // Para manejar ediciones correctamente
    } = sanitizedBody;

    // ===== VALIDACIÓN ADICIONAL DE TIPOS =====
    console.log("📝 Datos extraídos y tipos:", {
      name: typeof name,
      linkedGroup: typeof linkedGroup,
      executeLinkedTasks: typeof executeLinkedTasks,
      linkedExecutionOrder: typeof linkedExecutionOrder,
      linkedTasksLength: Array.isArray(linkedTasks)
        ? linkedTasks.length
        : "no es array",
    });

    // ===== VALIDACIONES BÁSICAS =====
    if (!name || !query) {
      return res.status(400).json({
        success: false,
        message: "El nombre y la consulta SQL son obligatorios.",
      });
    }

    // Validar que el nombre no contenga caracteres especiales problemáticos
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        message:
          "El nombre de la tarea solo puede contener letras, números, guiones, puntos y guiones bajos.",
      });
    }

    console.log(`[ADD-EDIT] Creando/editando tarea: ${name}`);
    console.log(`[ADD-EDIT] Datos de vinculación recibidos:`, {
      linkedGroup: linkedGroup || "null",
      executeLinkedTasks: executeLinkedTasks,
      linkedTasks: Array.isArray(linkedTasks)
        ? linkedTasks.length
        : "no es array",
      linkedTasksContent: linkedTasks,
    });

    // ===== LIMPIAR Y NORMALIZAR DATOS DE VINCULACIÓN =====
    let cleanLinkedTasks = [];
    let cleanLinkedGroup = null;
    let cleanExecuteLinkedTasks = false; // ✅ Variable específica para boolean

    // Limpiar linkedTasks - solo incluir IDs válidos
    if (Array.isArray(linkedTasks)) {
      cleanLinkedTasks = linkedTasks.filter(
        (id) =>
          id &&
          typeof id === "string" &&
          id.trim() !== "" &&
          mongoose.Types.ObjectId.isValid(id)
      );
    }

    // Limpiar linkedGroup - solo si tiene contenido real
    if (
      linkedGroup &&
      typeof linkedGroup === "string" &&
      linkedGroup.trim() !== ""
    ) {
      cleanLinkedGroup = linkedGroup.trim();
    }

    // ✅ LÓGICA CORREGIDA PARA executeLinkedTasks
    // Determinar executeLinkedTasks basado en la presencia de vinculaciones
    cleanExecuteLinkedTasks = !!(
      cleanLinkedGroup || cleanLinkedTasks.length > 0
    );

    console.log(`[ADD-EDIT] Datos limpiados:`, {
      cleanLinkedGroup,
      cleanLinkedTasks: cleanLinkedTasks.length,
      cleanExecuteLinkedTasks,
    });

    // ===== VALIDACIONES ESPECÍFICAS PARA TAREAS VINCULADAS =====

    // REGLA 1: No puede tener ambos métodos al mismo tiempo
    if (cleanLinkedGroup && cleanLinkedTasks.length > 0) {
      console.log(`[ADD-EDIT] ERROR: Conflicto de vinculación para ${name}`);
      return res.status(400).json({
        success: false,
        message:
          "Una tarea no puede tener tanto grupo vinculado como tareas vinculadas directas. Use solo uno de los dos métodos.",
      });
    }

    // REGLA 2: Validaciones específicas para grupos vinculados
    if (cleanLinkedGroup) {
      console.log(`[ADD-EDIT] Validando grupo vinculado: ${cleanLinkedGroup}`);

      // Si es coordinadora (tiene postUpdateQuery), validar que sea la única en el grupo
      if (postUpdateQuery && postUpdateQuery.trim() !== "") {
        const existingCoordinators = await TransferTask.find({
          linkedGroup: cleanLinkedGroup,
          postUpdateQuery: { $exists: true, $ne: null, $ne: "" },
          _id: { $ne: _id }, // Excluir la tarea actual en caso de edición
          active: true, // Solo considerar tareas activas
        });

        if (existingCoordinators.length > 0) {
          console.log(
            `[ADD-EDIT] ERROR: Ya existe coordinadora en grupo ${cleanLinkedGroup}:`,
            existingCoordinators[0].name
          );
          return res.status(400).json({
            success: false,
            message: `Ya existe una tarea coordinadora en el grupo "${cleanLinkedGroup}": ${existingCoordinators[0].name}. Solo una tarea por grupo puede tener post-update query.`,
          });
        }
      }

      // Validar que el orden de ejecución no se duplique en el grupo
      if (linkedExecutionOrder !== undefined && linkedExecutionOrder !== null) {
        const duplicateOrder = await TransferTask.find({
          linkedGroup: cleanLinkedGroup,
          linkedExecutionOrder: linkedExecutionOrder,
          _id: { $ne: _id }, // Excluir la tarea actual
          active: true,
        });

        if (duplicateOrder.length > 0) {
          console.log(
            `[ADD-EDIT] ADVERTENCIA: Orden duplicado en grupo ${cleanLinkedGroup}, orden ${linkedExecutionOrder}`
          );
          // No fallar, solo advertir en logs
        }
      }
    }

    // REGLA 3: Validaciones para tareas vinculadas directas
    if (cleanLinkedTasks.length > 0) {
      console.log(
        `[ADD-EDIT] Validando tareas vinculadas directas: ${cleanLinkedTasks.length} tareas`
      );

      // Verificar que todas las tareas vinculadas existan y estén activas
      const linkedTasksExist = await TransferTask.find({
        _id: { $in: cleanLinkedTasks },
        active: true,
      });

      if (linkedTasksExist.length !== cleanLinkedTasks.length) {
        const foundIds = linkedTasksExist.map((t) => t._id.toString());
        const missingIds = cleanLinkedTasks.filter(
          (id) => !foundIds.includes(id)
        );

        return res.status(400).json({
          success: false,
          message: `Algunas tareas vinculadas no existen o están inactivas: ${missingIds.join(
            ", "
          )}`,
        });
      }

      // Verificar referencias circulares
      const hasCircularReference = cleanLinkedTasks.includes(_id);
      if (hasCircularReference) {
        return res.status(400).json({
          success: false,
          message: "Una tarea no puede vincularse a sí misma.",
        });
      }
    }

    // ===== VALIDACIONES DE POST-UPDATE PARA COORDINADORAS =====
    const isCoordinator = !!(postUpdateQuery && postUpdateQuery.trim() !== "");

    if (isCoordinator && cleanLinkedGroup) {
      // Si es coordinadora de grupo, validar campos obligatorios
      if (!postUpdateMapping?.viewKey || !postUpdateMapping?.tableKey) {
        return res.status(400).json({
          success: false,
          message:
            "Una tarea coordinadora debe tener definidas las claves 'viewKey' y 'tableKey' en postUpdateMapping.",
        });
      }
    }

    // ===== CONSTRUIR OBJETO DE TAREA CON TIPOS CORRECTOS =====
    const taskData = {
      name,
      type: type || "both",
      active: active !== undefined ? Boolean(active) : true, // ✅ Asegurar boolean
      query,
      parameters: parameters || [],
      transferType: transferType || "",
      validationRules: validationRules || {
        requiredFields: [],
        existenceCheck: { table: "", key: "" },
      },
      executionMode: executionMode || "normal",
      postUpdateQuery: postUpdateQuery || null,
      postUpdateMapping: postUpdateMapping || { viewKey: null, tableKey: null },
      clearBeforeInsert: Boolean(clearBeforeInsert || false), // ✅ Asegurar boolean
      fieldMapping: fieldMapping || {
        sourceTable: "",
        targetTable: "",
        sourceFields: [],
        targetFields: [],
        defaultValues: [],
      },
      nextTasks: nextTasks || [],
      targetTable: targetTable || null, // Para transferencias internas

      // 🔗 CAMPOS DE VINCULACIÓN LIMPIOS CON TIPOS CORRECTOS
      linkedTasks: cleanLinkedTasks,
      linkedGroup: cleanLinkedGroup,
      executeLinkedTasks: cleanExecuteLinkedTasks, // ✅ Boolean limpio
      linkedExecutionOrder: Number(linkedExecutionOrder || 0), // ✅ Asegurar Number
      delayPostUpdate: false, // Deprecated - siempre false

      // 🔗 CONFIGURACIÓN DE COORDINACIÓN
      coordinationConfig: coordinationConfig || {
        waitForLinkedTasks: cleanLinkedGroup ? true : false,
        maxWaitTime: 300000, // 5 minutos
        postUpdateStrategy: cleanLinkedGroup ? "coordinated" : "individual",
      },

      // 🔗 METADATOS DE VINCULACIÓN
      linkingMetadata: {
        isCoordinator: Boolean(isCoordinator), // ✅ Asegurar boolean
        lastGroupExecution: linkingMetadata?.lastGroupExecution || null,
        lastGroupExecutionId: linkingMetadata?.lastGroupExecutionId || null,
      },
    };

    // Si es una edición, incluir el ID
    if (_id) {
      taskData._id = _id;
    }

    console.log(`[ADD-EDIT] Datos finales para ${name}:`, {
      linkedGroup: taskData.linkedGroup,
      linkedTasks: taskData.linkedTasks.length,
      isCoordinator: taskData.linkingMetadata.isCoordinator,
      executeLinkedTasks: taskData.executeLinkedTasks,
      executeLinkedTasksType: typeof taskData.executeLinkedTasks, // ✅ Debug
    });

    // ✅ VALIDACIÓN FINAL DE TIPOS ANTES DE GUARDAR
    if (typeof taskData.executeLinkedTasks !== "boolean") {
      console.error(
        `❌ ERROR: executeLinkedTasks no es boolean: ${typeof taskData.executeLinkedTasks}`,
        taskData.executeLinkedTasks
      );
      return res.status(400).json({
        success: false,
        message: "Error interno: executeLinkedTasks debe ser un valor booleano",
      });
    }

    // ===== LLAMAR AL SERVICIO =====
    const result = await transferService.upsertTransferTask(taskData);

    if (result.success) {
      console.log(
        `[ADD-EDIT] Tarea ${name} guardada exitosamente con ID: ${result.task._id}`
      );

      // ===== POST-PROCESAMIENTO PARA TAREAS VINCULADAS =====

      // Si es una nueva tarea con vinculaciones, actualizar automáticamente executeLinkedTasks
      if (taskData.linkedGroup || taskData.linkedTasks.length > 0) {
        await TransferTask.findByIdAndUpdate(result.task._id, {
          executeLinkedTasks: true,
        });
        console.log(
          `[ADD-EDIT] executeLinkedTasks habilitado automáticamente para ${name}`
        );
      }

      // Si es una tarea vinculada directa, actualizar las tareas vinculadas para que la incluyan
      if (cleanLinkedTasks.length > 0) {
        try {
          await TransferTask.updateMany(
            { _id: { $in: cleanLinkedTasks } },
            { $addToSet: { linkedTasks: result.task._id } }
          );
          console.log(
            `[ADD-EDIT] Vinculación bidireccional establecida para ${name}`
          );
        } catch (bidirectionalError) {
          console.warn(
            `[ADD-EDIT] No se pudo establecer vinculación bidireccional: ${bidirectionalError.message}`
          );
          // No fallar la operación por esto
        }
      }

      return res.json({
        success: true,
        task: result.task,
        message: `Tarea ${_id ? "actualizada" : "creada"} correctamente`,
      });
    } else {
      console.log(
        `[ADD-EDIT] Error al guardar tarea ${name}: ${result.message}`
      );
      return res.status(500).json({
        success: false,
        message: result.message || "Error al guardar la tarea",
      });
    }
  } catch (error) {
    console.error("Error en upsertTransferTaskController:", error);

    // ✅ MANEJO ESPECÍFICO DEL ERROR DE CAST
    if (error.name === "CastError" && error.path === "executeLinkedTasks") {
      console.error(
        `❌ ERROR DE CAST: executeLinkedTasks recibió valor inválido:`,
        error.value
      );
      return res.status(400).json({
        success: false,
        message:
          "Error de validación: el campo executeLinkedTasks debe ser verdadero o falso",
        debug:
          process.env.NODE_ENV === "development"
            ? {
                receivedValue: error.value,
                receivedType: typeof error.value,
              }
            : undefined,
      });
    }

    // Errores específicos de MongoDB
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Ya existe una tarea con ese nombre. Los nombres deben ser únicos.",
      });
    }

    // Errores de validación de Mongoose
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (e) => e.message
      );
      return res.status(400).json({
        success: false,
        message: "Error de validación",
        errors: validationErrors,
      });
    }

    // Error genérico
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Error desconocido",
    });
  }
};

/**
 * Ejecuta una tarea de transferencia manualmente
 */
const executeTransferTask = async (req, res) => {
  console.log("executeTransferTask, Requiere mas datos....");
  let responseData = null;

  try {
    const { taskId } = req.params;

    // Log de inicio
    logger.info(`🔄 [executeTransferTask] Iniciando - TaskID: ${taskId}`);
    // console.log(`🔄 [executeTransferTask] Iniciando - TaskID: ${taskId}`);

    // Validación de entrada
    if (!taskId) {
      responseData = {
        success: false,
        message: "Se requiere el ID de la tarea",
      };
      logger.error("❌ [executeTransferTask] taskId no proporcionado");
      return res.status(400).json(responseData);
    }

    // Buscar la tarea
    logger.info(`🔍 [executeTransferTask] Buscando tarea: ${taskId}`);
    const task = await TransferTask.findById(taskId);

    if (!task) {
      responseData = {
        success: false,
        message: "Tarea no encontrada.",
      };
      logger.error(`❌ [executeTransferTask] Tarea no encontrada: ${taskId}`);
      return res.status(404).json(responseData);
    }

    logger.info(
      `📋 [executeTransferTask] Tarea encontrada: ${task.name} (${task.type})`
    );

    // Validaciones de la tarea
    if (!task.active) {
      responseData = {
        success: false,
        message: "La tarea está inactiva y no puede ejecutarse.",
      };
      logger.warn(`⚠️ [executeTransferTask] Tarea inactiva: ${task.name}`);
      return res.status(400).json(responseData);
    }

    if (task.type !== "manual" && task.type !== "both") {
      responseData = {
        success: false,
        message:
          "Solo se pueden ejecutar manualmente las tareas de tipo 'manual' o 'both'.",
      };
      logger.warn(`⚠️ [executeTransferTask] Tipo no válido: ${task.type}`);
      return res.status(400).json(responseData);
    }

    // Verificar si hay otra tarea en progreso
    const taskInProgress = await TransferTask.findOne({
      status: "running",
      type: { $in: ["auto", "both"] },
    });

    if (taskInProgress) {
      responseData = {
        success: false,
        message:
          "No se puede ejecutar esta tarea en este momento. Hay otra tarea automática en curso.",
      };
      logger.warn(
        `⚠️ [executeTransferTask] Tarea en progreso: ${taskInProgress.name}`
      );
      return res.status(400).json(responseData);
    }

    // Ejecutar la tarea
    logger.info(
      `🚀 [executeTransferTask] Iniciando ejecución de: ${task.name}`
    );
    let result = null;
    let isLinkedGroup = false;

    try {
      // Intentar con LinkedTasksService si está disponible
      if (
        LinkedTasksService &&
        typeof LinkedTasksService.executeLinkedGroup === "function"
      ) {
        logger.info("🔗 [executeTransferTask] Usando LinkedTasksService");
        result = await LinkedTasksService.executeLinkedGroup(taskId, "manual");
        isLinkedGroup = result.isLinkedGroup || false;
        logger.info(
          `🔗 [executeTransferTask] LinkedTasksService completado - isLinkedGroup: ${isLinkedGroup}`
        );
      } else {
        logger.info(
          "📝 [executeTransferTask] LinkedTasksService no disponible, usando transferService"
        );
        result = await transferService.executeTransferWithRetry(taskId);
        isLinkedGroup = false;
      }
    } catch (executionError) {
      logger.error(
        `❌ [executeTransferTask] Error en ejecución: ${executionError.message}`
      );

      // Fallback a ejecución simple
      try {
        logger.info("🔄 [executeTransferTask] Intentando fallback");
        result = await transferService.executeTransferWithRetry(taskId);
        isLinkedGroup = false;
        logger.info("✅ [executeTransferTask] Fallback exitoso");
      } catch (fallbackError) {
        logger.error(
          `❌ [executeTransferTask] Error en fallback: ${fallbackError.message}`
        );
        responseData = {
          success: false,
          message: "Error en la ejecución de la tarea",
          error: fallbackError.message,
        };
        return res.status(500).json(responseData);
      }
    }

    // Validar resultado
    if (!result || typeof result !== "object") {
      logger.error("❌ [executeTransferTask] Resultado inválido:", result);
      responseData = {
        success: false,
        message: "Error: No se obtuvo resultado válido de la ejecución",
      };
      return res.status(500).json(responseData);
    }

    logger.info(
      `📊 [executeTransferTask] Resultado obtenido - Success: ${result.success}, isLinkedGroup: ${isLinkedGroup}`
    );

    // Enviar correo de notificación (asíncrono, sin bloquear respuesta)
    if (result.success) {
      // Importar el servicio aquí para evitar problemas de dependencia circular
      setImmediate(async () => {
        try {
          const {
            sendTransferResultsEmail,
          } = require("../services/emailService");

          if (isLinkedGroup && result.linkedTasksResults) {
            const emailData = result.linkedTasksResults.map((r) => ({
              name: r.taskName || "Tarea desconocida",
              success: r.success || false,
              inserted: r.inserted || 0,
              updated: r.updated || 0,
              duplicates: r.duplicates || 0,
              rows: r.rows || 0,
              message: r.message || "Completado",
              errorDetail: r.error || "N/A",
            }));

            await sendTransferResultsEmail(emailData, "manual_linked_group");
            logger.info(`📧 [executeTransferTask] Correo de grupo enviado`);
          } else {
            const emailData = [
              {
                name: task.name,
                success: result.success,
                inserted: result.inserted || 0,
                updated: result.updated || 0,
                duplicates: result.duplicates || 0,
                rows: result.rows || 0,
                message: result.message || "Completado",
                errorDetail: result.errorDetail || "N/A",
              },
            ];

            await sendTransferResultsEmail(emailData, "manual");
            logger.info(`📧 [executeTransferTask] Correo individual enviado`);
          }
        } catch (emailError) {
          logger.error(
            `❌ [executeTransferTask] Error enviando correo: ${emailError.message}`
          );
        }
      });
    }

    // Preparar y enviar respuesta
    responseData = {
      success: result.success || false,
      message: isLinkedGroup
        ? `Grupo ejecutado desde "${result.triggeredBy || task.name}": ${
            result.successfulTasks || 0
          }/${result.totalTasks || 1} tareas exitosas`
        : result.success
        ? "Tarea ejecutada con éxito"
        : result.message || "Error en la ejecución",
      result: {
        ...result,
        isLinkedGroup,
        taskName: task.name,
        taskId: taskId,
      },
    };

    logger.info(
      `✅ [executeTransferTask] Enviando respuesta exitosa - Success: ${responseData.success}`
    );
    return res.status(200).json(responseData);
  } catch (error) {
    logger.error(`❌ [executeTransferTask] Error crítico: ${error.message}`, {
      stack: error.stack,
      taskId: req.params?.taskId,
    });

    // Asegurar que siempre enviamos una respuesta JSON válida
    responseData = {
      success: false,
      message: "Error interno del servidor",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Error interno",
    };

    return res.status(500).json(responseData);
  }
};

// 🔗 NUEVO: Controlador para obtener información de vinculación
const getTaskLinkingInfo = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    const linkingInfo = await LinkedTasksService.getTaskLinkingInfo(taskId);

    if (!linkingInfo) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    return res.json({
      success: true,
      data: linkingInfo,
    });
  } catch (error) {
    logger.error("Error al obtener información de vinculación:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener información de vinculación",
      error: error.message,
    });
  }
};

// 🔗 NUEVO: Controlador para ejecutar solo un grupo vinculado
const executeLinkedGroup = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    const result = await LinkedTasksService.executeLinkedGroup(
      taskId,
      "manual"
    );

    return res.json({
      success: true,
      message: `Grupo vinculado ejecutado: ${result.successfulTasks}/${result.totalTasks} tareas exitosas`,
      result,
    });
  } catch (error) {
    logger.error("Error al ejecutar grupo vinculado:", error);
    return res.status(500).json({
      success: false,
      message: "Error al ejecutar grupo vinculado",
      error: error.message,
    });
  }
};

/**
 * Eliminar una tarea de transferencia
 */
const deleteTransferTask = async (req, res) => {
  const { name } = req.params;
  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const result = await TransferTask.deleteOne({ name });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    res.json({
      success: true,
      message: "Tarea eliminada correctamente",
    });
  } catch (error) {
    logger.error(`Error al eliminar tarea ${name}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar tarea",
      error: error.message,
    });
  }
};

/**
 * Obtener la configuración de hora para tareas automáticas
 */
const getConfigurarHora = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({ hour: "02:00" }); // Hora por defecto: 02:00 AM
    }
    res.json(config);
  } catch (error) {
    logger.error("Error al obtener configuración de hora:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la configuración",
      error: error.message,
    });
  }
};

/**
 * Actualizar la configuración de hora para tareas automáticas
 */
const updateConfig = async (req, res) => {
  const { hour, enabled } = req.body;

  try {
    // Validar formato de hora (HH:MM)
    if (hour && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
      return res.status(400).json({
        message: "Formato de hora inválido. Use formato HH:MM (24 horas)",
      });
    }

    // Buscar configuración existente o crear nueva
    const config = await Config.findOneAndUpdate(
      {},
      {
        hour,
        enabled: enabled !== undefined ? enabled : true, // Nuevo campo
        lastModified: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`Configuración actualizada: ${JSON.stringify(config)}`);

    // Si está habilitado, iniciar el trabajo cron con la nueva hora
    if (config.enabled !== false) {
      startCronJob(config.hour);
    } else {
      // Si está deshabilitado, detener el trabajo cron
      if (typeof stopCronJob === "function") {
        stopCronJob();
      }
    }

    res.json({
      message: "Configuración actualizada",
      config,
    });
  } catch (error) {
    console.error("Error al actualizar la configuración:", error);
    res.status(500).json({
      message: "Error al actualizar la configuración",
      error: error.message,
    });
  }
};

/**
 * Obtener estado actual de las tareas
 */
const getTaskStatus = async (req, res) => {
  try {
    const tasks = await TransferTask.find({}, "name status progress");
    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    logger.error("Error al obtener estado de tareas:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo estado de tareas",
      error: error.message,
    });
  }
};

/**
 * Ejecuta una tarea con parámetros específicos
 */
async function runTask(req, res) {
  const taskId = Date.now().toString(); // Identificador único para cancelación

  try {
    const { taskName } = req.params;
    const { parametros } = req.body || {};

    if (!taskName) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    const { date, vendors } = parametros || {};

    if (!date || !vendors) {
      return res.status(400).json({
        success: false,
        message: "Fecha y vendedores son obligatorios.",
      });
    }

    // Buscar la tarea en MongoDB
    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    const formattedDate = formatDateToYYYYMMDD(date);
    const vendorsArray = vendors.split(",").map((v) => v.trim());

    // Preparar parámetros
    const overrideParams = {
      Order_Date: formattedDate,
      Code_Seller: vendorsArray,
    };

    logger.info(`Ejecutando tarea ${taskName} con parámetros:`, overrideParams);

    // Crear AbortController para permitir cancelación
    const abortController = new AbortController();

    // Registrar la tarea para cancelación (usando un ID compuesto para identificarla)
    const cancelTaskId = `runTask_${taskName}_${taskId}`;
    TaskTracker.registerTask(cancelTaskId, abortController, {
      type: "runTask",
      taskName,
      params: overrideParams,
    });

    // Usar withConnection para obtener una conexión y pasarla a executeDynamicSelect
    return await withConnection("server1", async (connection) => {
      try {
        // Ejecutar la consulta pasando la conexión y la señal de cancelación
        const result = await executeDynamicSelect(
          taskName,
          overrideParams,
          connection,
          abortController.signal
        );

        // Completar la tarea de cancelación
        TaskTracker.safeCompleteTask(cancelTaskId, "completed");

        return res.json({
          success: true,
          taskId: cancelTaskId, // Devolver el ID para cancelación desde el frontend
          result,
        });
      } catch (error) {
        // Verificar si fue cancelada
        if (error.message && error.message.includes("cancelada")) {
          logger.info(`Tarea ${taskName} cancelada por el usuario`);

          // Completar la tarea de cancelación
          TaskTracker.safeCompleteTask(cancelTaskId, "cancelled");

          return res.status(499).json({
            // 499 es "Client Closed Request"
            success: false,
            message: "Operación cancelada por el usuario",
          });
        }

        logger.error(`Error al ejecutar tarea:`, error);

        // Completar la tarea como fallida
        TaskTracker.safeCompleteTask(cancelTaskId, "failed");

        return res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });
  } catch (error) {
    logger.error(`Error al ejecutar tarea:`, error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Inserta en IMPLT_Orders los datos recibidos.
 */
async function insertOrders(req, res) {
  try {
    const { salesData } = req.body;
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay ventas para insertar.",
      });
    }

    // Validar cada elemento de salesData
    const validSalesData = salesData.map((item) => {
      // Crear un nuevo objeto con propiedades validadas
      const validItem = {};

      // Asegurarse de que cada propiedad esté bien definida o sea null
      Object.keys(item).forEach((key) => {
        validItem[key] = item[key] === undefined ? null : item[key];
      });

      return validItem;
    });

    // Buscar la tarea que representa la carga a IMPLT_Orders
    const task = await TransferTask.findOne({ name: "IMPLT_Orders" });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea IMPLT_Orders no encontrada.",
      });
    }

    // Ejecutar la inserción en lotes con SSE
    const result = await insertInBatchesSSE(task._id, validSalesData, 100);
    return res.json({
      success: true,
      message: "Datos insertados correctamente",
      result,
    });
  } catch (error) {
    logger.error("Error en insertOrders:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Inserta los datos en IMPLT_loads_detail.
 */
async function insertLoadsDetail(req, res) {
  try {
    const { route, loadId, salesData, bodega } = req.body;

    if (
      !route ||
      !loadId ||
      !salesData ||
      !Array.isArray(salesData) ||
      salesData.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos para insertar en loads_detail.",
      });
    }

    // Buscar la tarea para IMPLT_loads_detail
    const task = await TransferTask.findOne({ name: "IMPLT_loads_detail" });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea IMPLT_loads_detail no encontrada.",
      });
    }

    // console.log("Obtiendo datos de la tarea IMPLT_loads_detail", salesData);

    // Convertir cada registro al formato requerido
    const modifiedData = salesData.map((record, index) => ({
      Code: loadId,
      Num_Line: index + 1,
      Lot_Group: "9999999999",
      Code_Product: record.Code_Product,
      Date_Load: record.Order_Date,
      Quantity: record.Quantity.toString(),
      Unit_Type: record.Unit_Measure,
      Code_Warehouse_Sou: bodega,
      Code_Route: route,
      Source_Create: null,
      Transfer_status: "1",
      Status_SAP: null,
      Code_Unit_Org: "CATELLI",
      Code_Sales_Org: "CATELLI",
    }));

    // Ejecutar la inserción en lotes con SSE
    const result = await insertInBatchesSSE(task._id, modifiedData, 100);

    // Actualizar el consecutivo
    await Consecutivo.findOneAndUpdate({}, { valor: loadId }, { upsert: true });

    return res.json({
      success: true,
      message: "Datos insertados correctamente en loads_detail",
      result,
    });
  } catch (error) {
    logger.error("Error en insertLoadsDetail:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Ejecuta el traspaso de bodega basado en los datos recibidos
 */
async function insertLoadsTrapaso(req, res) {
  try {
    const { route, loadId, salesData, bodega_destino } = req.body;
    logger.info("Datos recibidos para traspaso:", {
      route,
      salesData: salesData
        ? `${salesData.length} registros y la bodega destino -> ${bodega_destino}`
        : "no data",
    });

    // Validación básica
    if (!route) {
      return res.status(400).json({
        success: false,
        message: "Parámetro 'route' es requerido",
      });
    }

    if (!salesData || !Array.isArray(salesData)) {
      return res.status(400).json({
        success: false,
        message: "Parámetro 'salesData' debe ser un array",
      });
    }

    if (salesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay datos de ventas para procesar",
      });
    }

    // Filtrar datos inválidos
    const validSalesData = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        typeof item.Quantity !== "undefined" &&
        item.Quantity !== null &&
        Number(item.Quantity) > 0
    );

    if (validSalesData.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No hay productos válidos para traspasar. Cada producto debe tener Code_Product y Quantity > 0",
      });
    }

    logger.info(
      `Procesando traspaso con ${validSalesData.length} productos válidos`
    );

    // Usar realizarTraspaso con manejo mejorado de errores
    try {
      const result = await realizarTraspaso({
        route,
        salesData: validSalesData,
        bodega_destino,
      });

      return res.json({
        success: true,
        message: "Traspaso ejecutado correctamente",
        ...result,
      });
    } catch (error) {
      logger.error("Error en realizarTraspaso:", error);
      return res.status(500).json({
        success: false,
        message: `Error al realizar el traspaso: ${error.message}`,
      });
    }
  } catch (error) {
    logger.error("Error en insertLoadsTrapaso:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Obtiene el último consecutivo de carga desde MongoDB
 */
async function getLoadConsecutiveMongo(req, res) {
  try {
    const loadId = await obtenerConsecutivo({
      modelo: Consecutivo,
      campoFiltro: "nombre",
      valorFiltro: "LOAD",
      campoConsecutivo: "valor",
      longitudConsecutivo: 7,
      prefijoBase: "LC",
      valorInicial: "0".padStart(7, "0"),
    });

    res.json({
      success: true,
      loadId,
    });
  } catch (error) {
    logger.error("Error al obtener consecutivo:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener loadId",
      error: error.message,
    });
  }
}

/**
 * Obtiene el historial de ejecución de una tarea
 */
const getTaskExecutionHistory = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    // Obtener la tarea para tener información básica
    const task = await TransferTask.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    // Obtener historial de TransferSummary relacionado con esta tarea
    const summaries = await TransferSummary.find({
      taskName: task.name,
    })
      .sort({ date: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      task: {
        name: task.name,
        lastExecutionDate: task.lastExecutionDate,
        executionCount: task.executionCount,
        lastExecutionResult: task.lastExecutionResult,
      },
      history: summaries,
    });
  } catch (error) {
    logger.error("Error al obtener historial de ejecución:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener historial",
      error: error.message,
    });
  }
};

/**
 * Cancela una tarea en ejecución
 */
const cancelTransferTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el ID de la tarea",
      });
    }

    // Verificar si la tarea existe
    const task = await TransferTask.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    // Verificar si está en ejecución usando el módulo TaskTracker
    const TaskTracker = require("../services/TaskTracker");

    if (!TaskTracker.isTaskActive(taskId)) {
      return res.status(400).json({
        success: false,
        message: "La tarea no está en ejecución actualmente",
      });
    }

    // Cancelar la tarea
    const cancelled = TaskTracker.cancelTask(taskId);

    if (cancelled) {
      // Actualizar el estado en la base de datos
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "cancelled",
        progress: -1,
      });

      return res.status(200).json({
        success: true,
        message: "Tarea cancelada correctamente",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "No se pudo cancelar la tarea",
      });
    }
  } catch (error) {
    logger.error("Error al cancelar tarea:", error);
    return res.status(500).json({
      success: false,
      message: "Error al cancelar la tarea",
      error: error.message,
    });
  }
};

const getVendedores = async (req, res) => {
  console.log("getVendedores", req.body);
  try {
    return await withConnection("server1", async (connection) => {
      // Consulta para obtener los vendedores y sus bodegas asignadas
      const query = `
       SELECT VENDEDOR, NOMBRE, U_BODEGA
       FROM CATELLI.VENDEDOR 
       WHERE ACTIVO = 'S' and U_ESVENDEDOR = 'Re'
       ORDER BY VENDEDOR
     `;

      const result = await SqlService.query(connection, query);
      console.log("Result -> ", result);

      if (!result || !result.recordset) {
        return res.status(404).json({
          success: false,
          message: "No se encontraron vendedores",
        });
      }

      return res.json({
        success: true,
        data: result.recordset,
      });
    });
  } catch (error) {
    logger.error("Error al obtener vendedores:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener vendedores",
      error: error,
    });
  }
};

/**
 * Obtiene el historial de transferencias con filtros opcionales
 */
const getTransferHistory = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      status,
      taskName,
      page = 1,
      limit = 20,
    } = req.query;

    // Construir consulta con filtros
    const query = {};

    // Filtro por fecha
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    // Filtro por estado
    if (status) {
      query.status = status;
    }

    // Filtro por nombre de tarea
    if (taskName) {
      // Si usas una relación por nombre en TransferSummary
      query.taskName = taskName;
      // O si tienes una referencia por ID
      // const task = await TransferTask.findOne({ name: taskName });
      // if (task) query.task = task._id;
    }

    // Calcular paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Obtener historial de TransferSummary
    const history = await TransferSummary.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Contar total para la paginación
    const total = await TransferSummary.countDocuments(query);

    // Calcular estadísticas para "hoy"
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedToday = await TransferSummary.countDocuments({
      date: { $gte: today },
      status: "completed",
    });

    const failedToday = await TransferSummary.countDocuments({
      date: { $gte: today },
      status: "failed",
    });

    res.status(200).json({
      success: true,
      history,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      completedToday,
      failedToday,
    });
  } catch (error) {
    console.error("Error al obtener historial de transferencias:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener historial de transferencias",
      error: error.message,
    });
  }
};

const checkServerStatus = async (req, res) => {
  console.log("Checking server status...");
  try {
    // Creamos un objeto para la respuesta
    const serverStatus = {
      server1: { status: "checking", responseTime: 0 },
      server2: { status: "checking", responseTime: 0 },
      mongodb: { status: "checking" },
    };

    // Verificar MongoDB
    const isMongoConnected = mongoose.connection.readyState === 1;
    serverStatus.mongodb.status = isMongoConnected ? "online" : "offline";

    // Verificar Server1
    try {
      const startTime = Date.now();
      // Usar el servicio ConnectionDiagnostic que veo en tus archivos
      const server1Result = await ConnectionDiagnostic.testDirectConnection(
        await DBConfig.findOne({ serverName: "server1" })
      );

      const endTime = Date.now();

      serverStatus.server1.status = "online";
      serverStatus.server1.responseTime = endTime - startTime;
      serverStatus.server1.info = server1Result;
    } catch (error) {
      serverStatus.server1.status = "offline";
      serverStatus.server1.error = error.message;
    }

    // Verificar Server2
    try {
      const startTime = Date.now();
      const server2Result = await ConnectionDiagnostic.testDirectConnection(
        await DBConfig.findOne({ serverName: "server2" })
      );
      const endTime = Date.now();

      serverStatus.server2.status = "online";
      serverStatus.server2.responseTime = endTime - startTime;
      serverStatus.server2.info = server2Result;
    } catch (error) {
      serverStatus.server2.status = "offline";
      serverStatus.server2.error = error.message;
    }

    // Enviar respuesta
    res.status(200).json(serverStatus);
  } catch (error) {
    logger.error("Error verificando estado de servidores:", error);
    res.status(500).json({
      success: false,
      message: "Error verificando estado de servidores",
      error: error.message,
    });
  }
};

const getTransferSummaries = async (req, res) => {
  try {
    // Obtener resúmenes recientes usando el nuevo modelo TaskExecution
    const TaskExecution = require("../models/taskExecutionModel");

    // Obtener historial reciente
    const summaries = await TaskExecution.find().sort({ date: -1 }).limit(20);

    // Calcular estadísticas para hoy (solo la fecha, sin tener en cuenta la hora)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Obtener ejecuciones de hoy usando un rango de fechas completo
    const completedToday = await TaskExecution.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      status: "completed",
    });

    const failedToday = await TaskExecution.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      status: { $in: ["failed", "cancelled"] },
    });

    // Mapear a formato compatible con el componente de dashboard
    const formattedSummaries = summaries.map((summary) => {
      // Opcionalmente, formatear la fecha aquí si es necesario
      const date = new Date(summary.date);
      const formattedDate = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      return {
        name: summary.taskName,
        taskName: summary.taskName,
        date: summary.date,
        formattedDate: formattedDate, // Añadir la fecha formateada
        status: summary.status,
        totalRecords: summary.totalRecords || 0,
        successfulRecords: summary.successfulRecords || 0,
        failedRecords: summary.failedRecords || 0,
        executionTime: summary.executionTime || 0,
      };
    });

    res.status(200).json({
      success: true,
      history: formattedSummaries,
      completedToday,
      failedToday,
    });
  } catch (error) {
    logger.error("Error al obtener resúmenes de transferencias:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener resúmenes de transferencias",
      error: error.message,
    });
  }
};

const getDailyStats = async (req, res) => {
  try {
    const TaskExecution = require("../models/taskExecutionModel");

    // Calcular el rango de hoy (toda la fecha, sin tener en cuenta la hora)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Buscar todas las ejecuciones de hoy
    const executions = await TaskExecution.find({
      date: { $gte: today, $lt: tomorrow },
    }).sort({ date: -1 });

    // Contar por estado
    const completedToday = executions.filter(
      (exec) => exec.status === "completed"
    ).length;
    const failedToday = executions.filter((exec) =>
      ["failed", "cancelled"].includes(exec.status)
    ).length;

    // Formatear las ejecuciones para mostrar
    const formattedExecutions = executions.map((exec) => ({
      taskId: exec.taskId,
      taskName: exec.taskName,
      date: exec.date,
      status: exec.status,
      totalRecords: exec.totalRecords || 0,
      executionTime: exec.executionTime || 0,
    }));

    res.status(200).json({
      success: true,
      date: today.toISOString().split("T")[0],
      executions: formattedExecutions,
      stats: {
        total: executions.length,
        completed: completedToday,
        failed: failedToday,
      },
    });
  } catch (error) {
    logger.error("Error al obtener estadísticas diarias:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas diarias",
      error: error.message,
    });
  }
};

const getSourceDataByMapping = async (req, res) => {
  let connection = null;

  try {
    const { mappingId, documentId } = req.params;

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren los IDs de la configuración y del documento",
      });
    }

    // Obtener configuración de mapping
    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapping no encontrada",
      });
    }

    // Obtener conexión al servidor origen
    const connectionResult = await ConnectionManager.enhancedRobustConnect(
      mapping.sourceServer
    );
    if (!connectionResult.success) {
      throw new Error(
        `No se pudo establecer conexión a ${mapping.sourceServer}: ${
          connectionResult.error?.message || "Error desconocido"
        }`
      );
    }

    connection = connectionResult.connection;

    // Buscar la tabla principal en la configuración
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró configuración de tabla principal");
    }

    // Construir consulta para obtener datos de la tabla origen
    const query = `
     SELECT * FROM ${mainTable.sourceTable}
     WHERE ${mainTable.primaryKey} = @documentId
   `;

    // Ejecutar consulta
    const result = await SqlService.query(connection, query, { documentId });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron datos para el documento ${documentId} en la tabla ${mainTable.sourceTable}`,
      });
    }

    // Devolver los datos de origen tal cual, sin transformar
    const sourceData = result.recordset[0];

    res.json({
      success: true,
      data: {
        sourceData, // Datos originales
        mappingConfig: {
          sourceTable: mainTable.sourceTable,
          primaryKey: mainTable.primaryKey,
        },
      },
    });
  } catch (error) {
    logger.error(`Error al obtener datos de origen: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    // Liberar conexión
    if (connection) {
      try {
        await ConnectionManager.releaseConnection(connection);
      } catch (e) {
        logger.error(`Error al liberar conexión: ${e.message}`);
      }
    }
  }
};

const updateEntityData = async (req, res) => {
  let sourceConnection = null;
  let targetConnection = null;

  try {
    const { mappingId, documentId, targetData, sourceData, _dynamicFields } =
      req.body;

    console.log("Datas recibidos -> ", req.body);

    if (!mappingId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren mappingId y documentId",
      });
    }

    // Obtener la configuración de mapping
    const mapping = await DynamicTransferService.getMappingById(mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "Configuración de mapping no encontrada",
      });
    }

    // Asegurarse de que hay datos para actualizar
    if (!sourceData || Object.keys(sourceData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay datos para actualizar en origen",
      });
    }

    // 1. Actualizar en la tabla origen
    try {
      // Obtener conexión al servidor origen
      const sourceConnResult = await ConnectionManager.enhancedRobustConnect(
        mapping.sourceServer
      );
      if (!sourceConnResult.success) {
        throw new Error(`No se pudo conectar a ${mapping.sourceServer}`);
      }
      sourceConnection = sourceConnResult.connection;

      // Encontrar la tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      // Construir consulta de actualización
      const setClause = Object.entries(sourceData)
        .map(([field, _]) => `${field} = @${field}`)
        .join(", ");

      const updateQuery = `
       UPDATE ${mainTable.sourceTable}
       SET ${setClause}
       WHERE ${mainTable.primaryKey} = @documentId
     `;

      // Ejecutar actualización
      await SqlService.query(sourceConnection, updateQuery, {
        ...sourceData,
        documentId,
      });

      logger.info(
        `Actualización en origen completada para documento ${documentId}`
      );
    } catch (sourceError) {
      logger.error(`Error al actualizar en origen: ${sourceError.message}`);
      throw new Error(`Error al actualizar en origen: ${sourceError.message}`);
    } finally {
      if (sourceConnection) {
        await ConnectionManager.releaseConnection(sourceConnection);
      }
    }

    // 2. Actualizar campos dinámicos (secuencias) si es necesario
    if (_dynamicFields && Object.keys(_dynamicFields).length > 0) {
      try {
        // Obtener conexión al servidor destino
        const targetConnResult = await ConnectionManager.enhancedRobustConnect(
          mapping.targetServer
        );
        if (!targetConnResult.success) {
          throw new Error(`No se pudo conectar a ${mapping.targetServer}`);
        }
        targetConnection = targetConnResult.connection;

        // Actualizar cada secuencia
        for (const [fieldName, fieldConfig] of Object.entries(_dynamicFields)) {
          if (
            fieldConfig.queryType === "sequence" &&
            fieldConfig.queryDefinition
          ) {
            const { sequenceTable, sequenceField, sequenceCondition } =
              fieldConfig.queryDefinition;

            // Construir consulta de actualización
            let query = `UPDATE ${sequenceTable} SET ${sequenceField} = @newValue`;
            const params = {
              newValue: fieldConfig.newValue,
            };

            if (sequenceCondition) {
              query += ` WHERE ${sequenceCondition}`;
            }

            // Ejecutar la actualización
            await SqlService.query(targetConnection, query, params);

            logger.info(
              `Secuencia actualizada en ${sequenceTable}.${sequenceField} con valor ${fieldConfig.newValue}`
            );
          }
        }
      } catch (seqError) {
        logger.warn(`Error al actualizar secuencias: ${seqError.message}`);
        // No fallamos toda la operación por error en secuencias
      } finally {
        if (targetConnection) {
          await ConnectionManager.releaseConnection(targetConnection);
        }
      }
    }

    // Responder con éxito
    res.json({
      success: true,
      message: "Datos actualizados correctamente en origen y destino",
    });
  } catch (error) {
    logger.error(`Error al actualizar entidad: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 5. NUEVA FUNCIÓN: Obtener estadísticas de grupos vinculados
const getLinkedGroupStats = async (req, res) => {
  try {
    const stats = LinkedTasksService.getGroupExecutionStats();

    // Obtener información adicional de la base de datos
    const linkedGroups = await TransferTask.aggregate([
      {
        $match: {
          linkedGroup: { $exists: true, $ne: null, $ne: "" },
          active: true,
        },
      },
      {
        $group: {
          _id: "$linkedGroup",
          tasks: {
            $push: {
              id: "$_id",
              name: "$name",
              isCoordinator: { $ne: ["$postUpdateQuery", null] },
              executionOrder: "$linkedExecutionOrder",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      success: true,
      data: {
        activeExecutions: stats,
        linkedGroups: linkedGroups.map((group) => ({
          groupName: group._id,
          taskCount: group.count,
          tasks: group.tasks.sort(
            (a, b) => a.executionOrder - b.executionOrder
          ),
        })),
      },
    });
  } catch (error) {
    logger.error("Error al obtener estadísticas de grupos vinculados:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
      error: error.message,
    });
  }
};

module.exports = {
  getTransferTasks,
  getTransferTask,
  upsertTransferTaskController,
  deleteTransferTask,
  executeTransferTask,
  getConfigurarHora,
  updateConfig,
  runTask,
  getTaskStatus,
  insertOrders,
  insertLoadsDetail,
  getLoadConsecutiveMongo,
  insertLoadsTrapaso,
  getTaskExecutionHistory,
  cancelTransferTask,
  getVendedores,
  getTransferHistory,
  checkServerStatus,
  getTransferSummaries,
  getSourceDataByMapping,
  updateEntityData,
  getTaskLinkingInfo,
  executeLinkedGroup,
  getLinkedGroupStats,
  getDailyStats, // ✅ Agregado al export
};
