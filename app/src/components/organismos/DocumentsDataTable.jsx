import React from "react";
import styled from "styled-components";
import { FaEye, FaPlay, FaPencilAlt } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const TableContainer = styled.div`
  width: 100%; overflow-x: auto; border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.cardBg};
  box-shadow: ${({ theme }) => theme.shadows.premium};
`;

const StyledTable = styled.table`
  width: 100%; border-collapse: collapse; font-size: 14px;
  thead { background: ${({ theme }) => theme.bg2}40; position: sticky; top: 0; z-index: 10; }
  th { padding: 16px; text-align: left; color: ${({ theme }) => theme.textSecondary}; font-weight: 700; border-bottom: 2px solid ${({ theme }) => theme.border}; }
  td { padding: 16px; border-bottom: 1px solid ${({ theme }) => theme.border}; color: ${({ theme }) => theme.text}; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
  tr:last-child td { border-bottom: none; }
`;

const ActionsCell = styled.div`
  display: flex; gap: 8px; justify-content: flex-end;
`;

const Checkbox = styled.input`
  width: 18px; height: 18px; cursor: pointer; accent-color: ${({ theme }) => theme.primary};
`;

export function DocumentsDataTable({
    documents,
    config,
    entityType,
    selectedIds,
    onSelect,
    onSelectAll,
    onViewDetails,
    onProcess,
    onEditEntity,
    actionStates
}) {
    if (!documents || documents.length === 0) return null;

    // Determinar columnas dinámicas según configuración
    const mainTable = config?.tableConfigs?.find(tc => !tc.isDetailTable);
    const displayFields = mainTable?.fieldMappings?.filter(f => f.showInList)
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    // Usar primaryKey configurado o fallback a primera columna
    const primaryKeyField = mainTable?.primaryKey;
    
    // Verificar qué columnas realmente existen en los datos
    const sampleDoc = documents[0];
    const availableKeys = Object.keys(sampleDoc || {});
    
    // Determinar el campo ID para selección
    const idField = primaryKeyField && availableKeys.includes(primaryKeyField) 
        ? primaryKeyField 
        : availableKeys[0]; // Fallback a primera columna

    const columns = displayFields && displayFields.length > 0
        ? displayFields
            .map(f => {
                // Buscar coincidencia en datos (sourceField o targetField)
                const sourceKey = f.sourceField;
                const targetKey = f.targetField;
                
                // Verificar si existe el campo sourceField
                if (availableKeys.includes(sourceKey)) {
                    return { key: sourceKey, label: f.displayName || f.targetField || sourceKey, found: true };
                }
                // Si no existe sourceField, buscar por targetField (para backward compatibility)
                else if (targetKey && availableKeys.includes(targetKey)) {
                    return { key: targetKey, label: f.displayName || targetKey, found: true };
                }
                // No se encontró el campo
                return { key: sourceKey, label: f.displayName || f.targetField || sourceKey, found: false };
            })
            .filter(col => col.found) // Solo mostrar columnas que existen en los datos
        : availableKeys.map(k => ({ key: k, label: k, found: true }));

    const allSelected = documents.length > 0 && selectedIds.length === documents.length;

    return (
        <TableContainer>
            <StyledTable>
                <thead>
                    <tr>
                        <th style={{ width: '40px' }}>
                            <Checkbox type="checkbox" checked={allSelected} onChange={onSelectAll} />
                        </th>
                        {columns.map(col => <th key={col.key}>{col.label}</th>)}
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {documents.map((doc, idx) => {
                        // Usar primaryKey configurado o primera columna
                        const id = doc[idField];
                        const isSelected = selectedIds.includes(id);

                        return (
                            <tr key={idx} style={{ background: isSelected ? 'var(--primary-light-10, #3498db10)' : 'transparent' }}>
                                <td>
                                    <Checkbox type="checkbox" checked={isSelected} onChange={() => onSelect(id)} />
                                </td>
                                {columns.map(col => (
                                    <td key={col.key}>
                                        {doc[col.key] !== null && doc[col.key] !== undefined ? String(doc[col.key]) : "N/A"}
                                    </td>
                                ))}
                                <td>
                                    <ActionsCell>
                                        {entityType === "customers" && (
                                            <Button variant="ghost" onClick={() => onEditEntity(doc)} style={{ padding: '6px' }} title="Editar Datos">
                                                <FaPencilAlt />
                                            </Button>
                                        )}
                                        <Button variant="ghost" onClick={() => onViewDetails(doc)} loading={actionStates && actionStates[id] === 'details'} style={{ padding: '6px' }} title="Ver Detalles">
                                            <FaEye />
                                        </Button>
                                        <Button variant="ghost" onClick={() => onProcess(id)} loading={actionStates && actionStates[id] === 'processing'} style={{ padding: '6px' }} title="Procesar Ficha">
                                            <FaPlay />
                                        </Button>
                                    </ActionsCell>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </StyledTable>
        </TableContainer>
    );
}
