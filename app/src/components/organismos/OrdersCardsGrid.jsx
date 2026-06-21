import React from "react";
import { FaEye, FaPlay, FaCheckCircle, FaRegCircle } from "react-icons/fa";
import { StatusBadge, Button } from "../../index";

/**
 * Corporate OrdersCardsGrid (Tailwind Edition)
 */
export function OrdersCardsGrid({
    data,
    selectedIds,
    onSelect,
    onViewDetails,
    onProcess,
    className = ""
}) {
    if (!data || data.length === 0) return null;

    const idField = Object.keys(data[0])[0];

    const getStatusBg = (status) => {
        if (!status) return "bg-transparent";
        const s = status.toUpperCase();
        if (s === 'F') return "bg-emerald-50";
        if (s === 'A') return "bg-red-50";
        return "bg-cyan-50";
    };

    return (
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5 py-2.5 ${className}`}>
            {data.map((order, idx) => {
                const orderId = order[idField];
                const isSelected = selectedIds.includes(orderId);
                const statusField = Object.keys(order).find(k => k.toLowerCase().includes('estado') || k.toLowerCase().includes('status'));
                const status = statusField ? order[statusField] : null;

                return (
                    <div
                        key={orderId || idx}
                        className={`
                            bg-white rounded-3xl border overflow-hidden flex flex-col
                            transition-all duration-300 hover:-translate-y-1 hover:shadow-premium
                            ${isSelected ? "border-primary-500 shadow-premium" : "border-slate-200 shadow-md"}
                        `}
                    >
                        <div
                            className={`absolute top-3 left-3 cursor-pointer z-5 transition-all duration-200 hover:scale-110 ${isSelected ? "text-primary-500" : "text-slate-400/40"}`}
                            onClick={() => onSelect(orderId)}
                        >
                            {isSelected ? <FaCheckCircle size={20} /> : <FaRegCircle size={20} />}
                        </div>

                        <div className={`px-5 py-4 border-b border-slate-200/40 flex justify-between items-center ${getStatusBg(status)}`}>
                            <div className="pl-6">
                                <div className="text-sm font-extrabold">{orderId}</div>
                                <div className="text-[11px] opacity-60">ID Documento</div>
                            </div>
                            <StatusBadge status={status}>{status}</StatusBadge>
                        </div>

                        <div className="px-5 py-4 flex flex-col gap-3 flex-1">
                            {Object.entries(order)
                                .filter(([key]) => key !== idField && key !== statusField)
                                .slice(0, 5)
                                .map(([key, value]) => (
                                    <div key={key} className="flex justify-between text-[13px]">
                                        <span className="text-slate-500 font-semibold">{key}</span>
                                        <span className="font-bold text-slate-800">{value !== null ? value : "—"}</span>
                                    </div>
                                ))}
                        </div>

                        <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-200/40 flex justify-between items-center">
                            <Button variant="ghost" size="small" onClick={() => onViewDetails(order)} title="Ver Detalle">
                                <FaEye /> Detalles
                            </Button>
                            <Button variant="primary" size="small" onClick={() => onProcess(orderId)}>
                                <FaPlay /> Procesar
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}