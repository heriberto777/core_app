import React, { useState } from "react";
import {
    useAuth,
    useRoles,
    usePermissions,
    RoleFormModal,
    RolesTable,
    Button
} from "../../index";
import { FaPlus, FaSearch, FaShieldAlt } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * RoleManagement (Tailwind Edition)
 * Gestión de políticas de seguridad con diseño corporativo avanzado.
 */
export function RoleManagement() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);

    const { accessToken, reloadUserPermissions } = useAuth();
    const { hasPermission } = usePermissions();

    const {
        roles,
        loading,
        availableResources,
        searchTerm,
        setSearchTerm,
        actions
    } = useRoles(accessToken, reloadUserPermissions);

    const canCreate = hasPermission("roles", "create");

    const handleEdit = (role) => {
        setSelectedRole(role);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedRole(null);
        setModalOpen(true);
    };

    const handleSave = async (data) => {
        try {
            await actions.saveRole(selectedRole?._id, data);
            setModalOpen(false);
            Swal.fire({
                icon: 'success', title: selectedRole ? 'Rol actualizado' : 'Rol creado', toast: true,
                position: 'top-end', showConfirmButton: false, timer: 3000
            });
        } catch (e) {
            Swal.fire("Error", e.message || "Error al procesar el rol", "error");
        }
    };

    const handleDelete = async (role) => {
        const result = await Swal.fire({
            title: '¿Eliminar política de seguridad?',
            text: `Estás a punto de eliminar el rol "${role.displayName}". Los usuarios asociados perderán estos permisos.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar permanentemente',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                await actions.deleteRole(role._id);
                Swal.fire('Eliminado', 'La política de seguridad ha sido removida.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
            }
        }
    };

    const handleToggleStatus = async (roleId, currentStatus) => {
        try {
            await actions.toggleRoleStatus(roleId, currentStatus);
        } catch (e) {
            Swal.fire("Error", "No se pudo cambiar el estado", "error");
        }
    };

    const handleDuplicate = async (role) => {
        const { value: newNames } = await Swal.fire({
            title: 'Duplicar Rol de Seguridad',
            html: `
        <div style="text-align: left; padding: 10px;">
          <label style="display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 5px;">NOMBRE AMIGABLE</label>
          <input id="newDisp" class="swal2-input" style="margin-top: 0; margin-bottom: 15px;" value="${role.displayName} (Copia)">
          <label style="display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 5px;">SLUG TÉCNICO (Sin espacios)</label>
          <input id="newName" class="swal2-input" style="margin-top: 0;" value="${role.name}-copy">
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Clonar Rol',
            confirmButtonColor: '#6366f1',
            preConfirm: () => ({
                displayName: document.getElementById('newDisp').value,
                name: document.getElementById('newName').value
            })
        });

        if (newNames) {
            try {
                await actions.duplicateRole(role._id, newNames);
                Swal.fire('Duplicado', 'El rol ha sido clonado correctamente.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'Error al duplicar', 'error');
            }
        }
    };

    const handleViewUsers = async (role) => {
        const users = await actions.getUsersByRole(role.name);
        const usersList = users.map(u => `
      <div style="padding: 12px; border-bottom: 1px solid #f1f5f9; text-align: left; display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; border-radius: 8px; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px;">${u.name?.charAt(0)}</div>
        <div style="flex: 1;">
          <div style="font-weight: 700; color: #1e293b; font-size: 14px;">${u.name} ${u.lastname}</div>
          <div style="font-size: 11px; color: #94a3b8; font-weight: 600;">${u.email}</div>
        </div>
      </div>`).join('') || '<div style="padding: 40px; color: #94a3b8; font-weight: 600; text-align: center;">No hay usuarios asociados.</div>';

        Swal.fire({
            title: `Usuarios: ${role.displayName}`,
            html: `<div style="max-height: 400px; overflow-y: auto; border: 1px solid #f1f5f9; border-radius: 12px;">${usersList}</div>`,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#64748b'
        });
    };

    return (
        <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
            {/* HEADER */}
            <header>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Políticas de Seguridad</h1>
                <p className="text-slate-500 mt-2 font-medium">Define roles y matrices de permisos para el control de acceso granular.</p>
            </header>

            {/* TOOLBAR */}
            <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-lg">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        placeholder="Buscar por rol o privilegio..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
                    />
                </div>
                {canCreate && (
                    <Button variant="primary" onClick={handleAdd}>
                        <FaPlus /> Nueva Política
                    </Button>
                )}
            </div>

            {/* CONTENT */}
            {loading && roles.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-[32px] border border-slate-200 border-dashed">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                      <FaShieldAlt size={32} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-800">Consultando matriz de seguridad...</p>
                      <p className="text-sm text-slate-400 mt-1">Cargando jerarquías de acceso.</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden">
                    <RolesTable
                        data={roles}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                        onToggleStatus={handleToggleStatus}
                        onViewUsers={handleViewUsers}
                    />
                </div>
            )}

            <RoleFormModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                initialData={selectedRole}
                resources={availableResources}
            />
        </div>
    );
}
