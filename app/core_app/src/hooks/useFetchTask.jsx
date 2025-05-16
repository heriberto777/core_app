// useFetchData.js - Versión mejorada sin refresh completo de la página
import { useState, useEffect, useRef } from "react";

/**
 * Hook personalizado para realizar peticiones de datos con soporte para auto-refresh
 * SIN recargar toda la página
 */
export function useFetchData(
  fetchFunction,
  dependencies = [],
  autoRefresh = false,
  refreshInterval = 5000
) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(true);

  // Función para realizar la petición
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

  // Función para refrescar datos manualmente
  const refetch = async () => {
    try {
      // Limpiar cualquier timer existente
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Ejecutar la consulta pero sin cambiar el estado de loading a true
      // para evitar parpadeos durante refrescos manuales
      const result = await fetchFunction();

      // Solo actualizar estado si el componente sigue montado
      if (isMounted.current) {
        setData(result);
        setError(null);
      }

      // Reiniciar el timer si el auto-refresh está activado
      if (autoRefresh && isMounted.current) {
        timerRef.current = setTimeout(refetch, refreshInterval);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error("Error en refetch:", error);
        setError(error.message || "Error al refrescar los datos");

        // Incluso en caso de error, reiniciar el timer
        if (autoRefresh) {
          timerRef.current = setTimeout(refetch, refreshInterval);
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

      // useFetchData.js (continuación)
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
        timerRef.current = setTimeout(refetch, refreshInterval);
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

  return { data, loading, error, setData, refetch };
}
