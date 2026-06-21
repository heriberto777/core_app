import { ENV } from "../utils/index";

export class MappingApi {
    baseApi = ENV.BASE_API;

    async getMappings(accessToken, all = false) {
        try {
            const url = `${this.baseApi}/mappings${all ? "?all=true" : ""}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data;
        } catch (error) {
            console.error("Error al obtener mapeos:", error);
            throw error;
        }
    }

    async getMappingById(accessToken, mappingId) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data;
        } catch (error) {
            console.error("Error al obtener mapeo por ID:", error);
            throw error;
        }
    }

    async createMapping(accessToken, mappingData) {
        try {
            const url = `${this.baseApi}/mappings`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(mappingData),
            });
            const result = await response.json();
            if (response.status !== 201) throw result;
            return result;
        } catch (error) {
            console.error("Error al crear mapeo:", error);
            throw error;
        }
    }

    async updateMapping(accessToken, mappingId, mappingData) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(mappingData),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al actualizar mapeo:", error);
            throw error;
        }
    }

    async deleteMapping(accessToken, mappingId) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al eliminar mapeo:", error);
            throw error;
        }
    }

    async getDocumentsByMapping(accessToken, mappingId, filters = {}) {
        try {
            let url = `${this.baseApi}/mappings/${mappingId}/documents`;
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
            console.error("Error al obtener documentos por mapeo:", error);
            throw error;
        }
    }

    async getDocumentDetailsByMapping(accessToken, mappingId, documentId) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/documents/${documentId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || { details: {} };
        } catch (error) {
            console.error("Error al obtener detalles de documento:", error);
            throw error;
        }
    }

    async validateBonificationConfig(accessToken, mappingId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/mappings/${mappingId}/validate-bonifications`;
            const response = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al validar bonificaciones:", error);
            throw error;
        }
    }

    async processDocumentsByMapping(accessToken, mappingId, documentIds) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/process`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ documentIds }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al procesar documentos:", error);
            throw error;
        }
    }

    async getSourceDataByMapping(accessToken, mappingId, documentId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/source-data/${mappingId}/${documentId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al obtener datos fuente:", error);
            throw error;
        }
    }

    async updateConsecutiveConfig(accessToken, mappingId, consecutiveConfig) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/consecutive`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(consecutiveConfig),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al actualizar configuración de consecutivos:", error);
            throw error;
        }
    }

    async updateEntityData(accessToken, updateData) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/update-entity-data`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(updateData),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al actualizar datos de entidad:", error);
            throw error;
        }
    }

    async queryDynamicFieldValue(accessToken, mappingId, fieldConfig, currentData) {
        try {
            const url = `${this.baseApi}/mappings/${mappingId}/query-dynamic-value`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ fieldConfig, currentData }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al consultar valor dinámico:", error);
            throw error;
        }
    }
}
