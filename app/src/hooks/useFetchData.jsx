import { useState, useCallback, useEffect } from "react";

/**
 * Hook universal para fetching de datos con manejo de estado
 * @param {Function} apiCall - Función que retorna una promesa
 * @param {Array} dependencies - Dependencias para el useEffect
 * @param {Object} options - Opciones (autoFetch, initialData, etc)
 */
export const useFetchData = (apiCall, dependencies = [], options = {}) => {
    const { autoFetch = true, initialData = null } = options;
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);
        try {
            const response = await apiCall();
            // Consideramos éxito si no hay success explicitamente en false 
            // (esto permite arrays desempaquetados y objetos de respuesta estándar)
            if (response && response.success !== false) {
                // Si la respuesta ya es la data (ej: un array), la usamos. 
                // Si tiene .data, usamos .data.
                setData(response.data !== undefined ? response.data : response);
            } else {
                setError(response?.msg || response?.message || "Error desconocido al cargar datos");
            }
        } catch (err) {
            setError(err.message || "Error de conexión con el servidor");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [apiCall]);

    useEffect(() => {
        if (autoFetch) {
            fetchData();
        }
    }, dependencies);

    return {
        data,
        loading,
        error,
        refreshing,
        handleRefresh: () => fetchData(true),
        setData,
        fetchData
    };
};
