// services/dynamicQueryService.js

// Al importar mssql, extraemos el tipo NVarChar:
const sql = require("mssql");
const TransferTask = require("../models/transferTaks");
const { connectToDB } = require("./dbService");
const logger = require("./logger");

// Funciones de validación para evitar consultas destructivas.
const {
  validateSelectQueryOnly,
  validateNonDestructiveQuery,
} = require("../utils/validateQuery");

/**
 * Función de ayuda para verificar el estado de una transacción antes de intentar operaciones con ella
 */
function verificarTransaccion(transaction, transactionStarted) {
  if (!transaction) {
    throw new Error("Objeto de transacción no inicializado correctamente");
  }

  if (!transactionStarted) {
    throw new Error("La transacción no ha sido iniciada correctamente");
  }

  // Verificar si el adaptador tiene su propia forma de validar
  if (typeof transaction.isActive === "boolean" && !transaction.isActive) {
    throw new Error("La transacción ha sido marcada como inactiva o fallida");
  }

  return true;
}

/**
 * Mejora para iniciar una transacción con verificación y reintentos
 */
async function iniciarTransaccion(conexion, nombreOperacion = "operación") {
  try {
    // Verificar si la conexión está activa
    if (!conexion || !conexion.connected) {
      throw new Error(
        `La conexión no está activa para iniciar la transacción de ${nombreOperacion}`
      );
    }

    const transaction = conexion.transaction();
    await transaction.begin();

    return {
      transaction,
      transactionStarted: true,
    };
  } catch (error) {
    logger.error(
      `Error al iniciar la transacción para ${nombreOperacion}:`,
      error
    );
    throw new Error(
      `No se pudo iniciar la transacción para ${nombreOperacion}: ${error.message}`
    );
  }
}

/**
 * Mejora para confirmar una transacción con verificación
 */
async function confirmarTransaccion(
  transaction,
  transactionStarted,
  nombreOperacion = "operación"
) {
  if (!transaction || !transactionStarted) {
    logger.warn(
      `Intento de confirmar una transacción no iniciada para ${nombreOperacion}`
    );
    return false;
  }

  try {
    // Verificar explícitamente si la transacción puede confirmarse
    if (typeof transaction.isActive === "function" && !transaction.isActive()) {
      logger.warn(
        `La transacción no está en estado válido para confirmar para ${nombreOperacion} - omitiendo commit`
      );
      return false;
    }

    // Log para diagnóstico
    logger.debug(
      `Estado antes de commit (${nombreOperacion}) - transaction: ${!!transaction}, transactionStarted: ${transactionStarted}`
    );

    await transaction.commit();
    logger.debug(`Transacción de ${nombreOperacion} confirmada correctamente`);
    return true;
  } catch (error) {
    logger.error(
      `Error al confirmar la transacción de ${nombreOperacion}:`,
      error
    );

    // Intentar rollback automático tras fallo de commit
    try {
      await transaction.rollback();
      logger.debug(
        `Rollback automático de la transacción de ${nombreOperacion} tras fallo en commit`
      );
    } catch (rollbackError) {
      logger.warn(
        `No se pudo hacer rollback automático tras fallo en commit de ${nombreOperacion}:`,
        rollbackError
      );
    }

    throw error;
  }
}

/**
 * Mejora para revertir una transacción con manejo de errores mejorado
 */
async function revertirTransaccion(
  transaction,
  transactionStarted,
  nombreOperacion = "operación"
) {
  if (!transaction || !transactionStarted) {
    logger.debug(
      `No hay transacción activa para revertir en ${nombreOperacion}`
    );
    return;
  }

  try {
    await transaction.rollback();
    logger.debug(`Transacción de ${nombreOperacion} revertida correctamente`);
  } catch (error) {
    logger.warn(
      `Error al revertir la transacción de ${nombreOperacion}:`,
      error
    );
    // No propagamos el error para evitar bloqueos en cadenas de finally
  }
}

/**
 * Ejecuta una consulta SELECT usando la definición de la tarea almacenada en MongoDB,
 * sobrescribiendo sus parámetros con overrideParams (si se proporcionan).
 * Compatible con adaptador tedious.
 *
 * @param {String} taskName - Nombre de la tarea en la colección TransferTask.
 * @param {Object} overrideParams - Objeto con los valores que sobrescriben los parámetros guardados.
 *                                  Ejemplo: { Fecha: "2023-02-10", Vendedor: ["001", "002"] }
 * @param {String} serverKey - Ej: "server1" o "server2".
 * @returns {Array} - El recordset obtenido tras ejecutar el query.
 */
