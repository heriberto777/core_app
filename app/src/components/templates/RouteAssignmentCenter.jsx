import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useAuth,
  useRouteAssignment,
  usePermissions,
  ClientAssignmentTable,
  RouteAssignmentModal,
  SellerRouteAssignmentModal,
  Button,
  StatCard,
} from "../../index";
import { FaSearch, FaRoute, FaTimesCircle, FaMapMarkedAlt, FaArrowLeft, FaUsers, FaTruck } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * RouteAssignmentCenter (Tailwind Edition)
 * Centro de Carga: filtrar clientes (por vendedor, estado de ruta, búsqueda),
 * seleccionar varios y asignarles Ruta · Días · Frecuencia · Semana en lote.
 */
export function RouteAssignmentCenter() {
  const [repartoModalOpen, setRepartoModalOpen] = useState(false);
  const [ventaModalOpen, setVentaModalOpen] = useState(false);
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const canUpdate = hasPermission("routes", "update") || isAdmin;

  const {
    clients,
    sellers,
    erpRoutes,
    loading,
    hasSearched,
    filters,
    setFilters,
    applyFilters,
    selectedCodes,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    actions,
  } = useRouteAssignment(accessToken);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Contadores del resultado actual — se calculan de lo que ya está cargado
  // en el navegador, sin pegarle de nuevo al backend.
  const stats = useMemo(() => {
    const total = clients.length;
    const conVenta = clients.filter((c) => c.current_seller_route).length;
    const conReparto = clients.filter((c) => c.current_route).length;
    const sinNinguna = clients.filter((c) => !c.current_seller_route && !c.current_route).length;
    return { total, conVenta, conReparto, sinNinguna };
  }, [clients]);

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") applyFilters();
  };

  const handleAssignReparto = async (assignmentData) => {
    try {
      const resp = await actions.assignRoute(assignmentData);
      Swal.fire({
        icon: "success",
        title: resp.message || "Ruta de reparto asignada",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "Error al asignar la ruta de reparto", "error");
      throw e;
    }
  };

  const handleRemoveReparto = async () => {
    const result = await Swal.fire({
      title: "¿Quitar de ruta de reparto?",
      text: `Se va a quitar la asignación de reparto a ${selectedCodes.length} cliente(s).`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, quitar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        const resp = await actions.removeFromRoute();
        Swal.fire("Listo", resp.message || "Clientes removidos de su ruta de reparto", "success");
      } catch (e) {
        Swal.fire("Error", e.message || "Error al quitar la ruta de reparto", "error");
      }
    }
  };

  const handleAssignVenta = async (assignmentData) => {
    try {
      const resp = await actions.assignSellerRoute(assignmentData);
      Swal.fire({
        icon: "success",
        title: resp.message || "Ruta de venta asignada",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "Error al asignar la ruta de venta", "error");
      throw e;
    }
  };

  const handleRemoveVenta = async () => {
    const result = await Swal.fire({
      title: "¿Quitar de ruta de venta?",
      text: `Se va a quitar la asignación de venta a ${selectedCodes.length} cliente(s).`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, quitar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        const resp = await actions.removeFromSellerRoute();
        Swal.fire("Listo", resp.message || "Clientes removidos de su ruta de venta", "success");
      } catch (e) {
        Swal.fire("Error", e.message || "Error al quitar la ruta de venta", "error");
      }
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      <header>
        <Link to="/rutas" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-primary-600 transition-colors mb-3">
          <FaArrowLeft size={12} /> Gestión de Rutas
        </Link>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Centro de Carga de Rutas</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Filtrá clientes, seleccioná varios y asignales Ruta · Días · Frecuencia · Semana en lote.
        </p>
      </header>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-soft flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Buscar por código o nombre..."
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
          />
        </div>

        <select
          value={filters.seller}
          onChange={(e) => handleFilterChange("seller", e.target.value)}
          className="py-3 px-4 rounded-xl border border-slate-200 focus:border-primary-500 outline-none text-sm font-medium bg-white"
        >
          <option value="">Todos los vendedores</option>
          {sellers.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={filters.routeStatus}
          onChange={(e) => handleFilterChange("routeStatus", e.target.value)}
          className="py-3 px-4 rounded-xl border border-slate-200 focus:border-primary-500 outline-none text-sm font-medium bg-white"
        >
          <option value="all">Cualquier ruta nueva</option>
          <option value="unassigned">Sin asignar (ruta nueva)</option>
        </select>

        <select
          value={filters.erpRouteCode}
          onChange={(e) => handleFilterChange("erpRouteCode", e.target.value)}
          className="py-3 px-4 rounded-xl border border-slate-200 focus:border-primary-500 outline-none text-sm font-medium bg-white"
          title="Filtra por la ruta que el cliente tiene hoy en el ERP — solo para ubicarlos, no se guarda"
        >
          <option value="">Cualquier ruta ERP</option>
          {erpRoutes.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} — {r.description}
            </option>
          ))}
        </select>

        <Button variant="primary" onClick={applyFilters} disabled={loading}>
          <FaSearch /> Buscar
        </Button>
      </div>

      {hasSearched && clients.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Clientes encontrados" value={stats.total} icon={<FaUsers />} />
          <StatCard title="Con Ruta de Venta" value={stats.conVenta} icon={<FaRoute />} color="#4f46e5" />
          <StatCard title="Con Ruta de Reparto" value={stats.conReparto} icon={<FaTruck />} color="#0E7C86" />
          <StatCard title="Sin ninguna asignación" value={stats.sinNinguna} icon={<FaSearch />} color="#94a3b8" />
        </div>
      )}

      {selectedCodes.length > 0 && canUpdate && (
        <div className="bg-primary-600 text-white p-4 rounded-xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
          <span className="font-bold text-sm">
            {selectedCodes.length} cliente{selectedCodes.length === 1 ? "" : "s"} seleccionado{selectedCodes.length === 1 ? "" : "s"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="!text-white hover:!bg-white/10" onClick={clearSelection}>
              Cancelar selección
            </Button>
            <div className="w-px h-6 bg-white/20 hidden md:block" />
            <Button variant="ghost" className="!text-white hover:!bg-white/10" onClick={handleRemoveVenta}>
              <FaTimesCircle /> Quitar de Venta
            </Button>
            <Button variant="secondary" onClick={() => setVentaModalOpen(true)}>
              <FaRoute /> Asignar Ruta de Venta
            </Button>
            <div className="w-px h-6 bg-white/20 hidden md:block" />
            <Button variant="ghost" className="!text-white hover:!bg-white/10" onClick={handleRemoveReparto}>
              <FaTimesCircle /> Quitar de Reparto
            </Button>
            <Button variant="secondary" onClick={() => setRepartoModalOpen(true)}>
              <FaRoute /> Asignar Ruta de Reparto
            </Button>
          </div>
        </div>
      )}

      {!hasSearched ? (
        <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <FaSearch size={32} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">Elegí un filtro y apretá Buscar</p>
            <p className="text-sm text-slate-400 mt-1">Hay miles de clientes activos — no se cargan todos de una para no hacer todo lento.</p>
          </div>
        </div>
      ) : loading && clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <FaMapMarkedAlt size={32} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">Cargando clientes...</p>
          </div>
        </div>
      ) : (
        <ClientAssignmentTable
          clients={clients}
          loading={loading}
          selectedCodes={selectedCodes}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}

      <RouteAssignmentModal
        isOpen={repartoModalOpen}
        onClose={() => setRepartoModalOpen(false)}
        onSave={handleAssignReparto}
        selectedCount={selectedCodes.length}
        accessToken={accessToken}
      />

      <SellerRouteAssignmentModal
        isOpen={ventaModalOpen}
        onClose={() => setVentaModalOpen(false)}
        onSave={handleAssignVenta}
        selectedCount={selectedCodes.length}
        accessToken={accessToken}
      />
    </div>
  );
}
