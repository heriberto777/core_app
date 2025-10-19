// src/hooks/useFetchTransfers.jsx - SIGUIENDO TU PATRÓN DE useFetchTask
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import LoadsApi from "../api/LoadsApi";

export function useFetchTransfers(accessToken, dependencies = [], options = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 30000,
    initialData = [],
    enableCache = false,
    cacheTime = 60000,
    manual = false,
    maxRetries = 3,
    retryDelay = 5000,
  } = options;

  // 🔄 Seguir tu mismo patrón de estados
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState({
    initialLoad: !manual,
    refreshing: false,
    loadingMore: false,
    progress: 0,
    estimatedTime: null,
  });

  // 🔄 Mismas referencias que usas en useFetchTask
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
  const isServerDown = useRef(false);

  // Instancia de la API
  const loadsApi = useMemo(() => new LoadsApi(), []);

  const updateLoadingState = useCallback((updates) => {
    if (isMounted.current) {
      setLoadingState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  // 🔄 Memoizar dependencias siguiendo tu patrón
  const depsKey = useMemo(() => {
    if (dependencies.length === 0) return "no-deps";

    const newDepsKey = JSON.stringify(dependencies);

    if (lastDepsRef.current !== newDepsKey) {
      console.log("🔄 Dependencias de traspasos cambiaron:", {
        anterior: lastDepsRef.current,
        nueva: newDepsKey,
      });
      lastDepsRef.current = newDepsKey;
    }

    return newDepsKey;
  }, [dependencies]);

  // 🔄 Función principal de fetch siguiendo tu patrón
  const fetchData = useCallback(
    async (isRetry = false, isManualRefresh = false) => {
      if (!accessToken) {
        console.warn("🚫 No hay accessToken para fetch de traspasos");
        return;
      }

      // Evitar solicitudes duplicadas
      if (loadingState.initialLoad || loadingState.refreshing) {
        console.log("⏭️ Solicitud en curso, omitiendo fetch de traspasos");
        return;
      }

      try {
        // Cancelar solicitud anterior si existe
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        // Actualizar estado de carga
        updateLoadingState({
          initialLoad: isFirstRender.current,
          refreshing: !isFirstRender.current || isManualRefresh,
          progress: 0,
        });

        const startTime = Date.now();
        lastFetchTime.current = startTime;

        console.log("🚀 Iniciando fetch de traspasos...");

        // 🔄 Aquí usarías la función que necesites de la API
        // Este es un ejemplo genérico, debes adaptarlo según el caso específico
        const result = await loadsApi.getTransfers(accessToken);

        // Verificar si el componente sigue montado
        if (!isMounted.current) {
          console.log("⚠️ Componente desmontado, cancelando actualización");
          return;
        }

        // Verificar si es la solicitud más reciente
        if (lastFetchTime.current !== startTime) {
          console.log("⚠️ Solicitud obsoleta, ignorando resultado");
          return;
        }

        console.log("✅ Traspasos obtenidos exitosamente:", result.data?.length || 0);

        setData(result.data || []);
        setError(null);
        retryCount.current = 0;
        isServerDown.current = false;

        updateLoadingState({
          initialLoad: false,
          refreshing: false,
          progress: 100,
        });

        isFirstRender.current = false;

      } catch (error) {
        if (!isMounted.current) return;

        console.error("❌ Error en fetch de traspasos:", error);

        // Manejar errores de red/servidor
        if (error.name === 'AbortError') {
          console.log("⏹️ Solicitud de traspasos cancelada");
          return;
        }

        setError(error);
        updateLoadingState({
          initialLoad: false,
          refreshing: false,
          progress: 0,
        });

        // Lógica de reintentos
        if (retryCount.current < maxRetries && !isManualRefresh) {
          retryCount.current += 1;
          console.log(`🔄 Reintento ${retryCount.current}/${maxRetries} en ${retryDelay}ms`);

          retryTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              fetchData(true);
            }
          }, retryDelay);
        } else {
          isServerDown.current = true;
        }
      }
    },
    [accessToken, loadsApi, loadingState, updateLoadingState, maxRetries, retryDelay]
  );

  // 🔄 useEffect para auto-refresh siguiendo tu patrón
  useEffect(() => {
    if (!autoRefresh || !isMounted.current || isServerDown.current) return;

    const interval = setInterval(() => {
      if (!loadingState.initialLoad && !loadingState.refreshing) {
        isAutoRefreshing.current = true;
        fetchData(false, false);
      }
    }, refreshInterval);

    timerRef.current = interval;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, loadingState, fetchData]);

  // 🔄 useEffect para fetch inicial
  useEffect(() => {
    if (!manual && accessToken) {
      fetchData();
    }

    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [depsKey, fetchData, manual, accessToken]);

  // 🔄 Función de refetch manual
  const refetch = useCallback(
    (force = false) => {
      if (force) {
        retryCount.current = 0;
        isServerDown.current = false;
      }
      fetchData(false, true);
    },
    [fetchData]
  );

  // 🔄 Propiedades computadas siguiendo tu patrón
  const loading = loadingState.initialLoad;
  const refreshing = loadingState.refreshing;

  return {
    data,
    loading,
    refreshing,
    loadingState,
    error,
    refetch,
    setData,

    // 🔄 Funciones específicas para traspasos
    fetchTransfers: fetchData,
    isServerDown: isServerDown.current,
    retryCount: retryCount.current,
  };
}