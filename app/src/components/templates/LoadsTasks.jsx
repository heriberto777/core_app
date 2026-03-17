import React, { useState } from "react";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  FaPlay, FaSync, FaList, FaTable, FaHistory, FaTruckLoading, FaSearch
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

// === ESTILOS ( Glassmorphism & Atomic Vibe ) ===
const Container = styled.div`
  display: flex; flex-direction: column; gap: ${({ theme }) => theme.spacing.lg};
  animation: fadeIn 0.4s ease-out;
`;

const ActionsBar = styled.div`
  display: flex; flex-wrap: wrap; gap: ${({ theme }) => theme.spacing.md};
  align-items: center; justify-content: space-between;
  background: ${({ theme }) => theme.cardBg};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  backdrop-filter: blur(10px);
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
  overflow: hidden; position: relative;
  box-shadow: ${({ theme }) => theme.shadows.premium};

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0,0,0,0.15);
    border-color: ${({ theme }) => theme.primary}80;
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

const CardFooter = styled.div`
  padding: 12px 16px; background: ${({ theme }) => theme.bg2}20;
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 8px;
`;

const EmptyState = styled.div`
  text-align: center; padding: 60px; color: ${({ theme }) => theme.textSecondary};
  background: ${({ theme }) => theme.cardBg}; border-radius: 12px;
  border: 1px dashed ${({ theme }) => theme.border};
`;

// === COMPONENTE PRINCIPAL ===
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
    <Container>
      <Helmet>
        <title>Cargas ERP - Core ERP</title>
      </Helmet>

      <ContentHeader
        title="Gestor de Carga de Camiones"
        description="Optimice el proceso de despacho y traspaso de bodegas para sus rutas de venta."
      />

      <TaskMetricsPanel tasks={allTasks} />

      <ActionsBar>
        <div style={{ flex: 1, minWidth: '250px' }}>
          <FilterInput
            placeholder="Buscar tarea de carga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button variant="primary" onClick={fetchTasks} disabled={refreshing}>
            <FaSync className={refreshing ? "spinning" : ""} /> {refreshing ? "Sincronizando..." : "Refrescar"}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/summaries')}>
            <FaHistory /> Histótico
          </Button>

          <div style={{ display: 'flex', background: '#eee', borderRadius: '8px', padding: '2px' }}>
            <Button variant={viewMode === "cards" ? "primary" : "ghost"} onClick={() => setViewMode("cards")} style={{ padding: '6px 12px' }}>
              <FaList />
            </Button>
            <Button variant={viewMode === "table" ? "primary" : "ghost"} onClick={() => setViewMode("table")} style={{ padding: '6px 12px' }}>
              <FaTable />
            </Button>
          </div>
        </div>
      </ActionsBar>

      <div style={{ position: "relative", minHeight: '300px' }}>
        {refreshing && <LoadingUI overlay message="Actualizando tareas de carga..." />}
        {loading && !refreshing && <LoadingUI message="Cargando configuración de procesos..." />}
        {error && <p style={{ color: 'red', textAlign: 'center' }}>Error: {error}</p>}

        {!loading && tasks.length === 0 && (
          <EmptyState>
            <FaTruckLoading size={40} style={{ opacity: 0.3, marginBottom: '15px' }} />
            <p>No hay tareas de carga disponibles (batchesSSE).</p>
            <Button variant="primary" onClick={() => setSearch("")} style={{ marginTop: '10px' }}>Limpiar Filtros</Button>
          </EmptyState>
        )}

        {viewMode === "cards" ? (
          <Grid>
            {tasks.map(task => (
              <Card key={task._id} $active={task.active} $status={task.status}>
                <CardHeader>
                  <strong style={{ fontSize: '15px' }}>{task.name}</strong>
                  <StatusBadge status={task.status || (task.active ? "active" : "inactive")} />
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#666' }}>ID: {task._id.substring(18)}</span>
                    <span style={{ fontWeight: 600 }}>{task.executionMode}</span>
                  </div>
                  <div style={{ fontSize: '12px', background: '#f8f9fa', padding: '10px', borderRadius: '8px', minHeight: '60px' }}>
                    <span style={{ color: '#666' }}>SQL Preview:</span><br />
                    {task.query.substring(0, 100)}...
                  </div>
                  {task.status === "running" && (
                    <StatusBadge status="running" style={{ width: '100%', justifyContent: 'center' }}>
                      En ejecución: {task.progress}%
                    </StatusBadge>
                  )}
                </CardBody>
                <CardFooter>
                  <Button
                    variant="primary"
                    style={{ width: '100%' }}
                    onClick={() => handleStartProcess(task)}
                    disabled={!task.active || task.status === "running"}
                  >
                    <FaPlay /> Iniciar Proceso de Carga
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '15px' }}>Nombre de la Tarea</th>
                  <th style={{ padding: '15px' }}>Estado</th>
                  <th style={{ padding: '15px' }}>Modo</th>
                  <th style={{ padding: '15px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task._id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px' }}><strong>{task.name}</strong></td>
                    <td style={{ padding: '15px' }}><StatusBadge status={task.status || (task.active ? "active" : "inactive")} /></td>
                    <td style={{ padding: '15px' }}>{task.executionMode}</td>
                    <td style={{ padding: '15px' }}>
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
    </Container>
  );
}
