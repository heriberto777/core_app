import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaUndo, FaTimes, FaCheckCircle, FaExclamationTriangle, FaBox } from "react-icons/fa";
import { Modal, Button } from "../../index";

const Content = styled.div` display: flex; flex-direction: column; gap: 24px; padding: 24px; max-height: 85vh; overflow: hidden; `;

const WizardHeader = styled.div` display: flex; flex-direction: column; gap: 8px; `;

const Instructions = styled.p` margin: 0; font-size: 13px; color: ${({ theme }) => theme.textSecondary}; line-height: 1.5; `;

const FormSection = styled.div` display: flex; flex-direction: column; gap: 20px; flex: 1; overflow: hidden; `;

const TableContainer = styled.div` border-radius: 16px; border: 1px solid ${({ theme }) => theme.border}; overflow-y: auto; max-height: 400px; `;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 12px;
  thead { position: sticky; top: 0; z-index: 10; background: ${({ theme }) => theme.cardBg}; }
  th { padding: 12px; text-align: left; font-weight: 800; text-transform: uppercase; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; }
  td { padding: 12px; border-bottom: 1px solid ${({ theme }) => theme.border}20; color: ${({ theme }) => theme.text}; vertical-align: middle; }
  tr:hover { background: ${({ theme }) => theme.bg2}08; }
  input[type="number"] { width: 80px; padding: 8px; border-radius: 8px; border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text}; font-weight: 700; text-align: center; }
  input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: ${({ theme }) => theme.primary}; }
  .text-right { text-align: right; }
  .stock-info { font-size: 10px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; opacity: 0.7; }
`;

const ReasonArea = styled.div`
  display: flex; flex-direction: column; gap: 8px;
  label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${({ theme }) => theme.textSecondary}; }
  textarea { padding: 12px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text}; font-size: 14px; min-height: 80px; resize: none; &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; } }
`;

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
        <Modal isOpen={isOpen} onClose={onClose} width="950px">
            <Content>
                <WizardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <FaUndo color="#f59e0b" /> Procesar Devolución (Carga #{inventoryData.loadId})
                        </h2>
                        <Button variant="ghost" icon={<FaTimes />} onClick={onClose} />
                    </div>
                    <Instructions>
                        Configure los productos a retornar validando el stock disponible en inventario.
                    </Instructions>
                </WizardHeader>

                <FormSection>
                    <TableContainer>
                        <Table>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Ítem</th>
                                    <th className="text-right">En Carga</th>
                                    <th className="text-right">Devuelto</th>
                                    <th className="text-right">Stock Disp.</th>
                                    <th className="text-right">Max. Ret.</th>
                                    <th className="text-right">A Retornar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryData.productsWithInventory.map((p, idx) => {
                                    const isDisabled = p.maxReturnableQuantity <= 0;
                                    return (
                                        <tr key={idx} style={{ opacity: isDisabled ? 0.5 : 1 }}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    disabled={isDisabled || processing}
                                                    checked={!!selectedItems[idx]}
                                                    onChange={() => handleToggle(idx)}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 800 }}>{p.code}</div>
                                                <div className="stock-info">{p.description || "N/A"}</div>
                                            </td>
                                            <td className="text-right">{p.quantity}</td>
                                            <td className="text-right" style={{ color: '#ef4444' }}>{p.returnedQuantity || 0}</td>
                                            <td className="text-right" style={{ color: '#10b981' }}>{p.availableInInventory}</td>
                                            <td className="text-right"><strong>{p.maxReturnableQuantity}</strong></td>
                                            <td className="text-right">
                                                <input
                                                    type="number"
                                                    disabled={!selectedItems[idx] || processing}
                                                    value={quantities[idx]}
                                                    max={p.maxReturnableQuantity}
                                                    onChange={(e) => handleQtyChange(idx, e.target.value, p.maxReturnableQuantity)}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableContainer>

                    <ReasonArea>
                        <label>Motivo de la Devolución <span>*</span></label>
                        <textarea
                            placeholder="Especifique el motivo técnico o logístico de este retorno..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={processing}
                        />
                    </ReasonArea>
                </FormSection>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingBottom: '12px' }}>
                    <Button variant="ghost" onClick={onClose} disabled={processing}>Cancelar</Button>
                    <Button
                        variant="primary"
                        icon={<FaCheckCircle />}
                        onClick={onConfirm}
                        loading={processing}
                        disabled={!hasSelections || !reason.trim() || processing}
                        color="#f59e0b"
                    >
                        Confirmar Retorno
                    </Button>
                </div>
            </Content>
        </Modal>
    );
}
