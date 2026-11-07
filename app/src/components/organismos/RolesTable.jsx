import React from "react";
import { FaShieldAlt, FaUsers, FaCrown, FaEdit, FaTrash, FaCopy, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { StatusBadge, usePermissions } from "../../index";

/**
 * RolesTable (Tailwind Edition)
 * Grid de políticas de seguridad con diseño de tarjetas premium.
 */
export const RolesTable = ({ data, onEdit, onDelete, onDuplicate, onToggleStatus, onViewUsers }) => {
    const { hasPermission, isAdmin } = usePermissions();
    const canCreate = hasPermission("roles", "create") || isAdmin;
    const canUpdate = hasPermission("roles", "update") || isAdmin;
    const canDelete = hasPermission("roles", "delete") || isAdmin;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.map(role => (
                <div
                  key={role._id}
                  className={`
                    bg-white dark:bg-slate-800 rounded-xl p-6 border transition-all duration-300 group hover:-translate-y-1
                    ${role.isSystem
                      ? 'border-amber-200 dark:border-amber-800 shadow-amber-900/5 bg-amber-50/10 dark:bg-amber-900/10'
                      : 'border-slate-100 dark:border-slate-700 shadow-soft hover:shadow-lg'}
                  `}
                >
                    {/* CARD HEADER */}
                    <div className="flex justify-between items-start mb-6">
                        <div className={`
                          w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-300
                          ${role.isSystem ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300" : "bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300"}
                        `}>
                            {role.isSystem ? <FaCrown /> : <FaShieldAlt />}
                        </div>
                        <StatusBadge status={role.isActive ? "ACTIVE" : "INACTIVE"}>
                            {role.isActive ? "ACTIVO" : "INACTIVE"}
                        </StatusBadge>
                    </div>

                    {/* ROLE INFO */}
                    <div className="space-y-2 mb-6">
                        <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          {role.displayName}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-2 min-h-[40px]">
                          {role.description || "Sin descripción asignada."}
                        </p>
                        <div className="inline-block px-2 py-0.5 bg-slate-50 dark:bg-slate-900/50 rounded text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border border-slate-100 dark:border-slate-700">
                          {role.name}
                        </div>
                    </div>

                    {/* STATS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                              <FaUsers size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{role.userCount || 0}</span>
                              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Usuarios</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                              <FaShieldAlt size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{role.permissions?.length || 0}</span>
                              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Privilegios</span>
                            </div>
                        </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-2 justify-end mt-8 pt-4 border-t border-slate-50 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onViewUsers(role)}
                          className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
                          title="Usuarios asociados"
                        >
                            <FaUsers size={16} />
                        </button>
                        {canUpdate && (
                            <button
                              onClick={() => onEdit(role)}
                              className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                              title="Editar política"
                            >
                                <FaEdit size={16} />
                            </button>
                        )}
                        {canCreate && (
                            <button
                              onClick={() => onDuplicate(role)}
                              className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-all"
                              title="Clonar política"
                            >
                                <FaCopy size={16} />
                            </button>
                        )}
                        {canUpdate && (
                            <button
                                onClick={() => onToggleStatus(role._id, role.isActive)}
                                className={`p-2.5 rounded-xl transition-all ${role.isActive ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20" : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}
                                title={role.isActive ? "Desactivar" : "Activar"}
                            >
                                {role.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                            </button>
                        )}
                        {canDelete && !role.isSystem && role.userCount === 0 && (
                            <button
                              onClick={() => onDelete(role)}
                              className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
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
