import React from "react";
import { FaChartLine, FaCheckCircle, FaExclamationCircle, FaPlay } from "react-icons/fa";

/**
 * Corporate TaskMetricsPanel (Tailwind Edition)
 */
export const TaskMetricsPanel = ({ tasks = [], className = "" }) => {
    const stats = React.useMemo(() => {
        return tasks.reduce((acc, task) => {
            acc.total++;
            if (task.status === "running") acc.running++;
            if (task.status === "completed") acc.completed++;
            if (task.status === "error") acc.error++;
            if (task.active) acc.active++;
            return acc;
        }, { total: 0, running: 0, completed: 0, error: 0, active: 0 });
    }, [tasks]);

    const StatCard = ({ title, value, icon, color, description, trend }) => (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: `${color}20`, color }}>
                    {icon}
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{title}</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-800">{value}</div>
            {description && <div className="text-xs text-slate-500">{description}</div>}
            {trend && (
                <div className={`text-xs font-semibold ${trend.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {trend.value}
                </div>
            )}
        </div>
    );

    return (
        <div className={`grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6 w-full ${className}`}>
            <StatCard
                title="Total Tareas"
                value={stats.total}
                icon={<FaChartLine />}
                color="#1565C0"
                trend={{ value: `${stats.active} activas`, isPositive: true }}
            />
            <StatCard
                title="En Ejecución"
                value={stats.running}
                icon={<FaPlay />}
                color="#F57C00"
                description="Tareas sincronizando"
            />
            <StatCard
                title="Completadas"
                value={stats.completed}
                icon={<FaCheckCircle />}
                color="#2E7D32"
                description="Último ciclo"
            />
            <StatCard
                title="Con Errores"
                value={stats.error}
                icon={<FaExclamationCircle />}
                color="#C62828"
                trend={{ value: "Revisar logs", isPositive: false }}
            />
        </div>
    );
};