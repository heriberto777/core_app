import React from "react";
import { FaSearch, FaSync, FaEraser } from "react-icons/fa";
import { Button } from "../../index";

/**
 * Corporate DocumentsFilterPanel (Tailwind Edition)
 */
export function DocumentsFilterPanel({
    search, setSearch,
    filterValues, setFilterValues,
    onRefresh, isRefreshing,
    className = ""
}) {
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFilterValues(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const resetFilters = () => {
        setFilterValues({
            dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
            dateTo: new Date().toISOString().split("T")[0],
            status: "all",
            warehouse: "all",
            showProcessed: false,
        });
        setSearch("");
    };

    return (
        <div className={`bg-white p-6 rounded-2xl border border-slate-200 backdrop-blur-md flex flex-col gap-5 shadow-premium ${className}`}>
            <div className="relative w-full">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar documento por cualquier campo (Nro, Cliente, ERP...)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full py-3 px-11 rounded-xl border border-slate-200 bg-white text-slate-800 text-[15px] transition-all duration-200 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Fecha Desde</label>
                    <input type="date" name="dateFrom" value={filterValues.dateFrom} onChange={handleChange}
                        className="py-2.5 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Fecha Hasta</label>
                    <input type="date" name="dateTo" value={filterValues.dateTo} onChange={handleChange}
                        className="py-2.5 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Estado Documento</label>
                    <select name="status" value={filterValues.status} onChange={handleChange}
                        className="py-2.5 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm cursor-pointer">
                        <option value="all">Todos los estados</option>
                        <option value="P">Pendientes (P)</option>
                        <option value="F">Facturados (F)</option>
                        <option value="A">Anulados (A)</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2.5 cursor-pointer p-2.5 bg-slate-50/50 rounded-lg border border-slate-200 text-sm text-slate-800 transition-all duration-200 hover:bg-slate-100 hover:border-primary-500/40">
                        <input type="checkbox" name="showProcessed" checked={filterValues.showProcessed} onChange={handleChange} className="w-4 h-4 accent-primary-500" />
                        <span>Mostrar ya procesados</span>
                    </label>
                </div>

                <div className="flex gap-2">
                    <Button variant="secondary" onClick={resetFilters} title="Limpiar todos los filtros" className="flex-1">
                        <FaEraser />
                    </Button>
                    <Button variant="primary" onClick={onRefresh} disabled={isRefreshing} className="flex-2">
                        <FaSync className={isRefreshing ? "animate-spin" : ""} /> {isRefreshing ? "Cargando..." : "Refrescar"}
                    </Button>
                </div>
            </div>
        </div>
    );
}