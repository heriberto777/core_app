/**
 * LoadsTrackingService.js
 * Responsabilidad única: persistencia del ciclo de vida de una carga.
 *
 * Gestiona:
 *   - Registro inicial en MongoDB (LoadTracking)
 *   - Trazabilidad real de traspasos en MongoDB (TraspasoTracking)
 *   - Consulta del historial de cargas desde MongoDB
 */
const logger = require("./logger");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const { LoadTracking } = require("../models/loadsModel");
const TraspasoTracking = require("../models/traspasoTrackingModel");

class LoadsTrackingService {
    /**
     * Crea el registro inicial de tracking en MongoDB cuando comienza una carga.
     */
    static async createLoadTracking(loadId, route, bodega, totalOrders, userId) {
        const loadTracking = new LoadTracking({
            loadId,
            route,
            bodega,
            totalOrders,
            createdBy: userId,
            status: "processing",
        });

        await loadTracking.save();
        logger.info(`Tracking creado para carga ${loadId}`);
        return loadTracking;
    }

    /**
     * Guarda el resultado del traspaso en MongoDB (colección TraspasoTracking).
     * Unifica el caso exitoso y el fallido en un único método. Reemplaza al
     * guardado original en IMPLT_traspaso_tracking (SQL Server, deprecada).
     *
     * @param {object} connection - Ignorado (se conservó el parámetro para no
     *                              tocar las llamadas existentes). Ya no se
     *                              escribe en SQL Server, solo en Mongo.
     * @param {object} data       - loadId, deliveryPersonCode, deliveryPersonName,
     *                              warehouseOrigin, warehouseDestination,
     *                              traspasoResult, userId, executionSource
     * @param {'completed'|'failed'} outcomeType - Resultado del traspaso
     */
    static async saveTraspasoTracking(connection, data, outcomeType = "completed") {
        try {
            const {
                loadId,
                deliveryPersonCode,
                deliveryPersonName,
                warehouseOrigin,
                warehouseDestination,
                traspasoResult,
                userId,
                executionSource = "automatic",
            } = data;

            const totalQuantity = (traspasoResult?.detalleProductos || []).reduce(
                (sum, p) => sum + (Number(p.cantidad) || 0),
                0
            );

            const doc = await TraspasoTracking.create({
                loadId,
                documentoInv: traspasoResult?.documento_inv || null,
                route: deliveryPersonCode,
                deliveryPersonName,
                warehouseOrigin,
                warehouseDestination,
                status: outcomeType,
                executionSource,
                totalLines: traspasoResult?.totalLineas || 0,
                successfulLines: traspasoResult?.lineasExitosas || 0,
                failedLines: traspasoResult?.lineasFallidas || 0,
                totalQuantity,
                errorMessage: outcomeType === "failed" ? (traspasoResult?.mensaje || null) : null,
                createdBy: userId ? String(userId) : undefined,
            });

            logger.info(`Tracking de traspaso guardado: ${doc._id} (carga ${loadId}, ${outcomeType})`);
            return doc._id.toString();
        } catch (error) {
            logger.error(`Error guardando tracking de traspaso para carga ${data?.loadId}:`, error);
            return null;
        }
    }

    /**
     * Retorna el historial paginado de cargas desde MongoDB.
     */
    static async getLoadHistory(filters = {}) {
        try {
            const { page = 1, limit = 20, status, dateFrom, dateTo } = filters;
            const query = {};

            if (status) query.status = status;

            if (dateFrom || dateTo) {
                query.createdAt = {};
                if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
                if (dateTo) {
                    const endDate = new Date(dateTo);
                    endDate.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = endDate;
                }
            }

            const skip = (page - 1) * limit;

            const [loads, total] = await Promise.all([
                LoadTracking.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate("createdBy", "name email"),
                LoadTracking.countDocuments(query),
            ]);

            return {
                success: true,
                data: loads,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit,
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1,
                },
            };
        } catch (error) {
            logger.error("Error obteniendo historial de cargas:", error);
            throw error;
        }
    }

    /**
     * Actualiza el estado de un tracking en MongoDB.
     */
    static async updateTrackingStatus(loadId, status, extra = {}) {
        return LoadTracking.findOneAndUpdate(
            { loadId },
            { status, updatedAt: new Date(), ...extra },
            { new: true }
        );
    }
}

module.exports = LoadsTrackingService;
