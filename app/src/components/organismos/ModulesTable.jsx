import React, { useState } from "react";
import {
    FaCog, FaEdit, FaTrash, FaCopy, FaToggleOn, FaToggleOff,
    FaLayerGroup, FaChevronDown, FaChevronUp, FaCubes
} from "react-icons/fa";
import { StatusBadge } from "../index";

/**
 * ModulesTable (Tailwind Edition)
 * Grid de arquitectura modular con tarjetas de servicio expandibles.
 */
export const ModulesTable = ({ data, onEdit, onDelete, onDuplicate, onToggleStatus }) => {
    const [expanded, setExpanded] = useState({});

    const toggleExpand = (id) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {data.map(module => (
                <div 
                  key={module._id} 
                  className={`
                    bg-white rounded-[32px] p-6 border transition-all duration-300 group hover:-translate-y-1
                    ${module.isSystem 
                      ? 'border-primary-200 bg-primary-50/10 shadow-primary-900/5' 
                      : 'border-slate-100 shadow-soft hover:shadow-lg'}
                  `}
                >
                    {/* CARD HEADER */}
                    <div className="flex justify-between items-start mb-6">
                        <div className={`
                          w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-300
                          ${module.isSystem ? "bg-primary-100 text-primary-600" : "bg-slate-100 text-slate-500"}
                        `}>
                            <FaCog />
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                            {module.isSystem && (
                              <span className="px-2 py-0.5 bg-primary-600 text-white rounded-md text-[9px] font-extrabold tracking-widest uppercase shadow-sm">Sistema</span>
                            )}
                            <StatusBadge status={module.isActive ? "ACTIVE" : "INACTIVE"}>
                                {module.isActive ? "ACTIVO" : "INACTIVO"}
                            </StatusBadge>
                        </div>
                    </div>

                    {/* MODULE INFO */}
                    <div className="space-y-2 mb-6">
                        <h3 className="text-lg font-extrabold text-slate-800">{module.displayName}</h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed line-clamp-2 min-h-[40px]">
                          {module.description || "Módulo base del ecosistema CORE."}
                        </p>
                        <div className="inline-block px-2 py-0.5 bg-blue-50 rounded text-[10px] font-bold text-blue-500 uppercase tracking-widest border border-blue-100">
                          {module.name}
                        </div>
                    </div>

                    {/* METADATA */}
                    <div className="grid grid-cols-2 gap-4 py-5 border-y border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                              <FaLayerGroup size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Categoría</span>
                              <span className="text-xs font-extrabold text-slate-700 truncate max-w-[100px]">{module.uiConfig?.category || "OTROS"}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                              <FaCubes size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Prioridad</span>
                              <span className="text-xs font-extrabold text-slate-700">Nivel {module.uiConfig?.order || 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* CAPABILITIES (EXPANDABLE) */}
                    <div className="mt-4">
                        <button 
                          onClick={() => toggleExpand(module._id)}
                          className="w-full flex justify-between items-center py-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                        >
                            <span>Capacidades ({module.actions?.length || 0})</span>
                            {expanded[module._id] ? <FaChevronUp /> : <FaChevronDown />}
                        </button>
                        {expanded[module._id] && (
                            <div className="flex flex-wrap gap-1.5 mt-2 animate-fadeIn">
                                {module.actions?.map(action => {
                                    const label = typeof action === 'string' ? action : (action.displayName || action.name);
                                    const key = typeof action === 'string' ? action : (action._id || action.name);
                                    return (
                                      <span key={key} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[9px] font-extrabold uppercase border border-slate-100">
                                        {label}
                                      </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* CONTROL BAR */}
                    <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onEdit(module)}
                          className="p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                          title="Editar servicio"
                        >
                            <FaEdit size={16} />
                        </button>
                        <button 
                          onClick={() => onDuplicate(module)}
                          className="p-2.5 text-slate-400 hover:text-violet-500 hover:bg-violet-50 rounded-xl transition-all"
                          title="Clonar esquema"
                        >
                            <FaCopy size={16} />
                        </button>
                        <button
                            onClick={() => onToggleStatus(module)}
                            className={`p-2.5 rounded-xl transition-all ${module.isActive ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                            title={module.isActive ? "Desactivar" : "Activar"}
                        >
                            {module.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                        </button>
                        {!module.isSystem && (
                            <button 
                              onClick={() => onDelete(module)}
                              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="Extirpar servicio"
                            >
                                <FaTrash size={16} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
