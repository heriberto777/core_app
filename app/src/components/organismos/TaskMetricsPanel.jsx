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

    // Clases completas (no interpoladas) para que Tailwind pueda detectarlas
    // al escanear el archivo; construir el nombre con template strings
    // (`bg-${colorName}-100`) no es visible para el JIT scanner.
    const colorClasses = {
        "#1565C0": "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
        "#F57C00": "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
        "#2E7D32": "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
        "#C62828": "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    };

    const StatCard = ({ title, value, icon, color, description, trend }) => {
        const iconColorClass = colorClasses[color] || colorClasses["#C62828"];
        return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${iconColorClass}`}>
                    {icon}
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</div>
            {description && <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>}
            {trend && (
                <div className={`text-xs font-semibold ${trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {trend.value}
                </div>
            )}
        </div>
        );
    };

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