import { Routes, Route, Navigate } from "react-router-dom";
import {
  AdminLayout,
  Auth,
  useAuth,
  Dashboard,
  TransferTasks,
  LoadsTasks,
  ControlPlanilla,
  LoadsResumen,
  Statistics,
  LogsPage,
} from "../index";

const LoadLayout = ({ Layout, Page }) => {
  return (
    <Layout>
      <Page />
    </Layout>
  );
};

// Validar que el usuario tiene acceso
const hasAccess = (user, requiredRoles) => {
  if (!user || !user.role) return false;
  return requiredRoles.some((role) => user.role.includes(role));
};

export function AdminRouter() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/*" element={<Auth />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Redirigir automáticamente al Dashboard después del login */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Asegurar que Dashboard tiene un componente válido */}
      <Route
        path="/dashboard"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={Dashboard} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/tasks"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={TransferTasks} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/loads"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={LoadsTasks} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/email-recipients"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={ControlPlanilla} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/summaries"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={LoadsResumen} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/task/analytics"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={Statistics} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
      <Route
        path="/task/logs"
        element={
          hasAccess(user, ["admin", "dashboard"]) ? (
            <LoadLayout Layout={AdminLayout} Page={LogsPage} />
          ) : (
            <Navigate to="/unauthorized" />
          )
        }
      />
    </Routes>
  );
}
