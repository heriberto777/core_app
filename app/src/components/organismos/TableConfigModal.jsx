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
  width: 90%; max-width: 600px; max-height: 90vh;
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
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; }
`;

const Select = styled.select`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; transition: all 0.2s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; }
`;

const CheckboxGroup = styled.div`
  display: flex; align-items: center; gap: 10px;
  padding: 12px; background: ${({ theme }) => theme.bg2}40; border-radius: 12px;
`;

const Grid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

export function TableConfigModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        name: "",
        sourceTable: "",
        targetTable: "",
        primaryKey: "",
        targetPrimaryKey: "",
        foreignKey: "",
        joinType: "INNER",
        isDetailTable: false,
        parentTableRef: "",
        useSameSourceTable: false,
        orderByColumn: "",
        filterCondition: "",
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                sourceTable: initialData.sourceTable || "",
                primaryKey: initialData.primaryKey || "",
                targetPrimaryKey: initialData.targetPrimaryKey || "",
                foreignKey: initialData.foreignKey || "",
                joinType: initialData.joinType || "INNER",
                parentTableRef: initialData.parentTableRef || "",
                orderByColumn: initialData.orderByColumn || "",
                filterCondition: initialData.filterCondition || "",
            });
        } else {
            setFormData({
                name: "",
                sourceTable: "",
                targetTable: "",
                primaryKey: "",
                targetPrimaryKey: "",
                foreignKey: "",
                joinType: "INNER",
                isDetailTable: false,
                parentTableRef: "",
                useSameSourceTable: false,
                orderByColumn: "",
                filterCondition: "",
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.targetTable || (!formData.sourceTable && !formData.useSameSourceTable)) {
            alert("Los campos Nombre, Tabla Destino y Tabla Origen son obligatorios.");
            return;
        }
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <h3 style={{ margin: 0 }}>{initialData ? "Editar Tabla" : "Añadir Tabla"}</h3>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}>
                        <FaTimes />
                    </Button>
                </Header>
                <Body>
                    <Grid>
                        <FormGroup>
                            <Label>Nombre de Referencia</Label>
                            <Input name="name" value={formData.name} onChange={handleChange} placeholder="Ej: pedidosHeader" />
                        </FormGroup>
                        <FormGroup>
                            <Label>Tabla Destino (ERP)</Label>
                            <Input name="targetTable" value={formData.targetTable} onChange={handleChange} placeholder="Ej: PEDIDO" />
                        </FormGroup>
                    </Grid>

                    <Grid>
                        <FormGroup>
                            <Label>Tabla Origen (Externo)</Label>
                            <Input name="sourceTable" value={formData.sourceTable} onChange={handleChange} placeholder="Ej: FAC_ENC_PED" disabled={formData.isDetailTable && formData.useSameSourceTable} />
                        </FormGroup>
                        <FormGroup>
                            <Label>Filtro SQL Adicional</Label>
                            <Input name="filterCondition" value={formData.filterCondition} onChange={handleChange} placeholder="Ej: TIP_DOC = 'F' AND DOC_PRO IS NULL" />
                            <small style={{ color: '#6b7280', fontSize: '11px', marginTop: '4px' }}>
                                Usa operadores SQL: AND, OR, IS NULL, IN, etc.
                            </small>
                        </FormGroup>
                    </Grid>

                    <Grid>
                        <FormGroup>
                            <Label>Clave Primaria Origen</Label>
                            <Input name="primaryKey" value={formData.primaryKey} onChange={handleChange} placeholder="Ej: NUM_PED" />
                        </FormGroup>
                        <FormGroup>
                            <Label>Clave Primaria Destino</Label>
                            <Input name="targetPrimaryKey" value={formData.targetPrimaryKey} onChange={handleChange} placeholder="Ej: PEDIDO" />
                        </FormGroup>
                    </Grid>

                    <CheckboxGroup>
                        <input type="checkbox" name="isDetailTable" id="isDetailTable" checked={formData.isDetailTable} onChange={handleChange} />
                        <Label htmlFor="isDetailTable" style={{ marginBottom: 0, cursor: 'pointer' }}>Es tabla de detalle</Label>
                    </CheckboxGroup>

                    {formData.isDetailTable && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.3s ease-out' }}>
                            <Grid>
                                <FormGroup>
                                    <Label>Referencia Tabla Padre</Label>
                                    <Input name="parentTableRef" value={formData.parentTableRef} onChange={handleChange} placeholder="Ej: pedidosHeader" />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Columna Ordenamiento</Label>
                                    <Input name="orderByColumn" value={formData.orderByColumn} onChange={handleChange} placeholder="Ej: SECUENCIA" />
                                </FormGroup>
                            </Grid>
                            <Grid>
                                <FormGroup>
                                    <Label>Clave Foránea (Relación con Padre)</Label>
                                    <Input name="foreignKey" value={formData.foreignKey} onChange={handleChange} placeholder="Ej: NUM_PED" />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Tipo de Join</Label>
                                    <Select name="joinType" value={formData.joinType} onChange={handleChange}>
                                        <option value="INNER">INNER JOIN</option>
                                        <option value="LEFT">LEFT JOIN</option>
                                        <option value="RIGHT">RIGHT JOIN</option>
                                    </Select>
                                </FormGroup>
                            </Grid>
                            <CheckboxGroup>
                                <input type="checkbox" name="useSameSourceTable" id="useSameSourceTable" checked={formData.useSameSourceTable} onChange={handleChange} />
                                <Label htmlFor="useSameSourceTable" style={{ marginBottom: 0, cursor: 'pointer' }}>Usar misma tabla origen que padre</Label>
                            </CheckboxGroup>
                        </div>
                    )}
                </Body>
                <Footer>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave /> {initialData ? "Actualizar" : "Añadir"}
                    </Button>
                </Footer>
            </ModalContent>
        </ModalOverlay>
    );
}
