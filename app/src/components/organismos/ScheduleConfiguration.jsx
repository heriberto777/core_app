import React, { useState, useEffect } from "react";
import styled from "styled-components";
import {
  FaClock,
  FaSync,
  FaCheck,
  FaTimes,
  FaInfoCircle,
  FaShieldAlt,
  FaHistory,
  FaPlay,
  FaEye,
  FaTasks,
  FaEnvelope,
  FaListOl,
  FaCog,
  FaUser,
} from "react-icons/fa";
import { useAuth, TransferApi, ScheduleConfigButton } from "../../index";

const cnnApi = new TransferApi();

export function ScheduleConfiguration() {
  const { accessToken } = useAuth();
  const [scheduleConfig, setScheduleConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taskStats, setTaskStats] = useState({
    total: 0,
    automatic: 0,
    manual: 0,
    inactive: 0,
  });

  // Cargar configuración actual
  useEffect(() => {
    loadScheduleConfig();
    loadTaskStats();
  }, []);

  const loadScheduleConfig = async () => {
    try {
      const config = await cnnApi.getSchuledTime(accessToken);
      setScheduleConfig(config);
    } catch (error) {
      console.error("Error al cargar configuración:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskStats = async () => {
    try {
      // Datos simulados - puedes conectar con API real
      setTaskStats({
        total: 12,
        automatic: 8,
        manual: 3,
        inactive: 1,
      });
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
    }
  };

  const handleConfigSuccess = (result) => {
    console.log("Configuración actualizada:", result);
    setScheduleConfig({
      hour: result.hour,
      enabled: result.enabled,
    });
  };

  const getNextExecutionTime = () => {
    if (!scheduleConfig?.enabled || !scheduleConfig?.hour) {
      return "Programación desactivada";
    }

    const [hours, minutes] = scheduleConfig.hour.split(":").map(Number);
    const nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    if (nextRun < new Date()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const timeString = nextRun.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const dateString = nextRun.toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const timeUntil = Math.ceil((nextRun - new Date()) / (1000 * 60 * 60));

    return {
      time: timeString,
      date: dateString,
      hoursUntil:
        timeUntil > 24
          ? Math.floor(timeUntil / 24) + " días"
          : timeUntil + " horas",
    };
  };

  const nextExecution = getNextExecutionTime();

  return (
    <ScheduleContainer>
      <ScheduleHeader>
        <div>
          <h2>
            <FaClock /> Configuración de Programación Automática
          </h2>
          <p>
            Configura cuándo se ejecutarán automáticamente las tareas del
            sistema y revisa el estado actual.
          </p>
        </div>
        <ScheduleConfigButton onSuccess={handleConfigSuccess} />
      </ScheduleHeader>

      {loading ? (
        <LoadingCard>
          <FaSync className="spinning" />
          <span>Cargando configuración...</span>
        </LoadingCard>
      ) : (
        <ScheduleContent>
          {/* Estado Actual */}
          <StatusCard $enabled={scheduleConfig?.enabled}>
            <StatusHeader>
              <StatusIcon $enabled={scheduleConfig?.enabled}>
                {scheduleConfig?.enabled ? <FaCheck /> : <FaTimes />}
              </StatusIcon>
              <div>
                <StatusTitle>Estado del Programador</StatusTitle>
                <StatusSubtitle>
                  {scheduleConfig?.enabled ? "Activo" : "Inactivo"}
                </StatusSubtitle>
              </div>
            </StatusHeader>

            {scheduleConfig?.enabled && (
              <StatusDetails>
                <DetailItem>
                  <strong>Hora configurada:</strong> {scheduleConfig.hour}
                </DetailItem>
                {typeof nextExecution === "object" && (
                  <>
                    <DetailItem>
                      <strong>Próxima ejecución:</strong> {nextExecution.time} -{" "}
                      {nextExecution.date}
                    </DetailItem>
                    <DetailItem>
                      <strong>Tiempo restante:</strong>{" "}
                      {nextExecution.hoursUntil}
                    </DetailItem>
                  </>
                )}
              </StatusDetails>
            )}

            {!scheduleConfig?.enabled && (
              <StatusDetails>
                <DetailItem>
                  Las tareas automáticas están desactivadas. Solo se ejecutarán
                  manualmente.
                </DetailItem>
              </StatusDetails>
            )}
          </StatusCard>

          {/* Estadísticas de Tareas */}
          <StatsGrid>
            <StatCard>
              <StatIcon $color="#007bff">
                <FaListOl />
              </StatIcon>
              <StatContent>
                <StatNumber>{taskStats.total}</StatNumber>
                <StatLabel>Total de Tareas</StatLabel>
              </StatContent>
            </StatCard>

            <StatCard>
              <StatIcon $color="#28a745">
                <FaCog />
              </StatIcon>
              <StatContent>
                <StatNumber>{taskStats.automatic}</StatNumber>
                <StatLabel>Tareas Automáticas</StatLabel>
              </StatContent>
            </StatCard>

            <StatCard>
              <StatIcon $color="#ffc107">
                <FaUser />
              </StatIcon>
              <StatContent>
                <StatNumber>{taskStats.manual}</StatNumber>
                <StatLabel>Tareas Manuales</StatLabel>
              </StatContent>
            </StatCard>

            <StatCard>
              <StatIcon $color="#dc3545">
                <FaTimes />
              </StatIcon>
              <StatContent>
                <StatNumber>{taskStats.inactive}</StatNumber>
                <StatLabel>Tareas Inactivas</StatLabel>
              </StatContent>
            </StatCard>
          </StatsGrid>

          {/* Información Adicional */}
          <InfoSection>
            <InfoCard>
              <InfoHeader>
                <FaInfoCircle />
                <h3>¿Cómo funciona la programación automática?</h3>
              </InfoHeader>
              <InfoContent>
                <InfoList>
                  <li>
                    <strong>Ejecución diaria:</strong> El sistema ejecuta
                    automáticamente todas las tareas marcadas como "automáticas"
                    a la hora configurada.
                  </li>
                  <li>
                    <strong>Tareas incluidas:</strong> Solo se ejecutan las
                    tareas con tipo "automático" o "ambas" que estén activas.
                  </li>
                  <li>
                    <strong>Logs y seguimiento:</strong> Todas las ejecuciones
                    automáticas se registran en el sistema de logs.
                  </li>
                  <li>
                    <strong>Manejo de errores:</strong> Si una tarea falla, se
                    registra el error y continúa con las siguientes tareas.
                  </li>
                </InfoList>
              </InfoContent>
            </InfoCard>

            <InfoCard>
              <InfoHeader>
                <FaShieldAlt />
                <h3>Consideraciones importantes</h3>
              </InfoHeader>
              <InfoContent>
                <InfoList>
                  <li>
                    <strong>Recursos del servidor:</strong> Las tareas
                    automáticas consumen recursos. Evita programar en horas
                    pico.
                  </li>
                  <li>
                    <strong>Conexiones de red:</strong> Asegúrate de que las
                    conexiones a bases de datos estén disponibles.
                  </li>
                  <li>
                    <strong>Notificaciones:</strong> Configura destinatarios de
                    email para recibir reportes de ejecución.
                  </li>
                  <li>
                    <strong>Monitoreo:</strong> Revisa regularmente los logs
                    para detectar problemas.
                  </li>
                </InfoList>
              </InfoContent>
            </InfoCard>
          </InfoSection>

          {/* Historial Reciente */}
          <HistorySection>
            <HistoryHeader>
              <h3>
                <FaHistory /> Últimas Ejecuciones Automáticas
              </h3>
              <ViewAllButton>Ver Historial Completo</ViewAllButton>
            </HistoryHeader>

            <HistoryTable>
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Tareas Ejecutadas</th>
                  <th>Estado</th>
                  <th>Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>06/06/2025 02:00:15</td>
                  <td>8 tareas</td>
                  <td>
                    <SuccessBadge>Exitoso</SuccessBadge>
                  </td>
                  <td>12m 34s</td>
                </tr>
                <tr>
                  <td>05/06/2025 02:00:12</td>
                  <td>7 tareas</td>
                  <td>
                    <WarningBadge>Con advertencias</WarningBadge>
                  </td>
                  <td>15m 22s</td>
                </tr>
                <tr>
                  <td>04/06/2025 02:00:08</td>
                  <td>8 tareas</td>
                  <td>
                    <SuccessBadge>Exitoso</SuccessBadge>
                  </td>
                  <td>11m 45s</td>
                </tr>
              </tbody>
            </HistoryTable>
          </HistorySection>

          {/* Acciones Rápidas */}
          <QuickActions>
            <h3>Acciones Rápidas</h3>
            <ActionButtons>
              <ActionButton $color="#007bff">
                <FaPlay /> Ejecutar Ahora
              </ActionButton>
              <ActionButton $color="#28a745">
                <FaEye /> Ver Logs
              </ActionButton>
              <ActionButton $color="#6f42c1">
                <FaTasks /> Gestionar Tareas
              </ActionButton>
              <ActionButton $color="#17a2b8">
                <FaEnvelope /> Config. Email
              </ActionButton>
            </ActionButtons>
          </QuickActions>
        </ScheduleContent>
      )}
    </ScheduleContainer>
  );
}

// Estilos
const ScheduleContainer = styled.div`
  h2 {
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
    display: flex;
    align-items: center;
    gap: 10px;
  }

  p {
    color: ${({ theme }) => theme.textSecondary};
    margin-bottom: 20px;
  }
`;

const ScheduleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const LoadingCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 40px;
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  color: ${({ theme }) => theme.textSecondary};

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ScheduleContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 25px;
`;

const StatusCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${({ $enabled }) => ($enabled ? "#28a745" : "#dc3545")};
`;

const StatusHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 15px;
`;

const StatusIcon = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: ${({ $enabled }) => ($enabled ? "#28a745" : "#dc3545")};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
`;

const StatusTitle = styled.h3`
  margin: 0;
  color: ${({ theme }) => theme.title};
  font-size: 18px;
`;

const StatusSubtitle = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 14px;
`;

const StatusDetails = styled.div`
  padding-left: 65px;
`;

const DetailItem = styled.div`
  margin-bottom: 8px;
  color: ${({ theme }) => theme.text};
  font-size: 14px;
  line-height: 1.4;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-2px);
  }
`;

const StatIcon = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: ${({ $color }) => $color}15;
  color: ${({ $color }) => $color};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
`;

const StatContent = styled.div``;

const StatNumber = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.title};
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.textSecondary};
  font-weight: 500;
