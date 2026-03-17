import React, { useState } from "react";
import styled from "styled-components";
import {
  FaPlus, FaSync, FaChartLine, FaSearch, FaPlay, FaInfoCircle,
  FaEdit, FaTrash, FaLink, FaHistory
} from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  useConsecutiveManager,
  ConsecutiveFormModal,
  ConsecutiveDetailsModal,
  ConsecutiveAssignModal,
  ConsecutiveDashboardPanel,
  Button,
  StatusBadge
} from "../../index";

export function ConsecutiveManager() {
  const { accessToken } = useAuth();

  // Hook de lógica centralizada
  const {
    filteredConsecutives,
    loading,
    isProcessing,
    search, setSearch,
    showDashboard, setShowDashboard,
    dashboardData,
    loadConsecutives,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleReset,
    handleAssign,
    getNextValue,
    getMetrics
  } = useConsecutiveManager(accessToken);

  // Estados locales para modales
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedConsecutive, setSelectedConsecutive] = useState(null);
  const [metricsData, setMetricsData] = useState(null);

  // --- Handlers de UI ---

  const openCreate = () => {
    setSelectedConsecutive(null);
    setIsFormOpen(true);
  };

  const openEdit = (consecutive) => {
    setSelectedConsecutive(consecutive);
    setIsFormOpen(true);
  };

  const onSaveForm = async (data) => {
    try {
      if (selectedConsecutive) {
        await handleUpdate(selectedConsecutive._id, data);
        Swal.fire("Actualizado", "Consecutivo actualizado correctamente", "success");
      } else {
        await handleCreate(data);
        Swal.fire("Creado", "Consecutivo creado correctamente", "success");
      }
      setIsFormOpen(false);
    } catch (error) {
      Swal.fire("Error", "No se pudo guardar el consecutivo", "error");
    }
  };

  const onViewDetails = async (consecutive) => {
    try {
      const metrics = await getMetrics(consecutive._id);
      setMetricsData(metrics);
      setIsDetailsOpen(true);
    } catch (error) {
      Swal.fire("Error", "No se pudieron obtener las métricas", "error");
    }
  };

  const onAssignClick = (consecutive) => {
    setSelectedConsecutive(consecutive);
    setIsAssignOpen(true);
  };

  const onConfirmAssign = async (assignmentData) => {
    try {
      await handleAssign(selectedConsecutive._id, assignmentData);
      Swal.fire("Asignado", "Asignación realizada con éxito", "success");
      setIsAssignOpen(false);
    } catch (error) {
      Swal.fire("Error", "No se pudo realizar la asignación", "error");
    }
  };

  const onDeleteClick = async (consecutive) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar Consecutivo?',
      text: `Esta acción no se puede deshacer. Se eliminará "${consecutive.name}".`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar'
    });

    if (confirm.isConfirmed) {
      try {
        await handleDelete(consecutive._id);
        Swal.fire("Eliminado", "El registro ha sido borrado.", "success");
      } catch (error) {
        Swal.fire("Error", "No se pudo eliminar el consecutivo.", "error");
      }
    }
  };

  const onResetClick = async (consecutive) => {
    const { value: initialValue } = await Swal.fire({
      title: `Reiniciar Consecutivo: ${consecutive.name}`,
      input: 'number',
      inputLabel: 'Nuevo valor inicial',
      inputValue: 0,
      showCancelButton: true,
      inputValidator: (value) => !value && 'Debe ingresar un valor'
    });

    if (initialValue !== undefined) {
      try {
        await handleReset(consecutive._id, initialValue);
        Swal.fire("Reiniciado", `Folio reiniciado a ${initialValue}`, "success");
      } catch (error) {
        Swal.fire("Error", "No se pudo reiniciar el folio.", "error");
      }
    }
  };

  const onGetNextValue = async (consecutive) => {
    try {
      // Si requiere segmento, el hook o el modal debería manejarlo. 
      // Por ahora simplificamos como estaba:
      let segment = null;
      if (consecutive.segments?.enabled && ['year', 'month'].includes(consecutive.segments.type)) {
        const date = new Date();
        segment = consecutive.segments.type === 'year'
          ? date.getFullYear().toString()
          : `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      } else if (consecutive.segments?.enabled) {
        const { value } = await Swal.fire({
          title: 'Valor de Segmento',
          input: 'text',
          inputLabel: `Ingrese el valor para ${consecutive.segments.type}`,
          showCancelButton: true
        });
        if (!value) return;
        segment = value;
      }

      const result = await getNextValue(consecutive._id, segment);
      Swal.fire({
        title: "Folio Generado",
        html: `<div style="font-size: 2em; font-weight: 800; color: var(--primary); padding: 20px;">${result.value}</div>`,
        icon: 'success'
      });
    } catch (error) {
      Swal.fire("Error", "No se pudo generar el siguiente valor.", "error");
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <HeaderSection>
        <div>
          <Title>Gestión de Consecutivos</Title>
          <Subtitle>Control centralizado de folios, numeración y segmentación de documentos</Subtitle>
        </div>
        <HeaderActions>
          <SearchWrapper>
            <FaSearch />
            <SearchInput
              placeholder="Buscar folio por nombre o descripción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </SearchWrapper>
          <Button variant="secondary" onClick={() => setShowDashboard(!showDashboard)}>
            {showDashboard ? <><FaHistory /> Ver Lista</> : <><FaChartLine /> Dashboard</>}
          </Button>
          <Button variant="primary" onClick={openCreate}>
            <FaPlus /> Nuevo Folio
          </Button>
          <RefreshBtn onClick={loadConsecutives} $loading={loading}>
            <FaSync />
          </RefreshBtn>
        </HeaderActions>
      </HeaderSection>

      <ContentArea>
        {showDashboard ? (
          <ConsecutiveDashboardPanel data={dashboardData} onClose={() => setShowDashboard(false)} />
        ) : (
          <TableContainer>
            {loading ? (
              <LoadingState>Sincronizando consecutivos con el servidor...</LoadingState>
            ) : filteredConsecutives.length === 0 ? (
              <EmptyState>No se encontraron consecutivos configurados.</EmptyState>
            ) : (
              <StyledTable>
                <thead>
                  <tr>
                    <th>Consecutivo</th>
                    <th>Valor Actual</th>
                    <th>Formato / Máscara</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones Operativas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsecutives.map(c => (
                    <tr key={c._id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ fontSize: '11px', opacity: 0.6 }}>{c.description || 'Sin descripción'}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>{c.currentValue}</span>
                      </td>
                      <td>
                        <code>{c.pattern || `${c.prefix || ''}[${c.padChar.repeat(c.padLength)}]`}</code>
                      </td>
                      <td>
                        {c.segments?.enabled ? (
                          <StatusBadge status="warning">SEGMENTADO ({c.segments.type})</StatusBadge>
                        ) : (
                          <StatusBadge status="info">GLOBAL</StatusBadge>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={c.active ? 'active' : 'inactive'}>
                          {c.active ? 'ACTIVO' : 'INACTIVO'}
                        </StatusBadge>
                      </td>
                      <td>
                        <ActionGrid>
                          <Button variant="ghost" onClick={() => onGetNextValue(c)} title="Generar Siguiente"><FaPlay /></Button>
                          <Button variant="ghost" onClick={() => onViewDetails(c)} title="Métricas"><FaInfoCircle /></Button>
                          <Button variant="ghost" onClick={() => onAssignClick(c)} title="Vincular"><FaLink /></Button>
                          <Button variant="ghost" onClick={() => onResetClick(c)} title="Reiniciar"><FaSync /></Button>
                          <Button variant="ghost" onClick={() => openEdit(c)} title="Editar"><FaEdit /></Button>
                          <Button variant="ghost" onClick={() => onDeleteClick(c)} title="Eliminar" style={{ color: '#ff4757' }}><FaTrash /></Button>
                        </ActionGrid>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StyledTable>
            )}
          </TableContainer>
        )}
      </ContentArea>

      {/* Modales de Organismos */}
      <ConsecutiveFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={onSaveForm}
        consecutive={selectedConsecutive}
      />

      <ConsecutiveDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        metrics={metricsData}
      />

      <ConsecutiveAssignModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        consecutive={selectedConsecutive}
        accessToken={accessToken}
        onAssign={onConfirmAssign}
      />

      {isProcessing && (
        <ProcessingOverlay>
          <Spinner />
          <span>Procesando solicitud técnica...</span>
        </ProcessingOverlay>
      )}
    </div>
  );
}

// --- Styled Components Premium ---

// Eliminado PageWrapper redundante

const HeaderSection = styled.div`
  display: flex; justify-content: space-between; align-items: flex-end; gap: 20px;
  @media (max-width: 1100px) { flex-direction: column; align-items: flex-start; }
`;

const Title = styled.h2` margin: 0; font-size: 32px; font-weight: 850; color: ${({ theme }) => theme.title}; letter-spacing: -0.5px; `;
const Subtitle = styled.p` margin: 4px 0 0; color: ${({ theme }) => theme.textSecondary}; font-size: 16px; `;

const HeaderActions = styled.div`
  display: flex; align-items: center; gap: 12px;
`;

const SearchWrapper = styled.div`
  position: relative; display: flex; align-items: center; background: ${({ theme }) => theme.cardBg};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 14px; padding: 0 16px; width: 350px;
  svg { color: ${({ theme }) => theme.textSecondary}; }
`;

const SearchInput = styled.input`
  border: none; background: transparent; padding: 12px; color: ${({ theme }) => theme.text}; width: 100%;
  font-size: 14px; &:focus { outline: none; }
`;

const RefreshBtn = styled.button`
  width: 44px; height: 44px; border-radius: 14px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.cardBg}; color: ${({ theme }) => theme.textSecondary}; 
  cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s;
  svg { animation: ${({ $loading }) => $loading ? 'spin 1.5s linear infinite' : 'none'}; }
  &:hover { background: ${({ theme }) => theme.bg2}; color: ${({ theme }) => theme.primary}; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const ContentArea = styled.div` min-height: 500px; `;

const TableContainer = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium}; overflow-x: auto;
`;

const StyledTable = styled.table`
  width: 100%; border-collapse: collapse; font-size: 14px;
  thead { background: ${({ theme }) => theme.bg2}40; }
  th { padding: 20px 24px; text-align: left; color: ${({ theme }) => theme.textSecondary}; border-bottom: 1px solid ${({ theme }) => theme.border}; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
  td { padding: 20px 24px; border-bottom: 1px solid ${({ theme }) => theme.border}40; color: ${({ theme }) => theme.text}; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
`;

const ActionGrid = styled.div` display: flex; gap: 4px; justify-content: flex-end; `;

const LoadingState = styled.div` padding: 120px; text-align: center; font-weight: 600; color: ${({ theme }) => theme.primary}; font-size: 18px; `;
const EmptyState = styled.div` padding: 120px; text-align: center; opacity: 0.5; font-size: 16px; `;

const ProcessingOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);
  z-index: 3000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  color: white; font-weight: 700;
`;

const Spinner = styled.div`
  width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.2); 
  border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;
`;

export default ConsecutiveManager;
