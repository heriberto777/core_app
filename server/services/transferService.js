/**
 * Ejecuta una transferencia de datos (Server1 -> Server2).
 * Implementación utilizando Tedious directamente.
 */
// services/transferService-tedious.js
const retry = require("./retry");
const { connectToDB, closeConnection } = require("./dbService");
const { SqlService } = require("./tediousService");
const TransferTask = require("../models/transferTaks");
const logger = require("./logger");

// Importar la función para SSE
const { sendProgress } = require("./progressSse");
const { sendEmail } = require("./emailService");

/**
 * Obtiene la clave primaria de la tabla desde validationRules.
 */
function getPrimaryKey(validationRules) {
  if (!validationRules || !validationRules.existenceCheck) {
    throw new Error("⚠️ Clave primaria no definida en validationRules.");
  }
  return validationRules.existenceCheck.key;
}

/**
 * Obtiene la longitud máxima permitida de una columna en SQL Server usando Tedious.
 */
async function getColumnMaxLength(tableName, columnName, connection) {
  const query = `
    SELECT CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = '${tableName}' 
      AND COLUMN_NAME = '${columnName}'
  `;

  const result = await SqlService.query(connection, query);
  return result.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
}

/**
 * Obtiene todas las tareas activas desde MongoDB (type: auto o both).
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
    transferType: task.transferType || "standard",
    execute: (updateProgress) => executeTransfer(task._id, updateProgress),
  }));
}

/**
 * Ejecuta una transferencia manualmente y envía resultados detallados por correo.
 * Incluye tabla con información de registros duplicados.
 * Adaptado para usar Tedious.
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

    // Determinar qué tipo de transferencia ejecutar
    let result;
    logger.info(`📌 Ejecutando transferencia para la tarea: ${task.name}`);
    result = await executeTransfer(taskId);

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

    // Construir el mensaje de correo
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

    // Enviar correo con los resultados
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

    // Enviar correo de error
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
 * Ejecuta una transferencia de datos (Server1 -> Server2).
 * Implementación adaptada para usar Tedious directamente.
 */
