// src/components/organismos/TraspasoTrackingTable.jsx
import React, { useState, useCallback, useMemo } from "react";
import styled from "styled-components";
import {
  LoadsButton,
  StatusBadge,
  LoadingSpinner,
  ConfirmDialog,
  CustomPagination
} from "../../index";

import {
  FaEye,
  FaPlay,
  FaRedo,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaSpinner,
} from "react-icons/fa";

// 🔄 Usar el mismo estilo que OrdersList de LoadsManagement
const TableContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

// const TableHeader = styled.div`
//   background: #f9fafb;
//   border-bottom: 1px solid #e5e7eb;
//   padding: 16px 20px;
//   display: flex;
//   justify-content: space-between;
//   align-items: center;
// `;

const TableTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
`;

const TableActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #f3f4f6;

  &:hover {
    background: #f9fafb;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableHeader = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  ${({ align }) => align && `text-align: ${align};`}
  ${({ width }) => width && `width: ${width};`}
`;

const TableCell = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  color: #374151;
  vertical-align: middle;

  ${({ align }) => align && `text-align: ${align};`}
`;

const LoadIdCode = styled.code`
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: "Courier New", monospace;
  color: #1f2937;
  font-weight: 600;
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
`;

const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: #6b7280;

  .icon {
    font-size: 48px;
    color: #d1d5db;
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 8px 0;
    color: #374151;
    font-size: 18px;
  }

  p {
    margin: 0;
    font-size: 14px;
    max-width: 400px;
    margin: 0 auto;
  }
`;

const BulkActions = styled.div`
  padding: 16px 20px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .selection-info {
    font-size: 14px;
    color: #6b7280;
  }

  .actions {
    display: flex;
    gap: 8px;
  }
`;

