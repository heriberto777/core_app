import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaExchangeAlt } from "react-icons/fa";
import { Button } from "../../index";

export function ValueMappingModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({ sourceValue: "", targetValue: "" });

    useEffect(() => {
        if (initialData) setFormData(initialData);
        else setFormData({ sourceValue: "", targetValue: "" });
    }, [initialData, isOpen]);

    const handleSubmit = () => {
        if (!formData.sourceValue || !formData.targetValue) return;
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[2500] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-[400px] rounded-[24px] border border-slate-200 shadow-2xl p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <FaExchangeAlt className="text-blue-500 text-sm" /> Mapeo de Valor
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Valor Origen</label>
                        <input
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                            value={formData.sourceValue}
                            onChange={e => setFormData(prev => ({ ...prev, sourceValue: e.target.value }))}
                            placeholder="Ej: P"
                        />
                    </div>

                    <div className="flex justify-center -my-2 relative z-10">
                        <div className="bg-white p-2 rounded-full border border-slate-100 shadow-sm">
                            <FaExchangeAlt className="text-slate-300 text-xs rotate-90" />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Valor Destino</label>
                        <input
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                            value={formData.targetValue}
                            onChange={e => setFormData(prev => ({ ...prev, targetValue: e.target.value }))}
                            placeholder="Ej: PENDIENTE"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} className="px-6 shadow-lg shadow-blue-500/20">
                        <FaSave className="mr-2" /> Guardar
                    </Button>
                </div>
            </div>
        </div>
    );
}
