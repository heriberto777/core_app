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
            <div className="bg-white/50 border border-slate-200 rounded-[24px] p-20 flex flex-col items-center justify-center gap-4 text-slate-400 animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-bold text-sm uppercase tracking-widest">Cargando destinatarios...</span>
            </div>
        );
    }

    return (
        <div className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-[24px] shadow-sm overflow-hidden animate-in fade-in duration-500">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Miembro / Usuario</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Tipos de Alerta</th>
                            <th className="px-8 py-5 text-left text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Estado Envío</th>
                            <th className="px-8 py-5 text-right text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {recipients.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="px-8 py-20 text-center text-slate-400">
                                    <div className="flex flex-col items-center gap-3">
                                        <FaUserCircle className="text-4xl opacity-20" />
                                        <span className="font-bold text-sm uppercase tracking-widest opacity-60">No se han configurado destinatarios</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            recipients.map(r => (
                                <tr key={r._id} className={`group transition-all hover:bg-slate-50/50 ${!r.isSend ? "opacity-60" : ""}`}>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 transition-all duration-300">
                                                <FaUserCircle className="text-xl" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{r.name}</span>
                                                <span className="text-xs font-medium text-slate-400">{r.email}</span>
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
                                                        type.enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-300 border border-slate-100"
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
                                            <Button 
                                                variant="ghost" 
                                                className="w-9 h-9 p-0 flex items-center justify-center rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all"
                                                onClick={() => onEdit(r)}
                                                title="Editar"
                                            >
                                                <FaEdit />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className={`w-9 h-9 p-0 flex items-center justify-center rounded-xl transition-all ${
                                                    r.isSend ? "hover:bg-amber-50 text-amber-500" : "hover:bg-emerald-50 text-emerald-500"
                                                }`}
                                                onClick={() => onToggle(r._id, r.isSend, r.name)}
                                                title={r.isSend ? "Desactivar" : "Activar"}
                                            >
                                                {r.isSend ? <FaToggleOn className="text-xl" /> : <FaToggleOff className="text-xl" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="w-9 h-9 p-0 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-500 transition-all"
                                                onClick={() => onDelete(r._id, r.name)}
                                                title="Eliminar"
                                            >
                                                <FaTrash />
                                            </Button>
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
