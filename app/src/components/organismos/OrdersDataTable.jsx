import React from "react";
import styled from "styled-components";
import { FaEye, FaPlay, FaCheckSquare, FaSquare } from "react-icons/fa";
import { StatusBadge, Button } from "../../index";

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.border}; overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

const Scrollable = styled.div`
  overflow-x: auto; max-height: 600px; overflow-y: auto;
  &::-webkit-scrollbar { width: 8px; height: 8px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.border}; border-radius: 10px; }
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  thead { position: sticky; top: 0; z-index: 10; background: ${({ theme }) => theme.bg2}; }
  th { padding: 16px 20px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: ${({ theme }) => theme.textSecondary}; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  td { padding: 14px 20px; border-bottom: 1px solid ${({ theme }) => theme.border}40; color: ${({ theme }) => theme.text}; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
  tr:last-child td { border-bottom: none; }
`;

const CheckboxCell = styled.td` width: 50px; text-align: center; cursor: pointer; `;
const ActionsCell = styled.td` width: 120px; text-align: right; `;

const ActionGrid = styled.div` display: flex; gap: 8px; justify-content: flex-end; `;

export function OrdersDataTable({
    data,
    selectedIds,
    onSelect,
    onSelectAll,
    onViewDetails,
    onProcess
}) {
    if (!data || data.length === 0) return null;

    const columns = Object.keys(data[0]);
    const idField = columns[0];
    const isAllSelected = data.length > 0 && selectedIds.length === data.length;

    return (
        <TableWrapper>
            <Scrollable>
                <Table>
                    <thead>
                        <tr>
                            <th>
                                <div onClick={onSelectAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {isAllSelected ? <FaCheckSquare color="var(--primary)" size={18} /> : <FaSquare color="#ddd" size={18} />}
                                </div>
                            </th>
                            {columns.map(col => <th key={col}>{col}</th>)}
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, idx) => {
                            const rowId = row[idField];
                            const isSelected = selectedIds.includes(rowId);

                            return (
                                <tr key={rowId || idx}>
                                    <CheckboxCell onClick={() => onSelect(rowId)}>
                                        {isSelected ? <FaCheckSquare color="var(--primary)" size={16} /> : <FaSquare color="#eee" size={16} />}
                                    </CheckboxCell>

                                    {columns.map(col => {
                                        const value = row[col];
                                        const isStatus = col.toLowerCase().includes('estado') || col.toLowerCase().includes('status');

                                        return (
                                            <td key={col}>
                                                {isStatus ? (
                                                    <StatusBadge status={value}>{value}</StatusBadge>
                                                ) : (
                                                    value !== null ? value : "—"
                                                )}
                                            </td>
                                        );
                                    })}

                                    <ActionsCell>
                                        <ActionGrid>
                                            <Button variant="ghost" size="small" onClick={() => onViewDetails(row)} title="Ver Detalle">
                                                <FaEye />
                                            </Button>
                                            <Button variant="ghost" size="small" onClick={() => onProcess(rowId)} title="Procesar Unitario" style={{ color: '#28a745' }}>
                                                <FaPlay />
                                            </Button>
                                        </ActionGrid>
                                    </ActionsCell>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </Scrollable>
        </TableWrapper>
    );
}
