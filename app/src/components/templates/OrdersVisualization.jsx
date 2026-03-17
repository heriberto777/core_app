import React, { useState } from "react";
import styled from "styled-components";
import {
  FaSync, FaSearch, FaTable, FaThLarge, FaArrowLeft,
  FaInfoCircle, FaChevronDown, FaChevronUp
} from "react-icons/fa";
import Swal from "sweetalert2";

import {
  Header,
  useAuth,
  useOrdersVisualization,
  MappingsList,
  MappingEditor,
  OrdersFilterPanel,
  OrdersDataTable,
  OrdersCardsGrid,
  OrderDetailsModal,
  Button
} from "../../index";

export function OrdersVisualization() {
  const { accessToken } = useAuth();
  const [openstate, setOpenState] = useState(false);

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

  // --- UI Handlers ---

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
      confirmButtonText: 'Sí, procesar'
    });

    if (confirm.isConfirmed) {
      try {
        const result = await processSelectedOrders();
        // Mostrar resumen similar al anterior pero con diseño premium si fuera posible, 
        // por ahora reutilizamos la lógica de éxito/error de Swal pero simplificada
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
    // Implementación rápida para procesar uno solo
    try {
      // Podríamos añadir una confirmación pequeña aquí también
      const result = await processSelectedOrders([id]); // Reutilizamos lógica
      Swal.fire("Éxito", "Documento procesado correctamente", "success");
    } catch (err) {
      Swal.fire("Error", "Error al procesar", "error");
    }
  };

  // --- Render Views ---

  const renderContent = () => {
    switch (activeView) {
      case "mappingsList":
        return (
          <MappingsList
            onSelectMapping={handleSelectMapping}
            onEditMapping={handleEditMapping}
            onCreateMapping={handleCreateMapping}
          />
        );

      case "mappingEditor":
        return (
          <MappingEditor
            mappingId={editingMappingId}
            onSave={() => setActiveView("mappingsList")}
            onCancel={() => setActiveView("mappingsList")}
          />
        );

      case "documents":
        return (
          <DocumentsView>
            <ViewHeader>
              <Button variant="ghost" onClick={() => setActiveView("mappingsList")}>
                <FaArrowLeft /> Volver a Configuraciones
              </Button>
              <TitleGroup>
                <Title>{activeMappingName}</Title>
                <Badge>MODO: {activeConfig?.transferType || 'TRANSFER'} </Badge>
              </TitleGroup>
            </ViewHeader>

            <ConfigAccordion>
              <AccordionHeader onClick={() => setShowConfigInfo(!showConfigInfo)}>
                <span><FaInfoCircle /> Ver Configuración Técnica</span>
                {showConfigInfo ? <FaChevronUp /> : <FaChevronDown />}
              </AccordionHeader>
              {showConfigInfo && activeConfig && (
                <AccordionBody>
                  <ConfigGrid>
                    <ConfigItem><strong>Origen:</strong> {activeConfig.sourceServer}</ConfigItem>
                    <ConfigItem><strong>Destino:</strong> {activeConfig.targetServer}</ConfigItem>
                    <ConfigItem><strong>Tablas:</strong> {activeConfig.tableConfigs?.length || 0}</ConfigItem>
                  </ConfigGrid>
                </AccordionBody>
              )}
            </ConfigAccordion>

            <OrdersFilterPanel
              filters={filters}
              setFilters={setFilters}
              onRefresh={fetchOrders}
            />

            <Toolbar>
              <SearchBox>
                <FaSearch />
                <input
                  type="text"
                  placeholder="Filtrar por cualquier campo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </SearchBox>

              <ModeSwitcher>
                <Button
                  variant={viewMode === 'table' ? 'primary' : 'ghost'}
                  onClick={() => setViewMode('table')}
                  size="small"
                >
                  <FaTable /> Tabla
                </Button>
                <Button
                  variant={viewMode === 'cards' ? 'primary' : 'ghost'}
                  onClick={() => setViewMode('cards')}
                  size="small"
                >
                  <FaThLarge /> Tarjetas
                </Button>
              </ModeSwitcher>

              <Button
                variant="primary"
                onClick={onProcessBatch}
                disabled={selectedOrders.length === 0}
              >
                Procesar Seleccionados ({selectedOrders.length})
              </Button>
            </Toolbar>

            {loading ? (
              <LoadingArea>Sincronizando órdenes con el servidor...</LoadingArea>
            ) : error ? (
              <ErrorArea>{error}</ErrorArea>
            ) : (
              <DataArea>
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
              </DataArea>
            )}
          </DocumentsView>
        );

      default:
        return null;
    }
  };

  return (
    <Container>
      <MainArea>
        {renderContent()}
      </MainArea>

      <OrderDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        documentId={selectedOrderData ? Object.values(selectedOrderData)[0] : null}
        orderData={selectedOrderData}
        detailsData={detailsData}
      />

      {isProcessing && (
        <ProcessingOverlay>
          <Spinner />
          <span>Ejecutando transferencia inteligente...</span>
        </ProcessingOverlay>
      )}
    </Container>
  );
}

