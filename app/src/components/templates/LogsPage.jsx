import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  useAuth,
  StatusBadge,
  LoadingUI,
  LogDetailModal,
  ClearLogsModal,
  useAuditLogs
} from "../../index";
import {
  FaSync,
  FaTrashAlt,
  FaCalendarAlt,
  FaFilter,
  FaDownload,
} from "react-icons/fa";


export function LogsPage() {
  const { accessToken } = useAuth();

  // Estados de Modales e Interacción
  const [selectedLog, setSelectedLog] = useState(null);
  const [showLogDetail, setShowLogDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteOlderThan, setDeleteOlderThan] = useState(30);

const {
    logs,
    meta,
    loading,
    refreshing,
    error,
    logType,
    filters,
    pagination,
    actions
  } = useAuditLogs(accessToken, "system");

  const operationTypes = ["TRANSFER", "LOAD", "DELETE", "UPDATE", "CREATE", "QUERY", "EXECUTE"];
  const entityTypes = ["PEDIDO", "CLIENTE", "CARGA", "ARTICULO", "VENDEDOR", "TRASPASO", "TAREA", "USUARIO"];

  const handleFilterChange = (name, value) => {
    actions.updateFilters({ [name]: value });
  };

  const handleMultiSelectChange = (name, options) => {
    actions.updateFilters({ [name]: options });
  };

  const getOperationTypeColor = (type) => {
    const colors = {
      TRANSFER: "#3b82f6",
      LOAD: "#22c55e",
      DELETE: "#ef4444",
      UPDATE: "#eab308",
      CREATE: "#a855f7",
      QUERY: "#06b6d4",
      EXECUTE: "#f97316",
    };
    return colors[type] || "#6b7280";
  };

  const getEntityTypeColor = (type) => {
    const colors = {
      PEDIDO: "#f97316",
      CLIENTE: "#3b82f6",
      CARGA: "#22c55e",
      ARTICULO: "#8b5cf6",
      VENDEDOR: "#06b6d4",
      TRASPASO: "#ec4899",
      TAREA: "#eab308",
      USUARIO: "#6366f1",
    };
    return colors[type] || "#6b7280";
  };

  const getDurationColor = (ms) => {
    if (!ms) return "#6b7280";
    if (ms < 1000) return "#22c55e";
    if (ms < 5000) return "#eab308";
    return "#ef4444";
  };

  const handleClearLogs = async () => {
    try {
      await actions.clearLogs(deleteOlderThan);
      setShowDeleteConfirm(false);
    } catch (err) {
      alert("Error al limpiar logs: " + err.message);
    }
  };

  const exportLogs = () => {
    actions.exportCSV();
  };

  if (loading && !refreshing) {
    return <LoadingUI message="Accediendo a la bitácora..." fullPage />;
  }

  return (
    <PageWrapper>
      <HeaderSection>
        <TitleArea>
          <h2>Bitácora del Sistema</h2>
          <p>Registro histórico detallado de operaciones y errores</p>
        </TitleArea>
        <ActionsRow>
          <FilterItem>
            <FaFilter />
            <select value={filters.level} onChange={(e) => handleFilterChange("level", e.target.value)}>
              <option value="all">Todos los niveles</option>
              <option value="error">Errores</option>
              <option value="warn">Advertencias</option>
              <option value="info">Información</option>
              <option value="debug">Debug</option>
            </select>
          </FilterItem>

          <FilterItem>
            <select 
              value={filters.operationType?.[0] || ""} 
              onChange={(e) => handleFilterChange("operationType", e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todas las operaciones</option>
              {operationTypes.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </FilterItem>

          <FilterItem>
            <select 
              value={filters.entityType?.[0] || ""} 
              onChange={(e) => handleFilterChange("entityType", e.target.value ? [e.target.value] : [])}
            >
              <option value="">Todas las entidades</option>
              {entityTypes.map(ent => (
                <option key={ent} value={ent}>{ent}</option>
              ))}
            </select>
          </FilterItem>

          <DateRange>
            <FaCalendarAlt />
            <DatePicker
              selected={filters.startDate}
              onChange={(date) => handleFilterChange("startDate", date)}
              placeholderText="Inicio"
              className="custom-datepicker"
            />
            <span>-</span>
            <DatePicker
              selected={filters.endDate}
              onChange={(date) => handleFilterChange("endDate", date)}
              placeholderText="Fin"
              className="custom-datepicker"
            />
          </DateRange>

          <ButtonGroup>
            <IconButton onClick={actions.refreshLogs} $loading={refreshing} title="Refrescar">
              <FaSync />
            </IconButton>
            <IconButton onClick={exportLogs} title="Exportar CSV">
              <FaDownload />
            </IconButton>
            <IconButton onClick={() => setShowDeleteConfirm(true)} $variant="danger" title="Limpiar todo">
              <FaTrashAlt />
            </IconButton>
          </ButtonGroup>
        </ActionsRow>
      </HeaderSection>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <LogsList>
        {logs.map((log) => (
          <LogCard key={log._id} onClick={() => { setSelectedLog(log); setShowLogDetail(true); }}>
            <LogHeader>
              <StatusBadge status={log.level}>{log.level}</StatusBadge>
              {log.operationType && (
                <Badge $color={getOperationTypeColor(log.operationType)}>{log.operationType}</Badge>
              )}
              {log.entityType && (
                <Badge $color={getEntityTypeColor(log.entityType)}>{log.entityType}</Badge>
              )}
              <span className="timestamp">{new Date(log.timestamp).toLocaleString()}</span>
            </LogHeader>
            <LogContent>
              <p className="message">{log.message}</p>
              <LogMeta>
                {log.source && <span className="source">Source: {log.source}</span>}
                {log.entityId && <span className="entityId">ID: {log.entityId}</span>}
                {log.affectedRecords > 0 && <span className="affected">Registros: {log.affectedRecords}</span>}
                {log.durationMs > 0 && (
                  <span className="duration" $color={getDurationColor(log.durationMs)}>
                    ⏱ {log.durationMs}ms
                  </span>
                )}
              </LogMeta>
            </LogContent>
          </LogCard>
        ))}
      </LogsList>

      <PaginationArea>
        <PaginationInfo>
          Página {pagination.page} de {meta.pages} ({meta.total} registros)
        </PaginationInfo>
        <PaginationButtons>
          <PageBtn disabled={pagination.page === 1} onClick={() => actions.changePage(1)}>Primero</PageBtn>
          <PageBtn disabled={pagination.page === 1} onClick={() => actions.changePage(pagination.page - 1)}>Anterior</PageBtn>
          <PageBtn disabled={pagination.page === meta.pages} onClick={() => actions.changePage(pagination.page + 1)}>Siguiente</PageBtn>
        </PaginationButtons>
      </PaginationArea>

      <LogDetailModal
        log={showLogDetail ? selectedLog : null}
        onClose={() => setShowLogDetail(false)}
      />

      <ClearLogsModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleClearLogs}
        value={deleteOlderThan}
        onChange={setDeleteOlderThan}
      />
    </PageWrapper>
  );
}

const PageWrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.bg};
  min-height: 100%;
`;

const HeaderSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const TitleArea = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  h2 { margin: 0; font-size: 24px; font-weight: 800; color: ${({ theme }) => theme.text}; }
  p { margin: 5px 0 0; color: ${({ theme }) => theme.textSecondary}; font-size: 14px; }
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
  background: ${({ theme }) => theme.cardBg};
  padding: 15px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.soft};
`;

const FilterItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${({ theme }) => theme.primary};

  select {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.bg2};
    color: ${({ theme }) => theme.text};
    font-weight: 600;
  }
