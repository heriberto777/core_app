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
      style={{ ...style, display: 'flex', flexDirection: 'column', height: '100%' }}
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
      style={{ ...style, display: 'flex', alignItems: 'center' }}
    >
      {children}
    </div>
  );
}

function ModalBody({ children, style }) {
  return (
    <div className="p-5 overflow-y-auto" style={{ ...style, display: 'block' }}>
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
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="px-3 py-2 border-b border-slate-200">Tarea</th>
                  <th className="px-3 py-2 border-b border-slate-200">Estado</th>
                  <th className="px-3 py-2 border-b border-slate-200">Tipo</th>
                  <th className="px-3 py-2 border-b border-slate-200">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task._id} className="border-b border-slate-200">
                    <td className="px-3 py-2"><strong>{task.name}</strong></td>
                    <td className="px-3 py-2"><StatusBadge status={task.status || (task.active ? "active" : "inactive")} /></td>
                    <td className="px-3 py-2 capitalize">{task.type}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
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
              <h3 className="text-lg font-semibold mb-2">🔗 Grupos de Vinculación</h3>
              <Button variant="ghost" className="ml-2" onClick={() => setShowGroupsManager(false)}>✕</Button>
            </ModalHeader>
            <div className="p-5">
              <LinkedGroupsManager accessToken={accessToken} onGroupDeleted={fetchTasks} onClose={() => setShowGroupsManager(false)} />
            </div>
          </ModalContent>
        </ModalOverlay>
      )}

      {linkedTasksModal.open && (
        <ModalOverlay onClick={() => setLinkedTasksModal({ open: false, task: null, linkedTasks: [] })}>
          <ModalContent onClick={e => e.stopPropagation()} className="max-w-[600px]">
            <ModalHeader>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FaLink className="text-blue-500" />
                Tareas Vinculadas
              </h3>
              <Button variant="ghost" className="ml-2" onClick={() => setLinkedTasksModal({ open: false, task: null, linkedTasks: [] })}>
                <FaTimes />
              </Button>
            </ModalHeader>
            <ModalBody>
              {linkedTasksModal.task?.linkedGroup ? (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <strong>Grupo:</strong> {linkedTasksModal.task.linkedGroup}
                </div>
              ) : null}

              {linkedTasksModal.linkedTasks.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {linkedTasksModal.linkedTasks.map((task, index) => (
                    <div key={task.id || task._id} className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex justify-between items-center mb-2">
                        <strong>{task.name}</strong>
                        <StatusBadge status={task.status} />
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 grid grid-cols-2 gap-2">
                        <div><strong>Tipo:</strong> {task.type}</div>
                        {task.order !== undefined && <div><strong>Orden:</strong> {task.order}</div>}
                        {task.isCoordinator && <div className="text-amber-600 font-bold">Coordinador</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400">
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
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FaHistory className="text-slate-600 dark:text-slate-400" />
                Historial de Ejecuciones
              </h3>
              <div className="flex gap-2 items-center">
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => navigate(`/history?search=${tasks.find(t => t._id === historyModal.taskId)?.name || ''}`)}
                  title="Ver en Bitácora Central"
                  className="h-8 px-3"
                >
                  <FaEye className="mr-1.5" /> Ver en Bitácora
                </Button>
                <Button variant="ghost" onClick={() => setHistoryModal({ open: false, taskId: null, data: [], loading: false, filter: 'all' })}>
                  <FaTimes />
                </Button>
              </div>
            </ModalHeader>
            <ModalBody>
              {/* Filtros */}
              <div className="mb-4 flex gap-2 flex-wrap">
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
                <div className="text-center py-10">Cargando historial...</div>
              ) : (
                (() => {
                  const dataArray = Array.isArray(historyModal.data) ? historyModal.data : [];
                  const filteredData = dataArray.filter(exec => {
                    if (historyModal.filter === 'all') return true;
                    return exec.status === historyModal.filter;
                  });

                  if (filteredData.length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400">
                        No hay historial de ejecuciones para esta tarea
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800">
                            <th className="px-3 py-2 text-left text-xs border-b-2 border-slate-300 dark:border-slate-600">Fecha</th>
                            <th className="px-3 text-left text-xs border-b-2 border-slate-300 dark:border-slate-600">Estado</th>
                            <th className="px-3 text-center text-xs border-b-2 border-slate-300 dark:border-slate-600">Insertados</th>
                            <th className="px-3 text-center text-xs border-b-2 border-slate-300 dark:border-slate-600">Actualizados</th>
                            <th className="px-3 text-center text-xs border-b-2 border-slate-300 dark:border-slate-600">Duplicados</th>
                            <th className="px-3 text-left text-xs border-b-2 border-slate-300 dark:border-slate-600">Mensaje</th>
                            <th className="px-3 text-center text-xs border-b-2 border-slate-300 dark:border-slate-600">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.map((exec, idx) => (
                            <tr key={idx} className="border-b border-slate-200 dark:border-slate-700">
                              <td className="px-3 py-2 text-xs">
                                {exec.date ? new Date(exec.date).toLocaleString() : '-'}
                              </td>
                              <td className="px-3">
                                <StatusBadge status={exec.status}>{exec.status}</StatusBadge>
                              </td>
                              <td className="px-3 text-center text-xs">{exec.inserted || exec.successfulRecords || 0}</td>
                              <td className="px-3 text-center text-xs">{exec.updated || 0}</td>
                              <td className="px-3 text-center text-xs">{exec.duplicates || 0}</td>
                              <td className="px-3 py-2 text-xs max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                                {exec.message || exec.error || '-'}
                              </td>
                              <td className="px-3 text-center">
                                {(exec.status === 'failed' || exec.errorDetails || exec.errorDetail) && (
                                  <Button
                                    variant="ghost"
                                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
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
                      <div className="mt-2 text-xs text-slate-500">
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
            <ModalHeader className="bg-red-500 text-white">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FaExclamationTriangle className="text-white" /> {errorModal.title}
              </h3>
              <Button variant="ghost" className="text-white" onClick={() => setErrorModal({ open: false, title: '', message: '', details: '' })}>
                <FaTimes />
              </Button>
            </ModalHeader>
            <ModalBody>
              <div className="mb-4">
                <strong className="block mb-2">Mensaje:</strong>
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border-l-4 border-red-500">
                  {errorModal.message}
                </div>
              </div>
              <div>
                <strong className="block mb-2">Detalles del Error:</strong>
                <pre className="p-3 bg-black text-red-400 rounded-lg overflow-auto max-h-[250px] font-mono text-xs">
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
