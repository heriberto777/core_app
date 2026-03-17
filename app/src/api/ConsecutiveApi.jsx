import { ENV } from "../utils/index";

export class ConsecutiveApi {
    baseApi = ENV.BASE_API;

    async getConsecutives(accessToken, filters = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (filters.active !== undefined) queryParams.append("active", filters.active);
            if (filters.entityType && filters.entityId) {
                queryParams.append("entityType", filters.entityType);
                queryParams.append("entityId", filters.entityId);
            }

            const url = `${this.baseApi}/consecutives${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener consecutivos:", error);
            throw error;
        }
    }

    async getConsecutiveById(accessToken, id) {
        try {
            const url = `${this.baseApi}/consecutives/${id}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener consecutivo por ID:", error);
            throw error;
        }
    }

    async createConsecutive(accessToken, consecutiveData) {
        try {
            const url = `${this.baseApi}/consecutives`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(consecutiveData),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al crear consecutivo:", error);
            throw error;
        }
    }

    async updateConsecutive(accessToken, id, consecutiveData) {
        try {
            const url = `${this.baseApi}/consecutives/${id}`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(consecutiveData),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al actualizar consecutivo:", error);
            throw error;
        }
    }

    async deleteConsecutive(accessToken, id) {
        try {
            const url = `${this.baseApi}/consecutives/${id}`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al eliminar consecutivo:", error);
            throw error;
        }
    }

    async getNextConsecutiveValue(accessToken, id, options = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (options.segment) queryParams.append("segment", options.segment);
            if (options.companyId) queryParams.append("companyId", options.companyId);

            const url = `${this.baseApi}/consecutives/${id}/next${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener siguiente valor:", error);
            throw error;
        }
    }

    async resetConsecutive(accessToken, id, value = 0, segment = null) {
        try {
            const queryParams = new URLSearchParams();
            queryParams.append("value", value);
            if (segment) queryParams.append("segment", segment);

            const url = `${this.baseApi}/consecutives/${id}/reset?${queryParams.toString()}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al reiniciar consecutivo:", error);
            throw error;
        }
    }

    async assignConsecutive(accessToken, id, assignment) {
        try {
            const url = `${this.baseApi}/consecutives/${id}/assign`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(assignment),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al asignar consecutivo:", error);
            throw error;
        }
    }

    async getConsecutivesByEntity(accessToken, entityType, entityId) {
        try {
            const url = `${this.baseApi}/consecutives/entity/${entityType}/${entityId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener consecutivos por entidad:", error);
            throw error;
        }
    }

    // --- RESERVAS ---

    async reserveConsecutiveValues(accessToken, consecutiveId, quantity, options = {}) {
        try {
            const url = `${this.baseApi}/consecutives/reserve-batch`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    consecutiveId,
                    quantity,
                    segment: options.segment,
                    reservedBy: options.reservedBy || "web_client",
                }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al reservar valores:", error);
            throw error;
        }
    }

    async commitConsecutiveReservation(accessToken, consecutiveId, reservationId, values) {
        try {
            const url = `${this.baseApi}/consecutives/commit-reservation`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ consecutiveId, reservationId, values }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al confirmar reserva:", error);
            throw error;
        }
    }

    async cancelConsecutiveReservation(accessToken, consecutiveId, reservationId) {
        try {
            const url = `${this.baseApi}/consecutives/cancel-reservation`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ consecutiveId, reservationId }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al cancelar reserva:", error);
            throw error;
        }
    }

    async cleanupExpiredReservations(accessToken) {
        try {
            const url = `${this.baseApi}/consecutives/cleanup-expired-reservations`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al limpiar reservas expiradas:", error);
            throw error;
        }
    }

    // --- DASHBOARD & MÉTRICAS ---

    async getConsecutiveDashboard(accessToken) {
        try {
            const url = `${this.baseApi}/consecutives/dashboard`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener dashboard de consecutivos:", error);
            throw error;
        }
    }

    async getConsecutiveMetrics(accessToken, consecutiveId, timeRange = "24h") {
        try {
            const url = `${this.baseApi}/consecutives/metrics/${consecutiveId}?timeRange=${timeRange}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener métricas:", error);
            throw error;
        }
    }
}
