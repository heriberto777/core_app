import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FaSync, FaHistory } from "react-icons/fa";
import {
  useAuth,
  useTransferManagement,
  useNotification,
  Button,
  TraspasoStatsGrid,
  TraspasoFiltersPanel,
  TraspasoTrackingTable,
  TraspasoDetailModal,
  LoadingUI
} from "../../index";

/**
 * TraspasoManagement (Tailwind Edition)
 * Supervisión y ejecución de transferencias de inventario con diseño corporativo premium.
 *
 * La ejecución masiva/por lote se retiró a propósito: "ejecutar" un traspaso
 * mueve inventario real en el ERP (CATELLI.DOCUMENTO_INV), y falta definir
 * la lógica de cuándo un traspaso queda realmente aprobado en el ERP antes
 * de exponer un botón que lo dispare por lote sin ese control.
 */
export function TraspasoManagement() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();

  const {
    traspasos,
    stats,
    loading,
    refreshing,
    error,
    metadata,
    selectedTraspaso,
    actions
  } = useTransferManagement();

  const getDefaultFilters = () => ({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    loadId: ""
  });

  const [singleActionStates, setSingleActionStates] = useState({});
  const [filters, setFilters] = useState(getDefaultFilters());

  // Carga inicial
  useEffect(() => {
    if (accessToken) {
      actions.fetchTraspasos(filters);
      actions.fetchStats(filters);
      actions.fetchMetadata();
    }
  }, [accessToken]);

  // Sincronización de errores del hook
  useEffect(() => {
    if (error) showError(error);
  }, [error]);

  const handleSearch = () => {
    actions.fetchTraspasos(filters);
    actions.fetchStats(filters);
  };

  const handleResetFilters = () => {
    const defaults = getDefaultFilters();
    setFilters(defaults);
    actions.fetchTraspasos(defaults);
    actions.fetchStats(defaults);
  };

  const handleRefresh = async () => {
    await actions.fetchTraspasos(filters, true);
    await actions.fetchStats(filters);
    showInfo("Datos sincronizados correctamente");
  };

  const handleExecuteSingle = async (loadId) => {
    try {
      setSingleActionStates(prev => ({ ...prev, [loadId]: 'executing' }));
      await actions.executeTransfer(loadId);
      showSuccess(`Traspaso ${loadId} iniciado`);
    } catch (err) {
      showError(`Error al ejecutar traspaso ${loadId}`);
    } finally {
      setSingleActionStates(prev => ({ ...prev, [loadId]: null }));
    }
  };

  const handleViewDetails = async (id) => {
    try {
      setSingleActionStates(prev => ({ ...prev, [id]: 'details' }));
      await actions.getDetails(id);
    } catch (err) {
      showError("Error al obtener el detalle del traspaso");
    } finally {
      setSingleActionStates(prev => ({ ...prev, [id]: null }));
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50/50 animate-fadeIn">
      <Helmet>
        <title>Gestión de Traspasos | Catelli Core</title>
      </Helmet>

      <div className="max-w-[1600px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        {/* PAGE HEADER */}
        <header className="flex flex-col xl:flex-row justify-between items-start gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Gestión de Traspasos</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
              Monitoreo y ejecución de transferencias de inventario entre bodegas. Supervisa el éxito de los procesos post-carga y gestiona discrepancias.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button variant="secondary" onClick={() => navigate("/loads/cargas")} className="!px-6">
              <FaHistory /> Historial de Cargas
            </Button>
            <Button variant="primary" onClick={handleRefresh} loading={refreshing} className="!px-8 shadow-primary-500/20">
              <FaSync /> Actualizar
            </Button>
          </div>
        </header>

        {/* METRICS */}
        <TraspasoStatsGrid stats={stats} loading={loading} />

        {/* FILTERS */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-soft p-2">
          <TraspasoFiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            onReset={handleResetFilters}
            onSearch={handleSearch}
            loading={loading}
            metadata={metadata}
          />
        </div>

        {/* LISTING / TABLE */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-premium overflow-hidden">
          {loading && !refreshing ? (
            <LoadingUI message="Consultando bitácora de transferencias..." />
          ) : (
            <TraspasoTrackingTable
              transfers={traspasos}
              loading={loading}
              actionStates={singleActionStates}
              onExecute={handleExecuteSingle}
              onViewDetails={handleViewDetails}
            />
          )}
        </div>
      </div>

      {selectedTraspaso && (
        <TraspasoDetailModal traspaso={selectedTraspaso} onClose={actions.clearSelection} />
      )}
    </div>
  );
}