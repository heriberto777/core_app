import React, { useContext, useState, useMemo, useRef, useEffect } from "react";
import SwitchMode from "react-switch";
import { ThemeContext, useAuth, usePermissions, DataUser } from "../../index";
import { NavLink, useLocation } from "react-router-dom";
import { FaMoon, FaSun, FaChevronDown, FaBars, FaTimes } from "react-icons/fa";

/**
 * TopNav (dirección "Grid")
 * Reemplaza al sidebar vertical: navegación en barra superior agrupada por
 * categoría, con menús desplegables en vez de una lista siempre visible.
 */
export function TopNav({ userMenuOpen, setUserMenuOpen }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { hasPermission, isAdmin } = usePermissions();
  const location = useLocation();

  const [openCategory, setOpenCategory] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  const routesConfig = useMemo(
    () => [
      { path: "/dashboard", name: "Dashboard", category: "General", order: 1, isAccessible: true },
      { path: "/tasks", name: "Tareas", category: "Operaciones", order: 2, isAccessible: hasPermission("tasks", "read") },
      { path: "/loads/cargas", name: "Gestión de Cargas", category: "Operaciones", order: 3, isAccessible: hasPermission("loads", "read") },
      { path: "/loads/transfers", name: "Traspasos", category: "Operaciones", order: 4, isAccessible: hasPermission("loads", "read") },
      { path: "/universal-manager", name: "Gestor Universal", description: "Ejecutar procesos ya configurados, con seguimiento en tiempo real", category: "Operaciones", order: 5, isAccessible: isAdmin || hasPermission("documents", "read") },
      { path: "/documents", name: "Documentos", description: "Configurar mapeos de datos y procesar documentos manualmente", category: "Documentos", order: 6, isAccessible: hasPermission("documents", "read") },
      { path: "/summaries", name: "Resúmenes", category: "Análisis", order: 7, isAccessible: hasPermission("reports", "read") },
      { path: "/analytics", name: "Analíticas", category: "Análisis", order: 8, isAccessible: hasPermission("analytics", "read") },
      { path: "/history", name: "Bitácora", category: "Análisis", order: 9, isAccessible: hasPermission("history", "read") },
      { path: "/users", name: "Usuarios", category: "Administración", order: 10, isAccessible: isAdmin && hasPermission("users", "read") },
      { path: "/roles", name: "Roles", category: "Administración", order: 11, isAccessible: isAdmin && hasPermission("roles", "read") },
      { path: "/modules", name: "Módulos", category: "Administración", order: 12, isAccessible: isAdmin && hasPermission("modules", "read") },
      { path: "/configuraciones", name: "Configuraciones", category: "Sistema", order: 13, isAccessible: hasPermission("settings", "read") },
    ],
    [hasPermission, isAdmin]
  );

  const groupedRoutes = useMemo(() => {
    const accessible = routesConfig.filter((r) => r.isAccessible).sort((a, b) => a.order - b.order);
    const categoryOrder = ["General", "Operaciones", "Documentos", "Análisis", "Administración", "Sistema"];
    return categoryOrder
      .map((category) => ({ category, routes: accessible.filter((r) => r.category === category) }))
      .filter((g) => g.routes.length > 0);
  }, [routesConfig]);

  const isCategoryActive = (routes) => routes.some((r) => location.pathname.startsWith(r.path));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenCategory(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    setOpenCategory(null);
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header ref={navRef} className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="h-16 px-6 flex items-center justify-between gap-6">
        {/* BRAND + NAV (desktop) */}
        <div className="flex items-center gap-8 min-w-0">
          <span className="text-base font-extrabold tracking-tight text-slate-900 shrink-0">CATELLI</span>

          <nav className="hidden lg:flex items-center gap-1">
            {groupedRoutes.map(({ category, routes }) => {
              // Un solo elemento en la categoría: link directo, sin desplegable.
              if (routes.length === 1) {
                const route = routes[0];
                return (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    title={route.description || route.name}
                    className={({ isActive }) =>
                      `px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        isActive ? "text-primary-600" : "text-slate-500 hover:text-slate-900"
                      }`
                    }
                  >
                    {route.name}
                  </NavLink>
                );
              }

              const active = isCategoryActive(routes);
              const isOpen = openCategory === category;
              return (
                <div key={category} className="relative">
                  <button
                    onClick={() => setOpenCategory(isOpen ? null : category)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded transition-colors ${
                      active || isOpen ? "text-primary-600" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {category}
                    <FaChevronDown size={9} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 min-w-[220px] bg-white border border-slate-200 shadow-xl py-1 z-50">
                      {routes.map((route) => (
                        <NavLink
                          key={route.path}
                          to={route.path}
                          title={route.description || ""}
                          className={({ isActive }) =>
                            `block px-4 py-2.5 text-sm font-medium transition-colors ${
                              isActive ? "text-primary-600 bg-primary-50" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`
                          }
                        >
                          {route.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* RIGHT: theme + user (desktop) / hamburger (mobile) */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3">
            <SwitchMode
              checked={theme === "dark"}
              onChange={toggleTheme}
              offColor="#e6e6e6"
              onColor="#1447e6"
              uncheckedIcon={<div className="flex justify-center items-center h-full"><FaSun size={11} color="#a3a3a3" /></div>}
              checkedIcon={<div className="flex justify-center items-center h-full"><FaMoon size={11} color="#fff" /></div>}
              width={40}
              height={20}
              handleDiameter={16}
            />
            <DataUser
              stateConfig={{
                openstate: userMenuOpen,
                setOpenState: () => setUserMenuOpen(!userMenuOpen),
              }}
            />
          </div>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 text-slate-600"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {mobileOpen ? <FaTimes size={18} /> : <FaBars size={18} />}
          </button>
        </div>
      </div>

      {/* MOBILE PANEL */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-slate-200 px-4 py-3 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {groupedRoutes.map(({ category, routes }) => (
            <div key={category}>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{category}</div>
              <div className="flex flex-col gap-0.5">
                {routes.map((route) => (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    className={({ isActive }) =>
                      `px-2 py-2 text-sm font-semibold rounded ${isActive ? "text-primary-600 bg-primary-50" : "text-slate-600"}`
                    }
                  >
                    {route.name}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Tema {theme === "dark" ? "oscuro" : "claro"}</span>
            <SwitchMode
              checked={theme === "dark"}
              onChange={toggleTheme}
              offColor="#e6e6e6"
              onColor="#1447e6"
              width={40}
              height={20}
              handleDiameter={16}
            />
          </div>
          <DataUser
            stateConfig={{
              openstate: userMenuOpen,
              setOpenState: () => setUserMenuOpen(!userMenuOpen),
            }}
          />
        </nav>
      )}
    </header>
  );
}

export default TopNav;
