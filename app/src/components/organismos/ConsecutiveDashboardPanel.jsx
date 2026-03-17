import React from "react";
import styled from "styled-components";
import { FaHeartbeat, FaClock, FaChartLine, FaExclamationTriangle, FaTimes } from "react-icons/fa";
import { Button } from "../../index";

const DashboardContainer = styled.div`
  display: flex; flex-direction: column; gap: 24px; animation: fadeIn 0.4s ease-out;
`;

const DashboardHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px; background: ${({ theme }) => theme.cardBg}80; 
  backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid ${({ theme }) => theme.border};
`;

const CardsGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; padding: 24px;
  border: 1px solid ${({ theme }) => theme.border}; box-shadow: ${({ theme }) => theme.shadows.medium};
  display: flex; flex-direction: column; gap: 16px; transition: all 0.3s;
  &:hover { transform: translateY(-4px); box-shadow: ${({ theme }) => theme.shadows.premium}; }
`;

const CardHead = styled.div`
  display: flex; justify-content: space-between; align-items: flex-start;
`;

const CardTitle = styled.h4`
  margin: 0; font-size: 16px; font-weight: 800; color: ${({ theme }) => theme.title};
`;

const HealthPoint = styled.div`
  width: 12px; height: 12px; border-radius: 50%; 
  background: ${({ color }) => color}; box-shadow: 0 0 10px ${({ color }) => color}60;
`;

const MetricRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; padding: 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.border}40;
  &:last-child { border-bottom: none; }
`;

const MetricLabel = styled.div`
  font-size: 12px; color: ${({ theme }) => theme.textSecondary}; font-weight: 600;
  display: flex; align-items: center; gap: 8px;
`;

const MetricValue = styled.div`
  font-size: 15px; font-weight: 700; color: ${({ theme, $color }) => $color || theme.text};
`;

export function ConsecutiveDashboardPanel({ data, onClose }) {
    const getHealth = (item) => {
        if (item.expiredReservations > 5) return { color: "#ff4757", label: "Crítico" };
        if (item.activeReservations > 10) return { color: "#ffa502", label: "Atención" };
        return { color: "#2ed573", label: "Óptimo" };
    };

    return (
        <DashboardContainer>
            <DashboardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FaHeartbeat color="#ff4757" size={24} />
                    <h3 style={{ margin: 0 }}>Monitor de Salud de Folios</h3>
                </div>
                <Button variant="ghost" onClick={onClose}><FaTimes /> Cerrar Dashboard</Button>
            </DashboardHeader>

            <CardsGrid>
                {data.map((item) => {
                    const health = getHealth(item);
                    return (
                        <Card key={item.id}>
                            <CardHead>
                                <CardTitle>{item.name}</CardTitle>
                                <HealthPoint color={health.color} title={`Estado: ${health.label}`} />
                            </CardHead>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <MetricRow>
                                    <MetricLabel><FaChartLine /> Valor Actual</MetricLabel>
                                    <MetricValue>{item.currentValue}</MetricValue>
                                </MetricRow>
                                <MetricRow>
                                    <MetricLabel><FaClock /> Reservas Activas</MetricLabel>
                                    <MetricValue $color="#1e90ff">{item.activeReservations}</MetricValue>
                                </MetricRow>
                                <MetricRow>
                                    <MetricLabel><FaChartLine /> Carga (24h)</MetricLabel>
                                    <MetricValue $color="#2ed573">+{item.totalIncrements}</MetricValue>
                                </MetricRow>
                                {item.expiredReservations > 0 && (
                                    <MetricRow>
                                        <MetricLabel style={{ color: '#ff4757' }}><FaExclamationTriangle /> Expirados</MetricLabel>
                                        <MetricValue $color="#ff4757">{item.expiredReservations}</MetricValue>
                                    </MetricRow>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </CardsGrid>

            {data.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', opacity: 0.5 }}>
                    <p>No hay datos suficientes para generar métricas de salud en este momento.</p>
                </div>
            )}
        </DashboardContainer>
    );
}
