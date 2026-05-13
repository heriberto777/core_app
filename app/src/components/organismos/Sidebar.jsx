import React, { useContext, useState, useMemo } from "react";
import SwitchMode from "react-switch";
import { ThemeContext, useAuth, usePermissions } from "../../index";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaMoon,
  FaSun,
  FaSignOutAlt,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { LayoutContext } from "../../layouts/AdminLayout/AdminLayout";

/**
 * Corporate Sidebar (Tailwind Edition)
 * Estilo corporativo suave y ligero.
 */
export function Sidebar({ state, setState }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { logout, user } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const layoutContext = useContext(LayoutContext);

  const [hoveredCategory, setHoveredCategory] = useState(null);

  const isOpen = layoutContext?.sidebarOpen !== undefined ? layoutContext.sidebarOpen : state;
  const toggleSidebar = layoutContext?.toggleSidebar || setState;

  const routesConfig = useMemo(
    () => [
      { path: "/dashboard", name: "Dashboard", icon: "🏠", category: "General", order: 1, isAccessible: true },
      { path: "/tasks", name: "Tareas", icon: "📋", category: "Operaciones", order: 2, isAccessible: hasPermission("tasks", "read") },
      { path: "/loads/cargas", name: "Gestión de Cargas", icon: "🚛", category: "Operaciones", order: 3, isAccessible: hasPermission("loads", "read") },
      { path: "/loads/transfers", name: "Traspasos", icon: "🔄", category: "Operaciones", order: 4, isAccessible: hasPermission("loads", "read") },
      { path: "/universal-manager", name: "Gestor Universal", icon: "🌍", category: "Operaciones", order: 5, isAccessible: isAdmin || hasPermission("documents", "read") },
      { path: "/documents", name: "Documentos", icon: "📄", category: "Documentos", order: 6, isAccessible: hasPermission("documents", "read") },
      { path: "/summaries", name: "Resúmenes", icon: "📊", category: "Análisis", order: 7, isAccessible: hasPermission("reports", "read") },
      { path: "/analytics", name: "Analíticas", icon: "📈", category: "Análisis", order: 8, isAccessible: hasPermission("analytics", "read") },
      { path: "/history", name: "Bitácora", icon: "🕐", category: "Análisis", order: 9, isAccessible: hasPermission("history", "read") },
      { path: "/users", name: "Usuarios", icon: "👥", category: "Administración", order: 10, isAccessible: isAdmin && hasPermission("users", "read") },
      { path: "/roles", name: "Roles", icon: "🔐", category: "Administración", order: 11, isAccessible: isAdmin && hasPermission("roles", "read") },
      { path: "/modules", name: "Modulos", icon: "🔐", category: "Administración", order: 12, isAccessible: isAdmin && hasPermission("modules", "read") },
      { path: "/configuraciones", name: "Configuraciones", icon: "⚙️", category: "Sistema", order: 13, isAccessible: hasPermission("settings", "read") },
      { path: "/perfil", name: "Mi Perfil", icon: "👤", category: "Personal", order: 20, isAccessible: true },
    ],
    [hasPermission, isAdmin]
  );

  const groupedRoutes = useMemo(() => {
    const accessibleRoutes = routesConfig
      .filter((route) => route.isAccessible)
      .sort((a, b) => a.order - b.order);

    return accessibleRoutes.reduce((acc, route) => {
      if (!acc[route.category]) acc[route.category] = [];
      acc[route.category].push(route);
      return acc;
    }, {});
  }, [routesConfig]);

  const handleLogout = () => {
    if (window.confirm("¿Estás seguro de que deseas cerrar sesión?")) {
      logout();
    }
  };

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-50 flex flex-col h-screen transition-all duration-300 ease-in-out
        bg-white border-right border-slate-200 shadow-xl lg:static lg:shadow-none
        ${isOpen ? "w-[260px]" : "w-[72px]"}
        ${!isOpen && "lg:w-[72px]"}
      `}
    >
      {/* HEADER */}
      <header className="flex items-center justify-between h-[70px] px-4 border-b border-slate-100">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-2xl flex-shrink-0">📊</span>
          {isOpen && <span className="font-bold text-primary-600 truncate">Control Panel</span>}
        </div>
        <button 
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-primary-500 transition-colors"
        >
          {isOpen ? <FaChevronLeft /> : <FaChevronRight />}
        </button>
      </header>

      {/* USER INFO */}
      {user && (
        <div className={`flex items-center gap-3 p-4 border-b border-slate-50 overflow-hidden ${!isOpen && 'justify-center'}`}>
          <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center font-bold flex-shrink-0">
            {user.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          {isOpen && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
              <div className="text-xs text-slate-400 truncate">
                {isAdmin ? "Administrador" : user.roles?.[0]?.displayName || "Usuario"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
        {Object.entries(groupedRoutes).map(([category, routes]) => (
          <div key={category} className="mb-6">
            {isOpen && (
              <h3 className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {category}
              </h3>
            )}
            <div className="space-y-1">
              {routes.map((route) => (
                <NavLink
                  key={route.path}
                  to={route.path}
                  className={({ isActive }) => `
                    flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200
                    ${isActive 
                      ? 'bg-primary-50 text-primary-600 font-semibold' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                    ${!isOpen && 'justify-center px-0'}
                  `}
                  title={!isOpen ? route.name : ""}
                >
                  <span className={`text-xl ${!isOpen && 'scale-110'}`}>{route.icon}</span>
                  {isOpen && <span className="text-sm truncate">{route.name}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* FOOTER */}
      <footer className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/50">
        <div className={`flex items-center gap-3 ${!isOpen && 'justify-center'}`}>
          <SwitchMode
            checked={theme === "dark"}
            onChange={toggleTheme}
            offColor="#e2e8f0"
            onColor="#3b66f5"
            uncheckedIcon={<div className="flex justify-center items-center h-full"><FaSun size={12} color="#f59e0b" /></div>}
            checkedIcon={<div className="flex justify-center items-center h-full"><FaMoon size={12} color="#fff" /></div>}
            width={44}
            height={22}
          />
          {isOpen && <span className="text-xs font-medium text-slate-500">Tema {theme === "dark" ? "Oscuro" : "Claro"}</span>}
        </div>

        <button 
          onClick={handleLogout}
          className={`
            flex items-center gap-3 w-full p-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors
            ${!isOpen && 'justify-center p-0'}
          `}
        >
          <FaSignOutAlt />
          {isOpen && <span className="text-sm font-medium">Cerrar Sesión</span>}
        </button>
      </footer>
    </aside>
  );
}
