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
  width: 95%; max-width: 800px; max-height: 90vh;
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
  padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;
`;

const Footer = styled.div`
  padding: 20px 24px; border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 12px;
  background: ${({ theme }) => theme.bg2}20;
`;

const Section = styled.div`
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px; background: ${({ theme }) => theme.bg2}20; border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border};
`;

const SectionTitle = styled.h4`
  margin: 0; font-size: 15px; color: ${({ theme }) => theme.primary};
  display: flex; align-items: center; gap: 8px;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 8px;
`;

const Label = styled.label`
  font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.textSecondary};
`;

const Input = styled.input`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; transition: all 0.2s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; }
`;

const Textarea = styled.textarea`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; min-height: 80px; resize: vertical;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; }
`;

const Select = styled.select`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;
`;

const ParamRow = styled.div`
  display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: center;
  background: ${({ theme }) => theme.cardBg}; padding: 10px; border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border};
`;

export function FieldMappingModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        sourceField: "",
        targetField: "",
        defaultValue: "",
        removePrefix: "",
        isRequired: false,
        lookupFromTarget: false,
        lookupQuery: "",
        lookupParams: [],
        validateExistence: false,
        failIfNotFound: false,
        isEditable: true,
        showInList: false,
        displayName: "",
        displayOrder: 0,
        fieldGroup: "",
        fieldType: "text",
        unitConversion: { enabled: false }
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                sourceField: initialData.sourceField || "",
                defaultValue: initialData.defaultValue || "",
                removePrefix: initialData.removePrefix || "",
                lookupQuery: initialData.lookupQuery || "",
                lookupParams: initialData.lookupParams || [],
                displayName: initialData.displayName || "",
                fieldGroup: initialData.fieldGroup || "",
            });
        } else {
            setFormData({
                sourceField: "",
                targetField: "",
                defaultValue: "",
                removePrefix: "",
                isRequired: false,
                lookupFromTarget: false,
                lookupQuery: "",
                lookupParams: [],
                validateExistence: false,
                failIfNotFound: false,
                isEditable: true,
                showInList: false,
                displayName: "",
                displayOrder: 0,
                fieldGroup: "",
                fieldType: "text",
                unitConversion: { enabled: false }
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

    const addParam = () => {
        setFormData(prev => ({
            ...prev,
            lookupParams: [...prev.lookupParams, { paramName: "", sourceField: "", removePrefix: "" }]
        }));
    };

    const updateParam = (index, field, value) => {
        setFormData(prev => {
            const newParams = [...prev.lookupParams];
            newParams[index] = { ...newParams[index], [field]: value };
            return { ...prev, lookupParams: newParams };
        });
    };

    const removeParam = (index) => {
        setFormData(prev => {
            const newParams = [...prev.lookupParams];
            newParams.splice(index, 1);
            return { ...prev, lookupParams: newParams };
        });
    };

    const handleSubmit = async () => {
        if (!formData.targetField) return;
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
                    <h3 style={{ margin: 0 }}>{initialData ? "Editar Mapeo de Campo" : "Nuevo Mapeo de Campo"}</h3>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}>
                        <FaTimes />
                    </Button>
                </Header>
                <Body>
                    <Section>
                        <SectionTitle>Básicos del Mapeo</SectionTitle>
                        <Grid>
                            <FormGroup>
                                <Label>Campo Origen (Opcional)</Label>
                                <Input name="sourceField" value={formData.sourceField} onChange={handleChange} placeholder="Ej: COD_CLT" />
                            </FormGroup>
                            <FormGroup>
                                <Label>Campo Destino (Obligatorio)</Label>
                                <Input name="targetField" value={formData.targetField} onChange={handleChange} placeholder="Ej: CODIGO" />
                            </FormGroup>
                        </Grid>
                        <Grid>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" name="isRequired" checked={formData.isRequired} onChange={handleChange} />
                                    <span style={{ fontSize: '13px' }}>Obligatorio</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" name="lookupFromTarget" checked={formData.lookupFromTarget} onChange={handleChange} />
                                    <span style={{ fontSize: '13px' }}>Lookup en BD Destino</span>
                                </label>
                            </div>
                        </Grid>
                    </Section>

                    {!formData.lookupFromTarget ? (
                        <Section>
                            <SectionTitle>Transformación y Valores</SectionTitle>
                            <FormGroup>
                                <Label>Valor por Defecto / Función SQL</Label>
                                <Textarea name="defaultValue" value={formData.defaultValue} onChange={handleChange} placeholder="Ej: GETDATE() o 'VALOR'" />
                            </FormGroup>
                            <FormGroup>
                                <Label>Eliminar Prefijo</Label>
                                <Input name="removePrefix" value={formData.removePrefix} onChange={handleChange} placeholder="Ej: CN" />
                            </FormGroup>
                        </Section>
                    ) : (
                        <Section>
                            <SectionTitle>Configuración de Consulta (Lookup)</SectionTitle>
                            <FormGroup>
                                <Label>Consulta SQL (use @parametro)</Label>
                                <Textarea name="lookupQuery" value={formData.lookupQuery} onChange={handleChange} placeholder="SELECT NOMBRE FROM CLIENTE WHERE ID = @codigo" />
                            </FormGroup>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Label>Parámetros de Consulta</Label>
                                <Button variant="ghost" onClick={addParam} style={{ fontSize: '12px' }}><FaPlus /> Añadir</Button>
                            </div>

                            {formData.lookupParams.map((p, i) => (
                                <ParamRow key={i}>
                                    <Input placeholder="@nombre" value={p.paramName} onChange={e => updateParam(i, 'paramName', e.target.value)} />
                                    <Input placeholder="Campo Origen" value={p.sourceField} onChange={e => updateParam(i, 'sourceField', e.target.value)} />
                                    <Input placeholder="Prefijo" value={p.removePrefix} onChange={e => updateParam(i, 'removePrefix', e.target.value)} />
                                    <Button variant="ghost" $danger onClick={() => removeParam(i)}><FaTrash /></Button>
                                </ParamRow>
                            ))}

                            <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" name="validateExistence" checked={formData.validateExistence} onChange={handleChange} />
                                    <span style={{ fontSize: '13px' }}>Validar existencia</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" name="failIfNotFound" checked={formData.failIfNotFound} onChange={handleChange} />
                                    <span style={{ fontSize: '13px' }}>Fallar si no existe</span>
                                </label>
                            </div>
                        </Section>
                    )}

                    <Section>
                        <SectionTitle>Propiedades de Visualización</SectionTitle>
                        <Grid>
                            <FormGroup>
                                <Label>Nombre a Mostrar</Label>
                                <Input name="displayName" value={formData.displayName} onChange={handleChange} placeholder="Ej: Código Cliente" />
                            </FormGroup>
                            <FormGroup>
                                <Label>Grupo</Label>
                                <Input name="fieldGroup" value={formData.fieldGroup} onChange={handleChange} placeholder="Ej: Info General" />
                            </FormGroup>
                        </Grid>
                        <Grid>
                            <FormGroup>
                                <Label>Tipo de Campo UI</Label>
                                <Select name="fieldType" value={formData.fieldType} onChange={handleChange}>
                                    <option value="text">Texto</option>
                                    <option value="number">Número</option>
                                    <option value="date">Fecha</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="select">Select</option>
                                    <option value="textarea">Área de texto</option>
                                </Select>
                            </FormGroup>
                            <FormGroup>
                                <Label>Orden</Label>
                                <Input type="number" name="displayOrder" value={formData.displayOrder} onChange={handleChange} />
                            </FormGroup>
                        </Grid>
                        <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" name="isEditable" checked={formData.isEditable} onChange={handleChange} />
                                <span style={{ fontSize: '13px' }}>Editable</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" name="showInList" checked={formData.showInList} onChange={handleChange} />
                                <span style={{ fontSize: '13px' }}>Mostrar en Listas</span>
                            </label>
                        </div>
                    </Section>
                </Body>
                <Footer>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave /> {initialData ? "Actualizar" : "Guardar"}
                    </Button>
                </Footer>
            </ModalContent>
        </ModalOverlay>
    );
}
