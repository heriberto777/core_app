import React, { useState } from "react";
import {
  FaSync, FaSearch, FaTable, FaThLarge, FaArrowLeft,
  FaInfoCircle, FaChevronDown, FaChevronUp
} from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  useOrdersVisualization,
  MappingsList,
  MappingEditor,
  OrdersFilterPanel,
  OrdersDataTable,
  OrdersCardsGrid,
  OrderDetailsModal,
  Button,
  LoadingUI
} from "../../index";

/**
 * OrdersVisualization (Tailwind Edition)
 * Monitor de integración y visualización de órdenes con diseño corporativo premium.
 */
export function OrdersVisualization() {
  const { accessToken } = useAuth();

  // Hook de lógica centralizada
  const {
    activeMappingId, setActiveMappingId,
    activeConfig,
    activeMappingName,
    activeView, setActiveView,
    editingMappingId, setEditingMappingId,
    showConfigInfo, setShowConfigInfo,
    viewMode, setViewMode,
    filteredOrders,
    loading,
    isProcessing,
    error,
    search, setSearch,
    selectedOrders,
    filters, setFilters,
    fetchOrders,
    handleSelectOrder,
    handleSelectAll,
    processSelectedOrders,
    getOrderDetails
  } = useOrdersVisualization(accessToken);

  // Estados locales para modales
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [detailsData, setDetailsData] = useState(null);

  const handleSelectMapping = (id) => setActiveMappingId(id);

  const handleEditMapping = (id) => {
    setEditingMappingId(id);
    setActiveView("mappingEditor");
  };

  const handleCreateMapping = () => {
    setEditingMappingId(null);
    setActiveView("mappingEditor");
  };

  const onViewDetails = async (order) => {
    try {
      setSelectedOrderData(order);
      const details = await getOrderDetails(order);
      setDetailsData(details);
      setIsDetailsOpen(true);
    } catch (err) {
      Swal.fire("Error", "No se pudieron cargar los detalles", "error");
    }
  };

  const onProcessBatch = async () => {
    if (selectedOrders.length === 0) return;

    const confirm = await Swal.fire({
      title: '¿Procesar Documentos?',
      text: `Confirmas el procesamiento de ${selectedOrders.length} documentos seleccionados.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, procesar',
      confirmButtonColor: '#6366f1'
    });

    if (confirm.isConfirmed) {
      try {
        const result = await processSelectedOrders();
        Swal.fire({
          title: result.data?.failed > 0 ? "Procesamiento Parcial" : "Éxito",
          text: `Procesados: ${result.data?.processed || 0}, Fallidos: ${result.data?.failed || 0}`,
          icon: result.data?.failed > 0 ? "warning" : "success"
        });
      } catch (err) {
        Swal.fire("Error", "Ocurrió un error crítico durante el proceso", "error");
      }
    }
  };

  const onProcessUnit = async (id) => {
    try {
      await processSelectedOrders([id]);
      Swal.fire("Éxito", "Documento procesado correctamente", "success");
    } catch (err) {
      Swal.fire("Error", "Error al procesar", "error");
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case "mappingsList":
        return (
          <div className="animate-fadeIn p-6 lg:p-10">
            <header className="mb-8">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Integraciones Disponibles</h1>
              <p className="text-slate-500 font-medium mt-2">Selecciona un flujo de datos para monitorear y sincronizar documentos.</p>
            </header>
            <MappingsList
              onSelectMapping={handleSelectMapping}
              onEditMapping={handleEditMapping}
              onCreateMapping={handleCreateMapping}
            />
          </div>
        );

      case "mappingEditor":
        return (
          <div className="animate-fadeIn p-6 lg:p-10">
            <MappingEditor
              mappingId={editingMappingId}
              onSave={() => setActiveView("mappingsList")}
              onCancel={() => setActiveView("mappingsList")}
            />
          </div>
        );

      case "documents":
        return (
          <div className="flex flex-col gap-8 animate-fadeIn p-6 lg:p-10">
            {/* VIEW HEADER */}
            <header className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => setActiveView("mappingsList")}
                  className="flex items-center gap-2 text-sm font-extrabold text-slate-400 hover:text-primary-500 transition-colors uppercase tracking-widest"
                >
                  <FaArrowLeft /> Volver a Flujos
                </button>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{activeMappingName}</h2>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="px-3 py-1 bg-primary-100 text-primary-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary-200 shadow-sm">
                  MODO: {activeConfig?.transferType || 'TRANSFER'}
                </span>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-tighter">Sincronización en tiempo real</p>
              </div>
            </header>

            {/* TECH ACCORDION */}
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-soft overflow-hidden">
                <button 
                  onClick={() => setShowConfigInfo(!showConfigInfo)}
                  className="w-full flex justify-between items-center px-6 py-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                    <span className="text-sm font-bold text-slate-600 flex items-center gap-2">
                      <FaInfoCircle className="text-primary-500" /> Configuración Técnica del Flujo
                    </span>
                    {showConfigInfo ? <FaChevronUp className="text-slate-400" /> : <FaChevronDown className="text-slate-400" />}
                </button>
                {showConfigInfo && activeConfig && (
                    <div className="px-6 py-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Servidor Origen</span>
                          <span className="text-xs font-extrabold text-slate-700">{activeConfig.sourceServer}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Servidor Destino</span>
                          <span className="text-xs font-extrabold text-slate-700">{activeConfig.targetServer}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tablas Mapeadas</span>
                          <span className="text-xs font-extrabold text-slate-700">{activeConfig.tableConfigs?.length || 0} configuraciones activas</span>
                        </div>
                    </div>
                )}
            </div>

            {/* FILTERS & TOOLBAR */}
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft p-2">
              <OrdersFilterPanel
                filters={filters}
                setFilters={setFilters}
                onRefresh={fetchOrders}
              />
            </div>

            <div className="flex flex-col lg:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por cualquier campo en los resultados..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full py-3.5 pl-11 pr-4 rounded-2xl border border-slate-100 bg-white shadow-soft focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
                />
              </div>

              <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-soft shrink-0">
                <div className="flex gap-1">
                  <button 
                    onClick={() => setViewMode('table')}
                    className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-primary-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                    title="Vista Tabla"
                  >
                    <FaTable size={16} />
                  </button>
                  <button 
                    onClick={() => setViewMode('cards')}
                    className={`p-2 rounded-xl transition-all ${viewMode === 'cards' ? 'bg-primary-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                    title="Vista Tarjetas"
                  >
                    <FaThLarge size={16} />
                  </button>
                </div>
                <div className="w-px h-6 bg-slate-100 mx-1" />
                <Button
                  variant="primary"
                  onClick={onProcessBatch}
                  disabled={selectedOrders.length === 0}
                  className="!px-6 shadow-indigo-500/20"
                >
                  Procesar Seleccionados ({selectedOrders.length})
                </Button>
              </div>
            </div>

            {/* DATA AREA */}
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-premium overflow-hidden min-h-[400px]">
              {loading ? (
                <LoadingUI message="Sincronizando flujos de datos..." />
              ) : error ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-2xl">!</div>
                  <p className="text-red-500 font-bold">{error}</p>
                </div>
              ) : (
                <div className="animate-fadeIn">
                  {viewMode === 'table' ? (
                    <OrdersDataTable
                      data={filteredOrders}
                      selectedIds={selectedOrders}
                      onSelect={handleSelectOrder}
                      onSelectAll={handleSelectAll}
                      onViewDetails={onViewDetails}
                      onProcess={onProcessUnit}
                    />
                  ) : (
                    <OrdersCardsGrid
                      data={filteredOrders}
                      selectedIds={selectedOrders}
                      onSelect={handleSelectOrder}
                      onViewDetails={onViewDetails}
                      onProcess={onProcessUnit}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <main className="flex-1 max-w-[1600px] mx-auto w-full">
        {renderContent()}
      </main>

      <OrderDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        documentId={selectedOrderData ? Object.values(selectedOrderData)[0] : null}
        orderData={selectedOrderData}
        detailsData={detailsData}
      />

      {isProcessing && (
        <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center gap-6 text-white animate-fadeIn">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="font-extrabold text-xl tracking-tight uppercase">Ejecutando transferencia inteligente...</span>
        </div>
      )}
    </div>
  );
}

export default OrdersVisualization;
