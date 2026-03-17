import React from "react";
import styled from "styled-components";
import { FaTerminal, FaClock, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaDatabase } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const TableContainer = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 16px 24px;
  background: rgba(248, 250, 252, 0.5);
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
`;

const Tr = styled.tr`
  border-bottom: 1px solid rgba(0, 0, 0, 0.03);
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

const Td = styled.td`
  padding: 16px 24px;
  font-size: 14px;
  color: #1e293b;
  vertical-align: middle;
`;

const LogMessage = styled.div`
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #334155;
  max-width: 500px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Timestamp = styled.span`
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
`;

const Pagination = styled.div`
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(248, 250, 252, 0.3);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
`;

export const AuditDataTable = ({
    data = [],
    type = "system",
    pagination,
    onPageChange,
    loading
}) => {
    if (loading && data.length === 0) {
        return <div style={{ textAlign: 'center', padding: '60px', opacity: 0.7 }}>Cargando registros...</div>;
    }

    return (
        <TableContainer>
            <div style={{ overflowX: 'auto' }}>
                <StyledTable>
                    <thead>
                        {type === "system" ? (
                            <tr>
                                <Th>Severidad</Th>
                                <Th>Fecha y Hora</Th>
                                <Th>Mensaje</Th>
                                <Th>Fuente</Th>
                            </tr>
                        ) : (
                            <tr>
                                <Th>Tarea</Th>
                                <Th>Estado</Th>
                                <Th>Fecha</Th>
                                <Th>Registros</Th>
                                <Th>Duración</Th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <Td colSpan="5" style={{ textAlign: 'center', padding: '60px', opacity: 0.6 }}>
                                    No se encontraron registros de auditoría.
                                </Td>
                            </tr>
                        ) : (
                            data.map((item, i) => (
                                <Tr key={item._id || i}>
                                    {type === "system" ? (
                                        <>
                                            <Td>
                                                <StatusBadge variant={
                                                    item.level === 'ERROR' || item.level === 'CRITICAL' ? 'danger' :
                                                        item.level === 'WARNING' ? 'warning' : 'info'
                                                }>
                                                    {item.level}
                                                </StatusBadge>
                                            </Td>
                                            <Td><Timestamp>{new Date(item.timestamp).toLocaleString()}</Timestamp></Td>
                                            <Td><LogMessage title={item.message}>{item.message}</LogMessage></Td>
                                            <Td><span style={{ fontSize: '12px', opacity: 0.7 }}>{item.source || 'SISTEMA'}</span></Td>
                                        </>
                                    ) : (
                                        <>
                                            <Td><span style={{ fontWeight: 700 }}>{item.taskName || item.name}</span></Td>
                                            <Td>
                                                <StatusBadge variant={
                                                    item.status === 'completed' ? 'success' :
                                                        item.status === 'failed' ? 'danger' : 'warning'
                                                }>
                                                    {item.status.toUpperCase()}
                                                </StatusBadge>
                                            </Td>
                                            <Td><Timestamp>{new Date(item.date).toLocaleString()}</Timestamp></Td>
                                            <Td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FaDatabase size={12} color="#94a3b8" />
                                                    <span style={{ fontWeight: 600 }}>{item.totalRecords || 0}</span>
                                                </div>
                                            </Td>
                                            <Td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FaClock size={12} color="#94a3b8" />
                                                    <span>{item.executionTime || 0}ms</span>
                                                </div>
                                            </Td>
                                        </>
                                    )}
                                </Tr>
                            ))
                        )}
                    </tbody>
                </StyledTable>
            </div>

            <Pagination>
                <span style={{ fontSize: '13px', opacity: 0.7 }}>
                    Página <b>{pagination.page}</b> de <b>{pagination.pages}</b>
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                        variant="outline"
                        size="small"
                        disabled={pagination.page <= 1}
                        onClick={() => onPageChange(pagination.page - 1)}
                    >
                        Anterior
                    </Button>
                    <Button
                        variant="outline"
                        size="small"
                        disabled={pagination.page >= pagination.pages}
                        onClick={() => onPageChange(pagination.page + 1)}
                    >
                        Siguiente
                    </Button>
                </div>
            </Pagination>
        </TableContainer>
    );
};
