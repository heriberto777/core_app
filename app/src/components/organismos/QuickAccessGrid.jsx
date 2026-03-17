import React from "react";
import styled from "styled-components";
import { FaExchangeAlt, FaDatabase, FaHistory, FaChartLine, FaGripHorizontal } from "react-icons/fa";
import { Link } from "react-router-dom";

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.medium}; flex: 1;
`;

const Title = styled.h3`
  margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px;
  color: ${({ theme }) => theme.title}; border-bottom: 2px solid ${({ theme }) => theme.primary}20; padding-bottom: 12px;
`;

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
`;

const ActionButton = styled(Link)`
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px;
  background: ${({ theme }) => theme.bg2}10; border: 1px solid ${({ theme }) => theme.border}40;
  border-radius: 20px; text-decoration: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover { background: ${({ theme }) => theme.primary}10; border-color: ${({ theme }) => theme.primary}; transform: scale(1.05); }
`;

const IconWrapper = styled.div`
  font-size: 24px; color: ${({ theme }) => theme.primary};
`;

const Label = styled.span`
  font-size: 12px; font-weight: 800; color: ${({ theme }) => theme.text}; text-transform: uppercase; letter-spacing: 0.5px;
`;

export function QuickAccessGrid() {
    const actions = [
        { label: "Tareas", path: "/tasks", icon: <FaExchangeAlt /> },
        { label: "Logs Sistema", path: "/system-logs", icon: <FaDatabase /> },
        { label: "Historial", path: "/history", icon: <FaHistory /> },
        { label: "Estadísticas", path: "/analytics", icon: <FaChartLine /> },
    ];

    return (
        <Card>
            <Title><FaGripHorizontal color="var(--primary)" /> Acciones Rápidas</Title>
            <Grid>
                {actions.map((act, idx) => (
                    <ActionButton key={idx} to={act.path}>
                        <IconWrapper>{act.icon}</IconWrapper>
                        <Label>{act.label}</Label>
                    </ActionButton>
                ))}
            </Grid>
        </Card>
    );
}
