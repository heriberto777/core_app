import React from "react";
import { FaEdit, FaTrash, FaEye, FaToggleOn, FaToggleOff, FaCrown } from "react-icons/fa";
import { StatusBadge } from "../index";

/**
 * UsersTable (Tailwind Edition)
 * Tabla de identidades con diseño de alta fidelidad.
 */
export const UsersTable = ({ data, onEdit, onDelete, onToggleStatus, onView, currentUserId }) => {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Usuario</th>
                        <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Contacto</th>
                        <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Roles</th>
                        <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Estado</th>
                        <th className="px-6 py-5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {data.map((user) => (
                        <tr key={user._id} className="hover:bg-slate-50/40 transition-colors group">
                            {/* USER INFO */}
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                    <div className={`
                                        w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-lg shadow-sm
                                        ${user.isAdmin 
                                          ? "bg-amber-100 text-amber-600 border border-amber-200" 
                                          : "bg-primary-100 text-primary-600 border border-primary-200"}
                                    `}>
                                        {user.name?.charAt(0)}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="font-extrabold text-slate-700 flex items-center gap-2 truncate">
                                            {user.name} {user.lastname}
                                            {user.isAdmin && <FaCrown className="text-amber-500" size={12} title="Administrador" />}
                                        </div>
                                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">ID: {user._id?.slice(-8)}</div>
                                    </div>
                                </div>
                            </td>

                            {/* CONTACT */}
                            <td className="px-6 py-4">
                                <div className="text-sm font-bold text-slate-600">{user.email}</div>
                                <div className="text-[11px] font-medium text-slate-400 mt-0.5">{user.telefono || 'Sin teléfono'}</div>
                            </td>

                            {/* ROLES */}
                            <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                                    {user.roles?.map(r => (
                                        <span key={r._id} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-extrabold uppercase tracking-tight">
                                          {r.displayName}
                                        </span>
                                    ))}
                                    {!user.roles?.length && <span className="text-[11px] font-medium text-slate-300 italic">Sin privilegios</span>}
                                </div>
                            </td>

                            {/* STATUS */}
                            <td className="px-6 py-4">
                                <StatusBadge status={user.activo ? "ACTIVE" : "INACTIVE"}>
                                    {user.activo ? "Activo" : "Inactivo"}
                                </StatusBadge>
                            </td>

                            {/* ACTIONS */}
                            <td className="px-6 py-4 text-right">
                                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => onView(user)}
                                      className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all"
                                      title="Ver detalles"
                                    >
                                        <FaEye size={14} />
                                    </button>
                                    <button 
                                      onClick={() => onEdit(user)}
                                      className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                                      title="Editar"
                                    >
                                        <FaEdit size={14} />
                                    </button>
                                    <button
                                        onClick={() => onToggleStatus(user._id, user.activo)}
                                        className={`p-2 rounded-lg transition-all ${user.activo ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                                        title={user.activo ? "Desactivar" : "Activar"}
                                    >
                                        {user.activo ? <FaToggleOn size={16} /> : <FaToggleOff size={16} />}
                                    </button>
                                    {user._id !== currentUserId && (
                                        <button 
                                          onClick={() => onDelete(user)}
                                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                          title="Eliminar"
                                        >
                                            <FaTrash size={14} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
