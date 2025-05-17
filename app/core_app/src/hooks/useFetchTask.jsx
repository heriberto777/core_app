import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/**
 * Hook personalizado mejorado para realizar peticiones de datos con soporte para auto-refresh,
 * cancelación, caché y feedback visual
 *
 * @param {Function} fetchFunction - Función asíncrona que realiza la petición
 * @param {Array} dependencies - Dependencias que provocan refetch
 * @param {Object} options - Opciones del hook
 * @returns {Object} Estados y funciones para gestionar la petición
 */
export function useFetchData(fetchFunction, dependencies = [], options = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 5000,
    initialData = [],
    enableCache = false,
    cacheTime = 60000, // 1 minuto
  } = options;

  // Estados principales
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);

  // Estados de carga detallados
  const [loadingState, setLoadingState] = useState({
    initialLoad: true,
    refreshing: false,
    loadingMore: false,
    progress: 0,
    estimatedTime: null,
  });

  // Referencias para gestión interna
  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(true);
  const isAutoRefreshing = useRef(false);
  const lastFetchTime = useRef(0);
  const cacheKey = useRef("");
  const cacheData = useRef({});

  // Helper para actualizar estado de loading
  const updateLoadingState = useCallback((updates) => {
    if (isMounted.current) {
      setLoadingState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  // Hacer key de dependencias para efecto
  const depsKey = useMemo(() => {
    return JSON.stringify(dependencies);
  }, [dependencies]);

  // Función principal para cargar datos
  const fetchData = useCallback(
    async (options = {}) => {
      const { isManualRefresh = false, forceRefresh = false } = options;

      try {
        // Determinar si usamos caché
        const now = Date.now();
        const shouldUseCache =
          enableCache &&
          !forceRefresh &&
          cacheData.current[cacheKey.current] &&
          now - lastFetchTime.current < cacheTime;

        // Si podemos usar caché y no es refresco manual, devolvemos caché
        if (shouldUseCache && !isManualRefresh) {
          setData(cacheData.current[cacheKey.current]);

          // Revalidar en segundo plano si los datos son antiguos
          if (now - lastFetchTime.current > cacheTime / 2) {
            fetchDataFromSource({ silent: true });
          }

          return;
        }

        // Si no usamos caché, traemos datos de la fuente
        fetchDataFromSource({ isManualRefresh });
      } catch (error) {
        console.error("Error en fetchData:", error);
        if (isMounted.current) {
          setError(error.message || "Error al obtener los datos");
          updateLoadingState({
            initialLoad: false,
            refreshing: false,
            progress: 0,
          });
        }
      }
    },
    [enableCache, cacheTime, fetchFunction]
  );

  // Función que hace la petición real a la fuente de datos
  const fetchDataFromSource = useCallback(
    async (options = {}) => {
      const { isManualRefresh = false, silent = false } = options;

      try {
        // Cancelar petición previa si existe
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Crear nuevo controlador
        abortControllerRef.current = new AbortController();

        // Actualizar estado solo si no es petición silenciosa
        if (!silent) {
          if (isFirstRender.current) {
            updateLoadingState({ initialLoad: true });
          } else if (isManualRefresh) {
            updateLoadingState({
              refreshing: true,
              progress: 10, // Iniciar progreso
            });

            // Simulación de progreso (para dar feedback)
            const progressInterval = setInterval(() => {
              updateLoadingState((prev) => ({
                ...prev,
                progress: Math.min(prev.progress + 5, 90),
              }));
            }, 300);

            // Limpiar intervalo después de tiempo máximo
            setTimeout(() => {
              clearInterval(progressInterval);
            }, 10000);
          }
        }

        isAutoRefreshing.current = !isManualRefresh;

        // Tiempo de inicio para mediciones
        const startTime = Date.now();

        // Ejecutar la petición
        const result = await fetchFunction({
          signal: abortControllerRef.current.signal,
        });

        // Actualizar caché si corresponde
        if (enableCache) {
          cacheData.current[cacheKey.current] = result;
          lastFetchTime.current = Date.now();
        }

        // Actualizar datos solo si componente sigue montado
        if (isMounted.current) {
          setData(result);
          setError(null);

          // Actualizar estado de carga
          if (!silent) {
            updateLoadingState({
              initialLoad: false,
              refreshing: false,
              progress: 100, // Completar progreso
            });

            // Resetear progreso después de 500ms
            setTimeout(() => {
              if (isMounted.current) {
                updateLoadingState({ progress: 0 });
              }
            }, 500);
          }
        }

        // Configurar próximo auto-refresco si aplica
        if (autoRefresh && isMounted.current) {
          timerRef.current = setTimeout(() => {
            fetchData({ isManualRefresh: false });
          }, refreshInterval);
        }
      } catch (error) {
        // Ignorar errores de cancelación
        if (error.name === "AbortError") return;

        if (isMounted.current && !silent) {
          console.error("Error en fetchDataFromSource:", error);
          setError(error.message || "Error al obtener los datos");
          updateLoadingState({
            initialLoad: false,
            refreshing: false,
            progress: 0,
          });
        }
      }
    },
    [fetchFunction, updateLoadingState, enableCache]
  );

  // Función de refresco manual expuesta
  const refetch = useCallback(
    (options = {}) => {
      const { forceRefresh = true } = options;
      return fetchData({ isManualRefresh: true, forceRefresh });
    },
    [fetchData]
  );

  // Efecto para inicialización y limpieza
  useEffect(() => {
    isMounted.current = true;
    isFirstRender.current = true;

    // Generar clave de caché basada en función y dependencias
    cacheKey.current = `${fetchFunction.name || "anonymous"}-${depsKey}`;

    // Hacer fetch inicial
    fetchData();

    // Marcar que ya no es primer render
    isFirstRender.current = false;

    // Limpieza al desmontar
    return () => {
      isMounted.current = false;

      // Cancelar peticiones pendientes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Cancelar timers pendientes
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [depsKey, autoRefresh, refreshInterval, fetchFunction, fetchData]);

  // Simplificar estado loading para retrocompatibilidad
  const loading = loadingState.initialLoad;
  const refreshing = loadingState.refreshing;

  // Devolver todos los estados y funciones útiles
  return {
    data,
    loading,
    refreshing,
    loadingState, // Estado detallado para UI avanzada
    error,
    setData, // Por compatibilidad, aunque no es recomendable usar directamente
    refetch,
    isFirstLoad: isFirstRender.current,
    isAutoRefreshing: isAutoRefreshing.current,
  };
}