`;

const InfoSection = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const InfoCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const InfoHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;

  svg {
    color: ${({ theme }) => theme.primary};
    font-size: 20px;
  }

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.title};
    font-size: 16px;
  }
`;

const InfoContent = styled.div``;

const InfoList = styled.ul`
  margin: 0;
  padding-left: 20px;
  color: ${({ theme }) => theme.text};

  li {
    margin-bottom: 10px;
    line-height: 1.5;
    font-size: 14px;

    strong {
      color: ${({ theme }) => theme.title};
    }
  }
`;

const HistorySection = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const HistoryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.title};
    display: flex;
    align-items: center;
    gap: 10px;
  }
`;

const ViewAllButton = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.primary};
  color: ${({ theme }) => theme.primary};
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.primary};
    color: white;
  }
`;

const HistoryTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border};
  }

  th {
    background: ${({ theme }) => theme.tableHeader};
    color: ${({ theme }) => theme.tableHeaderText};
    font-weight: 600;
    font-size: 13px;
  }

  td {
    color: ${({ theme }) => theme.text};
    font-size: 14px;
  }
`;

const SuccessBadge = styled.span`
  background: #28a745;
  color: white;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
`;

const WarningBadge = styled.span`
  background: #ffc107;
  color: #212529;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
`;

const QuickActions = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  h3 {
    margin: 0 0 15px 0;
    color: ${({ theme }) => theme.title};
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: ${({ $color }) => $color};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;

  &:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
`;
