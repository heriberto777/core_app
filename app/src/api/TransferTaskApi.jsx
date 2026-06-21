import { ENV } from "../utils/index";

export class TransferTaskApi {
    baseApi = ENV.BASE_API;

    constructor() {
        this.cancellationInProgress = new Map();
        this.statusCheckIntervals = new Map();
    }

    async getTasks(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/accion`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener tareas:", error);
            throw error;
        }
    }

    async upsertTransferTask(accessToken, datos) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/accion/addEdit`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(datos),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al guardar tarea:", error);
            throw error;
        }
    }

    async deleteTask(accessToken, name) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/accion/${name}`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ name }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al eliminar tarea:", error);
            throw error;
        }
    }

    async executeTask(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/execute/${taskId}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `Error ${response.status}`);
            }

            const result = await response.json();
            return result.data || result;
        } catch (error) {
            console.error("Error ejecutando tarea:", error);
            throw error;
        }
    }

    async addTimeTransfer(accessToken, datos) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/horas`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(datos),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al configurar horas:", error);
            throw error;
        }
    }

    async getSchuledTime(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/horas`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener programación:", error);
            throw error;
        }
    }

    async getTaskStatusById(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/accion/${taskId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al obtener estado de tarea:", error);
            throw error;
        }
    }

    async getTaskStatus(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/config/task-status`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener estado de tareas:", error);
            throw error;
        }
    }

    // --- GESTIÓN DE CANCELACIÓN ---

    async cancelTask(accessToken, taskId, options = {}) {
        try {
            if (this.cancellationInProgress.has(taskId)) {
                return { success: false, message: "La tarea ya está siendo cancelada" };
            }

            this.cancellationInProgress.set(taskId, true);
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/cancel/${taskId}`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    force: options.force || false,
                    reason: options.reason || "Cancelado por el usuario",
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                this.cancellationInProgress.delete(taskId);
                throw result;
            }

            if (options.onStatusChange) {
                this.startCancellationMonitoring(accessToken, taskId, options.onStatusChange);
            }

            return result;
        } catch (error) {
            this.cancellationInProgress.delete(taskId);
            console.error("Error al cancelar tarea:", error);
            throw error;
        }
    }

    async getCancellationStatus(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/tasks/${taskId}/status`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al obtener estado de cancelación:", error);
            throw error;
        }
    }

    async getActiveCancelableTasks(accessToken) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/active`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al obtener tareas cancelables:", error);
            throw error;
        }
    }

    async cancelAllTasks(accessToken, options = {}) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.CANCELLATION}/cancel-all`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    force: options.force || false,
                    reason: options.reason || "Cancelación masiva",
                }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al cancelar todas las tareas:", error);
            throw error;
        }
    }

    startCancellationMonitoring(accessToken, taskId, onStatusChange) {
        if (this.statusCheckIntervals.has(taskId)) {
            clearInterval(this.statusCheckIntervals.get(taskId));
        }

        const intervalId = setInterval(async () => {
            try {
                const status = await this.getCancellationStatus(accessToken, taskId);
                if (!status.data.isActiveProcess) {
                    clearInterval(intervalId);
                    this.statusCheckIntervals.delete(taskId);
                    this.cancellationInProgress.delete(taskId);
                }
                onStatusChange(status);
            } catch (error) {
                console.error(`Error al monitorear tarea ${taskId}:`, error);
                if (error.response?.status === 404) {
                    clearInterval(intervalId);
                    this.statusCheckIntervals.delete(taskId);
                    this.cancellationInProgress.delete(taskId);
                }
            }
        }, 2000);

        this.statusCheckIntervals.set(taskId, intervalId);
    }

    // --- TAREAS VINCULADAS ---

    async getTaskLinkingInfo(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/linking-info/${taskId}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al obtener info de vinculación:", error);
            throw error;
        }
    }

    async executeLinkedGroup(accessToken, taskId) {
        try {
            const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/execute-linked-group/${taskId}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result;
        } catch (error) {
            console.error("Error al ejecutar grupo vinculado:", error);
            throw error;
        }
    }

    async getLinkedGroups(token) {
        try {
            const response = await fetch(`${this.baseApi}/linked-groups`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener grupos vinculados:", error);
            throw error;
        }
    }

    async getGroupDetails(token, groupName) {
        try {
            const url = `${this.baseApi}/linked-groups/${encodeURIComponent(groupName)}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al obtener detalles del grupo:", error);
            throw error;
        }
    }

    async deleteLinkedGroup(token, groupName) {
        try {
            const url = `${this.baseApi}/linked-groups/${encodeURIComponent(groupName)}`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ confirmDelete: true }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al eliminar grupo:", error);
            throw error;
        }
    }

    async removeTaskFromGroup(token, taskId) {
        try {
            const url = `${this.baseApi}/linked-groups/task/${taskId}`;
            const response = await fetch(url, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al remover tarea del grupo:", error);
            throw error;
        }
    }

    async reorderGroupTasks(token, groupName, taskOrders) {
        try {
            const url = `${this.baseApi}/linked-groups/${encodeURIComponent(groupName)}/reorder`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ taskOrders }),
            });
            const result = await response.json();
            if (!response.ok) throw result;
            return result.data || result;
        } catch (error) {
            console.error("Error al reordenar tareas:", error);
            throw error;
        }
    }

    cleanup() {
        for (const intervalId of this.statusCheckIntervals.values()) {
            clearInterval(intervalId);
        }
        this.statusCheckIntervals.clear();
        this.cancellationInProgress.clear();
    }
}
