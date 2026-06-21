import React from "react";
import { FaTimes, FaBoxOpen, FaInfoCircle, FaListUl, FaHashtag } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

export function OrderDetailsModalOrg({ isOpen, onClose, documentId, orderData, detailsData }) {
    if (!isOpen || !documentId) return null;

    // Flatten details from all possible detail tables
    const allDetailRows = [];
    if (detailsData?.data?.details) {
        Object.values(detailsData.data.details).forEach(tableItems => {
            if (Array.isArray(tableItems)) {
                allDetailRows.push(...tableItems);
            }
        });
    }

    // Get first row to define columns
    const columns = allDetailRows.length > 0 ? Object.keys(allDetailRows[0]) : [];

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-[1100px] max-h-[90vh] bg-white rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 flex items-center justify-between border-b border-slate-50 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                            <FaBoxOpen className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Auditoría de Documento</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificador en Origen:</span>
                                <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">{documentId}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    {/* Header Info Section */}
                    {orderData && (
                        <div className="space-y-6">
                            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-blue-600 pl-4">
                                <FaInfoCircle className="text-blue-500" /> Metadatos de Encabezado
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-8 bg-slate-50/50 rounded-[28px] border border-slate-100">
                                {Object.entries(orderData).map(([key, value]) => (
                                    <div key={key} className="flex flex-col gap-1 group">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-500 transition-colors">{key.replace(/_/g, ' ')}</span>
                                        <div className="text-sm font-black text-slate-900 truncate">
                                            {key.toLowerCase().includes('estado') ? (
                                                <StatusBadge status={value}>{value}</StatusBadge>
                                            ) : (
                                                value !== null ? value : <span className="text-slate-300 italic">nulo</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Details Table Section */}
                    <div className="space-y-6">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-blue-600 pl-4">
                            <FaListUl className="text-blue-500" /> Partidas y Detalle Operativo
                        </h4>
                        <div className="rounded-[28px] border border-slate-100 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto overflow-y-auto max-h-[450px]">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 z-10">
                                        <tr>
                                            {columns.map(col => (
                                                <th key={col} className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                                    {col.replace(/_/g, ' ')}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {allDetailRows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                                {columns.map(col => (
                                                    <td key={col} className="px-6 py-4 text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors whitespace-nowrap">
                                                        {row[col] !== null ? row[col] : <span className="text-slate-200">...</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        {allDetailRows.length === 0 && (
                                            <tr>
                                                <td colSpan={100} className="py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <FaBoxOpen className="text-4xl" />
                                                        <span className="text-xs font-black uppercase tracking-widest">Sin líneas de detalle para este documento</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md">
                    <Button variant="primary" onClick={onClose} className="px-12 py-3 shadow-lg shadow-blue-600/20 font-black uppercase tracking-widest text-xs">
                        Finalizar Revisión
                    </Button>
                </div>
            </div>
        </div>
    );
}
