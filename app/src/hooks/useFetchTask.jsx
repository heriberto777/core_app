// app/src/hooks/useFetchData.js - VERSIÓN OPTIMIZADA
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export function useFetchData(fetchFunction, dependencies = [], options = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 30000, // Reducir frecuencia por defecto
    initialData = [],
    enableCache = false,
    cacheTime = 60000,
    manual = false, // NUEVO: Permite modo manual
    maxRetries = 3, // NUEVO: Límite de reintentos
    retryDelay = 5000, // NUEVO: Delay entre reintentos
  } = options;

  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState({
    initialLoad: !manual,
    refreshing: false,
    loadingMore: false,
    progress: 0,
    estimatedTime: null,
  });

  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const isFirstRender = useRef(true);
  const isMounted = useRef(true);
  const isAutoRefreshing = useRef(false);
  const lastFetchTime = useRef(0);
  const cacheKey = useRef("");
  const cacheData = useRef({});
  const lastDepsRef = useRef(null);
  const retryCount = useRef(0);
  const isServerDown = useRef(false); // NUEVO: Flag para servidor caído

  const updateLoadingState = useCallback((updates) => {
    if (isMounted.current) {
      setLoadingState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  // MEJORAR: Memoizar dependencias solo cuando realmente cambien
  const depsKey = useMemo(() => {
    if (dependencies.length === 0) return "no-deps";

    const newDepsKey = JSON.stringify(dependencies);

    // Solo loggear si realmente cambió
    if (lastDepsRef.current !== newDepsKey) {
      console.log("🔄 Dependencias cambiaron:", {
        anterior: lastDepsRef.current,
        nueva: newDepsKey,
      });
      lastDepsRef.current = newDepsKey;
    }

    return newDepsKey;
  }, [dependencies]);

  // NUEVO: Función para manejar errores de servidor
  const handleServerError = useCallback((error) => {
    const isConnectionError =
      error.name === "TypeError" ||
      error.message.includes("fetch") ||
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("<!DOCTYPE");

    if (isConnectionError) {
      console.error("🔥 Error de conexión detectado, pausando requests");
      isServerDown.current = true;
      retryCount.current = 0;

      // Reactivar después de 5 minutos
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      retryTimeoutRef.current = setTimeout(() => {
        console.log(
          "🔄 Reactivando requests después de pausa por error de servidor"
        );
        isServerDown.current = false;
        retryCount.current = 0;
      }, 300000); // 5 minutos

      return true;
    }

    return false;
  }, []);

  const fetchDataFromSource = useCallback(
    async (options = {}) => {
      const { isManualRefresh = false, silent = false } = options;

      // NUEVO: No hacer fetch si el servidor está caído y no es manual
      if (isServerDown.current && !isManualRefresh) {
        console.log(
          "⏸️ Servidor marcado como caído, saltando fetch automático"
        );
        return;
      }

      // NUEVO: Verificar límite de reintentos
      if (retryCount.current >= maxRetries && !isManualRefresh) {
        console.log(
          `⚠️ Límite de reintentos alcanzado (${maxRetries}), saltando fetch`
        );
        return;
      }

      // Evitar múltiples llamadas simultáneas
      if (abortControllerRef.current && !isManualRefresh) {
        console.log("🔄 Petición en curso, saltando...");
        return;
      }

      try {
        console.log("🚀 Iniciando fetch:", {
          isManualRefresh,
          silent,
          retryCount: retryCount.current,
          serverDown: isServerDown.current,
        });

        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        if (!silent) {
          if (isFirstRender.current && !manual) {
            updateLoadingState({ initialLoad: true });
          } else if (isManualRefresh) {
            updateLoadingState({ refreshing: true, progress: 10 });
          }
        }

        isAutoRefreshing.current = !isManualRefresh;

        const result = await fetchFunction({
          signal: abortControllerRef.current.signal,
        });

        // ÉXITO: Resetear contadores de error
        retryCount.current = 0;
        isServerDown.current = false;

        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }

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

        // CAMBIAR: Auto-refresh más controlado
        if (
          autoRefresh &&
          isMounted.current &&
          !isManualRefresh &&
          !isServerDown.current
        ) {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }

          timerRef.current = setTimeout(() => {
            if (isMounted.current && !isServerDown.current) {
              fetchDataFromSource({ isManualRefresh: false, silent: true });
            }
          }, refreshInterval);
        }

        return result;
      } catch (error) {
        if (error.name === "AbortError") {
          console.log("🚫 Petición cancelada");
          return;
        }

        console.error("❌ Error en fetchDataFromSource:", error);

        // NUEVO: Manejar errores de servidor
        const isServerError = handleServerError(error);

        if (!isServerError) {
          retryCount.current += 1;
        }

        if (isMounted.current && !silent) {
          setError(error.message || "Error al obtener los datos");
          updateLoadingState({
            initialLoad: false,
            refreshing: false,
            progress: 0,
          });
        }

        abortControllerRef.current = null;

        // NUEVO: Solo reintentar para errores no críticos
        if (
          !isServerError &&
          retryCount.current < maxRetries &&
          !isManualRefresh
        ) {
          console.log(
            `🔄 Reintentando en ${retryDelay}ms (intento ${retryCount.current}/${maxRetries})`
          );

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              fetchDataFromSource({ isManualRefresh: false, silent: true });
            }
          }, retryDelay);
        }

        throw error;
      }
    },
    [
      fetchFunction,
      updateLoadingState,
      enableCache,
      autoRefresh,
      refreshInterval,
      manual,
      maxRetries,
      retryDelay,
      handleServerError,
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
          console.log("📦 Usando datos de cache");
          setData(cacheData.current[cacheKey.current]);
          return;
        }

        return await fetchDataFromSource({ isManualRefresh });
      } catch (error) {
        console.error("❌ Error en fetchData:", error);
      }
    },
    [enableCache, cacheTime, fetchDataFromSource]
  );

  const refetch = useCallback(
    (options = {}) => {
      console.log("🔄 Refetch manual disparado");
      // NUEVO: Resetear estados de error en refetch manual
      retryCount.current = 0;
      isServerDown.current = false;

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      return fetchData({ isManualRefresh: true, forceRefresh: true });
    },
    [fetchData]
  );

  // CAMBIAR: Efecto principal más controlado
  useEffect(() => {
    console.log("🎯 useEffect principal ejecutado:", {
      depsKey,
      manual,
      isFirstRender: isFirstRender.current,
    });

    isMounted.current = true;
    cacheKey.current = `${fetchFunction.name || "anonymous"}-${depsKey}`;

    // CAMBIAR: Solo hacer fetch automático si no es manual
    if (!manual) {
      fetchData();
    }

    isFirstRender.current = false;

    return () => {
      console.log("🧹 Limpieza del hook");
      isMounted.current = false;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [depsKey, manual]); // Agregar manual a las dependencias

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
    retryCount: retryCount.current, // NUEVO: Exponer retry count
    isServerDown: isServerDown.current, // NUEVO: Exponer estado del servidor
  };
}
