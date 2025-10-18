import React, { useState, useEffect } from "react";
import styled from "styled-components";
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

  // ⭐ CARGAR USUARIOS USANDO userApi ⭐
  const loadUsers = async () => {
    if (!accessToken) return;

    setLoading(true);
    try {
      // ⭐ USAR getUsersWithRoles QUE YA EXISTE EN userApi ⭐
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

  // ⭐ CARGAR ROLES DISPONIBLES ⭐
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

  // ⭐ ASIGNAR ROL A MÚLTIPLES USUARIOS USANDO userApi ⭐
  const assignRoleToUsers = async () => {
    if (!selectedRole || selectedUsers.length === 0) {
      Swal.fire(
        "Advertencia",
        "Selecciona un rol y al menos un usuario",
        "warning"
      );
      return;
    }

    const role = roles.find((r) => r._id === selectedRole);
    const userNames = selectedUsers.map((userId) => {
      const user = users.find((u) => u._id === userId);
      return `${user.name} ${user.lastname}`;
    });

    const confirmResult = await Swal.fire({
      title: "Confirmar asignación",
      html: `
        <p>¿Asignar el rol <strong>"${role.displayName}"</strong> a:</p>
        <ul style="text-align: left; margin: 10px 0;">
          ${userNames.map((name) => `<li>${name}</li>`).join("")}
        </ul>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, asignar",
      cancelButtonText: "Cancelar",
    });

    if (confirmResult.isConfirmed) {
      setLoading(true);
      try {
        // ⭐ ASIGNAR ROL A CADA USUARIO USANDO updateUserRoles ⭐
        const promises = selectedUsers.map(async (userId) => {
          const user = users.find((u) => u._id === userId);
          const currentRoleIds = user.rolesInfo?.map((r) => r._id) || [];

          // Agregar el nuevo rol si no lo tiene
          if (!currentRoleIds.includes(selectedRole)) {
            const newRoleIds = [...currentRoleIds, selectedRole];
            return userApi.updateUserRoles(accessToken, userId, newRoleIds);
          }
          return Promise.resolve({ success: true });
        });

        await Promise.all(promises);

        Swal.fire("¡Éxito!", "Roles asignados correctamente", "success");

        // Limpiar selecciones y recargar
        setSelectedUsers([]);
        setSelectedRole("");
        await loadUsers();

        // Recargar permisos si el usuario actual fue modificado
        if (selectedUsers.includes(currentUser._id)) {
          await reloadUserPermissions();
        }
      } catch (error) {
        console.error("Error asignando roles:", error);
        Swal.fire("Error", "No se pudieron asignar los roles", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // ⭐ REMOVER ROL DE MÚLTIPLES USUARIOS ⭐
  const removeRoleFromUsers = async () => {
    if (!selectedRole || selectedUsers.length === 0) {
      Swal.fire(
        "Advertencia",
        "Selecciona un rol y al menos un usuario",
        "warning"
      );
      return;
    }

    const role = roles.find((r) => r._id === selectedRole);
    const usersWithRole = selectedUsers.filter((userId) => {
      const user = users.find((u) => u._id === userId);
      return user.rolesInfo?.some((r) => r._id === selectedRole);
    });

    if (usersWithRole.length === 0) {
      Swal.fire(
        "Información",
        "Ninguno de los usuarios seleccionados tiene este rol",
        "info"
      );
      return;
    }

    const confirmResult = await Swal.fire({
      title: "Confirmar remoción",
      text: `¿Remover el rol "${role.displayName}" de ${usersWithRole.length} usuario(s)?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, remover",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
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

        // Limpiar selecciones y recargar
        setSelectedUsers([]);
        setSelectedRole("");
        await loadUsers();

        // Recargar permisos si el usuario actual fue modificado
        if (usersWithRole.includes(currentUser._id)) {
          await reloadUserPermissions();
        }
      } catch (error) {
        console.error("Error removiendo roles:", error);
        Swal.fire("Error", "No se pudieron remover los roles", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // ⭐ MANEJAR SELECCIÓN DE USUARIOS ⭐
  const handleUserSelection = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  // ⭐ FILTRAR USUARIOS ⭐
  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!canRead) {
    return (
      <Container>
        <ErrorMessage>
          <FaShieldAlt />
          <h3>Sin permisos</h3>
          <p>No tienes permisos para gestionar usuarios y roles.</p>
        </ErrorMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <TitleSection>
          <h2>
            <FaUsers /> Gestión de Usuarios y Roles
          </h2>
          <p>Asigna y gestiona roles para múltiples usuarios</p>
        </TitleSection>

        <ActionsSection>
          <button onClick={loadUsers} disabled={loading}>
            <FaSync /> {loading ? "Cargando..." : "Actualizar"}
          </button>
        </ActionsSection>
      </Header>

      <FilterSection>
        <SearchBox>
          <FaSearch />
          <input
            type="text"
            placeholder="Buscar usuarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchBox>

        <RoleSelector>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="">Seleccionar rol...</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.displayName}
              </option>
            ))}
          </select>
        </RoleSelector>

        <ButtonGroup>
          <button
            onClick={assignRoleToUsers}
            disabled={
              !selectedRole || selectedUsers.length === 0 || !canUpdateUsers
            }
            className="assign"
          >
            <FaPlus /> Asignar Rol
          </button>

          <button
            onClick={removeRoleFromUsers}
            disabled={
              !selectedRole || selectedUsers.length === 0 || !canUpdateUsers
            }
            className="remove"
          >
            <FaMinus /> Remover Rol
          </button>
        </ButtonGroup>
      </FilterSection>

      <InfoSection>
        <span>
          {selectedUsers.length} usuario(s) seleccionado(s) de{" "}
          {filteredUsers.length}
        </span>
        {selectedUsers.length > 0 && (
          <button
            onClick={() => setSelectedUsers([])}
            className="clear-selection"
          >
            Limpiar selección
          </button>
        )}
      </InfoSection>

      <UsersGrid>
        {filteredUsers.map((user) => (
          <UserCard
            key={user._id}
            className={selectedUsers.includes(user._id) ? "selected" : ""}
            onClick={() => handleUserSelection(user._id)}
          >
            <UserHeader>
              <UserAvatar>
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </UserAvatar>
              <UserInfo>
                <UserName>
                  {user.name} {user.lastname}
                  {user.isAdmin && <FaCrown className="admin-icon" />}
                </UserName>
                <UserEmail>{user.email}</UserEmail>
              </UserInfo>
              <SelectionCheckbox
                type="checkbox"
                checked={selectedUsers.includes(user._id)}
                onChange={() => handleUserSelection(user._id)}
              />
            </UserHeader>

            <RolesList>
              {user.rolesInfo && user.rolesInfo.length > 0 ? (
                user.rolesInfo.map((role) => (
                  <RoleTag key={role._id} active={role.isActive}>
                    {role.displayName}
                  </RoleTag>
                ))
              ) : (
                <EmptyRoles>Sin roles asignados</EmptyRoles>
              )}
            </RolesList>
          </UserCard>
        ))}
      </UsersGrid>

      {filteredUsers.length === 0 && !loading && (
        <EmptyState>
          <FaUsers />
          <h3>No se encontraron usuarios</h3>
          <p>Intenta con otros términos de búsqueda</p>
        </EmptyState>
      )}
    </Container>
  );
};

// ⭐ STYLED COMPONENTS ⭐
const Container = styled.div`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
  }
`;

const TitleSection = styled.div`
  h2 {
    margin: 0 0 0.5rem 0;
    color: ${({ theme }) => theme.text};
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary};
  }
`;

const ActionsSection = styled.div`
  button {
    background: ${({ theme }) => theme.primary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;

    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.primaryDark};
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

const FilterSection = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const SearchBox = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  svg {
    position: absolute;
    left: 12px;
    color: ${({ theme }) => theme.textSecondary};
  }

  input {
    width: 100%;
    padding: 0.75rem 0.75rem 0.75rem 2.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    background: ${({ theme }) => theme.bg};
    color: ${({ theme }) => theme.text};
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.primary};
    }
  }
`;

const RoleSelector = styled.div`
  select {
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    background: ${({ theme }) => theme.bg};
    color: ${({ theme }) => theme.text};
    min-width: 200px;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.primary};
    }
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.5rem;

  button {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    transition: all 0.2s;

    &.assign {
      background: ${({ theme }) => theme.success || "#28a745"};
      color: white;

      &:hover:not(:disabled) {
        background: #218838;
      }
    }

    &.remove {
      background: ${({ theme }) => theme.danger || "#dc3545"};
      color: white;

      &:hover:not(:disabled) {
        background: #c82333;
      }
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
`;

const InfoSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: ${({ theme }) => theme.cardBg || theme.bg};
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};

  span {
    color: ${({ theme }) => theme.textSecondary};
    font-size: 0.9rem;
  }

  .clear-selection {
    background: none;
    border: none;
    color: ${({ theme }) => theme.primary};
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;

    &:hover {
      background: ${({ theme }) => theme.primaryLight || "#f0f8ff"};
    }
  }
