import React from "react";
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

/**
 * Dashboard (Tailwind Edition)
 * Re-diseño corporativo con énfasis en métricas y telemetría.
 */
export function Dashboard() {
  const { accessToken } = useAuth();

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
    <div className="flex flex-col min-h-screen bg-slate-50 animate-fadeIn">
      <Helmet>
        <title>Dashboard - Sistema Core ERP</title>
      </Helmet>

      <div className="flex-1 w-full max-w-[1400px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        {/* HEADER DE BIENVENIDA */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 py-2">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Panel de Control</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">Sistema de Transferencia de Datos Inteligente</p>
          </div>
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="shadow-sm"
          >
            <FaSync className={`transition-transform duration-700 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Actualizando..." : "Sincronizar"}
          </Button>
        </header>

        {loading && !refreshing ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-6">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-lg font-bold text-primary-600 animate-pulse">Optimizando telemetría del sistema...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-16 bg-red-50/50 border border-red-100 rounded-[32px] text-center gap-4">
            <div className="text-4xl">🔌</div>
            <p className="text-red-600 font-bold text-lg">{error}</p>
            <Button variant="primary" onClick={() => fetchDashboardData()}>Reintentar Conexión</Button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* GRID DE ESTADÍSTICAS */}
            <StatCardsGrid stats={stats} />

            {/* GRID PRINCIPAL DE PANELES */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
              <div className="xl:col-span-1">
                <LiveHealthCard accessToken={accessToken} />
              </div>
              <div className="xl:col-span-1">
                <ServerHealthPanel status={serverStatus} />
              </div>
              <div className="xl:col-span-1">
                <SchedulerPanel
                  nextRun={nextScheduled}
                  onConfigSuccess={handleScheduleSuccess}
                  loading={loading}
                />
              </div>
              <div className="xl:col-span-3">
                <QuickAccessGrid />
              </div>
              <div className="xl:col-span-3">
                <RecentActivitiesTable transfers={lastTransfers} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