`;

const DateRange = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.primary};

  .custom-datepicker {
    width: 100px;
    padding: 8px;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    background: ${({ theme }) => theme.bg2};
    color: ${({ theme }) => theme.text};
    font-size: 13px;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

const IconButton = styled.button`
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ theme, $variant }) => $variant === 'danger' ? theme.danger : theme.primary};
  color: white;

  &:hover { transform: scale(1.1); filter: brightness(1.1); }
  
  svg {
    animation: ${({ $loading }) => $loading ? "spin 1s linear infinite" : "none"};
  }

  @keyframes spin { 100% { transform: rotate(360deg); } }
`;

const LogsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
`;

const LogCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  padding: 12px 18px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.primary};
    box-shadow: ${({ theme }) => theme.shadows.soft};
    transform: translateX(4px);
  }
`;

const LogHeader = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 6px;
  gap: 8px;

  .timestamp { font-size: 12px; color: ${({ theme }) => theme.textSecondary}; font-family: monospace; margin-left: auto; }
`;

const Badge = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  background: ${({ $color }) => $color || "#6b7280"};
  text-transform: uppercase;
`;

const LogContent = styled.div`
  .message { margin: 0; font-size: 14px; color: ${({ theme }) => theme.text}; font-weight: 500; }
`;

const LogMeta = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 6px;
  flex-wrap: wrap;
  
  .source, .entityId, .affected { font-size: 11px; color: ${({ theme }) => theme.textSecondary}; }
  .duration { font-size: 11px; font-weight: 600; }
`;

const PaginationArea = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.border};
`;

const PaginationInfo = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageBtn = styled.button`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:not(:disabled):hover { border-color: ${({ theme }) => theme.primary}; }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.danger}15;
  color: ${({ theme }) => theme.danger};
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid ${({ theme }) => theme.danger}30;
`;
