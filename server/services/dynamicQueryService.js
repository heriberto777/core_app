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

const { NVarChar } = sql;

/**
 * Ejecuta una consulta SELECT usando la definición de la tarea almacenada en MongoDB,
 * sobrescribiendo sus parámetros con overrideParams (si se proporcionan).
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
          request.input(`${param.field}_from`, fieldValue.from);
          request.input(`${param.field}_to`, fieldValue.to);
          conditions.push(
            `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
          );
        } else if (param.operator === "IN") {
          const arr = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          if (arr.length === 0) {
            conditions.push("1=0");
          } else {
            const placeholders = arr.map((v, i) => {
              const pName = `${param.field}_in_${i}`;
              // Especifica el tipo y longitud; en este ejemplo usamos NVarChar(10)
              request.input(pName, NVarChar(10), v);
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          request.input(param.field, fieldValue);
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          request.input(param.field, fieldValue);
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

    // Iniciar una transacción para operaciones no destructivas
    try {
      transaction = pool.transaction();
      await transaction.begin();
      transactionStarted = true;
      logger.debug(
        `Transacción iniciada correctamente para query no destructiva '${taskName}'`
      );
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
          request.input(`${param.field}_from`, fieldValue.from);
          request.input(`${param.field}_to`, fieldValue.to);
          conditions.push(
            `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
          );
        } else if (param.operator === "IN") {
          const arr = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          if (arr.length === 0) {
            // Si el array está vacío, forzamos la condición para que la query retorne 0 filas.
            conditions.push("1=0");
          } else {
            const placeholders = arr.map((v, i) => {
              const pName = `${param.field}_in_${i}`;
              // Especifica el tipo y la longitud (aquí usamos NVarChar(10) como ejemplo)
              request.input(pName, NVarChar(10), v);
              return `@${pName}`;
            });
            conditions.push(`${param.field} IN (${placeholders.join(", ")})`);
          }
        } else if (param.operator === "LIKE") {
          request.input(param.field, fieldValue);
          conditions.push(`${param.field} LIKE @${param.field}`);
        } else {
          request.input(param.field, fieldValue);
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
      // Verificar que la transacción sigue activa
      if (
        !transaction ||
        !transactionStarted ||
        (typeof transaction.isActive === "function" && !transaction.isActive())
      ) {
        throw new Error(
          "La transacción no está activa para ejecutar la consulta"
        );
      }

      result = await request.query(finalQuery);
    } catch (error) {
      logger.error(`Error en query no-destructivo de "${taskName}":`, error);

      // Revertir la transacción en caso de error
      if (transaction && transactionStarted) {
        try {
          await transaction.rollback();
          logger.debug(
            `Transacción revertida por error en query no destructiva '${taskName}'`
          );
          transactionStarted = false;
        } catch (rollbackError) {
          logger.error(
            `Error al revertir transacción para '${taskName}':`,
            rollbackError
          );
        }
      }

      await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
      throw error;
    }

    // Confirmar la transacción con verificación mejorada
    if (transaction && transactionStarted) {
      try {
        // Verificar explícitamente si la transacción puede confirmarse
        if (
          typeof transaction.isActive === "function" &&
          !transaction.isActive()
        ) {
          logger.warn(
            `La transacción no está en estado válido para confirmar en '${taskName}' - omitiendo commit`
          );
          transactionStarted = false;
        } else {
          // Log para diagnóstico
          logger.debug(
            `Estado antes de commit para '${taskName}' - transaction: ${!!transaction}, transactionStarted: ${transactionStarted}`
          );

          await transaction.commit();
          logger.debug(
            `Transacción confirmada correctamente para '${taskName}'`
          );
          transactionStarted = false;
        }
      } catch (commitError) {
        logger.error(
          `Error al confirmar transacción para '${taskName}': ${commitError.message}`
        );

        // Intentar revertir en caso de error de commit
        try {
          await transaction.rollback();
          logger.debug(
            `Transacción revertida después de error en commit para '${taskName}'`
          );
        } catch (rollbackError) {
          logger.warn(
            `Error al revertir después de fallo en commit para '${taskName}': ${rollbackError.message}`
          );
        }

        transactionStarted = false;
        throw commitError; // Propagar el error original
      }
    }

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
    // Asegurarse de que la transacción está cerrada
    if (transaction && transactionStarted) {
      try {
        await transaction.rollback();
        logger.debug(
          `Transacción revertida en bloque finally para '${taskName}'`
        );
      } catch (rollbackError) {
        logger.error(
          `Error al revertir transacción en finally para '${taskName}':`,
          rollbackError
        );
      }
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
};
