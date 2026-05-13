import React from "react";
import { FaSearch, FaTruck, FaCalendarAlt, FaFilter, FaSync } from "react-icons/fa";
import { Button } from "../../index";

export function SummaryFilterPanel({ filters, onUpdate, onClear, onSearch, loading }) {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({ [name]: value });
    };

    return (
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm flex flex-col gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaTruck className="text-blue-500 text-[9px]" /> Carga #
                    </label>
                    <input 
                        name="loadId" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all placeholder:text-slate-300"
                        value={filters.loadId} 
                        onChange={handleChange} 
                        placeholder="Ej: 00123" 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaTruck className="text-blue-500 text-[9px]" /> Ruta / Vendedor
                    </label>
                    <input 
                        name="route" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all placeholder:text-slate-300"
                        value={filters.route} 
                        onChange={handleChange} 
                        placeholder="Ej: R01" 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500 text-[9px]" /> Desde
                    </label>
                    <input 
                        type="date" 
                        name="dateFrom" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all"
                        value={filters.dateFrom} 
                        onChange={handleChange} 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500 text-[9px]" /> Hasta
                    </label>
                    <input 
                        type="date" 
                        name="dateTo" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all"
                        value={filters.dateTo} 
                        onChange={handleChange} 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaFilter className="text-blue-500 text-[9px]" /> Estado
                    </label>
                    <select 
                        name="status" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all appearance-none"
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

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <Button variant="ghost" onClick={onClear} disabled={loading} className="font-bold">
                    <FaSync className="mr-2 text-xs" /> Limpiar
                </Button>
                <Button 
                    variant="primary" 
                    onClick={onSearch} 
                    loading={loading}
                    className="px-10 shadow-lg shadow-blue-600/20"
                >
                    <FaSearch className="mr-2 text-xs" /> Aplicar Filtros
                </Button>
            </div>
        </div>
    );
}
