import React, { useState } from "react";
import styled from "styled-components";
import { FaSync } from "react-icons/fa";
import { Helmet } from "react-helmet-async";

import {
  useAuth,
  useDashboard,
  StatCardsGrid,
  ServerHealthPanel,
  SchedulerPanel,
  RecentActivitiesTable,
  QuickAccessGrid,
  Button,
  LiveHealthCard
} from "../../index";

export function Dashboard() {
  const { accessToken } = useAuth();

  // Hook de lógica centralizada
  const {
    stats,
    serverStatus,
    lastTransfers,
    nextScheduled,
    loading,
    refreshing,
    error,
    handleRefresh,
    fetchDashboardData
  } = useDashboard(accessToken);

  const handleScheduleSuccess = () => fetchDashboardData(true);

  return (
    <Container>
      <Helmet>
        <title>Dashboard - Sistema Core ERP</title>
      </Helmet>

      <MainArea>
        <WelcomeHeader>
          <div>
            <WelcomeTitle>Panel de Control</WelcomeTitle>
            <WelcomeSubtitle>Sistema de Transferencia de Datos Inteligente</WelcomeSubtitle>
          </div>
          <Button
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <FaSync className={refreshing ? "spin-icon" : ""} />
            {refreshing ? "Actualizando..." : "Sincronizar"}
          </Button>
        </WelcomeHeader>

        {loading && !refreshing ? (
          <LoadingArea>
            <Spinner />
            <span>Optimizando telemetría del sistema...</span>
          </LoadingArea>
        ) : error ? (
          <ErrorArea>
            <p>{error}</p>
            <Button variant="primary" onClick={() => fetchDashboardData()}>Reintentar Conexión</Button>
          </ErrorArea>
        ) : (
          <>
            <StatCardsGrid stats={stats} />

            <DashboardGrid>
              <LiveHealthCard accessToken={accessToken} />
              <ServerHealthPanel status={serverStatus} />
              <SchedulerPanel
                nextRun={nextScheduled}
                onConfigSuccess={handleScheduleSuccess}
                loading={loading}
              />
              <QuickAccessGrid />
              <RecentActivitiesTable transfers={lastTransfers} />
            </DashboardGrid>
          </>
        )}
      </MainArea>

      <style>{`
        .spin-icon { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Container>
  );
}

// --- Styled Components Premium ---

const Container = styled.div`
  min-height: 100vh; background: ${({ theme }) => theme.bg};
  display: flex; flex-direction: column;
`;

const MainArea = styled.main`
  flex: 1; padding: 20px 40px; max-width: 1400px; margin: 0 auto; width: 100%;
  display: flex; flex-direction: column; gap: 24px;
  @media (max-width: 768px) { padding: 10px; }
`;

const WelcomeHeader = styled.div`
  display: flex; justify-content: space-between; align-items: flex-end; padding: 10px 0;
  @media (max-width: 600px) { flex-direction: column; align-items: flex-start; gap: 20px; }
`;

const WelcomeTitle = styled.h1`
  margin: 0; font-size: 28px; font-weight: 800; color: ${({ theme }) => theme.title};
`;

const WelcomeSubtitle = styled.p`
  margin: 4px 0 0; font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.textSecondary};
`;

const DashboardGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const LoadingArea = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  min-height: 400px; font-weight: 700; color: ${({ theme }) => theme.primary};
`;

const ErrorArea = styled.div`
  padding: 60px; text-align: center; background: #ef444405; border-radius: 32px;
  border: 1px dashed #ef444440; display: flex; flex-direction: column; align-items: center; gap: 16px;
  color: #ef4444; font-weight: 600;
`;

const Spinner = styled.div`
  width: 50px; height: 50px; border: 4px solid ${({ theme }) => theme.primary}20;
  border-top-color: ${({ theme }) => theme.primary}; border-radius: 50%;
  animation: spin 1s linear infinite;
`;

export default Dashboard;
