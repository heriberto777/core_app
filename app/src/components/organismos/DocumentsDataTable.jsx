import React from "react";
import { FaEye, FaPlay, FaPencilAlt } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

/**
 * Corporate DocumentsDataTable (Tailwind Edition)
 */
export function DocumentsDataTable({
    documents,
    config,
    selectedIds,
    onSelect,
    onSelectAll,
    onViewDetails,
    onProcess,
    onEditEntity,
    actionStates,
    className = ""
}) {
    if (!documents || documents.length === 0) return null;

    const { columns, idField } = React.useMemo(() => {
        const sampleDoc = documents[0] || {};
        const availableKeys = Object.keys(sampleDoc);
        let finalColumns = [];
        
        let allMappings = [];
        if (config?.tableConfigs) {
            config.tableConfigs.forEach(table => {
                if (table.fieldMappings) {
                    allMappings.push(...table.fieldMappings);
                }
            });
        }
        
        if (allMappings.length > 0) {
            // Filtrar solo los marcados para mostrar en lista
            const listMappings = allMappings.filter(m => m.showInList);
            if (listMappings.length > 0) {
                // Ordenar por displayOrder
                listMappings.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
                finalColumns = listMappings.map(m => {
                    return {
                        key: m.targetField || m.sourceField,
                        sourceKey: m.sourceField,
                        targetKey: m.targetField,
                        label: m.displayName || m.targetField
                    };
                });
            }
        }

        // Determinar el campo de ID (Clave Primaria) correctamente
        let determinedIdField = availableKeys[0]; // fallback
        if (config?.tableConfigs && config.tableConfigs.length > 0) {
            const mainTable = config.tableConfigs[0];
            if (mainTable.primaryKey) {
                if (sampleDoc[mainTable.primaryKey] !== undefined) {
                    determinedIdField = mainTable.primaryKey;
                } else {
                    const pkMap = mainTable.fieldMappings?.find(fm => fm.sourceField === mainTable.primaryKey);
                    if (pkMap && sampleDoc[pkMap.targetField] !== undefined) {
                        determinedIdField = pkMap.targetField;
                    }
                }
            }
        }

        return {
            columns: finalColumns,
            idField: determinedIdField || 'id'
        };
    }, [documents, config]);

    const allSelected = selectedIds.length === documents.length;
    const someSelected = selectedIds.length > 0 && selectedIds.length < documents.length;

    return (
        <div className={`w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-premium ${className}`}>
            <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50/50 sticky top-0 z-10">
                    <tr>
                        <th className="p-4 text-left text-slate-500 font-extrabold border-b-2 border-slate-200 w-12 align-middle">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => el && (el.indeterminate = someSelected)}
                                onChange={(e) => onSelectAll?.(e.target.checked)}
                                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all cursor-pointer"
                            />
                        </th>
                        {columns.map(col => (
                            <th key={col.key} className="p-4 text-left text-slate-500 font-extrabold border-b-2 border-slate-200">
                                {col.label}
                            </th>
                        ))}
                        <th className="p-4 text-right text-slate-500 font-extrabold border-b-2 border-slate-200">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {documents.map((doc, idx) => {
                        const docId = doc[idField];
                        const isSelected = selectedIds.includes(docId);
                        return (
                            <tr key={docId || idx} className={`hover:bg-slate-50/40 transition-colors group ${isSelected ? "bg-primary-50/20" : ""}`}>
                                <td className="p-4 border-b border-slate-100 align-middle">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onSelect?.(docId)}
                                        className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all cursor-pointer"
                                    />
                                </td>
                                {columns.map(col => {
                                    // Intentamos extraer el dato usando el sourceField original o el targetField
                                    let displayVal = undefined;
                                    if (col.sourceKey && doc[col.sourceKey] !== undefined) {
                                        displayVal = doc[col.sourceKey];
                                    } else if (col.targetKey && doc[col.targetKey] !== undefined) {
                                        displayVal = doc[col.targetKey];
                                    } else if (doc[col.key] !== undefined) {
                                        displayVal = doc[col.key];
                                    }

                                    // Si la llave del targetKey o sourceKey existen pero tienen valor null, displayVal será null.
                                    return (
                                        <td key={col.key} className="p-4 border-b border-slate-100 text-slate-700">
                                            {displayVal != null && displayVal !== '' ? String(displayVal) : '—'}
                                        </td>
                                    );
                                })}
                                <td className="p-4 border-b border-slate-100">
                                    <div className="flex gap-2 justify-end">
                                        {onViewDetails && (
                                            <Button variant="ghost" size="small" onClick={() => onViewDetails(doc)}>
                                                <FaEye />
                                            </Button>
                                        )}
                                        {onProcess && (
                                            <Button variant="primary" size="small" onClick={() => onProcess(docId)}>
                                                <FaPlay />
                                            </Button>
                                        )}
                                        {onEditEntity && (
                                            <Button variant="secondary" size="small" onClick={() => onEditEntity(doc)}>
                                                <FaPencilAlt />
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}