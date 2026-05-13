import React, { useState } from "react";
import {
  useAuth,
  usePermissions,
  useSystemStats,
  IntelligenceGrids,
  Button,
  LoadingUI
} from "../../index";
import { FaSync, FaChartLine } from "react-icons/fa";

/**
 * Statistics (Tailwind Edition)
 * Dashboard de inteligencia operativa con diseño corporativo avanzado.
 */
export function Statistics() {
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
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Centro de Inteligencia</h1>
          <p className="text-slate-500 mt-2 font-medium">Análisis métrico de operaciones y salud de infraestructura en tiempo real.</p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-soft">
          <div className="flex gap-1">
            {ranges.map(r => (
              <button
                key={r.value}
                onClick={() => filters.setTimeRange(r.value)}
                className={`
                  px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all
                  ${filters.timeRange === r.value 
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
                `}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-slate-100 mx-1" />
          <button
            onClick={actions.refreshStats}
            disabled={refreshing}
            className={`p-2.5 rounded-xl text-slate-400 hover:text-primary-500 hover:bg-primary-50 transition-all ${refreshing ? 'animate-spin' : ''}`}
            title="Sincronizar métricas"
          >
            <FaSync size={14} />
          </button>
        </div>
      </header>

      {/* CONTENT */}
      {loading && !refreshing ? (
        <LoadingUI message="Analizando macro-métricas del ecosistema..." />
      ) : (
        <div className="animate-fadeIn">
          <IntelligenceGrids stats={stats} />
        </div>
      )}

      {/* FOOTER INFO */}
      {!loading && (
        <footer className="mt-8 pt-8 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
          <span>&copy; {new Date().getFullYear()} Catelli Intelligence Engine</span>
          <span>Sincronizado: {new Date().toLocaleTimeString()}</span>
        </footer>
      )}
    </div>
  );
}
