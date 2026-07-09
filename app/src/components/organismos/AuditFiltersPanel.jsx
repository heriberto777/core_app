import React, { useState, useEffect } from "react";
import { FaFilter, FaSearch, FaSync, FaDownload, FaExclamationTriangle } from "react-icons/fa";
import { Button } from "../index";

const LEVEL_TABS = [
    { id: "all", label: "General", icon: <FaFilter size={13} /> },
    { id: "info,warn", label: "Sistema", icon: <FaFilter size={13} /> },
    { id: "error", label: "Errores", icon: <FaExclamationTriangle size={13} /> },
];

const OPERATION_TYPES = [
    { value: "all", label: "Todos" },
    { value: "TRANSFER", label: "Transferencia" },
    { value: "LOAD", label: "Carga" },
    { value: "CREATE", label: "Creación" },
    { value: "UPDATE", label: "Actualización" },
    { value: "DELETE", label: "Eliminación" },
    { value: "QUERY", label: "Consulta" },
    { value: "EXECUTE", label: "Ejecución" },
    { value: "OTHER", label: "Otro" },
];

const TRANSFER_STATUSES = [
    { value: "all", label: "Todos" },
    { value: "completed", label: "Completado" },
    { value: "failed", label: "Error" },
    { value: "cancelled", label: "Cancelado" },
    { value: "running", label: "En Proceso" },
];

/**
 * Corporate AuditFiltersPanel (Tailwind Edition)
 * Las pestañas General/Sistema/Errores son un atajo sobre `level` (logs de
 * sistema). Los campos de texto/fecha quedan en un borrador local y solo se
 * envían al padre al presionar "Buscar", para no disparar una consulta por
 * cada tecla presionada.
 */
export function AuditFiltersPanel({
    logType = "system",
    filters = {},
    onFilterChange,
    onRefresh,
    onExport,
    loading,
    className = ""
}) {
    const [draft, setDraft] = useState(filters);

    useEffect(() => {
        setDraft(filters);
    }, [filters]);

    const setDraftField = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));

    const applyDraft = () => onFilterChange?.(draft);

    const selectLevel = (level) => onFilterChange?.({ ...filters, level });

    const isSystem = logType === "system";

    return (
        <div className={`bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-soft ${className}`}>
            {isSystem && (
                <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
                    {LEVEL_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => selectLevel(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-all
                                ${(filters.level || "all") === tab.id
                                    ? "bg-primary-50 text-primary-600"
                                    : "text-slate-500 hover:bg-slate-50"}
                            `}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 items-end">
                {isSystem ? (
                    <>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FaFilter size={10} /> Tipo de Evento
                            </label>
                            <select
                                value={draft.operationType || "all"}
                                onChange={(e) => setDraftField("operationType", e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                {OPERATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Buscar Mensaje</label>
                            <input
                                type="text"
                                value={draft.search || ""}
                                onChange={(e) => setDraftField("search", e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && applyDraft()}
                                placeholder="Ej: timeout, conexión rechazada..."
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FaFilter size={10} /> Estado
                            </label>
                            <select
                                value={draft.status || "all"}
                                onChange={(e) => setDraftField("status", e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                {TRANSFER_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Nombre de Tarea</label>
                            <input
                                type="text"
                                value={draft.taskName || ""}
                                onChange={(e) => setDraftField("taskName", e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && applyDraft()}
                                placeholder="Buscar tarea..."
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                    </>
                )}

                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Fecha Desde</label>
                    <input
                        type="date"
                        value={draft.dateFrom || ""}
                        onChange={(e) => setDraftField("dateFrom", e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Fecha Hasta</label>
                    <input
                        type="date"
                        value={draft.dateTo || ""}
                        onChange={(e) => setDraftField("dateTo", e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>
            </div>

            <div className="flex gap-3 mt-6 pt-5 border-t border-slate-200 justify-end flex-wrap">
                <Button variant="secondary" onClick={onRefresh} disabled={loading}>
                    <FaSync className={loading ? "animate-spin" : ""} /> Actualizar
                </Button>
                <Button variant="secondary" onClick={onExport}>
                    <FaDownload /> Exportar
                </Button>
                <Button variant="primary" onClick={applyDraft} disabled={loading}>
                    <FaSearch /> Buscar
                </Button>
            </div>
        </div>
    );
}
