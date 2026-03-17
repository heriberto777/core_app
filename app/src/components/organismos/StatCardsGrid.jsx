import React from "react";
import styled from "styled-components";
import { FaServer, FaExchangeAlt, FaClock, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;
  width: 100%; margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: ${({ theme, $highlight }) => $highlight ? `${theme.primary}15` : theme.cardBg};
  backdrop-filter: blur(10px); border-radius: 24px; padding: 24px;
  border: 1px solid ${({ theme, $highlight }) => $highlight ? theme.primary : theme.border};
  box-shadow: ${({ theme }) => theme.shadows.medium};
  display: flex; align-items: center; gap: 20px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover { transform: translateY(-5px); box-shadow: ${({ theme }) => theme.shadows.premium}; }
`;

const IconWrapper = styled.div`
  font-size: 28px; width: 56px; height: 56px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  background: ${({ $color }) => `${$color}15`}; color: ${({ $color }) => $color};
`;

const Content = styled.div` display: flex; flex-direction: column; `;
const Value = styled.div` font-size: 24px; font-weight: 800; color: ${({ theme }) => theme.text}; `;
const Label = styled.div` font-size: 11px; font-weight: 700; color: ${({ theme }) => theme.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; `;

export function StatCardsGrid({ stats }) {
    const items = [
        { label: "Configuradas", value: stats.totalTasks, icon: <FaServer />, color: "#6366f1" },
        { label: "Activas", value: stats.activeTasks, icon: <FaExchangeAlt />, color: "#8b5cf6" },
        { label: "En Ejecución", value: stats.runningTasks, icon: <FaClock />, color: "#06b6d4", highlight: stats.runningTasks > 0 },
        { label: "Éxitos Hoy", value: stats.completedToday, icon: <FaCheckCircle />, color: "#10b981" },
        { label: "Fallos Hoy", value: stats.failedToday, icon: <FaExclamationTriangle />, color: "#ef4444", highlight: stats.failedToday > 0 },
    ];

    return (
        <Grid>
            {items.map((it, idx) => (
                <StatCard key={idx} $highlight={it.highlight}>
                    <IconWrapper $color={it.color}>{it.icon}</IconWrapper>
                    <Content>
                        <Value>{it.value}</Value>
                        <Label>{it.label}</Label>
                    </Content>
                </StatCard>
            ))}
        </Grid>
    );
}
