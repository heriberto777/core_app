import styled from "styled-components";
import {
  Header,
  useAuth,
  TransferApi,
  ScheduleConfigButton,
} from "../../index";
import { useState, useEffect, useCallback } from "react";
import {
  FaServer,
  FaExchangeAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
  FaCalendarAlt,
  FaChartLine,
  FaHistory,
  FaDatabase,
  FaSync,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const cnnApi = new TransferApi();

export function Dashboard() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken } = useAuth();

  // Estados para almacenar datos
  const [lastTransfers, setLastTransfers] = useState([]);
  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    runningTasks: 0,
    completedToday: 0,
    failedToday: 0,
  });
  const [serverStatus, setServerStatus] = useState({
    server1: { status: "checking", responseTime: 0 },
    server2: { status: "checking", responseTime: 0 },
    mongodb: { status: "checking" },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextScheduled, setNextScheduled] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ ESTADOS PARA LA PROGRAMACIÓN (simplificados)
  const [executionTime, setExecutionTime] = useState("02:00");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // ✅ FUNCIÓN PARA OBTENER HORA PROGRAMADA
  const fetchScheduleTime = useCallback(async () => {
    try {
      setScheduleLoading(true);
      const response = await cnnApi.getSchuledTime(accessToken);
      if (response?.hour) {
        setExecutionTime(response.hour);

        // También actualizar nextScheduled para el display
        const [hour, minute] = response.hour.split(":");
        const nextRun = new Date();
        nextRun.setHours(Number(hour), Number(minute), 0, 0);

        if (nextRun < new Date()) {
          nextRun.setDate(nextRun.getDate() + 1);
        }

        setNextScheduled(nextRun);
      }
    } catch (error) {
      console.error("Error al obtener hora programada:", error);
    } finally {
      setScheduleLoading(false);
    }
  }, [accessToken]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Obtener tareas para estadísticas generales
      const tasksResponse = await cnnApi.getTasks(accessToken);

      // 2. Obtener historial de transferencias
      const historyResponse = await cnnApi.getTransferHistory(accessToken);
      console.log("Respuesta de historial:", historyResponse);

      // 3. Obtener hora programada
      const scheduledResponse = await cnnApi.getSchuledTime(accessToken);

      // 4. Obtener estado de servidores
      let serverStatusResponse;
      try {
        serverStatusResponse = await cnnApi.checkServerStatus(accessToken);
      } catch (serverError) {
        console.error("Error verificando servidores:", serverError);
        serverStatusResponse = {
          server1: { status: "unknown", responseTime: 0 },
          server2: { status: "unknown", responseTime: 0 },
          mongodb: { status: "unknown" },
        };
      }

      // Procesar datos de tareas
      if (Array.isArray(tasksResponse)) {
        const tasks = tasksResponse;
        const activeTasks = tasks.filter((t) => t.active).length;
        const runningTasks = tasks.filter((t) => t.status === "running").length;

        // Intentar obtener completedToday y failedToday del historial
        const completedToday = historyResponse?.completedToday || 0;
        const failedToday = historyResponse?.failedToday || 0;

        setStats({
          totalTasks: tasks.length,
          activeTasks,
          runningTasks,
          completedToday,
          failedToday,
        });

        console.log("Estadísticas actualizadas:", {
          totalTasks: tasks.length,
          activeTasks,
          runningTasks,
          completedToday,
          failedToday,
        });
      }

      // Procesar historial de transferencias
      if (historyResponse?.history) {
        // Procesar los datos para adaptarlos al formato esperado
        const formattedTransfers = historyResponse.history.map((item) => {
          // Formatear fecha (solo mostrar la fecha sin hora)
          const date = new Date(item.date);
          const formattedDate = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

          return {
            name: item.taskName || item.name || "N/A",
            date: item.date, // Mantener fecha original para ordenar
            displayDate: formattedDate, // Fecha formateada para mostrar
            status: item.status,
            totalRecords:
              item.totalRecords ||
              item.totalProducts ||
              item.successfulRecords ||
              0,
          };
        });

        // Tomar las 5 transferencias más recientes
        setLastTransfers(formattedTransfers.slice(0, 5));
        console.log(
          "Últimas transferencias formateadas:",
          formattedTransfers.slice(0, 5)
        );
      } else {
        setLastTransfers([]);
      }

      // Procesar tiempo programado
      if (scheduledResponse?.hour) {
        const [hour, minute] = scheduledResponse.hour.split(":");
        const nextRun = new Date();
        nextRun.setHours(Number(hour), Number(minute), 0, 0);

        // Si la hora ya pasó hoy, programar para mañana
        if (nextRun < new Date()) {
          nextRun.setDate(nextRun.getDate() + 1);
        }

        setNextScheduled(nextRun);
        setExecutionTime(scheduledResponse.hour);
      } else {
        // Establecer un valor por defecto si no se pudo obtener
        const defaultNextRun = new Date();
        defaultNextRun.setDate(defaultNextRun.getDate() + 1);
        defaultNextRun.setHours(2, 0, 0, 0); // Por defecto 2 AM
        setNextScheduled(defaultNextRun);
      }

      // Procesar estado de servidores
      if (serverStatusResponse) {
        setServerStatus(serverStatusResponse);
      }
    } catch (error) {
      console.error("Error cargando datos del dashboard:", error);
      setError(
        "Error al cargar los datos del dashboard. Por favor, intente nuevamente."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  // Cargar datos al iniciar
  useEffect(() => {
    fetchDashboardData();
    // También cargar la hora programada separadamente
    fetchScheduleTime();

    // Refrescar cada 60 segundos
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchScheduleTime();
    }, 60000);

    return () => clearInterval(interval);
  }, [accessToken, fetchScheduleTime]);

  // Función para refrescar manualmente
  const handleRefresh = () => {
    if (refreshing) return; // Evitar múltiples solicitudes simultáneas

    setRefreshing(true);
    fetchDashboardData();
  };

  // ✅ CALLBACK PARA CUANDO SE ACTUALIZA LA PROGRAMACIÓN
  const handleScheduleSuccess = (result) => {
    console.log("Configuración de programación actualizada:", result);

    // Actualizar el estado local
    if (result.hour) {
      setExecutionTime(result.hour);
    }

    // Refrescar todos los datos del dashboard
    fetchDashboardData();
    fetchScheduleTime();
  };

  // Determinar el texto y estilo según el estado del servidor
  const getServerStatusText = (status) => {
    switch (status) {
      case "online":
        return "Conectado";
      case "offline":
        return "Desconectado";
      case "checking":
        return "Verificando...";
      case "warning":
        return "Advertencia";
      default:
        return "Desconocido";
    }
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - Sistema Core ERP </title>
      </Helmet>
      <section className="main-content">
        <WelcomeSection>
          <WelcomeTitle>Panel de Control</WelcomeTitle>
          <WelcomeSubtitle>Sistema de Transferencia de Datos</WelcomeSubtitle>
          <RefreshButton onClick={handleRefresh} disabled={refreshing}>
            <FaSync /> {refreshing ? "Actualizando..." : "Actualizar"}
          </RefreshButton>
        </WelcomeSection>
      </section>

      <section className="main-content">
        <StatsContainer>
          <StatCard>
            <StatIcon>
              <FaServer />
            </StatIcon>
            <StatContent>
              <StatValue>{stats.totalTasks}</StatValue>
              <StatLabel>Tareas configuradas</StatLabel>
            </StatContent>
          </StatCard>

          <StatCard>
            <StatIcon>
              <FaExchangeAlt />
            </StatIcon>
            <StatContent>
              <StatValue>{stats.activeTasks}</StatValue>
              <StatLabel>Tareas activas</StatLabel>
            </StatContent>
          </StatCard>

          <StatCard highlight={stats.runningTasks > 0}>
            <StatIcon>
              <FaClock color={stats.runningTasks > 0 ? "#17a2b8" : undefined} />
            </StatIcon>
            <StatContent>
              <StatValue>{stats.runningTasks}</StatValue>
              <StatLabel>En ejecución</StatLabel>
            </StatContent>
          </StatCard>

          <StatCard>
            <StatIcon>
              <FaCheckCircle color="#28a745" />
            </StatIcon>
            <StatContent>
              <StatValue>{stats.completedToday}</StatValue>
              <StatLabel>Completadas hoy</StatLabel>
            </StatContent>
          </StatCard>

          <StatCard highlight={stats.failedToday > 0}>
            <StatIcon>
              <FaExclamationTriangle
                color={stats.failedToday > 0 ? "#dc3545" : undefined}
              />
            </StatIcon>
            <StatContent>
              <StatValue>{stats.failedToday}</StatValue>
              <StatLabel>Fallidas hoy</StatLabel>
            </StatContent>
          </StatCard>
        </StatsContainer>

        {loading && !refreshing ? (
          <LoadingContainer>
            <LoadingSpinner />
            <LoadingText>Cargando información del sistema...</LoadingText>
          </LoadingContainer>
        ) : error ? (
          <ErrorContainer>
            <ErrorIcon />
            <ErrorText>{error}</ErrorText>
            <RetryButton onClick={fetchDashboardData}>Reintentar</RetryButton>
          </ErrorContainer>
        ) : (
          <DashboardGrid>
            {/* Panel de estado de servidores */}
            <DashboardCard>
              <CardHeader>
                <CardTitle>
                  <FaServer /> Estado de Servidores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServerStatusGrid>
                  <ServerStatusItem
                    status={serverStatus.server1?.status || "unknown"}
                  >
                    <ServerStatusIcon
                      status={serverStatus.server1?.status || "unknown"}
                    />
                    <ServerStatusName>Server 1</ServerStatusName>
                    <ServerStatusDetails>
                      {serverStatus.server1?.status === "online"
                        ? `Conectado (${
                            serverStatus.server1.responseTime || 0
                          }ms)`
                        : serverStatus.server1?.status === "offline"
                        ? "Desconectado"
                        : "Estado desconocido"}
                    </ServerStatusDetails>
                  </ServerStatusItem>

                  <ServerStatusItem
                    status={serverStatus.server2?.status || "unknown"}
                  >
                    <ServerStatusIcon
                      status={serverStatus.server2?.status || "unknown"}
                    />
                    <ServerStatusName>Server 2</ServerStatusName>
                    <ServerStatusDetails>
                      {serverStatus.server2?.status === "online"
                        ? `Conectado (${
                            serverStatus.server2.responseTime || 0
                          }ms)`
                        : serverStatus.server2?.status === "offline"
                        ? "Desconectado"
                        : "Estado desconocido"}
                    </ServerStatusDetails>
                  </ServerStatusItem>

                  <ServerStatusItem
                    status={serverStatus.mongodb?.status || "unknown"}
                  >
                    <ServerStatusIcon
                      status={serverStatus.mongodb?.status || "unknown"}
                    />
                    <ServerStatusName>MongoDB</ServerStatusName>
                    <ServerStatusDetails>
                      {getServerStatusText(
                        serverStatus.mongodb?.status || "unknown"
                      )}
                    </ServerStatusDetails>
                  </ServerStatusItem>
                </ServerStatusGrid>
              </CardContent>
            </DashboardCard>

            {/* Panel de próxima ejecución */}
            <DashboardCard>
              <CardHeader>
                <CardTitle>
                  <FaCalendarAlt /> Próxima Ejecución
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NextRunInfo>
                  <NextRunTime>
                    {nextScheduled
                      ? nextScheduled.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "No programada"}
                  </NextRunTime>
                  <NextRunDate>
                    {nextScheduled
                      ? nextScheduled.toLocaleDateString([], {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })
                      : "Configure una hora en la sección de tareas"}
                  </NextRunDate>
                  <NextRunDetails>
                    Se ejecutarán todas las tareas activas configuradas como
                    automáticas.
                  </NextRunDetails>
                </NextRunInfo>
              </CardContent>
              <CardFooter>
                <ScheduleConfigButton
                  disabled={loading || scheduleLoading}
                  onSuccess={handleScheduleSuccess}
                />
              </CardFooter>
            </DashboardCard>

            {/* Panel de últimas transferencias */}
            <DashboardCard fullWidth>
              <CardHeader>
                <CardTitle>
                  <FaHistory /> Últimas Transferencias
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lastTransfers.length > 0 ? (
                  <TransferTable>
                    <thead>
                      <tr>
                        <th>Tarea</th>
                        <th>Fecha</th>
                        <th>Registros</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastTransfers.map((transfer, index) => (
                        <tr key={index}>
                          <td>{transfer.name || transfer.taskName || "N/A"}</td>
                          <td>{new Date(transfer.date).toLocaleString()}</td>
                          <td>
                            {transfer.totalRecords ||
                              transfer.totalProducts ||
                              transfer.successfulRecords ||
                              0}
                          </td>
                          <td>
                            <TransferStatus status={transfer.status}>
                              {transfer.status === "completed"
                                ? "Completada"
                                : transfer.status === "failed" ||
                                  transfer.status === "error"
                                ? "Fallida"
                                : transfer.status === "cancelled"
                                ? "Cancelada"
                                : transfer.status === "running"
                                ? "En ejecución"
                                : transfer.status || "Desconocido"}
                            </TransferStatus>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TransferTable>
                ) : (
                  <EmptyState>
                    No hay registros de transferencias recientes
                  </EmptyState>
                )}
              </CardContent>
              <CardFooter>
                <Link to="/historys">
                  <ActionButton>Ver historial completo</ActionButton>
                </Link>
              </CardFooter>
            </DashboardCard>

            {/* Panel de accesos rápidos */}
            <DashboardCard>
              <CardHeader>
                <CardTitle>Acciones Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <QuickActionsGrid>
                  <QuickActionItem to="/tasks">
                    <QuickActionIcon>
                      <FaExchangeAlt />
                    </QuickActionIcon>
                    <QuickActionText>Gestionar Tareas</QuickActionText>
                  </QuickActionItem>

                  <QuickActionItem to="/logs">
                    <QuickActionIcon>
                      <FaDatabase />
                    </QuickActionIcon>
                    <QuickActionText>Ver Logs</QuickActionText>
                  </QuickActionItem>

                  <QuickActionItem to="/historys">
                    <QuickActionIcon>
                      <FaHistory />
                    </QuickActionIcon>
                    <QuickActionText>Historial</QuickActionText>
                  </QuickActionItem>

                  <QuickActionItem to="/analytics">
                    <QuickActionIcon>
                      <FaChartLine />
                    </QuickActionIcon>
                    <QuickActionText>Estadísticas</QuickActionText>
                  </QuickActionItem>
                </QuickActionsGrid>
              </CardContent>
            </DashboardCard>

            {/* Panel de transferencias por día (datos reales) */}
            <DashboardCard>
              <CardHeader>
                <CardTitle>
                  <FaChartLine /> Rendimiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartPlaceholder>
                  <ChartText>Resumen de actividad</ChartText>
                  <ChartStats>
                    <ChartStat>
                      <ChartStatValue>
                        {stats.completedToday + stats.failedToday}
                      </ChartStatValue>
                      <ChartStatLabel>Ejecuciones hoy</ChartStatLabel>
                    </ChartStat>
                    <ChartStat>
                      <ChartStatValue>
                        {stats.completedToday + stats.failedToday > 0
                          ? (
                              (stats.completedToday /
                                (stats.completedToday + stats.failedToday)) *
                              100
                            ).toFixed(1) + "%"
                          : "N/A"}
                      </ChartStatValue>
                      <ChartStatLabel>Tasa de éxito</ChartStatLabel>
                    </ChartStat>
                  </ChartStats>
                </ChartPlaceholder>
              </CardContent>
              <CardFooter>
                <Link to="/analytics">
                  <ActionButton>Ver análisis detallado</ActionButton>
                </Link>
              </CardFooter>
            </DashboardCard>
          </DashboardGrid>
        )}
      </section>
    </>
  );
}

const WelcomeSection = styled.div`
  text-align: center;
  padding: 15px 0;
`;

const WelcomeTitle = styled.h1`
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0;
  color: ${({ theme }) => theme.title || theme.text};
`;

const WelcomeSubtitle = styled.p`
  font-size: 1rem;
  margin: 5px 0 0;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const StatsContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 15px;
  width: 100%;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 10px;
  }
`;

const StatCard = styled.div`
  background-color: ${({ theme, highlight }) =>
    highlight ? "rgba(23, 162, 184, 0.1)" : theme.cardBg || "#fff"};
  border-radius: 8px;
  padding: 15px;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 160px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-3px);
  }

  @media (max-width: 768px) {
    min-width: calc(50% - 10px);
    flex: 0 0 calc(50% - 10px);
  }

  @media (max-width: 480px) {
    min-width: 100%;
    flex: 0 0 100%;
  }
`;

const StatIcon = styled.div`
  font-size: 28px;
  color: ${({ theme }) => theme.primary || "#007bff"};
  margin-right: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StatContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatValue = styled.div`
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
`;

const StatLabel = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const DashboardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 20px;

  @media (max-width: 992px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 576px) {
    gap: 15px; /* Gap más pequeño en móviles */
  }
`;

const DashboardCard = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  grid-column: ${({ fullWidth }) => (fullWidth ? "1 / -1" : "auto")};
`;

const CardHeader = styled.div`
  padding: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
`;

const CardTitle = styled.h2`
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

const CardContent = styled.div`
  padding: 15px;
  flex: 1;

  @media (max-width: 480px) {
    padding: 12px 10px; /* Menos padding en móviles pequeños */
  }
`;

const CardFooter = styled.div`
  padding: 10px 15px;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  display: flex;
  justify-content: flex-end;
`;

const ServerStatusGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const ServerStatusItem = styled.div`
  display: flex;
  align-items: center;
  background-color: ${({ status, theme }) => {
    if (status === "online") return "rgba(40, 167, 69, 0.1)";
    if (status === "offline") return "rgba(220, 53, 69, 0.1)";
    if (status === "checking") return "rgba(108, 117, 125, 0.1)";
    return theme.cardBg || "#fff";
  }};
  padding: 12px;
  border-radius: 6px;
`;

const ServerStatusIcon = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${({ status }) => {
    if (status === "online") return "#28a745";
    if (status === "offline") return "#dc3545";
    if (status === "warning") return "#ffc107";
    return "#6c757d";
  }};
  margin-right: 10px;
`;

const ServerStatusName = styled.div`
  font-weight: 500;
  flex: 1;
`;

const ServerStatusDetails = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const NextRunInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 15px 0;
`;

const NextRunTime = styled.div`
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 5px;
`;

const NextRunDate = styled.div`
  font-size: 16px;
  margin-bottom: 15px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const NextRunDetails = styled.div`
  font-size: 13px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const TransferTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  }

  th {
    font-size: 14px;
    font-weight: 600;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }

  td {
    font-size: 14px;
  }
