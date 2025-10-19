// src/components/templates/TraspasoManagement.jsx - VERSIÓN COMPLETA
import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { useAuth, usePermissions, useNotification, usePagination, useDebounce, useTransferManagement } from "../../index";


// 🔄 Componentes - Importaciones directas para evitar conflictos
import { TraspasoFiltersPanel, TraspasoTrackingTable, NotificationContainer} from "../../index";

// 🔄 Iconos
import { FaHistory, FaSync, FaExclamationCircle } from "react-icons/fa";

// 🔄 Styled Components siguiendo tu patrón de LoadsManagement
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

const LoadsButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  white-space: nowrap;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  ${({ variant = "primary" }) => {
    const variants = {
      primary: `
        background: #3b82f6;
        color: white;
        &:hover:not(:disabled) { background: #2563eb; }
        &:active { background: #1d4ed8; }
      `,
      secondary: `
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        &:hover:not(:disabled) {
          background: #e5e7eb;
          border-color: #9ca3af;
        }
        &:active { background: #d1d5db; }
      `,
      danger: `
        background: #ef4444;
        color: white;
        &:hover:not(:disabled) { background: #dc2626; }
        &:active { background: #b91c1c; }
      `,
      warning: `
        background: #f59e0b;
        color: white;
        &:hover:not(:disabled) { background: #d97706; }
        &:active { background: #b45309; }
      `,
      success: `
        background: #10b981;
        color: white;
        &:hover:not(:disabled) { background: #059669; }
        &:active { background: #047857; }
      `,
    };
    return variants[variant];
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ loading }) =>
    loading &&
    `
    pointer-events: none;
    opacity: 0.7;
    position: relative;

    &:before {
      content: "";
      position: absolute;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}
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

export function TraspasoManagement() {
  // 🔄 Hooks base siguiendo tu patrón de LoadsManagement
  const { accessToken, user } = useAuth();
  const { hasPermission } = usePermissions();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  // Estados principales siguiendo tu patrón
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Estados para filtros siguiendo tu patrón exacto de LoadsManagement
  const [filters, setFilters] = useState({
    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    sourceWarehouse: "all",
    targetWarehouse: "all",
    loadId: "",
  });

  // 🔄 Verificar permisos siguiendo tu patrón exacto
  const canRead = hasPermission("loads", "read");
  const canCreate = hasPermission("loads", "create");
  const canUpdate = hasPermission("loads", "update");
  const canManage = hasPermission("loads", "manage");

  // Debounce de filtros
  const debouncedFilters = useDebounce(filters, 500);

  // 🔄 Hook especializado para traspasos
  const {
    transfers,
    totalRecords,
    loading,
    error: transferError,
    stats,
    warehouses,
    selectedTransfers,
    fetchTransfers,
    fetchStats,
    fetchWarehouses,
    executeTransfer,
    executeBulkTransfers,
    handleSelectTransfer,
    handleSelectAll,
    setSelectedTransfers,
  } = useTransferManagement(hasSearched ? filters : {});

  // Paginación
  const { currentPage, totalPages, setTotalPages, goToPage, resetToFirstPage } =
    usePagination();

  // 🔄 Funciones principales siguiendo tu patrón exacto de LoadsManagement
  const handleSearch = useCallback(() => {
    if (!canRead) {
      showWarning("No tienes permisos para ver traspasos");
      return;
    }

    resetToFirstPage();
    setHasSearched(true);
    setError(null);

    // 🔄 Fetch manual siguiendo tu patrón
    Promise.all([fetchTransfers(), fetchStats()])
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
    fetchTransfers,
    fetchStats,
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
      sourceWarehouse: "all",
      targetWarehouse: "all",
      loadId: "",
    });
    setHasSearched(false);
    setSelectedTransfers([]);
    setError(null);
    showInfo("Filtros restablecidos");
  }, [setSelectedTransfers, showInfo]);

  const handleRefresh = useCallback(() => {
    if (!hasSearched) return;

    Promise.all([fetchTransfers(), fetchStats()])
      .then(() => {
        setLastRefresh(new Date());
        showSuccess("Datos actualizados");
      })
      .catch((err) => {
        console.error("Error al actualizar traspasos:", err);
        showError("Error al actualizar datos");
      });
  }, [hasSearched, fetchTransfers, fetchStats, showSuccess, showError]);

  // 🔄 Manejadores de acciones siguiendo tu patrón
  const handleExecuteTransfer = useCallback(
    async (transfer) => {
      if (!canCreate) {
        showError("No tienes permisos para ejecutar traspasos");
        return;
      }

      try {
        await executeTransfer(transfer.loadId);
        // El hook ya maneja las notificaciones y refresh
        setLastRefresh(new Date());
      } catch (error) {
        // Error ya manejado en el hook
        console.error("Error executing transfer:", error);
      }
    },
    [canCreate, executeTransfer, showError]
  );

  const handleBulkExecute = useCallback(
    async (selectedIds) => {
      if (!canCreate) {
        showError("No tienes permisos para ejecutar traspasos");
        return;
      }

      try {
        const pendingIds = selectedIds.filter((id) => {
          const transfer = transfers.find((t) => t.loadId === id);
          return transfer && ["PENDING", "ERROR"].includes(transfer.status);
        });

        if (pendingIds.length === 0) {
          showWarning("No hay traspasos ejecutables seleccionados");
          return;
        }

        await executeBulkTransfers(pendingIds);
        // El hook ya maneja la limpieza de selección y refresh
        setLastRefresh(new Date());
      } catch (error) {
        // Error ya manejado en el hook
        console.error("Error in bulk execution:", error);
      }
    },
    [canCreate, transfers, executeBulkTransfers, showError, showWarning]
  );

  const handleViewDetails = useCallback(
    (transfer) => {
      console.log("Viewing transfer details:", transfer);
      showInfo(`Mostrando detalles del traspaso ${transfer.loadId}`);
      // 🔄 Aquí podrías implementar navegación o modal como en tu LoadsManagement
      // setSelectedOrderForDetails(transfer);
      // setShowDetailsModal(true);
    },
    [showInfo]
  );

  // 🔄 useEffect para cargar warehouses siguiendo tu patrón
  useEffect(() => {
    if (canRead) {
      fetchWarehouses().catch((err) => {
        console.error("Error loading warehouses:", err);
        showError("Error al cargar bodegas");
      });
    }
  }, [canRead, fetchWarehouses, showError]);

  // 🔄 useEffect para actualizar paginación
  useEffect(() => {
    if (totalRecords > 0) {
      setTotalPages(Math.ceil(totalRecords / 20));
    }
  }, [totalRecords, setTotalPages]);

  // 🔄 useEffect para manejar errores
  useEffect(() => {
    if (transferError) {
      setError(transferError.message || "Error en el sistema de traspasos");
    }
  }, [transferError]);

  // 🔄 Función para formatear moneda siguiendo tu patrón
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount || 0);
  }, []);

  // Datos computados para estadísticas
  const pendingCount = useMemo(() => {
    return transfers.filter((t) => t.status === "PENDING").length;
  }, [transfers]);

  const processingCount = useMemo(() => {
    return transfers.filter((t) => t.status === "PROCESSING").length;
  }, [transfers]);

  // 🔄 Verificar acceso siguiendo tu patrón exacto
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

        {/* 🔔 Contenedor de notificaciones */}
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
        {/* 🔄 Mostrar errores siguiendo tu patrón */}
        {error && (
          <AlertMessage type="error">
            <div className="alert-content">
              <FaExclamationCircle className="alert-icon" />
              <span className="alert-message">{error}</span>
            </div>
            <button onClick={() => setError(null)}>×</button>
          </AlertMessage>
        )}

        {/* 🔄 Estadísticas siguiendo tu patrón exacto de LoadsManagement */}
        <StatsGrid>
          <StatCard>
            <h3>Pendientes</h3>
            <p className="value" style={{ color: "#f59e0b" }}>
              {stats.pending || 0}
              <span className="icon">⏳</span>
            </p>
            {pendingCount > 0 && (
              <p className="change neutral">
                {pendingCount} en la tabla actual
              </p>
            )}
          </StatCard>

          <StatCard>
            <h3>Procesando</h3>
            <p className="value" style={{ color: "#3b82f6" }}>
              {stats.processing || 0}
              <span className="icon">🔄</span>
            </p>
            {processingCount > 0 && (
              <p className="change positive">{processingCount} en progreso</p>
            )}
          </StatCard>

          <StatCard>
            <h3>Completados</h3>
            <p className="value" style={{ color: "#10b981" }}>
              {stats.completed || 0}
              <span className="icon">✅</span>
            </p>
          </StatCard>

          <StatCard>
            <h3>Valor Total</h3>
            <p className="value" style={{ color: "#6366f1" }}>
              {formatCurrency(stats.totalValue)}
              <span className="icon">💰</span>
            </p>
          </StatCard>
        </StatsGrid>

        {/* 🔄 Patrón de búsqueda siguiendo LoadsManagement EXACTO */}
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
              warehouses={warehouses}
              loadOptions={[]} // Para futuras implementaciones
            />

            <TraspasoTrackingTable
              transfers={transfers}
              loading={loading}
              onExecuteTransfer={handleExecuteTransfer}
              onViewDetails={handleViewDetails}
              onRefresh={handleRefresh}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={goToPage}
              filters={filters}
              selectedTransfers={selectedTransfers}
              onSelectTransfer={handleSelectTransfer}
              onSelectAll={handleSelectAll}
              onBulkExecute={handleBulkExecute}
            />
          </>
        )}
      </ContentArea>
    </Container>
  );
}
