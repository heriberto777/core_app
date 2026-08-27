import React, { useState } from "react";
import { useAuth, useTrucks, usePermissions, TruckFormModal, TrucksTable, Button } from "../../index";
import { FaPlus, FaSearch, FaTruck } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * TrucksManagement (Tailwind Edition)
 * Maestro propio de Camiones — reemplaza la dependencia de CATELLI.trucks
 * como fuente para la sincronización a server2. El repartidor se asigna acá
 * mismo, en el formulario de alta/edición (no hace falta un "Centro de
 * Carga" aparte como en rutas, porque acá no hay muchos-a-uno: cada camión
 * es su propia fila con su repartidor directo).
 */
export function TrucksManagement() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState(null);

  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  const { trucks, repartidores, loading, searchTerm, setSearchTerm, statusFilter, setStatusFilter, actions } =
    useTrucks(accessToken);

  const canCreate = hasPermission("trucks", "create") || isAdmin;

  const handleEdit = (truck) => {
    setSelectedTruck(truck);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedTruck(null);
    setModalOpen(true);
  };

  const handleSave = async (code, data) => {
    try {
      await actions.saveTruck(code, data);
      Swal.fire({
        icon: "success",
        title: code ? "Camión actualizado" : "Camión creado",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "Error al guardar el camión", "error");
      throw e;
    }
  };

  const handleToggleActive = async (code, currentActive) => {
    try {
      await actions.toggleActive(code, currentActive);
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo cambiar el estado", "error");
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Gestión de Camiones</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Maestro propio de camiones y repartidor asignado — la fuente de verdad ya no es el ERP.
        </p>
      </header>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-lg">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar por código, descripción o placa..."
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
            <option value="all">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={handleAdd}>
            <FaPlus /> Nuevo Camión
          </Button>
        )}
      </div>

      {loading && trucks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <FaTruck size={32} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">Cargando camiones...</p>
          </div>
        </div>
      ) : (
        <TrucksTable trucks={trucks} loading={loading} onEdit={handleEdit} onToggleActive={handleToggleActive} />
      )}

      <TruckFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={selectedTruck}
        repartidores={repartidores}
      />
    </div>
  );
}
