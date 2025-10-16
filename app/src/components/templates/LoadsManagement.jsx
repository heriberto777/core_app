import styled from "styled-components";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Header,
  useAuth,
  useFetchData,
  usePermissions,
  DeliveryPersonSelector,
  OrderDetailsModal,
  OrdersList,
  FiltersPanel,
  LoadsButton,
  StatusBadge,
  LoadsApi,
} from "../../index";

import {
  FaPlus,
  FaHistory,
  FaSync,
  FaTruck,
  FaExclamationTriangle,
  FaCheckCircle
} from "react-icons/fa";
import Swal from "sweetalert2";
import { Helmet } from "react-helmet-async";

const loadsApi = new LoadsApi();

const Container = styled.div`
  min-height: 100vh;
  padding: 20px;
  background-color: ${props => props.theme.bg};
  color: ${props => props.theme.text};

  @media (max-width: 768px) {
    padding: 15px;
  }

  @media (max-width: 480px) {
    padding: 10px;
  }
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
  }
`;

const HeaderInfo = styled.div`
  flex: 1;
`;

const PageTitle = styled.h1`
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
  color: ${props => props.theme.text};

  @media (max-width: 768px) {
    font-size: 24px;
    margin-bottom: 6px;
  }

  @media (max-width: 480px) {
    font-size: 22px;
  }
`;

const PageDescription = styled.p`
  margin: 0;
  font-size: 16px;
  color: ${props => props.theme.textSecondary};
  line-height: 1.5;

  @media (max-width: 768px) {
    font-size: 15px;
  }

  @media (max-width: 480px) {
    font-size: 14px;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: stretch;

    & > * {
      flex: 1;
    }
  }

  @media (max-width: 480px) {
    flex-direction: column;
    gap: 8px;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
`;

const StatCard = styled.div`
  background: ${props => props.theme.cardBg};
  border: 1px solid ${props => props.theme.border};
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 768px) {
    padding: 16px;
  }

  @media (max-width: 480px) {
    padding: 12px;
  }
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${props => props.color || props.theme.primary};
  margin-bottom: 4px;

  @media (max-width: 768px) {
    font-size: 20px;
  }

  @media (max-width: 480px) {
    font-size: 18px;
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${props => props.theme.textSecondary};
  font-weight: 500;

  @media (max-width: 768px) {
    font-size: 13px;
  }

  @media (max-width: 480px) {
    font-size: 12px;
  }
`;

const ContentArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;

  @media (max-width: 768px) {
    gap: 16px;
  }
`;

const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  color: white;
  font-size: 16px;
`;

