import { useState, useCallback, useMemo } from "react";
import { TransferSummaryApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const summaryApi = new TransferSummaryApi();
const FETCH_INTERVAL = 10000; // Resumen técnico requiere menos polling

export function useLoadsResumen(accessToken, initialLoadId = "") {
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState({
        loadId: initialLoadId,
        route: "",
        dateFrom: "",
        dateTo: "",
        status: "",
        limit: 10
    });

    const queryParams = useMemo(() => ({
        ...filters,
        page: currentPage,
    }), [filters, currentPage]);

    const fetchSummariesCallback = useCallback(async () => {
        const result = await summaryApi.getSummaries(accessToken, queryParams);
        if (result) {
            if (result.pagination?.pages && result.pagination.pages !== totalPages) {
                setTotalPages(result.pagination.pages);
            }
            return result;
        }
        return [];
    }, [accessToken, queryParams, totalPages]);

    const {
        data: summaries,
        loading,
        refreshing,
        error,
        refetch,
    } = useFetchData(fetchSummariesCallback, [accessToken, queryParams], {
        autoRefresh: true,
        refreshInterval: FETCH_INTERVAL,
        enableCache: true,
        cacheTime: 60000,
        initialData: [],
    });

    const updateFilters = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilters({
            loadId: "",
            route: "",
            dateFrom: "",
            dateTo: "",
            status: "",
            limit: 10
        });
        setCurrentPage(1);
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const getSummaryDetails = async (id) => {
        const result = await summaryApi.getSummaryById(accessToken, id);
        return result?.data;
    };

    const checkInventoryForReturn = async (id) => {
        const result = await summaryApi.checkInventoryForReturns(accessToken, id);
        return result?.data;
    };

    const processReturn = async (data) => {
        const result = await summaryApi.processTransferReturn(accessToken, data);
        await refetch();
        return result;
    };

    return {
        summaries,
        loading,
        refreshing,
        error,
        pagination: {
            currentPage,
            totalPages,
            handlePageChange
        },
        filters,
        updateFilters,
        clearFilters,
        refetch,
        actions: {
            getSummaryDetails,
            checkInventoryForReturn,
            processReturn
        }
    };
}
