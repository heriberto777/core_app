// UserManagement.jsx
import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useAuth, User, ENV } from "../../index";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaPlus,
  FaSync,
  FaSearch,
  FaEye,
  FaEyeSlash,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaLock,
  FaCamera,
} from "react-icons/fa";

const userApi = new User();

export function UserManagement() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(true);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const pageSize = 10;

  // Cargar usuarios
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const requestData = {
        page,
        pageSize,
        active: activeFilter,
        busqueda: search.trim() || undefined,
      };

      const response = await userApi.getUsers(accessToken, requestData);

      if (response && response.code === 200) {
        setUsers(response.datos || []);
        setTotalUsers(response.totalUsuarios || 0);
      } else {
        throw new Error("Error al cargar usuarios");
      }
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
      Swal.fire("Error", "No se pudieron cargar los usuarios", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, pageSize, activeFilter, search]);

  useEffect(() => {
    if (accessToken) {
      loadUsers();
    }
  }, [loadUsers]);

  // Buscar usuarios con debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(1); // Reset page when searching
      loadUsers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [search]);

  // Formulario para crear/editar usuario
  const showUserForm = async (user = null) => {
    const isEdit = !!user;
    const title = isEdit ? "Editar Usuario" : "Nuevo Usuario";

    const { value: formValues } = await Swal.fire({
      title,
      html: `
        <div class="task-form-container">
          <div class="task-form-section">
            <h4 class="task-form-section-title">Información Personal</h4>
            
            <div class="task-form-group">
              <label class="task-form-label">Nombre *</label>
              <input id="name" class="task-form-input" value="${
                user?.name || ""
              }" placeholder="Nombre del usuario">
            </div>
            
            <div class="task-form-group">
              <label class="task-form-label">Apellido *</label>
              <input id="lastname" class="task-form-input" value="${
                user?.lastname || ""
              }" placeholder="Apellido del usuario">
            </div>
            
            <div class="task-form-group">
              <label class="task-form-label">Email *</label>
              <input id="email" type="email" class="task-form-input" value="${
                user?.email || ""
              }" placeholder="correo@ejemplo.com">
            </div>
            
            <div class="task-form-group">
              <label class="task-form-label">Teléfono</label>
              <input id="telefono" class="task-form-input" value="${
                user?.telefono || ""
              }" placeholder="Número de teléfono">
            </div>
          </div>

          <div class="task-form-section">
            <h4 class="task-form-section-title">Configuración de Cuenta</h4>
            
            <div class="task-form-group">
              <label class="task-form-label">Contraseña ${
                isEdit ? "(dejar vacío para no cambiar)" : "*"
              }</label>
              <div style="position: relative;">
                <input id="password" type="password" class="task-form-input" placeholder="${
                  isEdit ? "Nueva contraseña (opcional)" : "Contraseña"
                }">
                <button type="button" id="togglePassword" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer;">
                  <i class="fa fa-eye"></i>
                </button>
              </div>
            </div>
            
            <div class="task-form-group">
              <label class="task-form-label">Roles *</label>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 8px;">
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-admin" value="admin" ${
                    user?.role?.includes("admin") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-admin">Administrador</label>
                </div>
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-ventas" value="ventas" ${
                    user?.role?.includes("ventas") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-ventas">Ventas</label>
                </div>
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-almacen" value="almacen" ${
                    user?.role?.includes("almacen") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-almacen">Almacén</label>
                </div>
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-facturacion" value="facturacion" ${
                    user?.role?.includes("facturacion") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-facturacion">Facturación</label>
                </div>
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-contabilidad" value="contabilidad" ${
                    user?.role?.includes("contabilidad") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-contabilidad">Contabilidad</label>
                </div>
                <div class="task-form-checkbox-container">
                  <input type="checkbox" id="role-despacho" value="despacho" ${
                    user?.role?.includes("despacho") ? "checked" : ""
                  }>
                  <label class="task-form-checkbox-label" for="role-despacho">Despacho</label>
                </div>
              </div>
              <small class="task-form-help-text">Seleccione al menos un rol para el usuario</small>
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Avatar</label>
              <input id="avatar" type="file" accept="image/*" class="task-form-input">
              <small class="task-form-help-text">Formatos: JPG, PNG, GIF. Máximo 5MB</small>
            </div>

            <div class="task-form-checkbox-container">
              <input type="checkbox" id="active" ${
                user?.activo !== false ? "checked" : ""
              }>
              <label class="task-form-checkbox-label" for="active">Usuario Activo</label>
            </div>
          </div>
        </div>
      `,
      width: 700,
      showCancelButton: true,
      confirmButtonText: isEdit ? "Actualizar Usuario" : "Crear Usuario",
      cancelButtonText: "Cancelar",
      customClass: {
        popup: "task-modal-popup",
        title: "task-modal-title",
        htmlContainer: "task-modal-html",
        actions: "task-modal-actions",
      },
      didOpen: () => {
        // Toggle password visibility
        const toggleBtn = document.getElementById("togglePassword");
        const passwordInput = document.getElementById("password");

        toggleBtn?.addEventListener("click", () => {
          const type = passwordInput.type === "password" ? "text" : "password";
          passwordInput.type = type;
          toggleBtn.innerHTML = `<i class="fa fa-${
            type === "password" ? "eye" : "eye-slash"
          }"></i>`;
        });
      },
      preConfirm: () => {
        const name = document.getElementById("name").value;
        const lastname = document.getElementById("lastname").value;
        const email = document.getElementById("email").value;
        const telefono = document.getElementById("telefono").value;
        const password = document.getElementById("password").value;
        const active = document.getElementById("active").checked;
        const avatarFile = document.getElementById("avatar").files[0];

        // Validaciones
        if (!name.trim()) {
          Swal.showValidationMessage("El nombre es obligatorio");
          return false;
        }

        if (!lastname.trim()) {
          Swal.showValidationMessage("El apellido es obligatorio");
          return false;
        }

        if (!email.trim()) {
          Swal.showValidationMessage("El email es obligatorio");
          return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          Swal.showValidationMessage("Ingrese un email válido");
          return false;
        }

        if (!isEdit && !password.trim()) {
          Swal.showValidationMessage(
            "La contraseña es obligatoria para nuevos usuarios"
          );
          return false;
        }

        if (password && password.length < 6) {
          Swal.showValidationMessage(
            "La contraseña debe tener al menos 6 caracteres"
          );
          return false;
        }

        // Obtener roles seleccionados
        const roles = [];
        const roleCheckboxes = document.querySelectorAll(
          'input[type="checkbox"][id^="role-"]:checked'
        );
        roleCheckboxes.forEach((checkbox) => {
          roles.push(checkbox.value);
        });

        if (roles.length === 0) {
          Swal.showValidationMessage("Debe seleccionar al menos un rol");
          return false;
        }

        // Validar archivo si se seleccionó
        if (avatarFile) {
          if (avatarFile.size > 5 * 1024 * 1024) {
            Swal.showValidationMessage(
              "El archivo de avatar no puede ser mayor a 5MB"
            );
            return false;
          }

          const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
          ];
          if (!allowedTypes.includes(avatarFile.type)) {
            Swal.showValidationMessage(
              "Solo se permiten imágenes (JPG, PNG, GIF)"
            );
            return false;
          }
        }

        return {
          name: name.trim(),
          lastname: lastname.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          password: password.trim(),
          role: roles,
          active,
          fileAvatar: avatarFile,
        };
      },
    });

    if (formValues) {
      await saveUser(formValues, user?._id);
    }
  };

  // Guardar usuario (crear o actualizar)
  const saveUser = async (userData, userId = null) => {
    try {
      Swal.fire({
        title: userId ? "Actualizando usuario..." : "Creando usuario...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      let result;
      if (userId) {
        // Actualizar usuario existente
        result = await userApi.updateUser(accessToken, userId, userData);
      } else {
        // Crear nuevo usuario
        result = await userApi.createUser(accessToken, userData);
      }

      if (result.success) {
        Swal.fire(
          "¡Éxito!",
          `Usuario ${userId ? "actualizado" : "creado"} correctamente`,
          "success"
        );
        loadUsers(); // Recargar lista
      } else {
        throw new Error(result.msg || result.message || "Error desconocido");
      }
    } catch (error) {
      console.error("Error al guardar usuario:", error);
      Swal.fire(
        "Error",
        error.message ||
          `No se pudo ${userId ? "actualizar" : "crear"} el usuario`,
        "error"
      );
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (userId, userName) => {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar usuario?",
        text: `¿Está seguro de eliminar al usuario "${userName}"? Esta acción no se puede deshacer.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc3545",
        cancelButtonColor: "#6c757d",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        Swal.fire({
          title: "Eliminando usuario...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        const response = await userApi.deleteUser(accessToken, userId);

        if (response.success) {
          Swal.fire(
            "Eliminado",
            "El usuario ha sido eliminado correctamente",
            "success"
          );
          loadUsers(); // Recargar lista
        } else {
          throw new Error(response.msg || "Error al eliminar usuario");
        }
      }
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo eliminar el usuario",
        "error"
      );
    }
  };

  // Activar/Desactivar usuario
  const handleToggleUser = async (userId, currentStatus, userName) => {
    try {
      Swal.fire({
        title: `${currentStatus ? "Desactivando" : "Activando"} usuario...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await userApi.ActiveInactiveUser(accessToken, userId, {
        userData: !currentStatus,
      });

      if (response.success) {
        Swal.fire(
          "Estado actualizado",
          `El usuario "${userName}" ha sido ${
            currentStatus ? "desactivado" : "activado"
          }`,
          "success"
        );
        loadUsers(); // Recargar lista
      } else {
        throw new Error(response.msg || "Error al cambiar estado");
      }
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo cambiar el estado del usuario",
        "error"
      );
    }
  };

  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <Container>
      <Header>
        <h1>Gestión de Usuarios</h1>
        <p>Administra los usuarios del sistema</p>
      </Header>

      <ActionsBar>
        <SearchContainer>
          <FaSearch />
          <SearchInput
            type="text"
            placeholder="Buscar usuarios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchContainer>

        <FilterContainer>
          <FilterButton
            $active={activeFilter}
            onClick={() => setActiveFilter(true)}
          >
            Activos ({users.filter((u) => u.activo).length})
          </FilterButton>
          <FilterButton
            $active={!activeFilter}
            onClick={() => setActiveFilter(false)}
          >
            Inactivos ({users.filter((u) => !u.activo).length})
          </FilterButton>
        </FilterContainer>

        <ActionButtons>
          <Button onClick={() => showUserForm()}>
            <FaPlus /> Nuevo Usuario
          </Button>
          <RefreshButton onClick={loadUsers} disabled={loading}>
            <FaSync className={loading ? "spinning" : ""} />
          </RefreshButton>
        </ActionButtons>
      </ActionsBar>

      {loading ? (
        <LoadingMessage>Cargando usuarios...</LoadingMessage>
      ) : (
        <>
          {users.length === 0 ? (
            <EmptyMessage>
              No se encontraron usuarios{" "}
              {activeFilter ? "activos" : "inactivos"}.
            </EmptyMessage>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>Roles</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user._id}
                        className={!user.activo ? "disabled" : ""}
                      >
                        <td>
                          <UserInfo>
                            <UserAvatar>
                              {user.avatar ? (
                                <img
                                  src={`${ENV.BASE_PATH}/${user.avatar}`}
                                  alt="Avatar"
                                />
                              ) : (
                                <FaUser />
                              )}
                            </UserAvatar>
                            <div>
                              <UserName>
                                {user.name} {user.lastname}
                              </UserName>
                              <UserId>ID: {user._id}</UserId>
                            </div>
                          </UserInfo>
                        </td>
                        <td>{user.email}</td>
                        <td>{user.telefono || "-"}</td>
                        <td>
                          <RoleContainer>
                            {user.role?.map((role) => (
                              <RoleBadge key={role} $role={role}>
                                {role}
                              </RoleBadge>
                            ))}
                          </RoleContainer>
                        </td>
                        <td>
                          <StatusBadge $active={user.activo}>
                            {user.activo ? "Activo" : "Inactivo"}
                          </StatusBadge>
                        </td>
                        <td>
                          <ActionButtonsContainer>
                            <ActionButton
                              $color="#007bff"
                              onClick={() => showUserForm(user)}
                              title="Editar usuario"
                            >
                              <FaEdit />
                            </ActionButton>

                            <ActionButton
                              $color={user.activo ? "#ffc107" : "#28a745"}
                              onClick={() =>
                                handleToggleUser(
                                  user._id,
                                  user.activo,
                                  `${user.name} ${user.lastname}`
                                )
                              }
                              title={
                                user.activo
                                  ? "Desactivar usuario"
                                  : "Activar usuario"
                              }
                            >
                              {user.activo ? <FaToggleOn /> : <FaToggleOff />}
                            </ActionButton>

                            <ActionButton
                              $color="#dc3545"
                              onClick={() =>
                                handleDeleteUser(
                                  user._id,
                                  `${user.name} ${user.lastname}`
                                )
                              }
                              title="Eliminar usuario"
                            >
                              <FaTrash />
                            </ActionButton>
                          </ActionButtonsContainer>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>

              {totalPages > 1 && (
                <Pagination>
                  <PaginationButton
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    Anterior
                  </PaginationButton>

                  <PaginationInfo>
                    Página {page} de {totalPages} ({totalUsers} usuarios)
                  </PaginationInfo>

                  <PaginationButton
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    Siguiente
                  </PaginationButton>
                </Pagination>
              )}
            </>
          )}
        </>
      )}
    </Container>
  );
}

