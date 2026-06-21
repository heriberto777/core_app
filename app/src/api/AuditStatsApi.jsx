import { ENV } from "../utils/index";

export class AuditStatsApi {
    baseApi = ENV.BASE_API;

    // --- HISTORIAL & MONITOREO ---

    async getTaskHistory(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/task-history/${taskId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (response.status !== 200) throw result;
            return result;
        } catch (error) {
            console.error("Error historial de tarea:", error);
            throw error;
        }
    }

    async getTransferHistory(accessToken, filters = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (filters.status && filters.status !== "all") queryParams.append("status", filters.status);
            if (filters.startDate) queryParams.append("dateFrom", filters.startDate.toISOString());
            if (filters.endDate) queryParams.append("dateTo", filters.endDate.toISOString());
            if (filters.search) queryParams.append("search", filters.search);
            if (filters.page) queryParams.append("page", filters.page);
            if (filters.limit) queryParams.append("limit", filters.limit);

            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/history/logs${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (response.status !== 200) throw result;

            let history = [];
            let completedToday = 0;
            let failedToday = 0;

            if (result.success && result.data) {
              history = result.data.history || result.history || [];
              completedToday = result.data.stats?.completedToday || result.completedToday || 0;
              failedToday = result.data.stats?.failedToday || result.failedToday || 0;
            } else if (result.success && result.history) {
              history = result.history;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);

              completedToday = history.filter(item => {
                const d = new Date(item.date);
                return d >= today && d < tomorrow && item.status === "completed";
              }).length;

              failedToday = history.filter(item => {
                const d = new Date(item.date);
                return d >= today && d < tomorrow && (item.status === "failed" || item.status === "error" || item.status === "cancelled");
              }).length;
            }

            return { history, completedToday, failedToday };
        } catch (error) {
            console.error("Error historial transferencias:", error);
            return { history: [], completedToday: 0, failedToday: 0, error: error.message };
        }
    }

    async checkServerStatus(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/server-status/server`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (response.status !== 200) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error salud servidores:", error);
            return { server1: { status: "unknown" }, server2: { status: "unknown" }, mongodb: { status: "unknown" }, error: error.message };
        }
    }

    async getTransferStats(accessToken, filters = {}) {
        try {
            let url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER_STAST}`;
            const queryParams = new URLSearchParams();
            if (filters.timeRange) queryParams.append("timeRange", filters.timeRange);
            if (filters.taskId) queryParams.append("taskId", filters.taskId);

            const finalUrl = `${url}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(finalUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (response.status !== 200) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error estadísticas:", error);
            throw error;
        }
    }

    // --- GESTIÓN DE BITÁCORAS (LOGS) ---

    async getLogs(accessToken, filters = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (filters.level && filters.level !== "all") queryParams.append("level", filters.level);
            if (filters.source && filters.source !== "all") queryParams.append("source", filters.source);
            if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
            if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
            if (filters.search) queryParams.append("search", filters.search);
            if (filters.limit) queryParams.append("limit", filters.limit);
            if (filters.page) queryParams.append("page", filters.page);
            
            // === Filtros nuevos ===
            if (filters.operationType && filters.operationType.length > 0) 
                queryParams.append("operationType", filters.operationType.join(","));
            if (filters.entityType && filters.entityType.length > 0) 
                queryParams.append("entityType", filters.entityType.join(","));
            if (filters.durationMin) queryParams.append("durationMin", filters.durationMin);
            if (filters.durationMax) queryParams.append("durationMax", filters.durationMax);
            if (filters.affectedRecordsMin) queryParams.append("affectedRecordsMin", filters.affectedRecordsMin);
            if (filters.affectedRecordsMax) queryParams.append("affectedRecordsMax", filters.affectedRecordsMax);

            const url = `${this.baseApi}/logs${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener logs:", error);
            throw error;
        }
    }

    async getLogsSummary(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGS}/summary`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error resumen logs:", error);
            throw error;
        }
    }

    async getLogDetail(accessToken, logId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGS}/detail/${logId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error detalle log:", error);
            throw error;
        }
    }

    async cleanOldLogs(accessToken, olderThan = 365) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGS}/clean`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ olderThan }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error limpieza logs:", error);
            throw error;
        }
    }

    async getLogSources(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGS}/sources`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error fuentes de logs:", error);
            throw error;
        }
    }

    async getLogsDiagnostic(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.LOGS}/diagnostic`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error diagnóstico logs:", error);
            throw error;
        }
    }
}
