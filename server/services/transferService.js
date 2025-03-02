/*******************************************************
 * services/transferService.js
 *******************************************************/

const retry = require("./retry");
const { connectToDB } = require("./dbService");
const TransferTask = require("../models/transferTaks");
const logger = require("./logger");

// IMPORTANTE: Importar la función para SSE
const { sendProgress } = require("./progressSse");
const { sendEmail } = require("./emailService");

/**
 * 📌 Obtiene la clave primaria de la tabla desde validationRules.
 */
function getPrimaryKey(validationRules) {
  if (!validationRules || !validationRules.existenceCheck) {
    throw new Error("⚠️ Clave primaria no definida en validationRules.");
  }
  return validationRules.existenceCheck.key;
}

/**
 * 📌 Obtiene la longitud máxima permitida de una columna en SQL Server.
 */
async function getColumnMaxLength(tableName, columnName, pool) {
  const query = `
    SELECT CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = '${tableName}' 
      AND COLUMN_NAME = '${columnName}'
  `;
  const result = await pool.request().query(query);
  return result.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
}

/**
 * 📌 Obtiene todas las tareas activas desde MongoDB (type: auto o both).
 */
async function getTransferTasks() {
  const tasks = await TransferTask.find({
    active: true,
    type: { $in: ["auto", "both"] },
  });

  return tasks.map((task) => ({
    name: task.name,
    status: task.status,
    progress: task.progress,
    active: task.active,
    _id: task._id,
    execute: (updateProgress) => executeTransfer(task._id, updateProgress),
  }));
}

/**
 * 📌 Ejecuta una transferencia manualmente y envía resultados detallados por correo.
 * Incluye tabla con información de registros duplicados.
 */
