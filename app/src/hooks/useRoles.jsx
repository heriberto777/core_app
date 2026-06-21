import { useState, useEffect, useCallback } from "react";
import { roleApi } from "../api/index";
import Swal from "sweetalert2";

const cnnApi = new roleApi();

export function useRoles(accessToken, reloadUserPermissions) {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [availableResources, setAvailableResources] = useState([]);
    const [availableActions, setAvailableActions] = useState([]);

    const loadAvailableData = useCallback(async () => {
        if (!accessToken) return;
        try {
            const [resources, actions] = await Promise.all([
                cnnApi.getAvailableResources(accessToken),
                cnnApi.getAvailableActions(accessToken)
            ]);
            if (resources) setAvailableResources(resources);
            if (actions) setAvailableActions(actions);
        } catch (error) {
            console.error("Error cargando meta-datos de roles:", error);
        }
    }, [accessToken]);

    const loadRoles = useCallback(async () => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const resp = await cnnApi.getRoles(accessToken, {
                page: 1,
                limit: 100, // Sufficient for roles
                search: searchTerm,
                includeInactive: true,
            });
            if (resp) setRoles(resp.roles || []);
        } catch (error) {
            console.error("Error cargando roles:", error);
            Swal.fire("Error", "No se pudieron cargar los roles", "error");
        } finally {
            setLoading(false);
        }
    }, [accessToken, searchTerm]);

    useEffect(() => {
        loadRoles();
        loadAvailableData();
    }, [loadRoles, loadAvailableData]);

    const saveRole = async (roleId, roleData) => {
        setLoading(true);
        try {
            let resp = roleId
                ? await cnnApi.updateRole(accessToken, roleId, roleData)
                : await cnnApi.createRole(accessToken, roleData);

            if (resp) {
                await loadRoles();
                return { success: true };
            }
        } catch (error) {
            console.error("Error guardando rol:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const toggleRoleStatus = async (roleId, currentStatus) => {
        try {
            const resp = await cnnApi.toggleRoleStatus(accessToken, roleId, currentStatus);
            if (resp) {
                await loadRoles();
                return { success: true };
            }
        } catch (error) {
            console.error("Error cambiando estado de rol:", error);
            throw error;
        }
    };

    const deleteRole = async (roleId) => {
        try {
            const resp = await cnnApi.removeRole(accessToken, roleId);
            if (resp) {
                await loadRoles();
                return { success: true };
            }
        } catch (error) {
            console.error("Error eliminando rol:", error);
            throw error;
        }
    };

    const duplicateRole = async (roleId, newRoleData) => {
        setLoading(true);
        try {
            const resp = await cnnApi.duplicateRole(accessToken, roleId, newRoleData);
            if (resp) {
                await loadRoles();
                return { success: true };
            }
        } catch (error) {
            console.error("Error duplicando rol:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const getUsersByRole = async (roleName) => {
        try {
            const resp = await cnnApi.getUsersByRole(roleName, accessToken);
            return resp?.users || [];
        } catch (error) {
            console.error("Error cargando usuarios por rol:", error);
            return [];
        }
    };

    return {
        roles,
        loading,
        availableResources,
        availableActions,
        searchTerm,
        setSearchTerm,
        actions: {
            loadRoles,
            saveRole,
            toggleRoleStatus,
            deleteRole,
            duplicateRole,
            getUsersByRole
        }
    };
}
