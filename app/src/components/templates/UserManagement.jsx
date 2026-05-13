import React, { useState } from "react";
import {
    useAuth,
    useUsers,
    usePermissions,
    UserFormModal,
    UsersTable,
    Button
} from "../../index";
import { FaPlus, FaSearch, FaUsers } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * UserManagement (Tailwind Edition)
 * Gestión de identidades con diseño corporativo suave.
 */
export function UserManagement() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    const { user: currentUser, accessToken, reloadUserPermissions } = useAuth();
    const { hasPermission } = usePermissions();

    const {
        users,
        loading,
        availableRoles,
        availableResources,
        availableActions,
        searchTerm,
        setSearchTerm,
        actions
    } = useUsers(accessToken, currentUser, reloadUserPermissions);

    const canCreate = hasPermission("users", "create");

    const handleEdit = (user) => {
        setSelectedUser(user);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedUser(null);
        setModalOpen(true);
    };

    const handleSave = async (data) => {
        try {
            if (selectedUser) {
                await actions.updateUser(selectedUser._id, data);
                Swal.fire({
                    icon: 'success', title: 'Usuario actualizado', toast: true,
                    position: 'top-end', showConfirmButton: false, timer: 3000
                });
            } else {
                await actions.createUser(data);
                Swal.fire({
                    icon: 'success', title: 'Usuario creado', toast: true,
                    position: 'top-end', showConfirmButton: false, timer: 3000
                });
            }
            setModalOpen(false);
        } catch (e) {
            Swal.fire("Error", e.message || "Error al procesar usuario", "error");
        }
    };

    const handleDelete = async (user) => {
        const result = await Swal.fire({
            title: '¿Eliminar usuario?',
            text: `Estás a punto de eliminar a ${user.name}. Esta acción es irreversible.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar permanentemente',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await actions.deleteUser(user._id);
                Swal.fire('Eliminado', 'El usuario ha sido removido del sistema.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
            }
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            await actions.toggleUserStatus(userId, currentStatus);
        } catch (e) {
            Swal.fire("Error", "No se pudo cambiar el estado", "error");
        }
    };

    const handleView = (user) => {
        const rolesHtml = user.roles?.map(r => `<span style="background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 12px; margin: 2px; display: inline-block; font-weight: 600;">${r.displayName}</span>`).join('') || 'Sin roles';

        Swal.fire({
            title: 'Perfil de Usuario',
            html: `
        <div style="text-align: left; padding: 10px; font-family: inherit;">
          <p style="margin-bottom: 8px;"><strong>Email:</strong> <span style="color: #64748b;">${user.email}</span></p>
          <p style="margin-bottom: 8px;"><strong>Teléfono:</strong> <span style="color: #64748b;">${user.telefono || 'No registrado'}</span></p>
          <p style="margin-bottom: 8px;"><strong>Administrador:</strong> ${user.isAdmin ? '<span style="color: #10b981;">✅ Sí</span>' : '<span style="color: #ef4444;">❌ No</span>'}</p>
          <div style="margin-top: 15px; border-top: 1px solid #f1f5f9; pt: 15px;">
            <p style="margin-bottom: 10px;"><strong>Roles Asignados:</strong></p>
            <div style="display: flex; flex-wrap: wrap;">${rolesHtml}</div>
          </div>
        </div>
      `,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#6366f1'
        });
    };

    return (
        <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
            {/* HEADER */}
            <header className="mb-2">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Gestión de Identidades</h1>
                <p className="text-slate-500 mt-2 font-medium">Administra usuarios, privilegios y accesos al ecosistema.</p>
            </header>

            {/* TOOLBAR */}
            <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-lg">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        placeholder="Buscar por nombre, email o ID..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
                    />
                </div>
                {canCreate && (
                    <Button variant="primary" onClick={handleAdd}>
                        <FaPlus /> Crear Nuevo Usuario
                    </Button>
                )}
            </div>

            {/* CONTENT */}
            {loading && users.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-[32px] border border-slate-200 border-dashed">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                      <FaUsers size={32} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-800">Consultando identidades...</p>
                      <p className="text-sm text-slate-400 mt-1">Conectando con el servidor de seguridad.</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden">
                    <UsersTable
                        data={users}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleStatus={handleToggleStatus}
                        onView={handleView}
                        currentUserId={currentUser?._id}
                    />
                </div>
            )}

            <UserFormModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                initialData={selectedUser}
                roles={availableRoles}
                resources={availableResources}
                actions={availableActions}
            />
        </div>
    );
}
