const logger = require("./logger");
const { getTransferTasks } = require("./transferService"); // Obtiene las tareas activas

/**
 * 📌 Ejecuta las transferencias de forma secuencial
 */
const runSequentialTransfers = async () => {
  try {
    const transferTasks = await getTransferTasks(); // Cargar tareas activas desde MongoDB

    console.log(transferTasks);

    if (!transferTasks.length) {
      logger.warn("⚠️ No hay tareas activas para ejecutar.");
      return;
    }

    logger.info(
      `🔄 Iniciando ejecución secuencial de ${transferTasks.length} tareas...`
    );

    for (const task of transferTasks) {
      logger.info(`🚀 Ejecutando transferencia: ${task.name}`);

      try {
        await task.execute(() => {}); // Ejecutar la transferencia con callback vacío
        logger.info(`✅ Transferencia completada: ${task.name}`);
      } catch (error) {
        logger.error(
          `❌ Error en la transferencia ${task.name}: ${error.message}`
        );
      }
    }

    logger.info("✅ Todas las transferencias secuenciales han finalizado.");
  } catch (error) {
    logger.error(
      "❌ Error en la ejecución secuencial de transferencias",
      error
    );
  }
};

module.exports = { runSequentialTransfers };
