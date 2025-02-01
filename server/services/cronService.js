const cron = require("node-cron");
const logger = require("./logger");
const { runSequentialTransfers } = require("./transferService");
// const { runTransfers } = require("./transferManager"); // Usa el manejador secuencial
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

      // Asegurar que runSequentialTransfers es un array
      if (!Array.isArray(runSequentialTransfers)) {
        throw new Error("runSequentialTransfers no es un array válido");
      }

      const results = [];

      // Ejecutar transferencias secuenciales
      for (const task of runSequentialTransfers) {
        logger.info(`Ejecutando transferencia: ${task.name}`);
        const result = await task.execute(() => {});
        results.push({ name: task.name, ...result });
      }

      logger.info("Transferencias programadas completadas");

      // Construir el cuerpo del mensaje con los resultados
      const successMessage = results
        .map(
          (result, index) =>
            `<li><strong>Transfer ${index + 1} - ${result.name}:</strong> ${
              result.success
                ? `Éxito (${result.rows} filas transferidas)`
                : `Error (${result.message})`
            }</li>`
        )
        .join("");

      const emailBody = `
        <p><strong>Transferencias Completadas</strong></p>
        <ul>${successMessage}</ul>
        <p>Las transferencias programadas se realizaron con los resultados indicados arriba.</p>
      `;

      // Notificar éxito
      await sendEmail(
        "heriberto777@gmail.com",
        "Transferencia de datos - Informe Detallado",
        `La transferencia de datos fue exitosa.`,
        emailBody
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
