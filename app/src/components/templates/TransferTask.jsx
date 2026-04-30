import React, { useState, useMemo } from "react";
import styled, { keyframes } from "styled-components";
import { Helmet } from "react-helmet-async";
import {
  FaPlus, FaSync, FaLink, FaChartLine, FaList, FaTable,
  FaEdit, FaTrash, FaPlay, FaStop, FaHistory, FaEye, FaTimes, FaExclamationTriangle, FaFilter
} from "react-icons/fa";
import {
  useTransferTask,
  usePermissions,
  useAuth,
  TaskMetricsPanel,
  TaskFormModal,
  Button,
  StatusBadge,
  LoadingUI,
  ContentHeader,
  FilterInput,
  LinkedGroupsManager,
  TransferTaskApi
} from "../../index";

const taskApi = new TransferTaskApi();

// === ANIMACIONES ===
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// === ESTILOS BASE (GLASSMORPHISM) ===
const Container = styled.div`
  display: flex; flex-direction: column; gap: ${({ theme }) => theme.spacing.lg};
  animation: ${fadeIn} 0.4s ease-out;
`;

const ActionsBar = styled.div`
  display: flex; flex-wrap: wrap; gap: ${({ theme }) => theme.spacing.md};
  align-items: center; justify-content: space-between;
  background: ${({ theme }) => theme.cardBg};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border};
  backdrop-filter: blur(10px);
`;

const SearchInputContainer = styled.div`
  flex: 1; min-width: 250px;
`;

const FiltersContainer = styled.div`
  display: flex; gap: 15px; align-items: center;
`;

const ButtonsRow = styled.div`
  display: flex; gap: 10px; width: 100%; justify-content: flex-end;
  margin-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.border}40;
  padding-top: 10px;
`;

const ViewButtonsGroup = styled.div`
  display: flex; background: ${({ theme }) => theme.bg2}; 
  border-radius: 8px; padding: 2px; border: 1px solid ${({ theme }) => theme.border};
`;

const FiltersGroup = styled.div`
  display: flex; gap: ${({ theme }) => theme.spacing.sm}; align-items: center;
`;

const Select = styled.select`
  padding: 8px 12px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-size: 13px; font-weight: 500;
  cursor: pointer; &:focus { border-color: ${({ theme }) => theme.primary}; outline: none; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Card = styled.div`
  background: ${({ theme, $active }) => $active ? theme.cardBg : `${theme.bg2}80`};
  border-radius: 16px;
  border: 1px solid ${({ theme, $status }) =>
    $status === 'running' ? theme.primary : theme.border};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  box-shadow: ${({ theme }) => theme.shadows.premium};

  &:hover {
    transform: translateY(-4px);
    border-color: ${({ theme }) => theme.primary}80;
    box-shadow: 0 12px 24px rgba(0,0,0,0.15);
  }
`;

const CardHeader = styled.div`
  padding: 16px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}40;
`;

const CardBody = styled.div`
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  background: ${({ theme }) => theme.bg2}40;
  padding: 10px;
  border-radius: 8px;
`;

const CardInfo = styled.div`
  display: flex; flex-direction: column; gap: 6px;
`;

const InfoItem = styled.div`
  display: flex; justify-content: space-between; font-size: 13px;
`;

const InfoLabel = styled.span`
  color: ${({ theme }) => theme.textSecondary}; font-weight: 500;
`;

const InfoValue = styled.span`
  color: ${({ theme }) => theme.text}; font-weight: 600;
`;

const CardFooter = styled.div`
  padding: 12px 16px; background: ${({ theme }) => theme.bg2}20;
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 8px;
`;

const ProgressBar = styled.div`
  height: 8px; background: ${({ theme }) => theme.border};
  border-radius: 4px; overflow: hidden; margin-top: 8px;
`;

const ProgressFill = styled.div`
  height: 100%; background: ${({ theme }) => theme.primary};
  width: ${({ $width }) => $width}%; transition: width 0.5s ease;
  box-shadow: 0 0 8px ${({ theme }) => theme.primary}80;
