import React from "react";
import {
    FaClock,
    FaSpinner,
    FaCheckCircle,
    FaExclamationTriangle,
    FaBoxOpen
} from "react-icons/fa";

/**
 * Corporate TraspasoStatsGrid (Tailwind Edition)
 */
export const TraspasoStatsGrid = ({ stats, loading, className = "" }) => {
    const items = [
        {
            label: "Pendientes",
            value: stats?.pending || 0,
            icon: <FaClock />,
            color: "text-amber-500 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-900/30"
        },
        {
            label: "Procesando",
            value: stats?.processing || 0,
            icon: <FaSpinner className={loading ? "animate-spin" : ""} />,
            color: "text-primary-500",
            bg: "bg-primary-50 dark:bg-primary-900/30"
        },
        {
            label: "Completados",
            value: stats?.completed || 0,
            icon: <FaCheckCircle />,
            color: "text-emerald-500 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-900/30"
        },
        {
            label: "Fallidos",
            value: stats?.failed || 0,
            icon: <FaExclamationTriangle />,
            color: "text-red-500 dark:text-red-400",
            bg: "bg-red-50 dark:bg-red-900/30"
        },
        {
            label: "Total Ítems",
            value: stats?.totalValue?.toLocaleString() || 0,
            icon: <FaBoxOpen />,
            color: "text-indigo-500 dark:text-indigo-400",
            bg: "bg-indigo-50 dark:bg-indigo-900/30"
        }
    ];

    return (
        <div className={`grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-6 ${className}`}>
            {items.map((item, idx) => (
                <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-soft flex flex-col gap-3 transition-all duration-300 hover:-translate-y-2 hover:shadow-md hover:border-primary-500/40"
                >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${item.bg} ${item.color}`}>
                        {item.icon}
                    </div>
                    <span className="text-[13px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider opacity-80">
                        {item.label}
                    </span>
                    <div className="text-[26px] font-extrabold text-slate-800 dark:text-slate-100">
                        {loading ? "..." : item.value}
                    </div>
                </div>
            ))}
        </div>
    );
};