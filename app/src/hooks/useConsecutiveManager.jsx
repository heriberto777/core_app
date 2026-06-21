import { useState, useCallback, useEffect, useMemo } from "react";
import { ConsecutiveApi } from "../api/index";

const api = new ConsecutiveApi();

export function useConsecutiveManager(accessToken) {
    const [consecutives, setConsecutives] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showDashboard, setShowDashboard] = useState(false);
    const [dashboardData, setDashboardData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Loaders
    const loadConsecutives = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getConsecutives(accessToken);
            if (response) setConsecutives(response);
        } catch (error) {
            console.error("Error loading consecutives:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    const loadDashboard = useCallback(async () => {
        try {
            const response = await api.getConsecutiveDashboard(accessToken);
            if (response) setDashboardData(response);
        } catch (error) {
            console.error("Error loading dashboard:", error);
        }
    }, [accessToken]);

    useEffect(() => {
        loadConsecutives();
    }, [loadConsecutives]);

    useEffect(() => {
        if (showDashboard) {
            loadDashboard();
            const interval = setInterval(loadDashboard, 30000);
            return () => clearInterval(interval);
        }
    }, [showDashboard, loadDashboard]);

    // Filtering
    const filteredConsecutives = useMemo(() => {
        return consecutives.filter(
            (c) =>
                c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.description?.toLowerCase().includes(search.toLowerCase())
        );
    }, [consecutives, search]);

    // Operations
    const handleCreate = async (data) => {
        setIsProcessing(true);
        try {
            const result = await api.createConsecutive(accessToken, data);
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdate = async (id, data) => {
        setIsProcessing(true);
        try {
            const result = await api.updateConsecutive(accessToken, id, data);
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id) => {
        setIsProcessing(true);
        try {
            const result = await api.deleteConsecutive(accessToken, id);
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReset = async (id, initialValue) => {
        setIsProcessing(true);
        try {
            const result = await api.resetConsecutive(accessToken, id, initialValue);
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAssign = async (id, assignmentData) => {
        setIsProcessing(true);
        try {
            const result = await api.assignConsecutive(accessToken, id, assignmentData);
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const getNextValue = async (id, segment = null) => {
        setIsProcessing(true);
        try {
            const result = await api.getNextConsecutiveValue(accessToken, id, { segment });
            await loadConsecutives();
            return result;
        } finally {
            setIsProcessing(false);
        }
    };

    const getMetrics = useCallback(async (id, timeframe = "24h") => {
        return api.getConsecutiveMetrics(accessToken, id, timeframe);
    }, [accessToken]);

    return {
        consecutives,
        filteredConsecutives,
        loading,
        isProcessing,
        search,
        setSearch,
        showDashboard,
        setShowDashboard,
        dashboardData,
        loadConsecutives,
        handleCreate,
        handleUpdate,
        handleDelete,
        handleReset,
        handleAssign,
        getNextValue,
        getMetrics
    };
}
