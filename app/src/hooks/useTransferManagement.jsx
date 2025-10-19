// src/hooks/useTransferManagement.jsx - CORREGIDO PARA API CONSOLIDADA

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useNotification } from "./useNotification";
import { LoadsApi } from "../api/index";

const loadsApi = new LoadsApi();

export const useTransferManagement = () => {
  const { accessToken } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  // Estados principales - TU ESTRUCTURA ORIGINAL
  const [transfers, setTransfers] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    validation_failed: 0,
    total: 0,
    totalValue: 0,
  });
  const [warehouses, setWarehouses] = useState([]);
  const [selectedTransfers, setSelectedTransfers] = useState([]);

  // ✅ NUEVOS ESTADOS PARA TRASPASOS (USANDO TU ESTRUCTURA EXISTENTE)
  const [traspasos, setTraspasos] = useState([]);
  const [traspasoStats, setTraspasoStats] = useState({});
  const [deliveryPersonsFilter, setDeliveryPersonsFilter] = useState([]);
  const [selectedTraspaso, setSelectedTraspaso] = useState(null);
  const [traspasosPagination, setTraspasosPagination] = useState({});

  // ✅ CONSOLIDADO: fetchTransfers - USA getTraspasos() unificado
  const fetchTransfers = useCallback(
    async (filters = {}) => {
      if (!accessToken) {
        console.warn("No access token available for fetchTransfers");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log("Fetching transfers with filters:", filters);
        // ✅ CAMBIO: Usar getTraspasos() consolidado
        const result = await loadsApi.getTraspasos(accessToken, filters);

        if (result?.success) {
          const transfersData = result.data?.transfers || result.data || [];
          const totalRecordsData =
            result.data?.totalRecords || result.totalRecords || 0;

          setTransfers(transfersData);
          setTotalRecords(totalRecordsData);

          console.log("Transfers fetched successfully:", {
            count: transfersData.length,
            total: totalRecordsData,
          });
        } else {
          throw new Error(result?.message || "Error al obtener traspasos");
        }
      } catch (err) {
        console.error("Error fetching transfers:", err);
        setError(err.message);
        setTransfers([]);
        setTotalRecords(0);
        showError(`Error al obtener traspasos: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, showError]
  );

  // ✅ CONSOLIDADO: fetchTraspasos - USA getTraspasos() unificado
  const fetchTraspasos = useCallback(
    async (filters = {}) => {
      if (!accessToken) {
        console.warn("No access token available for fetchTraspasos");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log("Fetching traspasos with filters:", filters);

        // ✅ CAMBIO: Usar getTraspasos() consolidado
        const result = await loadsApi.getTraspasos(accessToken, filters);

        if (result?.success) {
          const traspasoData = result.data?.transfers || result.data || [];
          const pagination = result.pagination || {};

          setTraspasos(traspasoData);
          setTraspasosPagination(pagination);

          console.log("Traspasos fetched successfully:", {
            count: traspasoData.length,
            pagination,
          });
        } else {
          throw new Error(result?.message || "Error al obtener traspasos");
        }
      } catch (err) {
        console.error("Error en fetchTraspasos:", err);
        setError(err);
        setTraspasos([]);
        setTraspasosPagination({});
        showError(`Error al obtener traspasos: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, showError]
  );

  // ✅ CONSOLIDADO: fetchStats - USA getTraspasoStats() unificado
  const fetchStats = useCallback(
    async (filters = {}) => {
      if (!accessToken) {
        console.warn("No access token available for fetchStats");
        return;
      }

      try {
        console.log("Fetching stats with filters:", filters);

        // ✅ CAMBIO: Usar getTraspasoStats() consolidado
        const result = await loadsApi.getTraspasoStats(accessToken, filters);

        if (result?.success) {
          const statsData = result.data?.stats || result.data || {};
          setStats(statsData);
          console.log("Stats fetched successfully:", statsData);
        } else {
          console.warn("Error al obtener estadísticas:", result?.message);
          showWarning("No se pudieron cargar las estadísticas");
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
        showWarning("Error al cargar estadísticas");
      }
    },
    [accessToken, showWarning]
  );

  // ✅ CONSOLIDADO: fetchTraspasoStats - USA getTraspasoStats() unificado
  const fetchTraspasoStats = useCallback(
    async (filters = {}) => {
      if (!accessToken) {
        console.warn("No access token available for fetchTraspasoStats");
        return;
      }

      try {
        console.log("Fetching traspaso stats with filters:", filters);

        // ✅ CAMBIO: Usar getTraspasoStats() consolidado (eliminar getTransferStats)
        const result = await loadsApi.getTraspasoStats(accessToken, filters);

        if (result?.success) {
          const statsData = result.data?.stats || result.data || {};
          setTraspasoStats(statsData);
          console.log("Traspaso stats fetched successfully:", statsData);
        } else {
          console.warn("Error al obtener estadísticas:", result?.message);
          // NO mostrar error, solo advertencia
        }
      } catch (err) {
        console.error("Error en fetchTraspasoStats:", err);
        // NO mostrar error en UI para stats
      }
    },
    [accessToken]
  );

  // ✅ CONSOLIDADO: fetchDeliveryPersonsFilter - USA getDeliveryPersonsFilter() unificado
  const fetchDeliveryPersonsFilter = useCallback(async () => {
    if (!accessToken) {
      console.warn("No access token available for fetchDeliveryPersonsFilter");
      return;
    }

    try {
      console.log("Fetching delivery persons...");

      // ✅ CAMBIO: Usar getDeliveryPersonsFilter() consolidado
      const result = await loadsApi.getDeliveryPersonsFilter(accessToken);

      if (result?.success) {
        const deliveryPersonsData = result.data || [];
        // Transformar formato si es necesario
        const formattedData = deliveryPersonsData.map((person) => ({
          code: person.code || person.Codigo,
          name: person.name || person.Nombre || person.Description,
        }));

        setDeliveryPersonsFilter(formattedData);
        console.log(
          "Delivery persons fetched successfully:",
          formattedData.length
        );
      } else {
        console.warn("Error al obtener repartidores:", result?.message);
      }
    } catch (err) {
      console.error("Error en fetchDeliveryPersonsFilter:", err);
    }
  }, [accessToken]);

  // ✅ CONSOLIDADO: fetchTraspasoDetails - USA getTraspasoDetails() unificado
  const fetchTraspasoDetails = useCallback(
    async (traspasoId) => {
      if (!accessToken) {
        showError("No hay token de acceso disponible");
        return null;
      }

      try {
        setLoading(true);
        setError(null);

        // ✅ CAMBIO: Usar getTraspasoDetails() consolidado
        const result = await loadsApi.getTraspasoDetails(
          accessToken,
          traspasoId
        );

        if (result?.success) {
          const traspasoData = result.data;
          setSelectedTraspaso(traspasoData);
          return traspasoData;
        } else {
          // ✅ POR AHORA, BUSCAR EN EL ARRAY LOCAL COMO FALLBACK
          const traspaso = traspasos.find((t) => t.id === traspasoId);

          if (traspaso) {
            setSelectedTraspaso(traspaso);
            return traspaso;
          } else {
            throw new Error("Traspaso no encontrado");
          }
        }
      } catch (err) {
        const errorMessage =
          err.message || "Error al cargar detalles del traspaso";
        setError(err);
        console.error("Error en fetchTraspasoDetails:", err);
        showError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [accessToken, traspasos, showError]
  );

  /**
   * Limpia el traspaso seleccionado
   */
  const clearSelectedTraspaso = useCallback(() => {
    setSelectedTraspaso(null);
  }, []);

  // ✅ CONSOLIDADO: fetchWarehouses - USA getWarehouses() unificado
  const fetchWarehouses = useCallback(async () => {
    if (!accessToken) {
      console.warn("No access token available for fetchWarehouses");
      return;
    }

    try {
      console.log("Fetching warehouses...");
      // ✅ CAMBIO: Usar getWarehouses() consolidado
      const result = await loadsApi.getWarehouses(accessToken);

      if (result?.success) {
        const warehousesData = result.data?.warehouses || result.data || [];
        setWarehouses(warehousesData);
        console.log("Warehouses fetched successfully:", warehousesData.length);
      } else {
        console.warn("Error al obtener bodegas:", result?.message);
      }
    } catch (err) {
      console.error("Error fetching warehouses:", err);
    }
  }, [accessToken]);

  // MANTENER TUS FUNCIONES DE EXECUTE (ya usan métodos consolidados)...
  const executeTransfer = useCallback(
    async (loadId) => {
      if (!accessToken) {
        showError("No hay token de acceso disponible");
        return;
      }

      try {
        console.log("Executing transfer for loadId:", loadId);
        const result = await loadsApi.executeTransfer(accessToken, loadId);

        if (result?.success) {
          showSuccess(
            `Traspaso ejecutado exitosamente para Load ID: ${loadId}`
          );
          return result;
        } else {
          throw new Error(result?.message || "Error al ejecutar traspaso");
        }
      } catch (err) {
        console.error("Error executing transfer:", err);
        showError(`Error al ejecutar traspaso: ${err.message}`);
        throw err;
      }
    },
    [accessToken, showSuccess, showError]
  );

  const executeBulkTransfers = useCallback(
    async (loadIds) => {
      if (!accessToken) {
        showError("No hay token de acceso disponible");
        return;
      }

      if (!Array.isArray(loadIds) || loadIds.length === 0) {
        showWarning("No hay traspasos seleccionados para ejecutar");
        return;
      }

      try {
        console.log("Executing bulk transfers for loadIds:", loadIds);
        const result = await loadsApi.executeBulkTransfers(accessToken, {
          loadIds,
        });

        if (result?.success) {
          const { executed = 0, failed = 0 } = result.data || {};

          if (executed > 0) {
            showSuccess(
              `Traspasos ejecutados: ${executed} exitosos${
                failed > 0 ? `, ${failed} fallidos` : ""
              }`
            );
          } else {
            showWarning("No se pudieron ejecutar los traspasos seleccionados");
          }

          setSelectedTransfers([]);
          return result;
        } else {
          throw new Error(result?.message || "Error en ejecución masiva");
        }
      } catch (err) {
        console.error("Error in bulk execution:", err);
        showError(`Error en ejecución masiva: ${err.message}`);
        throw err;
      }
    },
    [accessToken, showSuccess, showError, showWarning]
  );

  // MANTENER TUS FUNCIONES DE SELECCIÓN...
  const handleSelectTransfer = useCallback((loadId, isSelected) => {
    setSelectedTransfers((prev) => {
      if (isSelected) {
        return [...prev, loadId];
      } else {
        return prev.filter((id) => id !== loadId);
      }
    });
  }, []);

  const handleSelectAll = useCallback(
    (isSelected) => {
      if (isSelected) {
        const allIds = transfers.map((t) => t.loadId).filter(Boolean);
        setSelectedTransfers(allIds);
      } else {
        setSelectedTransfers([]);
      }
    },
    [transfers]
  );

  const clearSelections = useCallback(() => {
    setSelectedTransfers([]);
  }, []);

  const refreshData = useCallback(
    async (filters = {}) => {
      await Promise.all([fetchTransfers(filters), fetchStats(filters)]);
    },
    [fetchTransfers, fetchStats]
  );

  return {
    // Estados ORIGINALES
    transfers,
    totalRecords,
    loading,
    error,
    stats,
    warehouses,
    selectedTransfers,

    // Funciones principales ORIGINALES (ahora usando API consolidada)
    fetchTransfers,
    fetchStats,
    fetchWarehouses,
    executeTransfer,
    executeBulkTransfers,
    refreshData,

    // Funciones de selección ORIGINALES
    handleSelectTransfer,
    handleSelectAll,
    clearSelections,
    setSelectedTransfers,

    // ✅ NUEVOS ESTADOS PARA TRASPASOS
    traspasos,
    traspasoStats,
    deliveryPersonsFilter,
    selectedTraspaso,
    traspasosPagination,

    // ✅ NUEVAS FUNCIONES PARA TRASPASOS (usando API consolidada)
    fetchTraspasos,
    fetchTraspasoStats,
    fetchDeliveryPersonsFilter,
    fetchTraspasoDetails,
    clearSelectedTraspaso,
  };
};
