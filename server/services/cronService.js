const cron = require("node-cron");
const logger = require("./logger");
const { runTransfers } = require("./transferManager"); // Usa el manejador secuencial
const { sendEmail } = require("./emailService");

let task;
let isRunning = false;

const startCronJob = (interval) => {
  if (task) {
    task.stop();
  }

  task = cron.schedule(`*/${interval} * * * *`, async () => {
    console.log(
      `Ejecutando transferencia programada cada ${interval} minutos...`
    );

    if (isRunning) {
      logger.warn("El proceso de transferencia ya está en ejecución");
      return;
    }

    isRunning = true;

    try {
      logger.info("Iniciando transferencias programadas...");
      await runTransfers(); // Ejecuta todas las transferencias secuencialmente
      logger.info("Transferencias programadas completadas");

      // Notificar éxito
      await sendEmail(
        "heriberto777@gmail.com",
        "Transferencia de datos",
        `La transferencia de datos fue exitosa.`,
        `<p><strong>Transferencias Completadas</strong></p>
                <p>Las transferencias programadas se realizaron exitosamente.</p>`
      );
    } catch (error) {
      logger.error("Error en las transferencias programadas:", {
        message: error.message,
      });

      // Notificar error
      await sendEmail(
        "heriberto777@gmail.com",
        "Error en Transferencia de Datos",
        `Hubo un error durante la transferencia de datos.\nError: ${error.message}`,
        `<p><strong>Error en Transferencia</strong></p><p>Error: ${error.message}</p>`
      );
    } finally {
      isRunning = false;
    }
  });

  task.start();
  console.log(`Tarea programada para ejecutarse cada ${interval} minutos.`);
};

module.exports = { startCronJob };
