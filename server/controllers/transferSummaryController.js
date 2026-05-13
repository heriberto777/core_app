const Log = require("../models/loggerModel");
const logger = require("../services/logger");
const { realizarTraspaso } = require("../services/traspasoService");
const { sendTransferReturnEmail } = require("../services/emailService");
const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");

/**
 * Crea un nuevo resumen de transferencia
 */
const createTransferSummary = async (req, res) => {
  try {
    const { loadId, route, documentId, products, totalProducts, totalQuantity, createdBy } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!loadId || !route || !products?.length) {
      return res.status(400).json({ success: false, message: "Datos incompletos (loadId, route, products necesarios)." });
    }

    const existingSummary = await Log.findOne({ "metadata.loadId": loadId }).lean();
    if (existingSummary) {
      return res.status(400).json({ success: false, message: `Ya existe un registro para la carga ${loadId}` });
    }

    const calculatedQuantity = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    
    const logEntry = new Log({
      level: "info",
      message: `📦 Resumen de carga creado: ${loadId}`,
      operationType: "TRANSFER",
      entityType: "TRASPASO",
      transactionId: `traspaso_${documentId || Date.now()}`,
      mappingName: "Manual Transfer",
      affectedRecords: products.length,
      metadata: {
        status: "completed",
        loadId,
        route,
        documentId,
        products: products.map(p => ({
          ...p,
          returnedQuantity: 0
        })),
        totalProducts: totalProducts || products.length,
        totalQuantity: totalQuantity || calculatedQuantity,
        createdBy: createdBy || userId,
      }
    });

    await logEntry.save();
    logger.info(`Resumen (Log) creado para carga ${loadId} por ${userId}`);

    return res.status(201).json({
      success: true,
      message: "Resumen (Log) creado correctamente",
      data: logEntry,
    });
  } catch (error) {
    logger.error("Error en createTransferSummary:", error);
    return res.status(500).json({ success: false, message: "Error interno al crear resumen", error: error.message });
  }
};

/**
 * Obtiene resúmenes con filtros y paginación
 */
const getTransferSummaries = async (req, res) => {
  try {
    const { page = 1, limit = 10, loadId, route, dateFrom, dateTo, status } = req.query;
    const filter = {
      operationType: "TRANSFER",
      entityType: "TRASPASO"
    };

    if (loadId) filter["metadata.loadId"] = loadId;
    if (route) filter["metadata.route"] = route;
    if (status) filter["metadata.status"] = status;

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = endDate;
      }
    }

    const pageInt = parseInt(page, 10);
    const limitInt = parseInt(limit, 10);
    const skip = (pageInt - 1) * limitInt;

    const [logs, total] = await Promise.all([
      Log.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limitInt).lean(),
      Log.countDocuments(filter),
    ]);

    // Mapear al formato esperado por el frontend
    const summaries = logs.map(l => ({
      _id: l._id,
      date: l.timestamp,
      ...l.metadata
    }));

    return res.status(200).json({
      success: true,
      message: "Resúmenes obtenidos correctamente (vía logs)",
      data: summaries,
      pagination: { total, page: pageInt, limit: limitInt, pages: Math.ceil(total / limitInt) },
    });
  } catch (error) {
    logger.error("Error en getTransferSummaries:", error);
    return res.status(500).json({ success: false, message: "Error al obtener resúmenes", error: error.message });
  }
};

/**
 * Obtiene un resumen por ID
 */
