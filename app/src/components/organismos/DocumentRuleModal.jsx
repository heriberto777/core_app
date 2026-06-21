import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaFileSignature, FaFilter } from "react-icons/fa";
import { Button } from "../../index";

export function DocumentRuleModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        name: "",
        sourceField: "",
        sourceValues: "",
        description: "",
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                sourceValues: Array.isArray(initialData.sourceValues)
                    ? initialData.sourceValues.join(", ")
                    : initialData.sourceValues || ""
            });
        } else {
            setFormData({ name: "", sourceField: "", sourceValues: "", description: "" });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.sourceField || !formData.sourceValues) return;

        const valuesArray = formData.sourceValues.split(",").map(v => v.trim()).filter(v => v);
        onSave({
            ...formData,
            sourceValues: valuesArray
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-white w-full max-w-[500px] rounded-[32px] border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <FaFileSignature />
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900">Regla de Documento</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <FaTimes className="text-slate-400" />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-8 flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Nombre de la Regla</label>
                        <input
                            name="name"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Ej: pedido_aprobado"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Campo Origen (DB)</label>
                        <div className="relative">
                            <input
                                name="sourceField"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                value={formData.sourceField}
                                onChange={handleChange}
                                placeholder="Ej: EST_PED"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 flex justify-between">
                            <span>Valores Permitidos</span>
                            <span className="text-[9px] text-blue-500 lowercase tracking-normal">Separados por coma</span>
                        </label>
                        <div className="relative flex items-center">
                            <FaFilter className="absolute left-4 text-slate-300 text-xs" />
                            <input
                                name="sourceValues"
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                value={formData.sourceValues}
                                onChange={handleChange}
                                placeholder="Ej: P, p, A"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Descripción (Opcional)</label>
                        <textarea
                            name="description"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all h-20 resize-none"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Describe para qué sirve esta regla..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} className="px-8 shadow-lg shadow-blue-500/20">
                        <FaSave className="mr-2" /> {initialData ? "Actualizar Regla" : "Guardar Regla"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