async function executeTransferManual(taskId) {
  logger.info(`🔄 Ejecutando transferencia manual: ${taskId}`);

  try {
    const task = await TransferTask.findById(taskId);
    if (!task) {
      logger.error(`❌ No se encontró la tarea con ID: ${taskId}`);
      return { success: false, message: "Tarea no encontrada" };
    }

    if (!task.active) {
      logger.warn(`⚠️ La tarea ${task.name} está inactiva.`);
      return { success: false, message: "Tarea inactiva" };
    }

    // 🔄 Determinar qué tipo de transferencia ejecutar
    let result;
    if (task.transferType === "up") {
      logger.info(`📌 Ejecutando transferencia UP para la tarea: ${task.name}`);
      result = await executeTransferUp(taskId);
    } else if (task.transferType === "down") {
      logger.info(
        `📌 Ejecutando transferencia DOWN para la tarea: ${task.name}`
      );
      result = await executeTransferDown(taskId);
    } else {
      logger.info(
        `📌 Ejecutando transferencia GENERAL para la tarea: ${task.name}`
      );
      result = await executeTransfer(taskId);
    }

    // Preparar datos para el correo
    const formattedResult = {
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
    };

    // 📩 Construir el mensaje de correo
    let emailSubject = result.success
      ? `✅ Transferencia Manual Completada: ${task.name}`
      : `⚠️ Error en Transferencia Manual: ${task.name}`;

    let emailTextBody = `Se ha ejecutado manualmente la transferencia '${
      task.name
    }' con los siguientes resultados:
      - Estado: ${result.success ? "Éxito" : "Error"}
      - Registros procesados: ${result.rows || 0}
      - Registros insertados: ${result.inserted || 0}
      ${
        result.duplicates
          ? `- Registros duplicados omitidos: ${result.duplicates}`
          : ""
      }
      ${
        result.success
          ? ""
          : `- Error: ${result.errorDetail || "No especificado"}`
      }
    `;

    // Generar HTML para el correo con tabla de duplicados
    let emailHtmlBody = `
      <p><strong>Resultado de la transferencia manual: ${task.name}</strong></p>
      <ul>
        <li><strong>Estado:</strong> ${
          result.success ? "✅ Éxito" : "❌ Error"
        }</li>
        <li><strong>Registros procesados:</strong> ${result.rows || 0}</li>
        <li><strong>Registros insertados:</strong> ${result.inserted || 0}</li>
        ${
          result.duplicates
            ? `<li><strong>Registros duplicados omitidos:</strong> ${result.duplicates}</li>`
            : ""
        }
        ${
          result.initialCount !== undefined
            ? `<li><strong>Registros iniciales en destino:</strong> ${result.initialCount}</li>`
            : ""
        }
        ${
          result.finalCount !== undefined
            ? `<li><strong>Registros finales en destino:</strong> ${result.finalCount}</li>`
            : ""
        }
        ${
          !result.success
            ? `<li><strong>Error:</strong> ${
                result.errorDetail || "No especificado"
              }</li>`
            : ""
        }
      </ul>
    `;

    // Agregar tabla de duplicados si hay registros
    if (
      formattedResult.duplicates > 0 &&
      formattedResult.duplicatedRecords.length > 0
    ) {
      // Obtener los nombres de columnas de los registros duplicados
      const sampleRecord = formattedResult.duplicatedRecords[0];
      const columns = Object.keys(sampleRecord).filter(
        (key) => !key.startsWith("_")
      );

      emailHtmlBody += `
        <h3>Detalle de registros duplicados omitidos${
          formattedResult.hasMoreDuplicates
            ? " (primeros " +
              formattedResult.duplicatedRecords.length +
              " de " +
              formattedResult.totalDuplicates +
              ")"
            : ""
        }</h3>
        <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            ${columns.map((col) => `<th>${col}</th>`).join("")}
          </tr>
      `;

      // Añadir filas para cada registro duplicado
      formattedResult.duplicatedRecords.forEach((record) => {
        emailHtmlBody += `
          <tr>
            ${columns
              .map((col) => {
                // Formatear el valor según su tipo
                let value = record[col];
                if (value === null || value === undefined) {
                  return '<td style="color: #999;">NULL</td>';
                } else if (typeof value === "object" && value instanceof Date) {
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
      if (formattedResult.hasMoreDuplicates) {
        emailHtmlBody += `
          <p><em>Nota: Se muestran solo los primeros ${formattedResult.duplicatedRecords.length} de ${formattedResult.totalDuplicates} registros duplicados omitidos.</em></p>
        `;
      }
    }

    // Añadir nota final
    emailHtmlBody += `<p>Esta transferencia fue ejecutada manualmente.</p>`;

    // 📧 Enviar correo con los resultados
    try {
      await sendEmail(
        "heriberto777@gmail.com", // Destinatario (podría ser una configuración o parámetro)
        emailSubject,
        emailTextBody,
        emailHtmlBody
      );
      logger.info(
        `📧 Correo de notificación enviado para la transferencia manual: ${task.name}`
      );
    } catch (emailError) {
      logger.error(
        `❌ Error al enviar correo de notificación: ${emailError.message}`
      );
    }

    if (result.success) {
      logger.info(`✅ Transferencia manual completada con éxito: ${task.name}`);
      return {
        success: true,
        message: "Transferencia manual ejecutada con éxito",
        result,
        emailSent: true,
      };
    } else {
      logger.error(`❌ Error en la transferencia manual: ${task.name}`, result);
      return {
        success: false,
        message: "Error en la ejecución de la transferencia manual",
        result,
        emailSent: true,
      };
    }
  } catch (error) {
    logger.error(
      `❌ Error en la ejecución manual de la transferencia: ${error.message}`
    );
    console.log(error);

    // 📧 Enviar correo de error
    try {
      await sendEmail(
        "heriberto777@gmail.com",
        `🚨 Error crítico en Transferencia Manual`,
        `Ocurrió un error crítico durante la ejecución manual de la transferencia.\nError: ${error.message}`,
        `<p><strong>Error crítico en Transferencia Manual</strong></p><p>${error.message}</p>`
      );
    } catch (emailError) {
      logger.error(`❌ Error al enviar correo de error: ${emailError.message}`);
    }

    return {
      success: false,
      message: "Error en la ejecución manual",
      error: error.message,
      emailSent: true,
    };
  }
}

/**
 * 📌 Lógica principal para ejecutar una transferencia de datos (Server1 -> Server2).
 * Usa retry para reintentos.
 * MEJORAS:
 * - Solo realiza INSERT, no UPDATE
 * - Registra detalles de duplicados para informes
 * - Integra envío de progreso vía SSE
 */
const executeTransfer = async (taskId) => {
  let server1Pool = null;
  let server2Pool = null;
  let transaction = null;
  let transactionStarted = false;
  let lastReportedProgress = 0; // Para throttling
  let initialCount = 0; // Contador inicial
  let duplicateCount = 0; // Contador de duplicados
  let duplicatedRecords = []; // Array para almacenar los registros duplicados

  return await retry(
    async () => {
      try {
        // 1. Obtener la tarea
        const task = await TransferTask.findById(taskId);
        if (!task || !task.active) {
          logger.warn(
            `⚠️ La tarea ${task?.name || "desconocida"} está inactiva.`
          );
          return { success: false, message: "Tarea inactiva" };
        }

        // 2. Actualizar estado
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "running",
          progress: 0,
        });
        sendProgress(taskId, 0); // Enviar progreso inicial
        lastReportedProgress = 0;

        const {
          name,
          query,
          parameters,
          validationRules,
          postUpdateQuery,
          postUpdateMapping,
        } = task;

        // 3. Verificar validationRules
        if (!validationRules) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "No se han especificado reglas de validación",
          };
        }

        // 4. Establecer conexiones
        try {
          // Intentar conectar a server1
          logger.debug(`Intentando conectar a server1 para tarea ${taskId}...`);
          server1Pool = await connectToDB("server1");

          if (!server1Pool || !server1Pool.connected) {
            throw new Error(
              "No se pudo establecer una conexión válida con server1"
            );
          }

          // Intentar conectar a server2
          logger.debug(`Intentando conectar a server2 para tarea ${taskId}...`);
          server2Pool = await connectToDB("server2");

          if (!server2Pool || !server2Pool.connected) {
            // Cerrar server1Pool que ya se conectó
            if (server1Pool) {
              try {
                await server1Pool.close();
                logger.debug(
                  "Conexión a server1 cerrada debido a error en server2"
                );
              } catch (e) {
                logger.warn("Error al cerrar conexión a server1:", e.message);
              }
              server1Pool = null;
            }
            throw new Error(
              "No se pudo establecer una conexión válida con server2"
            );
          }

          logger.info(
            `Conexiones establecidas correctamente para tarea ${taskId}`
          );
        } catch (connError) {
          logger.error(
            `Error al establecer conexiones para tarea ${taskId}:`,
            connError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "Error al establecer conexiones de base de datos",
            errorDetail: connError.message,
          };
        }

        // 5. Verificar conteo inicial de registros
        try {
          const countRequest = server2Pool.request();
          const countResult = await countRequest.query(
            `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
          );
          initialCount = countResult.recordset[0].total;
          logger.info(
            `Conteo inicial en tabla ${name}: ${initialCount} registros`
          );
        } catch (countError) {
          logger.warn(
            `No se pudo verificar conteo inicial: ${countError.message}`
          );
          initialCount = 0;
        }

        // 6. Obtener datos del servidor 1
        let data = [];
        try {
          const request = server1Pool.request();
          request.timeout = 60000; // 60 segundos de timeout

          let finalQuery = query;
          if (parameters?.length > 0) {
            const conditions = parameters.map(({ field, operator, value }) => {
              request.input(field, value);
              return `${field} ${operator} @${field}`;
            });
            finalQuery += ` WHERE ${conditions.join(" AND ")}`;
          }

          logger.debug(
            `Ejecutando consulta en Server1: ${finalQuery.substring(0, 200)}...`
          );
          const result = await request.query(finalQuery);
          data = result.recordset;
          logger.info(
            `Datos obtenidos correctamente: ${data.length} registros`
          );
        } catch (queryError) {
          logger.error("Error en la consulta en Server1", queryError);
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error

          if (queryError.code === "ECONNCLOSED") {
            logger.warn(
              `Detectada conexión cerrada en Server1 durante consulta.`
            );
          }

          return {
            success: false,
            message: "Error en la consulta en Server1",
            errorDetail: queryError.message,
          };
        }

        // 7. Verificar si hay datos para transferir
        if (data.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100); // Enviar progreso completado
          return {
            success: true,
            message: "No hay datos para transferir",
            rows: 0,
          };
        }

        // 8. Configurar claves para identificar registros
        const primaryKeys = validationRules?.existenceCheck?.key
          ? [validationRules.existenceCheck.key]
          : [];
        const requiredFields = validationRules?.requiredFields || [];

        const mergeKeys = [...new Set([...primaryKeys, ...requiredFields])];
        if (mergeKeys.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "No se especificaron claves para identificar registros",
          };
        }

        // 9. Iniciar transacción
        try {
          // Verificar que server2Pool sigue activo
          if (!server2Pool.connected) {
            logger.warn(
              `Conexión perdida con Server2, intentando reconectar...`
            );

            try {
              await server2Pool.close();
            } catch (e) {
              logger.warn(`Error al cerrar conexión a server2:`, e.message);
            }

            server2Pool = await connectToDB("server2");

            if (!server2Pool.connected) {
              throw new Error("No se pudo restablecer la conexión con Server2");
            }
            logger.info(`Reconexión exitosa a Server2`);
          }

          transaction = server2Pool.transaction();
          await transaction.begin();
          transactionStarted = true;
          logger.debug("Transacción iniciada correctamente");
        } catch (txError) {
          logger.error("Error al iniciar la transacción", txError);
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "Error al iniciar la transacción",
            errorDetail: txError.message,
          };
        }

        // 10. Pre-cargar información de longitud de columnas
        const columnLengthCache = new Map();

        // 11. Preparar variables para tracking
        let affectedRecords = [];
        let totalInserted = 0;
        const batchSize = 500;

        // 12. Procesar por lotes para inserción
        try {
          // Obtener listado de registros existentes para verificar duplicados
          let existingKeysSet = new Set();

          if (initialCount > 0 && mergeKeys.length > 0) {
            logger.debug(
              `Obteniendo claves existentes para verificar duplicados...`
            );

            try {
              const existingKeysRequest = server2Pool.request();
              existingKeysRequest.timeout = 30000;

              const keysQuery = `
                SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
                FROM dbo.[${name}] WITH (NOLOCK)
              `;

              const keysResult = await existingKeysRequest.query(keysQuery);

              // Crear un conjunto de claves para verificación rápida de duplicados
              for (const record of keysResult.recordset) {
                // Generar clave compuesta (todas las mergeKeys)
                const key = mergeKeys
                  .map((k) => {
                    const value = record[k] === null ? "NULL" : record[k];
                    return `${k}:${value}`;
                  })
                  .join("|");

                existingKeysSet.add(key);
              }

              logger.debug(
                `Se encontraron ${existingKeysSet.size} claves existentes en la tabla destino`
              );
            } catch (keysError) {
              logger.warn(
                `Error al obtener claves existentes: ${keysError.message}. Se intentará inserción sin verificación previa.`
              );
            }
          }

          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);

            // Verificar si las conexiones siguen activas
            if (!server2Pool.connected) {
              logger.warn(
                `Conexión perdida con Server2 durante procesamiento, intentando reconectar...`
              );

              try {
                await server2Pool.close();
              } catch (e) {
                logger.warn(
                  `Error al cerrar conexión anterior a server2:`,
                  e.message
                );
              }

              server2Pool = await connectToDB("server2");

              if (!server2Pool.connected) {
                throw new Error(
                  "No se pudo restablecer la conexión con Server2"
                );
              }

              if (transaction && transactionStarted) {
                try {
                  await transaction.rollback();
                  logger.debug(`Transacción anterior revertida`);
                } catch (e) {
                  logger.warn(
                    `No se pudo revertir la transacción anterior: ${e.message}`
                  );
                }
              }

              transaction = server2Pool.transaction();
              await transaction.begin();
              transactionStarted = true;
              logger.debug(`Nueva transacción iniciada después de reconexión`);
            }

            // Procesar cada registro para inserción
            let batchInserted = 0;
            let batchSkipped = 0;
            const insertBatchSize = 50; // Tamaño reducido para evitar problemas

            for (let j = 0; j < batch.length; j += insertBatchSize) {
              const insertSubBatch = batch.slice(j, j + insertBatchSize);

              for (const record of insertSubBatch) {
                try {
                  // Truncar strings según las longitudes máximas
                  for (const column in record) {
                    if (typeof record[column] === "string") {
                      // Obtener la longitud máxima (usando cache)
                      let maxLength;
                      if (columnLengthCache.has(column)) {
                        maxLength = columnLengthCache.get(column);
                      } else {
                        maxLength = await getColumnMaxLength(
                          name,
                          column,
                          server2Pool
                        );
                        columnLengthCache.set(column, maxLength);
                      }

                      if (maxLength > 0 && record[column]?.length > maxLength) {
                        record[column] = record[column].substring(0, maxLength);
                      }
                    }
                  }

                  // Recolectar IDs para post-actualización
                  if (postUpdateQuery && primaryKeys.length > 0) {
                    const primaryKey = primaryKeys[0];
                    if (
                      record[primaryKey] !== null &&
                      record[primaryKey] !== undefined
                    ) {
                      affectedRecords.push(record[primaryKey]);
                    }
                  }

                  // Verificar si es un duplicado consultando el conjunto de claves existentes
                  if (existingKeysSet.size > 0) {
                    const recordKey = mergeKeys
                      .map((k) => {
                        const value = record[k] === null ? "NULL" : record[k];
                        return `${k}:${value}`;
                      })
                      .join("|");

                    if (existingKeysSet.has(recordKey)) {
                      // Es un duplicado, registrar advertencia y continuar
                      duplicateCount++;
                      batchSkipped++;

                      // Construir mensaje claro para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${record[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado (limitado a campos clave y algunos adicionales)
                      const duplicateRecord = {};

                      // Añadir campos clave
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir algunos campos adicionales de interés (hasta 5)
                      const additionalFields = Object.keys(record)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir a la lista de duplicados
                      duplicatedRecords.push(duplicateRecord);

                      logger.warn(
                        `⚠️ Registro duplicado encontrado y omitido: ${duplicateInfo}`
                      );
                      continue;
                    }
                  }

                  const insertRequest = transaction.request();
                  insertRequest.timeout = 30000;

                  // Preparar consulta para inserción
                  const columns = Object.keys(record)
                    .map((k) => `[${k}]`)
                    .join(", ");
                  const values = Object.keys(record)
                    .map((k) => {
                      insertRequest.input(k, record[k]);
                      return `@${k}`;
                    })
                    .join(", ");

                  const insertQuery = `
                    INSERT INTO dbo.[${name}] (${columns})
                    VALUES (${values});
                    
                    SELECT @@ROWCOUNT AS rowsAffected;
                  `;

                  try {
                    const insertResult = await insertRequest.query(insertQuery);
                    const rowsAffected = insertResult.recordset[0].rowsAffected;

                    if (rowsAffected > 0) {
                      totalInserted += rowsAffected;
                      batchInserted += rowsAffected;

                      // Añadir esta clave al conjunto para detectar duplicados en el mismo lote
                      if (existingKeysSet.size > 0) {
                        const newKey = mergeKeys
                          .map((k) => {
                            const value =
                              record[k] === null ? "NULL" : record[k];
                            return `${k}:${value}`;
                          })
                          .join("|");

                        existingKeysSet.add(newKey);
                      }
                    }
                  } catch (insertError) {
                    // Capturar error por violación de clave primaria (duplicado)
                    if (
                      insertError.number === 2627 ||
                      insertError.number === 2601
                    ) {
                      duplicateCount++;
                      batchSkipped++;

                      // Construir mensaje para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${record[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};

                      // Añadir campos clave
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir algunos campos adicionales de interés (hasta 5)
                      const additionalFields = Object.keys(record)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir información del error
                      duplicateRecord._errorCode = insertError.number;
                      duplicateRecord._errorMessage =
                        insertError.message.substring(0, 100);
                      duplicatedRecords.push(duplicateRecord);

                      logger.warn(
                        `⚠️ Error de inserción por duplicado: ${duplicateInfo}`
                      );
                    } else {
                      // Para otros errores, propagar la excepción
                      logger.error("Error al insertar registro", insertError);
                      throw new Error(
                        `Error al insertar registro: ${insertError.message}`
                      );
                    }
                  }
                } catch (recordError) {
                  // Errores no relacionados con duplicados
                  if (
                    recordError.number !== 2627 &&
                    recordError.number !== 2601
                  ) {
                    throw recordError;
                  }
                }
              }
            }

            logger.debug(
              `Lote ${
                i / batchSize + 1
              }: ${batchInserted} registros insertados, ${batchSkipped} omitidos por duplicados`
            );

            // Actualizar progreso con throttling
            const progress = Math.round(
              ((i + batch.length) / data.length) * 100
            );
            if (progress > lastReportedProgress + 5 || progress >= 100) {
              lastReportedProgress = progress;
              await TransferTask.findByIdAndUpdate(taskId, { progress });
              sendProgress(taskId, progress); // Enviar actualización de progreso
              logger.debug(`Progreso actualizado: ${progress}%`);
            }
          }

          // 13. Confirmar transacción
          if (transaction && transactionStarted) {
            await transaction.commit();
            logger.debug("Transacción confirmada correctamente");
            transactionStarted = false;
          }

          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100); // Enviar progreso completado

          // 14. Verificar conteo final
          let finalCount = 0;
          try {
            const countRequest = server2Pool.request();
            const countResult = await countRequest.query(
              `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
            );
            finalCount = countResult.recordset[0].total;
            logger.info(
              `Conteo final en tabla ${name}: ${finalCount} registros (${
                finalCount - initialCount
              } nuevos, ${duplicateCount} duplicados omitidos)`
            );
          } catch (countError) {
            logger.warn(
              `No se pudo verificar conteo final: ${countError.message}`
            );
          }

          // 15. Ejecutar consulta post-actualización
          if (postUpdateQuery && affectedRecords.length > 0) {
            try {
              // Verificar si la conexión sigue activa
              if (!server1Pool || !server1Pool.connected) {
                logger.warn(
                  "Reconectando al servidor 1 para post-actualización"
                );

                if (server1Pool) {
                  try {
                    await server1Pool.close();
                  } catch (e) {
                    logger.warn(
                      `Error al cerrar conexión anterior a server1:`,
                      e.message
                    );
                  }
                }

                server1Pool = await connectToDB("server1");
              }

              const postUpdateBatchSize = 500;

              for (
                let i = 0;
                i < affectedRecords.length;
                i += postUpdateBatchSize
              ) {
                const keyBatch = affectedRecords.slice(
                  i,
                  i + postUpdateBatchSize
                );
                const postRequest = server1Pool.request();
                postRequest.timeout = 60000;

                // Procesar claves - quitar prefijo CN
                const processedKeys = keyBatch.map((key) =>
                  typeof key === "string" && key.startsWith("CN")
                    ? key.replace(/^CN/, "")
                    : key
                );

                // Preparar parámetros
                processedKeys.forEach((key, index) =>
                  postRequest.input(`key${index}`, key)
                );

                // Construir lista de parámetros
                const keyParams = processedKeys
                  .map((_, index) => `@key${index}`)
                  .join(", ");

                // Obtener la clave correcta para la consulta WHERE
                const primaryKeyField =
                  postUpdateMapping?.tableKey || primaryKeys[0];

                // Construir consulta
                const dynamicUpdateQuery = `${postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

                // Ejecutar y registrar resultado
                const postUpdateResult = await postRequest.query(
                  dynamicUpdateQuery
                );
                logger.info(
                  `Post-actualización: ${postUpdateResult.rowsAffected[0]} filas afectadas`
                );
              }

              logger.info(
                `✅ Consulta post-transferencia ejecutada correctamente para ${name}`
              );
            } catch (postUpdateError) {
              logger.error(
                `❌ Error en consulta post-transferencia`,
                postUpdateError
              );
            }
          }

          // Limitar la cantidad de duplicados que se reportan para evitar correos enormes
          const maxDuplicatesToReport = 100;
          const reportedDuplicates = duplicatedRecords.slice(
            0,
            maxDuplicatesToReport
          );
          const hasMoreDuplicates =
            duplicatedRecords.length > maxDuplicatesToReport;

          return {
            success: true,
            message: "Transferencia completada",
            rows: data.length,
            inserted: totalInserted,
            duplicates: duplicateCount,
            duplicatedRecords: reportedDuplicates,
            hasMoreDuplicates,
            totalDuplicates: duplicatedRecords.length,
            initialCount,
            finalCount,
          };
        } catch (error) {
          // Revertir transacción en caso de error
          if (transaction && transactionStarted) {
            try {
              await transaction.rollback();
              logger.debug("Transacción revertida correctamente");
              transactionStarted = false;
            } catch (rollbackError) {
              logger.error("Error al revertir la transacción", rollbackError);
            }
          }

          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          logger.error("Error en la transferencia", error);
          return {
            success: false,
            message: "Error en la transferencia",
            errorDetail: error.message,
          };
        }
      } catch (outerError) {
        // Manejo de errores generales

        if (transaction && transactionStarted) {
          try {
            await transaction.rollback();
            logger.debug(
              "Transacción revertida correctamente en error general"
            );
            transactionStarted = false;
          } catch (rollbackError) {
            logger.error(
              "Error al revertir la transacción en error general",
              rollbackError
            );
          }
        }

        await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
        sendProgress(taskId, -1); // Enviar estado de error
        logger.error("Error general en la transferencia", outerError);
        return {
          success: false,
          message: "Error general en la transferencia",
          errorDetail: outerError.message,
        };
      } finally {
        // Asegurarse de que la transacción está cerrada
        if (transaction && transactionStarted) {
          try {
            await transaction.rollback();
            logger.debug("Transacción revertida en bloque finally");
          } catch (finalRollbackError) {
            logger.error(
              "Error al revertir la transacción en finally",
              finalRollbackError
            );
          }
        }

        // Cerrar las conexiones
        try {
          if (server1Pool && server1Pool.connected) {
            await server1Pool.close();
            logger.debug(
              `Conexión server1Pool cerrada correctamente para tarea ${taskId}`
            );
          }
        } catch (closeError) {
          logger.error(
            `Error al cerrar conexión server1Pool para tarea ${taskId}:`,
            closeError
          );
        }

        try {
          if (server2Pool && server2Pool.connected) {
            await server2Pool.close();
            logger.debug(
              `Conexión server2Pool cerrada correctamente para tarea ${taskId}`
            );
          }
        } catch (closeError) {
          logger.error(
            `Error al cerrar conexión server2Pool para tarea ${taskId}:`,
            closeError
          );
        }
      }
    },
    3,
    5000,
    `Ejecutar Transferencia para tarea ${taskId}`
  );
};

