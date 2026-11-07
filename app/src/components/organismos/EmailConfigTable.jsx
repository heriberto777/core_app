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
            <div className="w-full rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
                No hay configuraciones de email registradas
            </div>
        );
    }

    return (
        <div className={`w-full rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-md ${className}`}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr>
                            <th className="p-4 text-left font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Nombre</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Host & Puerto</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Usuario</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Seguridad</th>
                            <th className="p-4 text-left font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Estado</th>
                            <th className="p-4 text-right font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/30">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {configs.map((config, idx) => (
                            <tr key={config._id || idx} className="hover:bg-slate-50/10 dark:hover:bg-slate-700/30 border-b border-slate-100/40 dark:border-slate-700/40">
                                <td className="p-4">
                                    <div className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-slate-100">
                                        <FaEnvelope className="text-amber-500" />
                                        {config.name}
                                        {config.isDefault && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                                Por defecto
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                        <span>{config.host}:{config.port}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-slate-600 dark:text-slate-300">
                                    {config.auth?.user}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        {config.secure ? (
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                                <FaLock /> SSL/TLS
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-xs font-semibold">
                                                <FaUnlock /> Ninguna
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className={`flex items-center gap-1.5 text-xs font-bold ${config.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                                        {config.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                        {config.isActive ? "Activo" : "Inactivo"}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-2 justify-end">
                                        {onSetDefault && (
                                            <Button variant="ghost" size="small" onClick={() => onSetDefault(config)} title="Establecer por defecto">
                                                <FaStar />
                                            </Button>
                                        )}
                                        {onToggle && (
                                            <Button variant="ghost" size="small" onClick={() => onToggle(config)} title={config.isActive ? "Desactivar" : "Activar"}>
                                                {config.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                            </Button>
                                        )}
                                        {onTest && (
                                            <Button variant="ghost" size="small" onClick={() => onTest(config)} title="Probar configuración">
                                                <FaEnvelope />
                                            </Button>
                                        )}
                                        {onEdit && (
                                            <Button variant="ghost" size="small" onClick={() => onEdit(config)} title="Editar">
                                                <FaEdit />
                                            </Button>
                                        )}
                                        {onDelete && (
                                            <Button variant="ghost" size="small" onClick={() => onDelete(config)} title="Eliminar" className="text-red-500 hover:text-red-700">
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