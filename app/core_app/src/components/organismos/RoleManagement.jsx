import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaUsers,
  FaShieldAlt,
  FaCrown,
  FaSearch,
  FaCopy,
} from "react-icons/fa";

import { useAuth, usePermissions, roleApi } from "../../index";
const cnnApi = new roleApi();

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableResources, setAvailableResources] = useState([]);
  const [availableActions, setAvailableActions] = useState([]);

  const { user, reloadUserPermissions } = useAuth();
  const { hasPermission } = usePermissions();
  const accessToken = localStorage.getItem("access");

  console.log(
    "🔑 Accediendo a RoleManagement con usuario:",
    user?.email,
    accessToken
  );
  // Verificar permisos
  const canCreate = hasPermission("roles", "create");
  const canUpdate = hasPermission("roles", "update");
  const canDelete = hasPermission("roles", "delete");
  const canRead = hasPermission("roles", "read");

  useEffect(() => {
    if (canRead) {
      loadRoles();
      loadAvailableResources();
      loadAvailableActions();
    }
  }, [canRead]);

  // ⭐ CARGAR ROLES ⭐
  const loadRoles = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const resp = await cnnApi.getRoles(accessToken, {
        page: 1,
        limit: 50,
        search: searchTerm,
        includeInactive: true,
      });

      console.log("🔄 Cargando roles...", resp);

      const data = await resp;
      console.log("🔄 Cargando roles...", data);
      if (data.success) {
        setRoles(data.data.roles);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error("Error cargando roles:", error);
      Swal.fire("Error", "No se pudieron cargar los roles", "error");
    } finally {
      setLoading(false);
    }
  };

  // ⭐ CARGAR RECURSOS DISPONIBLES ⭐
  const loadAvailableResources = async () => {
    try {
      const resp = await cnnApi.getAvailableResources(accessToken);

      const data = await resp;
      if (data.success) {
        setAvailableResources(data.data);
      }
    } catch (error) {
      console.error("Error cargando recursos:", error);
    }
  };

  // ⭐ CARGAR ACCIONES DISPONIBLES ⭐
  const loadAvailableActions = async () => {
    try {
      const resp = await cnnApi.getAvailableActions(accessToken);

      const data = await resp;
      if (data.success) {
        setAvailableActions(data.data);
      }
    } catch (error) {
      console.error("Error cargando acciones:", error);
    }
  };

  // ⭐ MOSTRAR FORMULARIO DE ROL ⭐
  const showRoleForm = async (role = null) => {
    const isEdit = !!role;

    const resourcesHTML = availableResources
      .map((resource) => {
        const resourcePermissions = role?.permissions?.find(
          (p) => p.resource === resource.id
        );
        const actionsHTML = resource.actions
          .map((action) => {
            const isChecked = resourcePermissions?.actions?.includes(action)
              ? "checked"
              : "";
            return `
              <label style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
                <input type="checkbox" value="${action}" ${isChecked}
                       data-resource="${resource.id}" style="margin: 0;">
                <span style="font-size: 13px;">${action.toUpperCase()}</span>
              </label>
            `;
          })
          .join("");

        return `
          <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 14px; font-weight: 600;">
              ${resource.name} (${resource.category})
            </h4>
            <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280;">
              ${resource.description}
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px;">
              ${actionsHTML}
            </div>
          </div>
        `;
      })
      .join("");

    const { value: formData } = await Swal.fire({
      title: isEdit ? "Editar Rol" : "Crear Nuevo Rol",
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nombre del rol *</label>
            <input id="roleName" class="swal2-input"
                   placeholder="ej: analista-ventas"
                   value="${role?.name || ""}"
                   style="margin: 0; width: 100%;"
                   ${role?.isSystem ? "disabled" : ""}>
            <small style="color: #6b7280; font-size: 12px;">Solo letras minúsculas, números y guiones</small>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nombre para mostrar *</label>
            <input id="roleDisplayName" class="swal2-input"
                   placeholder="ej: Analista de Ventas"
                   value="${role?.displayName || ""}"
                   style="margin: 0; width: 100%;"
                   ${role?.isSystem ? "disabled" : ""}>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Descripción</label>
            <textarea id="roleDescription" class="swal2-textarea"
                      placeholder="Descripción del rol..."
                      style="margin: 0; width: 100%; height: 60px;"
                      ${role?.isSystem ? "disabled" : ""}>${
        role?.description || ""
      }</textarea>
          </div>

          ${
            role?.isSystem
              ? `
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
              <strong style="color: #92400e;">⚠️ Rol del Sistema</strong>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #92400e;">
                Este es un rol del sistema y no puede ser editado.
              </p>
            </div>
          `
              : ""
          }

          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 10px; font-weight: 500; font-size: 16px;">
              Permisos del Rol *
            </label>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;">
              ${resourcesHTML}
            </div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: isEdit ? "💾 Actualizar" : "✨ Crear",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3b82f6",
      width: "700px",
      preConfirm: () => {
        const name = document.getElementById("roleName").value.trim();
        const displayName = document
          .getElementById("roleDisplayName")
          .value.trim();
        const description = document
          .getElementById("roleDescription")
          .value.trim();

        if (!name || !displayName) {
          Swal.showValidationMessage(
            "Nombre y nombre para mostrar son requeridos"
          );
          return false;
        }

        if (!/^[a-z0-9-_]+$/.test(name)) {
          Swal.showValidationMessage(
            "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"
          );
          return false;
        }

        // Recopilar permisos seleccionados
        const permissions = [];
        const checkboxes = document.querySelectorAll(
          'input[type="checkbox"]:checked'
        );

        checkboxes.forEach((checkbox) => {
          const resource = checkbox.dataset.resource;
          const action = checkbox.value;

          let resourcePermission = permissions.find(
            (p) => p.resource === resource
          );
          if (!resourcePermission) {
            resourcePermission = { resource, actions: [] };
            permissions.push(resourcePermission);
          }
          resourcePermission.actions.push(action);
        });

        if (permissions.length === 0) {
          Swal.showValidationMessage("Debe seleccionar al menos un permiso");
          return false;
        }

        return { name, displayName, description, permissions };
      },
    });

    if (formData) {
      await saveRole(formData, role?._id, isEdit);
    }
  };

  // ⭐ GUARDAR ROL ⭐
  const saveRole = async (roleData, roleId = null, isEdit = false) => {
    try {
      Swal.fire({
        title: roleId ? "Actualizando rol..." : "Creando rol...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });
      console.log("🔄 Editando ...", isEdit);
      const result = isEdit
        ? (resp = await cnnApi.updateRole(accessToken, roleId, roleData))
        : (resp = await cnnApi.createRole(accessToken, roleData));

      // const result = await resp;

      if (result.success) {
        Swal.fire("¡Éxito!", "Rol guardado correctamente", "success");
        loadRoles();

        // ⭐ RECARGAR PERMISOS ⭐
        if (reloadUserPermissions) {
          await reloadUserPermissions();
          console.log("🔄 Permisos recargados después de modificar rol");
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("Error guardando rol:", error);
      Swal.fire("Error", error.message || "Error al guardar el rol", "error");
    }
  };

  // ⭐ CAMBIAR ESTADO DE ROL ⭐
  const toggleRoleStatus = async (roleId, currentStatus) => {
    try {
      const resp = await cnnApi.toggleRoleStatus(
        accessToken,
        roleId,
        currentStatus
      );

      const result = await resp;
      if (result.success) {
        loadRoles();
        Swal.fire({
          icon: "success",
          title: `Rol ${!currentStatus ? "activado" : "desactivado"}`,
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      Swal.fire("Error", error.message || "Error al cambiar estado", "error");
    }
  };

  // ⭐ ELIMINAR ROL ⭐
  const deleteRole = async (roleId, roleName) => {
    const confirmDelete = await Swal.fire({
      title: "¿Eliminar rol?",
      text: `Esta acción eliminará permanentemente el rol "${roleName}"`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const resp = await cnnApi.removeRole(accessToken, roleId);

        const result = await resp;
        if (result.success) {
          loadRoles();
          Swal.fire("Eliminado", "El rol ha sido eliminado", "success");
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        Swal.fire("Error", error.message || "Error al eliminar", "error");
      }
    }
  };

  // ⭐ DUPLICAR ROL ⭐
  const duplicateRole = async (role) => {
    const { value: newNames } = await Swal.fire({
      title: `Duplicar rol: ${role.displayName}`,
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nuevo nombre:</label>
            <input id="newName" class="swal2-input"
                   placeholder="nuevo-nombre"
                   value="${role.name}-copia"
                   style="margin: 0; width: 100%;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nuevo nombre para mostrar:</label>
            <input id="newDisplayName" class="swal2-input"
                   placeholder="Nuevo Nombre"
                   value="${role.displayName} (Copia)"
                   style="margin: 0; width: 100%;">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Duplicar",
      preConfirm: () => {
        const newName = document.getElementById("newName").value.trim();
        const newDisplayName = document
          .getElementById("newDisplayName")
          .value.trim();

        if (!newName || !newDisplayName) {
          Swal.showValidationMessage("Ambos nombres son requeridos");
          return false;
        }

        return { newName, newDisplayName };
      },
    });

    if (newNames) {
      try {
        const resp = await cnnApi.duplicateRole(
          accessToken,
          role._id,
          newRoleData
        );
        console.log("🔄 Duplicando rol...", resp);
        const result = await resp;
        if (result.success) {
          loadRoles();
          Swal.fire(
            "¡Duplicado!",
            "El rol ha sido duplicado exitosamente",
            "success"
          );
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        Swal.fire("Error", error.message || "Error al duplicar rol", "error");
      }
    }
  };

  // ⭐ VER USUARIOS CON ROL ⭐
  const viewUsersWithRole = async (role) => {
    try {
      const resp = await cnnApi.getUsersByRole(role.name, accessToken);

      console.log("response", resp);

      const result = await resp;
      if (result.success) {
        const users = result.data.users;
        const usersHTML =
          users.length > 0
            ? users
                .map(
                  (user) => `
              <div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #e5e7eb;">
                <span>${user.name} ${user.lastname}</span>
                <span style="color: #6b7280;">${user.email}</span>
              </div>
            `
                )
                .join("")
            : '<p style="text-align: center; color: #6b7280;">No hay usuarios con este rol</p>';

        Swal.fire({
          title: `Usuarios con rol: ${role.displayName}`,
          html: `
            <div style="max-height: 400px; overflow-y: auto; text-align: left;">
             <div style="margin-bottom: 15px; padding: 10px; background: #f3f4f6; border-radius: 8px;">
               <strong>Total de usuarios: ${users.length}</strong>
             </div>
             ${usersHTML}
           </div>
         `,
          width: "600px",
          confirmButtonText: "Cerrar",
        });
      }
    } catch (error) {
      Swal.fire("Error", "No se pudieron cargar los usuarios", "error");
    }
  };

  // Filtrar roles
  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Si no tiene permisos de lectura
  if (!canRead) {
    return (
      <AccessDeniedContainer>
        <AccessDeniedIcon>🔒</AccessDeniedIcon>
        <AccessDeniedTitle>Acceso Denegado</AccessDeniedTitle>
        <AccessDeniedText>
          No tienes permisos para acceder a la gestión de roles.
        </AccessDeniedText>
      </AccessDeniedContainer>
    );
  }

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <Title>Gestión de Roles</Title>
          <Subtitle>
            Administra roles y permisos del sistema ({filteredRoles.length}{" "}
            roles)
          </Subtitle>
        </HeaderLeft>

        <HeaderActions>
          {canCreate && (
            <CreateButton onClick={() => showRoleForm()}>
              <FaPlus />
              Crear Rol
            </CreateButton>
          )}
        </HeaderActions>
      </Header>

      <ControlsSection>
        <SearchContainer>
          <SearchIcon>
            <FaSearch />
          </SearchIcon>
          <SearchInput
            type="text"
            placeholder="Buscar roles por nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchContainer>
      </ControlsSection>

      {loading ? (
        <LoadingContainer>
          <div className="spinner"></div>
          <span>Cargando roles...</span>
        </LoadingContainer>
      ) : filteredRoles.length === 0 ? (
        <EmptyState>
          <FaShieldAlt size={48} />
          <h3>No hay roles disponibles</h3>
          <p>
            {searchTerm
              ? "No se encontraron roles con el término de búsqueda"
              : "No se han creado roles aún"}
          </p>
          {canCreate && !searchTerm && (
            <CreateButton onClick={() => showRoleForm()}>
              <FaPlus />
              Crear Primer Rol
            </CreateButton>
          )}
        </EmptyState>
      ) : (
        <RolesList>
          {filteredRoles.map((role) => (
            <RoleCard key={role._id} $isSystem={role.isSystem}>
              <RoleHeader>
                <RoleInfo>
                  <RoleName>
                    {role.isSystem && <FaCrown />}
                    {role.displayName}
                  </RoleName>
                  <RoleDetails>
                    <RoleId>ID: {role.name}</RoleId>
                    <RoleDescription>
                      {role.description || "Sin descripción"}
                    </RoleDescription>
                  </RoleDetails>
                  <RoleMeta>
                    <MetaItem>
                      <FaShieldAlt />
                      {role.permissionCount || 0} permisos
                    </MetaItem>
                    <MetaItem>
                      <FaUsers />
                      {role.userCount || 0} usuarios
                    </MetaItem>
                    {role.isSystem && (
                      <SystemBadge>
                        <FaCrown />
                        Sistema
                      </SystemBadge>
                    )}
                  </RoleMeta>
                </RoleInfo>

                <RoleStatus>
                  <StatusIndicator $isActive={role.isActive}>
                    {role.isActive ? "Activo" : "Inactivo"}
                  </StatusIndicator>
                </RoleStatus>
              </RoleHeader>

              <RoleActions>
                <ActionButton
                  color="#3b82f6"
                  onClick={() => viewUsersWithRole(role)}
                  title="Ver usuarios con este rol"
                >
                  <FaUsers />
                  Usuarios
                </ActionButton>

                {!role.isSystem && (
                  <ActionButton
                    color="#8b5cf6"
                    onClick={() => duplicateRole(role)}
                    title="Duplicar rol"
                  >
                    <FaCopy />
                    Duplicar
                  </ActionButton>
                )}

                {canUpdate && (
                  <StatusToggle
                    onClick={() => toggleRoleStatus(role._id, role.isActive)}
                    $isActive={role.isActive}
                    title={`${role.isActive ? "Desactivar" : "Activar"} rol`}
                    disabled={role.isSystem}
                  >
                    {role.isActive ? <FaToggleOn /> : <FaToggleOff />}
                  </StatusToggle>
                )}

                {canUpdate && (
                  <ActionButton
                    color="#10b981"
                    onClick={() => showRoleForm(role)}
                    title="Editar rol"
                  >
                    <FaEdit />
                    Editar
                  </ActionButton>
                )}

                {canDelete && !role.isSystem && role.userCount === 0 && (
                  <ActionButton
                    color="#ef4444"
                    onClick={() => deleteRole(role._id, role.displayName)}
                    title="Eliminar rol"
                  >
                    <FaTrash />
                    Eliminar
                  </ActionButton>
                )}
              </RoleActions>
            </RoleCard>
          ))}
        </RolesList>
      )}
    </Container>
  );
};

// 🎨 STYLED COMPONENTS

const Container = styled.div`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
  }
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: ${({ theme }) => theme.text};
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.textSecondary};
  margin: 0;
`;

const CreateButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: ${({ theme }) => theme.primary};
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.primaryHover};
    transform: translateY(-1px);
  }
`;

const ControlsSection = styled.section`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  flex: 1;
  max-width: 400px;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.textSecondary};
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 12px 12px 40px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: ${({ theme }) => theme.textSecondary};

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid ${({ theme }) => theme.border};
    border-top: 3px solid ${({ theme }) => theme.primary};
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary};

  h3 {
    margin: 16px 0 8px 0;
    color: ${({ theme }) => theme.text};
  }

  p {
    margin: 0 0 24px 0;
    max-width: 400px;
  }
`;

const AccessDeniedContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 40px;
`;

const AccessDeniedIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const AccessDeniedTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.text};
  margin: 0 0 12px 0;
`;

const AccessDeniedText = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.textSecondary};
  max-width: 400px;
  line-height: 1.5;
  margin: 0;
`;

const RolesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const RoleCard = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid
    ${({ theme, $isSystem }) =>
      $isSystem ? theme.warning || "#f59e0b" : theme.border};
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: ${({ theme }) => theme.primary};
  }

  ${({ $isSystem, theme }) =>
    $isSystem &&
    `
   background: ${theme.warningAlpha || "rgba(245, 158, 11, 0.05)"};
 `}
`;

const RoleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
  }
`;

const RoleInfo = styled.div`
  flex: 1;
`;

const RoleName = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: ${({ theme }) => theme.text};

  svg {
    color: ${({ theme }) => theme.warning || "#f59e0b"};
  }
`;

const RoleDetails = styled.div`
  margin-bottom: 12px;
`;

const RoleId = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.textSecondary};
  font-family: monospace;
  margin-bottom: 4px;
`;

const RoleDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary};
  margin: 0;
  line-height: 1.4;
`;

const RoleMeta = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.textSecondary};

  svg {
    font-size: 14px;
  }
`;

const SystemBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  background: ${({ theme }) => theme.warning || "#f59e0b"};
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
`;

const RoleStatus = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const StatusIndicator = styled.div`
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;

  background: ${({ $isActive, theme }) =>
    $isActive
      ? theme.successAlpha || "rgba(16, 185, 129, 0.1)"
      : theme.grayAlpha || "rgba(107, 114, 128, 0.1)"};
  color: ${({ $isActive, theme }) =>
    $isActive ? theme.success || "#10b981" : theme.textSecondary};
`;

const RoleActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    justify-content: flex-end;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: ${({ color }) => color}15;
  color: ${({ color }) => color};
  border: 1px solid ${({ color }) => color}40;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ color }) => color};
    color: white;
    transform: translateY(-1px);
  }
`;

const StatusToggle = styled.button`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: none;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  cursor: pointer;
  color: ${({ $isActive, theme }) =>
    $isActive ? theme.success || "#10b981" : theme.textSecondary};
  font-size: 16px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.bgSecondary};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export default RoleManagement;
