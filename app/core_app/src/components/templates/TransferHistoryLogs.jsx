import styled from "styled-components";
import { useState, useEffect } from "react";
import { Header, useAuth, TransferApi } from "../../index";
import {
  FaSync,
  FaFilter,
  FaCalendarAlt,
  FaDownload,
  FaSearch,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
} from "react-icons/fa";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const cnnApi = new TransferApi();

export function TransferHistory() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({
    completedToday: 0,
    failedToday: 0,
    total: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    dateFrom: null,
    dateTo: null,
    status: "all",
    taskName: "",
    search: "",
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  // Load transfer history
  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // Prepare query parameters
      const queryParams = new URLSearchParams();

      if (filters.dateFrom) {
        queryParams.append("dateFrom", filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        queryParams.append("dateTo", filters.dateTo.toISOString());
      }

      if (filters.status !== "all") {
        queryParams.append("status", filters.status);
      }

      if (filters.taskName) {
        queryParams.append("taskName", filters.taskName);
      }

      queryParams.append("page", pagination.page);
      queryParams.append("limit", pagination.limit);

      // Call API with appropriate filters
      const historyResponse = await cnnApi.getTransferHistory(
        accessToken,
        Object.fromEntries(queryParams)
      );

      if (historyResponse.success) {
        // Set history data
        setHistory(historyResponse.history || []);

        // Set statistics
        setStats({
          completedToday: historyResponse.completedToday || 0,
          failedToday: historyResponse.failedToday || 0,
          total:
            historyResponse.pagination?.total ||
            historyResponse.history?.length ||
            0,
        });

        // Set pagination if available
        if (historyResponse.pagination) {
          setPagination(historyResponse.pagination);
        }
      } else {
        throw new Error(
          historyResponse.error || "No se pudo cargar el historial"
        );
      }
    } catch (error) {
      console.error("Error fetching transfer history:", error);
      setError(
        error.message || "Error al cargar el historial de transferencias"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load history on component mount and when filters/pagination change
  useEffect(() => {
    fetchHistory();
  }, [accessToken, filters.status, pagination.page, pagination.limit]);

  // Manually apply date and taskName filters (with a delay)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      // Only refetch if these specific filters change
      if (filters.dateFrom || filters.dateTo || filters.taskName) {
        fetchHistory();
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [filters.dateFrom, filters.dateTo, filters.taskName]);

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }));

    // Reset to first page when changing filters
    if (filterType !== "page") {
      setPagination((prev) => ({
        ...prev,
        page: 1,
      }));
    }
  };

  // Handle refresh button
  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    fetchHistory();
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    if (
      newPage < 1 ||
      newPage > pagination.pages ||
      newPage === pagination.page
    ) {
      return;
    }

    setPagination((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  // Filter history by search text (client-side filtering)
  const filteredHistory = history.filter((item) => {
    if (!filters.search) return true;

    // Search in task name, status or any stringified property
    return (
      (item.name || item.taskName || "")
        .toLowerCase()
        .includes(filters.search.toLowerCase()) ||
      (item.status || "")
        .toLowerCase()
        .includes(filters.search.toLowerCase()) ||
      JSON.stringify(item).toLowerCase().includes(filters.search.toLowerCase())
    );
  });

  // Export history to CSV
  const exportHistory = () => {
    if (history.length === 0) return;

    // Create CSV headers
    const headers = [
      "Fecha",
      "Tarea",
      "Estado",
      "Registros Procesados",
      "Duración (ms)",
    ];

    // Map history to CSV rows
    const csvContent = [
      headers.join(","),
      ...filteredHistory.map((item) => {
        return [
          new Date(item.date).toLocaleString(),
          item.taskName || item.name || "N/A",
          item.status || "N/A",
          item.totalRecords || item.successfulRecords || 0,
          item.executionTime || 0,
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
      `transfer_history_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return <FaCheckCircle color="#28a745" />;
      case "failed":
      case "error":
        return <FaTimesCircle color="#dc3545" />;
      case "cancelled":
        return <FaExclamationCircle color="#ffc107" />;
      default:
        return null;
    }
  };

  return (
    <Container>
      <header className="header">
        <Header
          stateConfig={{
            openstate: openstate,
            setOpenState: () => setOpenState(!openstate),
          }}
        />
      </header>

      <section className="area1">
        <ToolbarContainer>
          <InfoSection>
            <h2>Historial de Transferencias</h2>
            <p>
              Visualiza el historial de operaciones de transferencia de datos
            </p>
          </InfoSection>
        </ToolbarContainer>
      </section>

      <section className="area2">
        <ActionsContainer>
          {/* Search input */}
          <SearchInputContainer>
            <SearchInput
              type="text"
              placeholder="Buscar en historial..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
            <SearchButton>
              <FaSearch />
            </SearchButton>
          </SearchInputContainer>

          {/* Statistics summary */}
          <StatsSummary>
            <StatItem>
              <StatLabel>Completadas hoy:</StatLabel>
              <StatValue color="#28a745">{stats.completedToday}</StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Fallidas hoy:</StatLabel>
              <StatValue color="#dc3545">{stats.failedToday}</StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Total en historial:</StatLabel>
              <StatValue>{stats.total}</StatValue>
            </StatItem>
          </StatsSummary>

          {/* Filters */}
          <FiltersContainer>
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

            <FilterGroup>
              <FilterLabel>Estado:</FilterLabel>
              <FilterSelect
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="completed">Completadas</option>
                <option value="failed">Fallidas</option>
                <option value="cancelled">Canceladas</option>
              </FilterSelect>
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Tarea:</FilterLabel>
              <FilterInput
                type="text"
                placeholder="Nombre de tarea"
                value={filters.taskName}
                onChange={(e) => handleFilterChange("taskName", e.target.value)}
              />
            </FilterGroup>

            <ButtonsGroup>
              <ActionButton onClick={handleRefresh} disabled={refreshing}>
                <FaSync /> {refreshing ? "Actualizando..." : "Actualizar"}
              </ActionButton>
              <ActionButton
                onClick={exportHistory}
                disabled={history.length === 0}
              >
                <FaDownload /> Exportar
              </ActionButton>
            </ButtonsGroup>
          </FiltersContainer>
        </ActionsContainer>
      </section>

      <section className="main">
        {loading && !refreshing ? (
          <LoadingContainer>
            <LoadingMessage>Cargando historial...</LoadingMessage>
          </LoadingContainer>
        ) : error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : history.length === 0 ? (
          <EmptyMessage>
            No hay registros de transferencias disponibles.
          </EmptyMessage>
        ) : (
          <HistoryContainer>
            {filteredHistory.length === 0 ? (
              <EmptyMessage>
                No se encontraron registros con los filtros actuales.
              </EmptyMessage>
            ) : (
              <>
                <HistoryTable>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tarea</th>
                      <th>Estado</th>
                      <th>Registros</th>
                      <th>Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item, index) => (
                      <HistoryRow
                        key={index}
                        status={item.status?.toLowerCase()}
                      >
                        <td>{new Date(item.date).toLocaleString()}</td>
                        <td>{item.taskName || item.name || "N/A"}</td>
                        <td>
                          <StatusBadge status={item.status?.toLowerCase()}>
                            {getStatusIcon(item.status)}{" "}
                            {item.status === "completed"
                              ? "Completada"
                              : item.status === "failed"
                              ? "Fallida"
                              : item.status === "cancelled"
                              ? "Cancelada"
                              : item.status || "Desconocido"}
                          </StatusBadge>
                        </td>
                        <td>
                          {item.totalRecords || item.successfulRecords || 0}
                        </td>
                        <td>
                          {item.executionTime
                            ? `${item.executionTime}ms`
                            : "N/A"}
                        </td>
                      </HistoryRow>
                    ))}
                  </tbody>
                </HistoryTable>

                {/* Pagination */}
                <PaginationContainer>
                  <PaginationInfo>
                    Mostrando {filteredHistory.length} de {stats.total}{" "}
                    registros
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
                      Página {pagination.page} de {pagination.pages}
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
              </>
            )}
          </HistoryContainer>
        )}
      </section>
    </Container>
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

const StatsSummary = styled.div`
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 15px;

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

const FilterInput = styled.input`
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
  background-color: ${({ theme }) => theme.primary || "#007bff"};
  color: white;
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.primaryHover || "#0069d9"};
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

const HistoryContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const HistoryTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  th,
  td {
    padding: 12px 15px;
    text-align: left;
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader || "#f0f0f0"};
    color: ${({ theme }) => theme.tableHeaderText || "#333"};
    font-weight: 600;
    font-size: 14px;
  }

  tbody tr:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  }
`;

const HistoryRow = styled.tr`
  background-color: ${({ status, theme }) => {
    switch (status) {
      case "completed":
        return "rgba(40, 167, 69, 0.05)";
      case "failed":
      case "error":
        return "rgba(220, 53, 69, 0.05)";
      case "cancelled":
        return "rgba(255, 193, 7, 0.05)";
      default:
        return theme?.cardBg || "#fff";
    }
  }};

  &:hover {
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }
`;

const StatusBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 50px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background-color: ${({ status }) => {
    switch (status) {
      case "completed":
        return "#28a745";
      case "failed":
      case "error":
        return "#dc3545";
      case "cancelled":
        return "#ffc107";
      default:
        return "#6c757d";
    }
  }};
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
