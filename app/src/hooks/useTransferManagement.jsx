import { useState, useCallback, useMemo } from "react";
import { useAuth } from "./useAuth";
import { LoadsApi } from "../api/index";

const loadsApi = new LoadsApi();

export const useTransferManagement = () => {
  const { accessToken } = useAuth();

  // Estados unificados
  const [traspasos, setTraspasos] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
    totalValue: 0
  });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0
  });

  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedTraspaso, setSelectedTraspaso] = useState(null);

  // Fetch dinámico de traspasos
  const fetchTraspasos = useCallback(async (filters = {}, isRefreshing = false) => {
    if (!accessToken) return;

    try {
      if (isRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const result = await loadsApi.getTraspasos(accessToken, filters);

      if (result) {
        setTraspasos(result.transfers || []);
        setPagination({
          currentPage: result.pagination?.page || 1,
          totalPages: result.pagination?.totalPages || 1,
          totalItems: result.pagination?.totalItems || 0
        });
      }
    } catch (err) {
      setError(err.message || "Error al sincronizar traspasos");
      console.error("useTransferManagement Error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  // Telemetría de estadísticas
  const fetchStats = useCallback(async (filters = {}) => {
    if (!accessToken) return;
    try {
      const result = await loadsApi.getTraspasoStats(accessToken, filters);
      if (result) setStats(result.stats || result);
    } catch (err) {
      console.error("Stats Error:", err);
    }
  }, [accessToken]);

  // Auxiliares (Repartidores, Bodegas)
  const fetchMetadata = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [persons, whs] = await Promise.all([
        loadsApi.getDeliveryPersonsFilter(accessToken),
        loadsApi.getWarehouses(accessToken)
      ]);
      setDeliveryPersons(persons || []);
      setWarehouses(whs || []);
    } catch (err) {
      console.error("Metadata Error:", err);
    }
  }, [accessToken]);

  // Acciones de ejecución
  const executeTransfer = async (loadId) => {
    const result = await loadsApi.executeTransfer(accessToken, loadId);
    await fetchTraspasos({}, true);
    return result;
  };

  const executeBulkTransfers = async (loadIds) => {
    const result = await loadsApi.executeBulkTransfers(accessToken, { loadIds });
    await fetchTraspasos({}, true);
    return result;
  };

  const getDetails = async (id) => {
    const result = await loadsApi.getTraspasoDetails(accessToken, id);
    setSelectedTraspaso(result);
    return result;
  };

  return {
    traspasos,
    stats,
    loading,
    refreshing,
    error,
    pagination,
    metadata: {
      deliveryPersons,
      warehouses
    },
    selectedTraspaso,
    actions: {
      fetchTraspasos,
      fetchStats,
      fetchMetadata,
      executeTransfer,
      executeBulkTransfers,
      getDetails,
      clearSelection: () => setSelectedTraspaso(null)
    }
  };
};
