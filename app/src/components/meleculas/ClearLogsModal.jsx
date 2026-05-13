import React from "react";
import { FaTrashAlt, FaTimes, FaExclamationTriangle } from "react-icons/fa";

export const ClearLogsModal = ({ isOpen, onClose, onConfirm, value, onChange }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-white w-full max-w-[500px] rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-7 bg-red-50/50 border-b border-red-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-600/20">
                            <FaTrashAlt className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-red-700 leading-tight">Limpiar Historial</h3>
                            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest mt-1">Acción Destructiva</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-100 text-red-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-8">
                    <div className="p-5 bg-red-50 border border-red-100 rounded-[24px] flex gap-4 items-start animate-pulse-subtle">
                        <FaExclamationTriangle className="text-red-600 mt-1 shrink-0" />
                        <span className="text-sm font-bold text-red-800 leading-relaxed">
                            Esta acción es irreversible. Se eliminarán permanentemente los registros del servidor según el periodo seleccionado.
                        </span>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                            Eliminar logs más antiguos que:
                        </label>
                        <select 
                            value={value} 
                            onChange={(e) => onChange(parseInt(e.target.value))}
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-900 focus:outline-none focus:border-red-500 transition-all appearance-none cursor-pointer"
                        >
                            <option value={1}>1 día</option>
                            <option value={7}>7 días (1 semana)</option>
                            <option value={30}>30 días (1 mes)</option>
                            <option value={90}>90 días (3 meses)</option>
                            <option value={0}>Todos los registros (Limpieza total)</option>
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-3 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-100 transition-all"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-10 py-3 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 rounded-2xl text-xs font-black uppercase tracking-widest border-none transition-all active:scale-95"
                    >
                        Confirmar Limpieza
                    </button>
                </div>
            </div>
        </div>
    );
};
