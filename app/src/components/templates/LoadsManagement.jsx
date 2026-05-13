import React, { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import {
  FaSync,
  FaHistory,
  FaTruck,
  FaTimes,
  FaCheckCircle
} from "react-icons/fa";
import {
  useAuth,
  useLoadsManagement,
  usePermissions,
  useNotification,
  Button,
  LoadsStatsGrid,
  FiltersPanel,
  OrdersList,
  OrderDetailsModal,
  DeliveryPersonSelector,
  LoadingUI
} from "../../index";
import Swal from "sweetalert2";

/**
 * LoadsManagement (Tailwind Edition)
 * Orquestación logística de despacho con diseño corporativo premium.
 */
export function LoadsManagement() {
  const { accessToken } = useAuth();
  const { showSuccess, showError } = useNotification();
  const {
    orders,
    stats,
    loading,
    refreshing,
    isProcessing,
    error,
    filters,
    search,
    selectedOrders,
    metadata,
    actions
  } = useLoadsManagement(accessToken);

  const { hasPermission, isAdmin } = usePermissions();
  const canProcessLoad = hasPermission("loads", "create") || hasPermission("loads", "manage") || isAdmin;

  const [modals, setModals] = React.useState({
    details: false,
    delivery: false
  });
  const [selectedOrderDetails, setSelectedOrderDetails] = React.useState(null);

  // Carga inicial
  useEffect(() => {
    if (accessToken) {
      actions.fetchOrders();
      actions.fetchMetadata();
    }
  }, [accessToken]);

  // Manejo de errores
  useEffect(() => {
    if (error) showError(error);
  }, [error]);

  const handleSearch = () => actions.fetchOrders();

  const handleBulkLoad = () => {
    if (selectedOrders.length === 0) return;
    setModals(prev => ({ ...prev, delivery: true }));
  };

  const handleDeliverySelect = async (code) => {
    try {
      setModals(prev => ({ ...prev, delivery: false }));

      Swal.fire({
        title: "Procesando Carga",
        text: "Sincronizando inventarios y generando transferencia logística...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const res = await actions.processLoad(code);

      Swal.fire({
        icon: "success",
        title: "¡Despacho Exitoso!",
        html: `<div class="text-left p-2"><p>Se han procesado <b>${res.totalOrders}</b> pedidos.</p><p class="mt-2 text-primary-600 font-bold">Load ID: ${res.loadId || 'N/A'}</p></div>`,
        confirmButtonColor: "#6366f1",
        confirmButtonText: "Entendido"
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error Logístico",
        text: err.message,
        confirmButtonColor: "#ef4444"
      });
    }
  };

  const handleBulkCancel = async () => {
    const result = await Swal.fire({
      title: "¿Anular pedidos seleccionados?",
      text: `Se cancelarán ${selectedOrders.length} pedidos. Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, anular selección",
      cancelButtonText: "Mantener pedidos"
    });

    if (result.isConfirmed) {
      try {
        await actions.cancelOrders(selectedOrders);
        showSuccess("Pedidos anulados correctamente");
      } catch (err) {
        showError("Error al anular pedidos");
      }
    }
  };

  const handleViewOrder = async (id) => {
    const res = await actions.getOrderDetails(id);
    if (res) {
      setSelectedOrderDetails(res);
      setModals(prev => ({ ...prev, details: true }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 animate-fadeIn">
      <Helmet>
        <title>Gestión de Despachos | Catelli Core</title>
      </Helmet>

      <div className="max-w-[1600px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        {/* PAGE HEADER */}
        <header className="flex flex-col xl:flex-row justify-between items-start gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Despacho de Cargas</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
              Orquesta la logística de salida. Filtra pedidos pendientes, asigna transportistas y genera certificados de carga en segundos.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button variant="secondary" onClick={() => window.location.href = "/loads/history"} className="!px-6">
              <FaHistory /> Historial
            </Button>
            <Button variant="primary" onClick={actions.fetchOrders} loading={refreshing} className="!px-8 shadow-indigo-500/20">
              <FaSync /> Sincronizar
            </Button>
          </div>
        </header>

        {/* METRICS */}
        <LoadsStatsGrid stats={stats} loading={loading} />

        {/* FILTERS */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft p-2">
          <FiltersPanel
            filters={filters}
            onFiltersChange={actions.updateFilters}
            onReset={actions.resetFilters}
            onRefresh={actions.fetchOrders}
            onSearch={handleSearch}
            search={search}
            onSearchChange={actions.setSearch}
            sellers={metadata.sellers}
            loading={loading || refreshing}
          />
        </div>

        {/* BULK ACTIONS STICKY BANNER */}
        {selectedOrders.length > 0 && canProcessLoad && (
          <div className="sticky top-6 z-[100] animate-slideDown">
            <div className="bg-slate-900 text-white p-5 px-8 rounded-[24px] shadow-2xl shadow-slate-900/40 flex flex-col sm:flex-row justify-between items-center gap-4 border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-indigo-500/30">
                  <FaTruck />
                </div>
                <div>
                  <div className="text-lg font-black tracking-tight leading-tight">
                    {selectedOrders.length} {selectedOrders.length === 1 ? 'Pedido listo' : 'Pedidos listos'}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Acción masiva en curso</div>
                </div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button 
                  onClick={handleBulkCancel}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <FaTimes /> Anular
                </button>
                <button 
                  onClick={handleBulkLoad}
                  disabled={isProcessing}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-indigo-500 text-sm font-black hover:bg-indigo-400 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <FaCheckCircle />}
                  Procesar Despacho
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LISTING */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-premium overflow-hidden">
          {loading && !refreshing ? (
            <LoadingUI message="Cargando pedidos pendientes de despacho..." />
          ) : (
            <OrdersList
              orders={orders}
              selectedOrders={selectedOrders}
              onOrderSelect={actions.toggleOrderSelection}
              onSelectAll={actions.selectAllOrders}
              onView={handleViewOrder}
              onLoad={(id) => {
                actions.selectAllOrders([id]);
                setModals(prev => ({ ...prev, delivery: true }));
              }}
              onBulkLoad={handleBulkLoad}
              onBulkCancel={handleBulkCancel}
              loading={loading}
              isProcessing={isProcessing}
              viewMode="cards"
            />
          )}
        </div>

        {/* MODALS */}
        <OrderDetailsModal
          isOpen={modals.details}
          onClose={() => setModals(prev => ({ ...prev, details: false }))}
          orderDetails={selectedOrderDetails}
          onRemoveLines={actions.removeOrderLines}
          editable={true}
        />

        <DeliveryPersonSelector
          isOpen={modals.delivery}
          onClose={() => setModals(prev => ({ ...prev, delivery: false }))}
          onSelect={handleDeliverySelect}
          selectedOrders={orders.filter(o => selectedOrders.includes(o.pedido))}
          deliveryPersons={metadata.sellers}
          loading={loading}
        />
      </div>
    </div>
  );
}