`;

const TransferStatus = styled.span`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 12px;

  background-color: ${({ status }) => {
    switch (status) {
      case "completed":
        return "rgba(40, 167, 69, 0.1)";
      case "failed":
        return "rgba(220, 53, 69, 0.1)";
      case "running":
        return "rgba(0, 123, 255, 0.1)";
      default:
        return "rgba(108, 117, 125, 0.1)";
    }
  }};

  color: ${({ status }) => {
    switch (status) {
      case "completed":
        return "#28a745";
      case "failed":
        return "#dc3545";
      case "running":
        return "#007bff";
      default:
        return "#6c757d";
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 30px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  font-style: italic;
`;

const QuickActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
`;

const QuickActionItem = styled(Link)`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border: 1px solid ${({ theme }) => theme.border || "#eee"};
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }
`;

const QuickActionIcon = styled.div`
  font-size: 24px;
  color: ${({ theme }) => theme.primary || "#007bff"};
  margin-bottom: 8px;
`;

const QuickActionText = styled.div`
  font-size: 14px;
  font-weight: 500;
  text-align: center;
`;

const ChartPlaceholder = styled.div`
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const ChartText = styled.div`
  margin-bottom: 20px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const ChartStats = styled.div`
  display: flex;
  gap: 20px;
`;

const ChartStat = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const ChartStatValue = styled.div`
  font-size: 22px;
  font-weight: 600;
`;

const ChartStatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: transparent;
  border: 1px solid ${({ theme }) => theme.border || "#ddd"};
  color: ${({ theme }) => theme.text};
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 10px;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.hoverBg || "#f8f9fa"};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  svg {
    animation: ${({ disabled }) =>
      disabled ? "spin 1s linear infinite" : "none"};
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 200px;
  gap: 15px;
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: ${(props) => (props.size === "large" ? "60px" : "40px")};
  height: ${(props) => (props.size === "large" ? "60px" : "40px")};
  border: 4px solid rgba(23, 162, 184, 0.2);
  border-radius: 50%;
  border-top-color: #17a2b8;
  animation: spinner-rotate 1s linear infinite;

  &::after {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    bottom: 4px;
    border: 3px solid transparent;
    border-top-color: #17a2b8;
    border-radius: 50%;
    animation: spinner-rotate 0.8s linear infinite reverse;
  }

  @keyframes spinner-rotate {
    from {
      transform: rotate(0deg);
    }
    to {
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
  min-height: 200px;
  background-color: rgba(220, 53, 69, 0.05);
  border-radius: 8px;
  padding: 30px;
`;

const ErrorIcon = styled(FaExclamationTriangle)`
  color: #dc3545;
  font-size: 32px;
  margin-bottom: 15px;
`;

const ErrorText = styled.div`
  color: #dc3545;
  text-align: center;
  margin-bottom: 20px;
`;

const RetryButton = styled.button`
  background-color: ${({ theme }) => theme.primary || "#007bff"};
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover || "#0056b3"};
  }
`;
const ScheduleButtonGroup = styled.div`
  /* background-color: ${({ theme }) => theme.primary || "#007bff"}; */
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover || "#0056b3"};
  }

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const ActionButton = styled.button`
  background-color: ${({ theme }) => theme.primary || "#007bff"};
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover || "#0056b3"};
  }
`;
