import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  AdminLayout,
  Auth,
  useAuth,
  usePermissions,
  Dashboard,
  TransferTasks,
  LoadsTasks,
  LoadsResumen,
  Statistics,
  DocumentsVisualization,
  TransferHistoryLogs,
  UserManagement,
  RoleManagement,
  ConfigurationPage,
  UserProfile,
  ModuleManager,
  LogsPage,
} from "../index";

// ⭐ COMPONENTE DE LOADING MEJORADO ⭐
const AuthLoader = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      gap: "1rem",
      fontSize: "18px",
      color: "#666",
    }}
  >
    <div style={{ fontSize: "2rem" }}>🔄</div>
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
        path="/loads"
        element={
          <ProtectedRoute resource="loads" action="read">
            <LayoutWrapper component={LoadsTasks} title="Cargas de Datos" />
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
        path="/historys"
        element={
          <ProtectedRoute resource="history" action="read">
            <LayoutWrapper
              component={TransferHistoryLogs}
              title="Historial de Transferencias"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/logs"
        element={
          <ProtectedRoute resource="logs" action="read">
            <LayoutWrapper component={LogsPage} title="Logs del sistema" />
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
