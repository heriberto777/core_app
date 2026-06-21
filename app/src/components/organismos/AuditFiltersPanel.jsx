import React, { useState } from "react";
import { FaFilter, FaSearch, FaSync, FaDownload, FaClock } from "react-icons/fa";
import { Button } from "../index";

/**
 * Corporate AuditFiltersPanel (Tailwind Edition)
 */
export function AuditFiltersPanel({
    filters,
    onFiltersChange,
    onSearch,
    onExport,
    onRefresh,
    loading,
    className = ""
}) {
    const [activeTab, setActiveTab] = useState("general");

    const tabs = [
        { id: "general", label: "General", icon: <FaFilter /> },
        { id: "system", label: "Sistema", icon: <FaClock /> },
        { id: "errors", label: "Errores", icon: <FaFilter /> },
    ];

    const handleChange = (key, value) => {
        onFiltersChange?.({ ...filters, [key]: value });
    };

    return (
        <div className={`bg-white backdrop-blur-md border border-slate-200 rounded-3xl p-6 mb-6 shadow-soft ${className}`}>
            <div className="flex gap-3 mb-6 border-b border-slate-200/40 pb-4">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-2.5 px-5 py-2.5 rounded-xl border-none text-sm font-bold cursor-pointer transition-all duration-200
                            ${activeTab === tab.id 
                                ? "bg-primary-500/15 text-primary-500" 
                                : "text-slate-500 hover:bg-primary-500/10"}
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 items-end">
                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <FaFilter size={10} /> Tipo de Evento
                    </label>
                    <select
                        value={filters.eventType || ""}
                        onChange={(e) => handleChange("eventType", e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    >
                        <option value="">Todos</option>
                        <option value="create">Creación</option>
                        <option value="update">Actualización</option>
                        <option value="delete">Eliminación</option>
                        <option value="login">Login</option>
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Usuario</label>
                    <input
                        type="text"
                        value={filters.user || ""}
                        onChange={(e) => handleChange("user", e.target.value)}
                        placeholder="Buscar usuario..."
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Fecha Desde</label>
                    <input
                        type="date"
                        value={filters.dateFrom || ""}
                        onChange={(e) => handleChange("dateFrom", e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Fecha Hasta</label>
                    <input
                        type="date"
                        value={filters.dateTo || ""}
                        onChange={(e) => handleChange("dateTo", e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>
            </div>

            <div className="flex gap-3 mt-6 pt-5 border-t border-slate-200/40 justify-end flex-wrap">
                <Button variant="secondary" onClick={onRefresh} disabled={loading}>
                    <FaSync className={loading ? "animate-spin" : ""} /> Actualizar
                </Button>
                <Button variant="secondary" onClick={onExport}>
                    <FaDownload /> Exportar
                </Button>
                <Button variant="primary" onClick={onSearch} disabled={loading}>
                    <FaSearch /> Buscar
                </Button>
            </div>
        </div>
    );
}