import React from "react";
import styled from "styled-components";
import { FaEye, FaUndo, FaCheckCircle, FaExclamationCircle, FaInfoCircle } from "react-icons/fa";
import { Button } from "../../index";

const Container = styled.div`
  width: 100%; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.cardBg}; overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

const TableWrapper = styled.div` overflow-x: auto; `;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  th { padding: 16px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bg2}10; }
  td { padding: 16px; border-bottom: 1px solid ${({ theme }) => theme.border}40; color: ${({ theme }) => theme.text}; vertical-align: middle; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
  tr:last-child td { border-bottom: none; }
`;

const StatusBadge = styled.span`
  padding: 6px 12px; border-radius: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase;
  display: inline-flex; align-items: center; gap: 6px;
  background: ${({ $color }) => $color}15; color: ${({ $color }) => $color}; border: 1px solid ${({ $color }) => $color}30;
`;

const Actions = styled.div` display: flex; gap: 8px; `;

const Metric = styled.div`
  display: flex; flex-direction: column; gap: 2px;
  small { font-size: 10px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; opacity: 0.6; }
  strong { font-size: 14px; color: ${({ theme }) => theme.text}; font-family: monospace; }
`;

export function SummaryDataTable({ summaries, onView, onReturn, refreshing }) {
    const getStatusConfig = (status) => {
        switch (status) {
            case "completed": return { label: "Completado", color: "#10b981", icon: <FaCheckCircle /> };
            case "partial_return": return { label: "Dev. Parcial", color: "#f59e0b", icon: <FaInfoCircle /> };
            case "full_return": return { label: "Dev. Total", color: "#ef4444", icon: <FaExclamationCircle /> };
            default: return { label: status, color: "#64748b", icon: <FaInfoCircle /> };
        }
    };

    return (
        <Container style={{ opacity: refreshing ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            <TableWrapper>
                <Table>
                    <thead>
                        <tr>
                            <th>ID Carga</th>
                            <th>Documento</th>
                            <th>Ruta / Vendedor</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Productos (Ítems)</th>
                            <th>Totales (Original / Dev)</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summaries.length > 0 ? summaries.map(summary => {
                            const status = getStatusConfig(summary.status);
                            const returnedQty = summary.products?.reduce((sum, p) => sum + (p.returnedQuantity || 0), 0) || 0;

                            return (
                                <tr key={summary._id}>
                                    <td><strong>#{summary.loadId}</strong></td>
                                    <td><code style={{ fontSize: '12px' }}>{summary.documentId || "N/A"}</code></td>
                                    <td>{summary.route}</td>
                                    <td>{new Date(summary.date).toLocaleDateString()}</td>
                                    <td>
                                        <StatusBadge $color={status.color}>{status.icon} {status.label}</StatusBadge>
                                    </td>
                                    <td>
                                        <Metric>
                                            <small>Cant. Ítems</small>
                                            <strong>{summary.totalProducts}</strong>
                                        </Metric>
                                    </td>
                                    <td>
                                        <Metric>
                                            <small>Unid: {summary.totalQuantity}</small>
                                            <strong style={{ color: returnedQty > 0 ? "#ef4444" : "inherit" }}>Dev: {returnedQty}</strong>
                                        </Metric>
                                    </td>
                                    <td>
                                        <Actions>
                                            <Button variant="ghost" size="small" icon={<FaEye />} onClick={() => onView(summary._id)} title="Ver detalles técnicos" />
                                            {summary.status !== "full_return" && (
                                                <Button
                                                    variant="ghost"
                                                    size="small"
                                                    icon={<FaUndo />}
                                                    onClick={() => onReturn(summary._id)}
                                                    title="Procesar devolución"
                                                    color="#f59e0b"
                                                />
                                            )}
                                        </Actions>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '60px', opacity: 0.5, fontStyle: 'italic' }}>
                                    No se han encontrado registros de carga para los criterios seleccionados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </TableWrapper>
        </Container>
    );
}
