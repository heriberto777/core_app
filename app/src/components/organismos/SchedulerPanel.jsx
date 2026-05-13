import React from "react";
import { FaCalendarAlt, FaClock } from "react-icons/fa";
import { ScheduleConfigButton } from "../../index";

export function SchedulerPanel({ nextRun, onConfigSuccess, loading }) {
    return (
        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col gap-8 flex-1 animate-in fade-in duration-700 group/card">
            {/* Header */}
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
                <FaCalendarAlt className="text-indigo-600" /> Programación Automática
            </h3>

            {/* Main Content */}
            <div className="flex flex-col items-center justify-center py-10 gap-4 bg-slate-50 border border-slate-100 rounded-[28px] relative overflow-hidden transition-all duration-500 group-hover/card:bg-indigo-50/30 group-hover/card:border-indigo-100">
                {/* Decorative background element */}
                <div className="absolute -right-8 -bottom-8 opacity-[0.03] text-9xl text-indigo-600 group-hover/card:scale-110 group-hover/card:opacity-[0.05] transition-all duration-700">
                    <FaClock />
                </div>

                <div className="flex flex-col items-center relative z-10">
                    <div className="text-5xl font-black text-indigo-600 tracking-tighter group-hover/card:scale-110 transition-transform duration-500">
                        {nextRun ? nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                    </div>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest mt-2 px-6 py-2 bg-white rounded-full shadow-sm border border-slate-100 group-hover/card:border-indigo-200 transition-colors">
                        {nextRun ? nextRun.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : "Sin programación activa"}
                    </div>
                </div>

                <div className="text-[10px] font-bold text-slate-400 text-center max-w-[220px] leading-relaxed uppercase tracking-widest flex items-center gap-2 justify-center mt-4">
                    <FaClock className="text-[8px]" /> Ejecución global de tareas configuradas.
                </div>
            </div>

            {/* Footer / Action */}
            <div className="flex justify-center pt-2">
                <div className="transform transition-transform hover:scale-105 duration-300">
                    <ScheduleConfigButton disabled={loading} onSuccess={onConfigSuccess} />
                </div>
            </div>
        </div>
    );
}
