import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import {
  FaUsers,
  FaShieldAlt,
  FaSearch,
  FaFilter,
  FaSync,
  FaPlus,
  FaMinus,
  FaCrown,
  FaCheck,
  FaTimes,
  FaUserShield,
} from "react-icons/fa";

import { useAuth, usePermissions } from "../../index";
import { User } from "../../api/index";

const userApi = new User();

const UserRoleManager = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);

  const { user: currentUser, accessToken, reloadUserPermissions } = useAuth();
  const { hasPermission } = usePermissions();

  // Verificar permisos
  const canUpdateUsers = hasPermission("users", "update");
  const canUpdateRoles = hasPermission("roles", "update");
  const canRead =
    hasPermission("users", "read") && hasPermission("roles", "read");

  useEffect(() => {
    if (canRead && accessToken) {
      loadUsers();
      loadRoles();
    }
  }, [canRead, accessToken]);

  const loadUsers = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const response = await userApi.getUsersWithRoles(accessToken, {
        page: 1,
        limit: 100,
        search: searchTerm,
      });

      if (response && response.success) {
        setUsers(response.data?.users || response.users || []);
      } else {
        throw new Error(response?.message || "Error cargando usuarios");
      }
    } catch (error) {
      console.error("Error cargando usuarios:", error);
      Swal.fire("Error", "No se pudieron cargar los usuarios", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/v1/roles/available", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (data.success) {
        setRoles(data.data);
      }
    } catch (error) {
      console.error("Error cargando roles:", error);
    }
  };

  const assignRoleToUsers = async () => {
    if (!selectedRole || selectedUsers.length === 0) {
      Swal.fire("Advertencia", "Selecciona un rol y al menos un usuario", "warning");
      return;
    }

    const role = roles.find((r) => r._id === selectedRole);
    const userNames = selectedUsers.map((userId) => {
      const user = users.find((u) => u._id === userId);
      return `${user.name} ${user.lastname}`;
    });

    const confirmResult = await Swal.fire({
      title: "Confirmar Asignación",
      html: `
        <div class="space-y-4 mt-4">
            <p class="text-sm text-slate-500 font-medium">¿Asignar el rol <strong>"${role.displayName}"</strong> a los siguientes usuarios?</p>
            <div class="bg-blue-50 border border-blue-100 p-5 rounded-2xl text-left max-h-[200px] overflow-y-auto">
                <ul class="space-y-2">
                    ${userNames.map((name) => `<li class="text-[11px] font-black text-blue-700 uppercase tracking-widest flex gap-2"><span>•</span> ${name}</li>`).join("")}
                </ul>
            </div>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, asignar",
      cancelButtonText: "Cancelar",
      customClass: {
        popup: 'rounded-[32px] p-8',
        confirmButton: 'px-10 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-600/20',
        cancelButton: 'px-10 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] ml-4'
      },
      buttonsStyling: false,
    });

    if (confirmResult.isConfirmed) {
      setLoading(true);
      try {
        const promises = selectedUsers.map(async (userId) => {
          const user = users.find((u) => u._id === userId);
          const currentRoleIds = user.rolesInfo?.map((r) => r._id) || [];
          if (!currentRoleIds.includes(selectedRole)) {
            const newRoleIds = [...currentRoleIds, selectedRole];
            return userApi.updateUserRoles(accessToken, userId, newRoleIds);
          }
          return Promise.resolve({ success: true });
        });

        await Promise.all(promises);
        Swal.fire("¡Éxito!", "Roles asignados correctamente", "success");
        setSelectedUsers([]);
        setSelectedRole("");
        await loadUsers();
        if (selectedUsers.includes(currentUser._id)) await reloadUserPermissions();
      } catch (error) {
        Swal.fire("Error", "No se pudieron asignar los roles", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const removeRoleFromUsers = async () => {
    if (!selectedRole || selectedUsers.length === 0) {
      Swal.fire("Advertencia", "Selecciona un rol y al menos un usuario", "warning");
      return;
    }

    const role = roles.find((r) => r._id === selectedRole);
    const usersWithRole = selectedUsers.filter((userId) => {
      const user = users.find((u) => u._id === userId);
      return user.rolesInfo?.some((r) => r._id === selectedRole);
    });

    if (usersWithRole.length === 0) {
      Swal.fire("Información", "Ninguno de los usuarios seleccionados tiene este rol", "info");
      return;
    }

    const confirmResult = await Swal.fire({
      title: "Confirmar Remoción",
      text: `¿Remover el rol "${role.displayName}" de ${usersWithRole.length} usuario(s)?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, remover",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
      customClass: {
        popup: 'rounded-[32px] p-8',
        confirmButton: 'px-10 py-3.5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20',
        cancelButton: 'px-10 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] ml-4'
      },
      buttonsStyling: false,
    });

    if (confirmResult.isConfirmed) {
      setLoading(true);
      try {
        const promises = usersWithRole.map(async (userId) => {
          const user = users.find((u) => u._id === userId);
          const currentRoleIds = user.rolesInfo?.map((r) => r._id) || [];
          const newRoleIds = currentRoleIds.filter((id) => id !== selectedRole);
          return userApi.updateUserRoles(accessToken, userId, newRoleIds);
        });

        await Promise.all(promises);
        Swal.fire("¡Éxito!", "Roles removidos correctamente", "success");
        setSelectedUsers([]);
        setSelectedRole("");
        await loadUsers();
        if (usersWithRole.includes(currentUser._id)) await reloadUserPermissions();
      } catch (error) {
        Swal.fire("Error", "No se pudieron remover los roles", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUserSelection = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!canRead) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-6 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center">
            <FaShieldAlt className="text-4xl" />
        </div>
        <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900">Acceso Restringido</h3>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No tiene permisos de lectura para la gestión de usuarios</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start gap-8">
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-4">
            <FaUserShield className="text-blue-600" /> Control de Acceso Maestro
          </h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest max-w-xl">Gestione privilegios y roles de seguridad para la infraestructura de usuarios del ERP</p>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={loadUsers} 
            disabled={loading}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm flex items-center gap-3 disabled:opacity-50"
          >
            <FaSync className={loading ? "animate-spin" : ""} /> {loading ? "Sincronizando..." : "Actualizar Lista"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-6 items-center bg-white/50 backdrop-blur-xl p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <div className="relative group">
          <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder="Filtrar por nombre, apellido o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
        </div>

        <div className="relative">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="pl-6 pr-12 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all appearance-none min-w-[220px]"
          >
            <option value="">Seleccionar Rol...</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.displayName}
              </option>
            ))}
          </select>
          <FaFilter className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={assignRoleToUsers}
            disabled={!selectedRole || selectedUsers.length === 0 || !canUpdateUsers}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-30 flex items-center gap-3"
          >
            <FaPlus /> Asignar
          </button>

          <button
            onClick={removeRoleFromUsers}
            disabled={!selectedRole || selectedUsers.length === 0 || !canUpdateUsers}
            className="px-8 py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 disabled:opacity-30 flex items-center gap-3"
          >
            <FaMinus /> Remover
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center px-8 py-4 bg-slate-50 border border-slate-100 rounded-2xl">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <span className="text-blue-600">{selectedUsers.length}</span> usuarios seleccionados de {filteredUsers.length} totales
        </span>
        {selectedUsers.length > 0 && (
          <button
            onClick={() => setSelectedUsers([])}
            className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
          >
            Limpiar Selección
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredUsers.map((user) => (
          <div
            key={user._id}
            className={`bg-white rounded-[24px] p-6 border-2 transition-all duration-300 hover:shadow-xl cursor-pointer group relative ${
                selectedUsers.includes(user._id) ? "border-blue-600 ring-4 ring-blue-500/10 translate-y-[-4px]" : "border-slate-100"
            }`}
            onClick={() => handleUserSelection(user._id)}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black group-hover:bg-blue-600 transition-colors">
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 truncate">
                <div className="text-sm font-black text-slate-900 truncate flex items-center gap-2">
                  {user.name} {user.lastname}
                  {user.isAdmin && <FaCrown className="text-amber-500 text-xs shrink-0" />}
                </div>
                <div className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-tight">{user.email}</div>
              </div>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  selectedUsers.includes(user._id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 bg-white"
              }`}>
                {selectedUsers.includes(user._id) && <FaCheck className="text-[10px]" />}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {user.rolesInfo && user.rolesInfo.length > 0 ? (
                user.rolesInfo.map((role) => (
                  <span key={role._id} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                      role.isActive ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-400 opacity-60"
                  }`}>
                    {role.displayName}
                  </span>
                ))
              ) : (
                <span className="text-[10px] font-bold text-slate-300 italic">Sin roles vinculados</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center opacity-30 gap-6">
            <FaUsers className="text-6xl" />
            <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">Búsqueda sin resultados</h3>
                <p className="text-xs font-bold uppercase tracking-widest">No se encontraron usuarios con el término: "{searchTerm}"</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserRoleManager;
