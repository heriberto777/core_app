import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaHeartbeat, FaDatabase, FaBolt, FaExclamationTriangle } from "react-icons/fa";
import { Telemetry } from "../../api/index"; // Asumiendo que existirá una clase Telemetry en las APIs

export function LiveHealthCard({ accessToken }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const telemetryApi = new Telemetry();

  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        const response = await telemetryApi.getLiveMetrics(accessToken);
        if (response.success) {
          setMetrics(response.data);
          setError(null);
        }
      } catch (err) {
        setError("Error de conexión con telemetría");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    interval = setInterval(fetchData, 5000); // Polling cada 5 segundos

    return () => clearInterval(interval);
  }, [accessToken]);

  if (loading && !metrics) return <CardSkeleton />;

  const healthScore = calculateHealthScore(metrics);
  const getStatusColor = (score) => {
    if (score > 90) return "#53B257";
    if (score > 70) return "#F1C40F";
    return "#F54E41";
  };

  return (
    <StyledCard>
      <Header>
        <div className="title">
          <FaHeartbeat className="pulse" />
          <span>Salud del Sistema</span>
        </div>
        <Badge $color={getStatusColor(healthScore)}>
          {healthScore}% Salud
        </Badge>
      </Header>

      <MetricsGrid>
        <MetricItem>
          <div className="icon-box"><FaBolt /></div>
          <div className="data">
            <span className="label">Registros/Seg</span>
            <span className="value">{metrics?.transfers?.recordsProcessed || 0}</span>
          </div>
        </MetricItem>
        <MetricItem>
          <div className="icon-box"><FaDatabase /></div>
          <div className="data">
            <span className="label">Latencia SQL</span>
            <span className="value">{metrics?.performance?.avgQueryTime?.toFixed(0) || 0}ms</span>
          </div>
        </MetricItem>
      </MetricsGrid>

      {error && (
        <ErrorBanner>
          <FaExclamationTriangle /> {error}
        </ErrorBanner>
      )}

      <ActivityIndicator>
        <div className="dot" />
        <span>Monitoreo en vivo activo</span>
      </ActivityIndicator>
    </StyledCard>
  );
}

function calculateHealthScore(metrics) {
  if (!metrics) return 0;
  let score = 100;
  if (metrics.performance?.avgQueryTime > 500) score -= 30;
  if (metrics.db?.connections?.errors > 0) score -= 20;
  return Math.max(0, score);
}

// --- Styled Components ---

const StyledCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 24px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: transform 0.3s;
  
  &:hover { transform: translateY(-5px); }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  .title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 700;
    font-size: 1.1rem;
    color: ${({ theme }) => theme.titleColor};

    .pulse {
      color: ${({ theme }) => theme.danger};
      animation: heartbeat 1.5s infinite;
    }
  }

  @keyframes heartbeat {
    0% { transform: scale(1); }
    15% { transform: scale(1.3); }
    30% { transform: scale(1); }
    45% { transform: scale(1.15); }
    60% { transform: scale(1); }
  }
`;

const Badge = styled.span`
  background: ${props => props.$color}20;
  color: ${props => props.$color};
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 800;
  border: 1px solid ${props => props.$color}40;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
`;

const MetricItem = styled.div`
  background: ${({ theme }) => theme.bgAlpha};
  padding: 15px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 12px;

  .icon-box {
    width: 40px;
    height: 40px;
    background: ${({ theme }) => theme.bgAlpha};
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.primary};
  }

  .data {
    display: flex;
    flex-direction: column;
    .label { font-size: 0.7rem; color: ${({ theme }) => theme.textSecondary}; font-weight: 600; text-transform: uppercase; }
    .value { font-size: 1.1rem; color: ${({ theme }) => theme.text}; font-weight: 700; }
  }
`;

const ActivityIndicator = styled.div`
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.textSecondary};

  .dot {
    width: 8px;
    height: 8px;
    background: ${({ theme }) => theme.success};
    border-radius: 50%;
    box-shadow: 0 0 10px ${({ theme }) => theme.success};
  }
`;

const ErrorBanner = styled.div`
  background: rgba(245, 78, 65, 0.1);
  color: #F54E41;
  padding: 10px;
  border-radius: 10px;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CardSkeleton = styled.div`
  height: 200px;
  background: rgba(255,255,255,0.05);
  border-radius: 24px;
  animation: pulse 1.5s infinite;
  @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 0.8; } 100% { opacity: 0.5; } }
`;
