import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSave, FaTimes } from "react-icons/fa";
import { Button } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2500;
  animation: fadeIn 0.2s ease-out;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 90%; max-width: 400px;
  border-radius: 20px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.premium};
  animation: scaleUp 0.2s ease-out;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 8px;
`;

const Label = styled.label`
  font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.text};
`;

const Input = styled.input`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

export function ValueMappingModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({ sourceValue: "", targetValue: "" });

    useEffect(() => {
        if (initialData) setFormData(initialData);
        else setFormData({ sourceValue: "", targetValue: "" });
    }, [initialData, isOpen]);

    const handleSubmit = () => {
        if (!formData.sourceValue || !formData.targetValue) return;
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: 0 }}>Mapeo de Valor</h3>
                <FormGroup>
                    <Label>Valor Origen</Label>
                    <Input value={formData.sourceValue} onChange={e => setFormData(prev => ({ ...prev, sourceValue: e.target.value }))} placeholder="Ej: P" />
                </FormGroup>
                <FormGroup>
                    <Label>Valor Destino</Label>
                    <Input value={formData.targetValue} onChange={e => setFormData(prev => ({ ...prev, targetValue: e.target.value }))} placeholder="Ej: PENDIENTE" />
                </FormGroup>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit}><FaSave /> Guardar</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
