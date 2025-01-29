const logger = require("../services/logger");
const {
  transferClientes,
  transferaccounts_agrupation1,
  transferaccounts_agrupation2,
  transferaccounts_agrupation3,
  transferaccounts_credit,
  transferpayment_termt,
  transferproducts,
  transferproducts_hierarchy2,
  transferproducts_hierarchy3,
  transferproducts_hierarchy4,
  transferproducts_measure,
  transfercollections_pending,
  transferhist_orders,
  transfertrucks,
} = require("./transferService");

const runTransfers = async () => {
  const tasks = [
    { id: 1, name: "Transferencia de Clientes", task: transferClientes },
    {
      id: 2,
      name: "Transferencia de accounts_agrupation1",
      task: transferaccounts_agrupation1,
    },
    {
      id: 3,
      name: "Transferencia de accounts_agrupation2",
      task: transferaccounts_agrupation2,
    },
    {
      id: 4,
      name: "Transferencia de accounts_agrupation3",
      task: transferaccounts_agrupation3,
    },
    {
      id: 5,
      name: "Transferencia de accounts_credit",
      task: transferaccounts_credit,
    },
    {
      id: 6,
      name: "Transferencia de payment_termt",
      task: transferpayment_termt,
    },
    {
      id: 7,
      name: "Transferencia de products",
      task: transferproducts,
    },
    {
      id: 8,
      name: "Transferencia de products_hierarchy2",
      task: transferproducts_hierarchy2,
    },
    {
      id: 9,
      name: "Transferencia de products_hierarchy3",
      task: transferproducts_hierarchy3,
    },
    {
      id: 10,
      name: "Transferencia de products_hierarchy4",
      task: transferproducts_hierarchy4,
    },
    {
      id: 11,
      name: "Transferencia de products_measure",
      task: transferproducts_measure,
    },
    {
      id: 12,
      name: "Transferencia de collections_pending",
      task: transfercollections_pending,
    },
    {
      id: 13,
      name: "Transferencia de hist_orders",
      task: transferhist_orders,
    },
    {
      id: 14,
      name: "Transferencia de trucks",
      task: transfertrucks,
    },
  ];

  const results = []; // Array para almacenar los resultados de las transferencias

  for (const { id, name, task } of tasks) {
    logger.info(`Iniciando ${name} (ID: ${id})`);
    const startTime = Date.now();
    try {
      const result = await task(); // Ejecuta la tarea
      const duration = Date.now() - startTime; // Calcula la duración
      logger.info(`${name} completada`, {
        metadata: { id, name, rowsTransferred: result.rows, duration },
      });

      results.push({
        id,
        name, // Asegúrate de pasar el nombre aquí
        success: true,
        rowsTransferred: result.rows || 0,
        duration,
        errorMessage: null,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Error en ${name} (ID: ${id}):`, {
        metadata: { id, name, error: error.message, duration },
      });

      results.push({
        id,
        name, // Asegúrate de pasar el nombre aquí
        success: false,
        rowsTransferred: 0,
        duration,
        errorMessage: error.message,
      });
    }
  }

  logger.info("Todas las transferencias completadas");
  return results;
};

module.exports = { runTransfers };
