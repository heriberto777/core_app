import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useRoutes, usePermissions, RouteFormModal, RoutesTable, Button } from "../../index";
import { FaPlus, FaSearch, FaRoute, FaUsersCog } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * RoutesManagement (Tailwind Edition)
 * Maestro propio de Rutas — reemplaza la dependencia de erpadmin.RUTA_RT.
 */
export function RoutesManagement() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  const { routes, loading, searchTerm, setSearchTerm, statusFilter, setStatusFilter, actions } =
    useRoutes(accessToken);

  const canCreate = hasPermission("routes", "create") || isAdmin;

  const handleEdit = (route) => {
    setSelectedRoute(route);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedRoute(null);
    setModalOpen(true);
  };

  const handleSave = async (codeRoute, data) => {
    try {
      await actions.saveRoute(codeRoute, data);
      Swal.fire({
        icon: "success",
        title: codeRoute ? "Ruta actualizada" : "Ruta creada",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "Error al guardar la ruta", "error");
      throw e;
    }
  };

  const handleToggleActive = async (codeRoute, currentActive) => {
    try {
      await actions.toggleActive(codeRoute, currentActive);
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo cambiar el estado", "error");
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Gestión de Rutas</h1>
          <p className="text-slate-500 mt-2 font-medium">
            Maestro propio de rutas de reparto/visita — la fuente de verdad ya no es el ERP.
          </p>
        </div>
        <Link to="/rutas/asignacion">
          <Button variant="secondary">
            <FaUsersCog /> Centro de Carga
          </Button>
        </Link>
      </header>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-lg">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar por código o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-3 px-4 rounded-xl border border-slate-200 focus:border-primary-500 outline-none text-sm font-medium bg-white"
          >
            <option value="all">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </select>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={handleAdd}>
            <FaPlus /> Nueva Ruta
          </Button>
        )}
      </div>

      {loading && routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <FaRoute size={32} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">Cargando rutas...</p>
          </div>
        </div>
      ) : (
        <RoutesTable routes={routes} loading={loading} onEdit={handleEdit} onToggleActive={handleToggleActive} />
      )}

      <RouteFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={selectedRoute}
      />
    </div>
  );
}
