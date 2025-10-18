import styled from "styled-components";
import { useState, useEffect } from "react";
import { Header, useAuth} from "../../index";
import { TransferApi } from "../../api/index";
import {
  FaSync,
  FaFilter,
  FaDownload,
  FaSearch,
  FaExclamationTriangle,
  FaInfoCircle,
  FaExclamationCircle,
  FaCalendarAlt,
  FaTrashAlt,
  FaBug,
} from "react-icons/fa";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Instancia de la API
const cnnApi = new TransferApi();

export function LogsPage() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    level: "all",
    source: "all",
    dateFrom: null,
    dateTo: null,
    limit: 100,
    page: 1,
    search: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    pages: 1,
  });
  const [stats, setStats] = useState({
    totalLogs: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    debugCount: 0,
  });
  const [sources, setSources] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showLogDetail, setShowLogDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteOlderThan, setDeleteOlderThan] = useState(30);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cargar logs iniciales y fuentes disponibles
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Cargar fuentes disponibles para filtrado
        const sourcesResult = await cnnApi.getLogSources(accessToken);
        if (sourcesResult?.success && Array.isArray(sourcesResult.sources)) {
          setSources(sourcesResult.sources);
        }

        // Cargar resumen para dashboard
        const summaryResult = await cnnApi.getLogsSummary(accessToken);
        if (summaryResult?.success) {
          setSummary(summaryResult.summary);
        }

        // Cargar logs iniciales
        await fetchLogs();
      } catch (error) {
        console.error("Error al cargar datos iniciales:", error);
        setError(
          "No se pudieron cargar los datos iniciales. Por favor, intente de nuevo."
        );
      }
    };

    loadInitialData();
  }, [accessToken]);

  // Cargar logs cuando cambien los filtros
  useEffect(() => {
    fetchLogs();
  }, [accessToken, filters.level, filters.source, filters.limit, filters.page]);

  // Aplicar filtros de fecha con delay para evitar múltiples peticiones
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (filters.dateFrom || filters.dateTo) {
        fetchLogs();
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [filters.dateFrom, filters.dateTo]);

  // Aplicar filtro de búsqueda con delay
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (filters.search) {
        fetchLogs();
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [filters.search]);

  // Fetch logs function
  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Preparar filtros para la API
      const apiFilters = { ...filters };

      // Convertir fechas a formato ISO
      if (apiFilters.dateFrom) {
        apiFilters.dateFrom = apiFilters.dateFrom.toISOString();
      }
      if (apiFilters.dateTo) {
        apiFilters.dateTo = apiFilters.dateTo.toISOString();
      }

      // Obtener logs de la API
      const result = await cnnApi.getLogs(accessToken, apiFilters);

      if (result.success) {
        setLogs(result.logs || []);

        // Actualizar paginación
        if (result.pagination) {
          setPagination(result.pagination);
        }

        // Actualizar estadísticas
        if (result.stats) {
          setStats(result.stats);
        }
      } else {
        throw new Error(result.message || "Error al cargar logs");
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      setError(
        "No se pudieron cargar los logs. " +
          (error.message || "Por favor, intente de nuevo.")
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      [filterType]: value,
    }));

    // Reiniciar a página 1 cuando cambian los filtros excepto la página
    if (filterType !== "page") {
      setFilters((prev) => ({ ...prev, page: 1 }));
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  };

  // Handle manual refresh
  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetchLogs();
  };

  // Manejar cambio de página
  const handlePageChange = (newPage) => {
    if (
      newPage < 1 ||
      newPage > pagination.pages ||
      newPage === pagination.page
    ) {
      return;
    }

    setFilters((prev) => ({ ...prev, page: newPage }));
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Ver detalle de un log
  const handleViewLogDetail = (log) => {
    setSelectedLog(log);
    setShowLogDetail(true);
  };

  // Cerrar modal de detalle
  const handleCloseLogDetail = () => {
    setSelectedLog(null);
    setShowLogDetail(false);
  };

  // Mostrar confirmar eliminación
  const handleShowDeleteConfirm = () => {
    setShowDeleteConfirm(true);
  };

  // Limpiar logs antiguos
  const handleCleanLogs = async () => {
    if (isDeleting) return;

    try {
      setIsDeleting(true);

      const result = await cnnApi.cleanOldLogs(accessToken, deleteOlderThan);

      if (result.success) {
        // Actualizar UI después de borrar
        setShowDeleteConfirm(false);
        fetchLogs();
        // También actualizar el resumen
        const summaryResult = await cnnApi.getLogsSummary(accessToken);
        if (summaryResult?.success) {
          setSummary(summaryResult.summary);
        }
      } else {
        throw new Error(result.message || "Error al limpiar logs");
      }
    } catch (error) {
      console.error("Error al limpiar logs:", error);
      setError(
        "Error al limpiar logs: " + (error.message || "Intente de nuevo")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Export logs to CSV
  const exportLogs = () => {
    if (logs.length === 0) return;

    // Create CSV content
    const headers = ["Timestamp", "Level", "Message", "Source", "Stack"];
    const csvContent = [
      headers.join(","),
      ...logs.map((log) => {
        return [
          new Date(log.timestamp).toLocaleString(),
          log.level,
          `"${(log.message || "").replace(/"/g, '""')}"`,
          log.source || "N/A",
          `"${(log.stack || "").replace(/"/g, '""')}"`,
        ].join(",");
      }),
    ].join("\n");

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `logs_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get appropriate icon for log level
  const getLevelIcon = (level) => {
    switch (level?.toLowerCase()) {
      case "error":
        return <FaExclamationTriangle color="#dc3545" />;
      case "warn":
        return <FaExclamationCircle color="#ffc107" />;
      case "info":
        return <FaInfoCircle color="#17a2b8" />;
      case "debug":
        return <FaBug color="#6c757d" />;
      default:
        return <FaInfoCircle color="#6c757d" />;
    }
  };

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <h2>Registro de Actividad del Sistema</h2>
          <p>Visualiza y analiza los logs de actividad del sistema</p>
        </InfoSection>

        {/* Stats Summary */}
        {summary && (
          <StatsSummary>
            <StatItem>
              <StatValue color="#dc3545">{stats.error}</StatValue>
              <StatLabel>Errores</StatLabel>
            </StatItem>
            <StatItem>
              <StatValue color="#ffc107">{stats.warn}</StatValue>
              <StatLabel>Advertencias</StatLabel>
            </StatItem>
            <StatItem>
              <StatValue color="#17a2b8">{stats.info}</StatValue>
              <StatLabel>Info</StatLabel>
            </StatItem>
            <StatItem>
              <StatValue color="#6c757d">{stats.debug}</StatValue>
              <StatLabel>Debug</StatLabel>
            </StatItem>
            <StatItem>
              <StatValue>{stats.total}</StatValue>
              <StatLabel>Total</StatLabel>
            </StatItem>
          </StatsSummary>
        )}
      </ToolbarContainer>
      <section className="main-content">
        <ActionsContainer>
          <SearchInputContainer>
            <SearchInput
              type="text"
              placeholder="Buscar en logs..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
            <SearchButton>
              <FaSearch />
            </SearchButton>
          </SearchInputContainer>

          <FiltersContainer>
            {/* Filtro por nivel */}
            <FilterGroup>
              <FilterLabel>Nivel:</FilterLabel>
              <FilterSelect
                value={filters.level}
                onChange={(e) => handleFilterChange("level", e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="error">Errores</option>
                <option value="warn">Advertencias</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </FilterSelect>
            </FilterGroup>

            {/* Filtro por fuente */}
            <FilterGroup>
              <FilterLabel>Fuente:</FilterLabel>
              <FilterSelect
                value={filters.source}
                onChange={(e) => handleFilterChange("source", e.target.value)}
              >
                <option value="all">Todas</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </FilterSelect>
            </FilterGroup>

            {/* Filtro por fecha desde */}
            <FilterGroup>
              <FilterLabel>Desde:</FilterLabel>
              <DatePickerWrapper>
                <StyledDatePicker
                  selected={filters.dateFrom}
                  onChange={(date) => handleFilterChange("dateFrom", date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Fecha inicio"
                  isClearable
                />
                <DatePickerIcon>
                  <FaCalendarAlt />
                </DatePickerIcon>
              </DatePickerWrapper>
            </FilterGroup>

            {/* Filtro por fecha hasta */}
            <FilterGroup>
              <FilterLabel>Hasta:</FilterLabel>
              <DatePickerWrapper>
                <StyledDatePicker
                  selected={filters.dateTo}
                  onChange={(date) => handleFilterChange("dateTo", date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Fecha fin"
                  isClearable
                />
                <DatePickerIcon>
                  <FaCalendarAlt />
                </DatePickerIcon>
              </DatePickerWrapper>
            </FilterGroup>

            {/* Límite de registros */}
            <FilterGroup>
              <FilterLabel>Límite:</FilterLabel>
              <FilterSelect
                value={filters.limit}
                onChange={(e) => handleFilterChange("limit", e.target.value)}
              >
                <option value="50">50 registros</option>
                <option value="100">100 registros</option>
                <option value="200">200 registros</option>
                <option value="500">500 registros</option>
              </FilterSelect>
            </FilterGroup>

            <ButtonsGroup>
              <ActionButton onClick={handleRefresh} disabled={refreshing}>
                <FaSync /> {refreshing ? "Actualizando..." : "Actualizar"}
              </ActionButton>
              <ActionButton onClick={exportLogs} disabled={logs.length === 0}>
                <FaDownload /> Exportar
              </ActionButton>
              <ActionButton onClick={handleShowDeleteConfirm} variant="danger">
                <FaTrashAlt /> Limpiar Logs
              </ActionButton>
            </ButtonsGroup>
          </FiltersContainer>
        </ActionsContainer>

        {loading && !refreshing ? (
          <LoadingContainer>
            <LoadingMessage>Cargando logs...</LoadingMessage>
          </LoadingContainer>
        ) : error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : logs.length === 0 ? (
          <EmptyMessage>No hay logs disponibles.</EmptyMessage>
        ) : (
          <LogsContainer>
            <LogsList>
              {logs.map((log, index) => (
                <LogItem
                  key={log._id || index}
                  level={log.level?.toLowerCase()}
                  onClick={() => handleViewLogDetail(log)}
                >
                  <LogHeader>
                    <LogLevel>
                      {getLevelIcon(log.level)} {log.level}
                    </LogLevel>
                    <LogTimestamp>
                      {new Date(log.timestamp).toLocaleString()}
                    </LogTimestamp>
                  </LogHeader>
                  <LogMessage>{log.message}</LogMessage>
                  {log.source && <LogSource>Fuente: {log.source}</LogSource>}
                  {log.stack && (
                    <LogStack>
                      <LogStackTitle>Stack Trace:</LogStackTitle>
                      <LogStackContent>{log.stack}</LogStackContent>
                    </LogStack>
                  )}
                </LogItem>
              ))}
            </LogsList>

            {/* Paginación */}
            <PaginationContainer>
              <PaginationInfo>
                Mostrando {logs.length} de {stats.totalLogs} registros
              </PaginationInfo>
              <PaginationControls>
                <PaginationButton
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(1)}
                >
                  &laquo;
                </PaginationButton>
                <PaginationButton
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                >
                  &lsaquo;
                </PaginationButton>

                <PaginationCurrent>
                  Página {pagination.page} de {pagination.pages || 1}
                </PaginationCurrent>

                <PaginationButton
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                >
                  &rsaquo;
                </PaginationButton>
                <PaginationButton
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => handlePageChange(pagination.pages)}
                >
                  &raquo;
                </PaginationButton>
              </PaginationControls>
            </PaginationContainer>
          </LogsContainer>
        )}

        {/* Modal para detalle de log */}
        {showLogDetail && selectedLog && (
          <ModalOverlay onClick={handleCloseLogDetail}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>
                  {getLevelIcon(selectedLog.level)} Detalle del Log
                </ModalTitle>
                <CloseButton onClick={handleCloseLogDetail}>
                  &times;
                </CloseButton>
              </ModalHeader>
              <ModalBody>
                <DetailItem>
                  <DetailLabel>Nivel:</DetailLabel>
                  <DetailValue level={selectedLog.level?.toLowerCase()}>
                    {selectedLog.level}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Fecha:</DetailLabel>
                  <DetailValue>
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Fuente:</DetailLabel>
                  <DetailValue>
                    {selectedLog.source || "No especificada"}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Mensaje:</DetailLabel>
                  <DetailValue>{selectedLog.message}</DetailValue>
                </DetailItem>
                {selectedLog.metadata && (
                  <DetailItem>
                    <DetailLabel>Metadata:</DetailLabel>
                    <DetailValue>
                      <pre>
                        {typeof selectedLog.metadata === "object"
                          ? JSON.stringify(selectedLog.metadata, null, 2)
                          : selectedLog.metadata}
                      </pre>
                    </DetailValue>
                  </DetailItem>
                )}
                {selectedLog.stack && (
                  <DetailItem>
                    <DetailLabel>Stack Trace:</DetailLabel>
                    <DetailValue>
                      <pre>{selectedLog.stack}</pre>
                    </DetailValue>
                  </DetailItem>
                )}
              </ModalBody>
            </ModalContent>
          </ModalOverlay>
        )}

        {/* Modal para confirmar eliminación */}
        {showDeleteConfirm && (
          <ModalOverlay onClick={() => setShowDeleteConfirm(false)}>
            <ModalContent onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>
                  <FaTrashAlt style={{ marginRight: "10px" }} /> Limpiar Logs
                  Antiguos
                </ModalTitle>
                <CloseButton onClick={() => setShowDeleteConfirm(false)}>
                  &times;
                </CloseButton>
              </ModalHeader>
              <ModalBody>
                <p>
                  Esta acción eliminará todos los logs más antiguos que el
                  número de días especificado. Esta operación no se puede
                  deshacer.
                </p>
                <DeleteOptionsContainer>
                  <FilterLabel>Eliminar logs más antiguos que:</FilterLabel>
                  <FilterSelect
                    value={deleteOlderThan}
                    onChange={(e) =>
                      setDeleteOlderThan(parseInt(e.target.value))
                    }
                  >
                    <option value="7">7 días</option>
                    <option value="15">15 días</option>
                    <option value="30">30 días</option>
                    <option value="60">60 días</option>
                    <option value="90">90 días</option>
                  </FilterSelect>
                </DeleteOptionsContainer>
                <ButtonsContainer>
                  <CancelButton onClick={() => setShowDeleteConfirm(false)}>
                    Cancelar
                  </CancelButton>
                  <DeleteButton onClick={handleCleanLogs} disabled={isDeleting}>
                    {isDeleting ? "Eliminando..." : "Eliminar Logs"}
                  </DeleteButton>
                </ButtonsContainer>
              </ModalBody>
            </ModalContent>
          </ModalOverlay>
        )}
      </section>
    </>
  );
}

// Styles
const Container = styled.div`
  min-height: 100vh;
  padding: 15px;
  width: 100%;
  background-color: ${(props) => props.theme.bg};
  color: ${({ theme }) => theme.text};
  display: grid;
  grid-template:
    "header" 90px
    "area1" auto
    "area2" auto
    "main" 1fr;

  @media (max-width: 768px) {
    grid-template:
      "header" 70px
      "area1" auto
      "area2" auto
      "main" 1fr;
    padding: 10px;
  }

  .header {
    grid-area: header;
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }

  .area1 {
    grid-area: area1;
    margin-bottom: 20px;
  }

  .area2 {
    grid-area: area2;
    margin-bottom: 20px;
  }

  .main {
    grid-area: main;
    margin-top: 10px;
  }
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 0;
`;

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 5px;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.title || theme.text};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }
`;

const StatsSummary = styled.div`
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 20px;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    gap: 15px;
  }
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: ${(props) => props.color || props.theme?.text || "#333"};
`;

const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

const SearchInputContainer = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  margin-bottom: 10px;
`;

const SearchInput = styled.input`
  width: 100%;
  max-width: 800px;
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px 0 0 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const SearchButton = styled.button`
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-left: none;
  border-radius: 0 4px 4px 0;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }
`;

const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  justify-content: center;
  align-items: center;
  margin-bottom: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FilterLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  white-space: nowrap;
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  @media (max-width: 768px) {
    flex: 1;
  }
`;

const DatePickerWrapper = styled.div`
  position: relative;
`;

const StyledDatePicker = styled(DatePicker)`
  padding: 8px 12px;
  padding-right: 30px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  width: 130px;

  &:focus {
    outline: none;
    border-color: #007bff;
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const DatePickerIcon = styled.div`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.textSecondary || "#666"};
  pointer-events: none;
`;

const ButtonsGroup = styled.div`
  display: flex;
  gap: 10px;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  background-color: ${(props) =>
    props.variant === "danger" ? "#dc3545" : props.theme?.primary || "#007bff"};
  color: white;
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background-color: ${(props) =>
      props.variant === "danger"
        ? "#c82333"
        : props.theme?.primaryHover || "#0069d9"};
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    flex: 1;
    justify-content: center;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
`;

const LoadingMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const ErrorMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 8px;
  margin: 20px 0;
`;

const EmptyMessage = styled.div`
  padding: 30px;
  text-align: center;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const LogsContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const LogsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const LogItem = styled.div`
  padding: 15px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  border-left: 4px solid
    ${({ level }) => {
      switch (level) {
        case "error":
          return "#dc3545";
        case "warn":
          return "#ffc107";
        case "info":
          return "#17a2b8";
        case "debug":
          return "#6c757d";
        default:
          return "#6c757d";
      }
    }};
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

const LogHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
`;

const LogLevel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
`;

const LogTimestamp = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const LogMessage = styled.div`
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
`;

const LogSource = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  margin-bottom: 10px;
`;

const LogStack = styled.div`
  background-color: ${({ theme }) => theme.codeBg || "#f5f5f5"};
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
`;

const LogStackTitle = styled.div`
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 5px;
`;

const LogStackContent = styled.pre`
  margin: 0;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: ${({ theme }) => theme.code || "#e83e8c"};
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 10px 0;
  flex-wrap: wrap;
  gap: 15px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const PaginationInfo = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const PaginationControls = styled.div`
  display: flex;
  gap: 5px;
  align-items: center;
`;

const PaginationButton = styled.button`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
    border-color: ${({ theme }) => theme.primary || "#007bff"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PaginationCurrent = styled.div`
  padding: 0 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

// Modal components
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${({ theme }) => theme.title || theme.text};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: ${({ theme }) => theme.textSecondary || "#666"};

  &:hover {
    color: ${({ theme }) => theme.text};
  }
`;

const ModalBody = styled.div`
  padding: 20px;
`;

const DetailItem = styled.div`
  margin-bottom: 15px;
`;

const DetailLabel = styled.div`
  font-weight: 500;
  margin-bottom: 5px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const DetailValue = styled.div`
  font-size: 14px;
  word-break: break-word;
  color: ${(props) => {
    if (props.level) {
      switch (props.level) {
        case "error":
          return "#dc3545";
        case "warn":
          return "#ffc107";
        case "info":
          return "#17a2b8";
        case "debug":
          return "#6c757d";
        default:
          return props.theme?.text;
      }
    }
    return props.theme?.text;
  }};

  pre {
    background-color: ${({ theme }) => theme.codeBg || "#f5f5f5"};
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0;
  }
`;

const DeleteOptionsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0;
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const CancelButton = styled.button`
  padding: 8px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }
`;

const DeleteButton = styled.button`
  padding: 8px 15px;
  border: none;
  border-radius: 4px;
  background-color: #dc3545;
  color: white;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: #c82333;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;
