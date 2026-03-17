import { useState, useCallback, useEffect, useMemo } from "react";
import { MappingApi } from "../api/index";

const api = new MappingApi();

export function useMappings(accessToken, includeInactive = false) {
    const [mappings, setMappings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const loadMappings = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getMappings(accessToken, includeInactive);
            setMappings(data || []);
        } catch (error) {
            console.error("Error loading mappings:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [accessToken, includeInactive]);

    useEffect(() => {
        if (accessToken) loadMappings();
    }, [accessToken, loadMappings]);

    const deleteMapping = useCallback(async (id) => {
        try {
            await api.deleteMapping(accessToken, id);
            await loadMappings();
        } catch (error) {
            console.error("Error deleting mapping:", error);
            throw error;
        }
    }, [accessToken, loadMappings]);

    const toggleMappingStatus = useCallback(async (id, currentStatus) => {
        try {
            await api.updateMapping(accessToken, id, { active: !currentStatus });
            await loadMappings();
        } catch (error) {
            console.error("Error toggling mapping status:", error);
            throw error;
        }
    }, [accessToken, loadMappings]);

    const filteredMappings = useMemo(() => {
        return mappings.filter(
            (mapping) =>
                mapping.name.toLowerCase().includes(search.toLowerCase()) ||
                mapping.description?.toLowerCase().includes(search.toLowerCase())
        );
    }, [mappings, search]);

    return {
        mappings,
        filteredMappings,
        loading,
        search,
        setSearch,
        loadMappings,
        deleteMapping,
        toggleMappingStatus
    };
}
