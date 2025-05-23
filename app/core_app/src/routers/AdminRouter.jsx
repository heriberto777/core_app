// AdminRouter.jsx (Optimizado)
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
  DocumentsVisualization,
  ConsecutiveManager,
  TransferHistoryLogs,
} from "../index";

// Componente de envoltura para aplicar el AdminLayout a todas las rutas
const ProtectedRoute = ({ component: Component }) => {
  const { user } = useAuth();

  // Verificar si el usuario está autenticado
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Verificar acceso a la ruta (puedes personalizarlo según tus necesidades)
  const hasAccess = (requiredRoles) => {
    if (!user || !user.role) return false;
    return requiredRoles.some((role) => user.role.includes(role));
  };

  // Si el usuario no tiene acceso, redirigir a unauthorized
  if (!hasAccess(["admin", "dashboard"])) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Aplicar el AdminLayout y renderizar el componente
  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
};

export function AdminRouter() {
  const { user } = useAuth();

  // Si no hay usuario autenticado, mostrar la pantalla de autenticación
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

      {/* Aplicar AdminLayout a todas las rutas protegidas */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute component={Dashboard} />}
      />
      <Route
        path="/tasks"
        element={<ProtectedRoute component={TransferTasks} />}
      />
      <Route
        path="/loads"
        element={<ProtectedRoute component={LoadsTasks} />}
      />
      <Route
        path="/email-recipients"
        element={<ProtectedRoute component={ControlPlanilla} />}
      />
      <Route
        path="/summaries"
        element={<ProtectedRoute component={LoadsResumen} />}
      />
      <Route
        path="/analytics"
        element={<ProtectedRoute component={Statistics} />}
      />
      <Route path="/logs" element={<ProtectedRoute component={LogsPage} />} />
      <Route
        path="/documents"
        element={<ProtectedRoute component={DocumentsVisualization} />}
      />

      <Route
        path="/consecutives"
        element={<ProtectedRoute component={ConsecutiveManager} />}
      />

      <Route
        path="/historys"
        element={<ProtectedRoute component={TransferHistoryLogs} />}
      />

      {/* Opcionalmente, puedes tener rutas secundarias o que no requieran el AdminLayout */}
      <Route
        path="/unauthorized"
        element={<div>No tienes permisos para acceder a esta página</div>}
      />
      <Route path="*" element={<div>Página no encontrada</div>} />
    </Routes>
  );
}