const getTransferSummaryById = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findById(id).lean();

    if (!log) return res.status(404).json({ success: false, message: "Registro no encontrado" });

    return res.status(200).json({ 
      success: true, 
      message: "Resumen obtenido", 
      data: { _id: log._id, date: log.timestamp, ...log.metadata } 
    });
  } catch (error) {
    logger.error("Error en getTransferSummaryById:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Obtiene un resumen por loadId
 */
const getTransferSummaryByLoadId = async (req, res) => {
  try {
    const { loadId } = req.params;
    const log = await Log.findOne({ "metadata.loadId": loadId }).lean();

    if (!log) return res.status(404).json({ success: false, message: "Registro no encontrado" });

    return res.status(200).json({ 
      success: true, 
      message: "Resumen obtenido", 
      data: { _id: log._id, date: log.timestamp, ...log.metadata } 
    });
  } catch (error) {
    logger.error("Error en getTransferSummaryByLoadId:", error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Procesa devoluciones de productos
 */
const processTransferReturn = async (req, res) => {
  try {
    const { summaryId, productsToReturn, reason } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!summaryId || !productsToReturn?.length) {
      return res.status(400).json({ success: false, message: "Datos insuficientes para devolución." });
    }

    const log = await Log.findById(summaryId);
    if (!log) return res.status(404).json({ success: false, message: "Registro original no encontrado" });

    const metadata = log.metadata || {};
    if (!metadata.products) return res.status(400).json({ success: false, message: "El registro no contiene productos" });

    const validProducts = [];
    const invalidProducts = [];

    for (const item of productsToReturn) {
      const sp = summary.products.find(p => p.code === item.code);
      if (!sp) {
        invalidProducts.push({ ...item, error: "Producto no existe en el resumen" });
        continue;
      }

      const available = sp.quantity - (sp.returnedQuantity || 0);
      if (item.quantity <= 0 || item.quantity > available) {
        invalidProducts.push({ ...item, error: `Cantidad excedida. Disponible: ${available}` });
        continue;
      }

      validProducts.push({ ...item, description: sp.description || "N/A" });
    }

    if (invalidProducts.length > 0) {
      return res.status(400).json({ success: false, message: "Productos inválidos en solicitud", data: { invalidProducts } });
    }

    // Ejecutar traspaso de retorno
    const returnResult = await realizarTraspaso({
      route: "01", // Destino por defecto para retornos
      salesData: validProducts.map(p => ({ Code_Product: p.code, Quantity: p.quantity })),
    });

    if (!returnResult.success) throw new Error(returnResult.mensaje || "Error en realizarTraspaso");

    // Actualizar metadata del log
    validProducts.forEach(item => {
      const sp = metadata.products.find(p => p.code === item.code);
      sp.returnedQuantity = (sp.returnedQuantity || 0) + item.quantity;
    });

    const allReturned = metadata.products.every(p => (p.returnedQuantity || 0) >= p.quantity);
    metadata.status = allReturned ? "full_return" : "partial_return";
    metadata.returnData = { 
      documentId: returnResult.documento_inv, 
      date: new Date(), 
      reason: reason || "Devolución",
      processedBy: userId
    };

    log.markModified('metadata');
    await log.save();
    
    // Registrar la acción de retorno como un log separado para auditoría
    logger.info(`↩️ Devolución procesada para carga ${metadata.loadId}`, {
      operationType: "TRANSFER",
      entityType: "RETORNO",
      transactionId: `return_${returnResult.documento_inv}`,
      metadata: {
        originalLogId: log._id,
        returnDocumentId: returnResult.documento_inv,
        products: validProducts
      }
    });
    logger.info(`Devolución procesada para resumen ${summaryId} por ${userId}, documento: ${returnResult.documento_inv}`);

    // Email asíncrono
    sendTransferReturnEmail({
      loadId: summary.loadId,
      originalDocument: summary.documentId,
      returnDocument: returnResult.documento_inv,
      products: validProducts,
      reason: reason || "Devolución",
    }).catch(err => logger.error("Error enviando email de retorno:", err));

    return res.status(200).json({
      success: true,
      message: "Devolución procesada correctamente",
      data: { returnDocument: returnResult.documento_inv, summary },
    });
  } catch (error) {
    logger.error("Error en processTransferReturn:", error);
    return res.status(500).json({ success: false, message: "Error al procesar devolución", error: error.message });
  }
};

/**
 * Verifica inventario disponible para retornos
 */
const checkInventoryForReturns = async (req, res) => {
  try {
    const { summaryId } = req.params;
    const log = await Log.findById(summaryId).lean();
    if (!log) return res.status(404).json({ success: false, message: "Registro no encontrado" });

    const metadata = log.metadata || {};
    const productCodes = metadata.products?.map(p => p.code) || [];
    if (!productCodes.length) return res.status(400).json({ success: false, message: "No hay productos que verificar" });

    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT ARTICULO AS Code_Product, SUM(CANTIDAD_DISPONIBLE) AS available_quantity
        FROM CATELLI.EXPLT_FAC_DET_PED
        WHERE ARTICULO IN (${productCodes.map((_, i) => `@p${i}`).join(", ")})
        GROUP BY ARTICULO
      `;

      const params = {};
      productCodes.forEach((c, i) => params[`p${i}`] = c);

      const result = await DatabaseServiceAdapter.query(connection, query, params);
      const inventoryMap = {};
      result.recordset?.forEach(item => inventoryMap[item.Code_Product] = item.available_quantity || 0);

      const productsWithInventory = metadata.products.map(p => {
        const available = inventoryMap[p.code] || 0;
        return {
          ...p,
          availableInInventory: available,
          maxReturnableQuantity: Math.min(p.quantity - (p.returnedQuantity || 0), available),
        };
      });

      return res.status(200).json({
        success: true,
        message: "Inventario para retornos verificado (vía logs)",
        data: { summaryId: log._id, loadId: metadata.loadId, productsWithInventory },
      });
    });
  } catch (error) {
    logger.error("Error en checkInventoryForReturns:", error);
    return res.status(500).json({ success: false, message: "Error al verificar inventario", error: error.message });
  }
};

module.exports = {
  createTransferSummary,
  getTransferSummaries,
  getTransferSummaryById,
  getTransferSummaryByLoadId,
  processTransferReturn,
  checkInventoryForReturns,
};
