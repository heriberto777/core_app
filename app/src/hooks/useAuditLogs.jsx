import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
        limit: 50,
        // === Filtros nuevos ===
        operationType: [],
        entityType: [],
        durationMin: null,
        durationMax: null,
        affectedRecordsMin: null,
        affectedRecordsMax: null,
    });

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
    });

    const [autoRefresh, setAutoRefresh] = useState(false);
    const [autoRefreshInterval, setAutoRefreshInterval] = useState(30000); // 30 segundos por defecto
    const lastErrorCountRef = useRef(null);

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

    // Polling automático para detectar nuevos errores
    useEffect(() => {
        if (!autoRefresh || !accessToken) return;

        const intervalId = setInterval(async () => {
            const currentErrorCount = data?.stats?.error || 0;
            
            // Si hay más errores que antes, hacer refresh
            if (lastErrorCountRef.current !== null && currentErrorCount > lastErrorCountRef.current) {
                console.log(`[AuditLogs] Nuevos errores detectados: ${lastErrorCountRef.current} -> ${currentErrorCount}`);
                await refreshLogs();
            }
            
            lastErrorCountRef.current = currentErrorCount;
        }, autoRefreshInterval);

        return () => clearInterval(intervalId);
    }, [autoRefresh, autoRefreshInterval, accessToken, data, refreshLogs]);

    // También hacer refresh si estamos en autoRefresh y hay cambios en los filtros
    useEffect(() => {
        if (!autoRefresh || !accessToken) return;

        const intervalId = setInterval(async () => {
            await refreshLogs();
        }, autoRefreshInterval);

        return () => clearInterval(intervalId);
    }, [autoRefresh, autoRefreshInterval, accessToken, refreshLogs]);

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

    const stats = useMemo(() => {
        if (!data?.stats) return null;
        return data.stats;
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
            csvContent = "Fecha,Nivel,Operación,Entidad,Mapping,Campo,EntidadID,Registros,Duración(ms),Mensaje,Fuente\n" +
                logs.map(l => {
                    const date = new Date(l.timestamp).toLocaleString();
                    const level = l.level || '';
                    const operationType = l.operationType || '';
                    const entityType = l.entityType || '';
                    const mappingName = l.mappingName || '';
                    const fieldName = l.fieldName || '';
                    const entityId = l.entityId || '';
                    const affectedRecords = l.affectedRecords || 0;
                    const durationMs = l.durationMs || 0;
                    const message = (l.message || '').replace(/"/g, '""').substring(0, 500);
                    const source = l.source || '';
                    return `${date},${level},${operationType},${entityType},${mappingName},${fieldName},${entityId},${affectedRecords},${durationMs},"${message}","${source}"`;
                }).join('\n');
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

    const toggleAutoRefresh = () => {
        setAutoRefresh(prev => !prev);
    };

    const setRefreshInterval = (intervalMs) => {
        setAutoRefreshInterval(intervalMs);
    };

    return {
        logs,
        meta,
        stats,
        loading,
        refreshing,
        error,
        logType,
        filters,
        pagination,
        autoRefresh,
        autoRefreshInterval,
        actions: {
            setLogType,
            updateFilters,
            changePage,
            refreshLogs,
            clearLogs,
            exportCSV,
            toggleAutoRefresh,
            setRefreshInterval
        }
    };
};
