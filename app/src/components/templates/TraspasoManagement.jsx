// src/components/templates/TraspasoManagement.jsx - VERSIÓN SIGUIENDO TU ESTRUCTURA
import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import {
  useAuth,
  usePermissions,
  useNotification,
  usePagination,
  useDebounce,
  useTransferManagement,
  Header,
  LoadsButton,
  StatusBadge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  GridContainer,
  NotificationContainer
} from "../../index";

// Iconos
import {
  FaHistory,
  FaSync,
  FaExclamationCircle,
  FaEye,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaSpinner,
  FaRedo,
  FaChartBar
} from "react-icons/fa";

// Styled Components siguiendo tu patrón exacto
const Container = styled.div`
  min-height: 100vh;
  background-color: #f8fafc;
  position: relative;
`;

const PageHeader = styled.div`
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 24px;
  margin-bottom: 24px;
`;

const HeaderInfo = styled.div`
  margin-bottom: 16px;
`;

const PageTitle = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 8px 0;
`;

const PageDescription = styled.p`
  color: #6b7280;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const ContentArea = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px 24px;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .value {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .change {
    font-size: 12px;
    font-weight: 500;
    margin-top: 4px;

    &.positive {
      color: #10b981;
    }
    &.negative {
      color: #ef4444;
    }
    &.neutral {
      color: #6b7280;
    }
  }

  .icon {
    font-size: 16px;
    opacity: 0.7;
  }
`;

const NoDataMessage = styled.div`
  background: white;
  padding: 48px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  h3 {
    margin: 0 0 12px 0;
    color: #374151;
    font-size: 18px;
    font-weight: 600;
  }

  p {
    margin: 0 0 24px 0;
    color: #6b7280;
    font-size: 14px;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.5;
  }
`;

const AlertMessage = styled.div`
  background: ${({ type }) => {
    const backgrounds = {
      error: "#fef2f2",
      warning: "#fffbeb",
      success: "#f0fdf4",
      info: "#eff6ff",
    };
    return backgrounds[type] || backgrounds.info;
  }};
  border: 1px solid
    ${({ type }) => {
      const borders = {
        error: "#fecaca",
        warning: "#fed7aa",
        success: "#bbf7d0",
        info: "#bfdbfe",
      };
      return borders[type] || borders.info;
    }};
  color: ${({ type }) => {
    const colors = {
      error: "#991b1b",
      warning: "#92400e",
      success: "#166534",
      info: "#1e40af",
    };
    return colors[type] || colors.info;
  }};
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .alert-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .alert-icon {
    font-size: 16px;
  }

  .alert-message {
    font-size: 14px;
    font-weight: 500;
  }

  button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    margin-left: 12px;
    opacity: 0.7;

    &:hover {
      opacity: 1;
    }
  }
`;

const RefreshInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;

  .timestamp {
    font-weight: 500;
  }
`;

