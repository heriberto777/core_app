import React, { useState } from "react";
import { FaSearch, FaRedo, FaFilter, FaChevronDown, FaChevronUp, FaCalendarAlt } from "react-icons/fa";
import { Button } from "../index";

export const TraspasoFiltersPanel = ({ filters, onFiltersChange, onReset, onSearch, loading, metadata }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newFilters = { ...filters, [name]: value };
    onFiltersChange(newFilters);
    if (name !== "loadId") {
      onSearch();
    }
  };

  const setPeriod = (days) => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const newF = { ...filters, dateFrom: from, dateTo: to };
    onFiltersChange(newF);
    onSearch();
  };

  return (
    <div className={`bg-white/70 backdrop-blur-md border border-slate-200 rounded-[32px] overflow-hidden mb-8 shadow-sm transition-all duration-500 animate-in fade-in slide-in-from-top-4 ${isExpanded ? "ring-1 ring-slate-100" : ""}`}>
      {/* Header */}
      <div 
        className={`px-8 py-5 flex justify-between items-center cursor-pointer transition-colors ${isExpanded ? "bg-slate-50/80 border-b border-slate-100" : "bg-white hover:bg-slate-50"}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isExpanded ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-400"}`}>
            <FaFilter className="text-xs" />
          </div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">
            Filtros de Auditoría
          </h3>
        </div>
        <div className="text-slate-400">
          {isExpanded ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-8 animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col gap-8">
            {/* Quick Filters */}
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <FaCalendarAlt className="text-[10px]" /> Periodos Rápidos
              </span>
              <div className="flex gap-3 flex-wrap">
                {[
                  { label: "Hoy", days: 0 },
                  { label: "Última Semana", days: 7 },
                  { label: "Último Mes", days: 30 }
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPeriod(p.days)}
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-100 bg-white text-slate-500 hover:border-blue-500 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-500/10 active:scale-95"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Load ID / Documento</label>
                <input
                  name="loadId"
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all placeholder:text-slate-300"
                  placeholder="Ej: 20240310..."
                  value={filters.loadId || ""}
                  onChange={handleChange}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Estado</label>
                <select 
                  name="status" 
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all appearance-none"
                  value={filters.status || "all"} 
                  onChange={handleChange}
                >
                  <option value="all">Todos los registros</option>
                  <option value="completed">Completados</option>
                  <option value="pending">Pendientes</option>
                  <option value="processing">Procesando</option>
                  <option value="failed">Fallidos</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Desde</label>
                <input 
                  type="date" 
                  name="dateFrom" 
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all"
                  value={filters.dateFrom || ""} 
                  onChange={handleChange} 
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Hasta</label>
                <input 
                  type="date" 
                  name="dateTo" 
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50 font-bold transition-all"
                  value={filters.dateTo || ""} 
                  onChange={handleChange} 
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <Button 
                variant="ghost" 
                onClick={onReset} 
                disabled={loading}
                className="px-6 font-bold"
              >
                <FaRedo className="mr-2 text-xs" /> Limpiar Filtros
              </Button>
              <Button 
                variant="primary" 
                onClick={onSearch} 
                loading={loading}
                className="px-10 shadow-lg shadow-blue-600/20"
              >
                <FaSearch className="mr-2 text-xs" /> Buscar Traspasos
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
