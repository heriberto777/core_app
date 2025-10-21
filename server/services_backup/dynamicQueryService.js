// services/dynamicQueryService.js - VERSIÓN MEJORADA
const TransferTask = require("../models/transferTaks");
const ConnectionManager = require("./ConnectionManager");
const { SqlService } = require("./SqlService");
const logger = require("./logger");
const MemoryManager = require("./MemoryManager");
const Telemetry = require("./Telemetry");
const RetryService = require("./RetryService");
const TaskTracker = require("./TaskTracker");

// Funciones de validación para evitar consultas destructivas
const {
  validateSelectQueryOnly,
  validateNonDestructiveQuery,
} = require("../utils/validateQuery");
const { sendProgress } = require("./progressSse");
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");

// Servicio de reintentos específico para consultas dinámicas
const queryRetryService = new RetryService.RetryService({
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 15000,
  factor: 1.5,
  logPrefix: "[DynamicQuery] ",
  retryableErrors: [
    "ECONNCLOSED",
    "timeout",
    "connection",
    "network",
    "state",
    "LoggedIn state",
    "Final state",
  ],
});

/**
 * Ejecuta una consulta SELECT usando la definición de la tarea almacenada en MongoDB,
 * sobrescribiendo sus parámetros con overrideParams (si se proporcionan).
 * Versión mejorada con capacidad de reutilizar conexiones, reportar progreso y manejar cancelaciones.
 *
 * @param {String} taskName - Nombre de la tarea en la colección TransferTask.
 * @param {Object} overrideParams - Objeto con los valores que sobrescriben los parámetros guardados.
 * @param {String|Object} serverKeyOrConnection - Nombre del servidor o conexión existente.
 * @param {AbortSignal} signal - Señal para cancelación opcional.
 * @returns {Promise<Array>} - El recordset obtenido tras ejecutar el query.
 */

