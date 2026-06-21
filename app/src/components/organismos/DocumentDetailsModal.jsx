import React, { useState } from "react";
import { FaTimes, FaFileAlt, FaTable, FaHashtag, FaInfoCircle, FaSearch } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

export function DocumentDetailsModal({ isOpen, onClose, document, details, config }) {
    if (!isOpen || !document) return null;

    // Extraer todas las tablas de detalle
    const detailTables = details?.details ? Object.keys(details.details) : [];

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[1100px] h-[90vh] rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 bg-white/80 backdrop-blur-md border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                            <FaSearch className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Explorador de Documento</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Interno:</span>
                                <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">{Object.values(document)[0]}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-12">
                    {/* Header Info Section */}
                    {(() => {
                        let groups = { "General": [] };
                        
                        let allMappings = [];
                        if (config?.tableConfigs) {
                            config.tableConfigs.forEach(table => {
                                if (table.fieldMappings) {
                                    allMappings.push(...table.fieldMappings);
                                }
                            });
                        }
                        
                        if (allMappings.length > 0) {
                            const sortedMappings = [...allMappings].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
                            
                            sortedMappings.forEach(m => {
                                const dataKey = m.targetField || m.sourceField;
                                
                                let displayVal = undefined;
                                if (m.sourceField && document[m.sourceField] !== undefined) {
                                    displayVal = document[m.sourceField];
                                } else if (m.targetField && document[m.targetField] !== undefined) {
                                    displayVal = document[m.targetField];
                                } else if (document[dataKey] !== undefined) {
                                    displayVal = document[dataKey];
                                }

                                // Mostramos el campo si existe en el documento y si no está marcado explícitamente para ocultar
                                if (displayVal !== undefined) {
                                    const groupName = m.fieldGroup || "General";
                                    if (!groups[groupName]) groups[groupName] = [];
                                    
                                    groups[groupName].push({
                                        key: dataKey,
                                        label: m.displayName || m.targetField,
                                        value: displayVal
                                    });
                                }
                            });

                            // Si no hay campos que coincidan con mappings, fallback
                            if (Object.values(groups).every(g => g.length === 0)) {
                                Object.entries(document).forEach(([key, value]) => {
                                    if (!key.startsWith('_')) {
                                        groups["General"].push({ key, label: key, value });
                                    }
                                });
                            }
                        } else {
                            Object.entries(document).forEach(([key, value]) => {
                                if (!key.startsWith('_')) {
                                    groups["General"].push({ key, label: key, value });
                                }
                            });
                        }

                        return Object.entries(groups).filter(([_, fields]) => fields.length > 0).map(([groupName, fields]) => (
                            <div key={groupName} className="space-y-6">
                                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
                                    <FaInfoCircle className="text-indigo-500" /> Atributos: {groupName}
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-8 bg-slate-50/50 rounded-[28px] border border-slate-100">
                                    {fields.map((field) => (
                                        <div key={field.key} className="flex flex-col gap-1 group">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">{field.label.replace(/_/g, ' ')}</span>
                                            <div className="text-sm font-black text-slate-900 truncate">
                                                {typeof field.value === 'boolean'
                                                    ? <StatusBadge status={field.value ? 'active' : 'inactive'}>{field.value ? 'SÍ' : 'NO'}</StatusBadge>
                                                    : field.value !== null && field.value !== undefined ? String(field.value) : <span className="text-slate-200 italic">nulo</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ));
                    })()}

                    {/* Detail Tables */}
                    {detailTables.map(tableName => {
                        const tableData = details.details[tableName];
                        if (!tableData || tableData.length === 0) return null;

                        // Obtener columnas dinámicas (excluyendo metadatos internos con _)
                        const columns = Object.keys(tableData[0]).filter(k => !k.startsWith('_'));

                        return (
                            <div key={tableName} className="space-y-6">
                                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
                                    <FaTable className="text-indigo-500" /> Partidas: {tableName}
                                </h4>
                                <div className="rounded-[28px] border border-slate-100 overflow-hidden shadow-sm bg-white">
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse">
                                            <thead className="bg-slate-50/50">
                                                <tr>
                                                    {columns.map(col => (
                                                        <th key={col} className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 whitespace-nowrap">
                                                            {col.replace(/_/g, ' ')}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {tableData.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                                                        {columns.map(col => (
                                                            <td key={col} className="px-6 py-4 text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors whitespace-nowrap">
                                                                {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-200">...</span>}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {detailTables.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-center opacity-30 gap-4">
                            <FaFileAlt className="text-5xl" />
                            <p className="text-sm font-black uppercase tracking-[0.2em]">No se encontraron registros asociados</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md">
                    <Button 
                        variant="primary" 
                        onClick={onClose}
                        className="px-12 py-3 shadow-lg shadow-indigo-600/20 font-black text-xs uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 border-none"
                    >
                        Cerrar Auditoría
                    </Button>
                </div>
            </div>
        </div>
    );
}
