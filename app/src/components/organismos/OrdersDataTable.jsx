import React from "react";
import { FaEye, FaPlay, FaCheckSquare, FaSquare } from "react-icons/fa";
import { StatusBadge, Button } from "../../index";

// Migrado desde styled-components a Tailwind classes

const TableWrapper = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden ${className}`}>
    {children}
  </div>
);

const Scrollable = ({ children, className = "" }) => (
  <div className={`overflow-x-auto max-h-[600px] ${className}`}>
    {children}
  </div>
);

const Table = ({ children, className = "" }) => (
  <table className={`w-full border-collapse ${className}`}>
    {children}
  </table>
);

const CheckboxCell = ({ children, className = "" }) => (
  <td className={`w-[50px] text-center cursor-pointer ${className}`}>
    {children}
  </td>
);

const ActionsCell = ({ children, className = "" }) => (
  <td className={`w-[120px] text-right ${className}`}>
    {children}
  </td>
);

const ActionGrid = ({ children, className = "" }) => (
  <div className={`flex gap-2 justify-end ${className}`}>
    {children}
  </div>
);

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
                    <thead className="table-header">
                        <tr>
                            <th className="w-[50px] text-center">
                                <div onClick={onSelectAll} className="cursor-pointer flex items-center justify-center">
                                    {isAllSelected ? <FaCheckSquare className="text-primary-500" size={18} /> : <FaSquare className="text-slate-300" size={18} />}
                                </div>
                            </th>
                            {columns.map(col => <th key={col} className="font-bold text-[11px] text-slate-500 tracking-wider uppercase">
                                {col}
                            </th>)}
                            <th className="text-right text-[11px] text-slate-500 font-bold uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {data.map((row, idx) => {
                            const rowId = row[idField];
                            const isSelected = selectedIds.includes(rowId);

                            return (
                                <tr key={rowId || idx} className="table-row-hover">
                                    <CheckboxCell onClick={() => onSelect(rowId)}>
                                        {isSelected ? <FaCheckSquare className="text-primary-500" size={16} /> : <FaSquare className="text-slate-300" size={16} />}
                                    </CheckboxCell>

                                    {columns.map(col => {
                                        const value = row[col];
                                        const isStatus = col.toLowerCase().includes('estado') || col.toLowerCase().includes('status');

                                        return (
                                            <td key={col} className="text-sm">
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
                                            <Button variant="ghost" size="small" onClick={() => onProcess(rowId)} title="Procesar Unitario" className="text-emerald-500">
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
