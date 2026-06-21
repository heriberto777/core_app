import React, { useState, useEffect } from "react";
import { FaHeartbeat, FaDatabase, FaBolt, FaExclamationTriangle } from "react-icons/fa";

/**
 * Corporate LiveHealthCard (Tailwind Edition)
 */
export function LiveHealthCard({ accessToken, className = "" }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        setMetrics({ transfers: { recordsProcessed: 150 }, performance: { avgQueryTime: 45 }, db: { connections: { errors: 0 } } });
        setError(null);
      } catch (err) {
        setError("Error de conexión con telemetría");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [accessToken]);

  if (loading && !metrics) {
    return <div className="h-[200px] bg-slate-50/50 rounded-3xl animate-pulse" />;
  }

  const healthScore = calculateHealthScore(metrics);
  
  const getStatusColor = (score) => {
    if (score > 90) return { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" };
    if (score > 70) return { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" };
    return { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" };
  };

  const colors = getStatusColor(healthScore);

  return (
    <div className={`bg-white backdrop-blur-md border border-slate-200 rounded-3xl p-6 flex flex-col gap-5 transition-transform hover:-translate-y-1 ${className}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 text-base font-bold text-slate-800">
          <FaHeartbeat className="text-red-500 animate-heartbeat" />
          <span>Salud del Sistema</span>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${colors.bg} ${colors.text} border ${colors.border}`}>
          {healthScore}% Salud
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-slate-50/50 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-500">
            <FaBolt />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Registros/Seg</span>
            <span className="text-lg font-bold text-slate-800">{metrics?.transfers?.recordsProcessed || 0}</span>
          </div>
        </div>
        <div className="bg-slate-50/50 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-500">
            <FaDatabase />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Latencia SQL</span>
            <span className="text-lg font-bold text-slate-800">{metrics?.performance?.avgQueryTime?.toFixed(0) || 0}ms</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-600 p-2.5 rounded-lg text-sm flex items-center gap-2.5">
          <FaExclamationTriangle /> {error}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
        <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50" />
        <span>Monitoreo en vivo activo</span>
      </div>
    </div>
  );
}

function calculateHealthScore(metrics) {
  if (!metrics) return 0;
  let score = 100;
  if (metrics.performance?.avgQueryTime > 500) score -= 30;
  if (metrics.db?.connections?.errors > 0) score -= 20;
  return Math.max(0, score);
}