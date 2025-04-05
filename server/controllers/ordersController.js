// controllers/ordersController.js
const TransferSummary = require("../models/transferSummaryModel");
const { withConnection } = require("../utils/dbUtils");
const { SqlService } = require("../services/SqlService");
const logger = require("../services/logger");
const TransferTask = require("../models/transferTaks");
const xlsx = require("xlsx");
const transferService = require("../services/transferService");
const TaskExecution = require("../models/taskExecutionModel");

/**
 * Obtiene pedidos desde la tabla FAC_ENC_PED de Server2
 */
const getOrders = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      // Extraer filtros de la query
      const { dateFrom, dateTo, status, warehouse, showProcessed } = req.query;

      // Construir consulta con filtros
      let query = `
        SELECT TOP 500
          ENC.COD_CIA,
          ENC.NUM_PED,
          ENC.COD_ZON,
          ENC.COD_CLT,
          ENC.TIP_DOC,
          ENC.FEC_PED,
          ENC.MON_IMP_VT,
          ENC.MON_IMP_CS,
          ENC.MON_CIV,
          ENC.MON_SIV,
          ENC.MON_DSC,
          ENC.NUM_ITM,
          ENC.ESTADO,
          ENC.COD_BOD,
          PROC.IS_PROCESSED
        FROM FAC_ENC_PED ENC
        LEFT JOIN (
          SELECT DISTINCT NUM_PED, 1 AS IS_PROCESSED
          FROM dbo.PROCESSED_ORDERS
        ) PROC ON ENC.NUM_PED = PROC.NUM_PED
        WHERE 1=1
      `;

      const params = {};

      // Aplicar filtros
      if (dateFrom) {
        query += " AND ENC.FEC_PED >= @dateFrom";
        params.dateFrom = new Date(dateFrom);
      }

      if (dateTo) {
        query += " AND ENC.FEC_PED <= @dateTo";
        // Ajustar al final del día
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        params.dateTo = endDate;
      }

      if (status && status !== "all") {
        query += " AND ENC.ESTADO = @status";
        params.status = status;
      }

      if (warehouse && warehouse !== "all") {
        query += " AND ENC.COD_BOD = @warehouse";
        params.warehouse = warehouse;
      }

      // Filtrar por procesados/no procesados
      if (!showProcessed) {
        query += " AND PROC.IS_PROCESSED IS NULL";
      }

      // Ordenar por fecha descendente
      query += " ORDER BY ENC.FEC_PED DESC";

      // Ejecutar consulta
      const result = await SqlService.query(connection, query, params);

      // Formatear fechas y campos numéricos
      const formattedData = result.recordset.map((order) => ({
        ...order,
        IS_PROCESSED: !!order.IS_PROCESSED,
      }));

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      logger.error("Error al obtener pedidos:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener pedidos",
        error: error.message,
      });
    }
  });
};

/**
 * Obtiene los detalles de un pedido específico incluyendo sus ítems
 */
const getOrderDetails = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "El ID del pedido es obligatorio",
        });
      }

      // Obtener información del encabezado
      const headerQuery = `
        SELECT *
        FROM FAC_ENC_PED
        WHERE NUM_PED = @orderId
      `;

      const headerResult = await SqlService.query(connection, headerQuery, {
        orderId,
      });

      if (headerResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pedido no encontrado",
        });
      }

      const orderHeader = headerResult.recordset[0];

      // Obtener ítems del pedido
      const itemsQuery = `
        SELECT 
          DET.COD_CIA,
          DET.NUM_PED,
          DET.NUM_LIN,
          DET.COD_PRO,
          PRO.DESCRIPCION AS DES_PRO,
          DET.CANTIDAD,
          DET.PRECIO,
          DET.SUBTOTAL,
          DET.POR_DES,
          DET.MON_DES,
          DET.ESTADO
        FROM FAC_DET_PED DET
        LEFT JOIN PRODUCTOS PRO ON DET.COD_PRO = PRO.COD_PRO
        WHERE DET.NUM_PED = @orderId
        ORDER BY DET.NUM_LIN
      `;

      const itemsResult = await SqlService.query(connection, itemsQuery, {
        orderId,
      });

      res.json({
        success: true,
        data: {
          ...orderHeader,
          items: itemsResult.recordset,
        },
      });
    } catch (error) {
      logger.error(
        `Error al obtener detalles del pedido ${req.params.orderId}:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "Error al obtener detalles del pedido",
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
        SELECT DISTINCT
          BOD.COD_BOD,
          BOD.NOM_BOD
        FROM INV_BODEGAS BOD
        INNER JOIN FAC_ENC_PED PED ON BOD.COD_BOD = PED.COD_BOD
        WHERE BOD.ACTIVA = 'S'
        ORDER BY BOD.COD_BOD
      `;

      const result = await SqlService.query(connection, query);

      res.json({
        success: true,
        data: result.recordset,
      });
    } catch (error) {
      logger.error("Error al obtener bodegas:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener bodegas",
        error: error.message,
      });
    }
  });
};

