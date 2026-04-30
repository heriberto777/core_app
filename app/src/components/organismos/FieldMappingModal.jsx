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

export function FieldMappingModal({ isOpen, onClose, onSave, initialData, consecutives = [] }) {
    const [formData, setFormData] = useState({
        sourceField: "",
        targetField: "",
        defaultValue: "",
        valueType: "text",
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
        unitConversion: { enabled: false },
        isConsecutive: false,
        consecutiveId: "",
        transform: {
          transformType: "",
          toUpperCase: false,
          toLowerCase: false,
          trim: true,
          maxLength: "",
          decimalPlaces: 2,
          thousandsSeparator: false,
          dateFormat: "YYYY-MM-DD",
          datetimeFormat: "YYYY-MM-DDTHH:MM:SS",
          trueValues: ["S", "Y", "1"],
          falseValues: ["N", "0"],
          trueOutput: "S",
          falseOutput: "N",
          defaultValue: ""
        }
    });
    const [loading, setLoading] = useState(false);
    const [showTransformConfig, setShowTransformConfig] = useState(false);

    useEffect(() => {
        if (initialData) {
            // Verificar si hay configuración de transform para mostrar la sección
            if (initialData.transform?.transformType) {
                setShowTransformConfig(true);
            }
            
            setFormData({
                ...initialData,
                sourceField: initialData.sourceField || "",
                defaultValue: initialData.defaultValue || "",
                valueType: initialData.fieldType || initialData.valueType || "text",
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
                valueType: "text",
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
                unitConversion: { enabled: false },
                isConsecutive: false,
                consecutiveId: ""
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
            // Sincronizar valueType con fieldType antes de guardar
            const dataToSave = {
                ...formData,
                fieldType: formData.valueType
            };
            await onSave(dataToSave);
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

                    <Section>
                        <SectionTitle>Sistema de Consecutivos (Multi-Secuencia)</SectionTitle>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    name="isConsecutive" 
                                    checked={formData.isConsecutive} 
                                    onChange={handleChange}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '600' }}>Usar Consecutivo Independiente</div>
                                    <div style={{ fontSize: '12px', opacity: 0.7 }}>Habilita una secuencia numérica propia para este campo.</div>
                                </div>
                            </label>

                            {formData.isConsecutive && (
                                <FormGroup>
                                    <Label>Seleccionar Consecutivo</Label>
                                    <Select 
                                        name="consecutiveId" 
                                        value={formData.consecutiveId} 
                                        onChange={handleChange}
                                        required={formData.isConsecutive}
                                    >
                                        <option value="">-- Seleccione un consecutivo --</option>
                                        {consecutives.map(c => (
                                            <option key={c._id} value={c._id}>
                                                {c.name} ({c.formatted || c.lastValue})
                                            </option>
                                        ))}
                                    </Select>
                                </FormGroup>
                            )}
                        </div>
                    </Section>

                    {!formData.lookupFromTarget ? (
                        <Section>
                            <SectionTitle>Transformación y Valores</SectionTitle>
                            <FormGroup>
                                <Label>Valor por Defecto / Función SQL</Label>
                                <Textarea name="defaultValue" value={formData.defaultValue} onChange={handleChange} placeholder="Ej: GETDATE() o VALOR" />
                            </FormGroup>
                            <FormGroup>
                                <Label>Tipo de Dato</Label>
                                <Select name="valueType" value={formData.valueType || "text"} onChange={handleChange}>
                                    <option value="text">Texto</option>
                                    <option value="number">Número</option>
                                    <option value="date">Fecha</option>
                                    <option value="boolean">Boolean</option>
                                </Select>
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

                        {/* === SECCIÓN DE TRANSFORMACIÓN === */}
                        <div style={{ marginTop: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#3b82f6', fontWeight: '600' }}>
                                <input 
                                    type="checkbox" 
                                    checked={showTransformConfig} 
                                    onChange={(e) => setShowTransformConfig(e.target.checked)} 
                                />
                                <span style={{ fontSize: '13px' }}>⚙️ Configurar Transformación</span>
                            </label>
                        </div>

                        {showTransformConfig && (
                            <div style={{ marginTop: '15px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <Grid>
                                    <FormGroup>
                                        <Label>Tipo de Dato</Label>
                                        <Select 
                                            name="transform.transformType" 
                                            value={formData.transform?.transformType || ""} 
                                            onChange={(e) => handleChange({ target: { name: e.target.name, value: e.target.value } })}
                                        >
                                            <option value="">Sin transformación</option>
                                            <option value="string">Texto (String)</option>
                                            <option value="number">Número</option>
                                            <option value="date">Fecha</option>
                                            <option value="datetime">Fecha y Hora</option>
                                            <option value="boolean">Booleano</option>
                                        </Select>
                                    </FormGroup>
                                </Grid>

                                {formData.transform?.transformType === "string" && (
                                    <Grid>
                                        <FormGroup>
                                            <Label>Mayúsculas</Label>
                                            <input 
                                                type="checkbox" 
                                                name="transform.toUpperCase"
                                                checked={formData.transform?.toUpperCase || false} 
                                                onChange={handleChange}
                                            />
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Minúsculas</Label>
                                            <input 
                                                type="checkbox" 
                                                name="transform.toLowerCase"
                                                checked={formData.transform?.toLowerCase || false} 
                                                onChange={handleChange}
                                            />
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Recortar espacios</Label>
                                            <input 
                                                type="checkbox" 
                                                name="transform.trim"
                                                checked={formData.transform?.trim !== false} 
                                                onChange={handleChange}
                                            />
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Máx. caracteres</Label>
                                            <Input 
                                                type="number" 
                                                name="transform.maxLength"
                                                value={formData.transform?.maxLength || ""} 
                                                onChange={handleChange}
                                                placeholder="Ej: 100"
                                            />
                                        </FormGroup>
                                    </Grid>
                                )}

                                {formData.transform?.transformType === "number" && (
                                    <Grid>
                                        <FormGroup>
                                            <Label>Decimales</Label>
                                            <Select 
                                                name="transform.decimalPlaces"
                                                value={formData.transform?.decimalPlaces ?? 2}
                                                onChange={handleChange}
                                            >
                                                <option value={0}>0</option>
                                                <option value={1}>1</option>
                                                <option value={2}>2</option>
                                                <option value={3}>3</option>
                                                <option value={4}>4</option>
                                            </Select>
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Separador miles</Label>
                                            <input 
                                                type="checkbox" 
                                                name="transform.thousandsSeparator"
                                                checked={formData.transform?.thousandsSeparator || false} 
                                                onChange={handleChange}
                                            />
                                        </FormGroup>
                                    </Grid>
                                )}

                                {formData.transform?.transformType === "date" && (
                                    <Grid>
                                        <FormGroup>
                                            <Label>Formato de Fecha</Label>
                                            <Select 
                                                name="transform.dateFormat"
                                                value={formData.transform?.dateFormat || "YYYY-MM-DD"}
                                                onChange={handleChange}
                                            >
                                                <option value="YYYY-MM-DD">YYYY-MM-DD (2026-04-07)</option>
                                                <option value="DD/MM/YYYY">DD/MM/YYYY (07/04/2026)</option>
                                                <option value="MM/DD/YYYY">MM/DD/YYYY (04/07/2026)</option>
                                                <option value="DD-MM-YYYY">DD-MM-YYYY (07-04-2026)</option>
                                            </Select>
                                        </FormGroup>
                                    </Grid>
                                )}

                                {formData.transform?.transformType === "datetime" && (
                                    <Grid>
                                        <FormGroup>
                                            <Label>Formato Fecha-Hora</Label>
                                            <Select 
                                                name="transform.datetimeFormat"
                                                value={formData.transform?.datetimeFormat || "YYYY-MM-DDTHH:MM:SS"}
                                                onChange={handleChange}
                                            >
                                                <option value="YYYY-MM-DDTHH:MM:SS">YYYY-MM-DDTHH:MM:SS</option>
                                                <option value="YYYY-MM-DD HH:MM:SS">YYYY-MM-DD HH:MM:SS</option>
                                                <option value="YYYY-MM-DD 00:00:00.000">YYYY-MM-DD 00:00:00.000 (SQL Server)</option>
                                                <option value="DD/MM/YYYY HH:MM">DD/MM/YYYY HH:MM</option>
                                            </Select>
                                        </FormGroup>
                                    </Grid>
                                )}

                                {formData.transform?.transformType === "boolean" && (
                                    <>
                                        <Grid>
                                            <FormGroup>
                                                <Label>Valores TRUE</Label>
                                                <Input 
                                                    name="transform.trueValues"
                                                    value={(formData.transform?.trueValues || []).join(",")}
                                                    onChange={(e) => handleChange({ 
                                                        target: { 
                                                            name: "transform.trueValues", 
                                                            value: e.target.value.split(",").map(v => v.trim()) 
                                                        } 
                                                    })}
                                                    placeholder="S, Y, 1"
                                                />
                                            </FormGroup>
                                            <FormGroup>
                                                <Label>Valores FALSE</Label>
                                                <Input 
                                                    name="transform.falseValues"
                                                    value={(formData.transform?.falseValues || []).join(",")}
                                                    onChange={(e) => handleChange({ 
                                                        target: { 
                                                            name: "transform.falseValues", 
                                                            value: e.target.value.split(",").map(v => v.trim()) 
                                                        } 
                                                    })}
                                                    placeholder="N, 0"
                                                />
                                            </FormGroup>
                                        </Grid>
                                        <Grid>
                                            <FormGroup>
                                                <Label>Output TRUE</Label>
                                                <Input 
                                                    name="transform.trueOutput"
                                                    value={formData.transform?.trueOutput || "S"}
                                                    onChange={handleChange}
                                                />
                                            </FormGroup>
                                            <FormGroup>
                                                <Label>Output FALSE</Label>
                                                <Input 
                                                    name="transform.falseOutput"
                                                    value={formData.transform?.falseOutput || "N"}
                                                    onChange={handleChange}
                                                />
                                            </FormGroup>
                                        </Grid>
                                    </>
                                )}

                                {/* Valor por defecto */}
                                <FormGroup style={{ marginTop: '10px' }}>
                                    <Label>Valor por defecto (si es null)</Label>
                                    <Input 
                                        name="transform.defaultValue"
                                        value={formData.transform?.defaultValue || ""}
                                        onChange={handleChange}
                                        placeholder="Valor por defecto"
                                    />
                                </FormGroup>
                            </div>
                        )}
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