async function executeDynamicSelect(
  taskName,
  overrideParams = {},
  serverKey = "server1"
) {
  let pool = null;

  try {
    // 1) Buscar la tarea en MongoDB
    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      throw new Error(`No se encontró la tarea con name="${taskName}"`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${taskName}" está inactiva (active=false).`);
    }

    // 2) Validar que la query sea únicamente SELECT
    validateSelectQueryOnly(task.query);

    // 3) Marcar la tarea como "running"
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "running",
      progress: 0,
    });

    // 4) Conectarse a la base de datos con manejo mejorado de conexiones
    try {
      logger.debug(
        `Intentando conectar a ${serverKey} para consulta dinámica '${taskName}'...`
      );
      pool = await connectToDB(serverKey);

      if (!pool || !pool.connected) {
        throw new Error(
          `No se pudo establecer una conexión válida con ${serverKey}`
        );
      }

      logger.info(
        `Conexión establecida correctamente para consulta '${taskName}'`
      );
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para consulta '${taskName}':`,
        connError
      );
      await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
      throw new Error(
        `Error al establecer conexión de base de datos: ${connError.message}`
      );
    }

    const request = pool.request();
    request.timeout = 60000; // 60 segundos de timeout

    // 5) Construir la consulta final usando los parámetros definidos en la tarea
    let finalQuery = task.query.trim();
    if (
      task.parameters &&
      Array.isArray(task.parameters) &&
      task.parameters.length > 0
    ) {
      const conditions = [];
      for (const param of task.parameters) {
        // Se usa overrideParams si existe, de lo contrario se usa el valor por defecto.
        const fieldValue = Object.prototype.hasOwnProperty.call(
          overrideParams,
          param.field
        )
          ? overrideParams[param.field]
          : param.value;

        // Si no hay valor, se omite este parámetro.
        if (fieldValue === undefined || fieldValue === null) continue;

        if (param.operator === "BETWEEN") {
          if (fieldValue.from === undefined || fieldValue.to === undefined)
            continue;

          // Convertir a string para evitar problemas con tedious
          const fromValue =
            fieldValue.from === null ? null : String(fieldValue.from);
          const toValue = fieldValue.to === null ? null : String(fieldValue.to);

          request.input(`${param.field}_from`, fromValue);
          request.input(`${param.field}_to`, toValue);
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
              request.input(pName, safeValue);
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          // Asegurarse de que sea string para LIKE
          const safeValue = fieldValue === null ? null : String(fieldValue);
          request.input(param.field, safeValue);
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          // Convertir a string para garantizar compatibilidad con tedious
          const safeValue =
            fieldValue === null
              ? null
              : typeof fieldValue === "number"
              ? fieldValue
              : String(fieldValue);
          request.input(param.field, safeValue);
          conditions.push(`${param.field} ${param.operator} @${param.field}`);
        }
      }
      if (conditions.length > 0) {
        finalQuery += /where/i.test(finalQuery) ? " AND " : " WHERE ";
        finalQuery += conditions.join(" AND ");
      }
    }

    logger.info(
      `Ejecutando query dinámico SELECT para la tarea "${taskName}": ${finalQuery}`
    );

    // 6) Ejecutar el query
    let result;
    try {
      // Verificar que la conexión sigue activa antes de ejecutar
      if (!pool || !pool.connected) {
        throw new Error(
          `La conexión a ${serverKey} ya no está activa para ejecutar la consulta`
        );
      }

      result = await request.query(finalQuery);
    } catch (error) {
      logger.error(`Error ejecutando query de "${taskName}":`, error);

      // Log detallado para errores de validación de parámetros
      if (error.code === "EPARAM") {
        logger.error(
          `Error de validación de parámetros en query "${taskName}". Detalles del error:`,
          {
            message: error.message,
            cause: error.cause?.message,
            stack: error.stack,
            query: finalQuery,
            params: JSON.stringify(request.params),
          }
        );
      }

      await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
      throw error;
    }

    // 7) Marcar la tarea como completada
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "completed",
      progress: 100,
    });

    // 8) Retornar el recordset
    return result.recordset;
  } catch (error) {
    logger.error(
      `Error en executeDynamicSelect para tarea "${taskName}":`,
      error
    );
    throw error;
  } finally {
    // Cerrar la conexión en el bloque finally para garantizar que se cierre incluso si hay errores
    try {
      if (pool && pool.connected) {
        await pool.close();
        logger.debug(
          `Conexión cerrada correctamente para consulta '${taskName}'`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión para consulta '${taskName}':`,
        closeError
      );
    }
  }
}

