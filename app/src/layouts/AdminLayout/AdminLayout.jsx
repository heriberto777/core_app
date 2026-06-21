import React, { useState, useEffect, createContext, useCallback } from "react";
import { Sidebar, Header, useAuth, NotificationContainer, LoadingSpinner } from "../../index";

// Contexto para el Layout
export const LayoutContext = createContext();

/**
 * Corporate AdminLayout (Tailwind Edition)
 * Estilo corporativo suave y ligero.
 */
export function AdminLayout({
  children,
  title,
  subtitle,
  actions,
  toolbar,
  loading = false,
  error = null,
}) {
  const { user, reloadUserPermissions } = useAuth();

  // Estados del layout
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(loading);

  // Manejo responsivo
  useEffect(() => {
    const handleResize = () => {
      const isLarge = window.innerWidth > 1024;
      if (!isLarge && sidebarOpen) {
        setSidebarOpen(false);
      } else if (isLarge && !sidebarOpen) {
        setSidebarOpen(true);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  // Funciones del layout
  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleUserMenu = useCallback(() => setUserMenuOpen((prev) => !prev), []);
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), []);

  const handleOutsideClick = useCallback((e) => {
    if (userMenuOpen) closeUserMenu();
    if (window.innerWidth <= 1024 && sidebarOpen) {
      if (!e.target.closest(".sidebar-wrapper") && !e.target.closest(".sidebar-toggle")) {
        closeSidebar();
      }
    }
  }, [userMenuOpen, sidebarOpen, closeUserMenu, closeSidebar]);

  const layoutContextValue = {
    sidebarOpen, setSidebarOpen, toggleSidebar, closeSidebar,
    userMenuOpen, setUserMenuOpen, toggleUserMenu, closeUserMenu,
    pageLoading, setPageLoading,
  };

  if (error) {
    return (
      <LayoutContext.Provider value={layoutContextValue}>
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-500 mb-2">Error en la aplicación</h2>
          <p className="text-slate-500 mb-6 max-w-md">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary-600 text-white rounded-xl font-semibold shadow-soft hover:bg-primary-700"
          >
            Recargar página
          </button>
        </div>
      </LayoutContext.Provider>
    );
  }

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      <div 
        className="flex min-h-screen bg-slate-50 text-slate-900 transition-all duration-300"
        onClick={handleOutsideClick}
      >
        {/* SIDEBAR WRAPPER */}
        <div className={`sidebar-wrapper transition-all duration-300 ${sidebarOpen ? 'w-[260px]' : 'w-[72px] lg:block hidden'}`}>
          <Sidebar state={sidebarOpen} setState={setSidebarOpen} />
        </div>

        {/* OVERLAY PARA MÓVIL */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* MAIN CONTAINER */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* HEADER */}
          <header className="h-[70px] bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-6 flex items-center justify-between">
            <Header
              stateConfig={{
                openstate: userMenuOpen,
                setOpenState: () => setUserMenuOpen(!userMenuOpen),
              }}
              sidebarConfig={{
                isOpen: sidebarOpen,
                toggleSidebar: toggleSidebar,
              }}
            />
          </header>

          {/* PAGE CONTENT */}
          <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            {/* TITLE AREA */}
            {(title || toolbar) && (
              <div className="px-6 py-8 border-b border-slate-200 bg-white/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    {title && <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>}
                    {subtitle && <p className="text-slate-500 mt-1 font-medium">{subtitle}</p>}
                  </div>
                  {toolbar && <div className="flex flex-wrap gap-3">{toolbar}</div>}
                </div>
              </div>
            )}

            {/* ACTIONS AREA */}
            {actions && (
              <div className="px-6 py-4 flex flex-wrap gap-3 items-center justify-between">
                {actions}
              </div>
            )}

            {/* MAIN MAIN CONTENT */}
            <div className="flex-1 p-6 flex flex-col">
              {pageLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
                  <LoadingSpinner size="large" type="ring" />
                  <p className="text-slate-400 font-medium animate-pulse">Cargando contenido...</p>
                </div>
              ) : (
                <div className="animate-fadeIn">
                  {children}
                </div>
              )}
            </div>
          </main>
        </div>

        <NotificationContainer />
      </div>
    </LayoutContext.Provider>
  );
}

export default AdminLayout;
