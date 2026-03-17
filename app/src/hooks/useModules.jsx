import { useState, useEffect, useCallback } from "react";
import { moduleApi } from "../api/index";
import Swal from "sweetalert2";

const cnnModuleApi = new moduleApi();

export function useModules(accessToken, reloadModuleConfig) {
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [availableActions, setAvailableActions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [pagination, setPagination] = useState({
        current: 1,
        pages: 1,
        total: 0,
        limit: 12,
    });

    const loadMetaData = useCallback(async () => {
        if (!accessToken) return;
        try {
            const [actions, cats] = await Promise.all([
                cnnModuleApi.getAvailableActions(accessToken),
                cnnModuleApi.getCategories(accessToken)
            ]);
            if (actions) setAvailableActions(actions);
            if (cats) setCategories(cats);
        } catch (error) {
            console.error("Error cargando meta-datos de módulos:", error);
        }
    }, [accessToken]);

    const loadModules = useCallback(async () => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const params = {
                page: pagination.current,
                limit: pagination.limit,
                category: filterCategory,
                active: filterStatus,
                search: searchTerm,
            };
            const response = await cnnModuleApi.getAllModules(accessToken, params);
            if (response) {
                setModules(response.data || response.modules || []);
                if (response.pagination) {
                    setPagination(prev => ({ ...prev, ...response.pagination }));
                }
            }
        } catch (error) {
            console.error("Error cargando módulos:", error);
            Swal.fire("Error", "No se pudieron cargar los módulos", "error");
        } finally {
            setLoading(false);
        }
    }, [accessToken, pagination.current, pagination.limit, filterCategory, filterStatus, searchTerm]);

    useEffect(() => {
        loadModules();
        loadMetaData();
    }, [loadModules, loadMetaData]);

    const saveModule = async (moduleId, moduleData) => {
        setLoading(true);
        try {
            const resp = moduleId
                ? await cnnModuleApi.updateModule(accessToken, moduleId, moduleData)
                : await cnnModuleApi.createModule(accessToken, moduleData);

            if (resp) {
                await loadModules();
                if (reloadModuleConfig) await reloadModuleConfig();
                return { success: true };
            }
        } catch (error) {
            console.error("Error guardando módulo:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const deleteModule = async (moduleId) => {
        try {
            const resp = await cnnModuleApi.deleteModule(accessToken, moduleId);
            if (resp) {
                await loadModules();
                if (reloadModuleConfig) await reloadModuleConfig();
                return { success: true };
            }
        } catch (error) {
            console.error("Error eliminando módulo:", error);
            throw error;
        }
    };

    const toggleModuleStatus = async (moduleId) => {
        try {
            const resp = await cnnModuleApi.toggleModuleStatus(accessToken, moduleId);
            if (resp) {
                await loadModules();
                if (reloadModuleConfig) await reloadModuleConfig();
                return { success: true };
            }
        } catch (error) {
            console.error("Error cambiando estado de módulo:", error);
            throw error;
        }
    };

    const duplicateModule = async (moduleId, newNames) => {
        setLoading(true);
        try {
            const resp = await cnnModuleApi.duplicateModule(accessToken, moduleId, newNames);
            if (resp) {
                await loadModules();
                if (reloadModuleConfig) await reloadModuleConfig();
                return { success: true };
            }
        } catch (error) {
            console.error("Error duplicando módulo:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const invalidateCache = async () => {
        try {
            const resp = await cnnModuleApi.invalidateCache(accessToken);
            if (resp && reloadModuleConfig) await reloadModuleConfig();
            return { success: true };
        } catch (error) {
            console.error("Error invalidando caché:", error);
            throw error;
        }
    };

    const initializeSystemModules = async () => {
        setLoading(true);
        try {
            const resp = await cnnModuleApi.initializeSystemModules(accessToken);
            if (resp) {
                await loadModules();
                if (reloadModuleConfig) await reloadModuleConfig();
                return { success: true };
            }
        } catch (error) {
            console.error("Error inicializando módulos del sistema:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const exportModules = async () => {
        try {
            const response = await cnnModuleApi.exportModules(accessToken, "json");
            if (response) {
                const dataStr = JSON.stringify(response.data || response, null, 2);
                const dataBlob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `modules-export-${new Date().toISOString().split("T")[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return { success: true };
            }
        } catch (error) {
            console.error("Error exportando módulos:", error);
            throw error;
        }
    };

    return {
        modules,
        loading,
        availableActions,
        categories,
        searchTerm,
        setSearchTerm,
        filterCategory,
        setFilterCategory,
        filterStatus,
        setFilterStatus,
        pagination,
        actions: {
            loadModules,
            saveModule,
            deleteModule,
            toggleModuleStatus,
            duplicateModule,
            invalidateCache,
            initializeSystemModules,
            exportModules,
            setPage: (page) => setPagination(prev => ({ ...prev, current: page }))
        }
    };
}
