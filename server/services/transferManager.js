const logger = require("../services/logger");
const { transferClientes, transferProductos } = require("./transferService");

const runTransfers = async () => {
  const tasks = [
    { id: 1, name: "Transferencia de Clientes", task: transferClientes },
    // { id: 2, name: "Transferencia de Productos", task: transferProductos },
  ];

  for (const { id, name, task } of tasks) {
    logger.info(`Iniciando ${name} (ID: ${id})`);
    try {
      const result = await task();
      logger.info(`${name} completada`, {
        metadata: { id, name, rowsTransferred: result.rows },
      });
    } catch (error) {
      logger.error(`Error en ${name} (ID: ${id}):`, {
        metadata: { id, name, error: error.message },
      });
      throw new Error(`Fallo en ${name}: ${error.message}`);
    }
  }

  logger.info("Todas las transferencias completadas");
};

module.exports = { runTransfers };
