import React from "react";
import { FaEdit, FaTrash, FaBullseye } from "react-icons/fa";
import { StatusBadge, Button, usePermissions } from "../../index";

export const ClusterBaseTable = ({ rows = [], loading, onEdit, onDelete }) => {
  const { hasPermission, isAdmin } = usePermissions();
  const canUpdate = hasPermission("cluster-base", "update") || isAdmin;

  if (loading && rows.length === 0) {
    return (
      <div className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-500 animate-pulse">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-bold text-sm uppercase tracking-widest">Cargando objetivos base...</span>
      </div>
    );
  }

  return (
    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/50">
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Organización</th>
              <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Bronze</th>
              <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Silver</th>
              <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Gold</th>
              <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Estado</th>
              <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-8 py-20 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-3">
                    <FaBullseye className="text-4xl opacity-20" />
                    <span className="font-bold text-sm uppercase tracking-widest opacity-60">No hay objetivos base creados todavía</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isDeleted = row.transfer_status === 3;
                return (
                  <tr key={row.code_unit_org} className={`group transition-all hover:bg-slate-50/50 dark:hover:bg-slate-700/50 ${isDeleted ? "opacity-60" : ""}`}>
                    <td className="px-8 py-5">
                      <span className="font-mono text-sm font-black text-slate-800 dark:text-slate-100">{row.code_unit_org}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{row.bronze_base ?? "—"}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{row.silver_base ?? "—"}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{row.gold_base ?? "—"}</span>
                    </td>
                    <td className="px-8 py-5">
                      <StatusBadge status={isDeleted ? "INACTIVE" : "ACTIVE"}>
                        {isDeleted ? "ELIMINADO" : "ACTIVO"}
                      </StatusBadge>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canUpdate && (
                          <>
                            <Button
                              variant="ghost"
                              className="!w-9 !h-9 !p-0 flex items-center justify-center rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                              onClick={() => onEdit(row)}
                              title="Editar objetivos base"
                            >
                              <FaEdit size={16} />
                            </Button>
                            {!isDeleted && (
                              <Button
                                variant="ghost"
                                className="!w-9 !h-9 !p-0 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all"
                                onClick={() => onDelete(row.code_unit_org)}
                                title="Eliminar objetivos base"
                              >
                                <FaTrash size={14} />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
