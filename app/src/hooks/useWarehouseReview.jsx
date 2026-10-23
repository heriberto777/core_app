import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadsApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const loadsApi = new LoadsApi();

/**
 * Lista de cargas pendientes de Revisión de Almacén.
 */
export function useWarehouseReview(accessToken) {
    const fetchPendingCallback = useCallback(async () => {
        if (!accessToken) return [];
        return await loadsApi.getPendingReview(accessToken);
    }, [accessToken]);

    const { data, loading, refreshing, error, fetchData, handleRefresh } = useFetchData(
        fetchPendingCallback,
        [accessToken],
        { autoFetch: false, initialData: [] }
    );

    const loads = useMemo(() => (Array.isArray(data) ? data : data?.data || []), [data]);

    return {
        loads,
        loading,
        refreshing,
        error,
        actions: {
            fetchLoads: fetchData,
            refresh: handleRefresh,
        },
    };
}

/**
 * Conciliación por producto de una carga puntual: ajustes y autorización.
 */
export function useWarehouseReviewDetail(accessToken, loadId) {
    const [isSaving, setIsSaving] = useState(false);
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [warehouses, setWarehouses] = useState([]);
    const [bodegaOrigen, setBodegaOrigen] = useState("");

    const fetchDetailCallback = useCallback(async () => {
        if (!accessToken || !loadId) return null;
        return await loadsApi.getLoadReviewDetail(accessToken, loadId);
    }, [accessToken, loadId]);

    const { data, loading, error, fetchData } = useFetchData(
        fetchDetailCallback,
        [accessToken, loadId],
        { autoFetch: true, initialData: null }
    );

    // Bodega de origen: se precarga con la sugerencia del backend (la más
    // frecuente entre las líneas, ver getLoadReviewDetail), pero el operador
    // la puede cambiar antes de autorizar -- no confiamos ciegamente en la
    // inferencia automática.
    useEffect(() => {
        if (data?.bodegaOrigenSugerida && !bodegaOrigen) {
            setBodegaOrigen(data.bodegaOrigenSugerida);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.bodegaOrigenSugerida]);

    useEffect(() => {
        if (!accessToken) return;
        loadsApi.getWarehouses(accessToken).then((res) => {
            const list = Array.isArray(res) ? res : res?.data || [];
            setWarehouses(list);
        });
    }, [accessToken]);

    const saveAdjustment = async (adjustment) => {
        setIsSaving(true);
        try {
            await loadsApi.saveLineAdjustment(accessToken, loadId, adjustment);
            await fetchData();
        } finally {
            setIsSaving(false);
        }
    };

    const authorize = async () => {
        setIsAuthorizing(true);
        try {
            return await loadsApi.authorizeDispatch(accessToken, loadId, bodegaOrigen);
        } finally {
            setIsAuthorizing(false);
        }
    };

    return {
        productos: data?.productos || [],
        loading,
        error,
        isSaving,
        isAuthorizing,
        warehouses,
        bodegasDetectadas: data?.bodegasDetectadas || [],
        bodegaOrigen,
        actions: {
            refresh: fetchData,
            saveAdjustment,
            authorize,
            setBodegaOrigen,
        },
    };
}
