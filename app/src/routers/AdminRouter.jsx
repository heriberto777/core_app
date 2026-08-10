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
// min-h-dvh, no min-h-screen: ver nota en LoginForm.jsx sobre el bug de
// 100vh en navegadores móviles (barra de direcciones).
const AuthLoader = () => (
  <div
    className="flex flex-col items-center justify-center min-h-dvh gap-4 text-slate-600"
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
// subtitle/actions/toolbar se destructuran explícitamente para que lleguen a
// AdminLayout — antes caían en ...props y se spreadeaban sobre <Component>,
// por lo que el subtitle de /configuraciones nunca se mostraba.
const LayoutWrapper = ({ component: Component, title, subtitle, actions, toolbar, ...props }) => (
  <AdminLayout title={title} subtitle={subtitle} actions={actions} toolbar={toolbar}>
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
      {/* Sin `title`: Dashboard.jsx ya dibuja su propio header ("Panel de
          Control" + botón Sincronizar) — pasarlo aquí duplicaba el título,
          uno chico desde AdminLayout y otro grande debajo desde Dashboard. */}
      <Route
        path="/dashboard"
        element={<LayoutWrapper component={Dashboard} />}
      />

      {/* ⭐ RUTAS DE OPERACIONES ⭐ */}
      {/* Sin `title`: TransferTasks ya dibuja su propio header vía
          ContentHeader ("Gestor de Tareas de Sincronización"). */}
      <Route
        path="/tasks"
        element={
          <ProtectedRoute resource="tasks" action="read">
            <LayoutWrapper component={TransferTasks} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: UniversalDocumentManager ya dibuja su propio header
          ("Centro de Operaciones Universales") — el de la ruta era un
          texto distinto ("Gestión de Documentos") mostrado a la vez. */}
      <Route
        path="/universal-manager"
        element={
          <ProtectedRoute resource="documents" action="read">
            <LayoutWrapper component={UniversalDocumentManager} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: LoadsManagement ya dibuja su propio header ("Despacho
          de Cargas") — el de la ruta ("Cargas de Datos") era un texto
          distinto mostrado a la vez, no solo una duplicación. */}
      <Route
        path="/loads/cargas"
        element={
          <ProtectedRoute resource="loads" action="read">
            <LayoutWrapper component={LoadsManagement} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: TraspasoManagement ya dibuja su propio header con el
          mismo texto ("Gestión de Traspasos") — se mostraba duplicado. */}
      <Route
        path="/loads/transfers"
        element={
          <ProtectedRoute resource="loads" action="read">
            <LayoutWrapper component={TraspasoManagement} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: DocumentsVisualization ya dibuja su propio header
          ("Centro de Gestión de Datos") — el de la ruta era un texto
          distinto ("Gestión de Documentos") mostrado a la vez. */}
      <Route
        path="/documents"
        element={
          <ProtectedRoute resource="documents" action="read">
            <LayoutWrapper component={DocumentsVisualization} />
          </ProtectedRoute>
        }
      />

      {/* ⭐ RUTAS DE ANÁLISIS ⭐ */}
      {/* Sin `title`: LoadsResumen ya dibuja su propio header ("Auditoría de
          Traspasos") — el de la ruta ("Resúmenes y Reportes") era un texto
          distinto mostrado a la vez, no solo una duplicación. */}
      <Route
        path="/summaries"
        element={
          <ProtectedRoute resource="reports" action="read">
            <LayoutWrapper component={LoadsResumen} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: Statistics ya dibuja su propio header ("Centro de
          Inteligencia") — el de la ruta era un texto distinto ("Análisis y
          Estadísticas") mostrado a la vez. */}
      <Route
        path="/analytics"
        element={
          <ProtectedRoute resource="analytics" action="read">
            <LayoutWrapper component={Statistics} />
          </ProtectedRoute>
        }
      />

      {/* Sin `title`: AuditCenter ya dibuja su propio header ("Central de
          Auditoría") — el de la ruta era un texto distinto ("Bitácora
          Centralizada") mostrado a la vez. */}
      <Route
        path="/history"
        element={
          <ProtectedRoute resource="history" action="read">
            <LayoutWrapper component={AuditCenter} />
          </ProtectedRoute>
        }
      />

      {/* ⭐ RUTAS DE ADMINISTRACIÓN ⭐ */}
      {/* Los 3 headers propios (UserManagement/RoleManagement/ModuleManager)
          usan un texto distinto al que pasaba la ruta — se deja de pasar
          `title` en los 3, mismo criterio que en las fases anteriores. */}
      <Route
        path="/users"
        element={
          <ProtectedRoute resource="users" action="read" requireAdmin>
            <LayoutWrapper component={UserManagement} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/roles"
        element={
          <ProtectedRoute resource="roles" action="read" requireAdmin>
            <LayoutWrapper component={RoleManagement} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/modules"
        element={
          <ProtectedRoute resource="modules" action="read" requireAdmin>
            <LayoutWrapper component={ModuleManager} />
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
