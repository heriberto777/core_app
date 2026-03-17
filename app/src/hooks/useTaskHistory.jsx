import { useState, useCallback, useEffect } from "react";
import { AuditStatsApi } from "../api/index";

const api = new AuditStatsApi();

export function useTaskHistory(accessToken, taskId) {
    const [taskInfo, setTaskInfo] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        page: 1,
        pages: 1,
        total: 0
    });

    const loadHistory = useCallback(async (filters = {}) => {
        if (!accessToken || !taskId) return;

        setLoading(true);
        setError(null);
        try {
            // El backend ignora filtros actualmente, pero los manejamos por consistencia futura
            const result = await api.getTaskHistory(accessToken, taskId);

            if (result.success && result.data) {
                setTaskInfo(result.data.task);
                setHistory(result.data.history || []);
                setPagination({
                    page: filters.page || 1,
                    pages: result.data.pagination?.pages || 1,
                    total: result.data.pagination?.total || (result.data.history?.length || 0)
                });
            } else {
                throw new Error(result.message || "Error al obtener historial");
            }
        } catch (err) {
            console.error("Error useTaskHistory:", err);
            setError(err.message || "Error al cargar historial");
        } finally {
            setLoading(false);
        }
    }, [accessToken, taskId]);

    useEffect(() => {
        if (accessToken && taskId) {
            loadHistory();
        }
    }, [accessToken, taskId, loadHistory]);

    return {
        taskInfo,
        history,
        loading,
        error,
        pagination,
        loadHistory
    };
}
