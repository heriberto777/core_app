import React from "react";
import { FaFilter, FaSync, FaCalendarAlt, FaWarehouse, FaCheckSquare, FaSquare } from "react-icons/fa";
import { Button } from "../../index";

export function OrdersFilterPanel({ filters, setFilters, onRefresh }) {
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFilters(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handleReset = () => {
        setFilters({
            dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
            dateTo: new Date().toISOString().split("T")[0],
            status: "all",
            warehouse: "all",
            showProcessed: false,
        });
    };

    return (
        <div className="bg-white/50 backdrop-blur-xl border border-slate-200 rounded-[32px] p-8 flex flex-col gap-8 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500 text-[9px]" /> Desde
                    </label>
                    <input 
                        type="date" 
                        name="dateFrom" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white/80 font-bold transition-all shadow-sm"
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
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white/80 font-bold transition-all shadow-sm"
                        value={filters.dateTo} 
                        onChange={handleChange} 
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaWarehouse className="text-blue-500 text-[9px]" /> Bodega / Almacén
                    </label>
                    <select 
                        name="warehouse" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white/80 font-bold transition-all appearance-none shadow-sm"
                        value={filters.warehouse} 
                        onChange={handleChange}
                    >
                        <option value="all">Todas las bodegas</option>
                        <option value="01">Almacén Central</option>
                        <option value="02">Punto de Venta</option>
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex items-center gap-2">
                        <FaFilter className="text-blue-500 text-[9px]" /> Estado
                    </label>
                    <select 
                        name="status" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white/80 font-bold transition-all appearance-none shadow-sm"
                        value={filters.status} 
                        onChange={handleChange}
                    >
                        <option value="all">Todos los estados</option>
                        <option value="P">Pendientes (P)</option>
                        <option value="F">Facturados (F)</option>
                        <option value="A">Anulados (A)</option>
                    </select>
                </div>

                <div className="pb-1">
                    <label className={`flex items-center gap-3 px-5 py-3 rounded-2xl cursor-pointer transition-all border shadow-sm ${
                        filters.showProcessed ? "bg-blue-600 border-blue-600 text-white shadow-blue-600/20" : "bg-white/80 border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}>
                        <input 
                            type="checkbox" 
                            name="showProcessed" 
                            className="sr-only"
                            checked={filters.showProcessed} 
                            onChange={handleChange} 
                        />
                        {filters.showProcessed ? <FaCheckSquare className="text-sm" /> : <FaSquare className="text-sm text-slate-300" />}
                        <span className="text-xs font-black uppercase tracking-wider">Procesados</span>
                    </label>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <Button variant="ghost" onClick={handleReset} className="font-bold">
                    <FaSync className="mr-2 text-xs" /> Limpiar Filtros
                </Button>
                <Button variant="primary" onClick={onRefresh} className="px-10 shadow-lg shadow-blue-600/20">
                    <FaSync className="mr-2 text-xs" /> Actualizar Datos
                </Button>
            </div>
        </div>
    );
}
