import React from "react";
import { FaSearch, FaTruck, FaCalendarAlt, FaFilter, FaSync } from "react-icons/fa";
import { Button } from "../../index";

export function SummaryFilterPanel({ filters, onUpdate, onClear, onSearch, loading }) {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({ [name]: value });
    };

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-8 shadow-sm flex flex-col gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1 flex items-center gap-2">
                        <FaTruck className="text-blue-500 text-[9px]" /> Carga #
                    </label>
                    <input 
                        name="loadId"
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50 font-bold transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        value={filters.loadId} 
                        onChange={handleChange} 
                        placeholder="Ej: 00123" 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1 flex items-center gap-2">
                        <FaTruck className="text-blue-500 text-[9px]" /> Ruta / Vendedor
                    </label>
                    <input 
                        name="route"
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50 font-bold transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        value={filters.route} 
                        onChange={handleChange} 
                        placeholder="Ej: R01" 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1 flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500 text-[9px]" /> Desde
                    </label>
                    <input 
                        type="date" 
                        name="dateFrom" 
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50 font-bold transition-all"
                        value={filters.dateFrom} 
                        onChange={handleChange} 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1 flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500 text-[9px]" /> Hasta
                    </label>
                    <input 
                        type="date" 
                        name="dateTo" 
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50 font-bold transition-all"
                        value={filters.dateTo} 
                        onChange={handleChange} 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1 flex items-center gap-2">
                        <FaFilter className="text-blue-500 text-[9px]" /> Estado
                    </label>
                    <select 
                        name="status" 
                        className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 font-bold transition-all appearance-none"
                        value={filters.status} 
                        onChange={handleChange}
                    >
                        <option value="">Todos los estados</option>
                        <option value="completed">Completado</option>
                        <option value="partial_return">Devolución Parcial</option>
                        <option value="full_return">Devolución Total</option>
                    </select>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-700">
                <Button variant="ghost" onClick={onClear} disabled={loading} className="font-bold w-full sm:w-auto">
                    <FaSync className="mr-2 text-xs" /> Limpiar
                </Button>
                <Button
                    variant="primary"
                    onClick={onSearch}
                    loading={loading}
                    className="px-10 shadow-lg shadow-blue-600/20 w-full sm:w-auto"
                >
                    <FaSearch className="mr-2 text-xs" /> Aplicar Filtros
                </Button>
            </div>
        </div>
    );
}
