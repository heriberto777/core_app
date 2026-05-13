import React, { useState, useEffect } from "react";
import { FaTimes, FaSave, FaCog, FaLayerGroup, FaSync, FaHashtag, FaServer, FaCogs } from "react-icons/fa";
import { Button, StatusBadge, Input, Select } from "../../index";

export function ConsecutiveFormModal({ isOpen, onClose, onSave, consecutive = null }) {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        currentValue: 0,
        prefix: "",
        padLength: 7,
        padChar: "0",
        pattern: "",
        active: true,
        segments: {
            enabled: false,
            type: "year",
            field: ""
        },
        sqlSync: {
            enabled: false,
            serverKey: "server1",
            tableName: "",
            keyField: "",
            keyValue: "",
            valueField: ""
        }
    });

    useEffect(() => {
        if (consecutive) {
            setFormData({
                ...consecutive,
                segments: consecutive.segments || { enabled: false, type: "year", field: "" },
                sqlSync: consecutive.sqlSync || {
                    enabled: false, serverKey: "server1", tableName: "", keyField: "", keyValue: "", valueField: ""
                }
            });
        } else {
            setFormData({
                name: "", description: "", currentValue: 0, prefix: "", padLength: 7, padChar: "0", pattern: "", active: true,
                segments: { enabled: false, type: "year", field: "" },
                sqlSync: { enabled: false, serverKey: "server1", tableName: "", keyField: "", keyValue: "", valueField: "" }
            });
        }
    }, [consecutive, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes(".")) {
            const [parent, child] = name.split(".");
            setFormData(prev => ({
                ...prev,
                [parent]: { ...prev[parent], [child]: type === "checkbox" ? checked : value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
        }
    };

    const handleSubmit = () => {
        if (!formData.name) return alert("El nombre es obligatorio");
        onSave(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-[800px] max-h-[95vh] bg-white rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 flex items-center justify-between border-b border-slate-50 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
                            <FaHashtag className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">
                                {consecutive ? "Editar Consecutivo" : "Nuevo Consecutivo"}
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuración de Numeración y Folios</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-10">
                    {/* General Section */}
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input
                                label="NOMBRE DEL CONSECUTIVO"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Ej: Facturación Ventas"
                                className="font-bold border-slate-200 rounded-2xl px-5 py-4"
                            />
                            <Input
                                label="DESCRIPCIÓN"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                placeholder="Breve descripción del uso"
                                className="font-bold border-slate-200 rounded-2xl px-5 py-4"
                            />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <Input
                                label="VALOR ACTUAL"
                                type="number"
                                name="currentValue"
                                value={formData.currentValue}
                                onChange={handleChange}
                                className="font-black text-emerald-600 border-slate-200 rounded-2xl px-5 py-4"
                            />
                            <Input
                                label="PREFIJO"
                                name="prefix"
                                value={formData.prefix}
                                onChange={handleChange}
                                placeholder="Ej: F-"
                                className="font-bold border-slate-200 rounded-2xl px-5 py-4"
                            />
                            <Input
                                label="RELLENO"
                                name="padChar"
                                value={formData.padChar}
                                onChange={handleChange}
                                maxLength={1}
                                className="font-bold border-slate-200 rounded-2xl px-5 py-4 text-center"
                            />
                            <Input
                                label="LONGITUD"
                                type="number"
                                name="padLength"
                                value={formData.padLength}
                                onChange={handleChange}
                                className="font-bold border-slate-200 rounded-2xl px-5 py-4"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Input
                                label="PATRÓN DE FORMATO DINÁMICO"
                                name="pattern"
                                value={formData.pattern}
                                onChange={handleChange}
                                placeholder="Ej: {PREFIX}{YEAR}-{VALUE:6}"
                                className="font-mono font-black border-slate-200 rounded-2xl px-5 py-4"
                            />
                            <div className="flex flex-wrap gap-2 px-1">
                                {["{PREFIX}", "{YEAR}", "{MONTH}", "{VALUE:length}"].map(tag => (
                                    <span key={tag} className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{tag}</span>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-center gap-4 px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer group hover:bg-slate-100/50 transition-all">
                            <div className={`w-10 h-5 rounded-full p-1 transition-colors relative ${formData.active ? "bg-emerald-500" : "bg-slate-300"}`}>
                                <div className={`w-3 h-3 bg-white rounded-full transition-transform transform ${formData.active ? "translate-x-5" : "translate-x-0"}`} />
                            </div>
                            <input
                                type="checkbox"
                                name="active"
                                checked={formData.active}
                                onChange={handleChange}
                                className="sr-only"
                            />
                            <div className="flex flex-col">
                                <span className={`text-xs font-black uppercase tracking-wider ${formData.active ? "text-emerald-700" : "text-slate-500"}`}>Estado del Consecutivo</span>
                                <span className="text-[10px] font-bold text-slate-400">Determina si este folio puede ser utilizado en procesos operativos</span>
                            </div>
                        </label>
                    </div>

                    {/* Operational Segments */}
                    <div className="p-8 bg-slate-50/50 border border-slate-100 rounded-[28px] space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                <FaLayerGroup className="text-emerald-500" /> Segmentación Operativa
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="segments.enabled"
                                    checked={formData.segments.enabled}
                                    onChange={handleChange}
                                    className="w-5 h-5 rounded-lg border-slate-200 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Habilitar</span>
                            </label>
                        </div>

                        {formData.segments.enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-300">
                                <Select
                                    label="TIPO DE SEGMENTO"
                                    name="segments.type"
                                    value={formData.segments.type}
                                    onChange={handleChange}
                                    className="font-bold border-slate-200 rounded-2xl px-5 py-4 appearance-none bg-white"
                                >
                                    <option value="year">📅 Por Año (2024, 2025...)</option>
                                    <option value="month">🗓️ Por Mes (202401...)</option>
                                    <option value="company">🏢 Por Compañía</option>
                                    <option value="user">👤 Por Usuario</option>
                                    <option value="custom">🛠️ Campo Personalizado</option>
                                </Select>
                                {formData.segments.type === 'custom' && (
                                    <Input
                                        label="NOMBRE DEL CAMPO"
                                        name="segments.field"
                                        value={formData.segments.field}
                                        onChange={handleChange}
                                        placeholder="Ej: SucursalID"
                                        className="font-bold border-slate-200 rounded-2xl px-5 py-4 bg-white"
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* ERP Sync */}
                    <div className="p-8 bg-blue-50/30 border border-blue-100 rounded-[28px] space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[11px] font-black text-blue-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                <FaSync className="text-blue-500" /> Sincronización ERP (SQL Server)
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="sqlSync.enabled"
                                    checked={formData.sqlSync.enabled}
                                    onChange={handleChange}
                                    className="w-5 h-5 rounded-lg border-blue-200 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-[10px] font-black text-blue-600/50 uppercase tracking-widest">Habilitar</span>
                            </label>
                        </div>

                        {formData.sqlSync.enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-300">
                                <Select
                                    label="SERVIDOR ERP"
                                    name="sqlSync.serverKey"
                                    value={formData.sqlSync.serverKey}
                                    onChange={handleChange}
                                    className="font-bold border-blue-100 rounded-2xl px-5 py-4 appearance-none bg-white"
                                >
                                    <option value="server1">🖥️ Server 1 (Producción)</option>
                                    <option value="server2">🖥️ Server 2 (Backup/Testing)</option>
                                </Select>
                                <Input
                                    label="NOMBRE DE TABLA"
                                    name="sqlSync.tableName"
                                    value={formData.sqlSync.tableName}
                                    onChange={handleChange}
                                    placeholder="Ej: catelli.CONSECUTIVO"
                                    className="font-bold border-blue-100 rounded-2xl px-5 py-4 bg-white"
                                />
                                <Input
                                    label="CAMPO DE CLAVE (ID)"
                                    name="sqlSync.keyField"
                                    value={formData.sqlSync.keyField}
                                    onChange={handleChange}
                                    placeholder="Ej: CONSECUTIVO"
                                    className="font-bold border-blue-100 rounded-2xl px-5 py-4 bg-white"
                                />
                                <Input
                                    label="VALOR DE CLAVE (ID)"
                                    name="sqlSync.keyValue"
                                    value={formData.sqlSync.keyValue}
                                    onChange={handleChange}
                                    placeholder="Ej: 04"
                                    className="font-bold border-blue-100 rounded-2xl px-5 py-4 bg-white"
                                />
                                <div className="md:col-span-2">
                                    <Input
                                        label="CAMPO DE VALOR (CONTADOR)"
                                        name="sqlSync.valueField"
                                        value={formData.sqlSync.valueField}
                                        onChange={handleChange}
                                        placeholder="Ej: ULTIMO_VALOR"
                                        className="font-bold border-blue-100 rounded-2xl px-5 py-4 bg-white"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md">
                    <Button variant="ghost" onClick={onClose} className="font-bold">Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} className="px-8 shadow-lg shadow-emerald-600/20 font-black">
                        <FaSave className="mr-2" /> {consecutive ? "Guardar Cambios" : "Crear Consecutivo"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