/**
 * 📌 Ejecuta una transferencia UP (Server1 -> Server2) según 'transferType = "up"'
 */
async function executeTransferUp(taskId) {
  let server1Pool = null;
  let server2Pool = null;
  let transaction = null;
  let transactionStarted = false;
  let lastReportedProgress = 0; // Para throttling
  let initialCount = 0; // Contador inicial
  let duplicateCount = 0; // Contador de duplicados
  let duplicatedRecords = []; // Array para almacenar los registros duplicados

  return await retry(
    async () => {
      try {
        // 1. Obtener la tarea
        const task = await TransferTask.findById(taskId);
        if (!task || !task.active) {
          logger.warn(
            `⚠️ La tarea ${task?.name || "desconocida"} está inactiva.`
          );
          return { success: false, message: "Tarea inactiva" };
        }

        // 2. Actualizar estado
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "running",
          progress: 0,
        });
        sendProgress(taskId, 0); // Enviar progreso inicial
        lastReportedProgress = 0;

        const {
          name,
          query,
          parameters,
          validationRules,
          postUpdateQuery,
          postUpdateMapping,
        } = task;

        // 3. Verificar validationRules
        if (!validationRules) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "No se han especificado reglas de validación",
          };
        }

        // 4. Establecer conexiones
        try {
          // Intentar conectar a server1
          logger.debug(`Intentando conectar a server1 para tarea ${taskId}...`);
          server1Pool = await connectToDB("server1");

          if (!server1Pool || !server1Pool.connected) {
            throw new Error(
              "No se pudo establecer una conexión válida con server1"
            );
          }

          // Intentar conectar a server2
          logger.debug(`Intentando conectar a server2 para tarea ${taskId}...`);
          server2Pool = await connectToDB("server2");

          if (!server2Pool || !server2Pool.connected) {
            // Cerrar server1Pool que ya se conectó
            if (server1Pool) {
              try {
                await server1Pool.close();
                logger.debug(
                  "Conexión a server1 cerrada debido a error en server2"
                );
              } catch (e) {
                logger.warn("Error al cerrar conexión a server1:", e.message);
              }
              server1Pool = null;
            }
            throw new Error(
              "No se pudo establecer una conexión válida con server2"
            );
          }

          logger.info(
            `Conexiones establecidas correctamente para tarea ${taskId}`
          );
        } catch (connError) {
          logger.error(
            `Error al establecer conexiones para tarea ${taskId}:`,
            connError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "Error al establecer conexiones de base de datos",
            errorDetail: connError.message,
          };
        }

        // 5. Verificar conteo inicial de registros
        try {
          const countRequest = server2Pool.request();
          const countResult = await countRequest.query(
            `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
          );
          initialCount = countResult.recordset[0].total;
          logger.info(
            `Conteo inicial en tabla ${name}: ${initialCount} registros`
          );
        } catch (countError) {
          logger.warn(
            `No se pudo verificar conteo inicial: ${countError.message}`
          );
          initialCount = 0;
        }

        // 6. Obtener datos del servidor 1
        let data = [];
        try {
          const request = server1Pool.request();
          request.timeout = 60000; // 60 segundos de timeout

          let finalQuery = query;
          if (parameters?.length > 0) {
            const conditions = parameters.map(({ field, operator, value }) => {
              request.input(field, value);
              return `${field} ${operator} @${field}`;
            });
            finalQuery += ` WHERE ${conditions.join(" AND ")}`;
          }

          logger.debug(
            `Ejecutando consulta en Server1: ${finalQuery.substring(0, 200)}...`
          );
          const result = await request.query(finalQuery);
          data = result.recordset;
          logger.info(
            `Datos obtenidos correctamente: ${data.length} registros`
          );
        } catch (queryError) {
          logger.error("Error en la consulta en Server1", queryError);
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error

          if (queryError.code === "ECONNCLOSED") {
            logger.warn(
              `Detectada conexión cerrada en Server1 durante consulta.`
            );
          }

          return {
            success: false,
            message: "Error en la consulta en Server1",
            errorDetail: queryError.message,
          };
        }

        // 7. Verificar si hay datos para transferir
        if (data.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100); // Enviar progreso completado
          return {
            success: true,
            message: "No hay datos para transferir",
            rows: 0,
          };
        }

        // 8. Configurar claves para identificar registros
        const primaryKeys = validationRules?.existenceCheck?.key
          ? [validationRules.existenceCheck.key]
          : [];
        const requiredFields = validationRules?.requiredFields || [];

        const mergeKeys = [...new Set([...primaryKeys, ...requiredFields])];
        if (mergeKeys.length === 0) {
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "No se especificaron claves para identificar registros",
          };
        }

        // 9. Iniciar transacción
        try {
          // Verificar que server2Pool sigue activo
          if (!server2Pool.connected) {
            logger.warn(
              `Conexión perdida con Server2, intentando reconectar...`
            );

            try {
              await server2Pool.close();
            } catch (e) {
              logger.warn(`Error al cerrar conexión a server2:`, e.message);
            }

            server2Pool = await connectToDB("server2");

            if (!server2Pool.connected) {
              throw new Error("No se pudo restablecer la conexión con Server2");
            }
            logger.info(`Reconexión exitosa a Server2`);
          }

          transaction = server2Pool.transaction();
          await transaction.begin();
          transactionStarted = true;
          logger.debug("Transacción iniciada correctamente");
        } catch (txError) {
          logger.error("Error al iniciar la transacción", txError);
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          return {
            success: false,
            message: "Error al iniciar la transacción",
            errorDetail: txError.message,
          };
        }

        // 10. Pre-cargar información de longitud de columnas
        const columnLengthCache = new Map();

        // 11. Preparar variables para tracking
        let affectedRecords = [];
        let totalInserted = 0;
        const batchSize = 500;

        // 12. Procesar por lotes para inserción
        try {
          // Obtener listado de registros existentes para verificar duplicados
          let existingKeysSet = new Set();

          if (initialCount > 0 && mergeKeys.length > 0) {
            logger.debug(
              `Obteniendo claves existentes para verificar duplicados...`
            );

            try {
              const existingKeysRequest = server2Pool.request();
              existingKeysRequest.timeout = 30000;

              const keysQuery = `
                SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
                FROM dbo.[${name}] WITH (NOLOCK)
              `;

              const keysResult = await existingKeysRequest.query(keysQuery);

              // Crear un conjunto de claves para verificación rápida de duplicados
              for (const record of keysResult.recordset) {
                // Generar clave compuesta (todas las mergeKeys)
                const key = mergeKeys
                  .map((k) => {
                    const value = record[k] === null ? "NULL" : record[k];
                    return `${k}:${value}`;
                  })
                  .join("|");

                existingKeysSet.add(key);
              }

              logger.debug(
                `Se encontraron ${existingKeysSet.size} claves existentes en la tabla destino`
              );
            } catch (keysError) {
              logger.warn(
                `Error al obtener claves existentes: ${keysError.message}. Se intentará inserción sin verificación previa.`
              );
            }
          }

          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);

            // Verificar si las conexiones siguen activas
            if (!server2Pool.connected) {
              logger.warn(
                `Conexión perdida con Server2 durante procesamiento, intentando reconectar...`
              );

              try {
                await server2Pool.close();
              } catch (e) {
                logger.warn(
                  `Error al cerrar conexión anterior a server2:`,
                  e.message
                );
              }

              server2Pool = await connectToDB("server2");

              if (!server2Pool.connected) {
                throw new Error(
                  "No se pudo restablecer la conexión con Server2"
                );
              }

              if (transaction && transactionStarted) {
                try {
                  await transaction.rollback();
                  logger.debug(`Transacción anterior revertida`);
                } catch (e) {
                  logger.warn(
                    `No se pudo revertir la transacción anterior: ${e.message}`
                  );
                }
              }

              transaction = server2Pool.transaction();
              await transaction.begin();
              transactionStarted = true;
              logger.debug(`Nueva transacción iniciada después de reconexión`);
            }

            // Procesar cada registro para inserción
            let batchInserted = 0;
            let batchSkipped = 0;
            const insertBatchSize = 50; // Tamaño reducido para evitar problemas

            for (let j = 0; j < batch.length; j += insertBatchSize) {
              const insertSubBatch = batch.slice(j, j + insertBatchSize);

              for (const record of insertSubBatch) {
                try {
                  // Truncar strings según las longitudes máximas
                  for (const column in record) {
                    if (typeof record[column] === "string") {
                      // Obtener la longitud máxima (usando cache)
                      let maxLength;
                      if (columnLengthCache.has(column)) {
                        maxLength = columnLengthCache.get(column);
                      } else {
                        maxLength = await getColumnMaxLength(
                          name,
                          column,
                          server2Pool
                        );
                        columnLengthCache.set(column, maxLength);
                      }

                      if (maxLength > 0 && record[column]?.length > maxLength) {
                        record[column] = record[column].substring(0, maxLength);
                      }
                    }
                  }

                  // Recolectar IDs para post-actualización
                  if (postUpdateQuery && primaryKeys.length > 0) {
                    const primaryKey = primaryKeys[0];
                    if (
                      record[primaryKey] !== null &&
                      record[primaryKey] !== undefined
                    ) {
                      affectedRecords.push(record[primaryKey]);
                    }
                  }

                  // Verificar si es un duplicado consultando el conjunto de claves existentes
                  if (existingKeysSet.size > 0) {
                    const recordKey = mergeKeys
                      .map((k) => {
                        const value = record[k] === null ? "NULL" : record[k];
                        return `${k}:${value}`;
                      })
                      .join("|");

                    if (existingKeysSet.has(recordKey)) {
                      // Es un duplicado, registrar advertencia y continuar
                      duplicateCount++;
                      batchSkipped++;

                      // Construir mensaje claro para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${record[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado (limitado a campos clave y algunos adicionales)
                      const duplicateRecord = {};

                      // Añadir campos clave
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir algunos campos adicionales de interés (hasta 5)
                      const additionalFields = Object.keys(record)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir a la lista de duplicados
                      duplicatedRecords.push(duplicateRecord);

                      logger.warn(
                        `⚠️ Registro duplicado encontrado y omitido: ${duplicateInfo}`
                      );
                      continue;
                    }
                  }

                  const insertRequest = transaction.request();
                  insertRequest.timeout = 30000;

                  // Preparar consulta para inserción
                  const columns = Object.keys(record)
                    .map((k) => `[${k}]`)
                    .join(", ");
                  const values = Object.keys(record)
                    .map((k) => {
                      insertRequest.input(k, record[k]);
                      return `@${k}`;
                    })
                    .join(", ");

                  const insertQuery = `
                    INSERT INTO dbo.[${name}] (${columns})
                    VALUES (${values});
                    
                    SELECT @@ROWCOUNT AS rowsAffected;
                  `;

                  try {
                    const insertResult = await insertRequest.query(insertQuery);
                    const rowsAffected = insertResult.recordset[0].rowsAffected;

                    if (rowsAffected > 0) {
                      totalInserted += rowsAffected;
                      batchInserted += rowsAffected;

                      // Añadir esta clave al conjunto para detectar duplicados en el mismo lote
                      if (existingKeysSet.size > 0) {
                        const newKey = mergeKeys
                          .map((k) => {
                            const value =
                              record[k] === null ? "NULL" : record[k];
                            return `${k}:${value}`;
                          })
                          .join("|");

                        existingKeysSet.add(newKey);
                      }
                    }
                  } catch (insertError) {
                    // Capturar error por violación de clave primaria (duplicado)
                    if (
                      insertError.number === 2627 ||
                      insertError.number === 2601
                    ) {
                      duplicateCount++;
                      batchSkipped++;

                      // Construir mensaje para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${record[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};

                      // Añadir campos clave
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir algunos campos adicionales de interés (hasta 5)
                      const additionalFields = Object.keys(record)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir información del error
                      duplicateRecord._errorCode = insertError.number;
                      duplicateRecord._errorMessage =
                        insertError.message.substring(0, 100);
                      duplicatedRecords.push(duplicateRecord);

                      logger.warn(
                        `⚠️ Error de inserción por duplicado: ${duplicateInfo}`
                      );
                    } else {
                      // Para otros errores, propagar la excepción
                      logger.error("Error al insertar registro", insertError);
                      throw new Error(
                        `Error al insertar registro: ${insertError.message}`
                      );
                    }
                  }
                } catch (recordError) {
                  // Errores no relacionados con duplicados
                  if (
                    recordError.number !== 2627 &&
                    recordError.number !== 2601
                  ) {
                    throw recordError;
                  }
                }
              }
            }

            logger.debug(
              `Lote ${
                i / batchSize + 1
              }: ${batchInserted} registros insertados, ${batchSkipped} omitidos por duplicados`
            );

            // Actualizar progreso con throttling
            const progress = Math.round(
              ((i + batch.length) / data.length) * 100
            );
            if (progress > lastReportedProgress + 5 || progress >= 100) {
              lastReportedProgress = progress;
              await TransferTask.findByIdAndUpdate(taskId, { progress });
              sendProgress(taskId, progress); // Enviar actualización de progreso
              logger.debug(`Progreso actualizado: ${progress}%`);
            }
          }

          // 13. Confirmar transacción
          if (transaction && transactionStarted) {
            await transaction.commit();
            logger.debug("Transacción confirmada correctamente");
            transactionStarted = false;
          }

          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100); // Enviar progreso completado

          // 14. Verificar conteo final
          let finalCount = 0;
          try {
            const countRequest = server2Pool.request();
            const countResult = await countRequest.query(
              `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
            );
            finalCount = countResult.recordset[0].total;
            logger.info(
              `Conteo final en tabla ${name}: ${finalCount} registros (${
                finalCount - initialCount
              } nuevos, ${duplicateCount} duplicados omitidos)`
            );
          } catch (countError) {
            logger.warn(
              `No se pudo verificar conteo final: ${countError.message}`
            );
          }

          // 15. Ejecutar consulta post-actualización
          if (postUpdateQuery && affectedRecords.length > 0) {
            try {
              // Verificar si la conexión sigue activa
              if (!server1Pool || !server1Pool.connected) {
                logger.warn(
                  "Reconectando al servidor 1 para post-actualización"
                );

                if (server1Pool) {
                  try {
                    await server1Pool.close();
                  } catch (e) {
                    logger.warn(
                      `Error al cerrar conexión anterior a server1:`,
                      e.message
                    );
                  }
                }

                server1Pool = await connectToDB("server1");
              }

              const postUpdateBatchSize = 500;

              for (
                let i = 0;
                i < affectedRecords.length;
                i += postUpdateBatchSize
              ) {
                const keyBatch = affectedRecords.slice(
                  i,
                  i + postUpdateBatchSize
                );
                const postRequest = server1Pool.request();
                postRequest.timeout = 60000;

                // Procesar claves - quitar prefijo CN
                const processedKeys = keyBatch.map((key) =>
                  typeof key === "string" && key.startsWith("CN")
                    ? key.replace(/^CN/, "")
                    : key
                );

                // Preparar parámetros
                processedKeys.forEach((key, index) =>
                  postRequest.input(`key${index}`, key)
                );

                // Construir lista de parámetros
                const keyParams = processedKeys
                  .map((_, index) => `@key${index}`)
                  .join(", ");

                // Obtener la clave correcta para la consulta WHERE
                const primaryKeyField =
                  postUpdateMapping?.tableKey || primaryKeys[0];

                // Construir consulta
                const dynamicUpdateQuery = `${postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

                // Ejecutar y registrar resultado
                const postUpdateResult = await postRequest.query(
                  dynamicUpdateQuery
                );
                logger.info(
                  `Post-actualización: ${postUpdateResult.rowsAffected[0]} filas afectadas`
                );
              }

              logger.info(
                `✅ Consulta post-transferencia ejecutada correctamente para ${name}`
              );
            } catch (postUpdateError) {
              logger.error(
                `❌ Error en consulta post-transferencia`,
                postUpdateError
              );
            }
          }

          // Limitar la cantidad de duplicados que se reportan para evitar correos enormes
          const maxDuplicatesToReport = 100;
          const reportedDuplicates = duplicatedRecords.slice(
            0,
            maxDuplicatesToReport
          );
          const hasMoreDuplicates =
            duplicatedRecords.length > maxDuplicatesToReport;

          return {
            success: true,
            message: "Transferencia completada",
            rows: data.length,
            inserted: totalInserted,
            duplicates: duplicateCount,
            duplicatedRecords: reportedDuplicates,
            hasMoreDuplicates,
            totalDuplicates: duplicatedRecords.length,
            initialCount,
            finalCount,
          };
        } catch (error) {
          // Revertir transacción en caso de error
          if (transaction && transactionStarted) {
            try {
              await transaction.rollback();
              logger.debug("Transacción revertida correctamente");
              transactionStarted = false;
            } catch (rollbackError) {
              logger.error("Error al revertir la transacción", rollbackError);
            }
          }

          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1); // Enviar estado de error
          logger.error("Error en la transferencia", error);
          return {
            success: false,
            message: "Error en la transferencia",
            errorDetail: error.message,
          };
        }
      } catch (outerError) {
        // Manejo de errores generales

        if (transaction && transactionStarted) {
          try {
            await transaction.rollback();
            logger.debug(
              "Transacción revertida correctamente en error general"
            );
            transactionStarted = false;
          } catch (rollbackError) {
            logger.error(
              "Error al revertir la transacción en error general",
              rollbackError
            );
          }
        }

        await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
        sendProgress(taskId, -1); // Enviar estado de error
        logger.error("Error general en la transferencia", outerError);
        return {
          success: false,
          message: "Error general en la transferencia",
          errorDetail: outerError.message,
        };
      } finally {
        // Asegurarse de que la transacción está cerrada
        if (transaction && transactionStarted) {
          try {
            await transaction.rollback();
            logger.debug("Transacción revertida en bloque finally");
          } catch (finalRollbackError) {
            logger.error(
              "Error al revertir la transacción en finally",
              finalRollbackError
            );
          }
        }

        // Cerrar las conexiones
        try {
          if (server1Pool && server1Pool.connected) {
            await server1Pool.close();
            logger.debug(
              `Conexión server1Pool cerrada correctamente para tarea ${taskId}`
            );
          }
        } catch (closeError) {
          logger.error(
            `Error al cerrar conexión server1Pool para tarea ${taskId}:`,
            closeError
          );
        }

        try {
          if (server2Pool && server2Pool.connected) {
            await server2Pool.close();
            logger.debug(
              `Conexión server2Pool cerrada correctamente para tarea ${taskId}`
            );
          }
        } catch (closeError) {
          logger.error(
            `Error al cerrar conexión server2Pool para tarea ${taskId}:`,
            closeError
          );
        }
      }
    },
    3,
    5000,
    `Ejecutar Transferencia para tarea ${taskId}`
  );
}

/**
 * 📌 Ejecuta una transferencia DOWN (Server2 -> Server1) según 'transferType = "down"'
 */
async function executeTransferDown(taskId, updateProgress) {
  return await retry(async () => {
    const task = await TransferTask.findById(taskId);
    if (!task) return { success: false, message: "Tarea no encontrada" };
    if (!task.active) return { success: false, message: "Tarea inactiva" };

    if (task.transferType !== "down") {
      return {
        success: false,
        message: "La tarea no está configurada para Transfer Down",
      };
    }

    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });

    const server2Pool = await connectToDB("server2");
    const server1Pool = await connectToDB("server1");
    const taskName = `Transferencia Down de ${task.name}`;
    logger.info(`${taskName}: 📥 Obteniendo datos de origen...`);

    let data = [];
    try {
      const request = server2Pool.request();
      let finalQuery = task.query;

      if (task.parameters?.length > 0) {
        const conditions = task.parameters.map(({ field, operator, value }) => {
          request.input(field, value);
          return `${field} ${operator} @${field}`;
        });
        finalQuery += ` WHERE ${conditions.join(" AND ")}`;
      }

      const result = await request.query(finalQuery);
      data = result.recordset;
    } catch (queryError) {
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      logger.error(`${taskName}: ❌ Error en origen (Server2)`, queryError);
      return {
        success: false,
        message: "Error en la consulta en Server2",
        errorDetail: queryError.message,
      };
    }

    if (data.length === 0) {
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "completed",
        progress: 100,
      });
      return {
        success: true,
        message: "No hay datos para transferir",
        rows: 0,
      };
    }

    const primaryKey = getPrimaryKey(task.validationRules);
    if (!primaryKey) {
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      return { success: false, message: "No se especificó una clave primaria" };
    }

    const transaction = server1Pool.transaction();
    await transaction.begin();

    try {
      for (const record of data) {
        const request = transaction.request();
        Object.keys(record).forEach((key) => request.input(key, record[key]));

        // 📌 Verificación de longitud de columnas antes de insertarlas
        for (const column in record) {
          const maxLength = await getColumnMaxLength(
            task.name,
            column,
            server1Pool
          );
          if (maxLength > 0 && record[column]?.length > maxLength) {
            logger.warn(
              `${taskName}: ⚠️ Truncando ${column} a ${maxLength} caracteres.`
            );
            record[column] = record[column].substring(0, maxLength);
          }
        }

        const mergeQuery = `
          MERGE INTO dbo.[${task.name}] AS target
          USING (SELECT ${Object.keys(record)
            .map((k) => `@${k} AS [${k}]`)
            .join(", ")}) AS source
          ON target.[${primaryKey}] = source.[${primaryKey}]
          WHEN MATCHED THEN UPDATE SET ${Object.keys(record)
            .map((k) => `target.[${k}] = source.[${k}]`)
            .join(", ")}
          WHEN NOT MATCHED THEN INSERT (${Object.keys(record)
            .map((k) => `[${k}]`)
            .join(", ")})
          VALUES (${Object.keys(record)
            .map((k) => `source.[${k}]`)
            .join(", ")})
          OUTPUT $action;`;

        await request.query(mergeQuery);
      }

      await transaction.commit();
      await TransferTask.findByIdAndUpdate(taskId, {
        status: "completed",
        progress: 100,
      });

      // 📌 Aplicamos la actualización post-transferencia usando `primaryKey`
      if (postUpdateQuery && primaryKey && affectedRecords.length > 0) {
        try {
          logger.info(
            `📌 Ejecutando consulta post-transferencia en Server1 para ${taskName}`
          );

          const postRequest = server1Pool.request();
          affectedRecords.forEach((key, index) => {
            postRequest.input(`key${index}`, key);
          });

          const keyParams = affectedRecords
            .map((_, index) => `@key${index}`)
            .join(", ");

          const dynamicUpdateQuery = `
          ${postUpdateQuery}
          WHERE ${tableKey} IN (${keyParams})
          `;

          await postRequest.query(dynamicUpdateQuery);
          logger.info(
            `✅ Consulta post-transferencia ejecutada correctamente en Server1 para ${taskName}`
          );
        } catch (postUpdateError) {
          logger.error(
            `❌ Error en consulta post-transferencia para ${taskName}`,
            postUpdateError
          );
        }
      }

      return {
        success: true,
        message: "Transferencia Down completada",
        rows: data.length,
      };
    } catch (mergeError) {
      await transaction.rollback();
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      return {
        success: false,
        message: "Error en la transferencia",
        errorDetail: mergeError.message,
      };
    }
  });
}

/**
 * 📌 Función que inserta TODOS los datos en lotes, reportando progreso SSE y enviando correo al finalizar.
 * No verifica duplicados, simplemente inserta todos los registros.
 * Requiere que el frontend esté suscrito a /api/transfer/progress/:taskId
 */
async function insertInBatchesSSE(taskId, data, batchSize = 100) {
  let server2Pool = null;
  let transaction = null;
  let transactionStarted = false;
  let lastReportedProgress = 0;
  let initialCount = 0;

  try {
    // 1) Obtener la tarea
    const task = await TransferTask.findById(taskId);
    if (!task) {
      throw new Error(`No se encontró la tarea con ID: ${taskId}`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${task.name}" está inactiva.`);
    }

    // 2) Marcar status "running", progress=0
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    const { name } = task;

    // 3) Conectarse a la DB de destino
    try {
      server2Pool = await connectToDB("server2");

      if (!server2Pool || !server2Pool.connected) {
        throw new Error(
          "No se pudo establecer una conexión válida con server2"
        );
      }

      logger.info(`Conexión establecida correctamente para tarea ${taskId}`);
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para tarea ${taskId}:`,
        connError
      );
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      sendProgress(taskId, -1);
      throw new Error(
        `Error al establecer conexión de base de datos: ${connError.message}`
      );
    }

    // 4) Verificar conteo inicial de registros
    try {
      const countRequest = server2Pool.request();
      const countResult = await countRequest.query(
        `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
      );
      initialCount = countResult.recordset[0].total;
      logger.info(`Conteo inicial en tabla ${name}: ${initialCount} registros`);
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo inicial: ${countError.message}`);
      initialCount = 0;
    }

    // 5) Iniciar transacción
    try {
      transaction = server2Pool.transaction();
      await transaction.begin();
      transactionStarted = true;
      logger.debug("Transacción iniciada correctamente");
    } catch (txError) {
      logger.error("Error al iniciar la transacción", txError);
      await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
      sendProgress(taskId, -1);
      throw new Error(`Error al iniciar la transacción: ${txError.message}`);
    }

    // 6) Pre-cargar información de longitud de columnas
    const columnLengthCache = new Map();

    // 7) Contadores para tracking
    const total = data.length;
    let totalInserted = 0;
    let processedCount = 0;
    let errorCount = 0;

    // 8) Procesar data en lotes
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      // Verificar si la conexión sigue activa
      if (!server2Pool.connected) {
        logger.warn(
          `Conexión perdida con Server2 durante procesamiento, intentando reconectar...`
        );

        try {
          await server2Pool.close();
        } catch (e) {
          logger.warn(
            `Error al cerrar conexión anterior a server2:`,
            e.message
          );
        }

        server2Pool = await connectToDB("server2");

        if (!server2Pool.connected) {
          throw new Error("No se pudo restablecer la conexión con Server2");
        }

        if (transaction && transactionStarted) {
          try {
            await transaction.rollback();
            logger.debug(`Transacción anterior revertida`);
          } catch (e) {
            logger.warn(
              `No se pudo revertir la transacción anterior: ${e.message}`
            );
          }
        }

        transaction = server2Pool.transaction();
        await transaction.begin();
        transactionStarted = true;
        logger.debug(`Nueva transacción iniciada después de reconexión`);
      }

      let batchInserted = 0;

      for (const record of batch) {
        try {
          // Truncar strings según las longitudes máximas
          for (const column in record) {
            if (typeof record[column] === "string") {
              // Obtener la longitud máxima (usando cache)
              let maxLength;
              if (columnLengthCache.has(column)) {
                maxLength = columnLengthCache.get(column);
              } else {
                maxLength = await getColumnMaxLength(name, column, server2Pool);
                columnLengthCache.set(column, maxLength);
              }

              if (maxLength > 0 && record[column]?.length > maxLength) {
                record[column] = record[column].substring(0, maxLength);
              }
            }
          }

          // Preparar consulta para inserción directa
          const insertRequest = transaction.request();
          insertRequest.timeout = 30000;

          const columns = Object.keys(record)
            .map((k) => `[${k}]`)
            .join(", ");
          const values = Object.keys(record)
            .map((k) => {
              insertRequest.input(k, record[k]);
              return `@${k}`;
            })
            .join(", ");

          const insertQuery = `
            INSERT INTO dbo.[${name}] (${columns})
            VALUES (${values});
            
            SELECT @@ROWCOUNT AS rowsAffected;
          `;

          const insertResult = await insertRequest.query(insertQuery);
          const rowsAffected = insertResult.recordset[0].rowsAffected;

          if (rowsAffected > 0) {
            totalInserted += rowsAffected;
            batchInserted += rowsAffected;
          }
        } catch (error) {
          // Registrar el error pero continuar con el siguiente registro
          errorCount++;
          logger.error(
            `Error al insertar registro en lote ${
              Math.floor(i / batchSize) + 1
            }:`,
            error
          );
        }
      }

      logger.debug(
        `Lote ${
          Math.floor(i / batchSize) + 1
        }: ${batchInserted} registros insertados`
      );

      // Actualizar progreso con throttling
      processedCount += batch.length;
      const progress = Math.round((processedCount / total) * 100);

      if (progress > lastReportedProgress + 5 || progress >= 100) {
        lastReportedProgress = progress;
        await TransferTask.findByIdAndUpdate(taskId, { progress });
        sendProgress(taskId, progress);
        logger.debug(`Progreso actualizado: ${progress}%`);
      }
    }

    // 9. Confirmar transacción
    if (transaction && transactionStarted) {
      await transaction.commit();
      logger.debug("Transacción confirmada correctamente");
      transactionStarted = false;
    }

    // 10. Actualizar estado a completado
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "completed",
      progress: 100,
    });
    sendProgress(taskId, 100);

    // 11. Verificar conteo final
    let finalCount = 0;
    try {
      const countRequest = server2Pool.request();
      const countResult = await countRequest.query(
        `SELECT COUNT(*) AS total FROM dbo.[${name}] WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(
        `Conteo final en tabla ${name}: ${finalCount} registros (${
          finalCount - initialCount
        } nuevos)`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo final: ${countError.message}`);
    }

    // 12. Preparar resultado
    const result = {
      success: true,
      message: "Transferencia completada",
      rows: data.length,
      inserted: totalInserted,
      errors: errorCount,
      initialCount,
      finalCount,
    };

    // 13. Enviar correo con el resultado
    await sendEmailNotification(task, result);

    return result;
  } catch (error) {
    // Manejo de errores
    logger.error(`Error en insertInBatchesSSE: ${error.message}`, error);

    // Revertir transacción en caso de error
    if (transaction && transactionStarted) {
      try {
        await transaction.rollback();
        logger.debug("Transacción revertida correctamente");
        transactionStarted = false;
      } catch (rollbackError) {
        logger.error("Error al revertir la transacción", rollbackError);
      }
    }

    // Actualizar estado de la tarea
    await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
    sendProgress(taskId, -1);

    // Enviar correo de error
    const task = await TransferTask.findById(taskId);
    if (task) {
      await sendEmailError(task, error);
    }

    throw error;
  } finally {
    // Cerrar conexión
    try {
      if (server2Pool && server2Pool.connected) {
        await server2Pool.close();
        logger.debug(
          `Conexión server2Pool cerrada correctamente para tarea ${taskId}`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión server2Pool para tarea ${taskId}:`,
        closeError
      );
    }
  }
}

