import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { TransferApi, useAuth } from "../../index";
import {
  FaChartLine,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";

const api = new TransferApi();

export function ConsecutiveDashboard() {
  const { accessToken } = useAuth();
  const [dashboardData, setDashboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConsecutive, setSelectedConsecutive] = useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState("24h");

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 5000); // Actualizar cada 5 segundos
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get("/consecutives/dashboard", accessToken);
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadConsecutiveMetrics = async (consecutiveId) => {
    try {
      const response = await api.getConsecutiveMetrics(
        accessToken,
        consecutiveId,
        selectedTimeRange
      );
      if (response.success) {
        setSelectedConsecutive(response.data);
      }
    } catch (error) {
      console.error("Error al cargar métricas:", error);
    }
  };

  const getHealthStatus = (consecutive) => {
    if (consecutive.expiredReservations > 5)
      return { status: "warning", color: "#ffc107" };
    if (consecutive.activeReservations > 10)
      return { status: "caution", color: "#17a2b8" };
    return { status: "good", color: "#28a745" };
  };

  if (loading) {
    return <LoadingContainer>Cargando dashboard...</LoadingContainer>;
  }

  return (
    <DashboardContainer>
      <Header>
        <h2>Dashboard de Consecutivos</h2>
        <RefreshButton onClick={loadDashboard}>
          <FaClock />
        </RefreshButton>
      </Header>

      <CardsGrid>
        {dashboardData.map((consecutive) => {
          const health = getHealthStatus(consecutive);

          return (
            <ConsecutiveCard
              key={consecutive.id}
              onClick={() => loadConsecutiveMetrics(consecutive.id)}
            >
              <CardHeader>
                <CardTitle>{consecutive.name}</CardTitle>
                <HealthIndicator $color={health.color} />
              </CardHeader>

              <CardBody>
                <MetricItem>
                  <MetricLabel>Valor Actual:</MetricLabel>
                  <MetricValue>{consecutive.currentValue}</MetricValue>
                </MetricItem>

                <MetricItem>
                  <MetricLabel>Reservas Activas:</MetricLabel>
                  <MetricValue style={{ color: "#17a2b8" }}>
                    {consecutive.activeReservations}
                  </MetricValue>
                </MetricItem>

                <MetricItem>
                  <MetricLabel>Incrementos (24h):</MetricLabel>
                  <MetricValue style={{ color: "#28a745" }}>
                    {consecutive.totalIncrements}
                  </MetricValue>
                </MetricItem>

                {consecutive.expiredReservations > 0 && (
                  <MetricItem>
                    <MetricLabel>Reservas Expiradas:</MetricLabel>
                    <MetricValue style={{ color: "#dc3545" }}>
                      <FaExclamationTriangle />{" "}
                      {consecutive.expiredReservations}
                    </MetricValue>
                  </MetricItem>
                )}
              </CardBody>
            </ConsecutiveCard>
          );
        })}
      </CardsGrid>

      {selectedConsecutive && (
        <DetailSection>
          <DetailHeader>
            <h3>{selectedConsecutive.consecutiveName}</h3>
            <TimeRangeSelector>
              <select
                value={selectedTimeRange}
                onChange={(e) => {
                  setSelectedTimeRange(e.target.value);
                  loadConsecutiveMetrics(selectedConsecutive.consecutiveId);
                }}
              >
                <option value="1h">1 hora</option>
                <option value="24h">24 horas</option>
                <option value="7d">7 días</option>
                <option value="30d">30 días</option>
              </select>
            </TimeRangeSelector>
          </DetailHeader>

          <MetricsGrid>
            <MetricCard>
              <MetricCardTitle>Resumen</MetricCardTitle>
              <MetricsList>
                <li>Valor actual: {selectedConsecutive.currentValue}</li>
                <li>
                  Incrementos: {selectedConsecutive.metrics.totalIncrements}
                </li>
                <li>Reinicios: {selectedConsecutive.metrics.totalResets}</li>
                <li>
                  Promedio de duración de reserva:{" "}
                  {Math.round(
                    selectedConsecutive.metrics.averageReservationDuration
                  )}
                  s
                </li>
              </MetricsList>
            </MetricCard>

            <MetricCard>
              <MetricCardTitle>Rango de Valores</MetricCardTitle>
              <RangeDisplay>
                <RangeItem>
                  <RangeLabel>Mínimo:</RangeLabel>
                  <RangeValue>
                    {selectedConsecutive.metrics.valueRange.min}
                  </RangeValue>
                </RangeItem>
                <RangeItem>
                  <RangeLabel>Actual:</RangeLabel>
                  <RangeValue style={{ fontWeight: "bold" }}>
                    {selectedConsecutive.metrics.valueRange.current}
                  </RangeValue>
                </RangeItem>
                <RangeItem>
                  <RangeLabel>Máximo:</RangeLabel>
                  <RangeValue>
                    {selectedConsecutive.metrics.valueRange.max}
                  </RangeValue>
                </RangeItem>
              </RangeDisplay>
            </MetricCard>

            {selectedConsecutive.metrics.bySegment && (
              <MetricCard>
                <MetricCardTitle>Por Segmento</MetricCardTitle>
                <SegmentsList>
                  {Object.entries(selectedConsecutive.metrics.bySegment).map(
                    ([segment, data]) => (
                      <SegmentItem key={segment}>
                        <SegmentName>{segment}</SegmentName>
                        <SegmentValue>{data.currentValue}</SegmentValue>
                        <SegmentInfo>
                          {data.incrementCount} incrementos
                          {data.lastUsed && (
                            <span>
                              {" "}
                              - Último uso:{" "}
                              {new Date(data.lastUsed).toLocaleString()}
                            </span>
                          )}
                        </SegmentInfo>
                      </SegmentItem>
                    )
                  )}
                </SegmentsList>
              </MetricCard>
            )}
          </MetricsGrid>
        </DetailSection>
      )}
    </DashboardContainer>
  );
}

// Estilos para el dashboard
const DashboardContainer = styled.div`
  padding: 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const RefreshButton = styled.button`
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;

  &:hover {
    background-color: #f5f5f5;
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const ConsecutiveCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
`;

const HealthIndicator = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${(props) => props.$color};
`;

const CardBody = styled.div`
  padding: 15px;
`;

const MetricItem = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const MetricLabel = styled.span`
  color: #666;
`;

const MetricValue = styled.span`
  font-weight: 500;
`;

const DetailSection = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 20px;
`;

const DetailHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const TimeRangeSelector = styled.div`
  select {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const MetricCard = styled.div`
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 15px;
  background: #f9f9f9;
`;

const MetricCardTitle = styled.h4`
  margin: 0 0 10px 0;
  color: #333;
`;

const MetricsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    padding: 5px 0;
    color: #666;
  }
`;

const RangeDisplay = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
`;

const RangeItem = styled.div`
  text-align: center;
`;

const RangeLabel = styled.div`
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
`;

const RangeValue = styled.div`
  font-size: 16px;
  font-weight: 500;
`;

const SegmentsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SegmentItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: white;
  border-radius: 4px;
  border: 1px solid #eee;
`;

const SegmentName = styled.div`
  font-weight: 500;
`;

const SegmentValue = styled.div`
  color: #007bff;
  font-weight: 500;
`;

const SegmentInfo = styled.div`
  font-size: 12px;
  color: #666;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 16px;
  color: #666;
`;
