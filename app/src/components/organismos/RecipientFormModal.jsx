import React, { useState, useEffect } from "react";
import { FaUser, FaEnvelope, FaBell, FaCheckCircle, FaTimesCircle, FaSave, FaCheckSquare, FaSquare } from "react-icons/fa";
import { Button } from "../index";

export const RecipientFormModal = ({ isOpen, onClose, onSave, editingRecipient = null, loading }) => {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        notificationTypes: {
            traspaso: true,
            transferencias: true,
            erroresCriticos: true
        },
        isSend: true
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (editingRecipient) {
            setFormData({
                name: editingRecipient.name || "",
                email: editingRecipient.email || "",
                notificationTypes: {
                    traspaso: editingRecipient.notificationTypes?.traspaso ?? true,
                    transferencias: editingRecipient.notificationTypes?.transferencias ?? true,
                    erroresCriticos: editingRecipient.notificationTypes?.erroresCriticos ?? true
                },
                isSend: editingRecipient.isSend ?? true
            });
        } else {
            setFormData({
                name: "",
                email: "",
                notificationTypes: {
                    traspaso: true,
                    transferencias: true,
                    erroresCriticos: true
                },
                isSend: true
            });
        }
    }, [editingRecipient, isOpen]);

    if (!isOpen) return null;

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = "El nombre es obligatorio";
        if (!formData.email.trim()) newErrors.email = "El correo es obligatorio";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "Formato de correo inválido";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSave(formData);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[2000] p-5 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-[550px] bg-white rounded-[24px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-xl font-extrabold text-slate-900">
                        {editingRecipient ? "Editar Destinatario" : "Nuevo Destinatario"}
                    </h3>
                    <Button variant="ghost" onClick={onClose}>
                        <FaTimesCircle className="text-xl" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
                    <div className="flex flex-col gap-2">
                        <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                            <FaUser /> Nombre Completo
                        </label>
                        <div className="relative flex items-center">
                            <FaUser className="absolute left-4 text-slate-400" />
                            <input
                                placeholder="Ej: Juan Pérez"
                                className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm transition-all focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${errors.name ? "border-red-500" : "border-slate-200"}`}
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        {errors.name && <span className="text-red-500 text-[11px] font-bold px-1">{errors.name}</span>}
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                            <FaEnvelope /> Correo Electrónico
                        </label>
                        <div className="relative flex items-center">
                            <FaEnvelope className="absolute left-4 text-slate-400" />
                            <input
                                type="email"
                                placeholder="juan@ejemplo.com"
                                className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm transition-all focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${errors.email ? "border-red-500" : "border-slate-200"}`}
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        {errors.email && <span className="text-red-500 text-[11px] font-bold px-1">{errors.email}</span>}
                    </div>

                    <div className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wider mt-2.5 flex items-center gap-3 after:content-[''] after:flex-1 after:h-[1px] after:bg-slate-200/60">
                        <FaBell /> Preferencias de Notificación
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { id: 'traspaso', label: 'Traspasos Operativos', desc: 'Alertas sobre cargas procesadas y auditorías' },
                            { id: 'transferencias', label: 'Transferencias Directas', desc: 'Notificaciones de movimientos entre bodegas' },
                            { id: 'erroresCriticos', label: 'Errores Críticos', desc: 'Alertas inmediatas ante fallos en el sistema' }
                        ].map(type => (
                            <label
                                key={type.id}
                                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all hover:bg-slate-50 active:scale-[0.98] ${formData.notificationTypes[type.id] ? "border-blue-500 bg-blue-50/30" : "border-slate-200 bg-white"}`}
                            >
                                <div className="flex flex-col">
                                    <span className={`text-sm font-bold ${formData.notificationTypes[type.id] ? "text-blue-700" : "text-slate-700"}`}>
                                        {type.label}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-medium">{type.desc}</span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={formData.notificationTypes[type.id]}
                                        onChange={e => setFormData({
                                            ...formData,
                                            notificationTypes: { ...formData.notificationTypes, [type.id]: e.target.checked }
                                        })}
                                    />
                                    {formData.notificationTypes[type.id] ? (
                                        <FaCheckSquare className="text-xl text-blue-500 transition-all scale-110" />
                                    ) : (
                                        <FaSquare className="text-xl text-slate-300" />
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer mt-2 p-2 group">
                        <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={formData.isSend}
                            onChange={e => setFormData({ ...formData, isSend: e.target.checked })}
                        />
                        <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                            Habilitar envío de notificaciones para este destinatario
                        </span>
                    </label>
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave className="mr-2" /> {editingRecipient ? "Actualizar Destinatario" : "Guardar Destinatario"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
