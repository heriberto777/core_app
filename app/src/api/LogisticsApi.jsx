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

}
