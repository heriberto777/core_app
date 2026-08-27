import { useState, useEffect, useCallback } from "react";
import { RoutesApi } from "../api/index";
import Swal from "sweetalert2";

const routesApi = new RoutesApi();

export function useRoutes(accessToken) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadRoutes = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await routesApi.getRoutes(accessToken, {
        active: statusFilter,
        search: searchTerm,
      });
      setRoutes(data);
    } catch (error) {
      console.error("Error cargando rutas:", error);
      Swal.fire("Error", "No se pudieron cargar las rutas", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, searchTerm, statusFilter]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const saveRoute = async (codeRoute, data) => {
    setLoading(true);
    try {
      const resp = codeRoute
        ? await routesApi.updateRoute(accessToken, codeRoute, data)
        : await routesApi.createRoute(accessToken, data);
      await loadRoutes();
      return resp;
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (codeRoute, currentActive) => {
    await routesApi.toggleRouteActive(accessToken, codeRoute, !currentActive);
    await loadRoutes();
  };

  return {
    routes,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    actions: {
      loadRoutes,
      saveRoute,
      toggleActive,
    },
  };
}
