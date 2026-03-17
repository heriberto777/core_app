import { useState, useCallback, useMemo } from "react";
import { AuditStatsApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const auditApi = new AuditStatsApi();

export const useAuditLogs = (accessToken, initialType = "system") => {
    const [logType, setLogType] = useState(initialType); // 'system' o 'transfer'
    const [filters, setFilters] = useState({
        level: "all",
        source: "",
        startDate: null,
        endDate: null,
        status: "all",
        taskName: "",
        search: "",
        limit: 50
    });

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
    });

    const fetchLogsCallback = useCallback(async () => {
        if (!accessToken) return null;

        if (logType === "system") {
            return await auditApi.getLogs(accessToken, {
                ...filters,
                page: pagination.page,
                limit: pagination.limit
            });
        } else {
            // Para logs de transferencia usamos el endpoint específico
            return await auditApi.getTransferHistory(accessToken, {
                ...filters,
                page: pagination.page,
                limit: pagination.limit
            });
        }
    }, [accessToken, logType, filters, pagination.page, pagination.limit]);

    const {
        data,
        loading,
        refreshing,
        error,
        fetchData: refreshLogs
    } = useFetchData(fetchLogsCallback, [accessToken, logType, filters, pagination.page]);

    const logs = useMemo(() => {
        if (!data) return [];
        return logType === "system" ? (data.logs || []) : (data.history || []);
    }, [data, logType]);

    const meta = useMemo(() => {
        if (!data) return { total: 0, pages: 1 };
        return {
            total: data.total_logs || data.pagination?.total || 0,
            pages: data.pages || data.pagination?.pages || 1
        };
    }, [data]);

    const updateFilters = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const changePage = (page) => {
        setPagination(prev => ({ ...prev, page }));
    };

    const clearLogs = async (olderThanDays) => {
        if (logType === "system") {
            await auditApi.cleanOldLogs(accessToken, olderThanDays);
            await refreshLogs();
        }
    };

    const exportCSV = () => {
        if (logs.length === 0) return;

        let csvContent = "";
        if (logType === "system") {
            csvContent = "Fecha,Nivel,Mensaje,Fuente\n" +
                logs.map(l => `${new Date(l.timestamp).toLocaleString()},${l.level},"${l.message}","${l.source || ''}"`).join('\n');
        } else {
            csvContent = "Fecha,Tarea,Estado,Registros,Duración(ms)\n" +
                logs.map(l => `${new Date(l.date).toLocaleString()},${l.taskName || 'N/A'},${l.status},${l.totalRecords || 0},${l.executionTime || 0}`).join('\n');
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${logType}_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return {
        logs,
        meta,
        loading,
        refreshing,
        error,
        logType,
        filters,
        pagination,
        actions: {
            setLogType,
            updateFilters,
            changePage,
            refreshLogs,
            clearLogs,
            exportCSV
        }
    };
};
