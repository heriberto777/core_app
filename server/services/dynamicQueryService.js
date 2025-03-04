// services/dynamicQueryService-tedious.js
const TransferTask = require("../models/transferTaks");
const { connectToDB, closeConnection } = require("./dbService");
const { SqlService } = require("./tediousService");
const logger = require("./logger");

// Funciones de validación para evitar consultas destructivas.
const {
  validateSelectQueryOnly,
  validateNonDestructiveQuery,
} = require("../utils/validateQuery");

/**
 * Ejecuta una consulta SELECT usando la definición de la tarea almacenada en MongoDB,
 * sobrescribiendo sus parámetros con overrideParams (si se proporcionan).
 * Compatible con adaptador tedious.
 *
 * @param {String} taskName - Nombre de la tarea en la colección TransferTask.
 * @param {Object} overrideParams - Objeto con los valores que sobrescriben los parámetros guardados.
 * @param {String} serverKey - Ej: "server1" o "server2".
 * @returns {Array} - El recordset obtenido tras ejecutar el query.
 */
async function executeDynamicSelect(
  taskName,
  overrideParams = {},
  serverKey = "server1"
) {
  let connection = null;

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

    // 4) Conectarse a la base de datos
    try {
      logger.debug(
        `Intentando conectar a ${serverKey} para consulta dinámica '${taskName}'...`
      );
      connection = await connectToDB(serverKey);

      if (!connection) {
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

    // 5) Construir la consulta final usando los parámetros definidos en la tarea
    let finalQuery = task.query.trim();
    const params = {};

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

    logger.info(
      `Ejecutando query dinámico SELECT para la tarea "${taskName}": ${finalQuery}`
    );

    // 6) Ejecutar el query
    let result;
    try {
      result = await SqlService.query(connection, finalQuery, params);
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
            params: JSON.stringify(params),
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
      if (connection) {
        await closeConnection(connection);
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
 * Compatibilidad completa con adaptador tedious.
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

    // 4) Conectarse a la base de datos
    try {
      logger.debug(
        `Intentando conectar a ${serverKey} para query no destructiva '${taskName}'...`
      );
      connection = await connectToDB(serverKey);

      if (!connection) {
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

    // 5) Construir la consulta final
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

    logger.info(
      `Ejecutando query no-destructivo para la tarea "${taskName}": ${finalQuery}`
    );

    // 6) Ejecutar la consulta
    let result;
    try {
      result = await SqlService.query(connection, finalQuery, params);
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
            params: JSON.stringify(params),
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

    // 8) Retornar el resultado
    return {
      rowsAffected: result.rowsAffected || 0,
      recordset: result.recordset || [],
    };
  } catch (error) {
    logger.error(
      `Error en executeNonDestructiveQuery para tarea "${taskName}":`,
      error
    );
    throw error;
  } finally {
    // Cerrar la conexión
    try {
      if (connection) {
        await closeConnection(connection);
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
