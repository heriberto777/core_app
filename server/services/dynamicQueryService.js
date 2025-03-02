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
  const pool = await connectToDB(serverKey);
  const request = pool.request();

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
  const pool = await connectToDB(serverKey);
  const request = pool.request();

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
    result = await request.query(finalQuery);
  } catch (error) {
    logger.error(`Error en query no-destructivo de "${taskName}":`, error);
    await TransferTask.findByIdAndUpdate(task._id, { status: "failed" });
    throw error;
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
}

module.exports = {
  executeDynamicSelect,
  executeNonDestructiveQuery,
};
