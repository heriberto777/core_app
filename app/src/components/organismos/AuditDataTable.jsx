import React from "react";
import { FaClock, FaDatabase, FaEye } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

/**
 * AuditDataTable (Tailwind Edition)
 * Tabla de datos de auditoría con alta fidelidad y diseño corporativo.
 */
export const AuditDataTable = ({
    data = [],
    type = "system",
    pagination,
    onPageChange,
    onViewDetail,
    loading
}) => {
    if (loading && data.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center p-20 gap-4 opacity-70">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando registros...</span>
          </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        {type === "system" ? (
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Severidad</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha y Hora</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mensaje</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fuente</th>
                                <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
                            </tr>
                        ) : (
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tarea</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Registros</th>
                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Duración</th>
                                <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={type === "system" ? 5 : 6} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                      <div className="text-4xl">🔍</div>
                                      <span className="text-sm font-medium">No se encontraron registros de auditoría.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((item, i) => (
                                <tr key={item._id || i} className="hover:bg-slate-50/50 transition-colors group">
                                    {type === "system" ? (
                                        <>
                                            <td className="px-6 py-4">
                                                <StatusBadge variant={
                                                    ['ERROR', 'CRITICAL'].includes(item.level?.toUpperCase()) ? 'danger' :
                                                        ['WARNING', 'WARN'].includes(item.level?.toUpperCase()) ? 'warning' : 'info'
                                                }>
                                                    {item.level}
                                                </StatusBadge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                                                  {new Date(item.timestamp).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-mono text-[13px] text-slate-600 max-w-[500px] truncate" title={item.message}>
                                                  {item.message}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase">{item.source || 'SISTEMA'}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button 
                                                  variant="ghost" 
                                                  className="bg-white/50 p-2 opacity-0 group-hover:opacity-100" 
                                                  onClick={() => onViewDetail(item)}
                                                >
                                                    <FaEye />
                                                </Button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-6 py-4">
                                              <span className="font-extrabold text-slate-700">{item.taskName || item.name}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <StatusBadge variant={
                                                    item.status === 'completed' ? 'success' :
                                                        item.status === 'failed' ? 'danger' : 'warning'
                                                }>
                                                    {item.status.toUpperCase()}
                                                </StatusBadge>
                                            </td>
                                            <td className="px-6 py-4">
                                              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                                                {new Date(item.date).toLocaleString()}
                                              </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <FaDatabase size={11} className="text-slate-300" />
                                                    <span className="text-xs font-bold">{item.totalRecords || 0}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <FaClock size={11} className="text-slate-300" />
                                                    <span className="text-xs font-bold">{item.executionTime || 0}ms</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button 
                                                  variant="ghost" 
                                                  className="bg-white/50 p-2 opacity-0 group-hover:opacity-100" 
                                                  onClick={() => onViewDetail(item)}
                                                >
                                                    <FaEye />
                                                </Button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* PAGINACIÓN */}
            <div className="mt-auto px-6 py-4 bg-slate-50/30 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Página <span className="text-slate-900">{pagination.page}</span> de <span className="text-slate-900">{pagination.pages}</span>
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => onPageChange(pagination.page - 1)}
                    >
                        Anterior
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page >= pagination.pages}
                        onClick={() => onPageChange(pagination.page + 1)}
                    >
                        Siguiente
                    </Button>
                </div>
            </div>
        </div>
    );
};
