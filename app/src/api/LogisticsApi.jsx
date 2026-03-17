import { ENV } from "../utils/index";

export class LogisticsApi {
    baseApi = ENV.BASE_API;

    // --- PROCESOS DE CARGA ---

    async executeLoadTask(accessToken, fecha, vendors, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/run-loads/${taskId}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    parametros: { date: fecha, vendors: vendors },
                }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error ejecutando tarea de carga:", error);
            throw error;
        }
    }

    async executeInsertOrders(accessToken, salesData) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertOrders`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ salesData }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error insertando pedidos:", error);
            throw error;
        }
    }

    async executeInsertLoads(accessToken, route, loadId, salesData, bodega) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertLoads`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ route, loadId, salesData, bodega }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error insertando cargas:", error);
            throw error;
        }
    }

    async executeInsertTrapaso(accessToken, route, loadId, salesData, bodega_destino) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/insertTrapaso`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ route, loadId, salesData, bodega_destino }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error insertando traspaso:", error);
            throw error;
        }
    }

    async getLoadConsecutivo(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/load/lastLoad`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener consecutivo de carga:", error);
            throw error;
        }
    }

    async getVendedores(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/transfer/vendedores`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener vendedores:", error);
            throw error;
        }
    }

    // --- GESTIÓN DE PEDIDOS (ORDERS) ---

    async getOrders(accessToken, filters = {}) {
        try {
            let url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders`;
            const queryParams = new URLSearchParams();
            if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
            if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
            if (filters.status && filters.status !== "all") queryParams.append("status", filters.status);
            if (filters.warehouse && filters.warehouse !== "all") queryParams.append("warehouse", filters.warehouse);
            if (filters.showProcessed) queryParams.append("showProcessed", "true");

            const finalUrl = `${url}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(finalUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || [];
        } catch (error) {
            console.error("Error al obtener pedidos:", error);
            throw error;
        }
    }

    async getOrderDetails(accessToken, orderId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/${orderId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || { items: [] };
        } catch (error) {
            console.error("Error al obtener detalles del pedido:", error);
            throw error;
        }
    }

    async processOrders(accessToken, data) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/process`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al procesar pedidos:", error);
            throw error;
        }
    }

    async getWarehouses(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/warehouses`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || [];
        } catch (error) {
            console.error("Error al obtener bodegas:", error);
            return [];
        }
    }

    async exportOrders(accessToken, data) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/orders/export`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Error al exportar");
            }
            return await response.blob();
        } catch (error) {
            console.error("Error al exportar pedidos:", error);
            throw error;
        }
    }

    // --- CLIENTES ---

    async getCustomerData(accessToken, filters = {}) {
        try {
            let url = `${this.baseApi}/customers`;
            const queryParams = new URLSearchParams();
            if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
            if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
            if (filters.status && filters.status !== "all") queryParams.append("status", filters.status);
            if (filters.search) queryParams.append("search", filters.search);

            const finalUrl = `${url}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(finalUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || [];
        } catch (error) {
            console.error("Error al obtener datos de clientes:", error);
            throw error;
        }
    }

    async updateCustomerData(accessToken, customerData) {
        try {
            const url = `${this.baseApi}/customers/update`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(customerData),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al actualizar cliente:", error);
            throw error;
        }
    }

    // --- PROMOCIONES ---

    async getDocumentDetailsWithPromotions(token, mappingId, documentId) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/document/${documentId}/details-with-promotions`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener detalles con promociones:", error);
            throw error;
        }
    }

    async processDocumentsWithPromotions(token, mappingId, documentIds) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/process-with-promotions`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ documentIds }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al procesar con promociones:", error);
            throw error;
        }
    }

    async validatePromotionConfig(token, mappingId) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/validate-promotions`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al validar configuración de promociones:", error);
            throw error;
        }
    }
}
