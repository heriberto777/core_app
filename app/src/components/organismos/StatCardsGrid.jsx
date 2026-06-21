import React from "react";
import { FaServer, FaExchangeAlt, FaClock, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";

/**
 * StatCardsGrid (Tailwind Edition)
 * Grid de métricas de alto rendimiento para el dashboard.
 */
export function StatCardsGrid({ stats }) {
    const items = [
        { label: "Configuradas", value: stats.totalTasks, icon: <FaServer />, color: "text-indigo-600", bg: "bg-indigo-50" },
        { label: "Activas", value: stats.activeTasks, icon: <FaExchangeAlt />, color: "text-violet-600", bg: "bg-violet-50" },
        { label: "En Ejecución", value: stats.runningTasks, icon: <FaClock />, color: "text-cyan-600", bg: "bg-cyan-50", highlight: stats.runningTasks > 0 },
        { label: "Éxitos Hoy", value: stats.completedToday, icon: <FaCheckCircle />, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Fallos Hoy", value: stats.failedToday, icon: <FaExclamationTriangle />, color: "text-red-600", bg: "bg-red-50", highlight: stats.failedToday > 0 },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 w-full mb-8">
            {items.map((it, idx) => (
                <div 
                  key={idx} 
                  className={`
                    flex items-center gap-5 p-6 rounded-[28px] border transition-all duration-300 group
                    ${it.highlight 
                      ? 'bg-white border-primary-400 shadow-lg -translate-y-1' 
                      : 'bg-white border-slate-100 shadow-soft hover:shadow-md hover:-translate-y-1'}
                  `}
                >
                    <div className={`w-14 h-14 rounded-2xl ${it.bg} ${it.color} flex items-center justify-center text-2xl transition-transform group-hover:scale-110 duration-300 shadow-inner`}>
                      {it.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="text-2xl font-extrabold text-slate-800 tracking-tight">{it.value}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{it.label}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
