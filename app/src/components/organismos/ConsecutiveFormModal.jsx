import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaTimes, FaSave, FaCog, FaLayerGroup } from "react-icons/fa";
import { Button, StatusBadge, Input, Select } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 650px; max-height: 90vh;
  border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}20;
`;

const Body = styled.div`
  padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;
`;

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  grid-column: ${({ $fullWidth }) => $fullWidth ? '1 / -1' : 'span 1'};
`;

const Label = styled.label`
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary};
`;

// Eliminadas definiciones locales de Input y Select para usar los átomos estandarizados.

const SectionTitle = styled.div`
  font-size: 14px; font-weight: 800; color: ${({ theme }) => theme.primary};
  display: flex; align-items: center; gap: 10px; margin-top: 8px;
`;

const SegmentBox = styled.div`
  padding: 20px; border-radius: 16px; background: ${({ theme }) => theme.bg2}10;
  border: 1px dashed ${({ theme }) => theme.border}; display: flex; flex-direction: column; gap: 16px;
`;

const CheckboxLabel = styled.label`
  display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 14px;
`;

export function ConsecutiveFormModal({ isOpen, onClose, onSave, consecutive = null }) {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        currentValue: 0,
        prefix: "",
        padLength: 7,
        padChar: "0",
        pattern: "",
        active: true,
        segments: {
            enabled: false,
            type: "year",
            field: ""
        }
    });

    useEffect(() => {
        if (consecutive) {
            setFormData({
                ...consecutive,
                segments: consecutive.segments || { enabled: false, type: "year", field: "" }
            });
        } else {
            setFormData({
                name: "", description: "", currentValue: 0, prefix: "", padLength: 7, padChar: "0", pattern: "", active: true,
                segments: { enabled: false, type: "year", field: "" }
            });
        }
    }, [consecutive, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes(".")) {
            const [parent, child] = name.split(".");
            setFormData(prev => ({
                ...prev,
                [parent]: { ...prev[parent], [child]: type === "checkbox" ? checked : value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
        }
    };

    const handleSubmit = () => {
        if (!formData.name) return alert("El nombre es obligatorio");
        onSave(formData);
    };

    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaCog size={20} color="var(--primary)" />
                        <h3 style={{ margin: 0 }}>{consecutive ? "Editar Consecutivo" : "Nuevo Consecutivo"}</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose}><FaTimes /></Button>
                </Header>

                <Body>
                    <Grid>
                        <Input
                            label="Nombre del Consecutivo"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Ej: Facturación Ventas"
                        />
                        <Input
                            label="Descripción"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Breve descripción del uso de este folio"
                        />

                        <Input
                            label="Valor Actual / Inicial"
                            type="number"
                            name="currentValue"
                            value={formData.currentValue}
                            onChange={handleChange}
                        />
                        <Input
                            label="Prefijo"
                            name="prefix"
                            value={formData.prefix}
                            onChange={handleChange}
                            placeholder="Ej: F-"
                        />

                        <Input
                            label="Carácter de Relleno"
                            name="padChar"
                            value={formData.padChar}
                            onChange={handleChange}
                            maxLength={1}
                        />
                        <Input
                            label="Longitud Total"
                            type="number"
                            name="padLength"
                            value={formData.padLength}
                            onChange={handleChange}
                        />

                        <Input
                            label="Patrón de Formato (Opcional)"
                            name="pattern"
                            value={formData.pattern}
                            onChange={handleChange}
                            placeholder="Ej: {PREFIX}{YEAR}-{VALUE:6}"
                        />
                        <small style={{ opacity: 0.6, fontSize: '11px', marginTop: '-8px', marginBottom: '12px' }}>
                            Usa etiquetas como {'{PREFIX}'}, {'{YEAR}'}, {'{VALUE:length}'} para formatos personalizados.
                        </small>

                        <FormGroup>
                            <CheckboxLabel>
                                <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                                <span>Consecutivo Activo</span>
                            </CheckboxLabel>
                        </FormGroup>
                    </Grid>

                    <SectionTitle><FaLayerGroup /> Segmentación Operativa</SectionTitle>
                    <SegmentBox>
                        <CheckboxLabel>
                            <input type="checkbox" name="segments.enabled" checked={formData.segments.enabled} onChange={handleChange} />
                            <span>Habilitar Segmentos (Varios folios en uno)</span>
                        </CheckboxLabel>

                        {formData.segments.enabled && (
                            <Grid>
                                <Select
                                    label="Tipo de Segmento"
                                    name="segments.type"
                                    value={formData.segments.type}
                                    onChange={handleChange}
                                >
                                    <option value="year">Por Año (2024, 2025...)</option>
                                    <option value="month">Por Mes (202401...)</option>
                                    <option value="company">Por Compañía</option>
                                    <option value="user">Por Usuario</option>
                                    <option value="custom">Campo Personalizado</option>
                                </Select>
                                {formData.segments.type === 'custom' && (
                                    <Input
                                        label="Nombre del Campo"
                                        name="segments.field"
                                        value={formData.segments.field}
                                        onChange={handleChange}
                                        placeholder="Ej: SucursalID"
                                    />
                                )}
                            </Grid>
                        )}
                    </SegmentBox>
                </Body>

                <div style={{ padding: '24px', borderTop: `1px solid ${props => props.theme.border}40`, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit}><FaSave /> Guardar Cambios</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