/**
 * Ejecuta una consulta no destructiva (que puede incluir MERGE o INSERT),
 * pero valida que no contenga comandos peligrosos (DROP, TRUNCATE, etc.).
 * Compatible con adaptador tedious.
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
  let pool = null;
  let transaction = null;
  let transactionStarted = false;

  try {
    // 1) Buscar la tarea
    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      throw new Error(`No se encontró la tarea con name="${taskName}"`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${taskName}" está inactiva (active=false).`);
    }

    // 2) Validar que la query no contenga comandos destructivos,
    //    permitiendo MERGE/INSERT si se requiere.
    validateNonDestructiveQuery(task.query);

    // 3) Marcar la tarea como "running"
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "running",
      progress: 0,
    });

    // 4) Conectarse a la base de datos con manejo mejorado de conexiones
    try {
      logger.debug(
        `Intentando conectar a ${serverKey} para query no destructiva '${taskName}'...`
      );
      pool = await connectToDB(serverKey);

      if (!pool || !pool.connected) {
        throw new Error(
          `No se pudo establecer una conexión válida con ${serverKey}`
        );
      }

      logger.info(
        `Conexión establecida correctamente para query no destructiva '${taskName}'`
      );
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para query no destructiva '${taskName}':`,
        connError
      );
      await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
      throw new Error(
        `Error al establecer conexión de base de datos: ${connError.message}`
      );
    }

    // Iniciar una transacción para operaciones no destructivas usando la función helper
    try {
      const transactionData = await iniciarTransaccion(
        pool,
        `query no destructiva de ${taskName}`
      );
      transaction = transactionData.transaction;
      transactionStarted = transactionData.transactionStarted;
    } catch (txError) {
      logger.error(
        `Error al iniciar transacción para query no destructiva '${taskName}':`,
        txError
      );
      throw new Error(`No se pudo iniciar la transacción: ${txError.message}`);
    }

    const request = transaction.request();
    request.timeout = 60000; // 60 segundos de timeout

    // 5) Construir la consulta final (similar a executeDynamicSelect)
    let finalQuery = task.query.trim();
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

          request.input(`${param.field}_from`, fromValue);
          request.input(`${param.field}_to`, toValue);
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
              request.input(pName, safeValue);
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          // Asegurar valores string para LIKE
          const safeValue = fieldValue === null ? null : String(fieldValue);
          request.input(param.field, safeValue);
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          // Convertir a string para compatibilidad con tedious si no es número
          const safeValue =
            fieldValue === null
              ? null
              : typeof fieldValue === "number"
              ? fieldValue
              : String(fieldValue);
          request.input(param.field, safeValue);
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

    logger.info(
      `Ejecutando query no-destructivo para la tarea "${taskName}": ${finalQuery}`
    );

    // 6) Ejecutar la consulta
    let result;
    try {
      // Verificar que la transacción sigue activa con la función helper
      verificarTransaccion(transaction, transactionStarted);

      result = await request.query(finalQuery);
    } catch (error) {
      logger.error(`Error en query no-destructivo de "${taskName}":`, error);

      // Log detallado para errores de validación de parámetros
      if (error.code === "EPARAM") {
        logger.error(
          `Error de validación de parámetros en query no destructiva "${taskName}". Detalles del error:`,
          {
            message: error.message,
            cause: error.cause?.message,
            stack: error.stack,
            query: finalQuery,
            params: JSON.stringify(request.params),
          }
        );
      }

      // Revertir la transacción en caso de error usando la función helper
      await revertirTransaccion(
        transaction,
        transactionStarted,
        `query no destructiva de ${taskName}`
      );
      transactionStarted = false;

      await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
      throw error;
    }

    // Confirmar la transacción con la función helper
    await confirmarTransaccion(
      transaction,
      transactionStarted,
      `query no destructiva de ${taskName}`
    );
    transactionStarted = false;

    // 7) Marcar la tarea como completada
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "completed",
      progress: 100,
    });

    // 8) Retornar el resultado (por ejemplo, rowsAffected y recordset)
    return {
      rowsAffected: result.rowsAffected,
      recordset: result.recordset,
    };
  } catch (error) {
    logger.error(
      `Error en executeNonDestructiveQuery para tarea "${taskName}":`,
      error
    );
    throw error;
  } finally {
    // Asegurarse de que la transacción está cerrada usando la función helper
    if (transaction && transactionStarted) {
      await revertirTransaccion(
        transaction,
        transactionStarted,
        `query no destructiva de ${taskName} (finally)`
      );
    }

    // Cerrar la conexión
    try {
      if (pool && pool.connected) {
        await pool.close();
        logger.debug(
          `Conexión cerrada correctamente para query no destructiva '${taskName}'`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión para query no destructiva '${taskName}':`,
        closeError
      );
    }
  }
}

module.exports = {
  executeDynamicSelect,
  executeNonDestructiveQuery,
  // Exportar también las funciones helper por si se necesitan en otros módulos
  verificarTransaccion,
  iniciarTransaccion,
  confirmarTransaccion,
  revertirTransaccion,
};
