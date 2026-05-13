import React from "react";
import {
    FaEdit, FaTrash, FaToggleOn, FaToggleOff,
    FaStar, FaEnvelope, FaLock, FaUnlock
} from "react-icons/fa";
import { Button } from "../../index";

/**
 * Corporate EmailConfigTable (Tailwind Edition)
 */
export function EmailConfigTable({
    configs,
    onEdit,
    onDelete,
    onToggle,
    onSetDefault,
    onTest,
    className = ""
}) {
    if (!configs || configs.length === 0) {
        return (
            <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                No hay configuraciones de email registradas
            </div>
        );
    }

    return (
        <div className={`w-full rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-md ${className}`}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr>
                            <th className="p-4 text-left font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Nombre</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Host & Puerto</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Usuario</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Seguridad</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Estado</th>
                            <th className="p-4 text-right font-extrabold text-slate-500 uppercase tracking-wider border-b-2 border-slate-200 bg-slate-50/10">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {configs.map((config, idx) => (
                            <tr key={config.id || idx} className="hover:bg-slate-50/10 border-b border-slate-100/40">
                                <td className="p-4">
                                    <div className="flex items-center gap-2 font-extrabold text-slate-800">
                                        <FaEnvelope className="text-amber-500" />
                                        {config.name}
                                        {config.isDefault && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                                Por defecto
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <span>{config.host}:{config.port}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-slate-600">
                                    {config.username}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        {config.secure ? (
                                            <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                                                <FaLock /> SSL/TLS
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-slate-400 text-xs font-semibold">
                                                <FaUnlock /> Ninguna
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className={`flex items-center gap-1.5 text-xs font-bold ${config.active ? "text-emerald-600" : "text-red-500"}`}>
                                        {config.active ? <FaToggleOn /> : <FaToggleOff />}
                                        {config.active ? "Activo" : "Inactivo"}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-2 justify-end">
                                        {onSetDefault && (
                                            <Button variant="ghost" size="small" onClick={() => onSetDefault(config.id)} title="Establecer por defecto">
                                                <FaStar />
                                            </Button>
                                        )}
                                        {onTest && (
                                            <Button variant="ghost" size="small" onClick={() => onTest(config.id)} title="Probar configuración">
                                                <FaEnvelope />
                                            </Button>
                                        )}
                                        {onEdit && (
                                            <Button variant="ghost" size="small" onClick={() => onEdit(config)} title="Editar">
                                                <FaEdit />
                                            </Button>
                                        )}
                                        {onDelete && (
                                            <Button variant="ghost" size="small" onClick={() => onDelete(config.id)} title="Eliminar" className="text-red-500 hover:text-red-700">
                                                <FaTrash />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}