// controllers/transferSummaryController.js
const TransferSummary = require("../models/transferSummaryModel");
const logger = require("../services/logger");
const { connectToDB, closeConnection } = require("../services/dbService");
const { SqlService } = require("../services/tediousService");
const { realizarTraspaso } = require("../services/traspasoService");
const { sendTransferReturnEmail } = require("../services/emailService");

/**
 * Create a new transfer summary after a successful transfer
 */
const createTransferSummary = async (req, res) => {
  try {
    const {
      loadId,
      route,
      documentId,
      products,
      totalProducts,
      totalQuantity,
      createdBy,
    } = req.body;

    if (!loadId || !route || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Datos incompletos. Se requiere loadId, route y products.",
      });
    }

    console.log("Resumen -> ", req.body);

    // Check if summary already exists for this loadId
    const existingSummary = await TransferSummary.findOne({ loadId });
    if (existingSummary) {
      return res.status(400).json({
        success: false,
        message: `Ya existe un resumen para la carga ${loadId}`,
      });
    }

    // Calculate totals if not provided
    const calculatedTotalProducts = products.length;
    const calculatedTotalQuantity = products.reduce(
      (sum, product) => sum + product.quantity,
      0
    );

    const summary = new TransferSummary({
      loadId,
      route,
      documentId,
      products,
      totalProducts: totalProducts || calculatedTotalProducts,
      totalQuantity: totalQuantity || calculatedTotalQuantity,
      createdBy,
    });

    await summary.save();

    return res.status(201).json({
      success: true,
      message: "Resumen de transferencia creado correctamente",
      summary,
    });
  } catch (error) {
    logger.error("Error al crear resumen de transferencia:", error);
    return res.status(500).json({
      success: false,
      message: "Error al crear resumen de transferencia",
      error: error.message,
    });
  }
};

/**
 * Get all transfer summaries with pagination and filters
 */
const getTransferSummaries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      loadId,
      route,
      dateFrom,
      dateTo,
      status,
    } = req.query;

    // Build filter object
    const filter = {};

    if (loadId) filter.loadId = loadId;
    if (route) filter.route = route;
    if (status) filter.status = status;

    // Date range filter
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.date.$lte = endDate;
      }
    }

    // Pagination
    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { date: -1 }, // Latest first
    };

    // Execute the query with pagination
    const summaries = await TransferSummary.find(filter)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort)
      .lean();

    // Get total count
    const total = await TransferSummary.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: summaries,
      pagination: {
        total,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    logger.error("Error al obtener resúmenes de transferencia:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener resúmenes de transferencia",
      error: error.message,
    });
  }
};

/**
 * Get a single transfer summary by ID
 */
const getTransferSummaryById = async (req, res) => {
  try {
    const { id } = req.params;
    const summary = await TransferSummary.findById(id);

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el resumen con ID ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error(`Error al obtener resumen de transferencia por ID:`, error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener resumen de transferencia",
      error: error.message,
    });
  }
};

/**
 * Get a transfer summary by loadId
 */
const getTransferSummaryByLoadId = async (req, res) => {
  try {
    const { loadId } = req.params;
    const summary = await TransferSummary.findOne({ loadId });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el resumen para la carga ${loadId}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error(`Error al obtener resumen por loadId:`, error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener resumen de transferencia",
      error: error.message,
    });
  }
};

/**
 * Process a product return for a transfer
 */
