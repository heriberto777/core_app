import { useState, useEffect, useCallback } from "react";
import { User, roleApi } from "../api/index";
import Swal from "sweetalert2";

const userApi = new User();
const cnnRolApi = new roleApi();

export function useUsers(accessToken, currentUser, reloadUserPermissions) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [availableRoles, setAvailableRoles] = useState([]);
    const [availableResources, setAvailableResources] = useState([]);
    const [availableActions, setAvailableActions] = useState([]);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalUsers: 0,
        limit: 10,
    });

    const loadAvailableRoles = useCallback(async () => {
        if (!accessToken) return;
        try {
            const resp = await cnnRolApi.getAvailableRoles(accessToken);
            if (resp) setAvailableRoles(resp);
        } catch (error) {
            console.error("Error cargando roles:", error);
        }
    }, [accessToken]);

    const loadAvailableResourcesAndActions = useCallback(async () => {
        if (!accessToken) return;
        try {
            const [resources, actions] = await Promise.all([
                cnnRolApi.getAvailableResources(accessToken),
                cnnRolApi.getAvailableActions(accessToken)
            ]);
            if (resources) setAvailableResources(resources);
            if (actions) setAvailableActions(actions);
        } catch (error) {
            console.error("Error cargando recursos y acciones:", error);
        }
    }, [accessToken]);

    const loadUsers = useCallback(async () => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const response = await userApi.getUsersWithRoles(accessToken, {
                page: pagination.currentPage,
                limit: pagination.limit,
                search: searchTerm,
            });

            if (response) {
                setUsers(response.users || []);
                if (response.pagination) {
                    setPagination(prev => ({ ...prev, ...response.pagination }));
                }
            }
        } catch (error) {
            console.error("Error cargando usuarios:", error);
            Swal.fire("Error", "No se pudieron cargar los usuarios", "error");
        } finally {
            setLoading(false);
        }
    }, [accessToken, pagination.currentPage, pagination.limit, searchTerm]);

    useEffect(() => {
        loadUsers();
        loadAvailableRoles();
        loadAvailableResourcesAndActions();
    }, [loadUsers, loadAvailableRoles, loadAvailableResourcesAndActions]);

    const createUser = async (userData) => {
        setLoading(true);
        try {
            const { roles, permissions, ...userDataWithoutRoles } = userData;
            const response = await userApi.createUser(accessToken, userDataWithoutRoles);
            
            if (response && response._id) {
                const userId = response._id || response.data?._id;
                
                if (roles && roles.length > 0) {
                    await userApi.updateUserRoles(accessToken, userId, roles);
                }
                
                if (permissions && permissions.length > 0) {
                    await userApi.updateUserSpecificPermissions(accessToken, userId, permissions);
                }
                
                await loadUsers();
                return { success: true };
            }
        } catch (error) {
            console.error("Error creando usuario:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const updateUser = async (userId, userData) => {
        setLoading(true);
        try {
            const { roles, permissions, newPassword, ...userDataWithoutRoles } = userData;
            const updateResponse = await userApi.updateUser(accessToken, userId, userDataWithoutRoles);

            if (Array.isArray(roles)) {
                await userApi.updateUserRoles(accessToken, userId, roles);
            }

            if (Array.isArray(permissions)) {
                await userApi.updateUserSpecificPermissions(accessToken, userId, permissions);
            }

            if (newPassword && newPassword.length >= 6) {
                await userApi.changePassword(accessToken, userId, null, newPassword);
            }

            await loadUsers();
            if (userId === currentUser?._id) {
                await reloadUserPermissions();
            }
            return { success: true };
        } catch (error) {
            console.error("Error actualizando usuario:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const toggleUserStatus = async (userId, currentStatus) => {
        try {
            const response = await userApi.ActiveInactiveUser(accessToken, userId, {
                activo: !currentStatus,
            });
            if (response) {
                await loadUsers();
                return { success: true };
            }
        } catch (error) {
            console.error("Error cambiando estado:", error);
            throw error;
        }
    };

    const deleteUser = async (userId) => {
        try {
            const response = await userApi.deleteUser(accessToken, userId);
            if (response) {
                await loadUsers();
                return { success: true };
            }
        } catch (error) {
            console.error("Error eliminando usuario:", error);
            throw error;
        }
    };

    return {
        users,
        loading,
        availableRoles,
        availableResources,
        availableActions,
        pagination,
        searchTerm,
        setSearchTerm,
        actions: {
            loadUsers,
            createUser,
            updateUser,
            toggleUserStatus,
            deleteUser,
            setPage: (page) => setPagination(prev => ({ ...prev, currentPage: page }))
        }
    };
}
