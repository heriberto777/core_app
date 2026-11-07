import React from "react";
import { FaHistory, FaArrowRight } from "react-icons/fa";
import { Link } from "react-router-dom";
import { StatusBadge, Button } from "../../index";

/**
 * Corporate RecentActivitiesTable (Tailwind Edition)
 */
export function RecentActivitiesTable({ transfers, className = "" }) {
    return (
        <div className={`bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-5 shadow-md ${className}`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b-2 border-primary-500/20 pb-3">
                <h3 className="m-0 text-base font-extrabold flex items-center gap-2.5 text-slate-800 dark:text-slate-100">
                    <FaHistory className="text-primary-500" /> Últimas Actividades
                </h3>
                <Link to="/history" className="no-underline">
                    <Button variant="ghost" size="small">Ver Historial Completo <FaArrowRight /></Button>
                </Link>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                    <thead>
                        <tr>
                            <th className="p-4 text-left font-extrabold uppercase text-[11px] tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Tarea de Transferencia</th>
                            <th className="p-4 text-left font-extrabold uppercase text-[11px] tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Fecha y Hora</th>
                            <th className="p-4 text-left font-extrabold uppercase text-[11px] tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Registros</th>
                            <th className="p-4 text-left font-extrabold uppercase text-[11px] tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Estado Operativo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transfers.length > 0 ? transfers.map((tx, idx) => (
                            <tr key={tx.id || idx} className="hover:bg-slate-50/10 dark:hover:bg-slate-700/30">
                                <td className="p-4 border-b border-slate-200/40 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 font-bold">{tx.name}</td>
                                <td className="p-4 border-b border-slate-200/40 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">{new Date(tx.date).toLocaleString()}</td>
                                <td className="p-4 border-b border-slate-200/40 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">{tx.totalRecords}</td>
                                <td className="p-4 border-b border-slate-200/40 dark:border-slate-700/60"><StatusBadge status={tx.status}>{tx.status}</StatusBadge></td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} className="text-center p-10 opacity-50 italic text-slate-500 dark:text-slate-400">
                                    No hay registros de transferencias recientes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}