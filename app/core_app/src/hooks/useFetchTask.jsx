// useFetchData.js - Versión mejorada con indicador de refrescando
import { useState, useEffect, useRef } from "react";

/**
 * Hook personalizado para realizar peticiones de datos con soporte para auto-refresh y estado de refrescando
 */
export function useFetchData(
  fetchFunction,
  dependencies = [],
  autoRefresh = false,
  refreshInterval = 5000
) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // Nuevo estado para indicar refrescos manuales
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(true);
  const isAutoRefreshing = useRef(false); // Para saber si es un auto-refresh o manual

  // Función para realizar la petición inicial
  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await fetchFunction();
      // Solo actualizar estado si el componente sigue montado
      if (isMounted.current) {
        setData(result);
        setError(null);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error("Error en useFetchData:", error);
        setError(error.message || "Error al obtener los datos");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Función para refrescar datos (puede ser llamada manualmente o por auto-refresh)
  const refetch = async (isManualRefresh = true) => {
    try {
      // Limpiar cualquier timer existente
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Establecer estado refrescando solo si es un refresh manual
      if (isManualRefresh && isMounted.current) {
        setRefreshing(true);
      }

      isAutoRefreshing.current = !isManualRefresh;

      // Ejecutar la consulta
      const result = await fetchFunction();

      // Solo actualizar estado si el componente sigue montado
      if (isMounted.current) {
        setData(result);
        setError(null);
        // Desactivar estado refrescando si fue un refresh manual
        if (isManualRefresh) {
          setRefreshing(false);
        }
      }

      // Reiniciar el timer si el auto-refresh está activado
      if (autoRefresh && isMounted.current) {
        timerRef.current = setTimeout(() => refetch(false), refreshInterval);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error("Error en refetch:", error);
        setError(error.message || "Error al refrescar los datos");

        // Desactivar estado refrescando si fue un refresh manual
        if (isManualRefresh) {
          setRefreshing(false);
        }

        // Incluso en caso de error, reiniciar el timer
        if (autoRefresh) {
          timerRef.current = setTimeout(() => refetch(false), refreshInterval);
        }
      }
    }
  };

  useEffect(() => {
    // Marcar que el componente está montado
    isMounted.current = true;

    // Función de inicialización
    const initialize = async () => {
      // Solo mostrar loading en el primer render
      if (isFirstRender.current) {
        setLoading(true);
        isFirstRender.current = false;
      }

      try {
        const result = await fetchFunction();

        // Solo actualizar estado si el componente sigue montado
        if (isMounted.current) {
          setData(result);
          setError(null);
        }
      } catch (error) {
        if (isMounted.current) {
          console.error("Error en initialize:", error);
          setError(error.message || "Error al obtener los datos");
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }

      // Configurar el auto-refresh solo si está habilitado
      if (autoRefresh && isMounted.current) {
        timerRef.current = setTimeout(() => refetch(false), refreshInterval);
      }
    };

    // Iniciar la petición
    initialize();

    // Función de limpieza al desmontar el componente
    return () => {
      isMounted.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  // Devolver el nuevo estado refreshing junto con los demás
  return { data, loading, refreshing, error, setData, refetch };
}
