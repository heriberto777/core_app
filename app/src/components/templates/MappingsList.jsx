import React from "react";
import { useAuth, useMappings, StatusBadge, Button, LoadingUI } from "../../index";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaEye, FaSync } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * MappingsList (Tailwind Edition)
 * Gestión de configuraciones de mapeo con diseño corporativo suave.
 */
export function MappingsList({
  onSelectMapping,
  onEditMapping,
  onCreateMapping,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}) {
  const { accessToken } = useAuth();
  const {
    filteredMappings,
    loading,
    search,
    setSearch,
    deleteMapping,
    toggleMappingStatus
  } = useMappings(accessToken, true);

  const handleDelete = async (id, name) => {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar configuración?",
        text: `¿Está seguro de eliminar la configuración "${name}"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        await deleteMapping(id);
        Swal.fire("Eliminado", "La configuración ha sido eliminada", "success");
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo eliminar la configuración" });
    }
  };

  const handleToggleStatus = async (id, name, currentStatus) => {
    try {
      const result = await Swal.fire({
        title: currentStatus ? "¿Desactivar?" : "¿Activar?",
        text: `¿Desea cambiar el estado de "${name}" a ${currentStatus ? 'Inactivo' : 'Activo'}?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, cambiar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        await toggleMappingStatus(id, currentStatus);
        Swal.fire(
          currentStatus ? "Desactivado" : "Activado",
          `El mapeo ahora está ${currentStatus ? 'Inactivo' : 'Activo'}`,
          "success"
        );
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo cambiar el estado", "error");
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* HEADER & SEARCH */}
      <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">Mapeos de Datos</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Configuraciones de integración</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 md:items-center flex-1 max-w-2xl justify-end">
          <div className="relative flex-1 max-w-sm">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar configuración..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full py-2.5 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
            />
          </div>
          {canCreate && (
            <Button variant="primary" onClick={onCreateMapping}>
              <FaPlus /> Nuevo Mapeo
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingUI message="Obteniendo configuraciones..." />
      ) : (
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden">
          {filteredMappings.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="text-5xl opacity-20">📂</div>
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No se encontraron configuraciones.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Flujo (Origen → Destino)</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMappings.map((mapping) => (
                    <tr key={mapping._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-extrabold text-slate-700">{mapping.name}</div>
                        <div className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]">{mapping.description || "Sin descripción"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-tight">{mapping.transferType}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                          <span className="text-primary-600">{mapping.sourceServer}</span>
                          <FaSync className="text-[10px] text-slate-300" />
                          <span className="text-indigo-600">{mapping.targetServer}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={mapping.active ? "ACTIVE" : "INACTIVE"}>
                          {mapping.active ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            className={`p-2 rounded-lg transition-all ${mapping.active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            title={mapping.active ? "Desactivar" : "Activar"}
                            onClick={() => handleToggleStatus(mapping._id, mapping.name, mapping.active)}
                          >
                            <FaSync size={14} />
                          </button>
                          <button 
                            className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all"
                            title="Ver detalles"
                            onClick={() => onSelectMapping(mapping._id)}
                          >
                            <FaEye size={14} />
                          </button>
                          {canEdit && (
                            <button 
                              className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Editar"
                              onClick={() => onEditMapping(mapping._id)}
                            >
                              <FaEdit size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button 
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Eliminar"
                              onClick={() => handleDelete(mapping._id, mapping.name)}
                            >
                              <FaTrash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
