"use strict";

const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");
const { withConnection } = DatabaseServiceAdapter;
const TransferTask = require("../models/transferTaskModel");
const TaskExecution = require("../models/taskExecutionModel");
const transferService = require("../services/transferService");
const logger = require("../services/logger");

/**
 * Obtiene pedidos pendientes de Server2
 */
const getOrders = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      const { bodega, dateFrom, dateTo, search } = req.query;

      let query = `
        SELECT FAC.NUM_PED, FAC.FEC_PED, FAC.COD_CLI, CLI.NOM_CLI, FAC.TOTAL_PED, FAC.ESTADO_PED, FAC.COD_BOD
        FROM FAC_ENC_PED FAC
        INNER JOIN CLIENTES CLI ON FAC.COD_CLI = CLI.COD_CLI
        WHERE FAC.ESTADO_PED = 'P'
      `;

      const params = {};
      if (bodega) {
        query += " AND FAC.COD_BOD = @bodega";
        params.bodega = bodega;
      }
      if (dateFrom) {
        query += " AND FAC.FEC_PED >= @dateFrom";
        params.dateFrom = dateFrom;
      }
      if (dateTo) {
        query += " AND FAC.FEC_PED <= @dateTo";
        params.dateTo = dateTo;
      }
      if (search) {
        query += " AND (FAC.NUM_PED LIKE @search OR CLI.NOM_CLI LIKE @search)";
        params.search = `%${search}%`;
      }

      query += " ORDER BY FAC.FEC_PED DESC";

      const result = await DatabaseServiceAdapter.query(connection, query, params);

      return res.status(200).json({
        success: true,
        message: "Pedidos obtenidos correctamente",
        data: result.recordset,
      });
    } catch (error) {
      logger.error("Error en getOrders:", error);
      return res.status(500).json({
        success: false,
        message: "Error al recuperar pedidos pendientes",
        error: error.message,
      });
    }
  });
};

/**
 * Obtiene el detalle de un pedido específico
 */
const getOrderDetails = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      const { orderId } = req.params;

      const headerQuery = `
        SELECT FAC.*, CLI.NOM_CLI, CLI.DIR_CLI, CLI.TEL_CLI
        FROM FAC_ENC_PED FAC
        INNER JOIN CLIENTES CLI ON FAC.COD_CLI = CLI.COD_CLI
        WHERE FAC.NUM_PED = @orderId
      `;

      const headerResult = await DatabaseServiceAdapter.query(connection, headerQuery, { orderId });
      const orderHeader = headerResult.recordset[0];

      if (!orderHeader) {
        logger.warn(`Pedido ${orderId} no encontrado en getOrderDetails.`);
        return res.status(404).json({ success: false, message: "Pedido no encontrado" });
      }

      const itemsQuery = `
        SELECT DET.*, PRO.DESCRIPCION AS DES_PRO
        FROM FAC_DET_PED DET
        LEFT JOIN PRODUCTOS PRO ON DET.COD_PRO = PRO.COD_PRO
        WHERE DET.NUM_PED = @orderId
        ORDER BY DET.NUM_LIN
      `;

      const itemsResult = await DatabaseServiceAdapter.query(connection, itemsQuery, { orderId });

      return res.status(200).json({
        success: true,
        message: "Detalles del pedido obtenidos correctamente",
        data: { ...orderHeader, items: itemsResult.recordset },
      });
    } catch (error) {
      logger.error(`Error en getOrderDetails (${req.params.orderId}):`, error);
      return res.status(500).json({
        success: false,
        message: "Error al recuperar detalles del pedido",
        error: error.message,
      });
    }
  });
};

/**
 * Obtiene las bodegas disponibles para filtrar
 */
const getWarehouses = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      const query = `
        SELECT DISTINCT BOD.COD_BOD, BOD.NOM_BOD
        FROM INV_BODEGAS BOD
        INNER JOIN FAC_ENC_PED PED ON BOD.COD_BOD = PED.COD_BOD
        WHERE BOD.ACTIVA = 'S'
        ORDER BY BOD.COD_BOD
      `;

      const result = await DatabaseServiceAdapter.query(connection, query);
      return res.status(200).json({
        success: true,
        message: "Bodegas obtenidas correctamente",
        data: result.recordset,
      });
    } catch (error) {
      logger.error("Error en getWarehouses:", error);
      return res.status(500).json({
        success: false,
        message: "Error al obtener catálogo de bodegas",
        error: error.message,
      });
    }
  });
};

/**
 * Procesa los pedidos seleccionados usando la tarea de transferencia
 */
const processOrders = async (req, res) => {
  try {
    const { orders, taskName } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const task = await TransferTask.findOne({ name: taskName });
    if (!task) {
      logger.warn(`Intento de procesamiento con tarea no existente: ${taskName}`);
      return res.status(404).json({ success: false, message: `La tarea "${taskName}" no existe` });
    }
    if (!task.active) {
      logger.warn(`Intento de procesamiento con tarea desactivada: ${taskName}`);
      return res.status(400).json({ success: false, message: `La tarea "${taskName}" está desactivada` });
    }

    const taskExecution = new TaskExecution({
      taskId: task._id,
      taskName: task.name,
      date: new Date(),
      status: "running",
      metadata: { orderCount: orders.length, orderIds: orders, startedBy: userId },
    });

    await taskExecution.save();
    const executionId = taskExecution._id;

    logger.info(`Iniciando procesamiento de ${orders.length} pedidos con tarea ${taskName} (Exec: ${executionId}) por ${userId}`);

    await TransferTask.findByIdAndUpdate(task._id, { status: "running", progress: 0 });

    // Ejecución asíncrona
    transferService
      .executeTransferWithRetry(task._id)
      .then(async (result) => {
        logger.info(`Procesamiento completado para Exec ${executionId}: ${JSON.stringify(result)}`);

        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "completed",
          executionTime: Date.now() - taskExecution.date.getTime(),
          totalRecords: orders.length,
          successfulRecords: result.inserted || 0,
          details: result,
        });

        await withConnection("server2", async (connection) => {
          for (const orderId of orders) {
            try {
              await DatabaseServiceAdapter.query(
                connection,
                `INSERT INTO PROCESSED_ORDERS (NUM_PED, PROCESS_DATE, TASK_NAME, EXECUTION_ID)
                 VALUES (@orderId, @processDate, @taskName, @executionId)`,
                { orderId, processDate: new Date(), taskName: task.name, executionId: executionId.toString() }
              );
            } catch (err) {
              logger.warn(`No se pudo registrar pedido ${orderId} en PROCESSED_ORDERS para Exec ${executionId}: ${err.message}`);
            }
          }
        });
      })
      .catch(async (error) => {
        logger.error(`Fallo crítico en procesamiento de pedidos para Exec ${executionId}: ${error.message}`);
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - taskExecution.date.getTime(),
          errorMessage: error.message,
        });
      });

    return res.status(200).json({
      success: true,
      message: `Procesamiento de ${orders.length} pedidos iniciado en segundo plano`,
      data: { executionId }
    });
  } catch (error) {
    logger.error("Error en processOrders:", error);
    return res.status(500).json({
      success: false,
      message: "Error al iniciar el proceso de transferencia",
      error: error.message,
    });
  }
};

module.exports = {
  getOrders,
  getOrderDetails,
  processOrders,
  getWarehouses,
};