`;

const EmptyState = styled.div`
  text-align: center; padding: 60px; color: ${({ theme }) => theme.textSecondary};
  background: ${({ theme }) => theme.cardBg}; border-radius: 12px;
  border: 1px dashed ${({ theme }) => theme.border};
`;

// === COMPONENTE PRINCIPAL ===
export function TransferTasks() {
  const {
    tasks, allTasks, loading, refreshing, filters, search,
    taskEstimates, setSearch, setFilters,
    handleFilterChange, fetchTasks,
    deleteTask, executeTask, cancelTask, getTaskHistory, saveTask, actionStates
  } = useTransferTask();

  const { hasPermission, isAdmin } = usePermissions();
  const { accessToken } = useAuth();

  const canCreateTask = hasPermission("tasks", "create") || isAdmin;
  const canEditTask = hasPermission("tasks", "update") || isAdmin;
  const canDeleteTask = hasPermission("tasks", "delete") || isAdmin;
  const canExecuteTask = hasPermission("tasks", "execute") || hasPermission("loads", "create") || isAdmin;

  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGroupsManager, setShowGroupsManager] = useState(false);
  const [viewMode, setViewMode] = useState("cards");
  const [showMetrics, setShowMetrics] = useState(true);
  const [linkedTasksModal, setLinkedTasksModal] = useState({ open: false, task: null, linkedTasks: [] });
  const [historyModal, setHistoryModal] = useState({ open: false, taskId: null, data: [], loading: false, filter: 'all' });
  const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '', details: '' });

  const handleEdit = (task) => {
    if (!canEditTask) return;
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    if (!canCreateTask) return;
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  const openLinkedTasksModal = async (task) => {
    let linkedTasksData = [];
    
    if (task.linkedGroup) {
      try {
        const response = await taskApi.getGroupDetails(accessToken, task.linkedGroup);
        console.log("Response del grupo:", response);
        // La API devuelve los datos directamente (sin wrapper data)
        if (response && response.tasks) {
          linkedTasksData = response.tasks;
        } else if (response && response.success && response.data && response.data.tasks) {
          // Por si acaso hay wrapper data
          linkedTasksData = response.data.tasks;
        }
      } catch (error) {
        console.error("Error al obtener tareas del grupo:", error);
      }
    } else if (task.linkedTasks && task.linkedTasks.length > 0) {
      const linkedIds = task.linkedTasks || [];
      linkedTasksData = (allTasks || []).filter(t => linkedIds.includes(t._id));
    }
    
    console.log("linkedTasksData:", linkedTasksData);
    setLinkedTasksModal({ open: true, task, linkedTasks: linkedTasksData });
  };

  const handleViewHistory = async (task) => {
    setHistoryModal({ open: true, taskId: task._id, data: [], loading: true, filter: 'all' });
    try {
      const historyData = await getTaskHistory(task._id);
      setHistoryModal(prev => ({ ...prev, data: historyData?.history || [], loading: false }));
    } catch (error) {
      console.error("Error al obtener historial:", error);
      setHistoryModal(prev => ({ ...prev, loading: false, data: [] }));
    }
  };

  const handleViewError = (title, message, details) => {
    setErrorModal({ open: true, title, message, details });
  };

  const handleSave = async (formData) => {
    const success = await saveTask(formData, !!selectedTask);
    if (success) setIsModalOpen(false);
  };

  return (
    <Container>
      <Helmet>
        <title>Tareas - Core ERP Premium</title>
      </Helmet>

      <ContentHeader
        title="Gestor de Tareas de Sincronización"
        description="Monitoriza y configura el flujo de datos en tiempo real entre tus sucursales."
      />

      {showMetrics && <TaskMetricsPanel tasks={allTasks} />}

      <ActionsBar>
        <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
          <FilterInput
            placeholder="Buscar por nombre de tarea..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FiltersGroup>
            <Select value={filters.type} onChange={(e) => handleFilterChange("type", e.target.value)}>
              <option value="all">Tipos: Todos</option>
              <option value="manual">Manuales</option>
              <option value="auto">Automáticas</option>
            </Select>
            <Select value={filters.status} onChange={(e) => handleFilterChange("status", e.target.value)}>
              <option value="all">Estados: Todos</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </Select>
          </FiltersGroup>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {canCreateTask && (
            <Button variant="success" onClick={handleCreate}><FaPlus /> Nueva Tarea</Button>
          )}
          <Button variant="primary" onClick={fetchTasks} loading={refreshing}>
            <FaSync className={refreshing ? "spinning" : ""} /> {refreshing ? "Sincronizando..." : "Refrescar"}
          </Button>
          {isAdmin && (
            <Button variant="secondary" onClick={() => setShowGroupsManager(true)}><FaLink /> Grupos</Button>
          )}
          <Button variant="secondary" onClick={() => setShowMetrics(!showMetrics)}>
            <FaChartLine /> {showMetrics ? "Cerrar" : "Ver"} Métricas
          </Button>
          <div style={{ display: 'flex', background: '#eee', borderRadius: '8px', padding: '2px' }}>
            <Button variant={viewMode === "cards" ? "primary" : "ghost"} onClick={() => setViewMode("cards")} style={{ padding: '6px 12px' }}><FaList /></Button>
            <Button variant={viewMode === "table" ? "primary" : "ghost"} onClick={() => setViewMode("table")} style={{ padding: '6px 12px' }}><FaTable /></Button>
          </div>
        </div>
      </ActionsBar>

      <div style={{ position: "relative", minHeight: '300px' }}>
        {refreshing && <LoadingUI overlay message="Actualizando estados..." />}
        {loading && !refreshing && <LoadingUI message="Cargando repositorio..." />}

        {!loading && tasks.length === 0 && (
          <EmptyState>
            <FaList size={40} style={{ opacity: 0.3, marginBottom: '15px' }} />
            <p>No se encontraron tareas con estos criterios.</p>
            <Button variant="primary" onClick={() => setSearch("")} style={{ marginTop: '10px' }}>Limpiar Búsqueda</Button>
          </EmptyState>
        )}

        {viewMode === "cards" ? (
          <Grid>
            {tasks.map(task => (
              <Card key={task._id} $active={task.active} $status={task.status}>
                <CardHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <strong style={{ fontSize: '15px' }}>{task.name}</strong>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <StatusBadge status={task.status || (task.active ? "active" : "inactive")} />
                      {!task.active && <span style={{ fontSize: '10px', color: '#dc3545', fontWeight: 600 }}>INACTIVA</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <InfoGrid>
                    <InfoItem>
                      <InfoLabel>Tipo</InfoLabel>
                      <InfoValue style={{ textTransform: 'capitalize' }}>{task.type}</InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Transfer</InfoLabel>
                      <InfoValue>
                        {task.transferType === 'up' && '↑ Up'}
                        {task.transferType === 'down' && '↓ Down'}
                        {task.transferType === 'internal' && '⇄ Internal'}
                        {task.transferType === 'general' && '○ General'}
                        {!task.transferType && '○ General'}
                      </InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Vinculada</InfoLabel>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <InfoValue style={{ color: task.linkedGroup || (task.linkedTasks?.length > 0) ? '#10b981' : '#999' }}>
                          {task.linkedGroup ? `Grupo: ${task.linkedGroup}` : (task.linkedTasks?.length > 0 ? `${task.linkedTasks.length} tareas` : 'No')}
                        </InfoValue>
                        {(task.linkedTasks?.length > 0 || task.linkedGroup) && (
                          <Button 
                            variant="ghost" 
                            style={{ padding: '2px 6px', fontSize: '10px' }}
                            onClick={() => openLinkedTasksModal(task)}
                            title="Ver tareas vinculadas"
                          >
                            <FaEye />
                          </Button>
                        )}
                      </div>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Última Ejecución</InfoLabel>
                      <InfoValue>
                        {(task.lastExecutionResult?.success === false || task.status === 'error') && task.lastExecutionResult?.errorDetails ? (
                          <span 
                            style={{ color: '#dc3545', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}
                            onClick={() => handleViewError(
                              `Error en ${task.name}`,
                              task.lastExecutionResult?.message || 'Error en la transferencia',
                              task.lastExecutionResult?.errorDetails || 'Sin detalles'
                            )}
                          >
                            <FaExclamationTriangle size={10} style={{ marginRight: '4px' }} />
                            {task.lastExecutionResult?.message || 'Error'}
                          </span>
                        ) : task.lastExecutionResult?.success ? (
                          <span style={{ color: '#198754', fontSize: '11px' }}>
                            ✓ {task.lastExecutionResult?.message || 'Completado'} 
                            ({task.lastExecutionResult?.affectedRecords || 0} reg.)
                          </span>
                        ) : task.status === 'running' ? (
                          <span style={{ color: '#0d6efd', fontSize: '11px' }}>Ejecutando... {task.progress || 0}%</span>
                        ) : (
                          <span style={{ color: '#999', fontSize: '11px' }}>Sin ejecuciones</span>
                        )}
                      </InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Ejecuciones</InfoLabel>
                      <InfoValue>{task.executionCount || 0}</InfoValue>
                    </InfoItem>
                  </InfoGrid>

                  {task.status === "running" && (
                    <div style={{ marginTop: '10px' }}>
                      <ProgressBar>
                        <ProgressFill $width={task.progress} />
                      </ProgressBar>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        <small style={{ fontWeight: 'bold' }}>Progreso: {task.progress}%</small>
                        {taskEstimates[task._id] && (
                          <small style={{ color: '#1565C0' }}>Restan {Math.floor(taskEstimates[task._id].remaining / 60000)}m</small>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '11px', background: '#f8f9fa', padding: '8px', borderRadius: '6px', fontFamily: 'monospace', marginTop: '10px', color: '#666' }}>
                    {task.query?.substring(0, 60)}...
                  </div>

                  {task.lastExecutionDate && (
                    <div style={{ fontSize: '10px', color: '#999', marginTop: '8px', textAlign: 'right' }}>
                      Última: {new Date(task.lastExecutionDate).toLocaleString()}
                    </div>
                  )}
                </CardBody>
                <CardFooter>
                  {canEditTask && (
                    <Button variant="ghost" onClick={() => handleEdit(task)} disabled={task.status === "running"} title="Editar"><FaEdit /></Button>
                  )}
                  {canDeleteTask && (
                    <Button variant="ghost" loading={actionStates[task._id] === 'deleting'} onClick={() => deleteTask(task._id)} disabled={task.status === "running"} style={{ color: '#dc3545' }} title="Eliminar"><FaTrash /></Button>
                  )}
                  <Button variant="ghost" loading={actionStates[task._id] === 'history'} onClick={() => handleViewHistory(task)} title="Ver Historial"><FaHistory /></Button>
                  {canExecuteTask && (
                    <Button variant="primary" loading={actionStates[task._id] === 'executing'} onClick={() => executeTask(task._id)} disabled={task.status === "running" || !task.active} title={!task.active ? "Tarea inactiva" : "Ejecutar"}><FaPlay /></Button>
                  )}
                  {task.status === "running" && isAdmin && (
                    <Button variant="danger" loading={actionStates[task._id] === 'canceling'} onClick={() => cancelTask(task._id)} title="Cancelar"><FaStop /></Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </Grid>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '12px' }}>Tarea</th>
                  <th style={{ padding: '12px' }}>Estado</th>
                  <th style={{ padding: '12px' }}>Tipo</th>
                  <th style={{ padding: '12px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task._id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px' }}><strong>{task.name}</strong></td>
                    <td style={{ padding: '12px' }}><StatusBadge status={task.status || (task.active ? "active" : "inactive")} /></td>
                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>{task.type}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <Button variant="ghost" onClick={() => handleEdit(task)}><FaEdit /></Button>
                        <Button variant="primary" loading={actionStates[task._id] === 'executing'} onClick={() => executeTask(task._id)} disabled={task.status === "running"}><FaPlay /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TaskFormModal
        isOpen={isModalOpen}
        task={selectedTask}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        allTasks={allTasks}
      />

      {showGroupsManager && (
        <ModalOverlay onClick={() => setShowGroupsManager(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>🔗 Grupos de Vinculación</h3>
              <Button variant="ghost" onClick={() => setShowGroupsManager(false)}>✕</Button>
            </ModalHeader>
            <div style={{ padding: '20px' }}>
              <LinkedGroupsManager accessToken={accessToken} onGroupDeleted={fetchTasks} onClose={() => setShowGroupsManager(false)} />
            </div>
          </ModalContent>
        </ModalOverlay>
      )}

      {linkedTasksModal.open && (
        <ModalOverlay onClick={() => setLinkedTasksModal({ open: false, task: null, linkedTasks: [] })}>
          <ModalContent onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>
                <FaLink style={{ marginRight: '8px' }} />
                Tareas Vinculadas
              </h3>
              <Button variant="ghost" onClick={() => setLinkedTasksModal({ open: false, task: null, linkedTasks: [] })}>
                <FaTimes />
              </Button>
            </ModalHeader>
            <ModalBody style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {linkedTasksModal.task?.linkedGroup ? (
                <div style={{ marginBottom: '16px', padding: '12px', background: '#e0f2fe', borderRadius: '8px' }}>
                  <strong>Grupo:</strong> {linkedTasksModal.task.linkedGroup}
                </div>
              ) : null}
              
              {linkedTasksModal.linkedTasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {linkedTasksModal.linkedTasks.map((task, index) => (
                    <div key={task.id || task._id} style={{ 
                      padding: '12px', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px',
                      background: '#f8fafc'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong>{task.name}</strong>
                        <StatusBadge status={task.status} />
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div><strong>Tipo:</strong> {task.type}</div>
                        {task.order !== undefined && <div><strong>Orden:</strong> {task.order}</div>}
                        {task.isCoordinator && <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>Coordinador</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#999' }}>
                  {linkedTasksModal.task?.linkedGroup 
                    ? 'No hay tareas en este grupo' 
                    : 'No hay tareas vinculadas'}
                </p>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Modal de Historial de Tarea */}
      {historyModal.open && (
        <ModalOverlay onClick={() => setHistoryModal({ open: false, taskId: null, data: [], loading: false, filter: 'all' })}>
          <ModalContent onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '85vh' }}>
            <ModalHeader>
              <h3 style={{ margin: 0 }}>
                <FaHistory style={{ marginRight: '8px' }} />
                Historial de Ejecuciones
              </h3>
              <Button variant="ghost" onClick={() => setHistoryModal({ open: false, taskId: null, data: [], loading: false, filter: 'all' })}>
                <FaTimes />
              </Button>
            </ModalHeader>
            <ModalBody style={{ padding: '20px', overflowY: 'auto' }}>
              {/* Filtros */}
              <div style={{ marginBottom: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <FilterButton 
                  active={historyModal.filter === 'all'} 
                  onClick={() => setHistoryModal(prev => ({ ...prev, filter: 'all' }))}
                >
                  Todos
                </FilterButton>
                <FilterButton 
                  active={historyModal.filter === 'completed'} 
                  onClick={() => setHistoryModal(prev => ({ ...prev, filter: 'completed' }))}
                >
                  Exitosos
                </FilterButton>
                <FilterButton 
                  active={historyModal.filter === 'failed'} 
                  onClick={() => setHistoryModal(prev => ({ ...prev, filter: 'failed' }))}
                >
                  Errores
                </FilterButton>
                <FilterButton 
                  active={historyModal.filter === 'running'} 
                  onClick={() => setHistoryModal(prev => ({ ...prev, filter: 'running' }))}
                >
                  En Proceso
                </FilterButton>
                <FilterButton 
                  active={historyModal.filter === 'cancelled'} 
                  onClick={() => setHistoryModal(prev => ({ ...prev, filter: 'cancelled' }))}
                >
                  Cancelados
                </FilterButton>
              </div>

              {historyModal.loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Cargando historial...</div>
              ) : (
                (() => {
                  const dataArray = Array.isArray(historyModal.data) ? historyModal.data : [];
                  const filteredData = dataArray.filter(exec => {
                    if (historyModal.filter === 'all') return true;
                    return exec.status === historyModal.filter;
                  });

                  if (filteredData.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        No hay historial de ejecuciones para esta tarea
                      </div>
                    );
                  }

                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                        <thead>
                          <tr style={{ background: '#f8f9fa' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Fecha</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Estado</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Insertados</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Actualizados</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Duplicados</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Mensaje</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '12px' }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.map((exec, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '8px', fontSize: '12px' }}>
                                {exec.date ? new Date(exec.date).toLocaleString() : '-'}
                              </td>
                              <td style={{ padding: '8px' }}>
                                <StatusBadge status={exec.status}>{exec.status}</StatusBadge>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', fontSize: '12px' }}>{exec.inserted || exec.successfulRecords || 0}</td>
                              <td style={{ padding: '8px', textAlign: 'center', fontSize: '12px' }}>{exec.updated || 0}</td>
                              <td style={{ padding: '8px', textAlign: 'center', fontSize: '12px' }}>{exec.duplicates || 0}</td>
                              <td style={{ padding: '8px', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {exec.message || exec.error || '-'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {(exec.status === 'failed' || exec.errorDetails || exec.errorDetail) && (
                                  <Button 
                                    variant="ghost" 
                                    style={{ padding: '4px 8px', fontSize: '11px', color: '#dc3545' }}
                                    onClick={() => handleViewError(
                                      `Error en Ejecución`,
                                      exec.message || 'Error en la transferencia',
                                      exec.errorDetails || exec.errorDetail || 'Sin detalles adicionales'
                                    )}
                                    title="Ver error"
                                  >
                                    <FaExclamationTriangle size={12} />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
                        Mostrando {filteredData.length} de {dataArray.length} registros
                      </div>
                    </div>
                  );
                })()
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Modal de Error Detallado */}
      {errorModal.open && (
        <ModalOverlay onClick={() => setErrorModal({ open: false, title: '', message: '', details: '' })}>
          <ModalContent onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <ModalHeader style={{ background: '#dc3545', color: 'white' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaExclamationTriangle /> {errorModal.title}
              </h3>
              <Button variant="ghost" style={{ color: 'white' }} onClick={() => setErrorModal({ open: false, title: '', message: '', details: '' })}>
                <FaTimes />
              </Button>
            </ModalHeader>
            <ModalBody style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Mensaje:</strong>
                <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px', borderLeft: '3px solid #dc3545' }}>
                  {errorModal.message}
                </div>
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Detalles del Error:</strong>
                <pre style={{ 
                  padding: '12px', 
                  background: '#1e1e1e', 
                  color: '#ff6b6b', 
                  borderRadius: '4px', 
                  overflow: 'auto',
                  maxHeight: '250px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  margin: 0
                }}>
                  {errorModal.details || 'Sin detalles adicionales'}
                </pre>
              </div>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
}

// === COMPONENTES ADICIONALES DEL MODAL ===
const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center;
  z-index: 2000; backdrop-filter: blur(4px);
`;

const ModalContent = styled.div`
  background: white; width: 90%; max-width: 800px; max-height: 90vh;
  border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
`;

const ModalHeader = styled.div`
  padding: 15px 20px; border-bottom: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
  background: #f8f9fa;
`;

const ModalBody = styled.div`
  padding: 20px;
  overflow-y: auto;
`;

const FilterButton = styled.button`
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #dee2e6;
  border-radius: 20px;
  background: ${props => props.active ? '#0d6efd' : 'white'};
  color: ${props => props.active ? 'white' : '#495057'};
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.active ? '#0d6efd' : '#e9ecef'};
    border-color: #adb5bd;
  }
`;