// --- Styled Components Premium ---

const Container = styled.div`
  min-height: 100vh; background: ${({ theme }) => theme.bg};
  display: flex; flex-direction: column;
`;

const HeaderSection = styled.header` padding: 0 20px; `;

const MainArea = styled.main`
  flex: 1; padding: 20px 40px; max-width: 1600px; margin: 0 auto; width: 100%;
  @media (max-width: 768px) { padding: 10px; }
`;

const DocumentsView = styled.div` display: flex; flex-direction: column; gap: 24px; animation: fadeIn 0.4s ease-out; `;

const ViewHeader = styled.div` display: flex; align-items: center; justify-content: space-between; gap: 20px; `;

const TitleGroup = styled.div` display: flex; flex-direction: column; align-items: flex-end; `;
const Title = styled.h2` margin: 0; font-size: 24px; font-weight: 800; color: ${({ theme }) => theme.title}; `;
const Badge = styled.span` font-size: 10px; font-weight: 800; background: ${({ theme }) => theme.primary}20; color: ${({ theme }) => theme.primary}; padding: 4px 10px; border-radius: 20px; margin-top: 4px; border: 1px solid ${({ theme }) => theme.primary}40; `;

const ConfigAccordion = styled.div` background: ${({ theme }) => theme.cardBg}40; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border}; overflow: hidden; `;
const AccordionHeader = styled.div` padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 13px; font-weight: 700; color: ${({ theme }) => theme.textSecondary}; &:hover { background: ${({ theme }) => theme.bg2}20; } `;
const AccordionBody = styled.div` padding: 16px 20px; border-top: 1px solid ${({ theme }) => theme.border}40; `;

const ConfigGrid = styled.div` display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; `;
const ConfigItem = styled.div` font-size: 12px; color: ${({ theme }) => theme.text}; `;

const Toolbar = styled.div` display: flex; align-items: center; gap: 16px; flex-wrap: wrap; `;
const SearchBox = styled.div` 
  flex: 1; min-width: 300px; position: relative; display: flex; align-items: center; 
  background: white; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border}; padding: 0 16px;
  svg { color: ${({ theme }) => theme.textSecondary}; }
  input { border: none; background: transparent; padding: 10px; width: 100%; font-size: 14px; &:focus { outline: none; } }
`;

const ModeSwitcher = styled.div` display: flex; gap: 4px; background: ${({ theme }) => theme.bg2}20; padding: 4px; border-radius: 10px; `;

const LoadingArea = styled.div` padding: 100px; text-align: center; font-size: 16px; font-weight: 700; color: ${({ theme }) => theme.primary}; `;
const ErrorArea = styled.div` padding: 40px; text-align: center; color: #dc3545; background: #dc354510; border-radius: 12px; `;
const DataArea = styled.div` min-height: 400px; `;

const ProcessingOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
  z-index: 3000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  color: white; font-weight: 800; font-size: 18px;
`;

const Spinner = styled.div`
  width: 60px; height: 60px; border: 6px solid rgba(255,255,255,0.2); 
  border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;
`;

export default OrdersVisualization;