export const TraspasoTrackingTable = ({
  transfers = [],
  loading = false,
  onExecuteTransfer,
  onViewDetails,
  onRefresh,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  filters = {},
  selectedTransfers = [],
  onSelectTransfer,
  onSelectAll,
  onBulkExecute,
}) => {
  const [confirmDialog, setConfirmDialog] = useState({
    show: false,
    transfer: null,
    action: null,
  });
  const [executingTransfers, setExecutingTransfers] = useState(new Set());

  // Obtener icono de estado
  const getStatusIcon = useCallback((status) => {
    const icons = {
      PENDING: <FaClock style={{ color: "#f59e0b" }} />,
      PROCESSING: (
        <FaSpinner style={{ color: "#3b82f6" }} className="fa-spin" />
      ),
      COMPLETED: <FaCheckCircle style={{ color: "#10b981" }} />,
      ERROR: <FaExclamationTriangle style={{ color: "#ef4444" }} />,
      CANCELLED: <FaExclamationTriangle style={{ color: "#6b7280" }} />,
    };
    return icons[status] || <FaClock style={{ color: "#6b7280" }} />;
  }, []);

  // Obtener texto de estado
  const getStatusText = useCallback((status) => {
    const statusTexts = {
      PENDING: "Pendiente",
      PROCESSING: "Procesando",
      COMPLETED: "Completado",
      ERROR: "Error",
      CANCELLED: "Cancelado",
    };
    return statusTexts[status] || status;
  }, []);

  // Verificar si se puede ejecutar
  const canExecuteTransfer = useCallback((status) => {
    return ["PENDING", "ERROR"].includes(status);
  }, []);

  // Manejadores de eventos
  const handleExecuteTransfer = useCallback((transfer) => {
    setConfirmDialog({
      show: true,
      transfer,
      action: "execute",
      title: "Confirmar Ejecución de Traspaso",
      message: `¿Estás seguro de ejecutar el traspaso para el Load ID: ${transfer.loadId}?\n\nEsto iniciará la transferencia de inventario entre bodegas.`,
      confirmText: "Ejecutar Traspaso",
      variant: "primary",
    });
  }, []);

  const handleRetryTransfer = useCallback((transfer) => {
    setConfirmDialog({
      show: true,
      transfer,
      action: "retry",
      title: "Reintentar Traspaso",
      message: `¿Deseas reintentar el traspaso para el Load ID: ${transfer.loadId}?\n\nEsto volverá a ejecutar el proceso de transferencia.`,
      confirmText: "Reintentar",
      variant: "warning",
    });
  }, []);

  const handleConfirmAction = useCallback(async () => {
    const { transfer, action } = confirmDialog;
    if (!transfer) return;

    try {
      setExecutingTransfers((prev) => new Set(prev).add(transfer.loadId));

      if (action === "execute" || action === "retry") {
        await onExecuteTransfer(transfer);
      }

      setConfirmDialog({ show: false, transfer: null, action: null });
    } catch (error) {
      console.error(`Error ${action} transfer:`, error);
    } finally {
      setExecutingTransfers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(transfer.loadId);
        return newSet;
      });
    }
  }, [confirmDialog, onExecuteTransfer]);

  const handleViewDetails = useCallback(
    (transfer) => {
      onViewDetails?.(transfer);
    },
    [onViewDetails]
  );

  // Calcular estadísticas de selección
  const selectionStats = useMemo(() => {
    const selected = transfers.filter((t) =>
      selectedTransfers.includes(t.loadId)
    );
    const pendingCount = selected.filter((t) => t.status === "PENDING").length;

    return {
      total: selected.length,
      pending: pendingCount,
      canExecute: pendingCount > 0,
    };
  }, [transfers, selectedTransfers]);

  // Renderizado condicional para loading
  if (loading) {
    return (
      <TableContainer>
        <div style={{ padding: "48px", textAlign: "center" }}>
          <LoadingSpinner size="large" type="dots" color="#3b82f6" />
          <p style={{ marginTop: "16px", color: "#6b7280" }}>
            Cargando traspasos...
          </p>
        </div>
      </TableContainer>
    );
  }

  // Estado vacío
  if (!transfers?.length) {
    return (
      <TableContainer>
        <EmptyState>
          <div className="icon">📦</div>
          <h3>No hay traspasos</h3>
          <p>
            {Object.keys(filters).some(
              (key) =>
                filters[key] && filters[key] !== "all" && filters[key] !== ""
            )
              ? "No se encontraron traspasos con los filtros aplicados. Intenta ajustar los criterios de búsqueda."
              : "No hay traspasos registrados en el sistema. Los traspasos aparecerán aquí cuando se procesen cargas."}
          </p>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <>
      <TableContainer>
        <TableHeader>
          <TableTitle>Traspasos de Inventario ({transfers.length})</TableTitle>
          <TableActions>
            <LoadsButton
              variant="secondary"
              size="small"
              onClick={onRefresh}
              loading={loading}
            >
              🔄 Actualizar
            </LoadsButton>
          </TableActions>
        </TableHeader>

        {/* Acciones masivas */}
        {selectedTransfers.length > 0 && (
          <BulkActions>
            <div className="selection-info">
              {selectionStats.total} traspasos seleccionados
              {selectionStats.pending > 0 && (
                <span style={{ color: "#f59e0b", marginLeft: "8px" }}>
                  ({selectionStats.pending} ejecutables)
                </span>
              )}
            </div>
            <div className="actions">
              {selectionStats.canExecute && (
                <LoadsButton
                  variant="primary"
                  size="small"
                  onClick={() => onBulkExecute?.(selectedTransfers)}
                >
                  <FaPlay /> Ejecutar Seleccionados ({selectionStats.pending})
                </LoadsButton>
              )}
            </div>
          </BulkActions>
        )}

        <Table>
          <TableHead>
            <TableRow>
              {onSelectAll && (
                <TableHeader width="50px">
                  <input
                    type="checkbox"
                    checked={selectedTransfers.length === transfers.length}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                  />
                </TableHeader>
              )}
              <TableHeader width="120px">Load ID</TableHeader>
              <TableHeader width="130px">Fecha Traspaso</TableHeader>
              <TableHeader width="120px">Bodega Origen</TableHeader>
              <TableHeader width="120px">Bodega Destino</TableHeader>
              <TableHeader width="80px" align="center">
                Items
              </TableHeader>
              <TableHeader width="120px" align="right">
                Cantidad
              </TableHeader>
              <TableHeader width="120px">Estado</TableHeader>
              <TableHeader width="180px" align="center">
                Acciones
              </TableHeader>
            </TableRow>
          </TableHead>
          <tbody>
            {transfers.map((transfer) => {
              const isExecuting = executingTransfers.has(transfer.loadId);
              const isSelected = selectedTransfers.includes(transfer.loadId);

              return (
                <TableRow key={transfer.loadId}>
                  {onSelectTransfer && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          onSelectTransfer?.(transfer.loadId, e.target.checked)
                        }
                      />
                    </TableCell>
                  )}

                  <TableCell>
                    <LoadIdCode>{transfer.loadId}</LoadIdCode>
                  </TableCell>

                  <TableCell>
                    {transfer.transferDate
                      ? new Date(transfer.transferDate).toLocaleDateString(
                          "es-DO"
                        )
                      : "-"}
                  </TableCell>

                  <TableCell>{transfer.sourceWarehouse || "-"}</TableCell>
                  <TableCell>{transfer.targetWarehouse || "-"}</TableCell>

                  <TableCell align="center">
                    {transfer.totalItems?.toLocaleString() || "0"}
                  </TableCell>

                  <TableCell align="right">
                    {transfer.totalQuantity?.toLocaleString() || "0"}
                  </TableCell>

                  <TableCell>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {getStatusIcon(transfer.status)}
                      <span>{getStatusText(transfer.status)}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <ActionButtonsContainer>
                      <LoadsButton
                        variant="secondary"
                        size="small"
                        onClick={() => handleViewDetails(transfer)}
                        title="Ver detalles"
                      >
                        <FaEye />
                      </LoadsButton>

                      {canExecuteTransfer(transfer.status) && (
                        <LoadsButton
                          variant="primary"
                          size="small"
                          onClick={() => handleExecuteTransfer(transfer)}
                          loading={isExecuting}
                          disabled={isExecuting}
                          title="Ejecutar traspaso"
                        >
                          <FaPlay />
                        </LoadsButton>
                      )}

                      {transfer.status === "ERROR" && (
                        <LoadsButton
                          variant="warning"
                          size="small"
                          onClick={() => handleRetryTransfer(transfer)}
                          loading={isExecuting}
                          disabled={isExecuting}
                          title="Reintentar"
                        >
                          <FaRedo />
                        </LoadsButton>
                      )}
                    </ActionButtonsContainer>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
            <CustomPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              showPrevNext
              showFirstLast
            />
          </div>
        )}
      </TableContainer>

      {/* Modal de confirmación */}
      <ConfirmDialog
        show={confirmDialog.show}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        onConfirm={handleConfirmAction}
        onCancel={() =>
          setConfirmDialog({ show: false, transfer: null, action: null })
        }
      />
    </>
  );
};