const processTransferReturn = async (req, res) => {
  let connection = null;

  try {
    const { summaryId, productsToReturn, reason } = req.body;

    if (!summaryId || !productsToReturn || productsToReturn.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Datos incompletos. Se requiere summaryId y productos a devolver.",
      });
    }

    // Find the transfer summary
    const summary = await TransferSummary.findById(summaryId);
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el resumen con ID ${summaryId}`,
      });
    }

    // Validate that the products exist in the summary
    const validProducts = [];
    const invalidProducts = [];

    for (const returnItem of productsToReturn) {
      const summaryProduct = summary.products.find(
        (p) => p.code === returnItem.code
      );

      if (!summaryProduct) {
        invalidProducts.push(returnItem);
        continue;
      }

      // Check if return quantity is valid
      const availableToReturn =
        summaryProduct.quantity - summaryProduct.returnedQuantity;
      if (returnItem.quantity <= 0 || returnItem.quantity > availableToReturn) {
        invalidProducts.push({
          ...returnItem,
          reason: `Cantidad inválida. Disponible para devolver: ${availableToReturn}`,
        });
        continue;
      }

      validProducts.push({
        ...returnItem,
        description: summaryProduct.description || "Producto sin descripción",
      });
    }

    if (invalidProducts.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Hay productos inválidos en la solicitud de devolución",
        invalidProducts,
      });
    }

    // Perform the reverse transfer (from route/destination back to origin warehouse)
    // The destination becomes the origin in the return
    const returnData = {
      route: "01", // Origin warehouse (typically "01")
      salesData: validProducts.map((p) => ({
        Code_Product: p.code,
        Quantity: p.quantity,
      })),
    };

    try {
      // Execute the return transfer
      const returnResult = await realizarTraspaso(returnData);

      if (!returnResult.success) {
        throw new Error(
          `Error al realizar la devolución: ${returnResult.mensaje}`
        );
      }

      // Update the summary with the returned quantities
      for (const returnItem of validProducts) {
        const summaryProduct = summary.products.find(
          (p) => p.code === returnItem.code
        );
        summaryProduct.returnedQuantity += returnItem.quantity;
      }

      // Update the overall status
      const allFullyReturned = summary.products.every(
        (p) => p.returnedQuantity >= p.quantity
      );

      const someReturned = summary.products.some((p) => p.returnedQuantity > 0);

      if (allFullyReturned) {
        summary.status = "full_return";
      } else if (someReturned) {
        summary.status = "partial_return";
      }

      // Add return data
      summary.returnData = {
        documentId: returnResult.documento_inv,
        date: new Date(),
        reason: reason || "Devolución de productos",
      };

      await summary.save();

      // Send email notification
      try {
        await sendTransferReturnEmail({
          loadId: summary.loadId,
          originalDocument: summary.documentId,
          returnDocument: returnResult.documento_inv,
          products: validProducts,
          reason: reason || "Devolución de productos",
        });
      } catch (emailError) {
        logger.error("Error al enviar correo de devolución:", emailError);
      }

      return res.status(200).json({
        success: true,
        message: "Devolución procesada correctamente",
        returnDocument: returnResult.documento_inv,
        summary,
      });
    } catch (returnError) {
      logger.error("Error al procesar la devolución:", returnError);
      return res.status(500).json({
        success: false,
        message: "Error al procesar la devolución",
        error: returnError.message,
      });
    }
  } catch (error) {
    logger.error("Error general en processTransferReturn:", error);
    return res.status(500).json({
      success: false,
      message: "Error al procesar la devolución",
      error: error.message,
    });
  } finally {
    if (connection) {
      try {
        await closeConnection(connection);
      } catch (closeError) {
        logger.error("Error al cerrar conexión:", closeError);
      }
    }
  }
};

/**
 * Check inventory levels in EXPLT_FAC_DET_PED for possible returns
 */
const checkInventoryForReturns = async (req, res) => {
  let connection = null;

  try {
    const { summaryId } = req.params;

    // Find the transfer summary
    const summary = await TransferSummary.findById(summaryId);
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: `No se encontró el resumen con ID ${summaryId}`,
      });
    }

    // Connect to the database
    connection = await connectToDB("server1");
    if (!connection) {
      throw new Error("No se pudo conectar a la base de datos");
    }

    // Get product codes from the summary
    const productCodes = summary.products.map((p) => p.code);

    // Build a parameterized query with placeholders
    let query = `
      SELECT 
        ARTICULO AS Code_Product, 
        SUM(CANTIDAD_DISPONIBLE) AS available_quantity
      FROM CATELLI.EXPLT_FAC_DET_PED
      WHERE ARTICULO IN (${productCodes.map((_, idx) => `@p${idx}`).join(", ")})
      GROUP BY ARTICULO
    `;

    // Build parameters object
    const params = {};
    productCodes.forEach((code, idx) => {
      params[`p${idx}`] = code;
    });

    // Execute the query
    const result = await SqlService.query(connection, query, params);

    if (!result || !result.recordset) {
      throw new Error("No se pudo obtener información de inventario");
    }

    // Create a map for easy lookup
    const inventoryMap = {};
    result.recordset.forEach((item) => {
      inventoryMap[item.Code_Product] = item.available_quantity || 0;
    });

    // Combine summary data with inventory data
    const productsWithInventory = summary.products.map((product) => {
      return {
        ...product.toObject(),
        availableInInventory: inventoryMap[product.code] || 0,
        maxReturnableQuantity: Math.min(
          product.quantity - product.returnedQuantity,
          inventoryMap[product.code] || 0
        ),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        summaryId: summary._id,
        loadId: summary.loadId,
        productsWithInventory,
      },
    });
  } catch (error) {
    logger.error("Error en checkInventoryForReturns:", error);
    return res.status(500).json({
      success: false,
      message: "Error al verificar inventario para devoluciones",
      error: error.message,
    });
  } finally {
    if (connection) {
      try {
        await closeConnection(connection);
      } catch (closeError) {
        logger.error("Error al cerrar conexión:", closeError);
      }
    }
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
