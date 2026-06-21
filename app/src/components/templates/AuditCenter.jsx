import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth, usePermissions, useAuditLogs, AuditFiltersPanel, AuditDataTable, LogDetailModal } from "../../index";

/**
 * AuditCenter (Tailwind Edition)
 * Centro de control para auditoría de sistema y transferencias.
 */
export function AuditCenter() {
    const { accessToken } = useAuth();
    const { hasPermission, isAdmin } = usePermissions();
    const location = useLocation();
    const [selectedLog, setSelectedLog] = useState(null);

    // Extraer parámetros de la URL
    const searchParams = new URLSearchParams(location.search);
    const initialSearch = searchParams.get("search") || "";
    const initialType = searchParams.get("type") || "system";

    const {
        logs,
        meta,
        stats,
        loading,
        logType,
        filters,
        autoRefresh,
        autoRefreshInterval,
        actions
    } = useAuditLogs(accessToken, initialType);

    // Efecto para aplicar búsqueda inicial desde URL
    useEffect(() => {
        if (initialSearch) {
            actions.updateFilters({ search: initialSearch });
        }
        if (initialType && initialType !== logType) {
            actions.setLogType(initialType);
        }
    }, [initialSearch, initialType]);

    return (
        <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
            {/* WELCOME SECTION */}
            <header className="mb-2">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Central de Auditoría</h1>
                <p className="text-slate-500 mt-2 font-medium">Supervisión integral de eventos del sistema y transferencias logísticas.</p>
            </header>

            {/* FILTERS PANEL */}
            <div className="z-20">
              <AuditFiltersPanel
                  logType={logType}
                  setLogType={actions.setLogType}
                  filters={filters}
                  onFilterChange={actions.updateFilters}
                  onRefresh={actions.refreshLogs}
                  onExport={actions.exportCSV}
                  onToggleAutoRefresh={actions.toggleAutoRefresh}
                  onSetRefreshInterval={actions.setRefreshInterval}
                  loading={loading}
                  autoRefresh={autoRefresh}
                  autoRefreshInterval={autoRefreshInterval}
                  stats={stats}
              />
            </div>

            {/* DATA TABLE */}
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden min-h-[500px]">
              <AuditDataTable
                  data={logs}
                  type={logType}
                  pagination={meta}
                  onPageChange={actions.changePage}
                  onViewDetail={setSelectedLog}
                  loading={loading}
              />
            </div>

            {/* MODAL DETALLE */}
            {selectedLog && (
                <LogDetailModal 
                    log={selectedLog} 
                    onClose={() => setSelectedLog(null)} 
                />
            )}
        </div>
    );
}
