import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout/AdminLayout";
import { Auth } from "../pages/admin/Auth/Auth";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { Dashboard } from "../components/templates/Dashboard";
import { TransferTasks } from "../components/templates/TransferTask";
import { LoadsManagement } from "../components/templates/LoadsManagement";
import { LoadsResumen } from "../components/templates/LoadsResumen";
import { LoadsTasks } from "../components/templates/LoadsTasks";
import { Statistics } from "../components/templates/Statistics";
import { DocumentsVisualization } from "../components/templates/DocumentsVisualization";
import { ModuleManager } from "../components/templates/ModuleManager";
import { AuditCenter } from "../components/templates/AuditCenter";
import { TraspasoManagement } from "../components/templates/TraspasoManagement";
import { UserManagement } from "../components/templates/UserManagement";
import { RoleManagement } from "../components/templates/RoleManagement";
import { ConfigurationPage } from "../components/templates/ConfigurationPage";
import { UserProfile } from "../components/organismos/UserProfile";
import { UniversalDocumentManager } from "../components/templates/UniversalDocumentManager";

// ⭐ COMPONENTE DE LOADING MEJORADO ⭐
const AuthLoader = () => (
  <div
    className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-600"
  >
    <div className="text-6xl">🔄</div>
    <div>Cargando aplicación...</div>
  </div>
);

// ⭐ REDIRECCIÓN INTELIGENTE MEJORADA ⭐
const SmartRedirect = () => {
  const { getDefaultRoute } = usePermissions();
  const defaultRoute = getDefaultRoute();

  console.log("🎯 Redirigiendo a ruta por defecto:", defaultRoute);
  return <Navigate to={defaultRoute} replace />;
};

// ⭐ COMPONENTE DE RUTA PROTEGIDA OPTIMIZADO ⭐
const ProtectedRoute = ({
  children,
  resource,
  action,
  requireAdmin = false,
  fallbackRoute = null,
}) => {
  const { user } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  // Verificar autenticación
  if (!user) {
    console.log("❌ Usuario no autenticado, redirigiendo a login");
    return <Navigate to="/" replace />;
  }

  // Verificar si requiere privilegios de admin
  if (requireAdmin && !isAdmin) {
    console.log("❌ Se requieren privilegios de administrador");
    return fallbackRoute ? (
      <Navigate to={fallbackRoute} replace />
    ) : (
      <SmartRedirect />
    );
  }

  // Verificar permisos específicos
  if (resource && action && !hasPermission(resource, action)) {
    console.log(`❌ Sin permisos: ${resource}.${action}`);
    return fallbackRoute ? (
      <Navigate to={fallbackRoute} replace />
    ) : (
      <SmartRedirect />
    );
  }

  return children;
};

// ⭐ WRAPPER PARA COMPONENTES CON LAYOUT ⭐
const LayoutWrapper = ({ component: Component, title, ...props }) => (
  <AdminLayout title={title}>
    <Component {...props} />
  </AdminLayout>
);

// ⭐ COMPONENTE PRINCIPAL DEL ROUTER ⭐
export function AdminRouter() {
  const { user, loading, error } = useAuth();

  // Estado de carga
  if (loading) {
    return <AuthLoader />;
  }

  // Error en autenticación
  if (error) {
    console.error("❌ Error de autenticación:", error);
  }

  // Usuario no autenticado
  if (!user) {
    return (
      <Routes>
        <Route path="/*" element={<Auth />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* ⭐ REDIRECCIÓN INICIAL ⭐ */}
      <Route path="/" element={<SmartRedirect />} />

      {/* ⭐ DASHBOARD - ACCESO UNIVERSAL ⭐ */}
      <Route
        path="/dashboard"
        element={
          <LayoutWrapper component={Dashboard} title="Panel de Control" />
        }
      />

      {/* ⭐ RUTAS DE OPERACIONES ⭐ */}
      <Route
        path="/tasks"
        element={
          <ProtectedRoute resource="tasks" action="read">
            <LayoutWrapper
              component={TransferTasks}
              title="Gestión de Tareas"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/universal-manager"
        element={
          <ProtectedRoute resource="documents" action="read">
            <LayoutWrapper
              component={UniversalDocumentManager}
              title="Gestión de Documentos"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/loads/cargas"
        element={
          <ProtectedRoute resource="loads" action="read">
            <LayoutWrapper
              component={LoadsManagement}
              title="Cargas de Datos"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/loads/transfers"
        element={
          <ProtectedRoute resource="loads" action="read">
            <LayoutWrapper
              component={TraspasoManagement}
              title="Gestión de Traspasos"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/documents"
        element={
          <ProtectedRoute resource="documents" action="read">
            <LayoutWrapper
              component={DocumentsVisualization}
              title="Gestión de Documentos"
            />
          </ProtectedRoute>
        }
      />

      {/* ⭐ RUTAS DE ANÁLISIS ⭐ */}
      <Route
        path="/summaries"
        element={
          <ProtectedRoute resource="reports" action="read">
            <LayoutWrapper
              component={LoadsResumen}
              title="Resúmenes y Reportes"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics"
        element={
          <ProtectedRoute resource="analytics" action="read">
            <LayoutWrapper
              component={Statistics}
              title="Análisis y Estadísticas"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/history"
        element={
          <ProtectedRoute resource="history" action="read">
            <LayoutWrapper
              component={AuditCenter}
              title="Bitácora Centralizada"
            />
          </ProtectedRoute>
        }
      />

      {/* ⭐ RUTAS DE ADMINISTRACIÓN ⭐ */}
      <Route
        path="/users"
        element={
          <ProtectedRoute resource="users" action="read" requireAdmin>
            <LayoutWrapper
              component={UserManagement}
              title="Gestión de Usuarios"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/roles"
        element={
          <ProtectedRoute resource="roles" action="read" requireAdmin>
            <LayoutWrapper
              component={RoleManagement}
              title="Gestión de Roles"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/modules"
        element={
          <ProtectedRoute resource="modules" action="read" requireAdmin>
            <LayoutWrapper
              component={ModuleManager}
              title="Gestión de Modulos"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/configuraciones"
        element={
          <ProtectedRoute resource="settings" action="read">
            <LayoutWrapper
              component={ConfigurationPage}
              title="Configuraciones"
              subtitle="Panel central para la gestión técnica y operativa del ecosistema logístico"
            />
          </ProtectedRoute>
        }
      />

      {/* ⭐ PERFIL DE USUARIO - ACCESO UNIVERSAL ⭐ */}
      <Route
        path="/perfil"
        element={<LayoutWrapper component={UserProfile} title="Mi Perfil" />}
      />

      {/* ⭐ RUTA CATCH-ALL ⭐ */}
      <Route path="*" element={<SmartRedirect />} />
    </Routes>
  );
}
