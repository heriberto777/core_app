import { useState, useEffect, useCallback } from "react";
import { TrucksApi } from "../api/index";
import Swal from "sweetalert2";

const trucksApi = new TrucksApi();

export function useTrucks(accessToken) {
  const [trucks, setTrucks] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadTrucks = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await trucksApi.getTrucks(accessToken, {
        active: statusFilter,
        search: searchTerm,
      });
      setTrucks(data);
    } catch (error) {
      console.error("Error cargando camiones:", error);
      Swal.fire("Error", "No se pudieron cargar los camiones", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, searchTerm, statusFilter]);

  const loadRepartidores = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await trucksApi.getRepartidoresFilter(accessToken);
      setRepartidores(data);
    } catch (error) {
      console.error("Error cargando repartidores:", error);
    }
  }, [accessToken]);

  useEffect(() => {
    loadTrucks();
  }, [loadTrucks]);

  useEffect(() => {
    loadRepartidores();
  }, [loadRepartidores]);

  const saveTruck = async (code, data) => {
    setLoading(true);
    try {
      const resp = code
        ? await trucksApi.updateTruck(accessToken, code, data)
        : await trucksApi.createTruck(accessToken, data);
      await loadTrucks();
      return resp;
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (code, currentActive) => {
    await trucksApi.toggleTruckActive(accessToken, code, !currentActive);
    await loadTrucks();
  };

  return {
    trucks,
    repartidores,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    actions: {
      loadTrucks,
      saveTruck,
      toggleActive,
    },
  };
}
