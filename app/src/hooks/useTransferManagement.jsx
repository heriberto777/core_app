// src/hooks/useTransferManagement.js

import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useNotification } from "./useNotification";
import { LoadsApi } from "../api/index";

const loadsApi = new LoadsApi();

export const useTransferManagement = () => {
  const { accessToken } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();


  // Estados principales
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

  // Fetch transfers - SOLO MANUAL, no auto-fetch
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
        const result = await loadsApi.getTransfers(accessToken, filters);

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

  // Fetch stats - SOLO MANUAL
  const fetchStats = useCallback(
    async (filters = {}) => {
      if (!accessToken) {
        console.warn("No access token available for fetchStats");
        return;
      }

      try {
        console.log("Fetching stats with filters:", filters);
        const result = await loadsApi.getTransferStats(accessToken, filters);

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

  // Fetch warehouses - SOLO MANUAL
  const fetchWarehouses = useCallback(async () => {
    if (!accessToken) {
      console.warn("No access token available for fetchWarehouses");
      return;
    }

    try {
      console.log("Fetching warehouses...");
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

  // Execute single transfer
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

  // Execute bulk transfers
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

          // Limpiar selección
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

  // Update transfer status
  const updateTransferStatus = useCallback(
    async (traspasoId, status, notes = "") => {
      if (!accessToken) {
        showError("No hay token de acceso disponible");
        return;
      }

      try {
        console.log("Updating transfer status:", { traspasoId, status, notes });
        const result = await loadsApi.updateTraspasoStatus(
          accessToken,
          traspasoId,
          { status, notes }
        );

        if (result?.success) {
          showSuccess("Estado del traspaso actualizado correctamente");
          return result;
        } else {
          throw new Error(result?.message || "Error al actualizar estado");
        }
      } catch (err) {
        console.error("Error updating transfer status:", err);
        showError(`Error al actualizar estado: ${err.message}`);
        throw err;
      }
    },
    [accessToken, showSuccess, showError]
  );

  // Retry failed transfer
  const retryTransfer = useCallback(
    async (traspasoId, updatedData = null) => {
      if (!accessToken) {
        showError("No hay token de acceso disponible");
        return;
      }

      try {
        console.log("Retrying transfer:", { traspasoId, updatedData });
        const result = await loadsApi.retryTraspaso(accessToken, traspasoId, {
          updatedData,
        });

        if (result?.success) {
          showSuccess("Traspaso reintentado exitosamente");
          return result;
        } else {
          throw new Error(result?.message || "Error al reintentar traspaso");
        }
      } catch (err) {
        console.error("Error retrying transfer:", err);
        showError(`Error al reintentar traspaso: ${err.message}`);
        throw err;
      }
    },
    [accessToken, showSuccess, showError]
  );

  // Manejo de selección
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

  // Clear selections
  const clearSelections = useCallback(() => {
    setSelectedTransfers([]);
  }, []);

  // Refresh all data
  const refreshData = useCallback(
    async (filters = {}) => {
      await Promise.all([fetchTransfers(filters), fetchStats(filters)]);
    },
    [fetchTransfers, fetchStats]
  );

  return {
    // Estados
    transfers,
    totalRecords,
    loading,
    error,
    stats,
    warehouses,
    selectedTransfers,

    // Funciones principales - TODAS MANUALES
    fetchTransfers,
    fetchStats,
    fetchWarehouses,
    executeTransfer,
    executeBulkTransfers,
    updateTransferStatus,
    retryTransfer,
    refreshData,

    // Funciones de selección
    handleSelectTransfer,
    handleSelectAll,
    clearSelections,
    setSelectedTransfers,
  };
};