async function executeDynamicSelect(
  taskName,
  overrideParams = {},
  serverKeyOrConnection,
  signal = null
) {
  let connection = null;
  let serverKey = "server1";
  let ownConnection = true; // Si creamos la conexión nosotros, debemos cerrarla
  let task = null;

  // Crear AbortController si no se proporcionó signal
  const localAbortController = !signal ? new AbortController() : null;
  signal = signal || localAbortController.signal;

  try {
    // Determinar si recibimos una conexión o un nombre de servidor
    if (
      typeof serverKeyOrConnection === "object" &&
      serverKeyOrConnection !== null &&
      typeof serverKeyOrConnection.execSql === "function"
    ) {
      // Es una conexión existente
      connection = serverKeyOrConnection;
      ownConnection = false; // No debemos cerrar esta conexión, la gestiona quien la pasó
      serverKey = connection._poolOrigin || "server1"; // Intentamos obtener el origen
      logger.debug(
        `Usando conexión existente para tarea '${taskName}' (origen: ${serverKey})`
      );
    } else if (typeof serverKeyOrConnection === "string") {
      // Es un nombre de servidor
      serverKey = serverKeyOrConnection;
      logger.debug(
        `Se usará nueva conexión a ${serverKey} para tarea '${taskName}'`
      );
    } else {
      // Valor por defecto
      serverKey = "server1";
      logger.debug(
        `Se usará conexión por defecto a ${serverKey} para tarea '${taskName}'`
      );
    }

    // Registrar uso de memoria inicial
    MemoryManager.logMemoryUsage(`DynamicQuery-${taskName}-start`);

    // Iniciar medición de tiempo para telemetría
    Telemetry.startTimer(`dynamic_query_${taskName}`);

    // 1) Buscar la tarea en MongoDB
    logger.info(`🔍 Buscando tarea dinámica '${taskName}'...`);
    task = await TransferTask.findOne({ name: taskName });

    if (!task) {
      throw new Error(`No se encontró la tarea con name="${taskName}"`);
    }

    if (!task.active) {
      throw new Error(`La tarea "${taskName}" está inactiva (active=false).`);
    }

    // 2) Validar que la query sea únicamente SELECT
    logger.debug(`Validando query de la tarea '${taskName}'...`);
    validateSelectQueryOnly(task.query);

    // 3) Registrar la tarea en el TaskTracker
    TaskTracker.registerTask(
      task._id,
      localAbortController || { abort: () => {} },
      {
        type: "dynamicQuery",
        serverKey,
        taskName,
      }
    );

    // 4) Marcar la tarea como "running"
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "running",
      progress: 0,
    });

    // Informar progreso al iniciar
    sendProgress(task._id, 5);

    // 5) Verificar cancelación
    if (signal.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // 6) Obtener conexión solo si no recibimos una
    if (ownConnection) {
      logger.info(
        `🔌 Estableciendo conexión a ${serverKey} para tarea '${taskName}'...`
      );
      sendProgress(task._id, 10);

      const connectionResult = await ConnectionManager.enhancedRobustConnect(
        serverKey
      );

      if (!connectionResult.success) {
        throw new Error(
          `No se pudo establecer conexión a ${serverKey}: ${
            connectionResult.error?.message || "Error desconocido"
          }`
        );
      }

      connection = connectionResult.connection;
      logger.info(
        `✅ Conexión establecida correctamente para tarea '${taskName}'`
      );
    } else {
      logger.info(`✅ Usando conexión existente para tarea '${taskName}'`);
    }

    // Informar del progreso después de obtener conexión
    sendProgress(task._id, 20);

    // 7) Construir la consulta final usando los parámetros
    let finalQuery = task.query.trim();
    const params = {};

    if (
      task.parameters &&
      Array.isArray(task.parameters) &&
      task.parameters.length > 0
    ) {
      const conditions = [];
      for (const param of task.parameters) {
        // Se usa overrideParams si existe, de lo contrario se usa el valor por defecto
        const fieldValue = Object.prototype.hasOwnProperty.call(
          overrideParams,
          param.field
        )
          ? overrideParams[param.field]
          : param.value;

        // Si no hay valor, se omite este parámetro
        if (fieldValue === undefined || fieldValue === null) continue;

        if (param.operator === "BETWEEN") {
          if (fieldValue.from === undefined || fieldValue.to === undefined)
            continue;

          // Convertir a string para evitar problemas con tedious
          const fromValue =
            fieldValue.from === null ? null : String(fieldValue.from);
          const toValue = fieldValue.to === null ? null : String(fieldValue.to);

          params[`${param.field}_from`] = fromValue;
          params[`${param.field}_to`] = toValue;
          conditions.push(
            `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
          );
        } else if (param.operator === "IN") {
          const arr = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          if (arr.length === 0) {
            conditions.push("1=0");
          } else {
            // Para adaptador tedious: convertir a string y verificar valores null
            const placeholders = arr.map((v, i) => {
              const pName = `${param.field}_in_${i}`;
              // Asegurarse de que el valor sea string para evitar errores de validación
              const safeValue = v === null ? null : String(v);
              params[pName] = safeValue;
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          // Asegurarse de que sea string para LIKE
          const safeValue = fieldValue === null ? null : String(fieldValue);
          params[param.field] = safeValue;
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          // Convertir a string para garantizar compatibilidad con tedious
          const safeValue =
            fieldValue === null
              ? null
              : typeof fieldValue === "number"
              ? fieldValue
              : String(fieldValue);
          params[param.field] = safeValue;
          conditions.push(`${param.field} ${param.operator} @${param.field}`);
        }
      }

      if (conditions.length > 0) {
        finalQuery += /where/i.test(finalQuery) ? " AND " : " WHERE ";
        finalQuery += conditions.join(" AND ");
      }
    }

    // Informar progreso después de construir consulta
    sendProgress(task._id, 30);

    logger.info(`🔄 Ejecutando query dinámico SELECT para '${taskName}'`);
    logger.debug(
      `Query: ${finalQuery.substring(0, 500)}${
        finalQuery.length > 500 ? "..." : ""
      }`
    );

    // 8) Verificar cancelación de nuevo
    if (signal.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // 9) Ejecutar la consulta con reintentos automáticos
    let result;
    try {
      // Usar RetryService para ejecutar con reintentos
      result = await queryRetryService.execute(
        async (attempt) => {
          // Si es un reintento, verificar conexión y reconectar si es necesario
          if (attempt > 0 && ownConnection) {
            try {
              await DatabaseServiceAdapter.query(connection, "SELECT 1 AS test");
              sendProgress(task._id, 35 + attempt * 5); // Incrementar progreso con cada reintento
            } catch (connError) {
              logger.warn(
                `Conexión perdida para tarea '${taskName}', reconectando...`
              );

              // Liberar la conexión actual
              try {
                await ConnectionManager.releaseConnection(connection);
              } catch (e) {}

              // Obtener nueva conexión
              const reconnectResult =
                await ConnectionManager.enhancedRobustConnect(serverKey);

              if (!reconnectResult.success) {
                throw new Error(
                  `No se pudo restablecer conexión: ${
                    reconnectResult.error?.message || "Error desconocido"
                  }`
                );
              }

              connection = reconnectResult.connection;
              logger.info(`✅ Reconexión exitosa para tarea '${taskName}'`);
            }
          }

          // Actualizar progreso antes de ejecutar
          sendProgress(task._id, 40);

          // Usar SqlService para ejecutar la consulta con parámetros sanitizados
          const sanitizedParams = SqlService.sanitizeParams(params);
          const queryResult = await DatabaseServiceAdapter.query(
            connection,
            finalQuery,
            sanitizedParams,
            serverKey
          );

          // Actualizar progreso después de obtener resultados
          sendProgress(task._id, 70);

          return queryResult;
        },
        {
          name: `consulta dinámica '${taskName}'`,
          signal,
        }
      );

      // Registro para telemetría
      Telemetry.trackQuery(serverKey);
    } catch (error) {
      // Verificar si el error es por cancelación
      if (signal.aborted || error.message?.includes("cancelada")) {
        logger.info(
          `Tarea ${taskName} cancelada por el usuario durante la consulta`
        );
        await TransferTask.findByIdAndUpdate(task._id, {
          status: "cancelled",
          progress: -1,
          lastExecutionDate: new Date(),
          lastExecutionResult: {
            success: false,
            message: "Cancelada por el usuario",
          },
        });

        // Informar de la cancelación
        sendProgress(task._id, -1);

        // Marcar como cancelada en el TaskTracker
        TaskTracker.completeTask(task._id, "cancelled");

        throw new Error("Transferencia cancelada por el usuario");
      }

      // Log detallado para errores de validación de parámetros
      if (error.code === "EPARAM") {
        logger.error(
          `Error de validación de parámetros en query "${taskName}". Detalles del error:`,
          {
            message: error.message,
            cause: error.cause?.message,
            stack: error.stack,
            query: finalQuery,
            params: JSON.stringify(params),
          }
        );
      } else {
        logger.error(`Error ejecutando query de "${taskName}":`, error);
      }

      await TransferTask.findByIdAndUpdate(task._id, {
        status: "failed",
        progress: -1,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: false,
          message: error.message || "Error desconocido",
          error: error.stack || "No stack trace disponible",
        },
      });

      // Informar del error
      sendProgress(task._id, -1);

      // Marcar como fallida en el TaskTracker
      TaskTracker.completeTask(task._id, "failed");

      throw error;
    }

    // Procesar y organizar resultados
    sendProgress(task._id, 80);

    // 10) Marcar la tarea como completada
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "completed",
      progress: 100,
      lastExecutionDate: new Date(),
      $inc: { executionCount: 1 },
      lastExecutionResult: {
        success: true,
        message: "Consulta completada exitosamente",
        recordCount: result.recordset.length,
      },
    });

    // Informar del 100% de progreso
    sendProgress(task._id, 100);

    // Completar tarea en el TaskTracker
    TaskTracker.completeTask(task._id, "completed");

    // 11) Finalizar medición y actualizar métricas
    const queryTime = Telemetry.endTimer(`dynamic_query_${taskName}`);
    Telemetry.updateAverage("avgQueryTime", queryTime);

    logger.info(
      `✅ Consulta para '${taskName}' completada en ${queryTime}ms con ${result.recordset.length} registros`
    );

    // 12) Retornar el recordset
    return result.recordset;
  } catch (error) {
    // Registrar error en telemetría
    Telemetry.trackQuery(serverKey, true);

    logger.error(
      `❌ Error en executeDynamicSelect para tarea "${taskName}":`,
      error
    );

    // Verificar si es un error de cancelación que no hayamos atrapado ya
    if (signal.aborted && task && task._id) {
      await TransferTask.findByIdAndUpdate(task._id, {
        status: "cancelled",
        progress: -1,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: false,
          message: "Cancelada por el usuario",
        },
      });

      sendProgress(task._id, -1);
      TaskTracker.completeTask(task._id, "cancelled");
    }

    throw error;
  } finally {
    // Registrar uso de memoria final
    MemoryManager.logMemoryUsage(`DynamicQuery-${taskName}-end`);

    // Cerrar la conexión SOLO si nosotros la creamos
    if (ownConnection) {
      try {
        if (connection) {
          await ConnectionManager.releaseConnection(connection);
          logger.debug(
            `✅ Conexión cerrada correctamente para consulta '${taskName}'`
          );
        }
      } catch (closeError) {
        logger.error(
          `❌ Error al cerrar conexión para consulta '${taskName}':`,
          closeError
        );
      }
    } else {
      logger.debug(
        `La conexión para '${taskName}' será gestionada por quien la proporcionó`
      );
    }
  }
}

/**
 * Ejecuta una consulta no destructiva (que puede incluir MERGE o INSERT),
 * pero valida que no contenga comandos peligrosos (DROP, TRUNCATE, etc.).
 * Versión mejorada con gestión de conexiones, reintentos, telemetría y monitoreo.
 *
 * @param {String} taskName - Nombre de la tarea.
 * @param {Object} overrideParams - Parámetros para sobrescribir.
 * @param {String} serverKey - Conexión a utilizar.
 * @returns {Object} - { rowsAffected, recordset }
 */
async function executeNonDestructiveQuery(
  taskName,
  overrideParams = {},
  serverKey = "server1"
) {
  let connection = null;
  let task = null;

  // Crear AbortController para permitir cancelación
  const abortController = new AbortController();
  const { signal } = abortController;

  try {
    // Registrar uso de memoria inicial
    MemoryManager.logMemoryUsage(`NonDestructiveQuery-${taskName}-start`);

    // Iniciar medición de tiempo para telemetría
    Telemetry.startTimer(`query_nondestructive_${taskName}`);

    // 1) Buscar la tarea
    logger.info(`🔍 Buscando tarea no destructiva '${taskName}'...`);
    task = await TransferTask.findOne({ name: taskName });

    if (!task) {
      throw new Error(`No se encontró la tarea con name="${taskName}"`);
    }

    if (!task.active) {
      throw new Error(`La tarea "${taskName}" está inactiva (active=false).`);
    }

    // 2) Validar que la query no contenga comandos destructivos,
    //    permitiendo MERGE/INSERT si se requiere.
    logger.debug(`Validando query no destructiva de la tarea '${taskName}'...`);
    validateNonDestructiveQuery(task.query);

    // 3) Registrar la tarea en el TaskTracker
    TaskTracker.registerTask(task._id, abortController, {
      type: "nonDestructiveQuery",
      serverKey,
      taskName,
    });

    // 4) Marcar la tarea como "running"
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "running",
      progress: 0,
    });

    // 5) Verificar cancelación
    if (signal.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // 6) Obtener conexión con conexión robusta
    logger.info(
      `🔌 Estableciendo conexión a ${serverKey} para tarea no destructiva '${taskName}'...`
    );

    const connectionResult = await ConnectionManager.enhancedRobustConnect(
      serverKey
    );

    if (!connectionResult.success) {
      throw new Error(
        `No se pudo establecer conexión a ${serverKey}: ${
          connectionResult.error?.message || "Error desconocido"
        }`
      );
    }

    connection = connectionResult.connection;
    logger.info(
      `✅ Conexión establecida correctamente para tarea no destructiva '${taskName}'`
    );

    // 7) Construir la consulta final usando los parámetros
    let finalQuery = task.query.trim();
    const params = {};

    if (
      task.parameters &&
      Array.isArray(task.parameters) &&
      task.parameters.length > 0
    ) {
      const conditions = [];
      for (const param of task.parameters) {
        const fieldValue = Object.prototype.hasOwnProperty.call(
          overrideParams,
          param.field
        )
          ? overrideParams[param.field]
          : param.value;

        if (fieldValue === undefined || fieldValue === null) continue;

        if (param.operator === "BETWEEN") {
          if (fieldValue.from === undefined || fieldValue.to === undefined)
            continue;

          // Convertir a string para tedious
          const fromValue =
            fieldValue.from === null ? null : String(fieldValue.from);
          const toValue = fieldValue.to === null ? null : String(fieldValue.to);

          params[`${param.field}_from`] = fromValue;
          params[`${param.field}_to`] = toValue;
          conditions.push(
            `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
          );
        } else if (param.operator === "IN") {
          const arr = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          if (arr.length === 0) {
            // Si el array está vacío, forzamos la condición para que la query retorne 0 filas.
            conditions.push("1=0");
          } else {
            // Convertir a string para tedious
            const placeholders = arr.map((v, i) => {
              const pName = `${param.field}_in_${i}`;
              // Asegurar valores string para tedious
              const safeValue = v === null ? null : String(v);
              params[pName] = safeValue;
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          // Asegurar valores string para LIKE
          const safeValue = fieldValue === null ? null : String(fieldValue);
          params[param.field] = safeValue;
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          // Convertir a string para compatibilidad con tedious si no es número
          const safeValue =
            fieldValue === null
              ? null
              : typeof fieldValue === "number"
              ? fieldValue
              : String(fieldValue);
          params[param.field] = safeValue;
          conditions.push(`${param.field} ${param.operator} @${param.field}`);
        }
      }

      if (conditions.length > 0) {
        if (!/where/i.test(finalQuery)) {
          finalQuery += " WHERE " + conditions.join(" AND ");
        } else {
          finalQuery += " AND " + conditions.join(" AND ");
        }
      }
    }

    logger.info(`🔄 Ejecutando query no-destructivo para '${taskName}'`);
    logger.debug(
      `Query: ${finalQuery.substring(0, 500)}${
        finalQuery.length > 500 ? "..." : ""
      }`
    );

    // 8) Verificar cancelación de nuevo
    if (signal.aborted) {
      throw new Error("Tarea cancelada por el usuario");
    }

    // 9) Ejecutar la consulta con reintentos automáticos
    let result;
    try {
      // Usar RetryService para ejecutar con reintentos
      result = await queryRetryService.execute(
        async (attempt) => {
          // Si es un reintento, verificar conexión y reconectar si es necesario
          if (attempt > 0) {
            try {
              await DatabaseServiceAdapter.query(connection, "SELECT 1 AS test");
            } catch (connError) {
              logger.warn(
                `Conexión perdida para tarea no destructiva '${taskName}', reconectando...`
              );

              // Liberar la conexión actual
              try {
                await ConnectionManager.releaseConnection(connection);
              } catch (e) {}

              // Obtener nueva conexión
              const reconnectResult =
                await ConnectionManager.enhancedRobustConnect(serverKey);

              if (!reconnectResult.success) {
                throw new Error(
                  `No se pudo restablecer conexión: ${
                    reconnectResult.error?.message || "Error desconocido"
                  }`
                );
              }

              connection = reconnectResult.connection;
              logger.info(
                `✅ Reconexión exitosa para tarea no destructiva '${taskName}'`
              );
            }
          }

          // Usar SqlService para ejecutar la consulta con parámetros sanitizados
          const sanitizedParams = SqlService.sanitizeParams(params);
          return await DatabaseServiceAdapter.query(
            connection,
            finalQuery,
            sanitizedParams,
            serverKey
          );
        },
        {
          name: `consulta no destructiva '${taskName}'`,
          signal,
        }
      );

      // Registro para telemetría
      Telemetry.trackQuery(serverKey);
    } catch (error) {
      // Verificar si el error es por cancelación
      if (signal.aborted || error.message?.includes("cancelada")) {
        logger.info(`Tarea ${taskName} cancelada por el usuario`);
        await TransferTask.findByIdAndUpdate(task._id, {
          status: "cancelled",
          progress: -1,
          lastExecutionDate: new Date(),
          lastExecutionResult: {
            success: false,
            message: "Cancelada por el usuario",
          },
        });

        // Marcar como cancelada en el TaskTracker
        TaskTracker.completeTask(task._id, "cancelled");

        throw new Error("Transferencia cancelada por el usuario");
      }

      // Log detallado para errores de validación de parámetros
      if (error.code === "EPARAM") {
        logger.error(
          `Error de validación de parámetros en query no destructiva "${taskName}". Detalles:`,
          {
            message: error.message,
            cause: error.cause?.message,
            stack: error.stack,
            query: finalQuery,
            params: JSON.stringify(params),
          }
        );
      } else {
        logger.error(
          `Error ejecutando query no destructiva de "${taskName}":`,
          error
        );
      }

      await TransferTask.findByIdAndUpdate(task._id, {
        status: "failed",
        progress: -1,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: false,
          message: error.message || "Error desconocido",
          error: error.stack || "No stack trace disponible",
        },
      });

      // Marcar como fallida en el TaskTracker
      TaskTracker.completeTask(task._id, "failed");

      throw error;
    }

    // 10) Marcar la tarea como completada
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "completed",
      progress: 100,
      lastExecutionDate: new Date(),
      $inc: { executionCount: 1 },
      lastExecutionResult: {
        success: true,
        message: "Consulta no destructiva completada exitosamente",
        rowsAffected: result.rowsAffected || 0,
        recordCount: result.recordset?.length || 0,
      },
    });

    // Completar tarea en el TaskTracker
    TaskTracker.completeTask(task._id, "completed");

    // 11) Finalizar medición y actualizar métricas
    const queryTime = Telemetry.endTimer(`query_nondestructive_${taskName}`);
    Telemetry.updateAverage("avgQueryTime", queryTime);

    logger.info(
      `✅ Consulta no destructiva para '${taskName}' completada en ${queryTime}ms con ${
        result.rowsAffected || 0
      } filas afectadas`
    );

    // 12) Retornar el resultado
    return {
      rowsAffected: result.rowsAffected || 0,
      recordset: result.recordset || [],
      timingMs: queryTime,
    };
  } catch (error) {
    // Registrar error en telemetría
    Telemetry.trackQuery(serverKey, true);

    logger.error(
      `❌ Error en executeNonDestructiveQuery para tarea "${taskName}":`,
      error
    );

    throw error;
  } finally {
    // Registrar uso de memoria final
    MemoryManager.logMemoryUsage(`NonDestructiveQuery-${taskName}-end`);

    // Cerrar la conexión en el bloque finally para garantizar que se cierre incluso si hay errores
    try {
      if (connection) {
        await ConnectionManager.releaseConnection(connection);
        logger.debug(
          `✅ Conexión cerrada correctamente para consulta no destructiva '${taskName}'`
        );
      }
    } catch (closeError) {
      logger.error(
        `❌ Error al cerrar conexión para consulta no destructiva '${taskName}':`,
        closeError
      );
    }
  }
}

/**
 * Ejecuta una consulta dinámica con manejo de timeout para evitar bloqueos eternos
 * @param {String} taskName - Nombre de la tarea
 * @param {Object} overrideParams - Parámetros para sobrescribir
 * @param {String} serverKey - Servidor a utilizar
 * @param {Number} timeoutMs - Timeout en milisegundos (por defecto 5 minutos)
 * @returns {Promise} - Resultado de la consulta con timeout
 */
async function executeDynamicSelectWithTimeout(
  taskName,
  overrideParams = {},
  serverKey = "server1",
  timeoutMs = 300000 // 5 minutos por defecto
) {
  return Promise.race([
    executeDynamicSelect(taskName, overrideParams, serverKey),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Timeout de ${timeoutMs}ms superado para tarea ${taskName}`)
        );
      }, timeoutMs);
    }),
  ]);
}

module.exports = {
  executeDynamicSelect,
  executeNonDestructiveQuery,
  executeDynamicSelectWithTimeout,
};
