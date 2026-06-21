import React from "react";
import { FaEye, FaUndo, FaCheckCircle, FaExclamationCircle, FaInfoCircle } from "react-icons/fa";
import { Button } from "../../index";

export function SummaryDataTable({ summaries, onView, onReturn, refreshing }) {
    const getStatusConfig = (status) => {
        switch (status) {
            case "completed": return { label: "Completado", bgColor: "bg-emerald-50", textColor: "text-emerald-600", borderColor: "border-emerald-100", icon: <FaCheckCircle /> };
            case "partial_return": return { label: "Dev. Parcial", bgColor: "bg-amber-50", textColor: "text-amber-600", borderColor: "border-amber-100", icon: <FaInfoCircle /> };
            case "full_return": return { label: "Dev. Total", bgColor: "bg-red-50", textColor: "text-red-600", borderColor: "border-red-100", icon: <FaExclamationCircle /> };
            default: return { label: status, bgColor: "bg-slate-50", textColor: "text-slate-600", borderColor: "border-slate-100", icon: <FaInfoCircle /> };
        }
    };

    return (
        <div className={`w-full border border-slate-200 bg-white rounded-[32px] overflow-hidden shadow-sm transition-all duration-300 ${refreshing ? "opacity-60 grayscale blur-[1px]" : "opacity-100"}`}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">ID Carga</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Documento</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Ruta / Vendedor</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Fecha</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Estado</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Totales</th>
                            <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {summaries.length > 0 ? summaries.map(summary => {
                            const status = getStatusConfig(summary.status);
                            const returnedQty = summary.products?.reduce((sum, p) => sum + (p.returnedQuantity || 0), 0) || 0;

                            return (
                                <tr key={summary._id} className="hover:bg-slate-50/50 transition-all group">
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">#{summary.loadId}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID Registro</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <code className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-black text-slate-600 border border-slate-200">
                                            {summary.documentId || "N/A"}
                                        </code>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="text-sm font-bold text-slate-700">{summary.route}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="text-sm font-medium text-slate-500">{new Date(summary.date).toLocaleDateString()}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${status.bgColor} ${status.textColor} ${status.borderColor}`}>
                                            <span className="text-xs">{status.icon}</span>
                                            {status.label}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black text-slate-400 uppercase">Unid:</span>
                                                <span className="text-sm font-black text-slate-900">{summary.totalQuantity}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black text-slate-400 uppercase">Dev:</span>
                                                <span className={`text-sm font-black ${returnedQty > 0 ? "text-red-500" : "text-slate-400 opacity-40"}`}>{returnedQty}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                            <Button 
                                                variant="ghost" 
                                                className="w-10 h-10 p-0 flex items-center justify-center rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all"
                                                onClick={() => onView(summary._id)}
                                                title="Ver detalles técnicos"
                                            >
                                                <FaEye />
                                            </Button>
                                            {summary.status !== "full_return" && (
                                                <Button
                                                    variant="ghost"
                                                    className="w-10 h-10 p-0 flex items-center justify-center rounded-xl hover:bg-amber-50 text-amber-600 transition-all"
                                                    onClick={() => onReturn(summary._id)}
                                                    title="Procesar devolución"
                                                >
                                                    <FaUndo />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={7} className="px-8 py-24 text-center">
                                    <div className="flex flex-col items-center gap-4 text-slate-400">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                            <FaInfoCircle className="text-2xl opacity-20" />
                                        </div>
                                        <span className="font-bold text-sm uppercase tracking-widest opacity-60">No se han encontrado registros</span>
                                        <p className="text-xs max-w-[250px] mx-auto leading-relaxed">Intenta ajustar los criterios de búsqueda o los filtros de fecha.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
