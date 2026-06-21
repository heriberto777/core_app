import React, { useState } from "react";
import { FaVial, FaPaperPlane, FaTimes, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { Modal, Button } from "../../index";

export function EmailTestModal({ isOpen, onClose, config, onSendTest }) {
    const [testEmail, setTestEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!testEmail) return;
        setLoading(true);
        setResult(null);
        try {
            const success = await onSendTest(config._id, testEmail);
            if (success) {
                setResult({ success: true, message: `Correo de prueba enviado con éxito a ${testEmail}. Por favor revisa la bandeja de entrada y la carpeta de spam.` });
            } else {
                setResult({ success: false, message: "El servidor SMTP rechazó la conexión o las credenciales son inválidas." });
            }
        } catch (err) {
            setResult({ success: false, message: err.message || "Error inesperado al intentar enviar el correo de prueba." });
        } finally {
            setLoading(false);
        }
    };

    const resetAndClose = () => {
        setTestEmail("");
        setResult(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={resetAndClose} maxWidth="max-w-lg">
            <div className="flex flex-col gap-8 p-8 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                    <h2 className="m-0 text-xl font-extrabold text-slate-900 flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                            <FaVial />
                        </div>
                        Probar Configuración
                    </h2>
                    <button onClick={resetAndClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-xs text-slate-600 leading-relaxed">
                    Estás probando la cuenta <strong className="text-blue-700">{config?.name}</strong>. Se enviará un correo técnico para validar que el host, puerto y credenciales funcionen correctamente en tiempo real.
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Email de Destino</label>
                        <div className="relative flex items-center">
                            <FaPaperPlane className="absolute left-4 text-slate-300 text-xs" />
                            <input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                className="w-full pl-10 pr-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all placeholder:text-slate-300"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                </div>

                {result && (
                    <div className={`p-4 rounded-2xl flex items-start gap-4 text-xs font-bold animate-in slide-in-from-top-2 duration-200 ${
                        result.success ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                        <div className="mt-0.5">
                            {result.success ? <FaCheckCircle className="text-lg" /> : <FaExclamationTriangle className="text-lg" />}
                        </div>
                        <span className="leading-normal">{result.message}</span>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={resetAndClose} disabled={loading}>Cerrar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSend}
                        loading={loading}
                        disabled={!testEmail || loading}
                        className="px-8 shadow-lg shadow-blue-500/20"
                    >
                        <FaPaperPlane className="mr-2" /> Enviar Prueba
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
