import React from "react";
import styled from "styled-components";
import {
    FaClock,
    FaSpinner,
    FaCheckCircle,
    FaExclamationTriangle,
    FaBoxOpen
} from "react-icons/fa";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.border};
  padding: 24px;
  border-radius: 20px;
  box-shadow: ${({ theme }) => theme.shadows.soft};
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-8px);
    box-shadow: ${({ theme }) => theme.shadows.medium};
    border-color: ${({ theme }) => theme.primary}40;
  }
`;

const IconWrapper = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: ${props => props.bgColor || "rgba(0, 0, 0, 0.05)"};
  color: ${props => props.color || "#333"};
`;

const Label = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.8px;
  opacity: 0.8;
`;

const Value = styled.div`
  font-size: 26px;
  font-weight: 800;
  color: ${({ theme }) => theme.titleColor};
`;

export const TraspasoStatsGrid = ({ stats, loading }) => {
    const items = [
        {
            label: "Pendientes",
            value: stats?.pending || 0,
            icon: <FaClock />,
            color: "#f59e0b",
            bg: "rgba(245, 158, 11, 0.1)"
        },
        {
            label: "Procesando",
            value: stats?.processing || 0,
            icon: <FaSpinner className={loading ? "spinning" : ""} />,
            color: "#3b82f6",
            bg: "rgba(59, 130, 246, 0.1)"
        },
        {
            label: "Completados",
            value: stats?.completed || 0,
            icon: <FaCheckCircle />,
            color: "#10b981",
            bg: "rgba(16, 185, 129, 0.1)"
        },
        {
            label: "Fallidos",
            value: stats?.failed || 0,
            icon: <FaExclamationTriangle />,
            color: "#ef4444",
            bg: "rgba(239, 68, 68, 0.1)"
        },
        {
            label: "Total Ítems",
            value: stats?.totalValue?.toLocaleString() || 0,
            icon: <FaBoxOpen />,
            color: "#6366f1",
            bg: "rgba(99, 102, 241, 0.1)"
        }
    ];

    return (
        <Grid>
            {items.map((item, idx) => (
                <StatCard key={idx}>
                    <IconWrapper color={item.color} bgColor={item.bg}>
                        {item.icon}
                    </IconWrapper>
                    <Label>{item.label}</Label>
                    <Value>{loading ? "..." : item.value}</Value>
                </StatCard>
            ))}
        </Grid>
    );
};
