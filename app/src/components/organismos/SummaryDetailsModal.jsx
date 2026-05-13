import React from "react";
import { FaTruck, FaTimes, FaCalendarAlt, FaBoxOpen, FaInfoCircle, FaCubes, FaArrowRight } from "react-icons/fa";
import { Button } from "../../index";

export function SummaryDetailsModal({ isOpen, onClose, summary }) {
    if (!isOpen || !summary) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[850px] max-h-[90vh] rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 bg-white/80 backdrop-blur-md border-b border-slate-50 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                            <FaBoxOpen className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-slate-900 leading-tight">Auditoría de Carga</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Operativo:</span>
                                <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">#{summary.loadId}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
                    {/* Header Info Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex flex-col gap-1 hover:bg-white transition-colors">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ruta / Vendedor</span>
                            <span className="text-sm font-black text-slate-900">{summary.route}</span>
                        </div>
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex flex-col gap-1 hover:bg-white transition-colors">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Documento Traspaso</span>
                            <span className="text-sm font-black text-slate-900">{summary.documentId || "N/A"}</span>
                        </div>
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex flex-col gap-1 hover:bg-white transition-colors">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><FaCalendarAlt className="text-[8px]" /> Fecha Carga</span>
                            <span className="text-sm font-black text-slate-900">{new Date(summary.date).toLocaleDateString()}</span>
                        </div>
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[24px] flex flex-col gap-1 hover:bg-white transition-colors">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estatus Operativo</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md self-start uppercase tracking-widest ${
                                summary.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                            }`}>{summary.status}</span>
                        </div>
                    </div>

                    {/* Return Data Banner */}
                    {summary.returnData && (
                        <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-[28px] space-y-4 animate-in slide-in-from-top-4 duration-500">
                            <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center gap-3">
                                <FaInfoCircle /> Última Devolución Detectada
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Referencia Retorno</span>
                                    <span className="text-xs font-black text-amber-900">{summary.returnData.documentId}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Motivo de Regreso</span>
                                    <span className="text-xs font-bold text-amber-800 line-clamp-2">{summary.returnData.reason}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Items Breakdown Table */}
                    <div className="space-y-6">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
                            <FaCubes className="text-indigo-600" /> Desglose Analítico de Ítems
                        </h4>
                        
                        <div className="rounded-[28px] border border-slate-100 overflow-hidden shadow-sm bg-white">
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead className="bg-slate-50/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Código</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Descripción</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Original</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Devuelto</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Neto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {summary.products?.map((p, i) => (
                                            <tr key={i} className="hover:bg-slate-50/30 transition-colors group">
                                                <td className="px-6 py-4 text-xs font-black text-indigo-600 group-hover:scale-105 transition-transform">{p.code}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-500 truncate max-w-[200px]">{p.description || "Sin descripción"}</td>
                                                <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{p.quantity}</td>
                                                <td className="px-6 py-4 text-right text-xs font-black text-red-500">{p.returnedQuantity || 0}</td>
                                                <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{p.quantity - (p.returnedQuantity || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-900 text-white">
                                        <tr>
                                            <td colSpan={2} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Resumen de Carga</td>
                                            <td className="px-6 py-4 text-right text-xs font-black">{summary.totalQuantity}</td>
                                            <td className="px-6 py-4 text-right text-xs font-black text-red-400">{summary.products?.reduce((s, p) => s + (p.returnedQuantity || 0), 0)}</td>
                                            <td className="px-6 py-4 text-right text-xs font-black text-emerald-400">
                                                {summary.totalQuantity - (summary.products?.reduce((s, p) => s + (p.returnedQuantity || 0), 0) || 0)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md sticky bottom-0 z-10">
                    <Button 
                        variant="primary" 
                        onClick={onClose}
                        className="px-12 py-3 bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-900/20 font-black text-[10px] uppercase tracking-widest border-none rounded-2xl"
                    >
                        Cerrar Auditoría Técnica
                    </Button>
                </div>
            </div>
        </div>
    );
}