export function LoadsManagement() {
  const { accessToken, user } = useAuth();
  const { hasPermission } = usePermissions();

  // Estados principales
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeliverySelector, setShowDeliverySelector] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Estados para filtros
  const [filters, setFilters] = useState({
    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    seller: 'all',
    transferStatus: 'all',
    includeLoaded: false
  });

  // Verificar permisos
  const canRead = hasPermission('loads', 'read');
  const canCreate = hasPermission('loads', 'create');
  const canUpdate = hasPermission('loads', 'update');
  const canManage = hasPermission('loads', 'manage');

  // Callbacks para fetch
  const fetchOrdersCallback = useCallback(async () => {
    if (!canRead) return { data: [], totalRecords: 0 };
    return await loadsApi.getPendingOrders(accessToken, filters);
  }, [accessToken, filters, canRead]);

  const fetchSellersCallback = useCallback(async () => {
    if (!canRead) return { data: [] };
    return await loadsApi.getSellers(accessToken);
  }, [accessToken, canRead]);

  const fetchDeliveryPersonsCallback = useCallback(async () => {
    if (!canRead) return { data: [] };
    return await loadsApi.getDeliveryPersons(accessToken);
  }, [accessToken, canRead]);

  // Fetch de datos
  const {
    data: ordersResponse,
    loading: ordersLoading,
    error: ordersError,
    refetch: fetchOrders
  } = useFetchData(fetchOrdersCallback, [accessToken, filters], {
    autoRefresh: true,
    refreshInterval: 30000,
    enableCache: true,
    cacheTime: 60000,
    initialData: { data: [], totalRecords: 0 }
  });

  const {
    data: sellersResponse,
    loading: sellersLoading
  } = useFetchData(fetchSellersCallback, [accessToken], {
    enableCache: true,
    cacheTime: 300000,
    initialData: { data: [] }
  });

  const {
    data: deliveryPersonsResponse,
    loading: deliveryPersonsLoading,
    refetch: fetchDeliveryPersons
  } = useFetchData(fetchDeliveryPersonsCallback, [accessToken], {
    enableCache: true,
    cacheTime: 300000,
    initialData: { data: [] }
  });

  // Datos procesados
  const orders = ordersResponse?.data || [];
  const sellers = sellersResponse?.data || [];
  const deliveryPersons = deliveryPersonsResponse?.data || [];

  // Filtrar órdenes por búsqueda
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;

    const searchLower = search.toLowerCase();
    return orders.filter(order =>
      order.pedido.toString().includes(searchLower) ||
      order.cliente.toLowerCase().includes(searchLower) ||
      order.nombreVendedor.toLowerCase().includes(searchLower)
    );
  }, [orders, search]);

  // Estadísticas
  const stats = useMemo(() => {
    const pending = filteredOrders.filter(o => o.transferStatus === 'pending').length;
    const processing = filteredOrders.filter(o => o.transferStatus === 'processing').length;
    const completed = filteredOrders.filter(o => o.transferStatus === 'completed').length;
    const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.totalPedido || 0), 0);

    return { pending, processing, completed, totalAmount, total: filteredOrders.length };
  }, [filteredOrders]);

  // Manejadores de eventos
  const handleOrderSelect = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = (orderIds) => {
    setSelectedOrders(orderIds);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setSelectedOrders([]); // Limpiar selección al cambiar filtros
  };

  const handleReset = () => {
    setFilters({
      dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
        .toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      seller: 'all',
      transferStatus: 'all',
      includeLoaded: false
    });
    setSearch("");
    setSelectedOrders([]);
  };

  const handleViewOrder = async (orderId) => {
    try {
      setSelectedOrderForDetails(orderId);
      setOrderDetails([]);
      setShowDetailsModal(true);

      const response = await loadsApi.getOrderDetails(accessToken, orderId);
      if (response.success) {
        setOrderDetails(response.data);
      }
    } catch (error) {
      console.error('Error al cargar detalles:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar los detalles del pedido'
      });
    }
  };

  const handleEditOrder = (orderId) => {
    handleViewOrder(orderId);
  };

  const handleCancelOrder = async (orderId) => {
    const result = await Swal.fire({
      title: '¿Cancelar pedido?',
      text: `¿Estás seguro de que deseas cancelar el pedido #${orderId}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No'
    });

    if (result.isConfirmed) {
      try {
        setProcessing(true);
        await loadsApi.cancelOrders(accessToken, [orderId], 'Cancelado manualmente');

        Swal.fire({
          icon: 'success',
          title: 'Pedido cancelado',
          text: 'El pedido ha sido cancelado correctamente',
          timer: 2000
        });

        fetchOrders();
        setSelectedOrders(prev => prev.filter(id => id !== orderId));
      } catch (error) {
        console.error('Error al cancelar pedido:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'No se pudo cancelar el pedido'
        });
      } finally {
        setProcessing(false);
      }
    }
  };

  const handleLoadOrder = (orderId) => {
    setSelectedOrders([orderId]);
    setShowDeliverySelector(true);
  };

  const handleBulkLoad = (orderIds) => {
    setSelectedOrders(orderIds);
    setShowDeliverySelector(true);
  };

  const handleBulkCancel = async (orderIds) => {
    const result = await Swal.fire({
      title: '¿Cancelar pedidos?',
      text: `¿Estás seguro de que deseas cancelar ${orderIds.length} pedidos seleccionados?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, cancelar todos',
      cancelButtonText: 'No'
    });

    if (result.isConfirmed) {
      try {
        setProcessing(true);
        await loadsApi.cancelOrders(accessToken, orderIds, 'Cancelación masiva');

        Swal.fire({
          icon: 'success',
          title: 'Pedidos cancelados',
          text: `${orderIds.length} pedidos han sido cancelados correctamente`,
          timer: 2000
        });

        fetchOrders();
        setSelectedOrders([]);
      } catch (error) {
        console.error('Error al cancelar pedidos:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'No se pudieron cancelar los pedidos'
        });
      } finally {
        setProcessing(false);
      }
    }
  };

  const handleDeliveryPersonSelect = async (deliveryPersonCode) => {
    try {
      setProcessing(true);
      setShowDeliverySelector(false);

      const response = await loadsApi.processOrderLoad(
        accessToken,
        selectedOrders,
        deliveryPersonCode
      );

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: '¡Carga procesada!',
          html: `
            <div style="text-align: left; margin: 16px 0;">
              <p><strong>Load ID:</strong> ${response.data.loadId}</p>
              <p><strong>Repartidor:</strong> ${response.data.deliveryPerson}</p>
              <p><strong>Bodega:</strong> ${response.data.warehouse}</p>
              <p><strong>Pedidos procesados:</strong> ${response.data.totalOrders}</p>
            </div>
          `,
          confirmButtonText: 'Entendido'
        });

        fetchOrders();
        setSelectedOrders([]);
      }
    } catch (error) {
      console.error('Error al procesar carga:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error al procesar carga',
        text: error.message || 'No se pudo procesar la carga'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateDeliveryPerson = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Repartidor',
      html: `
        <div style="text-align: left;">
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Código:</label>
            <input id="code" class="swal2-input" placeholder="Ej: REP001" style="margin: 0;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nombre:</label>
            <input id="name" class="swal2-input" placeholder="Nombre completo" style="margin: 0;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Bodega Asignada:</label>
            <input id="warehouse" class="swal2-input" placeholder="Código de bodega" style="margin: 0;">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const code = document.getElementById('code').value.trim();
        const name = document.getElementById('name').value.trim();
        const warehouse = document.getElementById('warehouse').value.trim();

        if (!code || !name || !warehouse) {
          Swal.showValidationMessage('Todos los campos son requeridos');
          return false;
        }

        return { code, name, assignedWarehouse: warehouse };
      }
    });

    if (formValues) {
      try {
        setProcessing(true);
        await loadsApi.createDeliveryPerson(accessToken, formValues);

        Swal.fire({
          icon: 'success',
          title: 'Repartidor creado',
          text: 'El repartidor ha sido creado correctamente',
          timer: 2000
        });

        fetchDeliveryPersons();
      } catch (error) {
        console.error('Error al crear repartidor:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.message || 'No se pudo crear el repartidor'
        });
      } finally {
        setProcessing(false);
      }
    }
  };

  const handleRemoveLines = async (linesToRemove) => {
    try {
      setProcessing(true);
      await loadsApi.removeOrderLines(accessToken, selectedOrderForDetails, linesToRemove);

      Swal.fire({
        icon: 'success',
        title: 'Líneas eliminadas',
        text: `${linesToRemove.length} líneas han sido eliminadas del pedido`,
        timer: 2000
      });

      // Recargar detalles
      const response = await loadsApi.getOrderDetails(accessToken, selectedOrderForDetails);
      if (response.success) {
        setOrderDetails(response.data);
      }

      fetchOrders();
    } catch (error) {
      console.error('Error al eliminar líneas:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudieron eliminar las líneas'
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // Verificar permisos
  if (!canRead) {
    return (
      <Container>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <FaExclamationTriangle size={48} color="#ef4444" />
          <h2>Acceso Denegado</h2>
          <p>No tienes permisos para acceder a la gestión de cargas.</p>
        </div>
      </Container>
    );
  }

  return (
    <>
      <Helmet>
        <title>Gestión de Cargas - Sistema ERP</title>
        <meta name="description" content="Gestión y procesamiento de cargas de pedidos" />
      </Helmet>

      <Header />

      <Container>
        <PageHeader>
          <HeaderInfo>
            <PageTitle>Gestión de Cargas</PageTitle>
            <PageDescription>
              Administra y procesa las cargas de pedidos pendientes.
              Selecciona pedidos, asigna repartidores y gestiona el proceso de distribución.
            </PageDescription>
          </HeaderInfo>
          <HeaderActions>
            {canManage && (
              <LoadsButton
                variant="secondary"
                onClick={() => window.location.href = '/loads/history'}
              >
                <FaHistory /> Historial
              </LoadsButton>
            )}
            <LoadsButton
              variant="primary"
              onClick={fetchOrders}
              loading={ordersLoading}
            >
              <FaSync /> Actualizar
            </LoadsButton>
          </HeaderActions>
        </PageHeader>

        <StatsGrid>
          <StatCard>
            <StatValue color="#f59e0b">{stats.pending}</StatValue>
            <StatLabel>Pendientes</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue color="#3b82f6">{stats.processing}</StatValue>
            <StatLabel>Procesando</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue color="#10b981">{stats.completed}</StatValue>
            <StatLabel>Completados</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue color="#6366f1">{formatCurrency(stats.totalAmount)}</StatValue>
            <StatLabel>Valor Total</StatLabel>
          </StatCard>
        </StatsGrid>

        <ContentArea>
          <FiltersPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleReset}
            onRefresh={fetchOrders}
            search={search}
            onSearchChange={setSearch}
            sellers={sellers}
            loading={ordersLoading}
          />

          <OrdersList
            orders={filteredOrders}
            selectedOrders={selectedOrders}
            onOrderSelect={handleOrderSelect}
            onSelectAll={handleSelectAll}
            onView={handleViewOrder}
            onEdit={canUpdate ? handleEditOrder : undefined}
            onCancel={canUpdate ? handleCancelOrder : undefined}
            onLoad={canCreate ? handleLoadOrder : undefined}
            onBulkLoad={canCreate ? handleBulkLoad : undefined}
            onBulkCancel={canUpdate ? handleBulkCancel : undefined}
            loading={ordersLoading}
          />
        </ContentArea>

        {/* Modales */}
        <OrderDetailsModal
          isOpen={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
          orderDetails={orderDetails}
          onRemoveLines={canUpdate ? handleRemoveLines : undefined}
          editable={canUpdate}
          loading={processing}
        />

        <DeliveryPersonSelector
          isOpen={showDeliverySelector}
          onClose={() => setShowDeliverySelector(false)}
          onSelect={handleDeliveryPersonSelect}
          selectedOrders={selectedOrders.map(id =>
            filteredOrders.find(order => order.pedido === id)
          ).filter(Boolean)}
          deliveryPersons={deliveryPersons}
          onCreateDeliveryPerson={canManage ? handleCreateDeliveryPerson : undefined}
          loading={processing}
        />

        {/* Overlay de procesamiento */}
        {processing && (
          <LoadingOverlay>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '12px' }}>Procesando...</div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>
                Por favor espera mientras se completa la operación
              </div>
            </div>
          </LoadingOverlay>
        )}
      </Container>
    </>
  );
}