`;

const UsersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
`;

const UserCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 1rem;
  background: ${({ theme }) => theme.cardBg || theme.bg};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.primary};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &.selected {
    border-color: ${({ theme }) => theme.primary};
    background: ${({ theme }) => theme.primaryLight || "#f0f8ff"};
  }
`;

const UserHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ theme }) => theme.primary};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
`;

const UserInfo = styled.div`
  flex: 1;
`;

const UserName = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.text};
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .admin-icon {
    color: #f39c12;
    font-size: 0.9rem;
  }
`;

const UserEmail = styled.div`
  font-size: 0.85rem;
  color: ${({ theme }) => theme.textSecondary};
`;

const SelectionCheckbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const RolesList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const RoleTag = styled.span`
  padding: 0.25rem 0.75rem;
  background: ${({ active, theme }) =>
    active ? theme.primary || "#007bff" : theme.textSecondary || "#6c757d"};
  color: white;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  opacity: ${({ active }) => (active ? 1 : 0.6)};
`;

const EmptyRoles = styled.span`
  color: ${({ theme }) => theme.textSecondary};
  font-style: italic;
  font-size: 0.85rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: ${({ theme }) => theme.textSecondary};

  svg {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  h3 {
    margin: 0 0 0.5rem 0;
  }

  p {
    margin: 0;
  }
`;

const ErrorMessage = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: ${({ theme }) => theme.textSecondary};

  svg {
    font-size: 3rem;
    margin-bottom: 1rem;
    color: ${({ theme }) => theme.danger || "#dc3545"};
  }

  h3 {
    margin: 0 0 0.5rem 0;
    color: ${({ theme }) => theme.text};
  }

  p {
    margin: 0;
  }
`;

export default UserRoleManager;
