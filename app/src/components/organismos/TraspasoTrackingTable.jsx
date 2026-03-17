import React from "react";
import styled from "styled-components";
import { FaEye, FaPlay, FaCheckCircle, FaExclamationCircle, FaSpinner } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const GlassTableWrapper = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`;

const THead = styled.thead`
  background: rgba(248, 250, 252, 0.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
`;

const Th = styled.th`
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.8px;
`;

const Tr = styled.tr`
  border-bottom: 1px solid rgba(0, 0, 0, 0.03);
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

const Td = styled.td`
  padding: 16px;
  color: #334155;
  vertical-align: middle;
`;

const LoadCode = styled.code`
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
`;

const SuccessRate = styled.div`
  width: 100%;
  max-width: 100px;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
`;

const Progress = styled.div`
  height: 100%;
  width: ${props => props.percent}%;
  background: ${props => {
    if (props.percent >= 90) return "#10b981";
    if (props.percent >= 50) return "#f59e0b";
    return "#ef4444";
  }};
  transition: width 1s ease;
`;

export const TraspasoTrackingTable = ({
  transfers = [],
  loading,
  onViewDetails,
  onExecute,
  selectedItems = [],
  onSelectItem,
  onSelectAll
}) => {

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <FaCheckCircle style={{ color: '#10b981' }} />;
      case 'failed': return <FaExclamationCircle style={{ color: '#ef4444' }} />;
      default: return <FaSpinner className="spinning" style={{ color: '#3b82f6' }} />;
    }
  };

  if (loading && transfers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <FaSpinner className="spinning" size={32} color="#3b82f6" />
        <p style={{ marginTop: '16px', opacity: 0.7 }}>Cargando traspasos operativos...</p>
      </div>
    );
  }

  return (
    <GlassTableWrapper>
      <div style={{ overflowX: 'auto' }}>
        <Table>
          <THead>
            <Tr>
              <Th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  onChange={(e) => onSelectAll(e.target.checked)}
                  checked={transfers.length > 0 && selectedItems.length === transfers.length}
                />
              </Th>
              <Th>Estado / Origen</Th>
              <Th>Load ID</Th>
              <Th>Documento</Th>
              <Th>Éxito (Líneas)</Th>
              <Th>Fecha</Th>
              <Th style={{ textAlign: 'right' }}>Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {transfers.length === 0 ? (
              <Tr>
                <Td colSpan="7" style={{ textAlign: 'center', padding: '60px', opacity: 0.7 }}>
                  No se encontraron traspasos para este criterio.
                </Td>
              </Tr>
            ) : (
              transfers.map(t => (
                <Tr key={t.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(t.id)}
                      onChange={() => onSelectItem(t.id)}
                    />
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getStatusIcon(t.status)}
                      <div>
                        <StatusBadge variant={t.status}>{t.status_description || t.status}</StatusBadge>
                        {t.is_return === 1 && (
                          <span style={{
                            marginLeft: '4px',
                            fontSize: '10px',
                            background: '#fee2e2',
                            color: '#ef4444',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontWeight: 'bold'
                          }}>DEV</span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td><LoadCode>{t.load_id}</LoadCode></Td>
                  <Td>
                    <span style={{ fontWeight: 500, color: '#3b82f6' }}>{t.documento_generated || '—'}</span>
                  </Td>
                  <Td>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>
                      {t.success_percentage}% ({t.lines_successful}/{t.total_products})
                    </div>
                    <SuccessRate>
                      <Progress percent={t.success_percentage} />
                    </SuccessRate>
                  </Td>
                  <Td>
                    <div style={{ fontSize: '13px' }}>{new Date(t.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '11px', opacity: 0.6 }}>{new Date(t.created_at).toLocaleTimeString()}</div>
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="small" loading={actionStates && actionStates[t.id] === 'details'} onClick={() => onViewDetails(t.id)}>
                        <FaEye /> Detalle
                      </Button>
                      {t.status !== 'completed' && (
                        <Button variant="primary" size="small" loading={actionStates && actionStates[t.load_id] === 'executing'} onClick={() => onExecute(t.load_id)}>
                          <FaPlay /> Ejecutar
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </GlassTableWrapper>
  );
};
