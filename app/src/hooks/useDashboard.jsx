import { useState, useEffect, useCallback } from "react";
import { TransferTaskApi, AuditStatsApi } from "../api/index";
import { nextOccurrenceInZone } from "../utils/index";

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
    const [scheduleTimezone, setScheduleTimezone] = useState("America/Santo_Domingo");

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
                const timezone = schedule.value.timezone || "America/Santo_Domingo";
                setScheduleTimezone(timezone);
                // "hour" casi siempre existe aunque el scheduler esté desactivado
                // (el documento Config guarda la última hora configurada); sin
                // comprobar "enabled" el panel del Dashboard mostraba una cuenta
                // regresiva de "próxima ejecución" con el planificador apagado.
                if (schedule.value.enabled) {
                    const [hour, minute] = schedule.value.hour.split(":");
                    // Antes usaba new Date().setHours(...), que interpreta la hora
                    // en la zona horaria del navegador — no necesariamente la misma
                    // zona en la que realmente se programa la ejecución automática.
                    setNextScheduled(nextOccurrenceInZone(Number(hour), Number(minute), timezone));
                } else {
                    setNextScheduled(null);
                }
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
        scheduleTimezone,
        loading,
        refreshing,
        error,
        handleRefresh,
        fetchDashboardData
    };
}
