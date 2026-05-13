import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  FaPlay, FaSync, FaList, FaTable, FaHistory, FaTruckLoading
} from "react-icons/fa";
import {
  useLoadsTasks,
  LoadsProcessModal,
  Button,
  StatusBadge,
  LoadingUI,
  ContentHeader,
  FilterInput,
  TaskMetricsPanel
} from "../../index";

export function LoadsTasks() {
  const navigate = useNavigate();
  const {
    tasks, allTasks, loading, refreshing, error, search, setSearch,
    vendedores, fetchTasks, getConsecutivo, getSalesData,
    insertOrders, insertLoadsDetail, executeTraspaso
  } = useLoadsTasks();

  const [viewMode, setViewMode] = useState("cards");
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleStartProcess = (task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <Helmet>
        <title>Cargas ERP - Core ERP</title>
      </Helmet>

      <ContentHeader
        title="Gestor de Carga de Camiones"
        description="Optimice el proceso de despacho y traspaso de bodegas para sus rutas de venta."
      />

      <TaskMetricsPanel tasks={allTasks} />

      <div className="flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
        <div className="flex-1 min-w-[250px]">
          <FilterInput
            placeholder="Buscar tarea de carga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2.5 items-center">
          <Button variant="primary" onClick={fetchTasks} disabled={refreshing}>
            <FaSync className={refreshing ? "spinning" : ""} /> {refreshing ? "Sincronizando..." : "Refrescar"}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/summaries')}>
            <FaHistory /> Histótico
          </Button>

          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            <Button variant={viewMode === "cards" ? "primary" : "ghost"} onClick={() => setViewMode("cards")} className="px-3 py-1.5">
              <FaList />
            </Button>
            <Button variant={viewMode === "table" ? "primary" : "ghost"} onClick={() => setViewMode("table")} className="px-3 py-1.5">
              <FaTable />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative min-h-[300px]">
        {refreshing && <LoadingUI overlay message="Actualizando tareas de carga..." />}
        {loading && !refreshing && <LoadingUI message="Cargando configuración de procesos..." />}
        {error && <p className="text-red-500 text-center">Error: {error}</p>}

        {!loading && tasks.length === 0 && (
          <div className="text-center p-15 text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
            <FaTruckLoading size={40} className="opacity-30 mb-4 mx-auto" />
            <p>No hay tareas de carga disponibles (batchesSSE).</p>
            <Button variant="primary" onClick={() => setSearch("")} className="mt-2.5">Limpiar Filtros</Button>
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
                  <strong className="text-[15px]">{task.name}</strong>
                  <StatusBadge status={task.status || (task.active ? "active" : "inactive")} />
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-slate-500">ID: {task._id.substring(18)}</span>
                    <span className="font-semibold">{task.executionMode}</span>
                  </div>
                  <div className="text-[12px] bg-slate-100 dark:bg-slate-700 p-2.5 rounded-lg min-h-[60px]">
                    <span className="text-slate-500">SQL Preview:</span><br />
                    {task.query.substring(0, 100)}...
                  </div>
                  {task.status === "running" && (
                    <StatusBadge status="running" className="w-full justify-center">
                      En ejecución: {task.progress}%
                    </StatusBadge>
                  )}
                </div>
                <div className="p-3 pr-4 bg-slate-50/20 dark:bg-slate-700/20 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleStartProcess(task)}
                    disabled={!task.active || task.status === "running"}
                  >
                    <FaPlay /> Iniciar Proceso de Carga
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left border-b border-slate-200">
                  <th className="p-4">Nombre de la Tarea</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Modo</th>
                  <th className="p-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task._id} className="border-b border-slate-100">
                    <td className="p-4"><strong>{task.name}</strong></td>
                    <td className="p-4"><StatusBadge status={task.status || (task.active ? "active" : "inactive")} /></td>
                    <td className="p-4">{task.executionMode}</td>
                    <td className="p-4">
                      <Button variant="ghost" onClick={() => handleStartProcess(task)} disabled={!task.active}>
                        <FaPlay /> Iniciar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LoadsProcessModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        task={selectedTask}
        vendedores={vendedores}
        onComplete={fetchTasks}
        getConsecutivo={getConsecutivo}
        getSalesData={getSalesData}
        insertOrders={insertOrders}
        insertLoadsDetail={insertLoadsDetail}
        executeTraspaso={executeTraspaso}
      />
    </div>
  );
}

export default LoadsTasks;