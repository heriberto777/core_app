import { useState, useCallback, useMemo, useEffect } from "react";
import { useFetchData } from "./useFetchData";
import { MappingApi } from "../api/index";

const api = new MappingApi();

export function useDocumentsVisualization(accessToken) {
    const [activeView, setActiveView] = useState("mappingsList");
    const [activeMappingId, setActiveMappingId] = useState(null);
    const [activeMappingName, setActiveMappingName] = useState("");
    const [activeConfig, setActiveConfig] = useState(null);
    const [entityType, setEntityType] = useState("orders");
    const [viewMode, setViewMode] = useState("table");
    const [search, setSearch] = useState("");
    const [selectedDocuments, setSelectedDocuments] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Filters state
    const [filterValues, setFilterValues] = useState({
        dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
        dateTo: new Date().toISOString().split("T")[0],
        status: "all",
        warehouse: "all",
        showProcessed: false,
    });

    const filters = useMemo(() => ({
        dateFrom: filterValues.dateFrom,
        dateTo: filterValues.dateTo,
        status: filterValues.status,
        warehouse: filterValues.warehouse,
        showProcessed: filterValues.showProcessed,
    }), [filterValues]);

    // Data Fetching
    const fetchDocumentsCallback = useCallback(() => {
        if (!activeMappingId) return Promise.resolve([]);
        return api.getDocumentsByMapping(accessToken, activeMappingId, filters);
    }, [accessToken, activeMappingId, filters]);

    const {
        data: documents,
        loading: documentsLoading,
        refreshing: documentsRefreshing,
        error: documentsError,
        fetchData: fetchDocuments,
    } = useFetchData(
        fetchDocumentsCallback,
        [accessToken, activeMappingId, filters],
        !!activeMappingId,
        30000
    );

    // Configuration Loading
    const loadMappingConfig = useCallback(async (mappingId) => {
        try {
            const config = await api.getMappingById(accessToken, mappingId);
            setActiveConfig(config);
            setActiveMappingName(config.name || "Configuración sin nombre");
            setEntityType(config.entityType || "orders");
        } catch (error) {
            console.error("Error al cargar configuración:", error);
            throw error;
        }
    }, [accessToken]);

    useEffect(() => {
        if (activeMappingId) {
            loadMappingConfig(activeMappingId);
        }
    }, [activeMappingId, loadMappingConfig]);

    const [actionStates, setActionStates] = useState({});

    // Filtering Logic
    const filteredDocuments = useMemo(() => {
        if (!documents || !Array.isArray(documents)) return [];
        return documents.filter((doc) => {
            // 1. Filtro de búsqueda general
            if (search) {
                const searchLower = search.toLowerCase();
                const matchesSearch = Object.values(doc).some(
                    (val) => val && typeof val === "string" && val.toLowerCase().includes(searchLower)
                );
                if (!matchesSearch) return false;
            }

            // 2. Filtro por fecha desde
            if (filterValues.dateFrom) {
                const docDate = doc.FECHA || doc.FECHA_PED || doc.fec_ped || doc.fecha;
                if (docDate) {
                    const docDateObj = new Date(docDate);
                    const filterDateFrom = new Date(filterValues.dateFrom);
                    if (docDateObj < filterDateFrom) return false;
                }
            }

            // 3. Filtro por fecha hasta
            if (filterValues.dateTo) {
                const docDate = doc.FECHA || doc.FECHA_PED || doc.fec_ped || doc.fecha;
                if (docDate) {
                    const docDateObj = new Date(docDate);
                    const filterDateTo = new Date(filterValues.dateTo);
                    filterDateTo.setHours(23, 59, 59, 999); // Incluir todo el día
                    if (docDateObj > filterDateTo) return false;
                }
            }

            // 4. Filtro por estado
            if (filterValues.status && filterValues.status !== "all") {
                const docStatus = doc.ESTADO || doc.Estado || doc.status;
                if (docStatus && docStatus !== filterValues.status) return false;
            }

            return true;
        });
    }, [documents, search, filterValues]);

    // Mapping Navigation
    const handleSelectMapping = useCallback((mappingId) => {
        setActiveMappingId(mappingId);
        setActiveView("documents");
        setSelectedDocuments([]);
        setSelectAll(false);
    }, []);

    const handleReturnToList = useCallback(() => {
        setActiveView("mappingsList");
        setActiveMappingId(null);
    }, []);

    // Selection Management
    const handleSelectDocument = useCallback((docId) => {
        setSelectedDocuments(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selectAll || (selectedDocuments.length > 0 && selectedDocuments.length === filteredDocuments.length)) {
            setSelectedDocuments([]);
            setSelectAll(false);
        } else {
            if (filteredDocuments.length > 0) {
                let idField = Object.keys(filteredDocuments[0])[0];
                if (activeConfig?.tableConfigs && activeConfig.tableConfigs.length > 0) {
                    const mainTable = activeConfig.tableConfigs[0];
                    if (mainTable.primaryKey) {
                        if (filteredDocuments[0][mainTable.primaryKey] !== undefined) {
                            idField = mainTable.primaryKey;
                        } else {
                            const pkMap = mainTable.fieldMappings?.find(fm => fm.sourceField === mainTable.primaryKey);
                            if (pkMap && filteredDocuments[0][pkMap.targetField] !== undefined) {
                                idField = pkMap.targetField;
                            }
                        }
                    }
                }
                setSelectedDocuments(filteredDocuments.map(doc => doc[idField]));
                setSelectAll(true);
            }
        }
    }, [filteredDocuments, selectAll, selectedDocuments.length, activeConfig]);

    // Processing Logic
    const executeProcessing = async (overrideIds = null) => {
        const idsToProcess = overrideIds || selectedDocuments;
        if (!activeMappingId || idsToProcess.length === 0) return null;

        if (overrideIds && overrideIds.length === 1) {
            setActionStates(prev => ({ ...prev, [overrideIds[0]]: 'processing' }));
        } else {
            setIsProcessing(true);
        }

        try {
            const result = await api.processDocumentsByMapping(accessToken, activeMappingId, idsToProcess);
            await fetchDocuments();
            setSelectedDocuments([]);
            setSelectAll(false);
            return result;
        } catch (error) {
            console.error("Error processing documents:", error);
            throw error;
        } finally {
            if (overrideIds && overrideIds.length === 1) {
                setActionStates(prev => ({ ...prev, [overrideIds[0]]: null }));
            }
            // Solo quitamos el loading general si NO es asíncrono
            // Si es asíncrono, el modal de progreso mantendrá el estado hasta que onFinished lo cierre
            // setIsProcessing(false); // Movido a la lógica del modal o manejado por el componente
        }
    };

    const getDocumentDetails = useCallback(async (docId) => {
        if (!activeMappingId) return null;
        setActionStates(prev => ({ ...prev, [docId]: 'details' }));
        try {
            return await api.getDocumentDetailsByMapping(accessToken, activeMappingId, docId);
        } finally {
            setActionStates(prev => ({ ...prev, [docId]: null }));
        }
    }, [accessToken, activeMappingId]);

    const updateEntityData = useCallback(async (updateData) => {
        return await api.updateEntityData(accessToken, updateData);
    }, [accessToken]);
    return {
        activeView,
        setActiveView,
        activeMappingId,
        activeMappingName,
        activeConfig,
        entityType,
        viewMode,
        setViewMode,
        search,
        setSearch,
        filterValues,
        setFilterValues,
        documents,
        filteredDocuments,
        documentsLoading,
        documentsRefreshing,
        documentsError,
        selectedDocuments,
        selectAll,
        isProcessing,
        setIsProcessing,
        fetchDocuments,
        handleSelectMapping,
        handleReturnToList,
        handleSelectDocument,
        handleSelectAll,
        executeProcessing,
        getDocumentDetails,
        updateEntityData,
        setSelectedDocuments,
        actionStates
    };
}
