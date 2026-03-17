import { useState, useCallback, useEffect, useMemo } from "react";
import { TransferTaskApi, LogisticsApi } from "../api/index";
import { useAuth, useFetchData } from "../index";
import Swal from "sweetalert2";

const taskApi = new TransferTaskApi();
const logisticsApi = new LogisticsApi();

export const useLoadsTasks = () => {
    const { accessToken } = useAuth();
    const [search, setSearch] = useState("");
    const [vendedores, setVendedores] = useState([]);
    const [loadingVendedores, setLoadingVendedores] = useState(false);

    // FETCH TAREAS (Filtradas por batchesSSE)
    const fetchTasksCallback = useCallback(async () => {
        try {
            const result = await taskApi.getTasks(accessToken);
            return result;
        } catch (error) {
            console.error("Error al obtener tareas:", error);
            throw error;
        }
    }, [accessToken]);

    const {
        data: tasks,
        loading: tasksLoading,
        refreshing: tasksRefreshing,
        error: tasksError,
        fetchData: fetchTasks,
    } = useFetchData(fetchTasksCallback, [accessToken], {
        autoRefresh: true,
        refreshInterval: 5000,
        initialData: [],
    });

    // FETCH VENDEDORES
    const fetchVendedores = useCallback(async () => {
        try {
            setLoadingVendedores(true);
            const response = await logisticsApi.getVendedores(accessToken);
            if (response) setVendedores(response);
            return response;
        } catch (error) {
            console.error("Error al cargar vendedores:", error);
            return [];
        } finally {
            setLoadingVendedores(false);
        }
    }, [accessToken]);

    useEffect(() => {
        if (accessToken) fetchVendedores();
    }, [accessToken, fetchVendedores]);

    // FILTRADO DINÁMICO
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchName = task.name.toLowerCase().includes(search.toLowerCase());
            const matchExecutionMode = task.executionMode === "batchesSSE";
            return matchName && matchExecutionMode;
        });
    }, [tasks, search]);

    // HELPERS PARA EL PROCESO DE CARGA
    const getConsecutivo = async () => {
        try {
            const response = await logisticsApi.getLoadConsecutivo(accessToken);
            return response.loadId || response;
        } catch (error) {
            console.error("Error consecutivo:", error);
            throw error;
        }
    };

    const getSalesData = async (date, vendors, taskId) => {
        try {
            const response = await logisticsApi.executeLoadTask(accessToken, date, vendors, taskId);
            return response;
        } catch (error) {
            console.error("Error sales data:", error);
            throw error;
        }
    };

    const insertOrders = async (salesData, loadId) => {
        try {
            return await logisticsApi.executeInsertOrders(accessToken, salesData, loadId);
        } catch (error) {
            console.error("Error insert orders:", error);
            throw error;
        }
    };

    const insertLoadsDetail = async (route, loadId, salesData, bodega) => {
        try {
            return await logisticsApi.executeInsertLoads(accessToken, route, loadId, salesData, bodega);
        } catch (error) {
            console.error("Error insert loads detail:", error);
            throw error;
        }
    };

    const executeTraspaso = async (route, loadId, salesData, bodega) => {
        try {
            return await logisticsApi.executeInsertTrapaso(accessToken, route, loadId, salesData, bodega);
        } catch (error) {
            console.error("Error execute traspaso:", error);
            throw error;
        }
    };

    return {
        tasks: filteredTasks,
        allTasks: tasks,
        loading: tasksLoading,
        refreshing: tasksRefreshing,
        error: tasksError,
        vendedores,
        loadingVendedores,
        search,
        setSearch,
        fetchTasks,
        fetchVendedores,
        getConsecutivo,
        getSalesData,
        insertOrders,
        insertLoadsDetail,
        executeTraspaso
    };
};
