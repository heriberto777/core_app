import React from "react";
import { FaUserCircle, FaRoute } from "react-icons/fa";
import { StatusBadge } from "../../index";

const STATUS_LABELS = {
  0: { text: "SINCRONIZADO", status: "ACTIVE" },
  1: { text: "NUEVO", status: "INFO" },
  2: { text: "CAMBIO", status: "PENDING" },
  3: { text: "BAJA", status: "ERROR" },
};

export const ClientAssignmentTable = ({
  clients = [],
  loading,
  selectedCodes = [],
  onToggleSelect,
  onToggleSelectAll,
}) => {
  if (loading && clients.length === 0) {
    return (
      <div className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-500 animate-pulse">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-bold text-sm uppercase tracking-widest">Cargando clientes...</span>
      </div>
    );
  }

  const allSelected = clients.length > 0 && selectedCodes.length === clients.length;

  return (
    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/50">
              <th className="px-6 py-5 text-left border-b border-slate-100 dark:border-slate-700 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 rounded text-primary-600 border-slate-300 dark:border-slate-600 focus:ring-primary-500"
                />
              </th>
              <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Cliente</th>
              <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Vendedor</th>
              <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700" title="Ruta asignada hoy en el ERP — solo referencia">Ruta ERP</th>
              <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Ruta Venta</th>
              <th className="px-6 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Ruta Reparto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
            {clients.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-8 py-20 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-3">
                    <FaUserCircle className="text-4xl opacity-20" />
                    <span className="font-bold text-sm uppercase tracking-widest opacity-60">
                      No hay clientes que coincidan con el filtro
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                const isSelected = selectedCodes.includes(c.code_account);
                const statusInfo = STATUS_LABELS[c.assignment_status];
                const sellerStatusInfo = STATUS_LABELS[c.seller_assignment_status];
                return (
                  <tr
                    key={c.code_account}
                    className={`group transition-all cursor-pointer ${isSelected ? "bg-primary-50/50 dark:bg-primary-900/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-700/50"}`}
                    onClick={() => onToggleSelect(c.code_account)}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(c.code_account)}
                        className="w-4 h-4 rounded text-primary-600 border-slate-300 dark:border-slate-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100">{c.name1}</span>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{c.code_account}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{c.code_seller || "—"}</span>
                    </td>
                    <td className="px-6 py-4">
                      {c.erp_route_code ? (
                        <div className="inline-flex items-center gap-2 text-slate-400 dark:text-slate-500">
                          <FaRoute size={12} />
                          <span className="text-sm font-medium">{c.erp_route_code}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 uppercase">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {c.current_seller_route ? (
                        <div className="flex flex-col gap-1">
                          <div className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <FaRoute className="text-indigo-300 dark:text-indigo-500" size={12} />
                            <span className="text-sm font-bold">{c.current_seller_route}</span>
                          </div>
                          {sellerStatusInfo && (
                            <StatusBadge status={sellerStatusInfo.status} className="scale-90 origin-left">
                              {sellerStatusInfo.text}
                            </StatusBadge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 uppercase">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {c.current_route ? (
                        <div className="flex flex-col gap-1">
                          <div className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <FaRoute className="text-slate-300 dark:text-slate-500" size={12} />
                            <span className="text-sm font-bold">{c.current_route}</span>
                          </div>
                          {c.current_repartidor && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Repartidor: {c.current_repartidor}</span>
                          )}
                          {statusInfo && (
                            <StatusBadge status={statusInfo.status} className="scale-90 origin-left">
                              {statusInfo.text}
                            </StatusBadge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 uppercase">Sin asignar</span>
                      )}
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
