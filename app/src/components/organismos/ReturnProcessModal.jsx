import React, { useState, useEffect } from "react";
import { FaUndo, FaTimes, FaCheckCircle, FaExclamationTriangle, FaBox, FaArrowRight, FaCubes } from "react-icons/fa";
import { Button } from "../../index";

export function ReturnProcessModal({ isOpen, onClose, inventoryData, onProcess }) {
    const [selectedItems, setSelectedItems] = useState({}); // { index: true/false }
    const [quantities, setQuantities] = useState({}); // { index: value }
    const [reason, setReason] = useState("");
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (inventoryData?.productsWithInventory) {
            const initialQtys = {};
            inventoryData.productsWithInventory.forEach((p, idx) => {
                initialQtys[idx] = p.maxReturnableQuantity > 0 ? 1 : 0;
            });
            setQuantities(initialQtys);
            setSelectedItems({});
            setReason("");
        }
    }, [inventoryData, isOpen]);

    if (!isOpen || !inventoryData) return null;

    const handleToggle = (idx) => {
        setSelectedItems(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const handleQtyChange = (idx, val, max) => {
        const numValue = Math.min(Math.max(0, parseInt(val) || 0), max);
        setQuantities(prev => ({ ...prev, [idx]: numValue }));
    };

    const hasSelections = Object.values(selectedItems).some(v => v);

    const onConfirm = async () => {
        if (!hasSelections || !reason.trim()) return;

        const productsToReturn = inventoryData.productsWithInventory
            .map((p, idx) => ({
                code: p.code,
                quantity: quantities[idx],
                selected: selectedItems[idx]
            }))
            .filter(p => p.selected && p.quantity > 0)
            .map(({ code, quantity }) => ({ code, quantity }));

        if (productsToReturn.length === 0) return;

        setProcessing(true);
        try {
            await onProcess({
                summaryId: inventoryData.summaryId,
                productsToReturn,
                reason
            });
            onClose();
        } catch (err) {
            console.error("Return failed:", err);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[1000px] max-h-[95vh] rounded-[32px] border border-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-7 flex items-center justify-between border-b border-slate-50 bg-white/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                            <FaUndo className="text-xl" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-slate-900 leading-tight">Procesar Devolución</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Operativa:</span>
                                <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md">#{inventoryData.loadId}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10">
                    <div className="bg-amber-50/50 border border-amber-100 text-amber-800 px-6 py-4 rounded-[20px] text-sm flex gap-4 items-start">
                        <FaExclamationTriangle className="mt-1 shrink-0 text-amber-500" />
                        <span className="font-medium leading-relaxed">
                            Seleccione los productos que retornarán al inventario central. El sistema validará automáticamente las existencias y actualizará el estatus de la carga.
                        </span>
                    </div>

                    {/* Table Section */}
                    <div className="space-y-6">
                        <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-amber-500 pl-4">
                            <FaCubes className="text-amber-500" /> Inventario Retornable
                        </h4>
                        
                        <div className="rounded-[28px] border border-slate-100 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 z-10">
                                        <tr>
                                            <th className="px-6 py-4 text-left border-b border-slate-100"></th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Ítem / Descripción</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Carga</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Devuelto</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Stock Disp.</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Máx Retorno</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {inventoryData.productsWithInventory.map((p, idx) => {
                                            const isDisabled = p.maxReturnableQuantity <= 0;
                                            const isSelected = !!selectedItems[idx];
                                            return (
                                                <tr key={idx} className={`transition-all group ${isDisabled ? "opacity-30 grayscale" : "hover:bg-slate-50/50"}`}>
                                                    <td className="px-6 py-4">
                                                        <input
                                                            type="checkbox"
                                                            disabled={isDisabled || processing}
                                                            checked={isSelected}
                                                            onChange={() => handleToggle(idx)}
                                                            className="w-5 h-5 rounded-lg border-slate-200 text-amber-500 focus:ring-amber-400 cursor-pointer disabled:cursor-not-allowed"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm font-black text-slate-900 leading-none mb-1 group-hover:text-amber-600 transition-colors">{p.code}</div>
                                                        <div className="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">{p.description || "N/A"}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-xs font-bold text-slate-600">{p.quantity}</td>
                                                    <td className="px-6 py-4 text-right text-xs font-black text-red-500">{p.returnedQuantity || 0}</td>
                                                    <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{p.availableInInventory}</td>
                                                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{p.maxReturnableQuantity}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <input
                                                            type="number"
                                                            disabled={!isSelected || processing}
                                                            value={quantities[idx]}
                                                            max={p.maxReturnableQuantity}
                                                            onChange={(e) => handleQtyChange(idx, e.target.value, p.maxReturnableQuantity)}
                                                            className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-center text-sm font-black text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all disabled:opacity-30"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Reason Section */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center justify-between">
                            <span>Motivo de la Devolución <span className="text-amber-500">*</span></span>
                            <span className="text-[9px] font-bold opacity-50">Campo Obligatorio</span>
                        </label>
                        <textarea
                            placeholder="Especifique el motivo técnico o logístico de este retorno para fines de auditoría..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={processing}
                            className="w-full p-6 bg-slate-50/50 border border-slate-100 rounded-[24px] text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white transition-all resize-none min-h-[120px]"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-50 flex justify-end gap-3 bg-white/80 backdrop-blur-md">
                    <Button variant="ghost" onClick={onClose} disabled={processing} className="font-bold">Cancelar Proceso</Button>
                    <Button
                        variant="primary"
                        onClick={onConfirm}
                        loading={processing}
                        disabled={!hasSelections || !reason.trim() || processing}
                        className="px-10 py-3 shadow-lg shadow-amber-500/20 font-black text-xs uppercase tracking-widest bg-amber-500 hover:bg-amber-600 border-none"
                    >
                        Confirmar Retorno de Mercancía
                    </Button>
                </div>
            </div>
        </div>
    );
}