/**
 * Exporta pedidos a Excel
 */
const exportOrders = async (req, res) => {
  return await withConnection("server2", async (connection) => {
    try {
      const { orders, filters } = req.body;

      // Construir consulta con filtros
      let query = `
        SELECT
          ENC.COD_CIA,
          ENC.NUM_PED,
          ENC.COD_ZON,
          ENC.COD_CLT,
          CLI.NOMBRE AS NOM_CLIENTE,
          ENC.TIP_DOC,
          ENC.FEC_PED,
          ENC.MON_IMP_VT,
          ENC.MON_IMP_CS,
          ENC.MON_CIV,
          ENC.MON_SIV,
          ENC.MON_DSC,
          ENC.NUM_ITM,
          ENC.ESTADO,
          CASE 
            WHEN ENC.ESTADO = 'P' THEN 'Pendiente'
            WHEN ENC.ESTADO = 'F' THEN 'Facturado'
            WHEN ENC.ESTADO = 'A' THEN 'Anulado'
            ELSE ENC.ESTADO
          END AS ESTADO_DESC,
          ENC.COD_BOD,
          BOD.NOM_BOD,
          CASE WHEN PROC.IS_PROCESSED IS NULL THEN 'No' ELSE 'Sí' END AS PROCESADO
        FROM FAC_ENC_PED ENC
        LEFT JOIN CLIENTES CLI ON ENC.COD_CLT = CLI.COD_CLT
        LEFT JOIN INV_BODEGAS BOD ON ENC.COD_BOD = BOD.COD_BOD
        LEFT JOIN (
          SELECT DISTINCT NUM_PED, 1 AS IS_PROCESSED
          FROM dbo.PROCESSED_ORDERS
        ) PROC ON ENC.NUM_PED = PROC.NUM_PED
        WHERE 1=1
      `;

      const params = {};

      // Filtrar por lista de pedidos específicos
      if (orders && Array.isArray(orders) && orders.length > 0) {
        // Para manejar listas grandes, usar una tabla temporal o construir la consulta dinámicamente
        const placeholders = orders.map((_, i) => `@orderId${i}`).join(", ");
        query += ` AND ENC.NUM_PED IN (${placeholders})`;

        orders.forEach((orderId, i) => {
          params[`orderId${i}`] = orderId;
        });
      }
      // O aplicar los filtros generales
      else if (filters) {
        if (filters.dateFrom) {
          query += " AND ENC.FEC_PED >= @dateFrom";
          params.dateFrom = new Date(filters.dateFrom);
        }

        if (filters.dateTo) {
          query += " AND ENC.FEC_PED <= @dateTo";
          const endDate = new Date(filters.dateTo);
          endDate.setHours(23, 59, 59, 999);
          params.dateTo = endDate;
        }

        if (filters.status && filters.status !== "all") {
          query += " AND ENC.ESTADO = @status";
          params.status = filters.status;
        }

        if (filters.warehouse && filters.warehouse !== "all") {
          query += " AND ENC.COD_BOD = @warehouse";
          params.warehouse = filters.warehouse;
        }

        if (!filters.showProcessed) {
          query += " AND PROC.IS_PROCESSED IS NULL";
        }
      }

      // Ordenar por fecha descendente
      query += " ORDER BY ENC.FEC_PED DESC";

      // Ejecutar consulta
      const result = await SqlService.query(connection, query, params);

      // Si no hay datos, devolver un error
      if (result.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No se encontraron pedidos con los criterios especificados",
        });
      }

      // Formatear datos para Excel
      const data = result.recordset.map((row) => ({
        Número: row.NUM_PED,
        Cliente: row.COD_CLT,
        "Nombre Cliente": row.NOM_CLIENTE,
        Fecha: row.FEC_PED ? new Date(row.FEC_PED).toLocaleDateString() : "",
        Bodega: row.COD_BOD,
        "Nombre Bodega": row.NOM_BOD,
        Estado: row.ESTADO_DESC,
        Total: row.MON_IMP_VT || 0,
        Subtotal: row.MON_SIV || 0,
        Impuestos: row.MON_CIV || 0,
        Descuento: row.MON_DSC || 0,
        Ítems: row.NUM_ITM || 0,
        Procesado: row.PROCESADO,
      }));

      // Crear libro Excel
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(data);

      // Establecer ancho de columnas
      const colWidths = [
        { wch: 15 }, // Número
        { wch: 15 }, // Cliente
        { wch: 30 }, // Nombre Cliente
        { wch: 12 }, // Fecha
        { wch: 10 }, // Bodega
        { wch: 20 }, // Nombre Bodega
        { wch: 12 }, // Estado
        { wch: 12 }, // Total
        { wch: 12 }, // Subtotal
        { wch: 12 }, // Impuestos
        { wch: 12 }, // Descuento
        { wch: 8 }, // Ítems
        { wch: 10 }, // Procesado
      ];
      ws["!cols"] = colWidths;

      // Añadir hoja al libro
      xlsx.utils.book_append_sheet(wb, ws, "Pedidos");

      // Generar buffer
      const excelBuffer = xlsx.write(wb, { bookType: "xlsx", type: "buffer" });

      // Configurar encabezados para descarga
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Pedidos_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`
      );

      // Enviar el archivo
      res.send(excelBuffer);
    } catch (error) {
      logger.error("Error al exportar pedidos:", error);
      res.status(500).json({
        success: false,
        message: "Error al exportar pedidos",
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

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Se requiere al menos un pedido para procesar",
      });
    }

    if (!taskName) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el nombre de la tarea",
      });
    }

    // Buscar la tarea
    const task = await TransferTask.findOne({ name: taskName });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: `No se encontró la tarea "${taskName}"`,
      });
    }

    if (!task.active) {
      return res.status(400).json({
        success: false,
        message: `La tarea "${taskName}" está inactiva`,
      });
    }

    // Establecer los parámetros específicos para la tarea
    // Añadir los IDs de pedidos al parámetro correspondiente
    const taskParams = {
      ...task.toObject(),
      parameters: [
        ...(task.parameters || []),
        {
          field: "orderIds",
          operator: "IN",
          value: orders,
        },
      ],
    };

    // Crear registro de ejecución
    const taskExecution = new TaskExecution({
      taskId: task._id,
      taskName: task.name,
      date: new Date(),
      status: "running",
      metadata: {
        orderCount: orders.length,
        orderIds: orders,
      },
    });

    await taskExecution.save();
    const executionId = taskExecution._id;

    // Ejecutar la tarea con los parámetros modificados
    logger.info(
      `Iniciando procesamiento de ${orders.length} pedidos con tarea ${taskName}`
    );

    // Actualizar estado a running
    await TransferTask.findByIdAndUpdate(task._id, {
      status: "running",
      progress: 0,
    });

    // Ejecutar la tarea asíncronamente para no bloquear la respuesta
    transferService
      .executeTransferWithRetry(task._id)
      .then(async (result) => {
        logger.info(
          `Procesamiento de pedidos completado: ${JSON.stringify(result)}`
        );

        // Actualizar registro de ejecución
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "completed",
          executionTime: Date.now() - taskExecution.date.getTime(),
          totalRecords: orders.length,
          successfulRecords: result.inserted || 0,
          details: result,
        });

        // Registrar pedidos procesados
        await withConnection("server2", async (connection) => {
          // Insertar en tabla de pedidos procesados
          for (const orderId of orders) {
            try {
              await SqlService.query(
                connection,
                `INSERT INTO PROCESSED_ORDERS (NUM_PED, PROCESS_DATE, TASK_NAME, EXECUTION_ID)
                 VALUES (@orderId, @processDate, @taskName, @executionId)`,
                {
                  orderId,
                  processDate: new Date(),
                  taskName: task.name,
                  executionId: executionId.toString(),
                }
              );
            } catch (insertError) {
              logger.warn(
                `Error al registrar pedido ${orderId} como procesado: ${insertError.message}`
              );
            }
          }
        });
      })
      .catch(async (error) => {
        logger.error(`Error en procesamiento de pedidos: ${error.message}`);

        // Actualizar registro de ejecución en caso de error
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - taskExecution.date.getTime(),
          errorMessage: error.message,
        });
      });

    // Responder inmediatamente que se inició el proceso
    res.json({
      success: true,
      message: `Procesamiento de ${orders.length} pedidos iniciado`,
      executionId: executionId,
    });
  } catch (error) {
    logger.error("Error al procesar pedidos:", error);
    res.status(500).json({
      success: false,
      message: "Error al procesar pedidos",
      error: error.message,
    });
  }
};

// Exportar controladores
module.exports = {
  getOrders,
  getOrderDetails,
  processOrders,
  getWarehouses,
  exportOrders,
};
