import React, { useState, useEffect } from "react";
import { FaShieldAlt, FaInfoCircle, FaLock, FaCheckSquare, FaSquare, FaTimes, FaUnlockAlt, FaKey } from "react-icons/fa";
import { Button } from "../index";

export const RoleFormModal = ({ isOpen, onClose, onSave, initialData = null, resources = [] }) => {
    const [formData, setFormData] = useState({
        name: "",
        displayName: "",
        description: "",
        permissions: []
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || "",
                displayName: initialData.displayName || "",
                description: initialData.description || "",
                permissions: initialData.permissions || []
            });
        } else {
            setFormData({
                name: "", displayName: "", description: "", permissions: []
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleTogglePermission = (resourceId, action) => {
        const currentPermissions = [...formData.permissions];
        const resourceIdx = currentPermissions.findIndex(p => p.resource === resourceId);

        if (resourceIdx >= 0) {
            const actions = currentPermissions[resourceIdx].actions;
            if (actions.includes(action)) {
                currentPermissions[resourceIdx].actions = actions.filter(a => a !== action);
                if (currentPermissions[resourceIdx].actions.length === 0) {
                    currentPermissions.splice(resourceIdx, 1);
                }
            } else {
                currentPermissions[resourceIdx].actions.push(action);
            }
        } else {
            currentPermissions.push({ resource: resourceId, actions: [action] });
        }

        setFormData({ ...formData, permissions: currentPermissions });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.permissions.length) {
            alert("Debe seleccionar al menos un permiso.");
            return;
        }
        setLoading(true);
        try {
            await onSave(formData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-[850px] max-h-[90vh] bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-md px-8 py-7 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                            <FaShieldAlt className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-slate-900 leading-tight">
                                {initialData ? "Editar Rol de Seguridad" : "Nuevo Rol de Seguridad"}
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión de Acceso y Privilegios</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Scroll Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {/* System Alert */}
                    {initialData?.isSystem && (
                        <div className="bg-amber-50/50 border border-amber-100 text-amber-800 px-6 py-4 rounded-[20px] text-sm flex gap-4 items-start animate-in slide-in-from-top-2 duration-500">
                            <FaLock className="mt-1 shrink-0 text-amber-500" />
                            <span className="font-medium leading-relaxed italic">
                                Este es un rol crítico del sistema. Ciertas propiedades técnicas están restringidas para garantizar la integridad de la plataforma.
                            </span>
                        </div>
                    )}

                    {/* Form Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Identificador (Slug)
                            </label>
                            <input
                                disabled={initialData?.isSystem}
                                required
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-indigo-500 bg-slate-50/50 transition-all placeholder:text-slate-300"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                                placeholder="ej: analista-ventas"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Nombre Descriptivo
                            </label>
                            <input
                                disabled={initialData?.isSystem}
                                required
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-indigo-500 bg-slate-50/50 transition-all"
                                value={formData.displayName}
                                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                placeholder="ej: Analista de Ventas"
                            />
                        </div>
                        <div className="md:col-span-2 flex flex-col gap-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                                Descripción de Responsabilidades
                            </label>
                            <textarea
                                disabled={initialData?.isSystem}
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-indigo-500 bg-slate-50/50 transition-all resize-none h-24"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describa el alcance de las acciones permitidas para este perfil..."
                            />
                        </div>
                    </div>

                    {/* Section Title */}
                    <div className="space-y-8">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
                            <FaUnlockAlt className="text-indigo-600" /> Matriz de Permisos por Recurso
                        </h3>

                        {/* Resources */}
                        <div className="space-y-6">
                            {resources.map(res => {
                                const resPerm = formData.permissions.find(p => p.resource === res.id);
                                return (
                                    <div key={res.id} className="bg-slate-50/50 border border-slate-100 rounded-[28px] p-8 space-y-6 hover:border-indigo-200 transition-all group">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">{res.name}</h4>
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium ml-4">{res.description}</p>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                                            {res.actions.map(action => {
                                                const checked = resPerm?.actions.includes(action);
                                                return (
                                                    <label key={action} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border ${
                                                        checked ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-400"
                                                    }`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleTogglePermission(res.id, action)}
                                                            className="sr-only"
                                                        />
                                                        {checked ? <FaKey className="text-xs" /> : <FaSquare className="text-xs opacity-20" />}
                                                        {action}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50/50 backdrop-blur-md flex justify-end gap-3 border-t border-slate-50">
                    <Button variant="ghost" onClick={onClose} className="font-bold">Cancelar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        loading={loading}
                        className="px-10 shadow-lg shadow-indigo-600/20 font-black"
                    >
                        {initialData ? "Guardar Cambios" : "Crear Rol de Seguridad"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
