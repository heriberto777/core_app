import React from "react";
import { FaEdit, FaToggleOn, FaToggleOff, FaTruck, FaUserAlt } from "react-icons/fa";
import { StatusBadge, Button, usePermissions } from "../../index";

export const TrucksTable = ({ trucks = [], loading, onEdit, onToggleActive }) => {
  const { hasPermission, isAdmin } = usePermissions();
  const canUpdate = hasPermission("trucks", "update") || isAdmin;

  if (loading && trucks.length === 0) {
    return (
      <div className="bg-white/50 border border-slate-200 rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-slate-400 animate-pulse">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-bold text-sm uppercase tracking-widest">Cargando camiones...</span>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Código</th>
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Descripción</th>
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Placa</th>
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Repartidor</th>
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Estado</th>
              <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {trucks.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-8 py-20 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-3">
                    <FaTruck className="text-4xl opacity-20" />
                    <span className="font-bold text-sm uppercase tracking-widest opacity-60">No hay camiones creados todavía</span>
                  </div>
                </td>
              </tr>
            ) : (
              trucks.map((truck) => (
                <tr key={truck.code} className={`group transition-all hover:bg-slate-50/50 ${!truck.active ? "opacity-60" : ""}`}>
                  <td className="px-8 py-5">
                    <span className="font-mono text-sm font-black text-slate-800">{truck.code}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-sm font-semibold text-slate-700">{truck.description}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="font-mono text-sm text-slate-500">{truck.plate || "—"}</span>
                  </td>
                  <td className="px-8 py-5">
                    {truck.code_seller ? (
                      <div className="inline-flex items-center gap-2 text-slate-600">
                        <FaUserAlt className="text-slate-300" size={12} />
                        <span className="text-sm font-semibold">{truck.seller_name || truck.code_seller}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300 italic">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <StatusBadge status={truck.active ? "ACTIVE" : "INACTIVE"}>
                      {truck.active ? "ACTIVO" : "INACTIVO"}
                    </StatusBadge>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canUpdate && (
                        <>
                          <Button
                            variant="ghost"
                            className="w-9 h-9 p-0 flex items-center justify-center rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                            onClick={() => onEdit(truck)}
                            title="Editar camión"
                          >
                            <FaEdit />
                          </Button>
                          <Button
                            variant="ghost"
                            className={`w-9 h-9 p-0 flex items-center justify-center rounded-xl transition-all ${
                              truck.active ? "hover:bg-amber-50 text-amber-500" : "hover:bg-emerald-50 text-emerald-500"
                            }`}
                            onClick={() => onToggleActive(truck.code, truck.active)}
                            title={truck.active ? "Desactivar" : "Activar"}
                          >
                            {truck.active ? <FaToggleOn className="text-xl" /> : <FaToggleOff className="text-xl" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
