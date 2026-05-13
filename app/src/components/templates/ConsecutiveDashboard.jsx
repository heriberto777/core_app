import React, { useState, useEffect } from "react";
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
    const interval = setInterval(loadDashboard, 10000);
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
    <div className="p-6 bg-white dark:bg-slate-900 min-h-full">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="m-0 text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
            Dashboard de Consecutivos
          </h2>
          <p className="mt-1 text-sm text-slate-500">Monitoreo en tiempo real de numeración y reservas</p>
        </div>
        <button
          onClick={loadDashboard}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-md hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 ${
            refreshing ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-blue-600 text-white'
          }`}
        >
          <FaClock className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 mb-10">
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
                <div className="flex justify-between items-center w-full">
                  <StatusBadge status={health.status}>{health.label}</StatusBadge>
                  <div className="flex gap-3 text-[13px] text-slate-500">
                    <span className="flex items-center gap-1"><FaLayerGroup /> {consecutive.activeReservations}</span>
                    {consecutive.expiredReservations > 0 && (
                      <span className="flex items-center gap-1 text-red-500"><FaExclamationTriangle /> {consecutive.expiredReservations}</span>
                    )}
                  </div>
                </div>
              }
            />
          );
        })}
      </div>

      {selectedConsecutive && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur-sm">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3 text-blue-600">
              <FaHistory />
              <h3 className="m-0 text-slate-800 dark:text-white">Detalle: {selectedConsecutive.consecutiveName}</h3>
            </div>
            <select
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer outline-none focus:border-blue-500"
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
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8 max-md:grid-cols-1">
            <StatCard
              title="Incrementos"
              value={selectedConsecutive.metrics.totalIncrements}
              icon={<FaCheckCircle />}
            />
            <StatCard
              title="Promedio Reserva"
              value={`${Math.round(selectedConsecutive.metrics.averageReservationDuration)}s`}
              icon={<FaClock />}
            />
            <StatCard
              title=" Reservas Activas"
              value={selectedConsecutive.metrics.activeReservations}
              icon={<FaLayerGroup />}
            />
          </div>

          <div>
            <h4 className="m-0 mb-4 text-sm text-slate-500 uppercase tracking-wider">Segmentos de Reservas</h4>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {selectedConsecutive.metrics.reservationSegments?.map((segment, idx) => (
                <div key={idx} className="p-3 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm">{segment.segmentName}</span>
                    <span className="font-bold text-blue-600">{segment.count}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{segment.percentage}% del total</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConsecutiveDashboard;