import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FaSync, FaHistory, FaCheckDouble } from "react-icons/fa";
import {
  useAuth,
  usePermissions,
  useTransferManagement,
  useNotification,
  Button,
  TraspasoStatsGrid,
  TraspasoFiltersPanel,
  TraspasoTrackingTable,
  LoadingUI
} from "../../index";

/**
 * TraspasoManagement (Tailwind Edition)
 * Supervisión y ejecución de transferencias de inventario con diseño corporativo premium.
 */
export function TraspasoManagement() {
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const { showSuccess, showError, showInfo } = useNotification();
  
  const canExecuteTraspaso = hasPermission("loads", "execute") || hasPermission("loads", "create") || isAdmin;

  const {
    traspasos,
    stats,
    loading,
    refreshing,
    error,
    metadata,
    actions
  } = useTransferManagement();

  const [selectedItems, setSelectedItems] = useState([]);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [singleActionStates, setSingleActionStates] = useState({});
  const [filters, setFilters] = useState({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    loadId: ""
  });

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

  const handleRefresh = async () => {
    await actions.fetchTraspasos(filters, true);
    await actions.fetchStats(filters);
    showInfo("Datos sincronizados correctamente");
  };

  const handleSelectItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = (checked) => {
    setSelectedItems(checked ? traspasos.map(t => t.id) : []);
  };

  const handleBulkExecute = async () => {
    try {
      const loadIds = traspasos
        .filter(t => selectedItems.includes(t.id))
        .map(t => t.load_id);

      if (loadIds.length === 0) return;

      setIsProcessingAction(true);
      showInfo(`Iniciando ejecución masiva de ${loadIds.length} traspasos...`);
      await actions.executeBulkTransfers(loadIds);
      showSuccess("Traspasos procesados con éxito");
      setSelectedItems([]);
    } catch (err) {
      showError("Error en la ejecución masiva");
    } finally {
      setIsProcessingAction(false);
    }
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
      const details = await actions.getDetails(id);
      if (details) {
        showInfo(`Visualizando detalles de carga ${details.load_id}`);
      }
    } finally {
      setSingleActionStates(prev => ({ ...prev, [id]: null }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 animate-fadeIn">
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
            <Button variant="secondary" onClick={() => window.location.href = "/loads"} className="!px-6">
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
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft p-2">
          <TraspasoFiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            onReset={actions.resetFilters}
            onSearch={handleSearch}
            loading={loading}
            metadata={metadata}
          />
        </div>

        {/* BULK ACTIONS STICKY BANNER */}
        {selectedItems.length > 0 && canExecuteTraspaso && (
          <div className="sticky top-6 z-[100] animate-slideDown">
            <div className="bg-primary-600 text-white p-5 px-8 rounded-[24px] shadow-2xl shadow-primary-900/20 flex flex-col sm:flex-row justify-between items-center gap-4 border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl shadow-inner">
                  <FaCheckDouble />
                </div>
                <div>
                  <div className="text-lg font-black tracking-tight leading-tight">
                    {selectedItems.length} Traspasos seleccionados
                  </div>
                  <div className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Ejecución post-carga disponible</div>
                </div>
              </div>
              <Button 
                variant="primary" 
                size="small" 
                className="!bg-white !text-primary-600 !border-none !shadow-xl hover:!scale-105"
                loading={isProcessingAction} 
                onClick={handleBulkExecute}
              >
                Ejecutar Seleccionados
              </Button>
            </div>
          </div>
        )}

        {/* LISTING / TABLE */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-premium overflow-hidden">
          {loading && !refreshing ? (
            <LoadingUI message="Consultando bitácora de transferencias..." />
          ) : (
            <TraspasoTrackingTable
              transfers={traspasos}
              loading={loading}
              actionStates={singleActionStates}
              selectedItems={selectedItems}
              onSelectItem={handleSelectItem}
              onSelectAll={handleSelectAll}
              onViewDetails={handleViewDetails}
              onExecute={handleExecuteSingle}
            />
          )}
        </div>
      </div>
    </div>
  );
}