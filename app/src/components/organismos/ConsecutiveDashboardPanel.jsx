import React from "react";
import { FaHeartbeat, FaClock, FaChartLine, FaExclamationTriangle, FaTimes, FaLayerGroup } from "react-icons/fa";
import { Button } from "../../index";

export function ConsecutiveDashboardPanel({ data, onClose }) {
    const getHealth = (item) => {
        if (item.expiredReservations > 5) return { color: "bg-red-500", shadow: "shadow-red-500/50", label: "Crítico", text: "text-red-600" };
        if (item.activeReservations > 10) return { color: "bg-amber-500", shadow: "shadow-amber-500/50", label: "Atención", text: "text-amber-600" };
        return { color: "bg-emerald-500", shadow: "shadow-emerald-500/50", label: "Óptimo", text: "text-emerald-600" };
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500 slide-in-from-top-4">
            {/* Header */}
            <div className="flex justify-between items-center px-8 py-6 bg-white/50 backdrop-blur-xl border border-slate-200 rounded-[32px] shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-500">
                        <FaHeartbeat className="text-xl animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="text-lg font-black text-slate-900 leading-none mb-1">Salud de Folios</h3>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monitoreo de disponibilidad y reservas</span>
                    </div>
                </div>
                <Button variant="ghost" onClick={onClose} className="text-slate-500 font-bold hover:text-red-500">
                    <FaTimes className="mr-2" /> Cerrar Dashboard
                </Button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {data.map((item) => {
                    const health = getHealth(item);
                    return (
                        <div key={item.id} className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificador</span>
                                    <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.name}</h4>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className={`w-3 h-3 rounded-full ${health.color} ${health.shadow} shadow-lg ring-4 ring-white relative`}>
                                        <div className={`absolute inset-0 rounded-full ${health.color} animate-ping opacity-20`} />
                                    </div>
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${health.text}`}>{health.label}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <FaLayerGroup className="text-xs" />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Valor Actual</span>
                                    </div>
                                    <span className="text-sm font-black text-slate-900">{item.currentValue}</span>
                                </div>
                                
                                <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <FaClock className="text-xs" />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Reservas Activas</span>
                                    </div>
                                    <span className="text-sm font-black text-blue-600">{item.activeReservations}</span>
                                </div>

                                <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <FaChartLine className="text-xs" />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Carga (24h)</span>
                                    </div>
                                    <span className="text-sm font-black text-emerald-600">+{item.totalIncrements}</span>
                                </div>

                                {item.expiredReservations > 0 && (
                                    <div className="flex justify-between items-center py-3 border-b border-slate-50 animate-bounce-short">
                                        <div className="flex items-center gap-3 text-red-500">
                                            <FaExclamationTriangle className="text-xs" />
                                            <span className="text-[10px] font-black uppercase tracking-wider">Expirados</span>
                                        </div>
                                        <span className="text-sm font-black text-red-600">{item.expiredReservations}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center opacity-30 gap-4">
                    <FaHeartbeat className="text-5xl" />
                    <p className="text-sm font-black uppercase tracking-[0.2em]">No hay datos de telemetría disponibles</p>
                </div>
            )}
        </div>
    );
}
