import React, { useState } from "react";
import styled from "styled-components";
import {
  useAuth,
  usePermissions,
  useSystemStats,
  IntelligenceGrids,
  Button
} from "../../index";
import { Container } from "../index";
import { FaSync, FaChartLine } from "react-icons/fa";

const StatsLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const RangeButton = styled.button`
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid ${props => props.active ? "#3b82f6" : "#e2e8f0"};
  background: ${props => props.active ? "rgba(59, 130, 246, 0.1)" : "white"};
  color: ${props => props.active ? "#3b82f6" : "#64748b"};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #3b82f6;
  }
`;

export function Statistics() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  const canViewAnalytics = hasPermission("analytics", "read") || isAdmin;

  const {
    stats,
    loading,
    refreshing,
    filters,
    actions
  } = useSystemStats(accessToken);

  const ranges = [
    { label: "24h", value: "24h" },
    { label: "7 Días", value: "7d" },
    { label: "30 Días", value: "30d" },
  ];

  return (
    <Container>
      <main style={{ padding: '40px 20px' }}>
        <StatsLayout>
          <Toolbar>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', color: 'inherit' }}>Dashboard de Inteligencia</h1>
              <p style={{ opacity: 0.7 }}>Análisis métrico de operaciones y salud de infraestructura.</p>
            </div>

            <FilterGroup>
              {ranges.map(r => (
                <RangeButton
                  key={r.value}
                  active={filters.timeRange === r.value}
                  onClick={() => filters.setTimeRange(r.value)}
                >
                  {r.label}
                </RangeButton>
              ))}
              <Button
                variant="outline"
                onClick={actions.refreshStats}
                loading={refreshing}
              >
                <FaSync />
              </Button>
            </FilterGroup>
          </Toolbar>

          {loading && !refreshing ? (
            <div style={{ textAlign: 'center', padding: '100px', opacity: 0.7 }}>
              <FaChartLine size={48} style={{ marginBottom: '20px', opacity: 0.2 }} />
              <p>Analizando métricas del sistema...</p>
            </div>
          ) : (
            <IntelligenceGrids stats={stats} />
          )}
        </StatsLayout>
      </main>
    </Container>
  );
}
