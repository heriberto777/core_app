import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";
import { FaSync, FaHistory, FaCheckDouble } from "react-icons/fa";
import {
  useAuth,
  usePermissions,
  useTransferManagement,
  useNotification,
  Header,
  Button,
  TraspasoStatsGrid,
  TraspasoFiltersPanel,
  TraspasoTrackingTable,
  NotificationContainer
} from "../../index";

const Container = styled.div`
  min-height: 100vh;
  padding: 24px;
  background: #f8fafc;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const HeaderInfo = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
`;

const Description = styled.p`
  margin: 0;
  font-size: 15px;
  opacity: 0.7;
  line-height: 1.6;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const BulkActionBanner = styled.div`
  background: #3b82f6;
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.2);
  animation: slideIn 0.3s ease;

  @keyframes slideIn {
    from { transform: translateY(-10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

export function TraspasoManagement() {
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const { showSuccess, showError, showInfo } = useNotification();
  
  const canExecuteTraspaso = hasPermission("loads", "execute") || hasPermission("loads", "create") || isAdmin;
  const canReadTraspaso = hasPermission("loads", "read") || isAdmin;

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
      // Necesitamos extraer los load_ids para la ejecución masiva basado en los IDs seleccionados
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
        // Lógica de navegación o modal de detalles aquí
      }
    } finally {
      setSingleActionStates(prev => ({ ...prev, [id]: null }));
    }
  };

  return (
    <>
      <Helmet>
        <title>Auditoría de Traspasos | Core App</title>
      </Helmet>

      <Container>
        <PageHeader>
          <HeaderInfo>
            <Title>Gestión de Traspasos</Title>
            <Description>
              Monitoreo y ejecución de transferencias de inventario entre bodegas.
              Supervisa el éxito de los procesos post-carga y gestiona discrepancias.
            </Description>
          </HeaderInfo>
          <HeaderActions>
            <Button variant="outline" onClick={() => window.location.href = "/loads"}>
              <FaHistory /> Historial de Cargas
            </Button>
            <Button variant="primary" onClick={handleRefresh} loading={refreshing}>
              <FaSync /> Actualizar
            </Button>
          </HeaderActions>
        </PageHeader>

        <TraspasoStatsGrid stats={stats} loading={loading} />

        <TraspasoFiltersPanel
          filters={filters}
          onFiltersChange={setFilters}
          onReset={actions.resetFilters}
          onSearch={handleSearch}
          loading={loading}
          metadata={metadata}
        />

        {selectedItems.length > 0 && (
          <BulkActionBanner>
            <div>
              <FaCheckDouble style={{ marginRight: '12px' }} />
              <strong>{selectedItems.length}</strong> traspasos seleccionados
            </div>
            <Button variant="primary" size="small" loading={isProcessingAction} onClick={handleBulkExecute}>
              Ejecutar Seleccionados
            </Button>
          </BulkActionBanner>
        )}

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

        <NotificationContainer />
      </Container>
    </>
  );
}