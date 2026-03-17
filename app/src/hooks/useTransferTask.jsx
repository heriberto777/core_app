import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth, useFetchData, useNotification } from "../index";
import { TransferTaskApi, AuditStatsApi } from "../api/index";
import { progressClient } from "../utils/index";

const taskApi = new TransferTaskApi();
const auditApi = new AuditStatsApi();

export const useTransferTask = () => {
    const { accessToken } = useAuth();
    const { showSuccess, showError, showWarning } = useNotification();

    const [search, setSearch] = useState("");
    const [activeTasks, setActiveTasks] = useState({});
    const [actionStates, setActionStates] = useState({}); // Track { taskId: 'executing'|'deleting'|'canceling'|'history' }
    const [taskEstimates, setTaskEstimates] = useState({});
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const previousTasksRef = useRef(null);

    const [filters, setFilters] = useState({
        type: "all",
        executionMode: "all",
        transferType: "all",
        status: "all",
    });

    const fetchTasksCallback = useCallback(async () => {
        try {
            return await taskApi.getTasks(accessToken);
        } catch (error) {
            console.error("Error al obtener tareas:", error);
            throw error;
        }
    }, [accessToken]);

    const {
        data: tasks,
        loading: tasksLoading,
        refreshing: tasksRefreshing,
        setData: setTasks,
        error: tasksError,
        fetchData: fetchTasks,
    } = useFetchData(fetchTasksCallback, [accessToken], {
        autoRefresh: true,
        refreshInterval: 5000,
        enableCache: true,
        initialData: [],
    });

    // Notificaciones
    useEffect(() => {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
                setNotificationsEnabled(permission === "granted");
            });
        } else if ("Notification" in window) {
            setNotificationsEnabled(Notification.permission === "granted");
        }
    }, []);

    // SSE Subscription Logic
    useEffect(() => {
        const runningTasks = tasks.filter((task) => task.status === "running");

        runningTasks.forEach((task) => {
            if (!progressClient.isSubscribed(task._id)) {
                progressClient.subscribe(task._id, {
                    progress: (data) => {
                        setTasks((prev) => prev.map((t) => t._id === task._id ? { ...t, progress: data.progress, status: data.status || t.status } : t));

                        if (activeTasks[task._id]?.startTime) {
                            const elapsed = Date.now() - activeTasks[task._id].startTime;
                            if (data.progress > 0) {
                                const totalEstimate = (elapsed / data.progress) * 100;
                                setTaskEstimates(prev => ({
                                    ...prev,
                                    [task._id]: { elapsed, remaining: totalEstimate - elapsed, total: totalEstimate, speed: data.progress / (elapsed / 1000 / 60) }
                                }));
                            }
                        }
                    },
                    status: (data) => {
                        setTasks((prev) => prev.map((t) => t._id === task._id ? { ...t, status: data.status } : t));
                        if (notificationsEnabled) {
                            const title = data.status === "completed" ? "Tarea completada" : "Error en tarea";
                            const body = `La tarea "${task.name}" ha finalizado con estado: ${data.status}`;
                            new Notification(title, { body, icon: "/favicon.ico" });
                        }
                    },
                    reconnectFailed: () => {
                        setTasks((prev) => prev.map((t) => t._id === task._id ? { ...t, connectionLost: true } : t));
                    }
                });

                if (!activeTasks[task._id]) {
                    setActiveTasks(prev => ({ ...prev, [task._id]: { startTime: Date.now() } }));
                }
            }
        });

        tasks.forEach((task) => {
            if (task.status !== "running" && progressClient.isSubscribed(task._id)) {
                progressClient.unsubscribe(task._id);
            }
        });

        return () => progressClient.closeAll();
    }, [tasks, activeTasks, notificationsEnabled, setTasks]);

    const handleFilterChange = (filterType, value) => {
        setFilters(prev => ({ ...prev, [filterType]: value }));
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter((task) => {
            const matchesSearch = task.name.toLowerCase().includes(search.toLowerCase());
            const matchesType = filters.type === "all" || task.type === filters.type;
            const matchesExec = filters.executionMode === "all" || task.executionMode === filters.executionMode;
            const matchesTransfer = filters.transferType === "all" || task.transferType === filters.transferType;
            const matchesStatus = filters.status === "all" || (filters.status === "active" ? task.active : !task.active);
            return matchesSearch && matchesType && matchesExec && matchesTransfer && matchesStatus;
        });
    }, [tasks, search, filters]);

    const deleteTask = async (taskId) => {
        setActionStates(prev => ({ ...prev, [taskId]: 'deleting' }));
        try {
            await taskApi.deleteTask(accessToken, taskId);
            showSuccess("Tarea eliminada correctamente");
            fetchTasks();
            return true;
        } catch (error) {
            showError("Error al eliminar la tarea: " + error.message);
            return false;
        } finally {
            setActionStates(prev => ({ ...prev, [taskId]: null }));
        }
    };

    const cancelTask = async (taskId) => {
        setActionStates(prev => ({ ...prev, [taskId]: 'canceling' }));
        try {
            await taskApi.cancelTask(accessToken, taskId);
            showSuccess("Cancelación solicitada");
            fetchTasks();
            return true;
        } catch (error) {
            showError("Error al cancelar: " + error.message);
            return false;
        } finally {
            setActionStates(prev => ({ ...prev, [taskId]: null }));
        }
    };

    const getTaskHistory = async (taskId) => {
        setActionStates(prev => ({ ...prev, [taskId]: 'history' }));
        try {
            return await auditApi.getTaskHistory(accessToken, taskId);
        } catch (error) {
            showError("Error al obtener historial: " + error.message);
            return [];
        } finally {
            setActionStates(prev => ({ ...prev, [taskId]: null }));
        }
    };

    const executeTask = async (taskId) => {
        setActionStates(prev => ({ ...prev, [taskId]: 'executing' }));
        try {
            await taskApi.executeTask(accessToken, taskId);
            showSuccess("Ejecución iniciada");
            fetchTasks();
            return true;
        } catch (error) {
            showError("Error al ejecutar la tarea: " + error.message);
            return false;
        } finally {
            setActionStates(prev => ({ ...prev, [taskId]: null }));
        }
    };

    const saveTask = async (formData, isEdit = false) => {
        try {
            await taskApi.upsertTransferTask(accessToken, formData);
            showSuccess(isEdit ? "Tarea actualizada" : "Tarea creada");
            fetchTasks();
            return true;
        } catch (error) {
            showError("Error al guardar: " + error.message);
            return false;
        }
    };

    return {
        tasks: filteredTasks,
        allTasks: tasks,
        loading: tasksLoading,
        refreshing: tasksRefreshing,
        error: tasksError,
        filters,
        search,
        taskEstimates,
        notificationsEnabled,
        setSearch,
        setFilters,
        setNotificationsEnabled,
        handleFilterChange,
        fetchTasks,
        deleteTask,
        executeTask,
        cancelTask,
        getTaskHistory,
        saveTask,
        setTasks,
        actionStates
    };
};
