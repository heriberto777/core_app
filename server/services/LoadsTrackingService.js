/**
 * LoadsTrackingService.js
 * Responsabilidad única: persistencia del ciclo de vida de una carga.
 *
 * Gestiona:
 *   - Registro inicial en MongoDB (LoadTracking)
 *   - Inserción de tracking de traspaso en SQL Server (IMPLT_traspaso_tracking)
 *   - Consulta del historial de cargas desde MongoDB
 */
const logger = require("./logger");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const { LoadTracking } = require("../models/loadsModel");

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
     * Guarda el resultado del traspaso en SQL Server.
     * Unifica el caso exitoso y el fallido en un único método.
     *
     * @param {object} connection - Conexión SQL activa
     * @param {object} data       - Datos del traspaso (loadId, deliveryPerson, etc.)
     * @param {'completed'|'failed'} outcomeType - Resultado del traspaso
     */
    static async saveTraspasoTracking(connection, data, outcomeType = "completed") {
        logger.info(`Omitiendo guardado en IMPLT_traspaso_tracking (tabla deprecada) para carga ${data.loadId}`);
        return "DEPRECATED_SQL_TRACKING_" + Date.now();
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
