import { useState, useEffect, useMemo } from "react";
import { MappingApi } from "../api/index";

const api = new MappingApi();

export function useOrdersVisualization(accessToken) {
    const [activeMappingId, setActiveMappingId] = useState(null);
    const [activeConfig, setActiveConfig] = useState(null);
    const [activeMappingName, setActiveMappingName] = useState("");
    const [activeView, setActiveView] = useState("mappingsList"); // mappingsList, mappingEditor, documents
    const [editingMappingId, setEditingMappingId] = useState(null);
    const [showConfigInfo, setShowConfigInfo] = useState(false);
    const [viewMode, setViewMode] = useState("table"); // table, cards

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [selectAll, setSelectAll] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        status: "all",
        warehouse: "all",
        showProcessed: false,
    });

    // Load mapping configuration
    const loadMappingConfig = async (mappingId) => {
        if (!mappingId) return;
        try {
            setLoading(true);
            const config = await api.getMappingById(accessToken, mappingId);
            setActiveConfig(config);
            setActiveMappingName(config.name || "Configuración sin nombre");
        } catch (err) {
            console.error("Error al cargar configuración:", err);
            setError("No se pudo cargar los detalles de la configuración");
        } finally {
            setLoading(false);
        }
    };

    // Fetch orders
    const fetchOrders = async () => {
        if (!activeMappingId) return;
        try {
            setLoading(true);
            setError(null);
            const data = await api.getDocumentsByMapping(accessToken, activeMappingId, filters);
            setOrders(data || []);
            setSelectedOrders([]);
            setSelectAll(false);
        } catch (err) {
            console.error("Error fetching orders:", err);
            setError("Ocurrió un error al cargar los documentos");
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    // Effects
    useEffect(() => {
        if (activeMappingId) {
            loadMappingConfig(activeMappingId);
            fetchOrders();
        }
    }, [activeMappingId]);

    // Refetch when filters change
    useEffect(() => {
        if (activeMappingId) fetchOrders();
    }, [filters]);

    // Filtered orders (Search)
    const filteredOrders = useMemo(() => {
        if (!search) return orders;
        const searchLower = search.toLowerCase();
        return orders.filter((order) =>
            Object.values(order).some(
                (val) => val && typeof val === "string" && val.toLowerCase().includes(searchLower)
            )
        );
    }, [orders, search]);

    // Handlers
    const handleSelectOrder = (orderId) => {
        setSelectedOrders(prev =>
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    const handleSelectAll = (isFiltered = true) => {
        const list = isFiltered ? filteredOrders : orders;
        if (selectedOrders.length === list.length) {
            setSelectedOrders([]);
            setSelectAll(false);
        } else {
            const idField = list.length > 0 ? Object.keys(list[0])[0] : null;
            if (idField) {
                setSelectedOrders(list.map(o => o[idField]));
                setSelectAll(true);
            }
        }
    };

    const processSelectedOrders = async () => {
        if (!activeMappingId || selectedOrders.length === 0) return null;
        try {
            setIsProcessing(true);
            const result = await api.processDocumentsByMapping(accessToken, activeMappingId, selectedOrders);
            await fetchOrders(); // Refresh after process
            return result;
        } catch (err) {
            console.error("Error processing orders:", err);
            throw err;
        } finally {
            setIsProcessing(false);
        }
    };

    const getOrderDetails = async (order) => {
        const idField = Object.keys(order)[0];
        const documentId = order[idField];
        try {
            return await api.getDocumentDetailsByMapping(accessToken, activeMappingId, documentId);
        } catch (err) {
            console.error("Error getting details:", err);
            throw err;
        }
    };

    return {
        // State
        activeMappingId, setActiveMappingId,
        activeConfig,
        activeMappingName,
        activeView, setActiveView,
        editingMappingId, setEditingMappingId,
        showConfigInfo, setShowConfigInfo,
        viewMode, setViewMode,
        orders,
        filteredOrders,
        loading,
        isProcessing,
        error,
        search, setSearch,
        selectedOrders, setSelectedOrders,
        selectAll,
        filters, setFilters,

        // Methods
        fetchOrders,
        handleSelectOrder,
        handleSelectAll,
        processSelectedOrders,
        getOrderDetails
    };
}
