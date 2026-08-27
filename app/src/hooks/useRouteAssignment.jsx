import { useState, useEffect, useCallback } from "react";
import { RoutesApi } from "../api/index";
import Swal from "sweetalert2";

const routesApi = new RoutesApi();

export function useRouteAssignment(accessToken) {
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [erpRoutes, setErpRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState([]);

  const defaultFilters = {
    seller: "",
    routeStatus: "all", // all | unassigned | assigned
    routeCode: "",
    erpRouteCode: "", // ruta ACTUAL en el ERP — solo filtro/referencia, nunca se guarda ni se envía a server2
    search: "",
  };

  // `filters` = lo que el usuario está tocando en el formulario ahora mismo.
  // `appliedFilters` = lo último que se aplicó de verdad (botón "Buscar").
  // loadClients depende de appliedFilters, no de filters, para que la lista
  // de clientes no se recargue en cada tecla/cambio — solo al confirmar.
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  // No autocarga al entrar: la lista de clientes puede ser miles de filas
  // (10k+ clientes activos) — se espera a que el usuario apriete "Buscar"
  // al menos una vez.
  const [hasSearched, setHasSearched] = useState(false);

  const loadSellers = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await routesApi.getSellersFilter(accessToken);
      setSellers(data);
    } catch (error) {
      console.error("Error cargando vendedores:", error);
    }
  }, [accessToken]);

  const loadErpRoutes = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await routesApi.getErpRoutesFilter(accessToken, filters.seller);
      setErpRoutes(data);
      // Si la ruta ERP elegida ya no está entre las del vendedor seleccionado
      // (o se cambió/quitó el vendedor), limpiarla para no dejar un filtro
      // fantasma que no coincide con lo que se ve en el dropdown.
      setFilters((prev) =>
        prev.erpRouteCode && !data.some((r) => r.code === prev.erpRouteCode)
          ? { ...prev, erpRouteCode: "" }
          : prev
      );
    } catch (error) {
      console.error("Error cargando rutas del ERP:", error);
    }
  }, [accessToken, filters.seller]);

  const loadClients = useCallback(async () => {
    if (!accessToken || !hasSearched) return;
    setLoading(true);
    try {
      const data = await routesApi.getClients(accessToken, appliedFilters);
      setClients(data);
      // Limpiar selección de clientes que ya no están en el listado filtrado
      setSelectedCodes((prev) => prev.filter((code) => data.some((c) => c.code_account === code)));
    } catch (error) {
      console.error("Error cargando clientes:", error);
      Swal.fire("Error", "No se pudieron cargar los clientes", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, appliedFilters, hasSearched]);

  const applyFilters = () => {
    setHasSearched(true);
    setAppliedFilters(filters);
  };

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    loadErpRoutes();
  }, [loadErpRoutes]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const toggleSelect = (code) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleSelectAll = () => {
    setSelectedCodes((prev) =>
      prev.length === clients.length ? [] : clients.map((c) => c.code_account)
    );
  };

  const clearSelection = () => setSelectedCodes([]);

  const assignRoute = async (assignmentData) => {
    const resp = await routesApi.assignRoute(accessToken, {
      clientCodes: selectedCodes,
      ...assignmentData,
    });
    clearSelection();
    await loadClients();
    return resp;
  };

  const removeFromRoute = async () => {
    const resp = await routesApi.removeFromRoute(accessToken, selectedCodes);
    clearSelection();
    await loadClients();
    return resp;
  };

  const assignSellerRoute = async (assignmentData) => {
    const resp = await routesApi.assignSellerRoute(accessToken, {
      clientCodes: selectedCodes,
      ...assignmentData,
    });
    clearSelection();
    await loadClients();
    return resp;
  };

  const removeFromSellerRoute = async () => {
    const resp = await routesApi.removeFromSellerRoute(accessToken, selectedCodes);
    clearSelection();
    await loadClients();
    return resp;
  };

  return {
    clients,
    sellers,
    erpRoutes,
    loading,
    hasSearched,
    filters,
    setFilters,
    applyFilters,
    selectedCodes,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    actions: {
      loadClients,
      assignRoute,
      removeFromRoute,
      assignSellerRoute,
      removeFromSellerRoute,
    },
  };
}
