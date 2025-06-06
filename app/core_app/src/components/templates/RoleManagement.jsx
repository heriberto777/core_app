// components/RoleManagement.jsx
import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useAuth, RoleApi, useFetchData } from "../../index";
import Swal from "sweetalert2";
import {
  FaUserTag, FaEdit, FaTrash, FaPlus, FaSync, FaEye, FaEyeSlash,
  FaToggleOn, FaToggleOff, FaSearch, FaCrown, FaPalette, FaCog, FaShield
} from "react-icons/fa";

const roleApi = new RoleApi();

export function RoleManagement() {
  const { accessToken, user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0
  });

  const fetchRolesCallback = useCallback(async () => {
    try {
      const result = await roleApi.getRoles(accessToken, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        active: showInactive ? false : true,
        search: search.trim() || undefined
      });

      setPagination(prev => ({
        ...prev,
        total: result.pagination?.total || 0
      }));

      return result.data || [];
    } catch (error) {
      console.error("Error al obtener roles:", error);
      throw error;
    }
  }, [accessToken, pagination.page, pagination.pageSize, showInactive, search]);

  const {
    data: roles,
    loading,
    refreshing,
    error,
    refetch: fetchRoles
  } = useFetchData(fetchRolesCallback, [fetchRolesCallback], {
    autoRefresh: false,
    enableCache: false,
    initialData: []
  });

  useEffect(() => {
    fetchRoles();
  }, [search, showInactive, pagination.page]);

  const availablePermissions = [
    { value: 'users.read', label: 'Ver Usuarios', category: 'Usuarios' },
    { value: 'users.create', label: 'Crear Usuarios', category: 'Usuarios' },
    { value: 'users.update', label: 'Editar Usuarios', category: 'Usuarios' },
    { value: 'users.delete', label: 'Eliminar Usuarios', category: 'Usuarios' },
    { value: 'roles.read', label: 'Ver Roles', category: 'Roles' },
    { value: 'roles.create', label: 'Crear Roles', category: 'Roles' },
    { value: 'roles.update', label: 'Editar Roles', category: 'Roles' },
    { value: 'roles.delete', label: 'Eliminar Roles', category: 'Roles' },
    { value: 'config.read', label: 'Ver Configuraciones', category: 'Configuración' },
    { value: 'config.update', label: 'Editar Configuraciones', category: 'Configuración' },
    { value: 'consecutive.read', label: 'Ver Consecutivos', category: 'Consecutivos' },
    { value: 'consecutive.create', label: 'Crear Consecutivos', category: 'Consecutivos' },
    { value: 'consecutive.update', label: 'Editar Consecutivos', category: 'Consecutivos' },
    { value: 'consecutive.delete', label: 'Eliminar Consecutivos', category: 'Consecutivos' },
    { value: 'email.read', label: 'Ver Emails', category: 'Email' },
    { value: 'email.create', label: 'Crear Emails', category: 'Email' },
    { value: 'email.update', label: 'Editar Emails', category: 'Email' },
    { value: 'email.delete', label: 'Eliminar Emails', category: 'Email' },
    { value: 'reports.read', label: 'Ver Reportes', category: 'Reportes' },
    { value: 'reports.create', label: 'Crear Reportes', category: 'Reportes' },
    { value: 'system.admin', label: 'Administrador del Sistema', category: 'Sistema' }
  ];

  const roleColors = [
    "#dc3545", "#28a745", "#007bff", "#ffc107", "#6f42c1", 
    "#17a2b8", "#fd7e14", "#e83e8c", "#20c997", "#6c757d"
  ];

  const roleIcons = [
    "user", "crown", "shield", "star", "cog", "briefcase",
    "handshake", "calculator", "truck", "warehouse", "file-invoice"
  ];

  const handleCreateRole = () => {
    const permissionsByCategory = availablePermissions.reduce((acc, perm) => {
      if (!acc[perm.category]) acc[perm.category] = [];
      acc[perm.category].push(perm);
      return acc;
    }, {});

    const permissionsHtml = Object.entries(permissionsByCategory).map(([category, perms]) => `
      <div class="permission-category">
        <h4>${category}</h4>
        <div class="permission-list">
          ${perms.map(perm => `
            <label class="permission-item">
              <input type="checkbox" value="${perm.value}" name="permissions">
              <span>${perm.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    Swal.fire({
      title: "Crear Nuevo Rol",
      html: `
        <div class="role-form">
          <div class="form-row">
            <div class="form-group">
              <label for="name">Nombre del Rol *</label>
              <input id="name" class="swal2-input" placeholder="ej: supervisor">
            </div>
            <div class="form-group">
              <label for="displayName">Nombre a Mostrar *</label>
              <input id="displayName" class="swal2-input" placeholder="ej: Supervisor">
            </div>
          </div>
          
          <div class="form-group">
            <label for="description">Descripción</label>
            <textarea id="description" class="swal2-textarea" placeholder="Descripción del rol"></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="color">Color</label>
              <div class="color-picker">
                <input id="color" type="color" value="#6c757d">
                <div class="color-presets">
                  ${roleColors.map(color => `
                    <div class="color-preset" style="background-color: ${color}" onclick="document.getElementById('color').value='${color}'"></div>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="form-group">
              <label for="icon">Icono</label>
              <select id="icon" class="swal2-select">
                ${roleIcons.map(icon => `<option value="${icon}">${icon}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <div class="permissions-section">
            <h3>Permisos</h3>
            <div class="permissions-container">
              ${permissionsHtml}
            </div>
          </div>
        </div>
        
        <style>
          .role-form { text-align: left; max-height: 500px; overflow-y: auto; }
          .form-row { display: flex; gap: 15px; }
          .form-group { flex: 1; margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .swal2-input, .swal2-textarea, .swal2-select { margin: 0 !important; width: 100%; }
          .color-picker { display: flex; flex-direction: column; gap: 10px; }
          .color-presets { display: flex; gap: 5px; flex-wrap: wrap; }
          .color-preset { width: 25px; height: 25px; border-radius: 4px; cursor: pointer; border: 2px solid #fff; box-shadow: 0 0 0 1px #ccc; }
          .permissions-section { margin-top: 20px; }
          .permissions-container { max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
          .permission-category { margin-bottom: 15px; }
          .permission-category h4 { margin: 0 0 8px 0; color: #007bff; font-size: 14px; }
          .permission-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 5px; }
          .permission-item { display: flex; align-items: center; gap: 8px; padding: 2px; }
          .permission-item input { margin: 0; }
          .permission-item span { font-size: 13px; }
        </style>
      `,
      width: 700,
      showCancelButton: true,
      confirmButtonText: "Crear Rol",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("name").value.trim();
        const displayName = document.getElementById("displayName").value.trim();
        const description = document.getElementById("description").value.trim();
        const color = document.getElementById("color").value;
        const icon = document.getElementById("icon").value;
        const permissionCheckboxes = document.querySelectorAll('input[name="permissions"]:checked');
        const permissions = Array.from(permissionCheckboxes).map(cb => cb.value);

        if (!name || !displayName) {
          Swal.showValidationMessage("Nombre y nombre a mostrar son requeridos");
          return false;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          Swal.showValidationMessage("El nombre solo puede contener letras, números, guiones y guiones bajos");
          return false;
        }

        return {
          name: name.toLowerCase(),
          displayName,
          description,
          permissions,
          color,
          icon
        };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Creando rol...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
          });

          const response = await roleApi.createRole(accessToken, result.value);
          
          if (response.success) {
            Swal.fire("¡Éxito!", "Rol creado correctamente", "success");
            fetchRoles();
          } else {
            throw new Error(response.msg || "Error al crear rol");
          }
        } catch (error) {
          console.error("Error:", error);
          Swal.fire("Error", error.message || "No se pudo crear el rol", "error");
        }
      }
    });
  };

  const handleEditRole = (roleData) => {
    if (roleData.isSystem) {
      Swal.fire("Advertencia", "Los roles del sistema no se pueden editar", "warning");
      return;
    }

    const permissionsByCategory = availablePermissions.reduce((acc, perm) => {
      if (!acc[perm.category]) acc[perm.category] = [];
      acc[perm.category].push(perm);
      return acc;
    }, {});

    const permissionsHtml = Object.entries(permissionsByCategory).