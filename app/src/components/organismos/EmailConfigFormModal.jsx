import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaServer, FaEnvelope, FaKey, FaShieldAlt } from "react-icons/fa";
import { Button } from "../../index";

export function EmailConfigFormModal({ isOpen, onClose, config, onSave }) {
    const [formData, setFormData] = useState({
        name: "",
        host: "",
        port: 587,
        secure: false,
        auth: { user: "", pass: "" },
        from: "",
        isDefault: false,
        isActive: true
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (config) {
            setFormData({
                ...config,
                auth: { ...config.auth, pass: "" } // Don't show password for security
            });
        } else {
            setFormData({
                name: "",
                host: "",
                port: 587,
                secure: false,
                auth: { user: "", pass: "" },
                from: "",
                isDefault: false,
                isActive: true
            });
        }
    }, [config, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes("auth.")) {
            const field = name.split(".")[1];
            setFormData(prev => ({ ...prev, auth: { ...prev.auth, [field]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.host || !formData.port || !formData.auth.user) return;

        const finalData = { ...formData };
        if (config && !finalData.auth.pass) {
            delete finalData.auth.pass; // Don't send empty pass if editing
        }

        setLoading(true);
        try {
            await onSave(finalData);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-6" onClick={onClose}>
            <div className="w-full max-w-[700px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200">
                    <h2 className="text-2xl font-extrabold text-slate-900">
                        {config ? "Editar Configuración SMTP" : "Nueva Configuración SMTP"}
                    </h2>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Section Title */}
                    <h3 className="text-xs font-extrabold text-primary-500 uppercase tracking-wide flex items-center gap-2">
                        <FaServer /> Servidor de Salida
                        <div className="flex-1 h-[1px] bg-slate-200/40" />
                    </h3>

                    {/* Grid */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Nombre de la Cuenta <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaEnvelope className="text-slate-400" />
                                <input
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Ej: Gmail Notificaciones"
                                    required
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Servidor SMTP <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaServer className="text-slate-400" />
                                <input
                                    type="text"
                                    name="host"
                                    value={formData.host}
                                    onChange={handleChange}
                                    placeholder="Ej: smtp.gmail.com"
                                    required
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Puerto <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaShieldAlt className="text-slate-400" />
                                <input
                                    type="number"
                                    name="port"
                                    value={formData.port}
                                    onChange={handleChange}
                                    placeholder="587"
                                    required
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Remitente (From) <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaEnvelope className="text-slate-400" />
                                <input
                                    name="from"
                                    value={formData.from}
                                    onChange={handleChange}
                                    placeholder='"Nombre" <email@dominio.com>'
                                    required
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section Title */}
                    <h3 className="text-xs font-extrabold text-primary-500 uppercase tracking-wide flex items-center gap-2">
                        <FaKey /> Autenticación
                        <div className="flex-1 h-[1px] bg-slate-200/40" />
                    </h3>

                    {/* Grid */}
                    <div className="grid grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Usuario / Email <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaEnvelope className="text-slate-400" />
                                <input
                                    type="email"
                                    name="auth.user"
                                    value={formData.auth.user}
                                    onChange={handleChange}
                                    placeholder="email@dominio.com"
                                    required
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                Contraseña {config ? "(Mantener vacía)" : " * "}
                            </label>
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                                <FaKey className="text-slate-400" />
                                <input
                                    type="password"
                                    name="auth.pass"
                                    value={formData.auth.pass}
                                    onChange={handleChange}
                                    placeholder="••••••••"
                                    required={!config}
                                    className="flex-1 bg-transparent border-none text-slate-900 font-semibold focus:outline-none placeholder:text-slate-400/60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Check Group */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="secure"
                                checked={formData.secure}
                                onChange={handleChange}
                                className="w-4 h-4 accent-blue-500"
                            />
                            <span className="text-sm font-bold text-slate-700">Usar conexión segura (SSL/TLS)</span>
                        </label>
                        {(!config || !config.isDefault) && (
                            <label className="flex items-center gap-3 cursor-pointer mt-2">
                                <input
                                    type="checkbox"
                                    name="isDefault"
                                    checked={formData.isDefault}
                                    onChange={handleChange}
                                    className="w-4 h-4 accent-blue-500"
                                />
                                <span className="text-sm font-bold text-slate-700">Establecer como cuenta predeterminada</span>
                            </label>
                        )}
                        <label className="flex items-center gap-3 cursor-pointer mt-2">
                            <input
                                type="checkbox"
                                name="isActive"
                                checked={formData.isActive}
                                onChange={handleChange}
                                className="w-4 h-4 accent-blue-500"
                            />
                            <span className="text-sm font-bold text-slate-700">Activar configuración de inmediato</span>
                        </label>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" type="submit" icon={<FaSave />} loading={loading}>
                            {config ? "Actualizar Cuenta" : "Guardar Cuenta"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
