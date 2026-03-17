import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSave, FaTimes } from "react-icons/fa";
import { Button } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
  animation: fadeIn 0.3s ease-out;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 90%; max-width: 500px;
  border-radius: 20px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 20px 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
`;

const Body = styled.div`
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
`;

const Footer = styled.div`
  padding: 20px 24px; border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 12px;
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
  font-size: 14px; transition: all 0.2s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; }
`;

export function DocumentRuleModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        name: "",
        sourceField: "",
        sourceValues: "",
        description: "",
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                sourceValues: Array.isArray(initialData.sourceValues)
                    ? initialData.sourceValues.join(", ")
                    : initialData.sourceValues || ""
            });
        } else {
            setFormData({ name: "", sourceField: "", sourceValues: "", description: "" });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.sourceField || !formData.sourceValues) return;

        const valuesArray = formData.sourceValues.split(",").map(v => v.trim()).filter(v => v);
        onSave({
            ...formData,
            sourceValues: valuesArray
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <h3 style={{ margin: 0 }}>Regla de Documento</h3>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}>
                        <FaTimes />
                    </Button>
                </Header>
                <Body>
                    <FormGroup>
                        <Label>Nombre de la Regla</Label>
                        <Input name="name" value={formData.name} onChange={handleChange} placeholder="Ej: pedido" />
                    </FormGroup>
                    <FormGroup>
                        <Label>Campo Origen</Label>
                        <Input name="sourceField" value={formData.sourceField} onChange={handleChange} placeholder="Ej: EST_PED" />
                    </FormGroup>
                    <FormGroup>
                        <Label>Valores (separados por coma)</Label>
                        <Input name="sourceValues" value={formData.sourceValues} onChange={handleChange} placeholder="Ej: P, p, A" />
                    </FormGroup>
                    <FormGroup>
                        <Label>Descripción (Opcional)</Label>
                        <Input name="description" value={formData.description} onChange={handleChange} placeholder="Ej: Solo pedidos aprobados" />
                    </FormGroup>
                </Body>
                <Footer>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit}>
                        <FaSave /> {initialData ? "Actualizar" : "Guardar"}
                    </Button>
                </Footer>
            </ModalContent>
        </ModalOverlay>
    );
}
