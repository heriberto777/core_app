import React, { useState, createContext } from "react";
import { TopNav, useAuth, NotificationContainer, LoadingSpinner } from "../../index";

// Contexto para el Layout
export const LayoutContext = createContext();

/**
 * AdminLayout — dirección "Grid"
 * Barra de navegación superior en vez de sidebar: el contenido usa todo el
 * ancho disponible, la navegación se agrupa por categoría en desplegables.
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

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(loading);

  const layoutContextValue = {
    userMenuOpen, setUserMenuOpen,
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
            className="px-6 py-2 bg-primary-600 text-white rounded font-semibold hover:bg-primary-700"
          >
            Recargar página
          </button>
        </div>
      </LayoutContext.Provider>
    );
  }

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <TopNav userMenuOpen={userMenuOpen} setUserMenuOpen={setUserMenuOpen} />

        <main className="max-w-[1600px] mx-auto flex flex-col">
          {/* TITLE AREA */}
          {(title || toolbar) && (
            <div className="px-6 py-8 border-b border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  {title && <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>}
                  {subtitle && <p className="text-slate-500 mt-1 font-medium text-sm">{subtitle}</p>}
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

          {/* MAIN CONTENT */}
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

        <NotificationContainer />
      </div>
    </LayoutContext.Provider>
  );
}

export default AdminLayout;
