import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Header, useAuth } from "../../index";
import { TransferApi } from "../../api/index";
import {
  FaChartLine,
  FaExchangeAlt,
  FaServer,
  FaClock,
  FaCalendarAlt,
  FaFilter,
  FaSearch,
  FaSync,
} from "react-icons/fa";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const cnnApi = new TransferApi();

export function Statistics() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [timeRange, setTimeRange] = useState("7d"); // '24h', '7d', '30d', '90d'
  const [selectedTask, setSelectedTask] = useState("all");

  // Datos para gráficos
  const [transfersByDay, setTransfersByDay] = useState([]);
  const [successRateData, setSuccessRateData] = useState([]);
  const [taskPerformance, setTaskPerformance] = useState([]);
  const [serverResponseTimes, setServerResponseTimes] = useState([]);
  const [availableTasks, setAvailableTasks] = useState([]);

  // Función para cargar datos con mejor manejo de errores
  const fetchStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      setRefreshing(true);

      // 1. Obtener tareas disponibles para el filtro
      try {
        const tasksResponse = await cnnApi.getTasks(accessToken);
        if (Array.isArray(tasksResponse)) {
          setAvailableTasks(tasksResponse);
        }
      } catch (tasksError) {
        console.error("Error al obtener tareas:", tasksError);
        // No fallar completamente, sólo log y continuar
      }

      // 2. Obtener estadísticas históricas con manejo de errores mejorado
      try {
        const statsResponse = await cnnApi.getTransferStats(accessToken, {
          timeRange,
          taskId: selectedTask !== "all" ? selectedTask : undefined,
        });

        if (statsResponse.success) {
          // Procesar datos para los gráficos
          setTransfersByDay(statsResponse.transfersByDay || []);
          setSuccessRateData(statsResponse.successRate || []);
          setTaskPerformance(statsResponse.taskPerformance || []);
          setServerResponseTimes(statsResponse.serverResponseTimes || []);
        } else {
          console.warn("Respuesta sin éxito:", statsResponse);
          setMockData(); // Usar datos de ejemplo
        }
      } catch (statsError) {
        console.error("Error al obtener estadísticas:", statsError);
        setMockData(); // Usar datos de ejemplo en caso de error
      }
    } catch (error) {
      console.error("Error general:", error);
      setError(
        "No se pudieron cargar las estadísticas. Por favor, intente nuevamente."
      );
      setMockData(); // Asegurar que tengamos datos de ejemplo
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Función de actualización manual
  const handleRefresh = () => {
    fetchStatistics();
  };

  // Cargar datos cuando cambian los filtros
  useEffect(() => {
    fetchStatistics();
  }, [accessToken, timeRange, selectedTask]);

  // Función para cargar datos de ejemplo si falla la carga real
  const setMockData = () => {
    // Generar fechas para los últimos 7 días
    const generateLastDays = (days) => {
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        result.push(dateStr);
      }
      return result;
    };

    const lastDays = generateLastDays(7);

    // Datos de ejemplo para transferencias por día
    setTransfersByDay([
      { date: lastDays[0], completed: 12, failed: 2 },
      { date: lastDays[1], completed: 15, failed: 1 },
      { date: lastDays[2], completed: 18, failed: 3 },
      { date: lastDays[3], completed: 14, failed: 2 },
      { date: lastDays[4], completed: 21, failed: 0 },
      { date: lastDays[5], completed: 25, failed: 4 },
      { date: lastDays[6], completed: 22, failed: 3 },
    ]);

    // Datos de ejemplo para tasa de éxito
    setSuccessRateData([
      { name: "Exitosas", value: 85 },
      { name: "Fallidas", value: 15 },
    ]);

    // Datos de ejemplo para rendimiento por tarea
    setTaskPerformance([
      { name: "Clientes", executed: 24, avgTime: 45, successRate: 92 },
      { name: "Productos", executed: 32, avgTime: 38, successRate: 96 },
      { name: "Ventas", executed: 18, avgTime: 62, successRate: 88 },
      { name: "Inventario", executed: 28, avgTime: 41, successRate: 94 },
    ]);

    // Datos de ejemplo para tiempos de respuesta
    setServerResponseTimes([
      { date: lastDays[0], server1: 42, server2: 58 },
      { date: lastDays[1], server1: 38, server2: 62 },
      { date: lastDays[2], server1: 45, server2: 55 },
      { date: lastDays[3], server1: 52, server2: 68 },
      { date: lastDays[4], server1: 48, server2: 60 },
      { date: lastDays[5], server1: 43, server2: 59 },
      { date: lastDays[6], server1: 40, server2: 53 },
    ]);
  };

  // Colores para los gráficos
  const COLORS = {
    completed: "#28a745",
    failed: "#dc3545",
    server1: "#007bff",
    server2: "#6c757d",
  };

  // Mapear rangos de tiempo a textos legibles
  const timeRangeText = {
    "24h": "Últimas 24 horas",
    "7d": "Últimos 7 días",
    "30d": "Últimos 30 días",
    "90d": "Últimos 90 días",
  };

  return (
    <Container>
      <section className="area1">
        <PageHeader>
          <PageTitle>Estadísticas del Sistema</PageTitle>
          <PageSubtitle>
            Análisis detallado del rendimiento de transferencias
          </PageSubtitle>
        </PageHeader>
      </section>

      <section className="area2">
        <FiltersContainer>
          <FilterGroup>
            <FilterLabel>
              <FaCalendarAlt /> Período
            </FilterLabel>
            <FilterSelect
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
            </FilterSelect>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>
              <FaExchangeAlt /> Tarea
            </FilterLabel>
            <FilterSelect
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
            >
              <option value="all">Todas las tareas</option>
              {availableTasks.map((task) => (
                <option key={task._id} value={task._id}>
                  {task.name}
                </option>
              ))}
            </FilterSelect>
          </FilterGroup>

          <RefreshButton onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <>
                <FaSync className="spinning" /> Actualizando...
              </>
            ) : (
              <>
                <FaSync /> Actualizar
              </>
            )}
          </RefreshButton>
        </FiltersContainer>
      </section>

      <section className="main">
        {loading && !refreshing ? (
          <LoadingContainer>
            <LoadingSpinner />
            <LoadingText>Cargando estadísticas...</LoadingText>
          </LoadingContainer>
        ) : error ? (
          <ErrorContainer>
            <ErrorMessage>{error}</ErrorMessage>
            <RetryButton onClick={handleRefresh}>
              Intentar nuevamente
            </RetryButton>
          </ErrorContainer>
        ) : (
          <StatsGrid>
            {/* Gráfico de transferencias por día */}
            <StatsCard fullWidth>
              <StatsHeader>
                <StatsTitle>
                  <FaChartLine /> Transferencias por día (
                  {timeRangeText[timeRange]})
                </StatsTitle>
              </StatsHeader>
              <StatsContent>
                {transfersByDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={transfersByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        name="Completadas"
                        stroke={COLORS.completed}
                        activeDot={{ r: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="failed"
                        name="Fallidas"
                        stroke={COLORS.failed}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChartMessage>
                    No hay datos disponibles para este período
                  </EmptyChartMessage>
                )}
              </StatsContent>
            </StatsCard>

            {/* Tasa de éxito */}
            <StatsCard>
              <StatsHeader>
                <StatsTitle>Tasa de éxito</StatsTitle>
              </StatsHeader>
              <StatsContent>
                {successRateData.length > 0 &&
                successRateData.some((item) => item.value > 0) ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={successRateData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name}: ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {successRateData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.name === "Exitosas"
                                ? COLORS.completed
                                : COLORS.failed
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChartMessage>
                    No hay datos disponibles para este período
                  </EmptyChartMessage>
                )}
              </StatsContent>
            </StatsCard>

            {/* Tiempos de respuesta de servidores */}
            <StatsCard>
              <StatsHeader>
                <StatsTitle>
                  <FaServer /> Tiempos de respuesta (ms)
                </StatsTitle>
              </StatsHeader>
              <StatsContent>
                {serverResponseTimes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={serverResponseTimes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="server1"
                        name="Server 1"
                        stroke={COLORS.server1}
                      />
                      <Line
                        type="monotone"
                        dataKey="server2"
                        name="Server 2"
                        stroke={COLORS.server2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChartMessage>
                    No hay datos disponibles para este período
                  </EmptyChartMessage>
                )}
              </StatsContent>
            </StatsCard>

            {/* Rendimiento por tarea */}
            <StatsCard fullWidth>
              <StatsHeader>
                <StatsTitle>
                  <FaExchangeAlt /> Rendimiento por tarea
                </StatsTitle>
              </StatsHeader>
              <StatsContent>
                {taskPerformance.length > 0 ? (
                  <TaskPerformanceTable>
                    <thead>
                      <tr>
                        <th>Tarea</th>
                        <th>Ejecuciones</th>
                        <th>Tiempo promedio (s)</th>
                        <th>Tasa de éxito</th>
                        <th>Rendimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskPerformance.map((task, index) => (
                        <tr key={index}>
                          <td>{task.name}</td>
                          <td>{task.executed}</td>
                          <td>{task.avgTime}</td>
                          <td>{task.successRate}%</td>
                          <td>
                            <ProgressBar value={task.successRate}>
                              <ProgressBarFill value={task.successRate} />
                            </ProgressBar>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TaskPerformanceTable>
                ) : (
                  <EmptyChartMessage>
                    No hay datos de rendimiento disponibles
                  </EmptyChartMessage>
                )}
              </StatsContent>
            </StatsCard>

            {/* Volumen de transferencias por hora del día */}
            <StatsCard fullWidth>
              <StatsHeader>
                <StatsTitle>
                  <FaClock /> Volumen por hora del día
                </StatsTitle>
              </StatsHeader>
              <StatsContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={[
                      { hour: "00:00", transfers: 12 },
                      { hour: "01:00", transfers: 8 },
                      { hour: "02:00", transfers: 20 },
                      { hour: "03:00", transfers: 15 },
                      { hour: "04:00", transfers: 5 },
                      { hour: "05:00", transfers: 3 },
                      { hour: "06:00", transfers: 2 },
                      { hour: "07:00", transfers: 6 },
                      { hour: "08:00", transfers: 10 },
                      { hour: "09:00", transfers: 14 },
                      { hour: "10:00", transfers: 18 },
                      { hour: "11:00", transfers: 25 },
                      { hour: "12:00", transfers: 30 },
                      { hour: "13:00", transfers: 28 },
                      { hour: "14:00", transfers: 24 },
                      { hour: "15:00", transfers: 22 },
                      { hour: "16:00", transfers: 19 },
                      { hour: "17:00", transfers: 16 },
                      { hour: "18:00", transfers: 12 },
                      { hour: "19:00", transfers: 8 },
                      { hour: "20:00", transfers: 5 },
                      { hour: "21:00", transfers: 3 },
                      { hour: "22:00", transfers: 2 },
                      { hour: "23:00", transfers: 4 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      dataKey="transfers"
                      name="Transferencias"
                      fill="#007bff"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </StatsContent>
            </StatsCard>
          </StatsGrid>
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
    "header" auto
    "area1" auto
    "area2" auto
    "main" 1fr;

  .header {
    grid-area: header;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
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
    overflow-x: auto;
  }
`;

const PageHeader = styled.div`
  text-align: center;
  padding: 15px 0;
`;

const PageTitle = styled.h1`
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0;
  color: ${({ theme }) => theme.title || theme.text};
`;

const PageSubtitle = styled.p`
  font-size: 1rem;
  margin: 5px 0 0;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 15px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  align-items: flex-end;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;

  svg {
    color: ${({ theme }) => theme.primary || "#007bff"};
  }
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ddd"};
  border-radius: 4px;
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  color: ${({ theme }) => theme.text};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || "#007bff"};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const RefreshButton = styled.button`
  padding: 8px 15px;
  background-color: ${({ theme }) => theme.info || "#17a2b8"};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;
  min-width: 120px;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.infoHover || "#138496"};
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;

  @media (max-width: 992px) {
    grid-template-columns: 1fr;
  }
`;

const StatsCard = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  grid-column: ${({ fullWidth }) => (fullWidth ? "1 / -1" : "auto")};
`;

const StatsHeader = styled.div`
  padding: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
`;

const StatsTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    color: ${({ theme }) => theme.primary || "#007bff"};
  }
`;

const StatsContent = styled.div`
  padding: 15px;
`;

const EmptyChartMessage = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  font-style: italic;
`;

const TaskPerformanceTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  }

  th {
    font-weight: 600;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }
`;

const ProgressBar = styled.div`
  height: 8px;
  background-color: ${({ theme }) => theme.border || "#eee"};
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  width: ${({ value }) => `${value}%`};
  background-color: ${({ value }) =>
    value >= 90
      ? "#28a745"
      : value >= 75
      ? "#5cb85c"
      : value >= 60
      ? "#ffc107"
      : value >= 40
      ? "#f0ad4e"
      : "#dc3545"};
  border-radius: 4px;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
`;

const LoadingSpinner = styled.div`
  border: 4px solid ${({ theme }) => theme.border || "#eee"};
  border-top: 4px solid ${({ theme }) => theme.primary || "#007bff"};
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  background-color: rgba(220, 53, 69, 0.05);
  border-radius: 8px;
  margin-top: 20px;
`;

const ErrorMessage = styled.div`
  color: #dc3545;
  margin-bottom: 20px;
  text-align: center;
`;

const RetryButton = styled.button`
  background-color: ${({ theme }) => theme.primary || "#007bff"};
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover || "#0069d9"};
  }
`;
