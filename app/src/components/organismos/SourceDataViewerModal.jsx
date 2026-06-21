import React from "react";
import { FaDatabase, FaTimes, FaSearch, FaTerminal } from "react-icons/fa";
import { Button } from "../../index";

export function SourceDataViewerModal({ isOpen, onClose, data }) {
    if (!isOpen) return null;

    const dataEntries = data ? Object.entries(data) : [];

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[800px] max-h-[85vh] rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 bg-white/80 backdrop-blur-md border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/20">
                            <FaTerminal className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Inspector de Datos Fuente</h3>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Vista Cruda de Base de Datos</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8">
                    {dataEntries.length > 0 ? (
                        <div className="rounded-[28px] border border-slate-100 overflow-hidden shadow-sm bg-slate-50/50">
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead className="bg-slate-100/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/50">Columna Origen</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/50">Valor en Tabla</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50">
                                        {dataEntries.map(([key, val]) => (
                                            <tr key={key} className="hover:bg-white transition-colors group">
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-black text-blue-600 uppercase tracking-wider">{key}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <code className="text-sm font-bold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">
                                                        {val !== null && val !== undefined ? String(val) : <em className="text-slate-300 font-normal">N/A (Null)</em>}
                                                    </code>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center opacity-30 gap-4">
                            <FaDatabase className="text-5xl" />
                            <p className="text-sm font-black uppercase tracking-[0.2em]">No hay datos de origen para este registro</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md">
                    <Button 
                        variant="secondary" 
                        onClick={onClose}
                        className="px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-slate-200"
                    >
                        Cerrar Inspector
                    </Button>
                </div>
            </div>
        </div>
    );
}
