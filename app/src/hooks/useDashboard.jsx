import { useState, useEffect, useCallback } from "react";
import { TransferTaskApi, AuditStatsApi } from "../api/index";

const taskApi = new TransferTaskApi();
const auditApi = new AuditStatsApi();

export function useDashboard(accessToken) {
    const [stats, setStats] = useState({
        totalTasks: 0,
        activeTasks: 0,
        runningTasks: 0,
        completedToday: 0,
        failedToday: 0,
    });
    const [serverStatus, setServerStatus] = useState({
        server1: { status: "checking", responseTime: 0 },
        server2: { status: "checking", responseTime: 0 },
        mongodb: { status: "checking" },
    });
    const [lastTransfers, setLastTransfers] = useState([]);
    const [nextScheduled, setNextScheduled] = useState(null);
    const [executionTime, setExecutionTime] = useState("02:00");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const fetchDashboardData = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            else setRefreshing(true);

            setError(null);

            // Parallel fetching for better performance
            const [tasks, history, schedule, servers] = await Promise.allSettled([
                taskApi.getTasks(accessToken),
                auditApi.getTransferHistory(accessToken),
                taskApi.getSchuledTime(accessToken),
                auditApi.checkServerStatus(accessToken)
            ]);

            // 1. Process Tasks Stats
            if (tasks.status === "fulfilled" && Array.isArray(tasks.value)) {
                const t = tasks.value;
                setStats(prev => ({
                    ...prev,
                    totalTasks: t.length,
                    activeTasks: t.filter(x => x.active).length,
                    runningTasks: t.filter(x => x.status === "running").length,
                    completedToday: history.status === "fulfilled" ? (history.value?.completedToday || 0) : prev.completedToday,
                    failedToday: history.status === "fulfilled" ? (history.value?.failedToday || 0) : prev.failedToday,
                }));
            }

            // 2. Process History
            if (history.status === "fulfilled" && history.value?.history) {
                setLastTransfers(history.value.history.slice(0, 5).map(item => ({
                    id: item._id,
                    name: item.taskName || item.name || "N/A",
                    date: item.date,
                    status: item.status,
                    totalRecords: item.totalRecords || item.successfulRecords || 0
                })));
            }

            // 3. Process Schedule
            if (schedule.status === "fulfilled" && schedule.value?.hour) {
                setExecutionTime(schedule.value.hour);
                const [hour, minute] = schedule.value.hour.split(":");
                const nextRun = new Date();
                nextRun.setHours(Number(hour), Number(minute), 0, 0);
                if (nextRun < new Date()) nextRun.setDate(nextRun.getDate() + 1);
                setNextScheduled(nextRun);
            }

            // 4. Process Servers
            if (servers.status === "fulfilled") {
                setServerStatus(servers.value);
            } else {
                setServerStatus({
                    server1: { status: "unknown", responseTime: 0 },
                    server2: { status: "unknown", responseTime: 0 },
                    mongodb: { status: "unknown" },
                });
            }

        } catch (err) {
            console.error("Dashboard calculation error:", err);
            setError("No se pudo sincronizar la información del dashboard.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [accessToken]);

    // Initial load and polling
    useEffect(() => {
        if (!accessToken) return;

        fetchDashboardData();
        const interval = setInterval(() => fetchDashboardData(true), 60000);

        return () => clearInterval(interval);
    }, [accessToken, fetchDashboardData]);

    const handleRefresh = () => fetchDashboardData(true);

    return {
        stats,
        serverStatus,
        lastTransfers,
        nextScheduled,
        executionTime,
        loading,
        refreshing,
        error,
        handleRefresh,
        fetchDashboardData
    };
}
