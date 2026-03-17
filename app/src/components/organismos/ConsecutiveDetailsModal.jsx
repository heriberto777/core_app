import React from "react";
import styled from "styled-components";
import { FaTimes, FaChartBar, FaLayerGroup, FaHistory, FaInfoCircle } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 800px; max-height: 85vh;
  border-radius: 28px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 24px 32px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}20;
`;

const Body = styled.div`
  padding: 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 32px;
`;

const MetricsGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;
`;

const MetricCard = styled.div`
  padding: 20px; border-radius: 20px; background: ${({ theme }) => theme.bg2}10;
  border: 1px solid ${({ theme }) => theme.border}; display: flex; flex-direction: column; gap: 8px;
`;

const MetricLabel = styled.div`
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${({ theme }) => theme.textSecondary};
`;

const MetricValue = styled.div`
  font-size: 24px; font-weight: 900; color: ${({ theme, $color }) => $color || theme.text};
`;

const Section = styled.div`
  display: flex; flex-direction: column; gap: 16px;
`;

const SectionTitle = styled.h4`
  margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  color: ${({ theme }) => theme.primary}; display: flex; align-items: center; gap: 10px;
`;

const TableContainer = styled.div`
  border-radius: 16px; border: 1px solid ${({ theme }) => theme.border}; overflow: hidden;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  thead { background: ${({ theme }) => theme.bg2}40; }
  th { padding: 12px 16px; text-align: left; color: ${({ theme }) => theme.textSecondary}; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  td { padding: 12px 16px; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
`;

export function ConsecutiveDetailsModal({ isOpen, onClose, metrics }) {
    if (!isOpen || !metrics) return null;

    const { consecutiveName, currentValue, metrics: stats } = metrics;
    const segments = stats.bySegment ? Object.entries(stats.bySegment) : [];

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: 0 }}>Análisis de Folio</h3>
                        <span style={{ fontSize: '13px', opacity: 0.7 }}>Consecutivo: <strong>{consecutiveName}</strong></span>
                    </div>
                    <Button variant="ghost" onClick={onClose}><FaTimes /></Button>
                </Header>

                <Body>
                    <Section>
                        <SectionTitle><FaChartBar /> Rendimiento (Últimas 24h)</SectionTitle>
                        <MetricsGrid>
                            <MetricCard>
                                <MetricLabel>Valor Actual</MetricLabel>
                                <MetricValue>{currentValue}</MetricValue>
                            </MetricCard>
                            <MetricCard>
                                <MetricLabel>Incrementos</MetricLabel>
                                <MetricValue $color="#28a745">+{stats.totalIncrements}</MetricValue>
                            </MetricCard>
                            <MetricCard>
                                <MetricLabel>Reservas Up</MetricLabel>
                                <MetricValue $color="#17a2b8">{stats.activeReservations}</MetricValue>
                            </MetricCard>
                            <MetricCard>
                                <MetricLabel>Rango Operativo</MetricLabel>
                                <div style={{ fontSize: '12px', fontWeight: '700' }}>
                                    {stats.valueRange.min} — {stats.valueRange.max}
                                </div>
                            </MetricCard>
                        </MetricsGrid>
                    </Section>

                    {segments.length > 0 && (
                        <Section>
                            <SectionTitle><FaLayerGroup /> Desglose por Segmentos</SectionTitle>
                            <TableContainer>
                                <Table>
                                    <thead>
                                        <tr>
                                            <th>Identificador</th>
                                            <th>Valor Actual</th>
                                            <th>Incrementos (24h)</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {segments.map(([name, data]) => (
                                            <tr key={name}>
                                                <td style={{ fontWeight: '600' }}>{name}</td>
                                                <td>{data.currentValue}</td>
                                                <td style={{ color: '#28a745', fontWeight: '700' }}>+{data.incrementCount}</td>
                                                <td><StatusBadge status="active">OPERATIVO</StatusBadge></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </TableContainer>
                        </Section>
                    )}

                    {!segments.length && (
                        <div style={{ textAlign: 'center', padding: '40px', background: `${props => props.theme.bg2}10`, borderRadius: '20px', border: `1px solid ${props => props.theme.border}20` }}>
                            <FaInfoCircle size={32} style={{ opacity: 0.3, marginBottom: '12px', color: ({ theme }) => theme.textSecondary }} />
                            <p style={{ margin: 0, opacity: 0.6, fontSize: '14px', color: ({ theme }) => theme.text }}>Este consecutivo no utiliza segmentación. Los valores son globales para todo el sistema.</p>
                        </div>
                    )}
                </Body>

                <div style={{ padding: '24px 32px', borderTop: `1px solid ${props => props.theme.border}40`, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" onClick={onClose}>Cerrar Análisis</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
