import React from "react";
import styled from "styled-components";
import {
    FaClipboardList,
    FaTruckLoading,
    FaCheckDouble,
    FaMoneyBillWave,
    FaCalculator
} from "react-icons/fa";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(12px);
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

const IconBox = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: ${props => props.bgColor || "rgba(0,0,0,0.05)"};
  color: ${props => props.color || "#333"};
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
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
  font-family: 'Inter', sans-serif;
`;

export const LoadsStatsGrid = ({ stats, loading }) => {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("es-DO", {
            style: "currency",
            currency: "DOP",
            minimumFractionDigits: 0,
        }).format(amount || 0);
    };

    const items = [
        {
            label: "Pendientes",
            value: stats?.pending || 0,
            icon: <FaClipboardList />,
            color: "#f59e0b",
            bg: "rgba(245, 158, 11, 0.15)"
        },
        {
            label: "En Proceso",
            value: stats?.processing || 0,
            icon: <FaTruckLoading />,
            color: "#3b82f6",
            bg: "rgba(59, 130, 246, 0.15)"
        },
        {
            label: "Completados",
            value: stats?.completed || 0,
            icon: <FaCheckDouble />,
            color: "#10b981",
            bg: "rgba(16, 185, 129, 0.15)"
        },
        {
            label: "Valor Despacho",
            value: formatCurrency(stats?.totalAmount),
            icon: <FaMoneyBillWave />,
            color: "#6366f1",
            bg: "rgba(99, 102, 241, 0.15)"
        }
    ];

    return (
        <Grid>
            {items.map((item, idx) => (
                <StatCard key={idx}>
                    <IconBox color={item.color} bgColor={item.bg}>
                        {item.icon}
                    </IconBox>
                    <Info>
                        <Label>{item.label}</Label>
                        <Value>{loading ? "..." : item.value}</Value>
                    </Info>
                </StatCard>
            ))}
        </Grid>
    );
};
