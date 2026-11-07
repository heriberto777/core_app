import React from "react";
import { FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaCheck, FaTimes, FaUserCircle } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

export const RecipientsTable = ({
    recipients = [],
    loading,
    onEdit,
    onDelete,
    onToggle
}) => {
    if (loading && recipients.length === 0) {
        return (
            <div className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-20 flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-500 animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-bold text-sm uppercase tracking-widest">Cargando destinatarios...</span>
            </div>
        );
    }

    return (
        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-500">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-900/40">
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Miembro / Usuario</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Tipos de Alerta</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Estado Envío</th>
                            <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-700">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {recipients.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="px-8 py-20 text-center text-slate-400 dark:text-slate-500">
                                    <div className="flex flex-col items-center gap-3">
                                        <FaUserCircle className="text-4xl opacity-20" />
                                        <span className="font-bold text-sm uppercase tracking-widest opacity-60">No se han configurado destinatarios</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            recipients.map(r => (
                                <tr key={r._id} className={`group transition-all hover:bg-slate-50/50 dark:hover:bg-slate-700/50 ${!r.isSend ? "opacity-60" : ""}`}>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-all duration-300">
                                                <FaUserCircle className="text-xl" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{r.name}</span>
                                                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{r.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { id: 'traspaso', label: 'Traspasos', enabled: r.notificationTypes?.traspaso },
                                                { id: 'transferencias', label: 'Transfer', enabled: r.notificationTypes?.transferencias },
                                                { id: 'erroresCriticos', label: 'Errores', enabled: r.notificationTypes?.erroresCriticos }
                                            ].map(type => (
                                                <div 
                                                    key={type.id}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                                        type.enabled ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800" : "bg-slate-50 dark:bg-slate-900/30 text-slate-300 dark:text-slate-600 border border-slate-100 dark:border-slate-700"
                                                    }`}
                                                >
                                                    {type.enabled ? <FaCheck className="text-[8px]" /> : <FaTimes className="text-[8px]" />}
                                                    {type.label}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <StatusBadge status={r.isSend ? "ACTIVE" : "INACTIVE"} className="scale-90 origin-left" />
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {onEdit && (
                                                <Button
                                                    variant="ghost"
                                                    className="!w-9 !h-9 !p-0 flex items-center justify-center rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                                                    onClick={() => onEdit(r)}
                                                    title="Editar"
                                                >
                                                    <FaEdit size={16} />
                                                </Button>
                                            )}
                                            {onToggle && (
                                                <Button
                                                    variant="ghost"
                                                    className={`!w-9 !h-9 !p-0 flex items-center justify-center rounded-xl transition-all ${
                                                        r.isSend ? "hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-500 dark:text-amber-400" : "hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400"
                                                    }`}
                                                    onClick={() => onToggle(r._id, r.isSend, r.name)}
                                                    title={r.isSend ? "Desactivar" : "Activar"}
                                                >
                                                    {r.isSend ? <FaToggleOn className="text-xl" /> : <FaToggleOff className="text-xl" />}
                                                </Button>
                                            )}
                                            {onDelete && (
                                                <Button
                                                    variant="ghost"
                                                    className="!w-9 !h-9 !p-0 flex items-center justify-center rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 transition-all"
                                                    onClick={() => onDelete(r._id, r.name)}
                                                    title="Eliminar"
                                                >
                                                    <FaTrash size={16} />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
