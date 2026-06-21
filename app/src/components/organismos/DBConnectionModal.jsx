import React, { useState, useEffect } from "react";
import { FaDatabase, FaServer, FaUser, FaLock, FaNetworkWired, FaCheckCircle, FaTimesCircle, FaShieldAlt, FaTimes } from "react-icons/fa";
import { Button, Input, Select } from "../index";

export const DBConnectionModal = ({ isOpen, onClose, onSave, onTest, initialData = null }) => {
    const [formData, setFormData] = useState({
        serverName: "",
        host: "",
        user: "",
        password: "",
        database: "",
        port: "1433",
        mssqlEncrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000,
        type: "mssql"
    });

    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        if (initialData) setFormData(initialData);
        else setFormData({
            serverName: "", host: "", user: "", password: "", database: "",
            port: "1433", mssqlEncrypt: true, trustServerCertificate: true,
            connectTimeout: 30000, type: "mssql"
        });
        setTestResult(null);
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await onTest(formData);
            setTestResult({ success: res.success, message: res.message });
        } catch (e) {
            setTestResult({ success: false, message: e.message || "Error de conexión" });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(formData);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[650px] rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 bg-white/80 backdrop-blur-md border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/20">
                            <FaDatabase className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-xl font-black text-slate-900 leading-tight">Configuración de Nodo</h2>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronización de Base de Datos</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-8 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                            label="NOMBRE IDENTIFICADOR"
                            icon={FaDatabase}
                            placeholder="Ej: Produccion_Central"
                            value={formData.serverName}
                            onChange={e => setFormData({ ...formData, serverName: e.target.value })}
                            disabled={initialData}
                            className="rounded-2xl border-slate-200 font-bold"
                        />

                        <Select
                            label="MOTOR DE BASE DE DATOS"
                            icon={FaShieldAlt}
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            className="rounded-2xl border-slate-200 font-bold appearance-none bg-white"
                        >
                            <option value="mssql">SQL Server (Mando)</option>
                            <option value="mysql">MySQL / MariaDB</option>
                            <option value="postgres">PostgreSQL</option>
                        </Select>
                    </div>

                    <Input
                        label="HOST / IP DEL SERVIDOR"
                        icon={FaServer}
                        placeholder="ej: 192.168.1.100"
                        value={formData.host}
                        onChange={e => setFormData({ ...formData, host: e.target.value })}
                        className="rounded-2xl border-slate-200 font-bold"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                            label="PUERTO DE RED"
                            icon={FaNetworkWired}
                            value={formData.port}
                            onChange={e => setFormData({ ...formData, port: e.target.value })}
                            className="rounded-2xl border-slate-200 font-bold"
                        />
                        <Input
                            label="INSTANCIA / CATÁLOGO"
                            icon={FaDatabase}
                            value={formData.database}
                            onChange={e => setFormData({ ...formData, database: e.target.value })}
                            className="rounded-2xl border-slate-200 font-bold"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                            label="USUARIO DE ACCESO"
                            icon={FaUser}
                            value={formData.user}
                            onChange={e => setFormData({ ...formData, user: e.target.value })}
                            className="rounded-2xl border-slate-200 font-bold"
                        />
                        <Input
                            label="CLAVE DE SEGURIDAD"
                            icon={FaLock}
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            className="rounded-2xl border-slate-200 font-bold"
                        />
                    </div>

                    {testResult && (
                        <div className={`p-5 rounded-2xl border flex items-center gap-4 animate-in slide-in-from-top-4 duration-300 ${
                            testResult.success ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
                        }`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${testResult.success ? "bg-emerald-500" : "bg-red-500"}`}>
                                {testResult.success ? <FaCheckCircle /> : <FaTimesCircle />}
                            </div>
                            <span className="text-sm font-bold">{testResult.message}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50/50 backdrop-blur-md border-t border-slate-100 flex justify-between gap-3">
                    <Button 
                        variant="outline" 
                        onClick={handleTest} 
                        loading={testing}
                        className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-slate-200 hover:bg-white transition-all"
                    >
                        Validar Conectividad
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={onClose} className="font-bold">Cancelar</Button>
                        <Button 
                            variant="primary" 
                            onClick={handleSave} 
                            loading={saving}
                            className="px-10 py-3 shadow-lg shadow-slate-900/20 font-black text-[10px] uppercase tracking-[0.2em] bg-slate-900 hover:bg-black border-none"
                        >
                            Guardar Nodo
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
