const cron = require("node-cron");
const logger = require("./logger");
const { sendEmail } = require("./emailService");

let task;
let isRunning = false;
let transferService; // Se inicializará con importación diferida

/**
 * Inicia el trabajo programado para ejecutar transferencias
 * @param {string} hour - Hora de ejecución en formato "HH:MM"
 */
const startCronJob = (hour) => {
  // Importación diferida para evitar dependencia circular
  if (!transferService) {
    transferService = require("./transferService");
  }

  if (task) {
    task.stop();
  }

  const [hh, mm] = hour.split(":");

  task = cron.schedule(`${mm} ${hh} * * *`, async () => {
    if (isRunning) {
      logger.warn("⚠️ El proceso de transferencia ya está en ejecución");
      return;
    }

    isRunning = true;
    let results = [];

    try {
      logger.info("🔄 Iniciando transferencias programadas...");

      const tasks = await transferService.getTransferTasks();
      logger.debug(
        "Tareas activas para el cronservices -> ",
        tasks.map((t) => t.name)
      );

      if (!tasks.length) {
        throw new Error("❌ No hay transferencias definidas para ejecutar.");
      }

      // 🔄 **Ejecución SECUENCIAL de las transferencias**
      for (const task of tasks) {
        if (!task.active) {
          logger.warn(`⚠️ La tarea ${task.name} está inactiva. Omitiendo.`);
          continue;
        }

        logger.info(`🚀 Ejecutando transferencia programada: ${task.name}`);

        let result;
        try {
          if (task.transferType === "up") {
            result = await transferService.executeTransferUp(task._id);
          } else if (task.transferType === "down") {
            result = await transferService.executeTransferDown(task._id);
          } else {
            result = await transferService.executeTransfer(task._id);
          }
        } catch (error) {
          logger.error(`❌ Error en la transferencia ${task.name}:`, error);
          result = {
            success: false,
            message: "Error en la ejecución de la transferencia",
            errorDetail: error.message || String(error),
          };
        }

        // Formato unificado para resultados
        results.push({
          name: task.name,
          success: result.success,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          duplicates: result.duplicates || 0,
          rows: result.rows || 0,
          message: result.message || "Transferencia completada",
          errorDetail: result.errorDetail || "N/A",
          initialCount: result.initialCount,
          finalCount: result.finalCount,
          duplicatedRecords: result.duplicatedRecords || [],
          hasMoreDuplicates: result.hasMoreDuplicates || false,
          totalDuplicates: result.totalDuplicates || 0,
        });

        logger.info(`✅ Transferencia completada: ${task.name}`, result);
      }

      logger.info("✅ Todas las transferencias programadas completadas");

      // 📩 **Construcción del mensaje con detalles mejorados**
      const successResults = results.filter((r) => r.success);
      const failedResults = results.filter((r) => !r.success);

      let emailHtmlBody = `
        <h2>Resultado de las transferencias programadas</h2>
        <p><strong>Resumen:</strong> ${successResults.length} exitosas, ${failedResults.length} fallidas</p>
        <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Transferencia</th>
            <th>Estado</th>
            <th>Registros</th>
            <th>Insertados</th>
            <th>Duplicados</th>
            <th>Detalles</th>
          </tr>
      `;

      results.forEach((result) => {
        emailHtmlBody += `
          <tr>
            <td><strong>${result.name}</strong></td>
            <td style="text-align: center;">${result.success ? "✅" : "❌"}</td>
            <td style="text-align: right;">${result.rows}</td>
            <td style="text-align: right;">${result.inserted}</td>
            <td style="text-align: right;">${result.duplicates || 0}</td>
            <td>${
              result.success ? "Completada" : `Error: ${result.errorDetail}`
            }</td>
          </tr>
        `;
      });

      emailHtmlBody += `</table>`;

      // Información adicional en el correo
      if (failedResults.length > 0) {
        emailHtmlBody += `
          <h3>Detalles de errores</h3>
          <ul>
            ${failedResults
              .map(
                (err) =>
                  `<li><strong>${err.name}:</strong> ${err.errorDetail}</li>`
              )
              .join("")}
          </ul>
        `;
      }

      // Agregar secciones para los duplicados de cada transferencia
      const resultsWithDuplicates = results.filter(
        (result) =>
          result.duplicates > 0 &&
          result.duplicatedRecords &&
          result.duplicatedRecords.length > 0
      );

      if (resultsWithDuplicates.length > 0) {
        emailHtmlBody += `<h2>Detalle de registros duplicados por transferencia</h2>`;

        for (const result of resultsWithDuplicates) {
          // Obtener los nombres de columnas de los registros duplicados
          const sampleRecord = result.duplicatedRecords[0];
          const columns = Object.keys(sampleRecord).filter(
            (key) => !key.startsWith("_")
          );

          emailHtmlBody += `
            <h3>Transferencia: ${result.name} ${
            result.hasMoreDuplicates
              ? `(primeros ${result.duplicatedRecords.length} de ${result.totalDuplicates} duplicados)`
              : `(${result.duplicates} duplicados)`
          }</h3>
            <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
              <tr style="background-color: #f2f2f2;">
                ${columns.map((col) => `<th>${col}</th>`).join("")}
              </tr>
          `;

          // Añadir filas para cada registro duplicado
          result.duplicatedRecords.forEach((record) => {
            emailHtmlBody += `
              <tr>
                ${columns
                  .map((col) => {
                    // Formatear el valor según su tipo
                    let value = record[col];
                    if (value === null || value === undefined) {
                      return '<td style="color: #999;">NULL</td>';
                    } else if (
                      typeof value === "object" &&
                      value instanceof Date
                    ) {
                      return `<td>${value.toLocaleString()}</td>`;
                    } else if (typeof value === "number") {
                      return `<td style="text-align: right;">${value}</td>`;
                    } else {
                      // Truncar textos muy largos
                      const strValue = String(value);
                      return `<td>${
                        strValue.length > 50
                          ? strValue.substring(0, 47) + "..."
                          : strValue
                      }</td>`;
                    }
                  })
                  .join("")}
              </tr>
            `;
          });

          emailHtmlBody += `</table>`;

          // Agregar nota si hay más registros
          if (result.hasMoreDuplicates) {
            emailHtmlBody += `
              <p><em>Nota: Se muestran solo los primeros ${result.duplicatedRecords.length} de ${result.totalDuplicates} registros duplicados omitidos.</em></p>
            `;
          }
        }
      }

      emailHtmlBody += `<p>Ejecutado automáticamente a las ${hour}.</p>`;

      // Texto plano para clientes que no muestran HTML
      let emailTextBody = `Resultado de transferencias programadas (${successResults.length} exitosas, ${failedResults.length} fallidas):\n\n`;

      results.forEach((result) => {
        emailTextBody += `- ${result.name}: ${
          result.success ? "Éxito" : "Error"
        } - ${result.rows} registros, ${result.inserted} insertados, ${
          result.duplicates || 0
        } duplicados\n`;
        if (!result.success) {
          emailTextBody += `  Error: ${result.errorDetail}\n`;
        }
      });

      // 📩 Notificar resultado por correo
      await sendEmail(
        "heriberto777@gmail.com",
        failedResults.length === 0
          ? "✅ Transferencias Automáticas Completadas con Éxito"
          : `⚠️ Transferencias Automáticas: ${failedResults.length} errores`,
        emailTextBody,
        emailHtmlBody
      );

      logger.info(
        `📧 Correo de resultados enviado para ${results.length} transferencias automáticas`
      );
    } catch (error) {
      logger.error("❌ Error en las transferencias programadas:", {
        message: error.message,
      });

      // 📩 **Correo con error crítico**
      await sendEmail(
        "heriberto777@gmail.com",
        "🚨 Error Crítico en Transferencias Automáticas",
        `Hubo un error crítico durante la ejecución.\nError: ${error.message}`,
        `<p><strong>Error Crítico en Transferencias Automáticas</strong></p>
         <p>Se produjo un error que impidió la ejecución normal de las transferencias programadas.</p>
         <p><strong>Mensaje de error:</strong> ${error.message}</p>
         <p><strong>Hora programada:</strong> ${hour}</p>`
      );

      logger.info(`📧 Correo de error crítico enviado`);
    } finally {
      isRunning = false;
    }
  });

  task.start();
  logger.info(`🕒 Transferencias programadas diariamente a las ${hour}`);
};

module.exports = { startCronJob };