// Componente TraspasoFiltersPanel
const TraspasoFiltersPanel = ({
  filters,
  onFiltersChange,
  onReset,
  onSearch,
  loading,
  deliveryPersons = []
}) => (
  <Card style={{ marginBottom: '24px' }}>
    <CardHeader>
      <CardTitle>Filtros de Búsqueda</CardTitle>
    </CardHeader>
    <CardContent>
      <GridContainer columns={3} gap="16px">
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
            Buscar Load ID:
          </label>
          <input
            type="text"
            placeholder="Buscar por Load ID..."
            value={filters.loadId}
            onChange={(e) => onFiltersChange({ loadId: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
            Estado:
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange({ status: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="all">Todos los estados</option>
            <option value="completed">Completados</option>
            <option value="failed">Fallidos</option>
            <option value="pending">Pendientes</option>
            <option value="processing">Procesando</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
            Repartidor:
          </label>
          <select
            value={filters.deliveryPerson}
            onChange={(e) => onFiltersChange({ deliveryPerson: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="all">Todos los repartidores</option>
            {deliveryPersons.map(person => (
              <option key={person.code} value={person.code}>
                {person.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
            Fecha desde:
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
            Fecha hasta:
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>
      </GridContainer>
    </CardContent>
    <CardFooter>
      <LoadsButton variant="secondary" onClick={onReset}>
        <FaRedo /> Limpiar filtros
      </LoadsButton>
      <LoadsButton variant="primary" onClick={onSearch} loading={loading}>
        <FaSync /> Buscar Traspasos
      </LoadsButton>
    </CardFooter>
  </Card>
);

// Componente TraspasoTrackingTable
const TraspasoTrackingTable = ({
  transfers = [],
  loading,
  onViewDetails,
  pagination = {}
}) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <FaCheckCircle style={{ color: '#28a745' }} />;
      case 'failed':
        return <FaTimesCircle style={{ color: '#dc3545' }} />;
      case 'processing':
        return <FaSpinner style={{ color: '#007bff' }} />;
      default:
        return <FaClock style={{ color: '#ffc107' }} />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Traspasos ({transfers.length})</CardTitle>
      </CardHeader>
      <CardContent style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <FaSpinner className="spinning" style={{ fontSize: '24px', marginBottom: '16px' }} />
            <p>Cargando traspasos...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <FaExclamationCircle style={{ fontSize: '48px', opacity: 0.5, marginBottom: '16px' }} />
            <h3>No hay traspasos</h3>
            <p>No se encontraron traspasos con los filtros aplicados.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Estado</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Load ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Repartidor</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Documento</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Productos</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Éxito</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Fecha</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(traspaso => (
                  <tr
                    key={traspaso.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      '&:hover': { backgroundColor: '#f8fafc' }
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getStatusIcon(traspaso.status)}
                        <StatusBadge variant={traspaso.status}>
                          {traspaso.status_description || traspaso.status}
                        </StatusBadge>
                        {traspaso.is_return === 1 && (
                          <span style={{
                            background: '#e74c3c',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px'
                          }}>
                            DEV
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <code style={{
                        background: '#f3f4f6',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}>
                        {traspaso.load_id}
                      </code>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div>
                        <strong>{traspaso.delivery_person_code}</strong>
                        <br />
                        <small style={{ color: '#6b7280' }}>
                          {traspaso.delivery_person_name}
                        </small>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <code style={{ color: '#3b82f6', fontSize: '13px' }}>
                        {traspaso.documento_generated}
                      </code>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                        <div>Total: {traspaso.total_products}</div>
                        <div style={{ color: '#10b981' }}>Exitosos: {traspaso.lines_successful}</div>
                        {traspaso.lines_failed > 0 && (
                          <div style={{ color: '#dc3545' }}>
                            Fallidos: {traspaso.lines_failed}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        color: traspaso.success_percentage >= 80 ? '#27ae60' :
                               traspaso.success_percentage >= 50 ? '#f39c12' : '#e74c3c',
                        fontWeight: 'bold'
                      }}>
                        {traspaso.success_percentage || 0}%
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                        {new Date(traspaso.created_at).toLocaleDateString()}
                        <br />
                        <small style={{ color: '#6b7280' }}>
                          {new Date(traspaso.created_at).toLocaleTimeString()}
                        </small>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <LoadsButton
                        variant="primary"
                        size="small"
                        onClick={() => onViewDetails(traspaso.id)}
                      >
                        <FaEye /> Ver
                      </LoadsButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {pagination && pagination.totalPages > 1 && (
        <CardFooter>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%'
          }}>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>
              Página {pagination.currentPage} de {pagination.totalPages}
              ({pagination.totalItems} traspasos)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <LoadsButton
                variant="secondary"
                size="small"
                disabled={!pagination.hasPrevPage}
              >
                Anterior
              </LoadsButton>
              <LoadsButton
                variant="secondary"
                size="small"
                disabled={!pagination.hasNextPage}
              >
                Siguiente
              </LoadsButton>
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export function TraspasoManagement() {
  // Hooks base siguiendo tu patrón exacto
  const { accessToken, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  // Estados principales siguiendo tu patrón
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Estados para filtros siguiendo tu patrón exacto
  const [filters, setFilters] = useState({
    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    deliveryPerson: "all",
    loadId: "",
    page: 1,
    limit: 20,
  });

  // Verificar permisos siguiendo tu patrón exacto
  const canRead = hasPermission("loads", "read");
  const canCreate = hasPermission("loads", "create");
  const canUpdate = hasPermission("loads", "update");
  const canManage = hasPermission("loads", "manage");

  // Debounce de filtros
  const debouncedFilters = useDebounce(filters, 500);

  // Hook especializado para traspasos
  const {
    loading,
    error: transferError,
    traspasos,
    traspasoStats,
    deliveryPersonsFilter,
    selectedTraspaso,
    traspasosPagination,
    fetchTraspasos,
    fetchTraspasoStats,
    fetchDeliveryPersonsFilter,
    fetchTraspasoDetails,
    clearSelectedTraspaso,
  } = useTransferManagement();

  // Paginación
  const { currentPage, totalPages, setTotalPages, goToPage, resetToFirstPage } =
    usePagination();

  // Funciones principales siguiendo tu patrón exacto
  const handleSearch = useCallback(() => {
    if (!canRead) {
      showWarning("No tienes permisos para ver traspasos");
      return;
    }

    resetToFirstPage();
    setHasSearched(true);
    setError(null);

    // Fetch manual siguiendo tu patrón
    Promise.all([fetchTraspasos(filters), fetchTraspasoStats(filters)])
      .then(() => {
        setLastRefresh(new Date());
        showInfo("Traspasos actualizados");
      })
      .catch((err) => {
        console.error("Error en búsqueda de traspasos:", err);
        setError(err.message || "Error al buscar traspasos");
        showError(`Error al buscar traspasos: ${err.message}`);
      });
  }, [
    canRead,
    resetToFirstPage,
    fetchTraspasos,
    fetchTraspasoStats,
    filters,
    showWarning,
    showInfo,
    showError,
  ]);

  const handleFiltersChange = useCallback((newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleReset = useCallback(() => {
    setFilters({
      dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
        .toISOString()
        .split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      status: "all",
      deliveryPerson: "all",
      loadId: "",
      page: 1,
      limit: 20,
    });
    setHasSearched(false);
    setError(null);
    showInfo("Filtros restablecidos");
  }, [showInfo]);

  const handleRefresh = useCallback(() => {
    if (!hasSearched) return;

    Promise.all([fetchTraspasos(filters), fetchTraspasoStats(filters)])
      .then(() => {
        setLastRefresh(new Date());
        showSuccess("Datos actualizados");
      })
      .catch((err) => {
        console.error("Error al actualizar traspasos:", err);
        showError("Error al actualizar datos");
      });
  }, [hasSearched, fetchTraspasos, fetchTraspasoStats, filters, showSuccess, showError]);

  const handleViewDetails = useCallback(
    async (traspasoId) => {
      const details = await fetchTraspasoDetails(traspasoId);
      if (details) {
        showInfo(`Mostrando detalles del traspaso ${details.load_id}`);
        // Aquí podrías implementar navegación o modal
      }
    },
    [fetchTraspasoDetails, showInfo]
  );

  // useEffect para cargar delivery persons siguiendo tu patrón
  useEffect(() => {
    if (canRead) {
      fetchDeliveryPersonsFilter().catch((err) => {
        console.error("Error loading delivery persons:", err);
        showError("Error al cargar repartidores");
      });
    }
  }, [canRead, fetchDeliveryPersonsFilter, showError]);

  // useEffect para actualizar paginación
  useEffect(() => {
    if (traspasosPagination?.totalItems > 0) {
      setTotalPages(traspasosPagination.totalPages);
    }
  }, [traspasosPagination, setTotalPages]);

  // useEffect para manejar errores
  useEffect(() => {
    if (transferError) {
      setError(transferError.message || "Error en el sistema de traspasos");
    }
  }, [transferError]);

  // Verificar acceso siguiendo tu patrón exacto
  if (!canRead) {
    return (
      <Container>
        <ContentArea>
          <AlertMessage type="error">
            <div className="alert-content">
              <FaExclamationCircle className="alert-icon" />
              <span className="alert-message">
                No tienes permisos para acceder a esta sección
              </span>
            </div>
          </AlertMessage>
          <NoDataMessage>
            <div className="icon">🔒</div>
            <h3>Acceso Denegado</h3>
            <p>
              Necesitas permisos de lectura para el módulo de cargas para
              acceder a la gestión de traspasos.
            </p>
            <LoadsButton
              variant="secondary"
              onClick={() => (window.location.href = "/dashboard")}
            >
              Volver al Dashboard
            </LoadsButton>
          </NoDataMessage>
        </ContentArea>

        <NotificationContainer />
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader>
        <HeaderInfo>
          <PageTitle>Gestión de Traspasos</PageTitle>
          <PageDescription>
            Controla y gestiona los traspasos de inventario entre bodegas del
            sistema. Ejecuta, monitorea y supervisa todas las transferencias
            automáticas generadas después del procesamiento de cargas.
          </PageDescription>
        </HeaderInfo>
        <HeaderActions>
          {canManage && (
            <LoadsButton
              variant="secondary"
              onClick={() => (window.location.href = "/loads")}
            >
              <FaHistory /> Gestión de Cargas
            </LoadsButton>
          )}

          <RefreshInfo>
            <span>Última actualización:</span>
            <span className="timestamp">
              {lastRefresh.toLocaleTimeString("es-DO")}
            </span>
          </RefreshInfo>

          <LoadsButton
            variant="primary"
            onClick={handleRefresh}
            loading={loading}
            disabled={!hasSearched}
          >
            <FaSync /> Actualizar
          </LoadsButton>
        </HeaderActions>
      </PageHeader>

      <ContentArea>
        {/* Mostrar errores siguiendo tu patrón */}
        {error && (
          <AlertMessage type="error">
            <div className="alert-content">
              <FaExclamationCircle className="alert-icon" />
              <span className="alert-message">{error}</span>
            </div>
            <button onClick={() => setError(null)}>×</button>
          </AlertMessage>
        )}

        {/* Estadísticas siguiendo tu patrón exacto */}
        <StatsGrid>
          <StatCard>
            <h3>Pendientes</h3>
            <p className="value" style={{ color: "#f59e0b" }}>
              {traspasoStats.pending || 0}
               <span className="icon">⏳</span>
            </p>
          </StatCard>

          <StatCard>
            <h3>Procesando</h3>
            <p className="value" style={{ color: "#3b82f6" }}>
              {traspasoStats.processing || 0}
              <span className="icon">🔄</span>
            </p>
          </StatCard>

          <StatCard>
            <h3>Completados</h3>
            <p className="value" style={{ color: "#10b981" }}>
              {traspasoStats.completed || 0}
              <span className="icon">✅</span>
            </p>
          </StatCard>

          <StatCard>
            <h3>Fallidos</h3>
            <p className="value" style={{ color: "#ef4444" }}>
              {traspasoStats.failed || 0}
              <span className="icon">❌</span>
            </p>
          </StatCard>
        </StatsGrid>

        {/* Patrón de búsqueda siguiendo LoadsManagement EXACTO */}
        {!hasSearched ? (
          <NoDataMessage>
            <div className="icon">🔍</div>
            <h3>Bienvenido a la Gestión de Traspasos</h3>
            <p>
              Usa los filtros y haz clic en "Buscar" para ver los traspasos
              pendientes y el historial de transferencias entre bodegas. Los
              traspasos se generan automáticamente cuando se procesan las
              cargas.
            </p>
            <LoadsButton
              variant="primary"
              onClick={handleSearch}
              loading={loading}
            >
              <FaSync /> Buscar Traspasos
            </LoadsButton>
          </NoDataMessage>
        ) : (
          <>
            <TraspasoFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onReset={handleReset}
              onSearch={handleSearch}
              loading={loading}
              deliveryPersons={deliveryPersonsFilter}
            />

            <TraspasoTrackingTable
              transfers={traspasos}
              loading={loading}
              onViewDetails={handleViewDetails}
              pagination={traspasosPagination}
            />
          </>
        )}
      </ContentArea>

      {/* Contenedor de notificaciones */}
      <NotificationContainer />
    </Container>
  );
}

export default TraspasoManagement;