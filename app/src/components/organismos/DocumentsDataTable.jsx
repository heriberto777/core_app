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

    const sampleDoc = documents[0];
    const availableKeys = Object.keys(sampleDoc || {});
    const idField = availableKeys[0];
    const columns = availableKeys.map(k => ({ key: k, label: k }));

    const allSelected = selectedIds.length === documents.length;
    const someSelected = selectedIds.length > 0 && selectedIds.length < documents.length;

    return (
        <div className={`w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-premium ${className}`}>
            <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50/50 sticky top-0 z-10">
                    <tr>
                        <th className="p-4 text-left text-slate-500 font-extrabold border-b-2 border-slate-200">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => el && (el.indeterminate = someSelected)}
                                onChange={(e) => onSelectAll?.(e.target.checked)}
                                className="w-4.5 h-4.5 cursor-pointer accent-primary-500"
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
                            <tr key={docId || idx} className="hover:bg-slate-50/10">
                                <td className="p-4 border-b border-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onSelect?.(docId)}
                                        className="w-4.5 h-4.5 cursor-pointer accent-primary-500"
                                    />
                                </td>
                                {columns.map(col => (
                                    <td key={col.key} className="p-4 border-b border-slate-100 text-slate-700">
                                        {doc[col.key] !== null ? doc[col.key].toString() : '—'}
                                    </td>
                                ))}
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