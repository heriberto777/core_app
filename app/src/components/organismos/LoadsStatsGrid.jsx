import React from "react";
import {
    FaClipboardList,
    FaTruckLoading,
    FaCheckDouble,
    FaMoneyBillWave,
} from "react-icons/fa";

/**
 * Corporate LoadsStatsGrid (Tailwind Edition)
 */
export const LoadsStatsGrid = ({ stats, loading, className = "" }) => {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("es-DO", {
            style: "currency",
            currency: "DOP",
            minimumFractionDigits: 0,
        }).format(amount || 0);
    };

    const items = [
        {
            label: "Pendientes",
            value: stats?.pending || 0,
            icon: <FaClipboardList />,
            color: "text-amber-500",
            bg: "bg-amber-50"
        },
        {
            label: "En Proceso",
            value: stats?.processing || 0,
            icon: <FaTruckLoading />,
            color: "text-primary-500",
            bg: "bg-primary-50"
        },
        {
            label: "Completados",
            value: stats?.completed || 0,
            icon: <FaCheckDouble />,
            color: "text-emerald-500",
            bg: "bg-emerald-50"
        },
        {
            label: "Valor Despacho",
            value: formatCurrency(stats?.totalAmount),
            icon: <FaMoneyBillWave />,
            color: "text-indigo-500",
            bg: "bg-indigo-50"
        }
    ];

    return (
        <div className={`grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6 ${className}`}>
            {items.map((item, idx) => (
                <div
                    key={idx}
                    className="bg-white backdrop-blur-md border border-slate-200 p-6 rounded-2xl shadow-soft flex flex-col gap-3 transition-all duration-300 hover:-translate-y-2 hover:shadow-md hover:border-primary-500/40"
                >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${item.bg} ${item.color}`}>
                        {item.icon}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[13px] font-extrabold text-slate-500 uppercase tracking-wider opacity-80">
                            {item.label}
                        </span>
                        <div className="text-[26px] font-extrabold text-slate-800 font-['Inter']">
                            {loading ? "..." : item.value}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};