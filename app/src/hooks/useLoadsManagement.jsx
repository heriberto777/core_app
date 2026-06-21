import { useState, useCallback, useMemo, useEffect } from "react";
import { LoadsApi } from "../api/index";
import { usePermissions } from "./usePermissions";
import { useFetchData } from "./useFetchData";

const loadsApi = new LoadsApi();

export function useLoadsManagement(accessToken) {
    const permissions = usePermissions();

    useEffect(() => {
        // Solo usamos esto para asegurarnos que el hook de permisos esté listo
    }, [permissions]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState({
        dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        sellers: [],
        transferStatus: "all",
        includeLoaded: false,
    });

    const canRead = permissions?.hasPermission ? permissions.hasPermission('loads', 'read') : true;
    const canCreate = permissions?.hasPermission ? permissions.hasPermission('loads', 'create') : true;

    // Fetch de pedidos pendientes
    const fetchOrdersCallback = useCallback(async () => {
        if (!canRead || !accessToken) return { data: [], totalRecords: 0 };
        return await loadsApi.getPendingOrders(accessToken, filters);
    }, [accessToken, filters, canRead]);

    const {
        data: ordersResponse,
        loading,
        refreshing,
        error,
        fetchData: fetchOrders,
    } = useFetchData(fetchOrdersCallback, [accessToken], {
        autoFetch: false,
        initialData: { data: [], totalRecords: 0 },
    });

    // Metadatos (Vendedores, Repartidores)
    const [sellers, setSellers] = useState([]);
    const [deliveryPersons, setDeliveryPersons] = useState([]);

    const fetchMetadata = useCallback(async () => {
        if (!canRead || !accessToken) return;
        try {
            const [sRes, dRes] = await Promise.all([
                loadsApi.getSellers(accessToken),
                loadsApi.getDeliveryPersonsFilter(accessToken)
            ]);
            setSellers(Array.isArray(sRes) ? sRes : sRes?.data || []);
            setDeliveryPersons(Array.isArray(dRes) ? dRes : dRes?.data || []);
        } catch (err) {
            console.error("Loads Metadata Error:", err);
        }
    }, [accessToken, canRead]);

    // Selección
    const toggleOrderSelection = (id) => {
        setSelectedOrders(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectAllOrders = (ids) => setSelectedOrders(ids);

    // Acciones
    const processLoad = async (deliveryPersonCode) => {
        if (!canCreate) throw new Error("No tienes permisos para procesar cargas");
        try {
            setIsProcessing(true);
            const response = await loadsApi.processOrderLoad(accessToken, selectedOrders, deliveryPersonCode);
            await fetchOrders();
            setSelectedOrders([]);
            return response;
        } finally {
            setIsProcessing(false);
        }
    };

    const cancelOrders = async (ids, reason = "Cancelación manual") => {
        const result = await loadsApi.cancelOrders(accessToken, ids, reason);
        await fetchOrders();
        setSelectedOrders(prev => prev.filter(id => !ids.includes(id)));
        return result;
    };

    const getOrderDetails = async (id) => {
        return await loadsApi.getOrderDetails(accessToken, id);
    };

    const removeOrderLines = async (orderId, lines) => {
        const result = await loadsApi.removeOrderLines(accessToken, orderId, lines);
        await fetchOrders();
        return result;
    };

    // Datos filtrados por búsqueda local
    const orders = useMemo(() => {
        // Robusto: manejar si viene el array directo o dentro de .data
        if (Array.isArray(ordersResponse)) return ordersResponse;
        if (Array.isArray(ordersResponse?.data)) return ordersResponse.data;
        return [];
    }, [ordersResponse]);

    const filteredOrders = useMemo(() => {
        if (!search.trim()) return orders;
        const s = search.toLowerCase();
        return orders.filter(o =>
            o.pedido?.toString().includes(s) ||
            o.cliente?.toLowerCase().includes(s) ||
            o.nombreVendedor?.toLowerCase().includes(s)
        );
    }, [orders, search]);

    const stats = useMemo(() => {
        const pending = filteredOrders.filter(o => o.transferStatus === 'pending').length;
        const processing = filteredOrders.filter(o => o.transferStatus === 'processing').length;
        const completed = filteredOrders.filter(o => o.transferStatus === 'completed').length;
        const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.totalPedido || 0), 0);
        return { pending, processing, completed, totalAmount, total: filteredOrders.length };
    }, [filteredOrders]);

    return {
        orders: filteredOrders,
        stats,
        loading,
        refreshing,
        isProcessing,
        error,
        filters,
        search,
        selectedOrders,
        metadata: { sellers, deliveryPersons },
        actions: {
            setSearch,
            updateFilters: (f) => {
                setFilters(prev => {
                    const updates = typeof f === 'function' ? f(prev) : f;
                    return { ...prev, ...updates };
                });
            },
            resetFilters: () => {
                setFilters({
                    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
                    dateTo: new Date().toISOString().split("T")[0],
                    sellers: [],
                    transferStatus: "all",
                    includeLoaded: false,
                });
                setSearch("");
                setSelectedOrders([]);
            },
            fetchOrders,
            fetchMetadata,
            toggleOrderSelection,
            selectAllOrders,
            processLoad,
            cancelOrders,
            getOrderDetails,
            removeOrderLines
        }
    };
}
