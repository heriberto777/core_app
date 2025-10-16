import styled from "styled-components";
import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import {
  FaEye,
  FaArrowLeft,
  FaSearch,
  FaSync,
  FaFilter,
  FaCalendarAlt,
} from "react-icons/fa";
import { Header, useAuth, useFetchData, TransferApi } from "../../index";

const cnnApi = new TransferApi();

export function TransferHistory() {
  const [openstate, setOpenState] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { taskId } = useParams();
  const location = useLocation();
  const initialTaskData = location.state?.initialData;

  // Estados para los datos
  const [taskInfo, setTaskInfo] = useState(initialTaskData?.task || null);
  const [historyData, setHistoryData] = useState(
    initialTaskData?.history || []
  );
  const [loading, setLoading] = useState(!initialTaskData);
  const [error, setError] = useState(null);

  // Efecto para cargar los datos si no se pasaron en location.state
  useEffect(() => {
    if (!initialTaskData && taskId) {
      loadTaskHistory();
    }
  }, [taskId, accessToken]);

  const loadTaskHistory = async () => {
    setLoading(true);
    try {
      const result = await cnnApi.getTaskHistory(accessToken, taskId, {
        ...filters,
        page: currentPage,
      });

      if (result.success) {
        setTaskInfo(result.task);
        setHistoryData(result.history);
        setTotalPages(result.pagination?.pages || 1);
      } else {
        throw new Error(result.message || "Error al obtener historial");
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadTaskHistory();
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 10,
      dateFrom: "",
      dateTo: "",
      status: "",
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      loadTaskHistory();
    }
  };

  const goBack = () => {
    navigate("/transfer-tasks");
  };

  const viewSummaryDetails = async (summaryId) => {
    // Similar a la función en LoadsResumen
    // ...
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
            <BackButton onClick={goBack}>
              <FaArrowLeft /> Volver a tareas
            </BackButton>
            <h2>
              Historial de Transferencias: {taskInfo?.name || "Cargando..."}
            </h2>
            <p>
              Visualice el historial de ejecuciones de esta tarea de
              transferencia.
            </p>
          </InfoSection>
        </ToolbarContainer>
      </section>

      <section className="area2">
        <FiltersContainer>
          <FilterField>
            <FilterLabel>
              <FaCalendarAlt /> Desde
            </FilterLabel>
            <FilterInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaCalendarAlt /> Hasta
            </FilterLabel>
            <FilterInput
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaFilter /> Estado
            </FilterLabel>
            <FilterSelect
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Todos</option>
              <option value="completed">Completado</option>
              <option value="partial_return">Devolución Parcial</option>
              <option value="full_return">Devolución Total</option>
            </FilterSelect>
          </FilterField>

          <ButtonsContainer>
            <SearchButton onClick={handleSearch}>
              <FaSearch /> Buscar
            </SearchButton>

            <ClearButton onClick={clearFilters}>Limpiar Filtros</ClearButton>

            <RefreshButton onClick={loadTaskHistory}>
              <FaSync /> Refrescar
            </RefreshButton>
          </ButtonsContainer>
        </FiltersContainer>
      </section>

      <section className="main">
        {loading && (
          <LoadingContainer>
            <LoadingMessage>Cargando historial...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !error && historyData.length === 0 && (
          <EmptyMessage>
            No hay registros de transferencias para esta tarea.
          </EmptyMessage>
        )}

        {!loading && historyData.length > 0 && (
          <>
            {/* Panel con información de resumen */}
            <SummaryPanel>
              <SummaryItem>
                <SummaryLabel>Total ejecuciones:</SummaryLabel>
                <SummaryValue>{taskInfo.executionCount || 0}</SummaryValue>
              </SummaryItem>
              <SummaryItem>
                <SummaryLabel>Última ejecución:</SummaryLabel>
                <SummaryValue>
                  {taskInfo.lastExecutionDate
                    ? new Date(taskInfo.lastExecutionDate).toLocaleString()
                    : "Nunca"}
                </SummaryValue>
              </SummaryItem>
              <SummaryItem>
                <SummaryLabel>Último resultado:</SummaryLabel>
                <SummaryValue>
                  {taskInfo.lastExecutionResult?.success ? (
                    <StatusBadge status="completed">Éxito</StatusBadge>
                  ) : (
                    <StatusBadge status="error">Error</StatusBadge>
                  )}
                </SummaryValue>
              </SummaryItem>
            </SummaryPanel>

            <TableContainer>
              <StyledTable>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Documento</th>
                    <th>Ruta</th>
                    <th>Estado</th>
                    <th>Productos</th>
                    <th>Cantidad Total</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((entry) => (
                    <tr
                      key={entry._id}
                      className={
                        entry.status === "full_return"
                          ? "returned"
                          : entry.status === "partial_return"
                          ? "partial-returned"
                          : ""
                      }
                    >
                      <td>{new Date(entry.date).toLocaleString()}</td>
                      <td>{entry.documentId || "N/A"}</td>
                      <td>{entry.route}</td>
                      <td>
                        <StatusBadge status={entry.status}>
                          {entry.status === "completed"
                            ? "Completado"
                            : entry.status === "partial_return"
                            ? "Devolución Parcial"
                            : entry.status === "full_return"
                            ? "Devolución Total"
                            : entry.status}
                        </StatusBadge>
                      </td>
                      <td>{entry.totalProducts}</td>
                      <td>{entry.totalQuantity}</td>
                      <td>
                        <ActionButtons>
                          <ActionButton
                            title="Ver detalles"
                            onClick={() => viewSummaryDetails(entry._id)}
                          >
                            <FaEye />
                          </ActionButton>
                        </ActionButtons>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StyledTable>
            </TableContainer>

            <PaginationContainer>
              <PaginationButton
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                Primera
              </PaginationButton>
              <PaginationButton
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Anterior
              </PaginationButton>

              <PageInfo>
                Página {currentPage} de {totalPages}
              </PageInfo>

              <PaginationButton
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </PaginationButton>
              <PaginationButton
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                Última
              </PaginationButton>
            </PaginationContainer>
          </>
        )}
      </section>
    </Container>
  );
}

// Estilos
const Container = styled.div`
  min-height: 100vh;
  padding: 15px;
  width: 100%;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
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

  @media (max-width: 480px) {
    grid-template:
      "header" 60px
      "area1" auto
      "area2" auto
      "main" 1fr;
    padding: 5px;
  }

  .header {
    grid-area: header;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .area1 {
    grid-area: area1;
    margin-bottom: 10px;
  }

  .area2 {
    grid-area: area2;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 20px;

    @media (max-width: 768px) {
      margin-top: 15px;
      margin-bottom: 10px;
    }

    @media (max-width: 480px) {
      margin-top: 10px;
      margin-bottom: 5px;
      flex-direction: column;
    }
  }

  .main {
    grid-area: main;
    margin-top: 10px;
    overflow-x: auto;

    @media (max-width: 768px) {
      padding: 10px;
    }

    @media (max-width: 480px) {
      padding: 5px;
    }
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
  gap: 5px;
  text-align: center;
  position: relative;

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

const BackButton = styled.button`
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 15px;
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a6268;
  }
`;

const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    flex-direction: column;
    padding: 10px;
  }
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 150px;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  display: flex;
  align-items: center;
  gap: 5px;
`;

const FilterInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin-top: 5px;

  @media (max-width: 768px) {
    width: 100%;
    flex-wrap: wrap;
  }

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const SearchButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #0069d9;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const ClearButton = styled.button`
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a6268;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const RefreshButton = styled.button`
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #138496;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const TableContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto; // Ya tienes esto, correcto
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  /* Añadir esto */
  -webkit-overflow-scrolling: touch; /* Para mejor scroll en iOS */

  @media (max-width: 576px) {
    /* Mejora la visualización en móviles pequeños */
    margin-left: -10px;
    margin-right: -10px;
    width: calc(100% + 20px);
    border-radius: 0;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: ${({ theme }) => theme.text};

  th,
  td {
    padding: 12px 15px;
    text-align: left;
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader || "#f0f0f0"};
    color: ${({ theme }) => theme.tableHeaderText || "#333"};
    font-weight: bold;
    white-space: nowrap;
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }

    &.returned {
      background-color: rgba(220, 53, 69, 0.1);
    }

    &.partial-returned {
      background-color: rgba(255, 193, 7, 0.1);
    }
  }
`;

const StatusBadge = styled.div`
  display: inline-block;
  padding: 5px 10px;
  border-radius: 50px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background-color: ${(props) => {
    switch (props.status) {
      case "completed":
        return "#28a745";
      case "partial_return":
        return "#ffc107";
      case "full_return":
        return "#dc3545";
      default:
        return "#6c757d";
    }
  }};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.color || "#0275d8"};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    color: #adb5bd;
    cursor: not-allowed;
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

const PaginationContainer = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  margin-top: 20px;

  @media (max-width: 480px) {
    flex-wrap: wrap;
  }
`;

const PaginationButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #0069d9;
  }

  &:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    opacity: 0.65;
  }
`;

const PageInfo = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  padding: 0 10px;
`;