// Estilos
const Container = styled.div`
  padding: 20px;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h1 {
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary};
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  flex: 1;
  max-width: 400px;
  display: flex;
  align-items: center;

  svg {
    position: absolute;
    left: 12px;
    color: ${({ theme }) => theme.textSecondary};
    z-index: 1;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 10px 10px 40px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
  }
`;

const FilterContainer = styled.div`
  display: flex;
  gap: 10px;
`;

const FilterButton = styled.button`
  padding: 8px 16px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  background-color: ${({ $active, theme }) =>
    $active ? theme.primary : theme.cardBg};
  color: ${({ $active, theme }) => ($active ? "white" : theme.text)};
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background-color: ${({ theme }) => theme.primary};
    color: white;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover};
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: ${({ theme }) => theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: ${({ theme }) => theme.secondaryHover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const TableContainer = styled.div`
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background-color: ${({ theme }) => theme.cardBg};

  th,
  td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border};
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader};
    color: ${({ theme }) => theme.tableHeaderText};
    font-weight: 600;
  }

  tr:hover td {
    background-color: ${({ theme }) => theme.tableHover};
  }

  tr.disabled {
    opacity: 0.6;
    background-color: ${({ theme }) => theme.tableDisabled};
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.primary};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
`;

const UserName = styled.div`
  font-weight: 500;
  color: ${({ theme }) => theme.text};
`;

const UserId = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.textSecondary};
`;

const RoleContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const RoleBadge = styled.span`
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  color: white;
  background-color: ${({ $role }) => {
    const colors = {
      admin: "#dc3545",
      ventas: "#28a745",
      almacen: "#007bff",
      facturacion: "#ffc107",
      contabilidad: "#6f42c1",
      despacho: "#17a2b8",
    };
    return colors[$role] || "#6c757d";
  }};
`;

const StatusBadge = styled.span`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background-color: ${({ $active }) => ($active ? "#28a745" : "#dc3545")};
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  color: ${({ $color }) => $color};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
    transform: scale(1.1);
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 16px;
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 40px;
  background-color: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  color: ${({ theme }) => theme.textSecondary};
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 20px;
  background-color: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 10px;
  }
`;

const PaginationButton = styled.button`
  padding: 8px 16px;
  background-color: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.primaryHover};
  }

  &:disabled {
    background-color: ${({ theme }) => theme.secondary};
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const PaginationInfo = styled.div`
  color: ${({ theme }) => theme.text};
  font-weight: 500;
`;
