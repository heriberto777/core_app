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
        try {
            const stats = await auditApi.getTransferStats(accessToken, {
                timeRange,
                taskId: selectedTask !== "all" ? selectedTask : undefined,
            });
            return stats || generateMockData();
        } catch (e) {
            console.warn("API Stats failed, using mock data:", e);
            return generateMockData();
        }
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

    function generateMockData() {
        const lastDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split("T")[0];
        });

        return {
            transfersByDay: lastDays.map(date => ({
                date,
                completed: Math.floor(Math.random() * 20) + 10,
                failed: Math.floor(Math.random() * 5)
            })),
            successRate: [
                { name: "Exitosas", value: 85 },
                { name: "Fallidas", value: 15 },
            ],
            taskPerformance: [
                { name: "Clientes", executed: 45, avgTime: 1.2, successRate: 98 },
                { name: "Ventas", executed: 30, avgTime: 2.5, successRate: 92 },
                { name: "Logística", executed: 25, avgTime: 1.8, successRate: 88 },
            ],
            serverResponseTimes: lastDays.map(date => ({
                date,
                server1: Math.floor(Math.random() * 50) + 30,
                server2: Math.floor(Math.random() * 60) + 40
            }))
        };
    }

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