/**
 * Envía notificación por correo del resultado de la transferencia
 */
async function sendEmailNotification(task, result) {
  try {
    // Preparar datos para el correo
    const emailSubject = result.success
      ? `✅ Transferencia Completada: ${task.name}`
      : `⚠️ Error en Transferencia: ${task.name}`;

    let emailTextBody = `Se ha ejecutado la transferencia '${
      task.name
    }' con los siguientes resultados:
      - Estado: ${result.success ? "Éxito" : "Error"}
      - Registros procesados: ${result.rows || 0}
      - Registros insertados: ${result.inserted || 0}
      ${result.errors ? `- Errores durante inserción: ${result.errors}` : ""}
      ${
        result.success
          ? ""
          : `- Error: ${result.errorDetail || "No especificado"}`
      }
    `;

    // Generar HTML para el correo
    let emailHtmlBody = `
      <p><strong>Resultado de la transferencia: ${task.name}</strong></p>
      <ul>
        <li><strong>Estado:</strong> ${
          result.success ? "✅ Éxito" : "❌ Error"
        }</li>
        <li><strong>Registros procesados:</strong> ${result.rows || 0}</li>
        <li><strong>Registros insertados:</strong> ${result.inserted || 0}</li>
        ${
          result.errors
            ? `<li><strong>Errores durante inserción:</strong> ${result.errors}</li>`
            : ""
        }
        ${
          result.initialCount !== undefined
            ? `<li><strong>Registros iniciales en destino:</strong> ${result.initialCount}</li>`
            : ""
        }
        ${
          result.finalCount !== undefined
            ? `<li><strong>Registros finales en destino:</strong> ${result.finalCount}</li>`
            : ""
        }
        ${
          !result.success
            ? `<li><strong>Error:</strong> ${
                result.errorDetail || "No especificado"
              }</li>`
            : ""
        }
      </ul>
    `;

    // Enviar correo con los resultados
    await sendEmail(
      "heriberto777@gmail.com", // Destinatario (podría ser una configuración o parámetro)
      emailSubject,
      emailTextBody,
      emailHtmlBody
    );

    logger.info(
      `📧 Correo de notificación enviado para la transferencia: ${task.name}`
    );
  } catch (emailError) {
    logger.error(
      `❌ Error al enviar correo de notificación: ${emailError.message}`
    );
  }
}

