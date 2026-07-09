import { useState, useCallback, useEffect } from "react";
import { TransferTaskApi, AuditStatsApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const taskApi = new TransferTaskApi();
const auditApi = new AuditStatsApi();

export const useSystemStats = (accessToken) => {
    const [timeRange, setTimeRange] = useState("7d");
    const [selectedTask, setSelectedTask] = useState("all");
    const [availableTasks, setAvailableTasks] = useState([]);

    // Cargar tareas disponibles para filtros
    useEffect(() => {
        const loadTasks = async () => {
            if (!accessToken) return;
            try {
                const tasks = await taskApi.getTasks(accessToken);
                if (Array.isArray(tasks)) setAvailableTasks(tasks);
            } catch (e) {
                console.error("Error loading tasks for stats:", e);
            }
        };
        loadTasks();
    }, [accessToken]);

    const fetchStatsCallback = useCallback(async () => {
        if (!accessToken) return null;
        return await auditApi.getTransferStats(accessToken, {
            timeRange,
            taskId: selectedTask !== "all" ? selectedTask : undefined,
        });
    }, [accessToken, timeRange, selectedTask]);

    const {
        data: stats,
        loading,
        refreshing,
        error,
        fetchData: refreshStats
    } = useFetchData(fetchStatsCallback, [accessToken, timeRange, selectedTask], {
        autoRefresh: true,
        refreshInterval: 60000 // 1 minuto para estadísticas
    });

    return {
        stats,
        loading,
        refreshing,
        error,
        filters: {
            timeRange,
            setTimeRange,
            selectedTask,
            setSelectedTask,
            availableTasks
        },
        actions: {
            refreshStats
        }
    };
};
