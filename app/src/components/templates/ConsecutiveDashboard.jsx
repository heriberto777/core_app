import React, { useState, useEffect } from "react";
import styled from "styled-components";
import {
  useAuth,
  StatCard,
  StatusBadge,
  LoadingUI
} from "../../index";
import { ConsecutiveApi } from "../../api/index";
import {
  FaChartLine,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaHistory,
  FaLayerGroup
} from "react-icons/fa";

const api = new ConsecutiveApi();

export function ConsecutiveDashboard() {
  const { accessToken } = useAuth();
  const [dashboardData, setDashboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConsecutive, setSelectedConsecutive] = useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState("24h");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000); // Actualizar cada 10 segundos para no saturar
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      if (!refreshing) setRefreshing(true);
      const response = await api.getConsecutiveDashboard(accessToken);
      if (response) {
        setDashboardData(response);
      }
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadConsecutiveMetrics = async (consecutiveId) => {
    try {
      const response = await api.getConsecutiveMetrics(
        accessToken,
        consecutiveId,
        selectedTimeRange
      );
      if (response) {
        setSelectedConsecutive(response);
      }
    } catch (error) {
      console.error("Error al cargar métricas:", error);
    }
  };

  const getHealthStatus = (consecutive) => {
    if (consecutive.expiredReservations > 5)
      return { status: "WARNING", label: "Crítico" };
    if (consecutive.activeReservations > 10)
      return { status: "INFO", label: "Carga Alta" };
    return { status: "SUCCESS", label: "Estable" };
  };

  if (loading) {
    return <LoadingUI message="Cargando panel de control..." fullPage />;
  }

  return (
    <DashboardWrapper>
      <HeaderSection>
        <TitleGroup>
          <h2>Dashboard de Consecutivos</h2>
          <p>Monitoreo en tiempo real de numeración y reservas</p>
        </TitleGroup>
        <RefreshButton onClick={loadDashboard} $isRefreshing={refreshing}>
          <FaClock /> {refreshing ? "Actualizando..." : "Actualizar"}
        </RefreshButton>
      </HeaderSection>

      <MetricsGrid>
        {dashboardData.map((consecutive) => {
          const health = getHealthStatus(consecutive);

          return (
            <StatCard
              key={consecutive.id}
              title={consecutive.name}
              value={consecutive.currentValue}
              subtitle="Valor Actual"
              icon={<FaChartLine />}
              onClick={() => loadConsecutiveMetrics(consecutive.id)}
              footer={
                <CardFooterContent>
                  <StatusBadge status={health.status}>{health.label}</StatusBadge>
                  <div className="mini-stats">
                    <span><FaLayerGroup /> {consecutive.activeReservations}</span>
                    {consecutive.expiredReservations > 0 && (
                      <span className="danger"><FaExclamationTriangle /> {consecutive.expiredReservations}</span>
                    )}
                  </div>
                </CardFooterContent>
              }
            />
          );
        })}
      </MetricsGrid>

      {selectedConsecutive && (
        <DetailPanel>
          <DetailHeader>
            <div className="title-area">
              <FaHistory />
              <h3>Detalle: {selectedConsecutive.consecutiveName}</h3>
            </div>
            <TimeRangeSelector>
              <select
                value={selectedTimeRange}
                onChange={(e) => {
                  setSelectedTimeRange(e.target.value);
                  loadConsecutiveMetrics(selectedConsecutive.consecutiveId);
                }}
              >
                <option value="1h">Última hora</option>
                <option value="24h">Últimas 24 horas</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
              </select>
            </TimeRangeSelector>
          </DetailHeader>

          <DetailGrid>
            <StatCard
              title="Incrementos"
              value={selectedConsecutive.metrics.totalIncrements}
              color={({ theme }) => theme.success}
              icon={<FaCheckCircle />}
            />
            <StatCard
              title="Promedio Reserva"
              value={`${Math.round(selectedConsecutive.metrics.averageReservationDuration)}s`}
              icon={<FaClock />}
            />
            <StatCard
              title="Rango de Valores"
              value={`${selectedConsecutive.metrics.valueRange.min} - ${selectedConsecutive.metrics.valueRange.max}`}
              subtitle="Mínimo / Máximo"
              icon={<FaChartLine />}
            />
          </DetailGrid>

          {selectedConsecutive.metrics.bySegment && (
            <SegmentsArea>
              <h4>Distribución por Segmento</h4>
              <SegmentsGrid>
                {Object.entries(selectedConsecutive.metrics.bySegment).map(([segment, data]) => (
                  <SegmentCard key={segment}>
                    <div className="segment-info">
                      <span className="name">{segment}</span>
                      <span className="value">{data.currentValue}</span>
                    </div>
                    <div className="segment-meta">
                      {data.incrementCount} incrementos
                    </div>
                  </SegmentCard>
                ))}
              </SegmentsGrid>
            </SegmentsArea>
          )}
        </DetailPanel>
      )}
    </DashboardWrapper>
  );
}

// Estilos Premium con Glassmorphism
const DashboardWrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.bg};
  min-height: 100%;
`;

const HeaderSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const TitleGroup = styled.div`
  h2 {
    margin: 0;
    font-size: ${({ theme }) => theme.fontxl};
    font-weight: 700;
    background: linear-gradient(135deg, ${({ theme }) => theme.primary}, ${({ theme }) => theme.info});
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p {
    margin: 4px 0 0;
    color: ${({ theme }) => theme.textSecondary};
    font-size: ${({ theme }) => theme.fontsm};
  }
`;

const RefreshButton = styled.button`
  background: ${({ theme, $isRefreshing }) => $isRefreshing ? theme.bg2 : theme.primary};
  color: ${({ theme, $isRefreshing }) => $isRefreshing ? theme.text : "white"};
  border: none;
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.borderRadius};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: ${({ theme }) => theme.shadows.soft};

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.medium};
    filter: brightness(1.1);
  }

  svg {
    animation: ${({ $isRefreshing }) => $isRefreshing ? "spin 2s linear infinite" : "none"};
  }

  @keyframes spin {
    100% { transform: rotate(360deg); }
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xxl};
`;

const CardFooterContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .mini-stats {
    display: flex;
    gap: 12px;
    font-size: 13px;
    color: ${({ theme }) => theme.textSecondary};

    span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .danger {
      color: ${({ theme }) => theme.danger};
    }
  }
`;

const DetailPanel = styled.div`
  background: ${({ theme }) => theme.bg2};
  border-radius: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  backdrop-filter: blur(10px);
`;

const DetailHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  .title-area {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${({ theme }) => theme.primary};

    h3 {
      margin: 0;
      color: ${({ theme }) => theme.text};
    }
  }
`;

const TimeRangeSelector = styled.div`
  select {
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.cardBg};
    color: ${({ theme }) => theme.text};
    font-weight: 500;
    outline: none;
    cursor: pointer;

    &:focus {
      border-color: ${({ theme }) => theme.primary};
    }
  }
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const SegmentsArea = styled.div`
  h4 {
    margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
    color: ${({ theme }) => theme.textSecondary};
    font-size: ${({ theme }) => theme.fontsm};
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

const SegmentsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;

const SegmentCard = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};

  .segment-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;

    .name {
      font-weight: 600;
      font-size: 14px;
    }

    .value {
      color: ${({ theme }) => theme.primary};
      font-weight: 700;
    }
  }

  .segment-meta {
    font-size: 11px;
    color: ${({ theme }) => theme.textSecondary};
  }
`;
