import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSave, FaTimes, FaPlus, FaTrash } from "react-icons/fa";
import { Button } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
  animation: fadeIn 0.3s ease-out;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 90%; max-width: 700px; max-height: 90vh;
  border-radius: 20px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 20px 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}40;
`;

const Body = styled.div`
  padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;
`;

const Footer = styled.div`
  padding: 20px 24px; border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 12px;
  background: ${({ theme }) => theme.bg2}20;
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

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const FieldRow = styled.div`
  display: grid; grid-template-columns: 1fr 1fr 1fr auto auto; gap: 10px; align-items: center;
  background: ${({ theme }) => theme.bg2}20; padding: 10px; border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border};
`;

export function DependencyModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        fieldName: "",
        dependentTable: "",
        executionOrder: 0,
        insertIfNotExists: true,
        validateOnly: false,
        dependentFields: []
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                fieldName: "",
                dependentTable: "",
                executionOrder: 0,
                insertIfNotExists: true,
                validateOnly: false,
                dependentFields: [{ sourceField: "", targetField: "", defaultValue: "", isKey: true }]
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const addField = () => {
        setFormData(prev => ({
            ...prev,
            dependentFields: [...prev.dependentFields, { sourceField: "", targetField: "", defaultValue: "", isKey: false }]
        }));
    };

    const updateField = (index, field, value) => {
        setFormData(prev => {
            const newFields = [...prev.dependentFields];
            newFields[index] = { ...newFields[index], [field]: value };
            return { ...prev, dependentFields: newFields };
        });
    };

    const removeField = (index) => {
        setFormData(prev => {
            const newFields = [...prev.dependentFields];
            newFields.splice(index, 1);
            return { ...prev, dependentFields: newFields };
        });
    };

    const handleSubmit = () => {
        if (!formData.fieldName || !formData.dependentTable) return;
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <h3 style={{ margin: 0 }}>Dependencia de Foreign Key</h3>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}>
                        <FaTimes />
                    </Button>
                </Header>
                <Body>
                    <Grid>
                        <FormGroup>
                            <Label>Campo en Tabla Principal</Label>
                            <Input name="fieldName" value={formData.fieldName} onChange={handleChange} placeholder="Ej: CONTRIBUYENTE" />
                        </FormGroup>
                        <FormGroup>
                            <Label>Tabla Dependiente</Label>
                            <Input name="dependentTable" value={formData.dependentTable} onChange={handleChange} placeholder="Ej: NIT" />
                        </FormGroup>
                    </Grid>
                    <Grid>
                        <FormGroup>
                            <Label>Orden de Ejecución</Label>
                            <Input type="number" name="executionOrder" value={formData.executionOrder} onChange={handleChange} />
                        </FormGroup>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" name="insertIfNotExists" checked={formData.insertIfNotExists} onChange={handleChange} />
                                <span style={{ fontSize: '13px' }}>Insertar si no existe</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" name="validateOnly" checked={formData.validateOnly} onChange={handleChange} />
                                <span style={{ fontSize: '13px' }}>Solo validar</span>
                            </label>
                        </div>
                    </Grid>

                    <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <Label>Campos a Inserción / Validación</Label>
                            <Button variant="ghost" onClick={addField} style={{ fontSize: '12x' }}><FaPlus /> Añadir Campo</Button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {formData.dependentFields.map((f, i) => (
                                <FieldRow key={i}>
                                    <Input placeholder="Origen (Op)" value={f.sourceField} onChange={e => updateField(i, 'sourceField', e.target.value)} />
                                    <Input placeholder="Destino (Obl)" value={f.targetField} onChange={e => updateField(i, 'targetField', e.target.value)} />
                                    <Input placeholder="Defecto" value={f.defaultValue} onChange={e => updateField(i, 'defaultValue', e.target.value)} />
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        <input type="checkbox" checked={f.isKey} onChange={e => updateField(i, 'isKey', e.target.checked)} />
                                        <span style={{ fontSize: '9px' }}>Clave</span>
                                    </div>
                                    <Button variant="ghost" $danger onClick={() => removeField(i)}><FaTrash /></Button>
                                </FieldRow>
                            ))}
                        </div>
                    </div>
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