const executeTransfer = async (taskId) => {
  let server1Connection = null;
  let server2Connection = null;
  let lastReportedProgress = 0;
  let initialCount = 0;
  let duplicateCount = 0;
  let duplicatedRecords = [];

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

        logger.info(
          `🔍 Ejecutando tarea '${task.name}' (ID: ${taskId}, tipo: ${
            task.transferType || "estándar"
          })`
        );

        // 2. Actualizar estado
        await TransferTask.findByIdAndUpdate(taskId, {
          status: "running",
          progress: 0,
        });
        sendProgress(taskId, 0);
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
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "No se han especificado reglas de validación",
          };
        }

        // 4. Establecer conexiones con manejo mejorado
        try {
          // Intentar conectar a server1
          logger.debug(`Intentando conectar a server1 para tarea ${taskId}...`);
          server1Connection = await connectToDB("server1", 30000);

          if (!server1Connection) {
            throw new Error(
              "No se pudo establecer una conexión válida con server1"
            );
          }

          // Verificar con consulta sencilla
          try {
            await SqlService.query(server1Connection, "SELECT 1 AS test");
            logger.info(`✅ Conexión a server1 verificada con éxito`);
          } catch (testError) {
            logger.warn(
              `⚠️ Prueba de conexión a server1 falló: ${testError.message}`
            );

            // Reintentar la conexión una vez más
            try {
              await closeConnection(server1Connection);
            } catch (e) {}

            logger.info(`🔄 Reintentando conexión a server1...`);
            server1Connection = await connectToDB("server1", 30000);

            if (!server1Connection) {
              throw new Error(
                "No se pudo restablecer la conexión con server1 en el segundo intento"
              );
            }

            // Verificar la nueva conexión
            await SqlService.query(server1Connection, "SELECT 1 AS test");
            logger.info(`✅ Reconexión a server1 verificada con éxito`);
          }

          // Intentar conectar a server2
          logger.debug(`Intentando conectar a server2 para tarea ${taskId}...`);
          server2Connection = await connectToDB("server2", 30000);

          if (!server2Connection) {
            // Cerrar server1Connection que ya se conectó
            if (server1Connection) {
              await closeConnection(server1Connection);
              server1Connection = null;
            }
            throw new Error(
              "No se pudo establecer una conexión válida con server2"
            );
          }

          // Verificar con consulta sencilla
          try {
            await SqlService.query(server2Connection, "SELECT 1 AS test");
            logger.info(`✅ Conexión a server2 verificada con éxito`);
          } catch (testError) {
            logger.warn(
              `⚠️ Prueba de conexión a server2 falló: ${testError.message}`
            );

            // Cerrar y reintentar
            try {
              await closeConnection(server2Connection);
            } catch (e) {}

            logger.info(`🔄 Reintentando conexión a server2...`);
            server2Connection = await connectToDB("server2", 30000);

            if (!server2Connection) {
              await closeConnection(server1Connection);
              server1Connection = null;
              throw new Error(
                "No se pudo restablecer la conexión con server2 en el segundo intento"
              );
            }

            // Verificar la nueva conexión
            await SqlService.query(server2Connection, "SELECT 1 AS test");
            logger.info(`✅ Reconexión a server2 verificada con éxito`);
          }

          logger.info(
            `Conexiones establecidas y verificadas para tarea ${taskId}`
          );
        } catch (connError) {
          logger.error(
            `Error al establecer conexiones para tarea ${taskId}:`,
            connError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "Error al establecer conexiones de base de datos",
            errorDetail: connError.message,
          };
        }

        // 5. Verificar conteo inicial de registros
        try {
          const countResult = await SqlService.query(
            server2Connection,
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
          // Construir consulta final con parámetros
          let finalQuery = query;
          const params = {};

          if (parameters?.length > 0) {
            const conditions = [];
            for (const param of parameters) {
              params[param.field] = param.value;

              // Manejar diferentes tipos de operadores
              if (
                param.operator === "BETWEEN" &&
                param.value &&
                typeof param.value === "object"
              ) {
                params[`${param.field}_from`] = param.value.from;
                params[`${param.field}_to`] = param.value.to;
                conditions.push(
                  `${param.field} BETWEEN @${param.field}_from AND @${param.field}_to`
                );
              } else if (
                param.operator === "IN" &&
                Array.isArray(param.value)
              ) {
                // Para operador IN, creamos parámetros dinámicos para cada valor
                const placeholders = param.value.map((val, idx) => {
                  const paramName = `${param.field}_${idx}`;
                  params[paramName] = val;
                  return `@${paramName}`;
                });
                conditions.push(
                  `${param.field} IN (${placeholders.join(", ")})`
                );
              } else {
                // Operadores simples
                conditions.push(
                  `${param.field} ${param.operator} @${param.field}`
                );
              }
            }

            finalQuery += ` WHERE ${conditions.join(" AND ")}`;
          }

          logger.debug(
            `Ejecutando consulta en Server1: ${finalQuery.substring(0, 200)}...`
          );
          const result = await SqlService.query(
            server1Connection,
            finalQuery,
            params
          );
          data = result.recordset;
          logger.info(
            `Datos obtenidos correctamente: ${data.length} registros`
          );
        } catch (queryError) {
          logger.error("Error en la consulta en Server1", queryError);
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
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
          sendProgress(taskId, 100);
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
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "No se especificaron claves para identificar registros",
          };
        }

        // 9. Pre-cargar información de longitud de columnas
        const columnLengthCache = new Map();

        // 10. Preparar variables para tracking
        let affectedRecords = [];
        let totalInserted = 0;
        const batchSize = 500;

        // 11. Procesar por lotes para inserción
        try {
          // Obtener listado de registros existentes para verificar duplicados
          let existingKeysSet = new Set();

          if (initialCount > 0 && mergeKeys.length > 0) {
            logger.debug(
              `Obteniendo claves existentes para verificar duplicados...`
            );

            try {
              const keysQuery = `
                SELECT DISTINCT ${mergeKeys.map((k) => `[${k}]`).join(", ")} 
                FROM dbo.[${name}] WITH (NOLOCK)
              `;

              const keysResult = await SqlService.query(
                server2Connection,
                keysQuery
              );

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
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(data.length / batchSize);

            logger.debug(
              `Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)...`
            );

            // Verificar si la conexión sigue activa mediante una consulta sencilla
            try {
              await SqlService.query(server2Connection, "SELECT 1 AS test");
            } catch (connError) {
              logger.warn(
                `Conexión perdida durante procesamiento, intentando reconectar...`
              );
              try {
                await closeConnection(server2Connection);
              } catch (e) {}

              server2Connection = await connectToDB("server2", 30000);
              if (!server2Connection) {
                throw new Error(
                  "No se pudo restablecer la conexión durante el procesamiento"
                );
              }
            }

            // Procesar cada registro individualmente para inserción
            let batchInserted = 0;
            let batchSkipped = 0;
            const insertBatchSize = 50;

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
                        // Consultar longitud máxima de la columna
                        const lengthQuery = `
                          SELECT CHARACTER_MAXIMUM_LENGTH 
                          FROM INFORMATION_SCHEMA.COLUMNS 
                          WHERE TABLE_NAME = '${name}' 
                            AND COLUMN_NAME = '${column}'
                        `;
                        const lengthResult = await SqlService.query(
                          server2Connection,
                          lengthQuery
                        );
                        maxLength =
                          lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH ||
                          0;
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

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir campos adicionales de interés
                      const additionalFields = Object.keys(record)
                        .filter((k) => !mergeKeys.includes(k))
                        .slice(0, 5);

                      additionalFields.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      duplicatedRecords.push(duplicateRecord);
                      logger.warn(
                        `⚠️ Registro duplicado encontrado y omitido: ${duplicateInfo}`
                      );
                      continue;
                    }
                  }

                  // Preparar consulta para inserción
                  const columns = Object.keys(record)
                    .map((k) => `[${k}]`)
                    .join(", ");

                  const paramPlaceholders = Object.keys(record)
                    .map((k) => `@${k}`)
                    .join(", ");

                  const insertQuery = `
                    INSERT INTO dbo.[${name}] (${columns})
                    VALUES (${paramPlaceholders});
                    
                    SELECT @@ROWCOUNT AS rowsAffected;
                  `;

                  // Ejecutar la inserción
                  try {
                    const params = {};
                    Object.entries(record).forEach(([key, value]) => {
                      params[key] = value;
                    });

                    const insertResult = await SqlService.query(
                      server2Connection,
                      insertQuery,
                      params
                    );
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
                      insertError.number === 2601 ||
                      (insertError.message &&
                        (insertError.message.includes("PRIMARY KEY") ||
                          insertError.message.includes("UNIQUE KEY") ||
                          insertError.message.includes("duplicate key")))
                    ) {
                      duplicateCount++;
                      batchSkipped++;

                      // Construir mensaje para identificar el registro duplicado
                      const duplicateInfo = mergeKeys
                        .map((k) => `${k}=${record[k]}`)
                        .join(", ");

                      // Guardar información del registro duplicado
                      const duplicateRecord = {};
                      mergeKeys.forEach((key) => {
                        duplicateRecord[key] = record[key];
                      });

                      // Añadir información adicional
                      duplicateRecord._errorMessage =
                        insertError.message.substring(0, 100);
                      duplicatedRecords.push(duplicateRecord);

                      logger.warn(
                        `⚠️ Error de inserción por duplicado: ${duplicateInfo}`
                      );
                    } else {
                      // Verificar si es error de conexión
                      if (
                        insertError.message &&
                        (insertError.message.includes("conexión") ||
                          insertError.message.includes("connection") ||
                          insertError.message.includes("timeout") ||
                          insertError.message.includes("Timeout"))
                      ) {
                        // Reconectar y reintentar
                        logger.warn(
                          `Error de conexión durante inserción, reconectando...`
                        );

                        try {
                          await closeConnection(server2Connection);
                        } catch (e) {}

                        server2Connection = await connectToDB("server2", 30000);

                        if (!server2Connection) {
                          throw new Error(
                            "No se pudo restablecer la conexión para continuar con las inserciones"
                          );
                        }

                        // Reintentar la inserción
                        const retryParams = {};
                        Object.entries(record).forEach(([key, value]) => {
                          retryParams[key] = value;
                        });

                        const retryResult = await SqlService.query(
                          server2Connection,
                          insertQuery,
                          retryParams
                        );
                        const rowsAffected =
                          retryResult.recordset[0].rowsAffected;

                        if (rowsAffected > 0) {
                          totalInserted += rowsAffected;
                          batchInserted += rowsAffected;
                          logger.info(
                            `Inserción exitosa después de reconexión`
                          );
                        }
                      } else {
                        // Otros errores, propagar
                        logger.error(
                          "Error al insertar registro:",
                          insertError
                        );
                        throw new Error(
                          `Error al insertar registro: ${insertError.message}`
                        );
                      }
                    }
                  }
                } catch (recordError) {
                  // Errores no relacionados con duplicados
                  if (
                    recordError.number !== 2627 &&
                    recordError.number !== 2601 &&
                    !recordError.message.includes("duplicate key")
                  ) {
                    throw recordError;
                  }
                }
              }
            }

            logger.debug(
              `Lote ${batchNumber}: ${batchInserted} registros insertados, ${batchSkipped} omitidos por duplicados`
            );

            // Actualizar progreso con throttling
            const progress = Math.round(
              ((i + batch.length) / data.length) * 100
            );
            if (progress > lastReportedProgress + 5 || progress >= 100) {
              lastReportedProgress = progress;
              await TransferTask.findByIdAndUpdate(taskId, { progress });
              sendProgress(taskId, progress);
              logger.debug(`Progreso actualizado: ${progress}%`);
            }
          }

          // 12. Actualizar estado a completado
          await TransferTask.findByIdAndUpdate(taskId, {
            status: "completed",
            progress: 100,
          });
          sendProgress(taskId, 100);

          // 13. Verificar conteo final
          let finalCount = 0;
          try {
            const countResult = await SqlService.query(
              server2Connection,
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

          // 14. Ejecutar consulta post-actualización
          if (postUpdateQuery && affectedRecords.length > 0) {
            try {
              // Verificar si la conexión a server1 sigue activa
              try {
                await SqlService.query(server1Connection, "SELECT 1 AS test");
              } catch (testError) {
                logger.warn(
                  "Reconectando al servidor 1 para post-actualización"
                );
                try {
                  await closeConnection(server1Connection);
                } catch (e) {}

                server1Connection = await connectToDB("server1", 30000);
                if (!server1Connection) {
                  throw new Error(
                    "No se pudo reconectar a server1 para post-actualización"
                  );
                }
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

                // Procesar claves - quitar prefijo CN
                const processedKeys = keyBatch.map((key) =>
                  typeof key === "string" && key.startsWith("CN")
                    ? key.replace(/^CN/, "")
                    : key
                );

                // Construir consulta con parámetros
                const params = {};
                processedKeys.forEach((key, index) => {
                  params[`key${index}`] = key;
                });

                // Obtener la clave correcta para la consulta WHERE
                const primaryKeyField =
                  postUpdateMapping?.tableKey || primaryKeys[0];

                // Crear lista de parámetros
                const keyParams = processedKeys
                  .map((_, index) => `@key${index}`)
                  .join(", ");

                // Construir consulta dinámica
                const dynamicUpdateQuery = `${postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

                try {
                  // Ejecutar la actualización
                  const updateResult = await SqlService.query(
                    server1Connection,
                    dynamicUpdateQuery,
                    params
                  );
                  logger.info(
                    `Post-actualización: ${updateResult.rowsAffected} filas afectadas`
                  );
                } catch (updateError) {
                  logger.error(
                    `Error en consulta post-actualización:`,
                    updateError
                  );

                  // Si es un error de conexión, intentar reconectar y reintentar
                  if (
                    updateError.message &&
                    (updateError.message.includes("conexión") ||
                      updateError.message.includes("connection") ||
                      updateError.message.includes("timeout"))
                  ) {
                    logger.info(
                      "Reintentando post-actualización tras error de conexión"
                    );

                    try {
                      await closeConnection(server1Connection);
                    } catch (e) {}

                    server1Connection = await connectToDB("server1", 30000);
                    if (!server1Connection) {
                      throw new Error(
                        "No se pudo reconectar para reintentar post-actualización"
                      );
                    }

                    // Reintentar la actualización
                    const retryResult = await SqlService.query(
                      server1Connection,
                      dynamicUpdateQuery,
                      params
                    );
                    logger.info(
                      `Post-actualización (reintento): ${retryResult.rowsAffected} filas afectadas`
                    );
                  }
                }
              }

              logger.info(
                `✅ Consulta post-transferencia ejecutada correctamente para ${name}`
              );
            } catch (postUpdateError) {
              logger.error(
                `❌ Error en consulta post-transferencia`,
                postUpdateError
              );
              // No fallamos toda la operación, solo registramos el error de post-actualización
            }
          }

          // 15. Preparar resultado final
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
        } catch (processingError) {
          logger.error(
            "Error durante el procesamiento de datos",
            processingError
          );
          await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
          sendProgress(taskId, -1);
          return {
            success: false,
            message: "Error durante el procesamiento de datos",
            errorDetail: processingError.message,
          };
        }
      } catch (outerError) {
        // Manejo de errores generales
        logger.error("Error general en la transferencia", outerError);
        await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
        sendProgress(taskId, -1);
        return {
          success: false,
          message: "Error general en la transferencia",
          errorDetail: outerError.message,
        };
      } finally {
        // Cerrar las conexiones
        try {
          if (server1Connection) {
            await closeConnection(server1Connection);
            logger.debug(`Conexión server1 cerrada correctamente`);
          }
        } catch (closeError) {
          logger.error(`Error al cerrar conexión server1:`, closeError);
        }

        try {
          if (server2Connection) {
            await closeConnection(server2Connection);
            logger.debug(`Conexión server2 cerrada correctamente`);
          }
        } catch (closeError) {
          logger.error(`Error al cerrar conexión server2:`, closeError);
        }
      }
    },
    3,
    5000,
    `Ejecutar Transferencia para tarea ${taskId}`
  );
};

/**
 * Función que inserta TODOS los datos en lotes, reportando progreso SSE y enviando correo al finalizar.
 * No verifica duplicados, simplemente inserta todos los registros.
 * Requiere que el frontend esté suscrito a /api/transfer/progress/:taskId
 * Adaptada para Tedious.
 */
async function insertInBatchesSSE(taskId, data, batchSize = 100) {
  let server2Connection = null;
  let lastReportedProgress = 0;
  let initialCount = 0;
  let taskName = "desconocida"; // Inicializar taskName por defecto

  try {
    // 1) Obtener la tarea - Inicializar 'task' antes de usarla
    const task = await TransferTask.findById(taskId);
    if (!task) {
      throw new Error(`No se encontró la tarea con ID: ${taskId}`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${task.name}" está inactiva.`);
    }

    // Guardar el nombre de la tarea para usarlo en logs y mensajes
    taskName = task.name;

    // 2) Marcar status "running", progress=0
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    // 3) Conectarse a la DB de destino con manejo mejorado de conexiones
    try {
      logger.debug(
        `Intentando conectar a server2 para inserción en lotes (taskId: ${taskId}, task: ${taskName})...`
      );
      server2Connection = await connectToDB("server2", 30000);

      if (!server2Connection) {
        throw new Error(
          "No se pudo establecer una conexión válida con server2"
        );
      }

      // Verificar conexión con una consulta simple
      await SqlService.query(server2Connection, "SELECT 1 AS test");
      logger.info(
        `Conexión establecida y verificada para inserción en lotes (taskId: ${taskId}, task: ${taskName})`
      );
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para inserción en lotes (taskId: ${taskId}, task: ${taskName}):`,
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
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      initialCount = countResult.recordset[0].total;
      logger.info(
        `Conteo inicial en tabla ${task.name}: ${initialCount} registros`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo inicial: ${countError.message}`);
      initialCount = 0;
    }

    // 5) Pre-cargar información de longitud de columnas
    const columnLengthCache = new Map();

    // 6) Contadores para tracking
    const total = data.length;
    let totalInserted = 0;
    let processedCount = 0;
    let errorCount = 0;

    // 7) Procesar data en lotes - SIN TRANSACCIONES PARA MAYOR ESTABILIDAD
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const currentBatchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(data.length / batchSize);

      logger.debug(
        `Procesando lote ${currentBatchNumber}/${totalBatches} (${batch.length} registros)...`
      );

      // Verificar si la conexión sigue activa y reconectar si es necesario
      try {
        await SqlService.query(server2Connection, "SELECT 1 AS test");
      } catch (connError) {
        logger.warn(
          `Conexión perdida con server2 durante procesamiento, intentando reconectar...`
        );

        try {
          await closeConnection(server2Connection);
        } catch (e) {}

        server2Connection = await connectToDB("server2", 30000);
        if (!server2Connection) {
          throw new Error("No se pudo restablecer la conexión con server2");
        }

        // Verificar la nueva conexión
        await SqlService.query(server2Connection, "SELECT 1 AS test");
        logger.info(
          `Reconexión exitosa a server2 para lote ${currentBatchNumber}`
        );
      }

      // Procesar cada registro del lote de forma independiente
      let batchInserted = 0;
      let batchErrored = 0;

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
                // Consultar longitud máxima de la columna
                const lengthQuery = `
                  SELECT CHARACTER_MAXIMUM_LENGTH 
                  FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_NAME = '${task.name}' 
                    AND COLUMN_NAME = '${column}'
                `;
                const lengthResult = await SqlService.query(
                  server2Connection,
                  lengthQuery
                );
                maxLength =
                  lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
                columnLengthCache.set(column, maxLength);
              }

              if (maxLength > 0 && record[column]?.length > maxLength) {
                record[column] = record[column].substring(0, maxLength);
              }
            }
          }

          // Preparar consulta para inserción
          const columns = Object.keys(record)
            .map((k) => `[${k}]`)
            .join(", ");
          const paramNames = Object.keys(record)
            .map((k) => `@${k}`)
            .join(", ");

          const insertQuery = `
            INSERT INTO dbo.[${task.name}] (${columns})
            VALUES (${paramNames});
            
            SELECT @@ROWCOUNT AS rowsAffected;
          `;

          // Preparar parámetros
          const params = {};
          Object.entries(record).forEach(([key, value]) => {
            params[key] = value;
          });

          // Ejecutar inserción
          try {
            const insertResult = await SqlService.query(
              server2Connection,
              insertQuery,
              params
            );
            const rowsAffected = insertResult.recordset[0]?.rowsAffected || 0;

            if (rowsAffected > 0) {
              totalInserted += rowsAffected;
              batchInserted += rowsAffected;
            }
          } catch (insertError) {
            // Verificar si es error de conexión
            if (
              insertError.message &&
              (insertError.message.includes("conexión") ||
                insertError.message.includes("connection") ||
                insertError.message.includes("timeout") ||
                insertError.message.includes("Timeout"))
            ) {
              // Intentar reconectar y reintentar
              logger.warn(
                `Error de conexión durante inserción, reconectando...`
              );

              try {
                await closeConnection(server2Connection);
              } catch (e) {}

              server2Connection = await connectToDB("server2", 30000);
              if (!server2Connection) {
                throw new Error(
                  "No se pudo restablecer la conexión para continuar inserciones"
                );
              }

              // Reintentar inserción
              const retryResult = await SqlService.query(
                server2Connection,
                insertQuery,
                params
              );
              const rowsAffected = retryResult.recordset[0]?.rowsAffected || 0;

              if (rowsAffected > 0) {
                totalInserted += rowsAffected;
                batchInserted += rowsAffected;
                logger.info(`Inserción exitosa después de reconexión`);
              } else {
                throw new Error(
                  "La inserción no afectó ninguna fila después de reconexión"
                );
              }
            } else {
              // Otros errores, registrar y continuar
              throw insertError;
            }
          }
        } catch (recordError) {
          // Registrar el error pero continuar con el siguiente registro
          errorCount++;
          batchErrored++;
          logger.error(
            `Error al insertar registro en lote ${currentBatchNumber}:`,
            recordError
          );
        }
      }

      logger.info(
        `Lote ${currentBatchNumber}/${totalBatches}: ${batchInserted} registros insertados, ${batchErrored} errores`
      );

      // Actualizar progreso después de cada lote
      processedCount += batch.length;
      const progress = Math.round((processedCount / total) * 100);

      if (progress > lastReportedProgress + 5 || progress >= 100) {
        lastReportedProgress = progress;
        await TransferTask.findByIdAndUpdate(taskId, { progress });
        sendProgress(taskId, progress);
        logger.debug(`Progreso actualizado: ${progress}%`);
      }
    }

    // 8. Actualizar estado a completado
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "completed",
      progress: 100,
    });
    sendProgress(taskId, 100);

    // 9. Verificar conteo final
    let finalCount = 0;
    try {
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(
        `Conteo final en tabla ${task.name}: ${finalCount} registros (${
          finalCount - initialCount
        } nuevos)`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo final: ${countError.message}`);
    }

    // 10. Preparar resultado
    const result = {
      success: true,
      message: "Transferencia completada",
      rows: data.length,
      inserted: totalInserted,
      errors: errorCount,
      initialCount,
      finalCount,
    };

    // 11. Enviar correo con el resultado
    try {
      await sendEmailNotification(task, result);
      logger.info(`Correo de notificación enviado para ${taskName}`);
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de notificación: ${emailError.message}`
      );
    }

    return result;
  } catch (error) {
    // Manejo de errores generales
    logger.error(
      `Error en insertInBatchesSSE para ${taskName}: ${error.message}`,
      error
    );

    // Actualizar estado de la tarea
    await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
    sendProgress(taskId, -1);

    // Enviar correo de error
    try {
      const task = await TransferTask.findById(taskId);
      if (task) {
        await sendEmailError(task, error);
        logger.info(`Correo de error enviado para ${taskName}`);
      }
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de error para ${taskName}: ${emailError.message}`
      );
    }

    throw error;
  } finally {
    // Cerrar conexión
    try {
      if (server2Connection) {
        await closeConnection(server2Connection);
        logger.debug(
          `Conexión server2 cerrada correctamente para inserción en lotes de ${taskName} (taskId: ${taskId})`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión server2 para inserción en lotes de ${taskName} (taskId: ${taskId}):`,
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
 * Crea o actualiza una tarea de transferencia en MongoDB (upsert).
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
  insertInBatchesSSE,
  upsertTransferTask,
  sendEmailNotification,
  sendEmailError,
};

/**
 * 📌 Función que inserta TODOS los datos en lotes, reportando progreso SSE y enviando correo al finalizar.
 * No verifica duplicados, simplemente inserta todos los registros.
 * Requiere que el frontend esté suscrito a /api/transfer/progress/:taskId
 */
async function insertInBatchesSSE(taskId, data, batchSize = 100) {
  let server2Connection = null;
  let lastReportedProgress = 0;
  let initialCount = 0;
  let taskName = "desconocida"; // Inicializar taskName por defecto

  try {
    // 1) Obtener la tarea - Inicializar 'task' antes de usarla
    const task = await TransferTask.findById(taskId);
    if (!task) {
      throw new Error(`No se encontró la tarea con ID: ${taskId}`);
    }
    if (!task.active) {
      throw new Error(`La tarea "${task.name}" está inactiva.`);
    }

    // Guardar el nombre de la tarea para usarlo en logs y mensajes
    taskName = task.name;

    // 2) Marcar status "running", progress=0
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "running",
      progress: 0,
    });
    sendProgress(taskId, 0);

    // 3) Conectarse a la DB de destino con manejo mejorado de conexiones
    try {
      logger.debug(
        `Intentando conectar a server2 para inserción en lotes (taskId: ${taskId}, task: ${taskName})...`
      );
      server2Connection = await connectToDB("server2", 30000);

      if (!server2Connection) {
        throw new Error(
          "No se pudo establecer una conexión válida con server2"
        );
      }

      // Verificar conexión con una consulta simple
      await SqlService.query(server2Connection, "SELECT 1 AS test");
      logger.info(
        `Conexión establecida y verificada para inserción en lotes (taskId: ${taskId}, task: ${taskName})`
      );
    } catch (connError) {
      logger.error(
        `Error al establecer conexión para inserción en lotes (taskId: ${taskId}, task: ${taskName}):`,
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
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      initialCount = countResult.recordset[0].total;
      logger.info(
        `Conteo inicial en tabla ${task.name}: ${initialCount} registros`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo inicial: ${countError.message}`);
      initialCount = 0;
    }

    // 5) Pre-cargar información de longitud de columnas
    const columnLengthCache = new Map();

    // 6) Contadores para tracking
    const total = data.length;
    let totalInserted = 0;
    let processedCount = 0;
    let errorCount = 0;

    // 7) Procesar data en lotes - SIN TRANSACCIONES PARA MAYOR ESTABILIDAD
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const currentBatchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(data.length / batchSize);

      logger.debug(
        `Procesando lote ${currentBatchNumber}/${totalBatches} (${batch.length} registros)...`
      );

      // Verificar si la conexión sigue activa y reconectar si es necesario
      try {
        await SqlService.query(server2Connection, "SELECT 1 AS test");
      } catch (connError) {
        logger.warn(
          `Conexión perdida con server2 durante procesamiento, intentando reconectar...`
        );

        try {
          await closeConnection(server2Connection);
        } catch (e) {}

        server2Connection = await connectToDB("server2", 30000);
        if (!server2Connection) {
          throw new Error("No se pudo restablecer la conexión con server2");
        }

        // Verificar la nueva conexión
        await SqlService.query(server2Connection, "SELECT 1 AS test");
        logger.info(
          `Reconexión exitosa a server2 para lote ${currentBatchNumber}`
        );
      }

      // Procesar cada registro del lote de forma independiente
      let batchInserted = 0;
      let batchErrored = 0;

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
                // Consultar longitud máxima de la columna
                const lengthQuery = `
                  SELECT CHARACTER_MAXIMUM_LENGTH 
                  FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_NAME = '${task.name}' 
                    AND COLUMN_NAME = '${column}'
                `;
                const lengthResult = await SqlService.query(
                  server2Connection,
                  lengthQuery
                );
                maxLength =
                  lengthResult.recordset[0]?.CHARACTER_MAXIMUM_LENGTH || 0;
                columnLengthCache.set(column, maxLength);
              }

              if (maxLength > 0 && record[column]?.length > maxLength) {
                record[column] = record[column].substring(0, maxLength);
              }
            }
          }

          // Preparar consulta para inserción
          const columns = Object.keys(record)
            .map((k) => `[${k}]`)
            .join(", ");
          const paramNames = Object.keys(record)
            .map((k) => `@${k}`)
            .join(", ");

          const insertQuery = `
            INSERT INTO dbo.[${task.name}] (${columns})
            VALUES (${paramNames});
            
            SELECT @@ROWCOUNT AS rowsAffected;
          `;

          // Preparar parámetros
          const params = {};
          Object.entries(record).forEach(([key, value]) => {
            params[key] = value;
          });

          // Ejecutar inserción
          try {
            const insertResult = await SqlService.query(
              server2Connection,
              insertQuery,
              params
            );
            const rowsAffected = insertResult.recordset[0]?.rowsAffected || 0;

            if (rowsAffected > 0) {
              totalInserted += rowsAffected;
              batchInserted += rowsAffected;
            }
          } catch (insertError) {
            // Verificar si es error de conexión
            if (
              insertError.message &&
              (insertError.message.includes("conexión") ||
                insertError.message.includes("connection") ||
                insertError.message.includes("timeout") ||
                insertError.message.includes("Timeout"))
            ) {
              // Intentar reconectar y reintentar
              logger.warn(
                `Error de conexión durante inserción, reconectando...`
              );

              try {
                await closeConnection(server2Connection);
              } catch (e) {}

              server2Connection = await connectToDB("server2", 30000);
              if (!server2Connection) {
                throw new Error(
                  "No se pudo restablecer la conexión para continuar inserciones"
                );
              }

              // Reintentar inserción
              const retryResult = await SqlService.query(
                server2Connection,
                insertQuery,
                params
              );
              const rowsAffected = retryResult.recordset[0]?.rowsAffected || 0;

              if (rowsAffected > 0) {
                totalInserted += rowsAffected;
                batchInserted += rowsAffected;
                logger.info(`Inserción exitosa después de reconexión`);
              } else {
                throw new Error(
                  "La inserción no afectó ninguna fila después de reconexión"
                );
              }
            } else {
              // Otros errores, registrar y continuar
              throw insertError;
            }
          }
        } catch (recordError) {
          // Registrar el error pero continuar con el siguiente registro
          errorCount++;
          batchErrored++;
          logger.error(
            `Error al insertar registro en lote ${currentBatchNumber}:`,
            recordError
          );
        }
      }

      logger.info(
        `Lote ${currentBatchNumber}/${totalBatches}: ${batchInserted} registros insertados, ${batchErrored} errores`
      );

      // Actualizar progreso después de cada lote
      processedCount += batch.length;
      const progress = Math.round((processedCount / total) * 100);

      if (progress > lastReportedProgress + 5 || progress >= 100) {
        lastReportedProgress = progress;
        await TransferTask.findByIdAndUpdate(taskId, { progress });
        sendProgress(taskId, progress);
        logger.debug(`Progreso actualizado: ${progress}%`);
      }
    }

    // 8. Actualizar estado a completado
    await TransferTask.findByIdAndUpdate(taskId, {
      status: "completed",
      progress: 100,
    });
    sendProgress(taskId, 100);

    // 9. Verificar conteo final
    let finalCount = 0;
    try {
      const countResult = await SqlService.query(
        server2Connection,
        `SELECT COUNT(*) AS total FROM dbo.[${task.name}] WITH (NOLOCK)`
      );
      finalCount = countResult.recordset[0].total;
      logger.info(
        `Conteo final en tabla ${task.name}: ${finalCount} registros (${
          finalCount - initialCount
        } nuevos)`
      );
    } catch (countError) {
      logger.warn(`No se pudo verificar conteo final: ${countError.message}`);
    }

    // 10. Preparar resultado
    const result = {
      success: true,
      message: "Transferencia completada",
      rows: data.length,
      inserted: totalInserted,
      errors: errorCount,
      initialCount,
      finalCount,
    };

    // 11. Enviar correo con el resultado
    try {
      await sendEmailNotification(task, result);
      logger.info(`Correo de notificación enviado para ${taskName}`);
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de notificación: ${emailError.message}`
      );
    }

    return result;
  } catch (error) {
    // Manejo de errores generales
    logger.error(
      `Error en insertInBatchesSSE para ${taskName}: ${error.message}`,
      error
    );

    // Actualizar estado de la tarea
    await TransferTask.findByIdAndUpdate(taskId, { status: "failed" });
    sendProgress(taskId, -1);

    // Enviar correo de error
    try {
      const task = await TransferTask.findById(taskId);
      if (task) {
        await sendEmailError(task, error);
        logger.info(`Correo de error enviado para ${taskName}`);
      }
    } catch (emailError) {
      logger.error(
        `Error al enviar correo de error para ${taskName}: ${emailError.message}`
      );
    }

    throw error;
  } finally {
    // Cerrar conexión
    try {
      if (server2Connection) {
        await closeConnection(server2Connection);
        logger.debug(
          `Conexión server2 cerrada correctamente para inserción en lotes de ${taskName} (taskId: ${taskId})`
        );
      }
    } catch (closeError) {
      logger.error(
        `Error al cerrar conexión server2 para inserción en lotes de ${taskName} (taskId: ${taskId}):`,
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
  insertInBatchesSSE,
  upsertTransferTask,
};
