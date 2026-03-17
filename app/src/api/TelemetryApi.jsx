import axios from "axios";
import { ENV } from "../utils/index";

export class Telemetry {
    /**
     * Obtiene métricas en tiempo real del sistema
     * @param {string} accessToken - Token de acceso
     * @param {boolean} includeHistory - Si incluir historial de la sesión
     * @returns {Promise<Object>}
     */
    async getLiveMetrics(accessToken, includeHistory = false) {
        try {
            const response = await axios.get(
                `${ENV.BASE_PATH}/api/${ENV.API_VERSION}/telemetry/live?history=${includeHistory}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error("Error fetching live metrics:", error);
            throw error.response?.data || error.message;
        }
    }

    /**
     * Obtiene tendencias históricas de telemetría
     * @param {string} accessToken - Token de acceso
     * @param {number} hours - Horas atrás para la consulta
     * @returns {Promise<Object>}
     */
    async getTrends(accessToken, hours = 24) {
        try {
            const response = await axios.get(
                `${ENV.BASE_PATH}/api/${ENV.API_VERSION}/telemetry/trends?hours=${hours}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error("Error fetching telemetry trends:", error);
            throw error.response?.data || error.message;
        }
    }
}
