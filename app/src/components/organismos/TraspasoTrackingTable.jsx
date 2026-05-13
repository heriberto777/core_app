import React from "react";
import { FaEye, FaPlay, FaCheckCircle, FaExclamationCircle, FaSpinner } from "react-icons/fa";
import { StatusBadge } from "../index";

/**
 * TraspasoTrackingTable (Tailwind Edition)
 * Bitácora operativa de transferencias con monitoreo de éxito y trazabilidad.
 */
export const TraspasoTrackingTable = ({
  transfers = [],
  loading,
  onViewDetails,
  onExecute,
  selectedItems = [],
  onSelectItem,
  onSelectAll,
  actionStates = {}
}) => {

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <FaCheckCircle className="text-emerald-500 shadow-emerald-500/20" />;
      case 'failed': return <FaExclamationCircle className="text-red-500 shadow-red-500/20" />;
      default: return <FaSpinner className="text-primary-500 animate-spin" />;
    }
  };

  if (loading && transfers.length === 0) {
    return (
      <div className="p-32 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-lg font-extrabold text-slate-800 uppercase tracking-widest">Consultando bitácora operativa...</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto animate-fadeIn">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-100">
            <th className="px-6 py-5 w-10">
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all"
                onChange={(e) => onSelectAll(e.target.checked)}
                checked={transfers.length > 0 && selectedItems.length === transfers.length}
              />
            </th>
            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Trazabilidad / Estado</th>
            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Identificador</th>
            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Documento</th>
            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ratio de Éxito</th>
            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cronología</th>
            <th className="px-6 py-5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Control</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {transfers.length === 0 ? (
            <tr>
              <td colSpan="7" className="p-32 text-center text-slate-400">
                <div className="flex flex-col items-center gap-4">
                  <FaEye size={48} className="opacity-10" />
                  <p className="font-bold">No se encontraron traspasos para este criterio.</p>
                </div>
              </td>
            </tr>
          ) : (
            transfers.map(t => (
              <tr 
                key={t.id} 
                className={`hover:bg-slate-50/40 transition-colors group ${selectedItems.includes(t.id) ? "bg-primary-50/20" : ""}`}
              >
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all"
                    checked={selectedItems.includes(t.id)}
                    onChange={() => onSelectItem(t.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="text-xl">
                      {getStatusIcon(t.status)}
                    </div>
                    <div className="flex flex-col">
                      <StatusBadge status={t.status === 'completed' ? 'ACTIVE' : t.status === 'failed' ? 'INACTIVE' : 'PENDING'}>
                        {t.status_description || t.status}
                      </StatusBadge>
                      {t.is_return === 1 && (
                        <span className="mt-1 px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[9px] font-black uppercase tracking-widest w-fit border border-red-200">
                          Devolución
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <code className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 text-xs font-black border border-slate-200 font-mono">
                    {t.load_id}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-extrabold text-primary-600 tracking-tight">{t.documento_generated || '—'}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">
                      {t.success_percentage}% <span className="text-slate-400 font-bold">({t.lines_successful}/{t.total_products})</span>
                    </div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                      <div 
                        className={`h-full transition-all duration-1000 ${
                          t.success_percentage >= 90 ? "bg-emerald-500" : t.success_percentage >= 50 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${t.success_percentage}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs font-bold text-slate-700">{new Date(t.created_at).toLocaleDateString()}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter">{new Date(t.created_at).toLocaleTimeString()}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onViewDetails(t.id)}
                      disabled={actionStates[t.id] === 'details'}
                      className="p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Ver auditoría"
                    >
                      {actionStates[t.id] === 'details' ? <FaSpinner className="animate-spin" /> : <FaEye size={14} />}
                    </button>
                    {t.status !== 'completed' && (
                      <button 
                        onClick={() => onExecute(t.load_id)}
                        disabled={actionStates[t.load_id] === 'executing'}
                        className="p-2.5 text-primary-500 hover:bg-primary-50 rounded-xl transition-all"
                        title="Reintentar ejecución"
                      >
                        {actionStates[t.load_id] === 'executing' ? <FaSpinner className="animate-spin" /> : <FaPlay size={12} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
