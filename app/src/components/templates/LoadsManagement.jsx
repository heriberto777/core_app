import React, { useEffect } from "react";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";
import {
  FaSync,
  FaHistory,
  FaSearch,
  FaTruck,
  FaTimes,
  FaCheckCircle
} from "react-icons/fa";
import {
  useAuth,
  useLoadsManagement,
  usePermissions,
  useNotification,
  Header,
  Button,
  LoadsStatsGrid,
  FiltersPanel,
  OrdersList,
  OrderDetailsModal,
  DeliveryPersonSelector,
  NotificationContainer
} from "../../index";
import Swal from "sweetalert2";

const Container = styled.div`
  min-height: 100vh;
  padding: 24px;
  background: #f1f5f9;
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
  font-size: 32px;
  font-weight: 800;
`;

const Description = styled.p`
  margin: 0;
  font-size: 16px;
  opacity: 0.7;
  line-height: 1.6;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const BulkActionBanner = styled.div`
  background: #1e293b;
  color: white;
  padding: 16px 32px;
  border-radius: 16px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;

export function LoadsManagement() {
  const { accessToken } = useAuth();
  const { showSuccess, showError, showInfo, showWarning } = useNotification();
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
        text: "Por favor espere mientras se sincronizan los servidores y se genera el traspaso...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const res = await actions.processLoad(code);

      Swal.fire({
        icon: "success",
        title: "¡Carga Procesada!",
        html: `Se han despachado <b>${res.totalOrders}</b> pedidos con el Load ID: <b>${res.loadId || 'N/A'}</b>`,
        confirmButtonColor: "#3b82f6"
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error al procesar carga",
        text: err.message,
        confirmButtonColor: "#ef4444"
      });
    }
  };

  const handleBulkCancel = async () => {
    const result = await Swal.fire({
      title: "¿Anular pedidos seleccionados?",
      text: `Se cancelarán ${selectedOrders.length} pedidos. Esta acción es irreversible.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, anular todos",
      cancelButtonText: "No"
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
    <>
      <Helmet>
        <title>Despacho de Cargas | Core App</title>
      </Helmet>

      <Container>
        <PageHeader>
          <HeaderInfo>
            <Title>Despacho de Cargas</Title>
            <Description>
              Orquesta la logística de salida. Filtra pedidos pendientes,
              asigna repartidores y genera certificados de carga en segundos.
            </Description>
          </HeaderInfo>
          <HeaderActions>
            <Button variant="outline" onClick={() => window.location.href = "/loads/history"}>
              <FaHistory /> Historial
            </Button>
            <Button variant="primary" onClick={actions.fetchOrders} loading={refreshing}>
              <FaSync /> Sincronizar
            </Button>
          </HeaderActions>
        </PageHeader>

        <LoadsStatsGrid stats={stats} loading={loading} />

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

        {selectedOrders.length > 0 && canProcessLoad && (
          <BulkActionBanner>
            <div>
              <FaTruck style={{ marginRight: '12px' }} />
              <strong>{selectedOrders.length}</strong> pedidos listos para despacho
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button variant="outline" size="small" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }} onClick={handleBulkCancel}>
                <FaTimes /> Anular Seleccionados
              </Button>
              <Button variant="primary" size="small" onClick={handleBulkLoad} loading={isProcessing}>
                <FaCheckCircle /> Procesar Carga
              </Button>
            </div>
          </BulkActionBanner>
        )}

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

        {/* Modales */}
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

        <NotificationContainer />
      </Container>
    </>
  );
}