import React, { useState } from "react";
import { FaTimes, FaSave, FaDatabase, FaLink, FaList, FaQuestionCircle } from "react-icons/fa";

/**
 * Corporate TaskFormModal (Tailwind Edition)
 */
export function TaskFormModal({
    isOpen,
    onClose,
    onSave,
    task = null,
    loading = false,
    className = ""
}) {
    const [activeTab, setActiveTab] = useState("general");
    const [formData, setFormData] = useState({ ...task });

    if (!isOpen) return null;

    const tabs = [
        { id: "general", label: "General", icon: <FaList /> },
        { id: "database", label: "Base de Datos", icon: <FaDatabase /> },
        { id: "mapping", label: "Mapeo", icon: <FaLink /> },
    ];

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave?.(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-[95%] max-w-[900px] max-h-[90vh] rounded-xl flex flex-col shadow-premium border border-slate-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800 m-0">
                        {task ? "Editar Tarea" : "Nueva Tarea"}
                    </h2>
                    <button onClick={onClose} className="bg-transparent border-none text-slate-400 cursor-pointer hover:text-slate-600">
                        <FaTimes />
                    </button>
                </div>

                <div className="flex bg-slate-50 border-b border-slate-200">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex-1 px-4 py-3 border-none bg-none text-sm font-semibold cursor-pointer border-b-2 transition-all duration-200 flex items-center justify-center gap-2
                                ${activeTab === tab.id 
                                    ? "text-primary-500 border-primary-500" 
                                    : "text-slate-500 border-transparent hover:bg-slate-100"}
                            `}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            Nombre de la Tarea
                            <FaQuestionCircle className="text-primary-500 cursor-help text-xs" />
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => handleChange("name", e.target.value)}
                            placeholder="Nombre identificador de la tarea"
                            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Descripción</label>
                        <textarea
                            value={formData.description}
                            onChange={e => handleChange("description", e.target.value)}
                            placeholder="Descripción opcional de la tarea"
                            rows={3}
                            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-y"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Base de Datos Origen</label>
                            <select
                                value={formData.sourceDb}
                                onChange={e => handleChange("sourceDb", e.target.value)}
                                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="">Seleccionar...</option>
                                <option value="erp">ERP Principal</option>
                                <option value="crm">CRM</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Base de Datos Destino</label>
                            <select
                                value={formData.targetDb}
                                onChange={e => handleChange("targetDb", e.target.value)}
                                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="">Seleccionar...</option>
                                <option value="warehouse">Almacén</option>
                                <option value="analytics">Analítica</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Programación (Cron)</label>
                        <input
                            type="text"
                            value={formData.schedule}
                            onChange={e => handleChange("schedule", e.target.value)}
                            placeholder="0 * * * *"
                            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>
                </div>

                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 border-none rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <FaSave />
                        {loading ? "Guardando..." : "Guardar Tarea"}
                    </button>
                </div>
            </div>
        </div>
    );
}