/**
 * Envía notificación por correo en caso de error
 */
async function sendEmailError(task, error) {
  try {
    await sendEmail(
      "heriberto777@gmail.com",
      `🚨 Error en Transferencia ${task.name}`,
      `Ocurrió un error durante la ejecución de la transferencia.\nError: ${error.message}`,
      `<p><strong>Error en Transferencia: ${task.name}</strong></p>
       <p>Se produjo un error que impidió la ejecución normal de la transferencia.</p>
       <p><strong>Mensaje de error:</strong> ${error.message}</p>
       <p><strong>Tabla:</strong> ${task.name}</p>`
    );

    logger.info(
      `📧 Correo de error enviado para la transferencia: ${task.name}`
    );
  } catch (emailError) {
    logger.error(`❌ Error al enviar correo de error: ${emailError.message}`);
  }
}

/**
 * 📌 Crea o actualiza una tarea de transferencia en MongoDB (upsert).
 */
async function upsertTransferTask(taskData) {
  try {
    let task = await TransferTask.findOne({ name: taskData.name });
    if (task) {
      task = await TransferTask.findByIdAndUpdate(task._id, taskData, {
        new: true,
      });
    } else {
      task = await TransferTask.create(taskData);
    }
    return { success: true, task };
  } catch (error) {
    logger.error("Error en upsertTransferTask:", error);
    return {
      success: false,
      message: "Error al guardar la tarea",
      error: error.message,
    };
  }
}

// Exportar todas las funciones
module.exports = {
  getPrimaryKey,
  getColumnMaxLength,
  getTransferTasks,
  executeTransferManual,
  executeTransfer,
  executeTransferUp,
  executeTransferDown,
  insertInBatchesSSE,
  upsertTransferTask,
};
