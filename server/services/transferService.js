const logger = require("./logger");
const { connectToServer1, connectToServer2 } = require("./dbService");
const retry = require("../utils/retry");
const { validateData } = require("./validator");
// const { addTransferTask } = require("./queueService");
const validationRules = require("./validationRules");
const queries = require("../queries/queries"); // Obtenemos todas las consultas SQL

const failedTransfers = []; // Lista de transferencias fallidas

/**
 * Ejecuta una transferencia de datos desde el servidor 1 al servidor 2
 * @param {string} name - Nombre de la tabla
 * @param {function} updateProgress - Callback para actualizar el progreso
 */
const executeTransfer = async (name, updateProgress) => {
  return await retry(
    async () => {
      const taskName = `Transferencia de ${name}`;
      const queryObj = queries.find((q) => q.name === name);

      if (!queryObj) {
        logger.error(`${taskName}: Consulta no encontrada`);
        return { success: false, message: "Consulta no encontrada", rows: 0 };
      }

      const { query } = queryObj;
      const server1Pool = await connectToServer1();
      const server2Pool = await connectToServer2();

      logger.info(`${taskName}: Obteniendo datos de origen...`);
      const result = await server1Pool.request().query(query);
      const data = result.recordset;

      if (data.length === 0) {
        logger.warn(`${taskName}: No hay datos para transferir`);
        return {
          success: true,
          message: "No hay datos para transferir",
          rows: 0,
        };
      }

      if (!validationRules[name]) {
        logger.error(`${taskName}: Reglas de validación no definidas`);
        return {
          success: false,
          message: "Faltan reglas de validación",
          rows: 0,
        };
      }

      const { validData } = await validateData(
        data,
        validationRules[name],
        server2Pool
      );

      if (validData.length === 0) {
        logger.warn(`${taskName}: Todos los registros son inválidos`);
        return {
          success: false,
          message:
            "No se transfirieron registros debido a errores de validación",
          rows: 0,
        };
      }

      const transaction = server2Pool.transaction();
      await transaction.begin();

      let processed = 0;
      for (const record of validData) {
        const request = transaction.request();
        Object.keys(record).forEach((key) => request.input(key, record[key]));

        await request.query(`INSERT INTO dbo.${name} (${Object.keys(
          record
        ).join(", ")})
                                VALUES (${Object.keys(record)
                                  .map((k) => "@" + k)
                                  .join(", ")})`);

        processed++;
        updateProgress(Math.round((processed / validData.length) * 100));
      }

      await transaction.commit();
      logger.info(`${taskName}: Transferencia completada exitosamente.`);

      // Si la transferencia es exitosa, eliminarla de la lista de fallos
      const index = failedTransfers.indexOf(name);
      if (index !== -1) failedTransfers.splice(index, 1);

      return {
        success: true,
        message: "Transferencia completada",
        rows: validData.length,
      };
    },
    3,
    3000,
    `Transferencia de ${name}`
  ).catch((error) => {
    logger.error(`${name} ha fallado y se registra en la lista de errores`);
    // Agregar la transferencia fallida a la lista si no está ya registrada
    if (!failedTransfers.includes(name)) {
      failedTransfers.push(name);
    }
    return {
      success: false,
      message: "Error en la transferencia",
      error: error.message,
    };
  });
};

// 📌 Generar las tareas de transferencia en formato de array para ejecutar secuencialmente
const runSequentialTransfers = queries.map(({ name }) => ({
  name,
  execute: (updateProgress) => executeTransfer(name, updateProgress),
}));

module.exports = { runSequentialTransfers };
