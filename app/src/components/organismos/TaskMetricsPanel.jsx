import React from "react";
import styled from "styled-components";
import { FaChartLine, FaCheckCircle, FaExclamationCircle, FaPlay } from "react-icons/fa";
import { StatCard, Button } from "../../index";

const MetricsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  width: 100%;
`;

export const TaskMetricsPanel = ({ tasks = [] }) => {
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

    return (
        <MetricsContainer>
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
        </MetricsContainer>
    );
};
