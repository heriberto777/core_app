import React, { useState, useEffect } from "react";
import { FaCog, FaEye, FaShieldAlt, FaList, FaSortAmountDown, FaCheckSquare, FaSquare, FaInfoCircle, FaTimes, FaLayerGroup } from "react-icons/fa";
import { Button } from "../index";

export const ModuleFormModal = ({ isOpen, onClose, onSave, initialData = null, categories = [], availableActions = [] }) => {
    const [formData, setFormData] = useState({
        name: "",
        displayName: "",
        description: "",
        isActive: true,
        actions: ["read"],
        uiConfig: {
            category: "otros",
            icon: "FaRegCircle",
            order: 10,
            visible: true
        }
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                actions: (initialData.actions || []).map(a => typeof a === 'string' ? a : (a.name || a.displayName || '')),
                uiConfig: {
                    ...initialData.uiConfig || {
                        category: "otros",
                        icon: "FaRegCircle",
                        order: 10,
                        visible: true
                    }
                }
            });
        } else {
            setFormData({
                name: "",
                displayName: "",
                description: "",
                isActive: true,
                actions: ["read"],
                uiConfig: {
                    category: "otros",
                    icon: "FaRegCircle",
                    order: 10,
                    visible: true
                }
            });
        }
    }, [initialData, isOpen]);

    const handleToggleAction = (action) => {
        const currentActions = [...formData.actions];
        if (currentActions.includes(action)) {
            setFormData({
                ...formData,
                actions: currentActions.filter(a => a !== action)
            });
        } else {
            setFormData({
                ...formData,
                actions: [...currentActions, action]
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-[850px] max-h-[90vh] bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                            <FaCog className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-slate-900">
                                {initialData ? "Editar Módulo" : "Nuevo Módulo"}
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuración de Capacidad Operativa</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Scroll Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {/* System Alert */}
                    <div className="bg-blue-50/50 border border-blue-100 text-blue-700 px-6 py-4 rounded-[20px] text-sm flex gap-4 items-start animate-in slide-in-from-top-2 duration-500">
                        <FaInfoCircle className="mt-1 shrink-0 text-blue-500" />
                        <span className="font-medium leading-relaxed">
                            Los módulos son las unidades funcionales del sistema. Definen los permisos, la posición en el menú y el comportamiento general de la interfaz para los usuarios finales.
                        </span>
                    </div>

                    {/* Form Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Nombre Técnico
                            </label>
                            <input
                                disabled={initialData?.isSystem}
                                required
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 bg-slate-50/50 transition-all placeholder:text-slate-300"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                                placeholder="ej: facturacion_electronica"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Nombre Visible
                            </label>
                            <input
                                required
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 bg-slate-50/50 transition-all"
                                value={formData.displayName}
                                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                placeholder="ej: Facturación Electrónica"
                            />
                        </div>
                        <div className="md:col-span-2 flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Descripción Funcional
                            </label>
                            <textarea
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 bg-slate-50/50 transition-all resize-none h-24"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describa el propósito y alcance de este módulo..."
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Categoría UI
                            </label>
                            <select
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 bg-slate-50/50 transition-all appearance-none"
                                value={formData.uiConfig.category}
                                onChange={e => setFormData({ ...formData, uiConfig: { ...formData.uiConfig, category: e.target.value } })}
                            >
                                <option value="principal">🚀 Principal</option>
                                <option value="administracion">🛡️ Administración</option>
                                <option value="reportes">📊 Reportes</option>
                                <option value="configuracion">⚙️ Configuración</option>
                                <option value="otros">📦 Otros</option>
                                {categories.map(c => !["principal", "administracion", "reportes", "configuracion", "otros"].includes(c.name) && (
                                    <option key={c.name} value={c.name}>{c.displayName || c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Orden en Menú
                            </label>
                            <input
                                type="number"
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-500 bg-slate-50/50 transition-all"
                                value={formData.uiConfig.order}
                                onChange={e => setFormData({ ...formData, uiConfig: { ...formData.uiConfig, order: parseInt(e.target.value) || 0 } })}
                            />
                        </div>
                    </div>

                    {/* Section Title */}
                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-3 border-l-4 border-blue-600 pl-4">
                            <FaCheckSquare className="text-blue-600" /> Capacidades Atómicas (Acciones)
                        </h3>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-6 rounded-[24px] border border-slate-100">
                            {availableActions.map(actionObj => {
                                const actionValue = typeof actionObj === 'string' ? actionObj : (actionObj.name || actionObj.value || '');
                                const actionLabel = typeof actionObj === 'string' ? actionObj : (actionObj.displayName || actionObj.name || '');
                                const checked = formData.actions.includes(actionValue);
                                
                                return (
                                    <label key={actionValue} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border ${
                                        checked ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-white border-slate-200 text-slate-500 hover:border-blue-400"
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToggleAction(actionValue)}
                                            className="sr-only"
                                        />
                                        {checked ? <FaCheckSquare className="text-xs" /> : <FaSquare className="text-xs opacity-30" />}
                                        {actionLabel}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50/50 backdrop-blur-md flex justify-end gap-3 border-t border-slate-100">
                    <Button variant="ghost" onClick={onClose} className="font-bold">Cancelar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        loading={loading}
                        className="px-10 shadow-lg shadow-blue-600/20"
                    >
                        {initialData ? "Actualizar Módulo" : "Registrar Módulo"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
