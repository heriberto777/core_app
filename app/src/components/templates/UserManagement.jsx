import React, { useState } from "react";
import styled from "styled-components";
import {
    Header,
    useAuth,
    useUsers,
    usePermissions,
    UserFormModal,
    UsersTable,
    Button
} from "../../index";
import { Container } from "../index";
import { FaPlus, FaUserShield, FaSearch, FaUsers } from "react-icons/fa";
import Swal from "sweetalert2";

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;

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

export function UserManagement() {
    const [openstate, setOpenState] = useState(false);
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
    const canDelete = hasPermission("users", "delete");

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
                    icon: 'success',
                    title: 'Usuario actualizado',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                });
            } else {
                await actions.createUser(data);
                Swal.fire({
                    icon: 'success',
                    title: 'Usuario creado',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
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
        const rolesHtml = user.roles?.map(r => `<span style="background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 12px; margin: 2px; display: inline-block;">${r.displayName}</span>`).join('') || 'Sin roles';

        Swal.fire({
            title: 'Perfil de Usuario',
            html: `
        <div style="text-align: left; padding: 10px;">
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Teléfono:</strong> ${user.telefono || 'No registrado'}</p>
          <p><strong>Administrador:</strong> ${user.isAdmin ? '✅ Sí' : '❌ No'}</p>
          <div style="margin-top: 15px;">
            <p><strong>Roles:</strong></p>
            <div>${rolesHtml}</div>
          </div>
        </div>
      `,
            confirmButtonText: 'Cerrar'
        });
    };

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <Layout>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>Gestión de Identidades</h1>
                    <p style={{ opacity: 0.7, fontSize: '14px' }}>Administra usuarios, privilegios y accesos al ecosistema.</p>
                </div>

                <Toolbar>
                    <SearchBox>
                        <FaSearch />
                        <input
                            placeholder="Buscar por nombre, email o ID..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBox>
                    {canCreate && (
                        <Button variant="primary" onClick={handleAdd}>
                            <FaPlus /> Crear Nuevo Usuario
                        </Button>
                    )}
                </Toolbar>

                {loading && users.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', opacity: 0.7 }}>
                        <FaUsers size={48} style={{ opacity: 0.3, marginBottom: '20px' }} />
                        <p>Consultando base de datos de usuarios...</p>
                    </div>
                ) : (
                    <UsersTable
                        data={users}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleStatus={handleToggleStatus}
                        onView={handleView}
                        currentUserId={currentUser?._id}
                    />
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
            </Layout>
        </div>
    );
}
