import React from "react";
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes, FaLayerGroup, FaArrowRight } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const formatErrorMessage = (errMsg, errorCode) => {
    if (errorCode === "NULL_VALUE_ERROR") return errMsg;
    if (errorCode === "TRUNCATION_ERROR") return errMsg;
    if (errorCode === "CONNECTION_ERROR") return "Error de conexión a la base de datos. Intente nuevamente.";
    if (errorCode === "SEVERE_CONNECTION_ERROR") return "Error crítico de conexión. Contacte al administrador.";

    if (errMsg.includes("Cannot insert the value NULL into column")) {
        const colMatch = errMsg.match(/column '([^']+)'/);
        return `Campo '${colMatch ? colMatch[1] : "?"}' obligatorio vacío en destino.`;
    }
    if (errMsg.includes("String or binary data would be truncated")) {
        const colMatch = errMsg.match(/column '([^']+)'/);
        return `Texto demasiado largo para '${colMatch ? colMatch[1] : "?"}'.`;
    }
    return errMsg;
};

export function ProcessingResultsModal({ isOpen, onClose, results }) {
    if (!isOpen || !results) return null;

    const resultData = results.data || results;
    const { processed = 0, failed = 0, skipped = 0, errorDetails = [], details = [], chainedResults = [] } = resultData;

    // Normalizar errores de diferentes versiones de la API
    const errors = errorDetails.length > 0 ? errorDetails : (details || []).filter(d => !d.success);

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-[650px] max-h-[90vh] bg-white rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 flex items-center justify-between border-b border-slate-50 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                            failed === 0 ? "bg-emerald-500 shadow-emerald-500/20" : "bg-amber-500 shadow-amber-500/20"
                        }`}>
                            {failed === 0 ? <FaCheckCircle className="text-xl" /> : <FaExclamationCircle className="text-xl" />}
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Procesamiento Finalizado</h3>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen de Ejecución del Workflow</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: "Procesados", val: processed, color: "emerald", icon: <FaCheckCircle /> },
                            { label: "Fallidos", val: failed, color: "red", icon: <FaTimes /> },
                            { label: "Omitidos", val: skipped, color: "slate", icon: <FaInfoCircle /> }
                        ].map(stat => (
                            <div key={stat.label} className={`p-6 rounded-[24px] border flex flex-col items-center gap-1 shadow-sm ${
                                stat.color === "emerald" ? "bg-emerald-50/30 border-emerald-100 text-emerald-700" :
                                stat.color === "red" ? "bg-red-50/30 border-red-100 text-red-700" :
                                "bg-slate-50 border-slate-100 text-slate-700"
                            }`}>
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{stat.label}</span>
                                <span className="text-3xl font-black">{stat.val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Error Details */}
                    {errors.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-[11px] font-black text-red-600 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-red-500 pl-4">
                                <FaExclamationCircle /> Detalle de Incidencias
                            </h4>
                            <div className="space-y-3">
                                {errors.map((err, i) => (
                                    <div key={i} className="p-5 bg-red-50/50 border border-red-100 rounded-[20px] flex gap-4 items-start group hover:bg-red-50 transition-colors">
                                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0 mt-1">
                                            <FaTimes className="text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">Documento: {err.documentId}</span>
                                            <p className="text-sm font-bold text-slate-700 leading-relaxed">
                                                {formatErrorMessage(err.error || err.message || "Error desconocido", err.errorCode)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Chained Results */}
                    {chainedResults && chainedResults.length > 0 && (
                        <div className="space-y-6 pt-6 border-t border-slate-50">
                            <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-blue-500 pl-4">
                                <FaLayerGroup /> Workflows Encadenados
                            </h4>
                            <div className="grid grid-cols-1 gap-3">
                                {chainedResults.map((chain, i) => (
                                    <div key={i} className={`flex items-center justify-between p-5 rounded-[20px] border transition-all ${
                                        chain.failed === 0 ? "bg-emerald-50/30 border-emerald-100" : "bg-red-50/30 border-red-100"
                                    }`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${
                                                chain.failed === 0 ? "bg-emerald-500" : "bg-red-500"
                                            }`}>
                                                <FaArrowRight className="text-xs" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900">{chain.mappingName}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    {chain.processed} OK • {chain.failed} FALLIDOS
                                                </span>
                                            </div>
                                        </div>
                                        {chain.failed === 0 ? (
                                            <FaCheckCircle className="text-emerald-500 text-xl" />
                                        ) : (
                                            <FaExclamationCircle className="text-red-500 text-xl" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Success Placeholder */}
                    {failed === 0 && processed > 0 && (!chainedResults || chainedResults.length === 0) && (
                        <div className="flex flex-col items-center justify-center py-10 gap-6 text-center animate-in zoom-in-90 duration-700">
                            <div className="w-24 h-24 bg-emerald-100 rounded-[32px] flex items-center justify-center text-emerald-500 shadow-inner">
                                <FaCheckCircle className="text-5xl" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <h5 className="text-lg font-black text-slate-900">¡Todo en Orden!</h5>
                                <p className="text-sm text-slate-500 font-medium max-w-[320px]">
                                    Todos los documentos seleccionados han sido integrados exitosamente en el ERP.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50/50 backdrop-blur-md flex justify-end gap-3 border-t border-slate-100">
                    <Button variant="primary" onClick={onClose} className="px-10 py-3 shadow-lg shadow-blue-600/20 font-black">
                        Cerrar Resumen
                    </Button>
                </div>
            </div>
        </div>
    );
}
