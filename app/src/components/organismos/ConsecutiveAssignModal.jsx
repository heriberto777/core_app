import React, { useState, useEffect } from "react";
import { FaTimes, FaLink, FaShieldAlt, FaLayerGroup, FaCheckSquare, FaSquare } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";
import { ConsecutiveApi, MappingApi } from "../../api/index";

const consecutiveApi = new ConsecutiveApi();
const mappingApi = new MappingApi();

export function ConsecutiveAssignModal({ isOpen, onClose, onAssign, consecutive, accessToken }) {
    const [loading, setLoading] = useState(false);
    const [mappings, setMappings] = useState([]);
    const [formData, setFormData] = useState({
        entityType: "mapping",
        entityId: "",
        allowedOperations: ["read", "increment"]
    });

    useEffect(() => {
        if (isOpen && formData.entityType === "mapping") {
            fetchMappings();
        }
    }, [isOpen, formData.entityType]);

    const fetchMappings = async () => {
        try {
            setLoading(true);
            const data = await mappingApi.getMappings(accessToken);
            setMappings(data || []);
            if (data?.length > 0) {
                setFormData(prev => ({ ...prev, entityId: data[0]._id }));
            }
        } catch (error) {
            console.error("Error fetching mappings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpToggle = (op) => {
        setFormData(prev => {
            const ops = prev.allowedOperations.includes(op)
                ? prev.allowedOperations.filter(o => o !== op)
                : [...prev.allowedOperations, op];
            return { ...prev, allowedOperations: ops };
        });
    };

    const handleSubmit = () => {
        if (!formData.entityId) return alert("Debe seleccionar una entidad");
        if (formData.allowedOperations.length === 0) return alert("Debe seleccionar al menos un permiso");
        onAssign(formData);
    };

    if (!isOpen || !consecutive) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-white w-full max-w-[550px] rounded-[32px] border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <FaLink />
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900">Vincular Folio</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <FaTimes className="text-slate-400" />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-8 flex flex-col gap-8">
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600 text-xs">
                            <FaLayerGroup />
                        </div>
                        <div className="text-sm text-blue-800 font-medium">
                            Asignando: <strong className="font-black">{consecutive.name}</strong>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Tipo de Entidad</label>
                        <select
                            className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold appearance-none transition-all"
                            value={formData.entityType}
                            onChange={e => setFormData({ ...formData, entityType: e.target.value })}
                        >
                            <option value="mapping">Configuración de Mapeo</option>
                            <option value="user">Usuario Específico</option>
                            <option value="company">Compañía</option>
                        </select>
                    </div>

                    {formData.entityType === 'mapping' ? (
                        <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Mapeo de Transferencia</label>
                            <select
                                disabled={loading}
                                className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold appearance-none transition-all disabled:opacity-50"
                                value={formData.entityId}
                                onChange={e => setFormData({ ...formData, entityId: e.target.value })}
                            >
                                {mappings.map(m => (
                                    <option key={m._id} value={m._id}>{m.name} ({m.entityType})</option>
                                ))}
                            </select>
                            {mappings.length === 0 && !loading && (
                                <p className="text-xs text-red-500 font-bold mt-1 px-1">No se encontraron mapeos disponibles.</p>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">ID de la Entidad</label>
                            <input
                                className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                                placeholder="Ingrese el ID manual"
                                value={formData.entityId}
                                onChange={e => setFormData({ ...formData, entityId: e.target.value })}
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                            <FaShieldAlt className="text-blue-500" /> Permisos de Operación
                        </label>
                        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                            {[
                                { id: 'read', label: 'Lectura' },
                                { id: 'increment', label: 'Incremento' },
                                { id: 'reset', label: 'Reinicio' },
                                { id: 'all', label: 'Todo' }
                            ].map(op => {
                                const checked = formData.allowedOperations.includes(op.id);
                                return (
                                    <label
                                        key={op.id}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                                            checked ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-white border-slate-200 text-slate-600 hover:border-blue-400"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={checked}
                                            onChange={() => handleOpToggle(op.id)}
                                        />
                                        {checked ? <FaCheckSquare /> : <FaSquare className="text-slate-300" />}
                                        {op.label.toUpperCase()}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading} className="px-8 shadow-lg shadow-blue-500/20">
                        Confirmar Vínculo
                    </Button>
                </div>
            </div>
        </div>
    );
}
