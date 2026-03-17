import React, { useState } from "react";
import styled from "styled-components";
import {
    Header,
    useAuth,
    useRoles,
    usePermissions,
    RoleFormModal,
    RolesTable,
    Button
} from "../../index";
import { Container } from "../index";
import { FaPlus, FaSearch, FaShieldAlt } from "react-icons/fa";
import Swal from "sweetalert2";

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const SearchBox = styled.div`
  position: relative;
  width: 100%;
  max-width: 400px;

  svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
  }

  input {
    width: 100%;
    padding: 12px 12px 12px 42px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }
  }
`;

export function RoleManagement() {
    const [openstate, setOpenState] = useState(false);
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
    const canUpdate = hasPermission("roles", "update");
    const canDelete = hasPermission("roles", "delete");

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
                icon: 'success',
                title: selectedRole ? 'Rol actualizado' : 'Rol creado',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
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
        <input id="newDisp" class="swal2-input" placeholder="Nombre amigable" value="${role.displayName} (Copia)">
        <input id="newName" class="swal2-input" placeholder="Slug técnico" value="${role.name}-copy">
      `,
            showCancelButton: true,
            confirmButtonText: 'Confirmar Duplicación',
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
        const usersList = users.map(u => `<div style="padding: 8px; border-bottom: 1px solid #f1f5f9; text-align: left;">
      <div style="font-weight: 700;">${u.name} ${u.lastname}</div>
      <div style="font-size: 12px; color: #64748b;">${u.email}</div>
    </div>`).join('') || '<p style="padding: 20px; color: #94a3b8;">No hay usuarios asociados a este rol.</p>';

        Swal.fire({
            title: `Usuarios: ${role.displayName}`,
            html: `<div style="max-height: 400px; overflow-y: auto;">${usersList}</div>`,
            confirmButtonText: 'Cerrar'
        });
    };

    return (
        <Container>
            <main style={{ padding: '40px 20px' }}>
                <Layout>
                    <div>
                        <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', color: 'inherit' }}>Políticas de Seguridad</h1>
                        <p style={{ opacity: 0.7 }}>Define roles y matrices de permisos para el control de acceso granular.</p>
                    </div>

                    <Toolbar>
                        <SearchBox>
                            <FaSearch />
                            <input
                                placeholder="Buscar por rol o privilegio..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </SearchBox>
                        {canCreate && (
                            <Button variant="primary" onClick={handleAdd}>
                                <FaPlus /> Nueva Política
                            </Button>
                        )}
                    </Toolbar>

                    {loading && roles.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '100px', opacity: 0.7 }}>
                            <FaShieldAlt size={48} style={{ opacity: 0.3, marginBottom: '20px' }} />
                            <p>Consultando matriz de seguridad...</p>
                        </div>
                    ) : (
                        <RolesTable
                            data={roles}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            onToggleStatus={handleToggleStatus}
                            onViewUsers={handleViewUsers}
                        />
                    )}

                    <RoleFormModal
                        isOpen={modalOpen}
                        onClose={() => setModalOpen(false)}
                        onSave={handleSave}
                        initialData={selectedRole}
                        resources={availableResources}
                    />
                </Layout>
            </main>
        </Container>
    );
}
