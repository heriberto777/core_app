import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export function useFetchData(fetchFunction, dependencies = [], options = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 5000,
    initialData = [],
    enableCache = false,
    cacheTime = 60000,
  } = options;

  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState({
    initialLoad: true,
    refreshing: false,
    loadingMore: false,
    progress: 0,
    estimatedTime: null,
  });

  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(true);
  const isAutoRefreshing = useRef(false);
  const lastFetchTime = useRef(0);
  const cacheKey = useRef("");
  const cacheData = useRef({});
  const lastDepsRef = useRef(null);

  const updateLoadingState = useCallback((updates) => {
    if (isMounted.current) {
      setLoadingState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  // Memoizar dependencias para evitar cambios innecesarios
  const depsKey = useMemo(() => {
    const newDepsKey = JSON.stringify(dependencies);

    // Solo actualizar si realmente cambió
    if (lastDepsRef.current !== newDepsKey) {
      console.log("Dependencias cambiaron:", newDepsKey);
      lastDepsRef.current = newDepsKey;
    }

    return newDepsKey;
  }, [dependencies]);

  const fetchDataFromSource = useCallback(
    async (options = {}) => {
      const { isManualRefresh = false, silent = false } = options;

      // Evitar múltiples llamadas simultáneas
      if (abortControllerRef.current && !isManualRefresh) {
        console.log("Petición en curso, saltando...");
        return;
      }

      try {
        console.log("Iniciando fetch:", { isManualRefresh, silent });

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        if (!silent) {
          if (isFirstRender.current) {
            updateLoadingState({ initialLoad: true });
          } else if (isManualRefresh) {
            updateLoadingState({ refreshing: true, progress: 10 });
          }
        }

        isAutoRefreshing.current = !isManualRefresh;

        const result = await fetchFunction({
          signal: abortControllerRef.current.signal,
        });

        if (enableCache) {
          cacheData.current[cacheKey.current] = result;
          lastFetchTime.current = Date.now();
        }

        if (isMounted.current) {
          setData(result);
          setError(null);

          if (!silent) {
            updateLoadingState({
              initialLoad: false,
              refreshing: false,
              progress: 100,
            });

            setTimeout(() => {
              if (isMounted.current) {
                updateLoadingState({ progress: 0 });
              }
            }, 500);
          }
        }

        // Limpiar referencia del controller
        abortControllerRef.current = null;

        // Auto-refresh solo si está habilitado y no es manual
        if (autoRefresh && isMounted.current && !isManualRefresh) {
          timerRef.current = setTimeout(() => {
            if (isMounted.current) {
              fetchDataFromSource({ isManualRefresh: false, silent: true });
            }
          }, refreshInterval);
        }

        return result;
      } catch (error) {
        if (error.name === "AbortError") {
          console.log("Petición cancelada");
          return;
        }

        if (isMounted.current && !silent) {
          console.error("Error en fetchDataFromSource:", error);
          setError(error.message || "Error al obtener los datos");
          updateLoadingState({
            initialLoad: false,
            refreshing: false,
            progress: 0,
          });
        }

        abortControllerRef.current = null;
        throw error;
      }
    },
    [
      fetchFunction,
      updateLoadingState,
      enableCache,
      autoRefresh,
      refreshInterval,
    ]
  );

  const fetchData = useCallback(
    async (options = {}) => {
      const { isManualRefresh = false, forceRefresh = false } = options;

      try {
        const now = Date.now();
        const shouldUseCache =
          enableCache &&
          !forceRefresh &&
          cacheData.current[cacheKey.current] &&
          now - lastFetchTime.current < cacheTime;

        if (shouldUseCache && !isManualRefresh) {
          setData(cacheData.current[cacheKey.current]);
          return;
        }

        return await fetchDataFromSource({ isManualRefresh });
      } catch (error) {
        console.error("Error en fetchData:", error);
      }
    },
    [enableCache, cacheTime, fetchDataFromSource]
  );

  const refetch = useCallback(
    (options = {}) => {
      console.log("Refetch manual disparado");
      return fetchData({ isManualRefresh: true, forceRefresh: true });
    },
    [fetchData]
  );

  // Efecto principal - solo se ejecuta cuando cambian las dependencias reales
  useEffect(() => {
    console.log("useEffect principal ejecutado - depsKey:", depsKey);

    isMounted.current = true;
    cacheKey.current = `${fetchFunction.name || "anonymous"}-${depsKey}`;

    // Solo hacer fetch si es la primera vez o las dependencias cambiaron
    fetchData();
    isFirstRender.current = false;

    return () => {
      console.log("Limpieza del hook");
      isMounted.current = false;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [depsKey]); // Solo depsKey, no fetchData

  const loading = loadingState.initialLoad;
  const refreshing = loadingState.refreshing;

  return {
    data,
    loading,
    refreshing,
    loadingState,
    error,
    setData,
    refetch,
    isFirstLoad: isFirstRender.current,
    isAutoRefreshing: isAutoRefreshing.current,
  };
}
