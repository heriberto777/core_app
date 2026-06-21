import React from "react";
import { FaTimes, FaChartBar, FaLayerGroup, FaHistory, FaInfoCircle } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

export function ConsecutiveDetailsModal({ isOpen, onClose, metrics }) {
    if (!isOpen || !metrics) return null;

    const { consecutiveName, currentValue, metrics: stats } = metrics;
    const segments = stats.bySegment ? Object.entries(stats.bySegment) : [];

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex flex-col">
                        <h3 className="text-xl font-extrabold text-slate-900 leading-tight">Análisis de Folio</h3>
                        <span className="text-sm font-medium text-slate-500 mt-1">
                            Consecutivo: <strong className="text-blue-600 font-bold">{consecutiveName}</strong>
                        </span>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="rounded-full w-10 h-10 flex items-center justify-center p-0">
                        <FaTimes className="text-slate-400" />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto flex-1 flex flex-col gap-10">
                    {/* Metrics Section */}
                    <div className="flex flex-col gap-5">
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-3">
                            <FaChartBar className="text-blue-500" /> Rendimiento (Últimas 24h)
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-1 hover:border-blue-200 transition-colors">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Actual</span>
                                <span className="text-3xl font-black text-slate-900">{currentValue}</span>
                            </div>
                            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-1 hover:border-emerald-200 transition-colors">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Incrementos</span>
                                <span className="text-3xl font-black text-emerald-500">+{stats.totalIncrements}</span>
                            </div>
                            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-1 hover:border-sky-200 transition-colors">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reservas Activas</span>
                                <span className="text-3xl font-black text-sky-500">{stats.activeReservations}</span>
                            </div>
                            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-1 hover:border-slate-300 transition-colors">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rango Operativo</span>
                                <div className="text-sm font-black text-slate-700 mt-2">
                                    {stats.valueRange.min} — {stats.valueRange.max}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Segments Section */}
                    {segments.length > 0 && (
                        <div className="flex flex-col gap-5">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-3">
                                <FaLayerGroup className="text-blue-500" /> Desglose por Segmentos
                            </h4>
                            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-wider text-[11px]">Identificador</th>
                                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-wider text-[11px]">Valor Actual</th>
                                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-wider text-[11px]">Incrementos (24h)</th>
                                            <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-wider text-[11px]">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {segments.map(([name, data]) => (
                                            <tr key={name} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-slate-700 group-hover:text-blue-600">{name}</td>
                                                <td className="px-6 py-4 font-black text-slate-900">{data.currentValue}</td>
                                                <td className="px-6 py-4 font-black text-emerald-500">+{data.incrementCount}</td>
                                                <td className="px-6 py-4">
                                                    <StatusBadge status="ACTIVE" className="scale-90 origin-left" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* No Segments Fallback */}
                    {!segments.length && (
                        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-10 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                                <FaInfoCircle className="text-slate-300 text-2xl" />
                            </div>
                            <p className="text-slate-500 text-sm max-w-[400px] leading-relaxed">
                                Este consecutivo no utiliza segmentación. Los valores son <strong className="text-slate-700">globales</strong> para todo el sistema de manera unificada.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 flex justify-end bg-slate-50/30">
                    <Button variant="primary" onClick={onClose} className="px-10 shadow-lg shadow-blue-500/20">
                        Cerrar Análisis
                    </Button>
                </div>
            </div>
        </div>
    );
}
