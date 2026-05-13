import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaPlus, FaTrash, FaDatabase, FaCogs } from "react-icons/fa";
import { Button } from "../../index";

export function DependencyModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        fieldName: "",
        dependentTable: "",
        executionOrder: 0,
        insertIfNotExists: true,
        validateOnly: false,
        dependentFields: []
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                fieldName: "",
                dependentTable: "",
                executionOrder: 0,
                insertIfNotExists: true,
                validateOnly: false,
                dependentFields: [{ sourceField: "", targetField: "", defaultValue: "", isKey: true }]
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const addField = () => {
        setFormData(prev => ({
            ...prev,
            dependentFields: [...prev.dependentFields, { sourceField: "", targetField: "", defaultValue: "", isKey: false }]
        }));
    };

    const updateField = (index, field, value) => {
        setFormData(prev => {
            const newFields = [...prev.dependentFields];
            newFields[index] = { ...newFields[index], [field]: value };
            return { ...prev, dependentFields: newFields };
        });
    };

    const removeField = (index) => {
        setFormData(prev => {
            const newFields = [...prev.dependentFields];
            newFields.splice(index, 1);
            return { ...prev, dependentFields: newFields };
        });
    };

    const handleSubmit = () => {
        if (!formData.fieldName || !formData.dependentTable) return;
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-white w-full max-w-[800px] max-h-[90vh] rounded-[32px] border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <FaDatabase />
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900">Dependencia de Foreign Key</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <FaTimes className="text-slate-400" />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto flex-1 flex flex-col gap-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Campo en Tabla Principal</label>
                            <input
                                name="fieldName"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                value={formData.fieldName}
                                onChange={handleChange}
                                placeholder="Ej: CONTRIBUYENTE"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Tabla Dependiente</label>
                            <input
                                name="dependentTable"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                value={formData.dependentTable}
                                onChange={handleChange}
                                placeholder="Ej: NIT"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Orden de Ejecución</label>
                            <input
                                type="number"
                                name="executionOrder"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                value={formData.executionOrder}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="flex gap-6 p-3 bg-slate-50 rounded-xl border border-slate-200 justify-center">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    name="insertIfNotExists"
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={formData.insertIfNotExists}
                                    onChange={handleChange}
                                />
                                <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Insertar si no existe</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    name="validateOnly"
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={formData.validateOnly}
                                    onChange={handleChange}
                                />
                                <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Solo validar</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-col gap-5">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
                                <FaCogs /> Campos a Inserción / Validación
                            </h4>
                            <Button variant="ghost" onClick={addField} className="text-xs font-bold hover:bg-blue-50 text-blue-600">
                                <FaPlus className="mr-2" /> Añadir Campo
                            </Button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {formData.dependentFields.map((f, i) => (
                                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 items-center animate-in slide-in-from-top-2 duration-200">
                                    <div className="sm:col-span-3">
                                        <input
                                            placeholder="Origen (Opcional)"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white font-medium transition-all"
                                            value={f.sourceField}
                                            onChange={e => updateField(i, 'sourceField', e.target.value)}
                                        />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <input
                                            placeholder="Destino (Obligatorio)"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white font-medium transition-all"
                                            value={f.targetField}
                                            onChange={e => updateField(i, 'targetField', e.target.value)}
                                        />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <input
                                            placeholder="Defecto"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-white font-medium transition-all"
                                            value={f.defaultValue}
                                            onChange={e => updateField(i, 'defaultValue', e.target.value)}
                                        />
                                    </div>
                                    <div className="sm:col-span-2 flex justify-center">
                                        <label className="flex flex-col items-center gap-1 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={f.isKey}
                                                onChange={e => updateField(i, 'isKey', e.target.checked)}
                                            />
                                            <span className="text-[9px] font-black uppercase text-slate-400 group-hover:text-blue-500">Clave</span>
                                        </label>
                                    </div>
                                    <div className="sm:col-span-1 flex justify-end">
                                        <button
                                            onClick={() => removeField(i)}
                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <FaTrash />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} className="px-8 shadow-lg shadow-blue-500/20">
                        <FaSave className="mr-2" /> {initialData ? "Actualizar Dependencia" : "Guardar Dependencia"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
