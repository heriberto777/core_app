"use strict";

const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");
const logger = require("../services/logger");

/**
 * Obtiene lista de clientes de Server2 con filtros
 */
const getCustomers = async (req, res) => {
    return await withConnection("server2", async (connection) => {
        try {
            const { dateFrom, dateTo, status, search } = req.query;

            let query = `
        SELECT COD_CLI, NOM_CLI, DIR_CLI, TEL_CLI, EMAIL_CLI, ESTADO_CLI, FECHA_REGISTRO
        FROM CLIENTES
        WHERE 1=1
      `;

            const params = {};
            if (status && status !== "all") {
                query += " AND ESTADO_CLI = @status";
                params.status = status;
            }
            if (dateFrom) {
                query += " AND FECHA_REGISTRO >= @dateFrom";
                params.dateFrom = dateFrom;
            }
            if (dateTo) {
                query += " AND FECHA_REGISTRO <= @dateTo";
                params.dateTo = dateTo;
            }
            if (search) {
                query += " AND (COD_CLI LIKE @search OR NOM_CLI LIKE @search OR EMAIL_CLI LIKE @search)";
                params.search = `%${search}%`;
            }

            query += " ORDER BY NOM_CLI ASC";

            const result = await DatabaseServiceAdapter.query(connection, query, params);

            return res.status(200).json({
                success: true,
                message: "Clientes obtenidos correctamente",
                data: result.recordset,
            });
        } catch (error) {
            logger.error("Error en getCustomers:", error);
            return res.status(500).json({
                success: false,
                message: "Error al recuperar catálogo de clientes",
                error: error.message,
            });
        }
    });
};

/**
 * Actualiza los datos de un cliente en Server2
 */
const updateCustomer = async (req, res) => {
    return await withConnection("server2", async (connection) => {
        try {
            const customerData = req.body;
            const { COD_CLI } = customerData;

            if (!COD_CLI) {
                return res.status(400).json({
                    success: false,
                    message: "El código de cliente (COD_CLI) es obligatorio para la actualización",
                });
            }

            // Construcción dinámica de la consulta de actualización
            const fieldsToUpdate = [];
            const params = { COD_CLI };

            const allowedFields = ["NOM_CLI", "DIR_CLI", "TEL_CLI", "EMAIL_CLI", "ESTADO_CLI"];

            allowedFields.forEach(field => {
                if (customerData[field] !== undefined) {
                    fieldsToUpdate.push(`${field} = @${field}`);
                    params[field] = customerData[field];
                }
            });

            if (fieldsToUpdate.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No se proporcionaron campos para actualizar",
                });
            }

            const query = `
        UPDATE CLIENTES
        SET ${fieldsToUpdate.join(", ")}
        WHERE COD_CLI = @COD_CLI
      `;

            await DatabaseServiceAdapter.query(connection, query, params);

            logger.info(`Cliente ${COD_CLI} actualizado por ${req.user?.email || "system"}`);

            return res.status(200).json({
                success: true,
                message: "Cliente actualizado correctamente",
            });
        } catch (error) {
            logger.error(`Error al actualizar cliente: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: "Error al actualizar los datos del cliente",
                error: error.message,
            });
        }
    });
};

module.exports = {
    getCustomers,
    updateCustomer,
};
