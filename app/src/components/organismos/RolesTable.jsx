import React from "react";
import { FaShieldAlt, FaUsers, FaCrown, FaEdit, FaTrash, FaCopy, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { StatusBadge } from "../index";

/**
 * RolesTable (Tailwind Edition)
 * Grid de políticas de seguridad con diseño de tarjetas premium.
 */
export const RolesTable = ({ data, onEdit, onDelete, onDuplicate, onToggleStatus, onViewUsers }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.map(role => (
                <div 
                  key={role._id} 
                  className={`
                    bg-white rounded-[32px] p-6 border transition-all duration-300 group hover:-translate-y-1
                    ${role.isSystem 
                      ? 'border-amber-200 shadow-amber-900/5 bg-amber-50/10' 
                      : 'border-slate-100 shadow-soft hover:shadow-lg'}
                  `}
                >
                    {/* CARD HEADER */}
                    <div className="flex justify-between items-start mb-6">
                        <div className={`
                          w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-300
                          ${role.isSystem ? "bg-amber-100 text-amber-600" : "bg-primary-100 text-primary-600"}
                        `}>
                            {role.isSystem ? <FaCrown /> : <FaShieldAlt />}
                        </div>
                        <StatusBadge status={role.isActive ? "ACTIVE" : "INACTIVE"}>
                            {role.isActive ? "ACTIVO" : "INACTIVE"}
                        </StatusBadge>
                    </div>

                    {/* ROLE INFO */}
                    <div className="space-y-2 mb-6">
                        <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                          {role.displayName}
                        </h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed line-clamp-2 min-h-[40px]">
                          {role.description || "Sin descripción asignada."}
                        </p>
                        <div className="inline-block px-2 py-0.5 bg-slate-50 rounded text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-100">
                          {role.name}
                        </div>
                    </div>

                    {/* STATS */}
                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                              <FaUsers size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-extrabold text-slate-700">{role.userCount || 0}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Usuarios</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                              <FaShieldAlt size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-extrabold text-slate-700">{role.permissions?.length || 0}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Privilegios</span>
                            </div>
                        </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-2 justify-end mt-8 pt-4 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onViewUsers(role)}
                          className="p-2.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-all"
                          title="Usuarios asociados"
                        >
                            <FaUsers size={16} />
                        </button>
                        <button 
                          onClick={() => onEdit(role)}
                          className="p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                          title="Editar política"
                        >
                            <FaEdit size={16} />
                        </button>
                        <button 
                          onClick={() => onDuplicate(role)}
                          className="p-2.5 text-slate-400 hover:text-violet-500 hover:bg-violet-50 rounded-xl transition-all"
                          title="Clonar política"
                        >
                            <FaCopy size={16} />
                        </button>
                        <button
                            onClick={() => onToggleStatus(role._id, role.isActive)}
                            className={`p-2.5 rounded-xl transition-all ${role.isActive ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                            title={role.isActive ? "Desactivar" : "Activar"}
                        >
                            {role.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                        </button>
                        {!role.isSystem && role.userCount === 0 && (
                            <button 
                              onClick={() => onDelete(role)}
                              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="Eliminar política"
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
