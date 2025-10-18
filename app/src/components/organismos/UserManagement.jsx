import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaUser,
  FaEnvelope,
  FaShieldAlt,
  FaCrown,
  FaSearch,
  FaEye,
} from "react-icons/fa";

import { useAuth, usePermissions } from "../../index";
import { User, roleApi } from "../../api/index";

const userApi = new User();
const cnnRolApi = new roleApi();

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableRoles, setAvailableRoles] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalUsers: 0,
    limit: 10,
  });

  const { user: currentUser, accessToken, reloadUserPermissions } = useAuth();
  const { hasPermission } = usePermissions();

  // Verificar permisos
  const canCreate = hasPermission("users", "create");
  const canUpdate = hasPermission("users", "update");
  const canDelete = hasPermission("users", "delete");
  const canRead = hasPermission("users", "read");

  useEffect(() => {
    if (canRead && accessToken) {
      loadUsers();
      loadAvailableRoles();
    }
  }, [canRead, accessToken, pagination.currentPage]);

  // ⭐ CARGAR USUARIOS USANDO userApi ⭐
  const loadUsers = async () => {
    if (!accessToken) return;

    setLoading(true);
    try {
      const response = await userApi.getUsersWithRoles(accessToken, {
        page: pagination.currentPage,
        limit: pagination.limit,
        search: searchTerm,
      });

      if (response && response.success) {
        setUsers(response.data?.users || response.users || []);

        // Actualizar paginación si viene en la respuesta
        if (response.data?.pagination || response.pagination) {
          setPagination((prev) => ({
            ...prev,
            ...(response.data?.pagination || response.pagination),
          }));
        }
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
  const loadAvailableRoles = async () => {
    if (!accessToken) return;

    try {
      const resp = await cnnRolApi.getAvailableRoles(accessToken);

      const data = await resp;
      if (data.success) {
        setAvailableRoles(data.data);
      }
    } catch (error) {
      console.error("Error cargando roles:", error);
    }
  };

  // ⭐ MOSTRAR FORMULARIO DE USUARIO ⭐
  const showUserForm = async (user = null) => {
    const isEdit = !!user;

    const rolesOptions = availableRoles
      .map(
        (role) => `
        <option value="${role._id}" ${
          user?.rolesInfo?.some((userRole) => userRole._id === role._id)
            ? "selected"
            : ""
        }>
          ${role.displayName}
        </option>
      `
      )
      .join("");

    const { value: formValues } = await Swal.fire({
      title: isEdit ? "Editar Usuario" : "Crear Usuario",
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Nombre:</label>
            <input id="name" class="swal2-input" placeholder="Nombre" value="${
              user?.name || ""
            }" style="margin: 0;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Apellido:</label>
            <input id="lastname" class="swal2-input" placeholder="Apellido" value="${
              user?.lastname || ""
            }" style="margin: 0;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Email:</label>
            <input id="email" class="swal2-input" type="email" placeholder="Email" value="${
              user?.email || ""
            }" style="margin: 0;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Teléfono:</label>
            <input id="telefono" class="swal2-input" placeholder="Teléfono" value="${
              user?.telefono || ""
            }" style="margin: 0;">
          </div>

          ${
            !isEdit
              ? `
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Contraseña:</label>
              <input id="password" class="swal2-input" type="password" placeholder="Contraseña" style="margin: 0;">
            </div>
          `
              : ""
          }

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Roles:</label>
            <select id="roles" class="swal2-input" multiple style="margin: 0; height: 120px;">
              ${rolesOptions}
            </select>
            <small style="color: #666;">Mantén Ctrl/Cmd presionado para seleccionar múltiples roles</small>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem;">
              <input id="isAdmin" type="checkbox" ${
                user?.isAdmin ? "checked" : ""
              }>
              <span style="font-weight: 600;">Administrador del sistema</span>
            </label>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isEdit ? "Actualizar" : "Crear",
      cancelButtonText: "Cancelar",
      width: "500px",
      preConfirm: () => {
        const name = document.getElementById("name").value;
        const lastname = document.getElementById("lastname").value;
        const email = document.getElementById("email").value;
        const telefono = document.getElementById("telefono").value;
        const password = document.getElementById("password")?.value;
        const roles = Array.from(
          document.getElementById("roles").selectedOptions
        ).map((option) => option.value);
        const isAdmin = document.getElementById("isAdmin").checked;

        if (!name || !lastname || !email) {
          Swal.showValidationMessage("Nombre, apellido y email son requeridos");
          return false;
        }

        if (!isEdit && !password) {
          Swal.showValidationMessage(
            "La contraseña es requerida para nuevos usuarios"
          );
          return false;
        }

        return { name, lastname, email, telefono, password, roles, isAdmin };
      },
    });

    if (formValues) {
      if (isEdit) {
        await updateUser(user._id, formValues);
      } else {
        await createUser(formValues);
      }
    }
  };

  // ⭐ CREAR USUARIO USANDO userApi ⭐
  const createUser = async (userData) => {
    try {
      setLoading(true);

      const response = await userApi.createUser(accessToken, userData);

      if (response && response.success) {
        Swal.fire("¡Éxito!", "Usuario creado correctamente", "success");
        await loadUsers();
      } else {
        throw new Error(response?.message || "Error creando usuario");
      }
    } catch (error) {
      console.error("Error creando usuario:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo crear el usuario",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ⭐ ACTUALIZAR USUARIO USANDO userApi ⭐
  const updateUser = async (userId, userData) => {
    try {
      setLoading(true);

      // Separar roles del resto de datos
      const { roles, ...userDataWithoutRoles } = userData;

      // Actualizar datos básicos del usuario
      const updateResponse = await userApi.updateUser(
        accessToken,
        userId,
        userDataWithoutRoles
      );

      if (!updateResponse || !updateResponse.success) {
        throw new Error(
          updateResponse?.message || "Error actualizando usuario"
        );
      }

      // Actualizar roles si se proporcionaron
      if (roles && roles.length >= 0) {
        const rolesResponse = await userApi.updateUserRoles(
          accessToken,
          userId,
          roles
        );

        if (!rolesResponse || !rolesResponse.success) {
          console.warn("Error actualizando roles:", rolesResponse?.message);
        }
      }

      Swal.fire("¡Éxito!", "Usuario actualizado correctamente", "success");
      await loadUsers();

      // Recargar permisos si es el usuario actual
      if (userId === currentUser._id) {
        await reloadUserPermissions();
      }
    } catch (error) {
      console.error("Error actualizando usuario:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo actualizar el usuario",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ⭐ TOGGLE ACTIVO/INACTIVO USANDO userApi ⭐
  const toggleUserStatus = async (userId, currentStatus) => {
    const action = currentStatus ? "desactivar" : "activar";

    const result = await Swal.fire({
      title: `¿${action.charAt(0).toUpperCase() + action.slice(1)} usuario?`,
      text: `¿Estás seguro de que deseas ${action} este usuario?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        setLoading(true);

        const response = await userApi.ActiveInactiveUser(accessToken, userId, {
          activo: !currentStatus,
        });

        if (response && response.success) {
          Swal.fire("¡Éxito!", `Usuario ${action}do correctamente`, "success");
          await loadUsers();
        } else {
          throw new Error(response?.message || `Error ${action}ndo usuario`);
        }
      } catch (error) {
        console.error(`Error ${action}ndo usuario:`, error);
        Swal.fire("Error", `No se pudo ${action} el usuario`, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // ⭐ ELIMINAR USUARIO USANDO userApi ⭐
  const deleteUser = async (userId, userName) => {
    const result = await Swal.fire({
      title: "¿Eliminar usuario?",
      text: `¿Estás seguro de que deseas eliminar a ${userName}? Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      try {
        setLoading(true);

        const response = await userApi.deleteUser(accessToken, userId);

        if (response && response.success) {
          Swal.fire(
            "¡Eliminado!",
            "Usuario eliminado correctamente",
            "success"
          );
          await loadUsers();
        } else {
          throw new Error(response?.message || "Error eliminando usuario");
        }
      } catch (error) {
        console.error("Error eliminando usuario:", error);
        Swal.fire("Error", "No se pudo eliminar el usuario", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // ⭐ VER DETALLES DEL USUARIO ⭐
  const viewUserDetails = async (user) => {
    const rolesText =
      user.roles && user.roles.length > 0
        ? user.roles
            .map(
              (role) =>
                `<span style="background: ${
                  role.isActive ? "#28a745" : "#6c757d"
                }; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; margin-right: 4px;">${
                  role.displayName
                }</span>`
            )
            .join(" ")
        : "<em>Sin roles asignados</em>";

    await Swal.fire({
      title: "Detalles del Usuario",
      html: `
        <div style="text-align: left; padding: 1rem;">
          <div style="margin-bottom: 1rem;">
            <strong>Nombre completo:</strong><br>
            ${user.name} ${user.lastname}
          </div>

          <div style="margin-bottom: 1rem;">
            <strong>Email:</strong><br>
            ${user.email}
          </div>

          <div style="margin-bottom: 1rem;">
            <strong>Teléfono:</strong><br>
            ${user.telefono || "No especificado"}
          </div>

          <div style="margin-bottom: 1rem;">
            <strong>Estado:</strong><br>
            <span style="color: ${user.activo ? "#28a745" : "#dc3545"};">
              ${user.activo ? "✅ Activo" : "❌ Inactivo"}
            </span>
          </div>

          <div style="margin-bottom: 1rem;">
            <strong>Administrador:</strong><br>
            <span style="color: ${user.isAdmin ? "#f39c12" : "#6c757d"};">
              ${user.isAdmin ? "👑 Sí" : "👤 No"}
            </span>
          </div>

          <div style="margin-bottom: 1rem;">
            <strong>Roles asignados:</strong><br>
            ${rolesText}
          </div>

          <div>
            <strong>Fecha de registro:</strong><br>
            ${
              user.createdAt
                ? new Date(user.createdAt).toLocaleString()
                : "No disponible"
            }
          </div>
        </div>
      `,
      width: "500px",
      confirmButtonText: "Cerrar",
    });
  };

  // ⭐ FILTRAR USUARIOS ⭐
  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  console.log("🎯 Usuarios filtrados:", filteredUsers);

  if (!canRead) {
    return (
      <Container>
        <ErrorMessage>
          <FaShieldAlt />
          <h3>Sin permisos</h3>
          <p>No tienes permisos para gestionar usuarios.</p>
        </ErrorMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <TitleSection>
          <h2>
            <FaUser /> Gestión de Usuarios
          </h2>
          <p>Administra los usuarios del sistema</p>
        </TitleSection>

        <ActionsSection>
          {canCreate && (
            <button onClick={() => showUserForm()} disabled={loading}>
              <FaPlus /> Nuevo Usuario
            </button>
          )}
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

        <StatsInfo>Total: {filteredUsers.length} usuario(s)</StatsInfo>
      </FilterSection>

      <UsersTable>
        <TableHeader>
          <th>Usuario</th>
          <th>Email</th>
          <th>Roles</th>
          <th>Estado</th>
          <th>Acciones</th>
        </TableHeader>
        <tbody>
          {filteredUsers.map((user) => (
            <TableRow key={user._id}>
              <UserCell>
                <UserAvatar>
                  {user.name?.charAt(0)?.toUpperCase() || "U"}
                </UserAvatar>
                <UserInfo>
                  <UserName>
                    {user.name} {user.lastname}
                    {user.isAdmin && <FaCrown className="admin-icon" />}
                  </UserName>
                  <UserMeta>ID: {user._id}</UserMeta>
                </UserInfo>
              </UserCell>

              <td>{user.email}</td>

              <RolesCell>
                {user.roles && user.roles.length > 0 ? (
                  user.roles.slice(0, 2).map((role) => (
                    <RoleTag key={role._id} active={role.isActive}>
                      {role.displayName}
                    </RoleTag>
                  ))
                ) : (
                  <EmptyRoles>Sin roles</EmptyRoles>
                )}
                {user.roles && user.roles.length > 2 && (
                  <MoreRoles>+{user.roles.length - 2}</MoreRoles>
                )}
              </RolesCell>

              <StatusCell>
                <StatusBadge active={user.activo}>
                  {user.activo ? "Activo" : "Inactivo"}
                </StatusBadge>
              </StatusCell>

              <ActionsCell>
                <ActionButton
                  onClick={() => viewUserDetails(user)}
                  title="Ver detalles"
                >
                  <FaEye />
                </ActionButton>

                {canUpdate && (
                  <ActionButton
                    onClick={() => showUserForm(user)}
                    title="Editar"
                  >
                    <FaEdit />
                  </ActionButton>
                )}

                {canUpdate && (
                  <ActionButton
                    onClick={() => toggleUserStatus(user._id, user.activo)}
                    title={user.activo ? "Desactivar" : "Activar"}
                    className={user.activo ? "warning" : "success"}
                  >
                    {user.activo ? <FaToggleOn /> : <FaToggleOff />}
                  </ActionButton>
                )}

                {canDelete && user._id !== currentUser._id && (
                  <ActionButton
                    onClick={() =>
                      deleteUser(user._id, `${user.name} ${user.lastname}`)
                    }
                    title="Eliminar"
                    className="danger"
                  >
                    <FaTrash />
                  </ActionButton>
                )}
              </ActionsCell>
            </TableRow>
          ))}
        </tbody>
      </UsersTable>

      {filteredUsers.length === 0 && !loading && (
        <EmptyState>
          <FaUser />
          <h3>No se encontraron usuarios</h3>
          <p>Intenta con otros términos de búsqueda o crea un nuevo usuario</p>
        </EmptyState>
      )}

      {loading && (
        <LoadingState>
          <div>Cargando usuarios...</div>
        </LoadingState>
      )}
    </Container>
  );
};

// ⭐ STYLED COMPONENTS ⭐
const Container = styled.div`
  padding: 2rem;
  max-width: 1400px;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchBox = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 400px;

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

const StatsInfo = styled.div`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.9rem;
  font-weight: 500;
`;

const UsersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.cardBg || theme.bg};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const TableHeader = styled.thead`
  background: ${({ theme }) => theme.headerBg || theme.primary};
  color: white;

  th {
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.9rem;
  }
`;

const TableRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};

  &:hover {
    background: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }

  td {
    padding: 1rem;
    vertical-align: middle;
  }
`;

const UserCell = styled.td`
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
  font-size: 1rem;
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
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

const UserMeta = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.textSecondary};
`;

const RolesCell = styled.td`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
`;

const RoleTag = styled.span`
  padding: 0.2rem 0.6rem;
  background: ${({ active, theme }) =>
    active ? theme.primary || "#007bff" : theme.textSecondary || "#6c757d"};
  color: white;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 500;
  opacity: ${({ active }) => (active ? 1 : 0.6)};
`;

const EmptyRoles = styled.span`
  color: ${({ theme }) => theme.textSecondary};
  font-style: italic;
  font-size: 0.8rem;
`;

const MoreRoles = styled.span`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.75rem;
  font-weight: 500;
`;

const StatusCell = styled.td``;

const StatusBadge = styled.span`
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  background: ${({ active, theme }) =>
    active ? theme.success || "#28a745" : theme.danger || "#dc3545"};
  color: white;
`;

const ActionsCell = styled.td`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  background: ${({ theme }) => theme.secondary || "#6c757d"};
  color: white;
  border: none;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &.success {
    background: ${({ theme }) => theme.success || "#28a745"};
  }

  &.warning {
    background: ${({ theme }) => theme.warning || "#ffc107"};
  }

  &.danger {
    background: ${({ theme }) => theme.danger || "#dc3545"};
  }
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

const LoadingState = styled.div`
  text-align: center;
  padding: 2rem;
  color: ${({ theme }) => theme.textSecondary};
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

export default UserManagement;
