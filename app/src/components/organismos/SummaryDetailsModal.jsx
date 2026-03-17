import React from "react";
import styled from "styled-components";
import { FaTruck, FaTimes, FaCalendarAlt, FaBoxOpen, FaInfoCircle } from "react-icons/fa";
import { Modal, Button } from "../../index";

const Content = styled.div` display: flex; flex-direction: column; gap: 24px; padding: 24px; max-height: 80vh; overflow-y: auto; `;

const HeaderGrid = styled.div` display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; `;

const InfoCard = styled.div`
  padding: 16px; background: ${({ theme }) => theme.bg2}08; border-radius: 16px; border: 1px solid ${({ theme }) => theme.border}40;
  display: flex; flex-direction: column; gap: 4px;
  label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${({ theme }) => theme.textSecondary}; opacity: 0.6; }
  span { font-size: 14px; font-weight: 700; color: ${({ theme }) => theme.text}; }
`;

const ReturnSection = styled.div`
  padding: 16px; background: #f59e0b08; border: 1px dashed #f59e0b40; border-radius: 16px;
  display: flex; flex-direction: column; gap: 8px;
  h4 { margin: 0; font-size: 13px; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 8px; }
  p { margin: 0; font-size: 12px; color: ${({ theme }) => theme.textSecondary}; }
`;

const TableContainer = styled.div` border-radius: 16px; border: 1px solid ${({ theme }) => theme.border}; overflow: hidden; `;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 12px;
  thead { background: ${({ theme }) => theme.bg2}10; }
  th { padding: 12px; text-align: left; font-weight: 800; text-transform: uppercase; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; }
  td { padding: 12px; border-bottom: 1px solid ${({ theme }) => theme.border}20; color: ${({ theme }) => theme.text}; }
  tr:last-child td { border-bottom: none; }
  .text-right { text-align: right; }
  .highlight { font-weight: 800; color: ${({ theme }) => theme.primary}; }
  .warning { color: #ef4444; font-weight: 700; }
`;

export function SummaryDetailsModal({ isOpen, onClose, summary }) {
    if (!isOpen || !summary) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} width="850px">
            <Content>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaBoxOpen color="var(--primary)" /> Inspección Técnica: Carga #{summary.loadId}
                    </h2>
                    <Button variant="ghost" icon={<FaTimes />} onClick={onClose} />
                </div>

                <HeaderGrid>
                    <InfoCard><label>Ruta / Vendedor</label><span>{summary.route}</span></InfoCard>
                    <InfoCard><label>Documento de Traspaso</label><span>{summary.documentId || "N/A"}</span></InfoCard>
                    <InfoCard><label><FaCalendarAlt /> Fecha de Carga</label><span>{new Date(summary.date).toLocaleString()}</span></InfoCard>
                    <InfoCard><label>Estado Operativo</label><span style={{ textTransform: 'uppercase' }}>{summary.status}</span></InfoCard>
                </HeaderGrid>

                {summary.returnData && (
                    <ReturnSection>
                        <h4><FaInfoCircle /> Información de Última Devolución</h4>
                        <p><strong>Doc. Retorno:</strong> {summary.returnData.documentId}</p>
                        <p><strong>Motivo:</strong> {summary.returnData.reason}</p>
                    </ReturnSection>
                )}

                <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', opacity: 0.6 }}>Desglose de Ítems</h4>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Descripción</th>
                                    <th className="text-right">Original</th>
                                    <th className="text-right">Devuelto</th>
                                    <th className="text-right">Remanente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.products?.map((p, i) => (
                                    <tr key={i}>
                                        <td className="highlight">{p.code}</td>
                                        <td>{p.description || "Sin descripción"}</td>
                                        <td className="text-right">{p.quantity}</td>
                                        <td className="text-right warning">{p.returnedQuantity || 0}</td>
                                        <td className="text-right highlight">{p.quantity - (p.returnedQuantity || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot style={{ background: 'var(--primary)05', fontWeight: '800' }}>
                                <tr>
                                    <td colSpan={2}>TOTALES DE CARGA</td>
                                    <td className="text-right">{summary.totalQuantity}</td>
                                    <td className="text-right warning">{summary.products?.reduce((s, p) => s + (p.returnedQuantity || 0), 0)}</td>
                                    <td className="text-right highlight">
                                        {summary.totalQuantity - (summary.products?.reduce((s, p) => s + (p.returnedQuantity || 0), 0) || 0)}
                                    </td>
                                </tr>
                            </tfoot>
                        </Table>
                    </TableContainer>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <Button variant="primary" onClick={onClose}>Cerrar Auditoría</Button>
                </div>
            </Content>
        </Modal>
    );
}
