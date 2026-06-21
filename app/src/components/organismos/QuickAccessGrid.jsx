import React from "react";
import { FaExchangeAlt, FaDatabase, FaHistory, FaChartLine, FaGripHorizontal } from "react-icons/fa";
import { Link } from "react-router-dom";

/**
 * Corporate QuickAccessGrid (Tailwind Edition)
 */
export function QuickAccessGrid({ className = "" }) {
    const actions = [
        { label: "Tareas", path: "/tasks", icon: <FaExchangeAlt /> },
        { label: "Logs Sistema", path: "/system-logs", icon: <FaDatabase /> },
        { label: "Historial", path: "/history", icon: <FaHistory /> },
        { label: "Estadísticas", path: "/analytics", icon: <FaChartLine /> },
    ];

    return (
        <div className={`bg-white rounded-3xl border border-slate-200 p-6 flex flex-col gap-5 shadow-premium flex-1 ${className}`}>
            <h3 className="m-0 text-base font-extrabold flex items-center gap-2.5 text-slate-800 border-b-2 border-primary-500/20 pb-3">
                <FaGripHorizontal className="text-primary-500" /> Acciones Rápidas
            </h3>
            <div className="grid grid-cols-2 gap-4">
                {actions.map((act, idx) => (
                    <Link
                        key={idx}
                        to={act.path}
                        className="flex flex-col items-center gap-2.5 p-5 bg-slate-50/50 border border-slate-200/40 rounded-2xl no-underline transition-all duration-300 hover:bg-primary-500/10 hover:border-primary-500 hover:scale-105"
                    >
                        <span className="text-2xl text-primary-500">{act.icon}</span>
                        <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">{act.label}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}