// components/admin/ModuleManager.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaCog,
  FaEye,
  FaSave,
  FaTimes,
  FaCheck,
  FaBan,
  FaSync,
  FaSearch,
  FaFilter,
  FaCopy,
  FaDownload,
  FaUpload,
  FaShieldAlt,
  FaExclamationTriangle,
  FaInfoCircle,
  FaChevronDown,
  FaChevronUp,
  FaCode,
  FaFileImport,
  FaFileExport,
  FaTools,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";

import {
  useAuth,
  usePermissions,
  ProtectedComponent,
  ActionButton,
  Pagination,
  moduleApi,
  roleApi,
} from "../../index";
import { Badge, Spinner } from "./UIComponents";

// ⭐ INSTANCIAR API ⭐
const cnnmoduleApi = new moduleApi();
const cnnRoleApi = new roleApi();

const ModuleManager = () => {
  // ⭐ HOOKS DE AUTENTICACIÓN Y PERMISOS ⭐
  const { user, accessToken } = useAuth();
  const { hasPermission, isAdmin, getModulePermissions, reloadModuleConfig } =
    usePermissions();

  // ⭐ VERIFICAR PERMISOS ⭐
  const modulePerms = useMemo(() => {
    return getModulePermissions("modules");
  }, [getModulePermissions]);

  console.log("Tenemos permisos", modulePerms);

  // ⭐ ESTADOS PRINCIPALES ⭐
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [availableActions, setAvailableActions] = useState([]);
  const [categories, setCategories] = useState([]);

  // ⭐ ESTADOS DE FILTROS Y BÚSQUEDA ⭐
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [includeSystem, setIncludeSystem] = useState(true);

  // ⭐ ESTADOS DE PAGINACIÓN ⭐
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0,
    limit: 12,
  });

  // ⭐ ESTADOS DE FORMULARIO ⭐
  const [showForm, setShowForm] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [formData, setFormData] = useState(getDefaultFormData());
  const [formErrors, setFormErrors] = useState({});

  // ⭐ ESTADOS DE UI ⭐
  const [selectedModules, setSelectedModules] = useState([]);
  const [expandedModule, setExpandedModule] = useState(null);
  const [sortBy, setSortBy] = useState("uiConfig.order");
  const [sortOrder, setSortOrder] = useState("asc");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // ⭐ VERIFICACIÓN DE ACCESO INICIAL ⭐
  if (!modulePerms.canAccess) {
    return (
      <AccessDeniedContainer>
        <FaShieldAlt size={64} color="#dc3545" />
        <h2>Acceso Denegado</h2>
        <p>No tienes permisos para acceder al módulo de gestión de módulos.</p>
        <p>Se requieren privilegios de administrador.</p>
      </AccessDeniedContainer>
    );
  }

  // ⭐ CARGAR DATOS INICIALES ⭐
  useEffect(() => {
    if (modulePerms.canAccess && accessToken) {
      loadModules();
      loadAvailableActions();
      loadCategories();
    }
  }, [modulePerms.canAccess, accessToken]);

  // ⭐ EFECTO PARA FILTROS Y PAGINACIÓN ⭐
  useEffect(() => {
    if (modulePerms.canAccess && accessToken) {
      loadModules();
    }
  }, [
    pagination.current,
    filterCategory,
    filterStatus,
    includeSystem,
    searchTerm,
    sortBy,
    sortOrder,
  ]);

  // ⭐ FUNCIÓN PARA CARGAR MÓDULOS ⭐
  const loadModules = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    try {
      const params = {
        page: pagination.current,
        limit: pagination.limit,
        category: filterCategory,
        active: filterStatus,
        includeSystem: includeSystem.toString(),
        search: searchTerm,
        sortBy,
        sortOrder,
      };

      const response = await cnnmoduleApi.getAllModules(accessToken, params);

      if (response.success) {
        setModules(response.data || []);
        setPagination((prev) => ({
          ...prev,
          ...response.pagination,
        }));
      } else {
        throw new Error(response.message || "Error cargando módulos");
      }
    } catch (error) {
      console.error("Error cargando módulos:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudieron cargar los módulos",
      });
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    pagination.current,
    pagination.limit,
    filterCategory,
    filterStatus,
    includeSystem,
    searchTerm,
    sortBy,
    sortOrder,
  ]);

  // ⭐ CARGAR ACCIONES DISPONIBLES ⭐
  const loadAvailableActions = useCallback(async () => {
    if (!accessToken) return;

    try {
      const response = await cnnmoduleApi.getAvailableActions(accessToken);
      if (response.success) {
        setAvailableActions(response.data || []);
      }
    } catch (error) {
      console.error("Error cargando acciones:", error);
    }
  }, [accessToken]);

  // ⭐ CARGAR CATEGORÍAS ⭐
  const loadCategories = useCallback(async () => {
    if (!accessToken) return;

    try {
      const response = await cnnmoduleApi.getCategories(accessToken);
      if (response.success) {
        setCategories(response.data || []);
      }
    } catch (error) {
      console.error("Error cargando categorías:", error);
    }
  }, [accessToken]);

  // ⭐ FUNCIONES DE UTILIDAD PARA LOADING ⭐
  const setModuleLoading = (moduleId, isLoading) => {
    setActionLoading((prev) => ({
      ...prev,
      [moduleId]: isLoading,
    }));
  };

  // ⭐ MOSTRAR FORMULARIO ⭐
  const showModuleForm = useCallback(
    (module = null) => {
      if (module && !modulePerms.canUpdate) {
        Swal.fire({
          icon: "error",
          title: "Sin Permisos",
          text: "No tienes permisos para editar módulos.",
        });
        return;
      }

      if (!module && !modulePerms.canCreate) {
        Swal.fire({
          icon: "error",
          title: "Sin Permisos",
          text: "No tienes permisos para crear módulos.",
        });
        return;
      }

      if (module) {
        setEditingModule(module);
        setFormData({
          ...module,
          actions: module.actions || [],
        });
      } else {
        setEditingModule(null);
        setFormData(getDefaultFormData());
      }
      setFormErrors({});
      setShowForm(true);
    },
    [modulePerms.canCreate, modulePerms.canUpdate]
  );

  // ⭐ GUARDAR MÓDULO ⭐
  const saveModule = useCallback(async () => {
    if (!accessToken) return;

    // Validar formulario
    const errors = validateFormData(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      Swal.fire({
        icon: "error",
        title: "Errores en el formulario",
        text: "Por favor corrige los errores antes de continuar",
      });
      return;
    }

    try {
      setLoading(true);

      let response;
      if (editingModule) {
        response = await cnnmoduleApi.updateModule(
          accessToken,
          editingModule._id,
          formData
        );
      } else {
        response = await cnnmoduleApi.createModule(accessToken, formData);
      }

      if (response.success) {
        await Swal.fire({
          icon: "success",
          title: "Éxito",
          text: response.message,
          timer: 2000,
          showConfirmButton: false,
        });

        setShowForm(false);
        setEditingModule(null);
        setFormData(getDefaultFormData());
        await loadModules();

        // Recargar configuración del sistema
        await reloadModuleConfig();
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error("Error guardando módulo:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al guardar el módulo",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, editingModule, formData, loadModules, reloadModuleConfig]);

  // ⭐ ELIMINAR MÓDULO ⭐
  const deleteModule = useCallback(
    async (module) => {
      if (!modulePerms.canDelete) {
        Swal.fire({
          icon: "error",
          title: "Sin Permisos",
          text: "No tienes permisos para eliminar módulos.",
        });
        return;
      }

      if (module.isSystem) {
        Swal.fire({
          icon: "warning",
          title: "No Permitido",
          text: "No se pueden eliminar módulos del sistema.",
        });
        return;
      }

      const result = await Swal.fire({
        title: `¿Eliminar módulo "${module.displayName}"?`,
        text: "Esta acción no se puede deshacer y puede afectar el funcionamiento del sistema",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc3545",
        input: "text",
        inputPlaceholder: `Escribe "${module.name}" para confirmar`,
        inputValidator: (value) => {
          if (value !== module.name) {
            return "Debes escribir el nombre exacto del módulo para confirmar";
          }
        },
      });

      if (!result.isConfirmed) return;

      try {
        setModuleLoading(module._id, true);
        const response = await cnnmoduleApi.deleteModule(
          accessToken,
          module._id
        );

        if (response.success) {
          await Swal.fire({
            icon: "success",
            title: "Eliminado",
            text: response.message,
            timer: 2000,
            showConfirmButton: false,
          });

          await loadModules();
          await reloadModuleConfig();
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        console.error("Error eliminando módulo:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "Error al eliminar el módulo",
        });
      } finally {
        setModuleLoading(module._id, false);
      }
    },
    [accessToken, modulePerms.canDelete, loadModules, reloadModuleConfig]
  );

  // ⭐ CAMBIAR ESTADO DEL MÓDULO ⭐
  const toggleModuleStatus = useCallback(
    async (module) => {
      if (!modulePerms.canUpdate) {
        Swal.fire({
          icon: "error",
          title: "Sin Permisos",
          text: "No tienes permisos para cambiar el estado de módulos.",
        });
        return;
      }

      if (module.isSystem && module.name === "dashboard" && module.isActive) {
        Swal.fire({
          icon: "warning",
          title: "No Permitido",
          text: "No se puede desactivar el módulo dashboard ya que es crítico para el sistema.",
        });
        return;
      }

      try {
        setModuleLoading(module._id, true);
        const response = await cnnmoduleApi.toggleModuleStatus(
          accessToken,
          module._id
        );

        if (response.success) {
          await loadModules();
          await reloadModuleConfig();

          const action = response.data?.isActive ? "activado" : "desactivado";
          Swal.fire({
            icon: "success",
            title: `Módulo ${action}`,
            timer: 1500,
            showConfirmButton: false,
          });
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        console.error("Error cambiando estado:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "Error al cambiar el estado del módulo",
        });
      } finally {
        setModuleLoading(module._id, false);
      }
    },
    [accessToken, modulePerms.canUpdate, loadModules, reloadModuleConfig]
  );

  // ⭐ DUPLICAR MÓDULO ⭐
  const duplicateModule = useCallback(
    async (module) => {
      if (!modulePerms.canCreate) {
        Swal.fire({
          icon: "error",
          title: "Sin Permisos",
          text: "No tienes permisos para crear módulos.",
        });
        return;
      }

      const { value: formValues } = await Swal.fire({
        title: `Duplicar módulo "${module.displayName}"`,
        html: `
        <div style="text-align: left; margin: 1rem 0;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Nuevo Nombre:</label>
          <input id="newName" class="swal2-input" placeholder="ej: nuevo_modulo" value="${module.name}_copy" style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Nombre para Mostrar:</label>
          <input id="newDisplayName" class="swal2-input" placeholder="ej: Nuevo Módulo" value="${module.displayName} (Copia)">
        </div>
      `,
        focusConfirm: false,
        preConfirm: () => {
          const newName = document.getElementById("newName").value.trim();
          const newDisplayName = document
            .getElementById("newDisplayName")
            .value.trim();

          if (!newName || !newDisplayName) {
            Swal.showValidationMessage("Todos los campos son requeridos");
            return false;
          }

          if (!/^[a-z0-9_-]+$/.test(newName)) {
            Swal.showValidationMessage(
              "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"
            );
            return false;
          }

          return { newName, newDisplayName };
        },
      });

      if (!formValues) return;

      try {
        setModuleLoading(module._id, true);
        const response = await cnnmoduleApi.duplicateModule(
          accessToken,
          module._id,
          formValues
        );

        if (response.success) {
          await Swal.fire({
            icon: "success",
            title: "Módulo Duplicado",
            text: response.message,
            timer: 2000,
            showConfirmButton: false,
          });

          await loadModules();
          await reloadModuleConfig();
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        console.error("Error duplicando módulo:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "Error al duplicar el módulo",
        });
      } finally {
        setModuleLoading(module._id, false);
      }
    },
    [accessToken, modulePerms.canCreate, loadModules, reloadModuleConfig]
  );

  // ⭐ INVALIDAR CACHÉ ⭐
  const invalidateCache = useCallback(async () => {
    if (!isAdmin) {
      Swal.fire({
        icon: "error",
        title: "Sin Permisos",
        text: "Solo los administradores pueden invalidar el caché.",
      });
      return;
    }

    try {
      setLoading(true);
      const response = await cnnmoduleApi.invalidateCache(accessToken);

      if (response.success) {
        await Swal.fire({
          icon: "success",
          title: "Caché Invalidado",
          text: response.message,
          timer: 2000,
          showConfirmButton: false,
        });

        await reloadModuleConfig();
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error("Error invalidando caché:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al invalidar el caché",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin, reloadModuleConfig]);

  // ⭐ EXPORTAR MÓDULOS ⭐
  const exportModules = useCallback(async () => {
    if (!modulePerms.canRead) {
      Swal.fire({
        icon: "error",
        title: "Sin Permisos",
        text: "No tienes permisos para exportar módulos.",
      });
      return;
    }

    try {
      setLoading(true);
      const response = await cnnmoduleApi.exportModules(accessToken, "json");

      if (response.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `modules-export-${
          new Date().toISOString().split("T")[0]
        }.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Swal.fire({
          icon: "success",
          title: "Exportación Exitosa",
          text: "Los módulos han sido exportados correctamente",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error("Error exportando módulos:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al exportar módulos",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, modulePerms.canRead]);

  // ⭐ INICIALIZAR MÓDULOS DEL SISTEMA ⭐
  const initializeSystemModules = useCallback(async () => {
    if (!isAdmin) {
      Swal.fire({
        icon: "error",
        title: "Sin Permisos",
        text: "Solo los administradores pueden inicializar módulos del sistema.",
      });
      return;
    }

    const result = await Swal.fire({
      title: "¿Inicializar módulos del sistema?",
      text: "Esto creará o actualizará los módulos básicos del sistema",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, inicializar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      const response = await cnnmoduleApi.initializeSystemModules(accessToken);

      if (response.success) {
        await Swal.fire({
          icon: "success",
          title: "Módulos Inicializados",
          text: response.message,
          timer: 3000,
          showConfirmButton: false,
        });

        await loadModules();
        await reloadModuleConfig();
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error("Error inicializando módulos:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al inicializar módulos del sistema",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin, loadModules, reloadModuleConfig]);

  // ⭐ MANEJAR CAMBIOS EN FILTROS ⭐
  const handleFilterChange = useCallback((type, value) => {
    setPagination((prev) => ({ ...prev, current: 1 }));

    switch (type) {
      case "search":
        setSearchTerm(value);
        break;
      case "category":
        setFilterCategory(value);
        break;
      case "status":
        setFilterStatus(value);
        break;
      case "includeSystem":
        setIncludeSystem(value);
        break;
      case "sortBy":
        setSortBy(value);
        break;
      case "sortOrder":
        setSortOrder(value);
        break;
      default:
        break;
    }
  }, []);

  // ⭐ MANEJAR PAGINACIÓN ⭐
  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, current: page }));
  }, []);

  // ⭐ ALTERNAR EXPANSIÓN DE MÓDULO ⭐
  const toggleExpandModule = useCallback((moduleId) => {
    setExpandedModule((prev) => (prev === moduleId ? null : moduleId));
  }, []);

  // ⭐ ESTADÍSTICAS DE MÓDULOS ⭐
  const moduleStats = useMemo(() => {
    const stats = {
      total: modules.length,
      active: modules.filter((m) => m.isActive).length,
      inactive: modules.filter((m) => !m.isActive).length,
      system: modules.filter((m) => m.isSystem).length,
      custom: modules.filter((m) => !m.isSystem).length,
      byCategory: {},
    };

    categories.forEach((category) => {
      stats.byCategory[category.name] = modules.filter(
        (m) => m.uiConfig?.category === category.name
      ).length;
    });

    return stats;
  }, [modules, categories]);

  const assignModulePermissionsToRoles = useCallback(async () => {
    if (!isAdmin) {
      Swal.fire({
        icon: "error",
        title: "Sin Permisos",
        text: "Solo los administradores pueden asignar permisos de módulos.",
      });
      return;
    }

    const { value: rolePermissions } = await Swal.fire({
      title: "Asignar Permisos de Módulos",
      html: `
      <div style="text-align: left;">
        <h4>Selecciona los roles y permisos:</h4>
        <div id="rolePermissionsContainer">
          <div class="role-permission-item">
            <label>
              <input type="checkbox" value="superadmin" checked> 
              Super Admin - Todos los permisos
            </label>
          </div>
          <div class="role-permission-item">
            <label>
              <input type="checkbox" value="admin" checked> 
              Admin - Lectura y actualización
            </label>
          </div>
          <div class="role-permission-item">
            <label>
              <input type="checkbox" value="coordinador"> 
              Coordinador - Solo lectura
            </label>
          </div>
        </div>
      </div>
    `,
      focusConfirm: false,
      preConfirm: () => {
        const checkedRoles = [];
        document
          .querySelectorAll("#rolePermissionsContainer input:checked")
          .forEach((input) => {
            checkedRoles.push(input.value);
          });
        return checkedRoles;
      },
    });

    if (!rolePermissions || rolePermissions.length === 0) return;

    try {
      setLoading(true);

      const updates = rolePermissions.map((roleName) => {
        let permissions;
        switch (roleName) {
          case "superadmin":
            permissions = ["create", "read", "update", "delete", "manage"];
            break;
          case "admin":
            permissions = ["read", "update"];
            break;
          default:
            permissions = ["read"];
        }

        return { roleName, permissions };
      });

      const response = await fetch("/api/v1/roles/update-modules-permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roleUpdates: updates }),
      });

      const result = await response.json();

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: "Permisos Asignados",
          text: "Los permisos de módulos han sido asignados correctamente",
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al asignar permisos",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin]);

  return (
    <Container>
      {/* ⭐ HEADER ⭐ */}
      <Header>
        <HeaderContent>
          <TitleContainer>
            <Title>
              <FaCog /> Gestión de Módulos
            </Title>
            <Subtitle>Configura módulos del sistema dinámicamente</Subtitle>
          </TitleContainer>

          {/* ⭐ ESTADÍSTICAS RÁPIDAS ⭐ */}
          <StatsContainer>
            <StatCard>
              <StatNumber>{moduleStats.total}</StatNumber>
              <StatLabel>Total</StatLabel>
            </StatCard>
            <StatCard active>
              <StatNumber>{moduleStats.active}</StatNumber>
              <StatLabel>Activos</StatLabel>
            </StatCard>
            <StatCard system>
              <StatNumber>{moduleStats.system}</StatNumber>
              <StatLabel>Sistema</StatLabel>
            </StatCard>
          </StatsContainer>
        </HeaderContent>

        <HeaderActions>
          <ProtectedComponent
            resource="modules"
            action="create"
            showFallback={false}
          >
            <ActionButton
              onClick={() => showModuleForm()}
              variant="primary"
              disabled={loading}
            >
              <FaPlus /> Nuevo Módulo
            </ActionButton>
          </ProtectedComponent>

          <ActionButton
            onClick={loadModules}
            variant="secondary"
            disabled={loading}
          >
            <FaSync className={loading ? "spinning" : ""} />
            {loading ? "Cargando..." : "Refrescar"}
          </ActionButton>

          {isAdmin && (
            <ActionButton
              onClick={assignModulePermissionsToRoles}
              variant="warning"
              disabled={loading}
            >
              <FaShieldAlt /> Asignar Permisos
            </ActionButton>
          )}

          <ActionButton
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            variant="info"
          >
            <FaTools /> {showAdvancedOptions ? "Ocultar" : "Avanzado"}
          </ActionButton>
        </HeaderActions>
      </Header>

      {/* ⭐ OPCIONES AVANZADAS ⭐ */}
      {showAdvancedOptions && (
        <AdvancedOptionsContainer>
          <AdvancedTitle>
            <FaTools /> Opciones Avanzadas
          </AdvancedTitle>
          <AdvancedActions>
            {isAdmin && (
              <>
                <ActionButton
                  onClick={invalidateCache}
                  variant="warning"
                  disabled={loading}
                  size="small"
                >
                  <FaTrash /> Limpiar Caché
                </ActionButton>

                <ActionButton
                  onClick={exportModules}
                  variant="info"
                  disabled={loading}
                  size="small"
                >
                  <FaFileExport /> Exportar
                </ActionButton>

                <ActionButton
                  onClick={initializeSystemModules}
                  variant="success"
                  disabled={loading}
                  size="small"
                >
                  <FaCheckCircle /> Inicializar Sistema
                </ActionButton>
              </>
            )}
          </AdvancedActions>
        </AdvancedOptionsContainer>
      )}

      {/* ⭐ FILTROS ⭐ */}
      <FiltersContainer>
        <FilterRow>
          <SearchContainer>
            <FaSearch />
            <SearchInput
              type="text"
              placeholder="Buscar módulos..."
              value={searchTerm}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
          </SearchContainer>

          <FilterSelect
            value={filterCategory}
            onChange={(e) => handleFilterChange("category", e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.name} value={category.name}>
                {category.displayName} (
                {moduleStats.byCategory[category.name] || 0})
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={filterStatus}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="true">Activos ({moduleStats.active})</option>
            <option value="false">Inactivos ({moduleStats.inactive})</option>
          </FilterSelect>
        </FilterRow>

        <FilterRow>
          <CheckboxContainer>
            <input
              type="checkbox"
              id="includeSystem"
              checked={includeSystem}
              onChange={(e) =>
                handleFilterChange("includeSystem", e.target.checked)
              }
            />
            <label htmlFor="includeSystem">
              Incluir módulos del sistema ({moduleStats.system})
            </label>
          </CheckboxContainer>

          <SortContainer>
            <label>Ordenar por:</label>
            <FilterSelect
              value={sortBy}
              onChange={(e) => handleFilterChange("sortBy", e.target.value)}
            >
              <option value="uiConfig.order">Orden</option>
              <option value="displayName">Nombre</option>
              <option value="uiConfig.category">Categoría</option>
              <option value="createdAt">Fecha creación</option>
              <option value="updatedAt">Fecha modificación</option>
            </FilterSelect>

            <FilterSelect
              value={sortOrder}
              onChange={(e) => handleFilterChange("sortOrder", e.target.value)}
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </FilterSelect>
          </SortContainer>
        </FilterRow>
      </FiltersContainer>

      {/* ⭐ LISTA DE MÓDULOS ⭐ */}
      <ModulesContainer>
        {loading ? (
          <LoadingContainer>
            <Spinner />
            <p>Cargando módulos...</p>
          </LoadingContainer>
        ) : modules.length === 0 ? (
          <EmptyState>
            <FaCog size={64} color="#ccc" />
            <h3>No hay módulos disponibles</h3>
            <p>
              {pagination.total === 0
                ? "No hay módulos configurados en el sistema"
                : "No hay módulos que coincidan con los filtros aplicados"}
            </p>
            {modulePerms.canCreate && (
              <ActionButton onClick={() => showModuleForm()} variant="primary">
                <FaPlus /> Crear Primer Módulo
              </ActionButton>
            )}
          </EmptyState>
        ) : (
          <ModulesGrid>
            {modules.map((module) => (
              <ModuleCard
                key={module._id}
                isSystem={module.isSystem}
                isActive={module.isActive}
              >
                <ModuleHeader>
                  <ModuleTitle>
                    <ModuleIcon
                      style={{ color: module.uiConfig?.color || "#666" }}
                    >
                      {module.isSystem ? <FaShieldAlt /> : <FaCog />}
                    </ModuleIcon>
                    <div>
                      <ModuleName>{module.displayName}</ModuleName>
                      <ModuleSubtitle>{module.name}</ModuleSubtitle>
                    </div>
                  </ModuleTitle>

                  <ModuleActions>
                    <ActionButton
                      onClick={() => toggleExpandModule(module._id)}
                      variant="ghost"
                      size="small"
                      title="Ver detalles"
                    >
                      {expandedModule === module._id ? (
                        <FaChevronUp />
                      ) : (
                        <FaChevronDown />
                      )}
                    </ActionButton>

                    <ProtectedComponent
                      resource="modules"
                      action="update"
                      showFallback={false}
                    >
                      <ActionButton
                        onClick={() => showModuleForm(module)}
                        variant="info"
                        size="small"
                        title="Editar módulo"
                        disabled={actionLoading[module._id]}
                      >
                        <FaEdit />
                      </ActionButton>
                    </ProtectedComponent>

                    <ProtectedComponent
                      resource="modules"
                      action="create"
                      showFallback={false}
                    >
                      <ActionButton
                        onClick={() => duplicateModule(module)}
                        variant="secondary"
                        size="small"
                        title="Duplicar módulo"
                        disabled={actionLoading[module._id]}
                      >
                        <FaCopy />
                      </ActionButton>
                    </ProtectedComponent>

                    <ActionButton
                      onClick={() => toggleModuleStatus(module)}
                      variant={module.isActive ? "warning" : "success"}
                      size="small"
                      title={module.isActive ? "Desactivar" : "Activar"}
                      disabled={
                        actionLoading[module._id] ||
                        (module.isSystem &&
                          module.name === "dashboard" &&
                          module.isActive)
                      }
                    >
                      {actionLoading[module._id] ? (
                        <FaSync className="spinning" />
                      ) : module.isActive ? (
                        <FaBan />
                      ) : (
                        <FaCheck />
                      )}
                    </ActionButton>

                    {!module.isSystem && (
                      <ProtectedComponent
                        resource="modules"
                        action="delete"
                        showFallback={false}
                      >
                        <ActionButton
                          onClick={() => deleteModule(module)}
                          variant="danger"
                          size="small"
                          title="Eliminar módulo"
                          disabled={actionLoading[module._id]}
                        >
                          <FaTrash />
                        </ActionButton>
                      </ProtectedComponent>
                    )}
                  </ModuleActions>
                </ModuleHeader>

                <ModuleInfo>
                  <InfoGrid>
                    <InfoItem>
                      <InfoLabel>Recurso:</InfoLabel>
                      <InfoValue>
                        <ResourceBadge>{module.resource}</ResourceBadge>
                      </InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Categoría:</InfoLabel>
                      <InfoValue>
                        <CategoryBadge category={module.uiConfig?.category}>
                          {categories.find(
                            (c) => c.name === module.uiConfig?.category
                          )?.displayName || module.uiConfig?.category}
                        </CategoryBadge>
                      </InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Estado:</InfoLabel>
                      <InfoValue>
                        <Badge active={module.isActive}>
                          {module.isActive ? (
                            <>
                              <FaCheckCircle /> Activo
                            </>
                          ) : (
                            <>
                              <FaTimesCircle /> Inactivo
                            </>
                          )}
                        </Badge>
                      </InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Acciones:</InfoLabel>
                      <InfoValue>
                        <ActionsPreview>
                          {module.actions?.slice(0, 3).map((action) => (
                            <ActionTag
                              key={action.name}
                              isDefault={action.isDefault}
                            >
                              {action.displayName}
                            </ActionTag>
                          ))}
                          {module.actions?.length > 3 && (
                            <ActionTag>+{module.actions.length - 3}</ActionTag>
                          )}
                        </ActionsPreview>
                      </InfoValue>
                    </InfoItem>
                  </InfoGrid>

                  {module.description && (
                    <ModuleDescription>{module.description}</ModuleDescription>
                  )}
                </ModuleInfo>

                {/* ⭐ DETALLES EXPANDIDOS ⭐ */}
                {expandedModule === module._id && (
                  <ExpandedDetails>
                    <DetailsSection>
                      <SectionTitle>
                        <FaCode /> Acciones Configuradas
                      </SectionTitle>
                      <ActionsGrid>
                        {module.actions?.map((action) => (
                          <ActionDetail key={action.name}>
                            <ActionDetailHeader>
                              <ActionName isDefault={action.isDefault}>
                                {action.displayName}
                                {action.isDefault && (
                                  <DefaultBadge>Por defecto</DefaultBadge>
                                )}
                              </ActionName>
                            </ActionDetailHeader>
                            <ActionDescription>
                              {action.description || `Acción: ${action.name}`}
                            </ActionDescription>
                          </ActionDetail>
                        ))}
                      </ActionsGrid>
                    </DetailsSection>

                    <DetailsSection>
                      <SectionTitle>
                        <FaCode /> Rutas Configuradas
                      </SectionTitle>
                      <RoutesList>
                        {module.routes?.map((route, index) => (
                          <RouteItem key={index}>
                            <RouteMethod method={route.method || "GET"}>
                              {route.method || "GET"}
                            </RouteMethod>
                            <RoutePath>{route.path}</RoutePath>
                            <RouteAction>
                              {route.requiredAction || "read"}
                            </RouteAction>
                            {route.isMain && (
                              <MainRouteBadge>Principal</MainRouteBadge>
                            )}
                          </RouteItem>
                        ))}
                        {(!module.routes || module.routes.length === 0) && (
                          <NoRoutesMessage>
                            No hay rutas configuradas
                          </NoRoutesMessage>
                        )}
                      </RoutesList>
                    </DetailsSection>

                    <DetailsSection>
                      <SectionTitle>
                        <FaEye /> Configuración UI
                      </SectionTitle>
                      <UIConfigGrid>
                        <UIConfigItem>
                          <span>Icono:</span>
                          <code>{module.uiConfig?.icon || "FaCog"}</code>
                        </UIConfigItem>
                        <UIConfigItem>
                          <span>Color:</span>
                          <ColorContainer>
                            <ColorPreview
                              color={module.uiConfig?.color || "#666"}
                            />
                            <code>{module.uiConfig?.color || "#666"}</code>
                          </ColorContainer>
                        </UIConfigItem>
                        <UIConfigItem>
                          <span>Orden:</span>
                          <span>{module.uiConfig?.order || 0}</span>
                        </UIConfigItem>
                        <UIConfigItem>
                          <span>En menú:</span>
                          <StatusIcon active={module.uiConfig?.showInMenu}>
                            {module.uiConfig?.showInMenu ? (
                              <FaCheck />
                            ) : (
                              <FaTimes />
                            )}
                          </StatusIcon>
                        </UIConfigItem>
                        <UIConfigItem>
                          <span>En dashboard:</span>
                          <StatusIcon active={module.uiConfig?.showInDashboard}>
                            {module.uiConfig?.showInDashboard ? (
                              <FaCheck />
                            ) : (
                              <FaTimes />
                            )}
                          </StatusIcon>
                        </UIConfigItem>
                      </UIConfigGrid>
                    </DetailsSection>

                    {module.restrictions && (
                      <DetailsSection>
                        <SectionTitle>
                          <FaShieldAlt /> Restricciones
                        </SectionTitle>
                        <RestrictionsGrid>
                          <RestrictionItem>
                            <span>Requiere Admin:</span>
                            <StatusIcon
                              active={module.restrictions.requireAdmin}
                            >
                              {module.restrictions.requireAdmin ? (
                                <FaCheck />
                              ) : (
                                <FaTimes />
                              )}
                            </StatusIcon>
                          </RestrictionItem>
                          <RestrictionItem>
                            <span>Rol Mínimo:</span>
                            <RoleBadge>
                              {module.restrictions.minimumRole || "user"}
                            </RoleBadge>
                          </RestrictionItem>
                          {module.restrictions.contextRules?.length > 0 && (
                            <RestrictionItem>
                              <span>Reglas Contextuales:</span>
                              <span>
                                {module.restrictions.contextRules.length}{" "}
                                configuradas
                              </span>
                            </RestrictionItem>
                          )}
                        </RestrictionsGrid>
                      </DetailsSection>
                    )}

                    {(module.createdBy ||
                      module.lastModifiedBy ||
                      module.version) && (
                      <DetailsSection>
                        <SectionTitle>
                          <FaInfoCircle /> Metadatos
                        </SectionTitle>
                        <MetadataGrid>
                          {module.version && (
                            <MetadataItem>
                              <span>Versión:</span>
                              <VersionBadge>{module.version}</VersionBadge>
                            </MetadataItem>
                          )}
                          {module.createdBy && (
                            <MetadataItem>
                              <span>Creado por:</span>
                              <span>
                                {module.createdBy.name}{" "}
                                {module.createdBy.lastname}
                              </span>
                            </MetadataItem>
                          )}
                          {module.lastModifiedBy && (
                            <MetadataItem>
                              <span>Modificado por:</span>
                              <span>
                                {module.lastModifiedBy.name}{" "}
                                {module.lastModifiedBy.lastname}
                              </span>
                            </MetadataItem>
                          )}
                          <MetadataItem>
                            <span>Tipo:</span>
                            <span>
                              {module.isSystem ? "Sistema" : "Personalizado"}
                            </span>
                          </MetadataItem>
                        </MetadataGrid>
                      </DetailsSection>
                    )}
                  </ExpandedDetails>
                )}
              </ModuleCard>
            ))}
          </ModulesGrid>
        )}
      </ModulesContainer>

      {/* ⭐ PAGINACIÓN ⭐ */}
      {!loading && modules.length > 0 && pagination.pages > 1 && (
        <PaginationContainer>
          <Pagination
            current={pagination.current}
            total={pagination.pages}
            onPageChange={handlePageChange}
            showInfo={true}
            itemsPerPage={pagination.limit}
            totalItems={pagination.total}
          />
        </PaginationContainer>
      )}

      {/* ⭐ MODAL DE FORMULARIO ⭐ */}
      {showForm && (
        <FormModal
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <ModalContent>
            <ModalHeader>
              <h3>
                {editingModule ? (
                  <>
                    <FaEdit /> Editar Módulo
                  </>
                ) : (
                  <>
                    <FaPlus /> Nuevo Módulo
                  </>
                )}
              </h3>
              <CloseButton onClick={() => setShowForm(false)}>
                <FaTimes />
              </CloseButton>
            </ModalHeader>

            <FormContent>
              {/* ⭐ INFORMACIÓN BÁSICA ⭐ */}
              <FormSection>
                <SectionTitle>
                  <FaInfoCircle /> Información Básica
                </SectionTitle>

                <FormRow>
                  <FormGroup>
                    <FormLabel>Nombre del Módulo *</FormLabel>
                    <FormInput
                      type="text"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          name: e.target.value.toLowerCase(),
                        })
                      }
                      placeholder="ej: tasks"
                      error={formErrors.name}
                    />
                    {formErrors.name && (
                      <ErrorText>{formErrors.name}</ErrorText>
                    )}
                    <HelpText>
                      Solo letras minúsculas, números, guiones y guiones bajos
                    </HelpText>
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>Nombre para Mostrar *</FormLabel>
                    <FormInput
                      type="text"
                      value={formData.displayName || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          displayName: e.target.value,
                        })
                      }
                      placeholder="ej: Gestión de Tareas"
                      error={formErrors.displayName}
                    />
                    {formErrors.displayName && (
                      <ErrorText>{formErrors.displayName}</ErrorText>
                    )}
                  </FormGroup>
                </FormRow>

                <FormGroup>
                  <FormLabel>Descripción</FormLabel>
                  <FormTextArea
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descripción del módulo..."
                    rows={3}
                  />
                </FormGroup>

                <FormGroup>
                  <FormLabel>Recurso *</FormLabel>
                  <FormInput
                    type="text"
                    value={formData.resource || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        resource: e.target.value.toLowerCase(),
                      })
                    }
                    placeholder="ej: tasks"
                    error={formErrors.resource}
                  />
                  {formErrors.resource && (
                    <ErrorText>{formErrors.resource}</ErrorText>
                  )}
                  <HelpText>Recurso asociado para permisos</HelpText>
                </FormGroup>
              </FormSection>

              {/* ⭐ CONFIGURACIÓN DE ACCIONES ⭐ */}
              <FormSection>
                <SectionTitle>
                  <FaCode /> Acciones del Módulo
                </SectionTitle>
                <ActionsConfigContainer>
                  {availableActions.map((action) => {
                    const isSelected = formData.actions?.some(
                      (a) => a.name === action.name
                    );
                    const selectedAction = formData.actions?.find(
                      (a) => a.name === action.name
                    );

                    return (
                      <ActionConfigItem key={action.name}>
                        <ActionCheckbox
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                actions: [
                                  ...(formData.actions || []),
                                  {
                                    name: action.name,
                                    displayName: action.displayName,
                                    description: action.description,
                                    isDefault: false,
                                  },
                                ],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                actions:
                                  formData.actions?.filter(
                                    (a) => a.name !== action.name
                                  ) || [],
                              });
                            }
                          }}
                        />
                        <ActionConfigInfo>
                          <ActionConfigName>
                            {action.displayName}
                          </ActionConfigName>
                          <ActionConfigDescription>
                            {action.description}
                          </ActionConfigDescription>
                        </ActionConfigInfo>
                        {isSelected && (
                          <DefaultCheckboxContainer>
                            <DefaultCheckbox
                              type="checkbox"
                              checked={selectedAction?.isDefault || false}
                              onChange={(e) => {
                                setFormData({
                                  ...formData,
                                  actions:
                                    formData.actions?.map((a) =>
                                      a.name === action.name
                                        ? { ...a, isDefault: e.target.checked }
                                        : a
                                    ) || [],
                                });
                              }}
                              title="Acción por defecto"
                            />
                            <label>Por defecto</label>
                          </DefaultCheckboxContainer>
                        )}
                      </ActionConfigItem>
                    );
                  })}
                </ActionsConfigContainer>
                {formErrors.actions && (
                  <ErrorText>{formErrors.actions}</ErrorText>
                )}
                <HelpText>
                  Selecciona las acciones que estarán disponibles para este
                  módulo
                </HelpText>
              </FormSection>

              {/* ⭐ CONFIGURACIÓN DE UI ⭐ */}
              <FormSection>
                <SectionTitle>
                  <FaEye /> Configuración de Interfaz
                </SectionTitle>

                <FormRow>
                  <FormGroup>
                    <FormLabel>Icono</FormLabel>
                    <FormInput
                      type="text"
                      value={formData.uiConfig?.icon || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          uiConfig: {
                            ...formData.uiConfig,
                            icon: e.target.value,
                          },
                        })
                      }
                      placeholder="ej: FaTasks"
                    />
                    <HelpText>
                      Nombre del icono de React Icons (FontAwesome)
                    </HelpText>
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>Color</FormLabel>
                    <ColorInputContainer>
                      <FormInput
                        type="color"
                        value={formData.uiConfig?.color || "#007bff"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            uiConfig: {
                              ...formData.uiConfig,
                              color: e.target.value,
                            },
                          })
                        }
                        style={{ width: "60px", padding: "0.25rem" }}
                      />
                      <FormInput
                        type="text"
                        value={formData.uiConfig?.color || "#007bff"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            uiConfig: {
                              ...formData.uiConfig,
                              color: e.target.value,
                            },
                          })
                        }
                        placeholder="#007bff"
                        style={{ flex: 1 }}
                      />
                    </ColorInputContainer>
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <FormGroup>
                    <FormLabel>Categoría</FormLabel>
                    <FormSelect
                      value={formData.uiConfig?.category || "operational"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          uiConfig: {
                            ...formData.uiConfig,
                            category: e.target.value,
                          },
                        })
                      }
                    >
                      {categories.map((category) => (
                        <option key={category.name} value={category.name}>
                          {category.displayName}
                        </option>
                      ))}
                    </FormSelect>
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>Orden</FormLabel>
                    <FormInput
                      type="number"
                      min="0"
                      max="1000"
                      value={formData.uiConfig?.order || 0}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          uiConfig: {
                            ...formData.uiConfig,
                            order: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                    <HelpText>Orden de aparición (0-1000)</HelpText>
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <CheckboxGroup>
                    <FormCheckbox
                      type="checkbox"
                      id="showInMenu"
                      checked={formData.uiConfig?.showInMenu !== false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          uiConfig: {
                            ...formData.uiConfig,
                            showInMenu: e.target.checked,
                          },
                        })
                      }
                    />
                    <label htmlFor="showInMenu">
                      Mostrar en menú principal
                    </label>
                  </CheckboxGroup>

                  <CheckboxGroup>
                    <FormCheckbox
                      type="checkbox"
                      id="showInDashboard"
                      checked={formData.uiConfig?.showInDashboard || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          uiConfig: {
                            ...formData.uiConfig,
                            showInDashboard: e.target.checked,
                          },
                        })
                      }
                    />
                    <label htmlFor="showInDashboard">
                      Mostrar en dashboard
                    </label>
                  </CheckboxGroup>
                </FormRow>
              </FormSection>

              {/* ⭐ RESTRICCIONES ⭐ */}
              <FormSection>
                <SectionTitle>
                  <FaShieldAlt /> Restricciones de Acceso
                </SectionTitle>

                <FormRow>
                  <CheckboxGroup>
                    <FormCheckbox
                      type="checkbox"
                      id="requireAdmin"
                      checked={formData.restrictions?.requireAdmin || false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          restrictions: {
                            ...formData.restrictions,
                            requireAdmin: e.target.checked,
                          },
                        })
                      }
                    />
                    <label htmlFor="requireAdmin">
                      Requiere privilegios de administrador
                    </label>
                  </CheckboxGroup>
                </FormRow>

                <FormGroup>
                  <FormLabel>Rol Mínimo Requerido</FormLabel>
                  <FormSelect
                    value={formData.restrictions?.minimumRole || "user"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        restrictions: {
                          ...formData.restrictions,
                          minimumRole: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="guest">Invitado</option>
                    <option value="user">Usuario</option>
                    <option value="editor">Editor</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrador</option>
                  </FormSelect>
                  <HelpText>
                    Rol mínimo requerido para acceder al módulo
                  </HelpText>
                </FormGroup>
              </FormSection>
            </FormContent>

            <ModalFooter>
              <ActionButton
                onClick={() => setShowForm(false)}
                variant="secondary"
                disabled={loading}
              >
                <FaTimes /> Cancelar
              </ActionButton>
              <ActionButton
                onClick={saveModule}
                variant="primary"
                disabled={loading}
              >
                <FaSave /> {loading ? "Guardando..." : "Guardar Módulo"}
              </ActionButton>
            </ModalFooter>
          </ModalContent>
        </FormModal>
      )}
    </Container>
  );
};

// ⭐ FUNCIONES AUXILIARES ⭐
function getDefaultFormData() {
  return {
    name: "",
    displayName: "",
    description: "",
    resource: "",
    actions: [
      {
        name: "read",
        displayName: "Leer",
        description: "Visualizar elementos",
        isDefault: true,
      },
    ],
    routes: [],
    uiConfig: {
      icon: "FaCog",
      color: "#007bff",
      category: "operational",
      order: 0,
      showInMenu: true,
      showInDashboard: false,
    },
    restrictions: {
      requireAdmin: false,
      minimumRole: "user",
      contextRules: [],
    },
    isActive: true,
  };
}

function validateFormData(data) {
  const errors = {};

  if (!data.name || data.name.trim().length < 2) {
    errors.name = "El nombre es requerido y debe tener al menos 2 caracteres";
  } else if (!/^[a-z0-9_-]+$/.test(data.name)) {
    errors.name =
      "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos";
  }

  if (!data.displayName || data.displayName.trim().length < 2) {
    errors.displayName =
      "El nombre para mostrar es requerido y debe tener al menos 2 caracteres";
  }

  if (!data.resource || data.resource.trim().length < 2) {
    errors.resource =
      "El recurso es requerido y debe tener al menos 2 caracteres";
  } else if (!/^[a-z0-9_]+$/.test(data.resource)) {
    errors.resource =
      "El recurso solo puede contener letras minúsculas, números y guiones bajos";
  }

  if (!data.actions || data.actions.length === 0) {
    errors.actions = "Debe especificar al menos una acción";
  }

  if (data.description && data.description.length > 500) {
    errors.description = "La descripción no puede exceder 500 caracteres";
  }

  return errors;
}

// ⭐ STYLED COMPONENTS ⭐
const Container = styled.div`
  padding: 2rem;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  min-height: 100vh;
`;

const AccessDeniedContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  gap: 1rem;
  text-align: center;

  h2 {
    color: #dc3545;
    margin: 0;
  }

  p {
    color: #666;
    margin: 0.5rem 0;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 2rem;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const HeaderContent = styled.div`
  flex: 1;
  display: flex;
  gap: 2rem;
  align-items: flex-start;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
  }
`;

const TitleContainer = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  margin: 0 0 0.5rem 0;
  color: ${(props) => props.theme.primary};
  font-size: 2rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Subtitle = styled.p`
  margin: 0;
  color: ${(props) => props.theme.textSecondary};
  font-size: 1.1rem;
`;

const StatsContainer = styled.div`
  display: flex;
  gap: 1rem;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const StatCard = styled.div`
  background: ${(props) => {
    if (props.active) return props.theme.success;
    if (props.system) return props.theme.warning;
    return props.theme.cardBg;
  }};
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  min-width: 80px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid ${(props) => props.theme.border};
`;

const StatNumber = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  color: ${(props) => props.theme.text};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: ${(props) => props.theme.textSecondary};
  margin-top: 0.25rem;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const AdvancedOptionsContainer = styled.div`
  background: ${(props) => props.theme.cardBg};
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
`;

const AdvancedTitle = styled.h3`
  margin: 0 0 1rem 0;
  color: ${(props) => props.theme.primary};
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
`;

const AdvancedActions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const FiltersContainer = styled.div`
  background: ${(props) => props.theme.cardBg};
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid ${(props) => props.theme.border};
`;

const FilterRow = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: ${(props) => props.theme.bg};
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  color: ${(props) => props.theme.textSecondary};
  flex: 1;
  min-width: 200px;
`;

const SearchInput = styled.input`
  border: none;
  background: transparent;
  color: ${(props) => props.theme.text};
  outline: none;
  width: 100%;

  &::placeholder {
    color: ${(props) => props.theme.textSecondary};
  }
`;

const FilterSelect = styled.select`
  padding: 0.5rem;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  background: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  min-width: 150px;
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  label {
    color: ${(props) => props.theme.text};
    cursor: pointer;
    user-select: none;
  }
`;

const SortContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  label {
    color: ${(props) => props.theme.text};
    white-space: nowrap;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
`;

const ModulesContainer = styled.div`
  margin-bottom: 2rem;
`;

const ModulesGrid = styled.div`
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ModuleCard = styled.div`
  background: ${(props) => props.theme.cardBg};
  border: 2px solid
    ${(props) => {
      if (props.isSystem) return "#ffc107";
      if (!props.isActive) return "#6c757d";
      return props.theme.border;
    }};
  border-radius: 8px;
  padding: 1.5rem;
  position: relative;
  transition: all 0.2s ease;
  opacity: ${(props) => (props.isActive ? 1 : 0.7)};

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: ${(props) => props.theme.primary};
  }

  ${(props) =>
    props.isSystem &&
    `
   &::before {
     content: 'SISTEMA';
     position: absolute;
     top: -1px;
     right: -1px;
     background: #ffc107;
     color: #000;
     font-size: 10px;
     font-weight: bold;
     padding: 2px 8px;
     border-radius: 0 6px 0 8px;
   }
 `}
`;

const ModuleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid ${(props) => props.theme.border};
`;

const ModuleTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
`;

const ModuleIcon = styled.span`
  font-size: 1.5rem;
  display: flex;
  align-items: center;
`;

const ModuleName = styled.h3`
  margin: 0;
  color: ${(props) => props.theme.text};
  font-size: 1.1rem;
`;

const ModuleSubtitle = styled.div`
  font-size: 0.875rem;
  color: ${(props) => props.theme.textSecondary};
  margin-top: 0.25rem;
`;

const ModuleActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ModuleInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const InfoLabel = styled.span`
  font-weight: 600;
  color: ${(props) => props.theme.textSecondary};
  font-size: 0.875rem;
`;

const InfoValue = styled.div`
  color: ${(props) => props.theme.text};
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const ResourceBadge = styled.span`
  background: ${(props) => props.theme.primary};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
`;

const CategoryBadge = styled.span`
  background: ${(props) => {
    switch (props.category) {
      case "operational":
        return "#007bff";
      case "administrative":
        return "#dc3545";
      case "analytical":
        return "#28a745";
      case "configuration":
        return "#ffc107";
      default:
        return "#6c757d";
    }
  }};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
`;

const ActionsPreview = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const ActionTag = styled.span`
  background: ${(props) =>
    props.isDefault ? props.theme.primary : props.theme.secondary};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
`;

const ModuleDescription = styled.div`
  font-size: 0.875rem;
  color: ${(props) => props.theme.textSecondary};
  line-height: 1.4;
  font-style: italic;
  padding: 0.5rem;
  background: ${(props) => props.theme.bg};
  border-radius: 4px;
  border-left: 3px solid ${(props) => props.theme.primary};
`;

const ExpandedDetails = styled.div`
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${(props) => props.theme.border};
  background: ${(props) => props.theme.bg};
  border-radius: 4px;
  padding: 1rem;
`;

const DetailsSection = styled.div`
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h4`
  margin: 0 0 1rem 0;
  color: ${(props) => props.theme.primary};
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.5rem;
`;

const ActionDetail = styled.div`
  padding: 0.75rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};
`;

const ActionDetailHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const ActionName = styled.div`
  font-weight: 600;
  color: ${(props) =>
    props.isDefault ? props.theme.primary : props.theme.text};
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const DefaultBadge = styled.span`
  background: ${(props) => props.theme.success};
  color: white;
  padding: 0.125rem 0.375rem;
  border-radius: 8px;
  font-size: 0.625rem;
  font-weight: 500;
`;

const ActionDescription = styled.div`
  font-size: 0.875rem;
  color: ${(props) => props.theme.textSecondary};
  line-height: 1.3;
`;

const RoutesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const RouteItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};
`;

const RouteMethod = styled.span`
  background: ${(props) => {
    switch (props.method) {
      case "GET":
        return "#28a745";
      case "POST":
        return "#007bff";
      case "PUT":
        return "#ffc107";
      case "DELETE":
        return "#dc3545";
      default:
        return "#6c757d";
    }
  }};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  min-width: 60px;
  text-align: center;
`;

const RoutePath = styled.code`
  background: ${(props) => props.theme.bg};
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  flex: 1;
  font-family: "Courier New", monospace;
`;

const RouteAction = styled.span`
  color: ${(props) => props.theme.textSecondary};
  font-size: 0.875rem;
`;

const MainRouteBadge = styled.span`
  background: ${(props) => props.theme.primary};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
`;

const NoRoutesMessage = styled.div`
  text-align: center;
  color: ${(props) => props.theme.textSecondary};
  font-style: italic;
  padding: 1rem;
`;

const UIConfigGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
`;

const UIConfigItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};

  span:first-child {
    font-weight: 600;
    color: ${(props) => props.theme.textSecondary};
  }
`;

const ColorContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ColorPreview = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${(props) => props.color};
  border: 1px solid ${(props) => props.theme.border};
`;

const StatusIcon = styled.span`
  color: ${(props) => (props.active ? "#28a745" : "#dc3545")};
  display: flex;
  align-items: center;
`;

const RestrictionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
`;

const RestrictionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};
`;

const RoleBadge = styled.span`
  background: ${(props) => props.theme.info};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  text-transform: capitalize;
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
`;

const MetadataItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};

  span:first-child {
    font-weight: 600;
    color: ${(props) => props.theme.textSecondary};
  }
`;

const VersionBadge = styled.span`
  background: ${(props) => props.theme.secondary};
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: ${(props) => props.theme.textSecondary};

  h3 {
    margin: 1rem 0 0.5rem 0;
    color: ${(props) => props.theme.text};
  }

  p {
    margin: 0 0 2rem 0;
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`;

// ⭐ MODAL STYLES ⭐
const FormModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: ${(props) => props.theme.bg};
  border-radius: 8px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid ${(props) => props.theme.border};

  h3 {
    margin: 0;
    color: ${(props) => props.theme.primary};
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.theme.textSecondary};
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.border};
    color: ${(props) => props.theme.text};
  }
`;

const FormContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
`;

const FormSection = styled.div`
  margin-bottom: 2rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const FormLabel = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${(props) => (props.error ? "#dc3545" : props.theme.border)};
  border-radius: 4px;
  background: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  font-size: 1rem;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${(props) => (props.error ? "#dc3545" : props.theme.primary)};
    box-shadow: 0 0 0 2px
      ${(props) =>
        props.error ? "rgba(220, 53, 69, 0.2)" : "rgba(0, 123, 255, 0.2)"};
  }

  &::placeholder {
    color: ${(props) => props.theme.textSecondary};
  }
`;

const FormTextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  background: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  font-size: 1rem;
  resize: vertical;
  transition: border-color 0.2s ease;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
  }

  &::placeholder {
    color: ${(props) => props.theme.textSecondary};
  }
`;

const FormSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  background: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  font-size: 1rem;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
  }
`;

const FormCheckbox = styled.input`
  margin-right: 0.5rem;
  transform: scale(1.1);
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  label {
    margin-bottom: 0;
    cursor: pointer;
    user-select: none;
  }
`;

const ColorInputContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const ErrorText = styled.span`
  color: #dc3545;
  font-size: 0.875rem;
  margin-top: 0.25rem;
  display: block;
`;

const HelpText = styled.span`
  color: ${(props) => props.theme.textSecondary};
  font-size: 0.875rem;
  margin-top: 0.25rem;
  display: block;
`;

const ActionsConfigContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  padding: 0.5rem;
  background: ${(props) => props.theme.bg};
`;

const ActionConfigItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.border};
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.bg};
  }
`;

const ActionCheckbox = styled.input`
  margin: 0;
  transform: scale(1.2);
`;

const ActionConfigInfo = styled.div`
  flex: 1;
`;

const ActionConfigName = styled.div`
  font-weight: 600;
  color: ${(props) => props.theme.text};
  margin-bottom: 0.25rem;
`;

const ActionConfigDescription = styled.div`
  font-size: 0.875rem;
  color: ${(props) => props.theme.textSecondary};
  line-height: 1.3;
`;

const DefaultCheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;

  label {
    font-size: 0.875rem;
    color: ${(props) => props.theme.textSecondary};
    cursor: pointer;
    user-select: none;
  }
`;

const DefaultCheckbox = styled.input`
  margin: 0;
  cursor: pointer;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid ${(props) => props.theme.border};
  background: ${(props) => props.theme.cardBg};
`;

export default ModuleManager;
