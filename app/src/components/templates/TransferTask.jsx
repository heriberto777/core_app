import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  FaPlus, FaSync, FaLink, FaChartLine, FaList, FaTable,
  FaEdit, FaTrash, FaPlay, FaStop, FaHistory, FaEye, FaTimes, FaExclamationTriangle
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

function ModalOverlay({ children, onClick }) {
  return (
    <div 
      className="fixed top-0 left-0 right-0 bottom-0 bg-black/60 flex items-center justify-center z-[2000] backdrop-blur-sm"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function ModalContent({ children, onClick, style }) {
  return (
    <div 
      className="bg-white w-[90%] max-w-[800px] max-h-[90vh] rounded-xl overflow-hidden flex flex-col shadow-2xl"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ModalHeader({ children, style }) {
  return (
    <div 
      className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50"
      style={style}
    >
      {children}
    </div>
  );
}

function ModalBody({ children, style }) {
  return (
    <div className="p-5 overflow-y-auto" style={style}>
      {children}
    </div>
  );
}

function FilterButton({ children, active, onClick }) {
  return (
    <button
      className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full border cursor-pointer transition-all ${
        active 
          ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600' 
          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

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
    <div className="flex flex-col gap-6 animate-fadeIn">
      <Helmet>
        <title>Tareas - Core ERP Premium</title>
      </Helmet>

      <ContentHeader
        title="Gestor de Tareas de Sincronización"
        description="Monitoriza y configura el flujo de datos en tiempo real entre tus sucursales."
      />

      {showMetrics && <TaskMetricsPanel tasks={allTasks} />}

      <div className="flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
        <div className="flex gap-4 flex-1">
          <FilterInput
            placeholder="Buscar por nombre de tarea..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 items-center">
            <select 
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[13px] font-medium cursor-pointer focus:border-blue-500 outline-none"
              value={filters.type} 
              onChange={(e) => handleFilterChange("type", e.target.value)}
            >
              <option value="all">Tipos: Todos</option>
              <option value="manual">Manuales</option>
              <option value="auto">Automáticas</option>
            </select>
            <select 
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[13px] font-medium cursor-pointer focus:border-blue-500 outline-none"
              value={filters.status} 
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="all">Estados: Todos</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2.5">
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
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            <Button variant={viewMode === "cards" ? "primary" : "ghost"} onClick={() => setViewMode("cards")} className="px-3 py-1.5"><FaList /></Button>
            <Button variant={viewMode === "table" ? "primary" : "ghost"} onClick={() => setViewMode("table")} className="px-3 py-1.5"><FaTable /></Button>
          </div>
        </div>
      </div>

      <div className="relative min-h-[300px]">
        {refreshing && <LoadingUI overlay message="Actualizando estados..." />}
        {loading && !refreshing && <LoadingUI message="Cargando repositorio..." />}

        {!loading && tasks.length === 0 && (
          <div className="text-center p-15 text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
            <FaList size={40} className="opacity-30 mb-4 mx-auto" />
            <p>No se encontraron tareas con estos criterios.</p>
            <Button variant="primary" onClick={() => setSearch("")} className="mt-2.5">Limpiar Búsqueda</Button>
          </div>
        )}

        {viewMode === "cards" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
            {tasks.map(task => (
              <div 
                key={task._id} 
                className={`bg-white dark:bg-slate-800 rounded-2xl border transition-all duration-300 overflow-hidden relative shadow-md hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-lg ${
                  task.status === 'running' ? 'border-blue-500' : 'border-slate-200 dark:border-slate-700'
                } ${task.active ? '' : 'opacity-75'}`}
              >
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-700/50">
                  <div className="flex flex-col gap-1">
                    <strong className="text-[15px]">{task.name}</strong>
                    <div className="flex gap-1.5 items-center">
                      <StatusBadge status={task.status || (task.active ? "active" : "inactive")} />
                      {!task.active && <span className="text-[10px] text-red-500 font-semibold">INACTIVA</span>}
                    </div>
                  </div>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/50 dark:bg-slate-700/50 p-2.5 rounded-lg">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-500 font-medium">Tipo</span>
                      <span className="text-slate-800 dark:text-white font-semibold capitalize">{task.type}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-500 font-medium">Transfer</span>
                      <span className="text-slate-800 dark:text-white font-semibold">
                        {task.transferType === 'up' && '↑ Up'}
                        {task.transferType === 'down' && '↓ Down'}
                        {task.transferType === 'internal' && '⇄ Internal'}
                        {task.transferType === 'general' && '○ General'}
                        {!task.transferType && '○ General'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-500 font-medium">Vinculada</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${task.linkedGroup || (task.linkedTasks?.length > 0) ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {task.linkedGroup ? `Grupo: ${task.linkedGroup}` : (task.linkedTasks?.length > 0 ? `${task.linkedTasks.length} tareas` : 'No')}
                        </span>
                        {(task.linkedTasks?.length > 0 || task.linkedGroup) && (
                          <Button 
                            variant="ghost" 
                            className="px-1.5 py-0.5 text-[10px]"
                            onClick={() => openLinkedTasksModal(task)}
                            title="Ver tareas vinculadas"
                          >
                            <FaEye />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-500 font-medium">Última Ejecución</span>
                      <span className="font-semibold">
                        {(task.lastExecutionResult?.success === false || task.status === 'error') && task.lastExecutionResult?.errorDetails ? (
                          <span 
                            className="text-red-500 cursor-pointer underline text-[11px]"
                            onClick={() => handleViewError(
                              `Error en ${task.name}`,
                              task.lastExecutionResult?.message || 'Error en la transferencia',
                              task.lastExecutionResult?.errorDetails || 'Sin detalles'
                            )}
                          >
                            <FaExclamationTriangle className="text-[10px] mr-1" />
                            {task.lastExecutionResult?.message || 'Error'}
                          </span>
                        ) : task.lastExecutionResult?.success ? (
                          <span className="text-emerald-600 text-[11px]">
                            ✓ {task.lastExecutionResult?.message || 'Completado'} 
                            ({task.lastExecutionResult?.affectedRecords || 0} reg.)
                          </span>
                        ) : task.status === 'running' ? (
                          <span className="text-blue-600 text-[11px]">Ejecutando... {task.progress || 0}%</span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Sin ejecuciones</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-500 font-medium">Ejecuciones</span>
                      <span className="text-slate-800 dark:text-white font-semibold">{task.executionCount || 0}</span>
                    </div>
                  </div>

                  {task.status === "running" && (
                    <div className="mt-2.5">
                      <div className="h-2 bg-slate-200 dark:bg-slate-600 rounded overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <small className="font-bold">Progreso: {task.progress}%</small>
                        {taskEstimates[task._id] && (
                          <small className="text-blue-700">Restan {Math.floor(taskEstimates[task._id].remaining / 60000)}m</small>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] bg-slate-100 dark:bg-slate-700 p-2 rounded-md font-mono mt-2.5 text-slate-500 dark:text-slate-400">
                    {task.query?.substring(0, 60)}...
                  </div>

                  {task.lastExecutionDate && (
                    <div className="text-[10px] text-slate-400 mt-2 text-right">
                      Última: {new Date(task.lastExecutionDate).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="p-3 pr-4 bg-slate-50/20 dark:bg-slate-700/20 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                  {canEditTask && (
                    <Button variant="ghost" onClick={() => handleEdit(task)} disabled={task.status === "running"} title="Editar"><FaEdit /></Button>
                  )}
                  {canDeleteTask && (
                    <Button variant="ghost" loading={actionStates[task._id] === 'deleting'} onClick={() => deleteTask(task._id)} disabled={task.status === "running"} className="text-red-500" title="Eliminar"><FaTrash /></Button>
                  )}
                  <Button variant="ghost" loading={actionStates[task._id] === 'history'} onClick={() => handleViewHistory(task)} title="Ver Historial"><FaHistory /></Button>
                  {canExecuteTask && (
                    <Button 
                      variant="primary" 
                      loading={actionStates[task._id] === 'executing'} 
                      onClick={() => executeTask(task._id)} 
                      disabled={task.status === "running" || !task.active} 
                      title={task.active ? "Ejecutar" : "Tarea inactiva"}
                    >
                      <FaPlay />
                    </Button>
                  )}
                  {task.status === "running" && isAdmin && (
                    <Button variant="danger" loading={actionStates[task._id] === 'canceling'} onClick={() => cancelTask(task._id)} title="Cancelar"><FaStop /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button 
                  variant="outline" 
                  size="small" 
                  onClick={() => navigate(`/history?search=${tasks.find(t => t._id === historyModal.taskId)?.name || ''}`)}
                  title="Ver en Bitácora Central"
                  style={{ height: '32px', padding: '0 12px' }}
                >
                  <FaEye /> Ver en Bitácora
                </Button>
                <Button variant="ghost" onClick={() => setHistoryModal({ open: false, taskId: null, data: [], loading: false, filter: 'all' })}>
                  <FaTimes />
                </Button>
              </div>
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
    </div>
  );
}
