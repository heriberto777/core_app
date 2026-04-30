import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaTimes, FaSave, FaDatabase, FaLink, FaList, FaVial, FaQuestionCircle } from "react-icons/fa";

const Overlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; backdrop-filter: blur(4px);
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 900px;
  max-height: 90vh;
  border-radius: 12px;
  display: flex; flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.premium};
  border: 1px solid ${({ theme }) => theme.border};
  overflow: hidden;
`;

const Header = styled.div`
  padding: 15px 20px;
  background: ${({ theme }) => theme.bg2};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
`;

const TabContainer = styled.div`
  display: flex;
  background: ${({ theme }) => theme.bg2};
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const Tab = styled.button`
  flex: 1;
  padding: 12px;
  border: none; background: none;
  color: ${({ active, theme }) => active ? theme.primary : theme.textSecondary};
  font-weight: 600; font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid ${({ active, theme }) => active ? theme.primary : "transparent"};
  transition: all 0.2s;
  &:hover { background: ${({ theme }) => theme.border}30; }
  display: flex; align-items: center; justify-content: center; gap: 8px;
`;

const Body = styled.div`
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex; flex-direction: column; gap: 15px;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 6px;
`;

const Label = styled.label`
  font-size: 13px; font-weight: 700; color: ${({ theme }) => theme.textSecondary};
  text-transform: uppercase; letter-spacing: 0.5px;
  display: flex; align-items: center; gap: 8px;
`;

const HelpIcon = styled.span`
  color: ${({ theme }) => theme.primary};
  cursor: help;
  position: relative;
  
  &:hover .tooltip {
    display: block;
  }
`;

const Tooltip = styled.div`
  display: none;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.bg4};
  color: ${({ theme }) => theme.text};
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 400;
  width: 280px;
  z-index: 100;
  box-shadow: ${({ theme }) => theme.shadows.medium};
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.4;
  
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: ${({ theme }) => theme.bg4};
  }
`;

const Input = styled.input`
  padding: 10px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
  &:focus { border-color: ${({ theme }) => theme.primary}; outline: none; }
`;

const Select = styled.select`
  padding: 10px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

const TextArea = styled.textarea`
  padding: 10px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-family: 'Fira Code', monospace; font-size: 13px;
  min-height: 120px; resize: vertical;
`;

const Footer = styled.div`
  padding: 15px 20px;
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: flex-end; gap: 12px;
`;

const CheckboxGroup = styled.div`
  display: flex; gap: 20px; margin-top: 10px;
  flex-wrap: wrap;
`;

const CheckboxLabel = styled.label`
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 8px 12px;
  background: ${({ theme }) => theme.bg2};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  font-size: 14px;
  
  &:hover {
    border-color: ${({ theme }) => theme.primary};
  }
`;

const SectionTitle = styled.h4`
  margin: 10px 0 5px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.primary};
  text-transform: uppercase;
  letter-spacing: 1px;
`;

import { Button } from "../../index";

const FIELD_HELP = {
  name: "Identificador único de la tarea. Debe ser un nombre descriptivo sin espacios ni caracteres especiales.",
  type: "Define cómo se ejecuta la tarea: Manual (solo clic), Automática (cron), o Ambas.",
  transferType: "Dirección de la transferencia de datos entre servidores.",
  active: "Si está desmarcado, la tarea no podrá ejecutarse ni manualmente ni automáticamente.",
  clearBeforeInsert: "Elimina todos los registros de la tabla destino antes de insertar los nuevos. Útil para sincronizaciones completas.",
  query: "Consulta SQL que se ejecutará en el servidor origen para obtener los datos a transferir.",
  parameters: "Condiciones para filtrar los datos en formato JSON. Ej: [{\"field\": \"status\", \"operator\": \"=\", \"value\": \"A\"}]",
  linkedGroup: "Nombre del grupo de tareas que se ejecutarán de forma coordinada. Todas las tareas con el mismo grupo se ejecutan juntas.",
  linkedExecutionOrder: "Orden de ejecución dentro del grupo. Las tareas se ejecutan en orden ascendente (0, 1, 2...).",
  linkedTasks: "Selecciona otras tareas que se ejecutarán automáticamente después de completar esta tarea.",
  requiredFields: "Lista de campos que deben tener valor. Si están vacíos, la transferencia fallará.",
  postUpdateQuery: "SQL que se ejecutará después de transferir los datos. Útil para actualizar estados o limpiar tablas. NO incluir WHERE, se agregará automáticamente con los registros afectados.",
  targetTable: "Tabla destino para transferencias internas (Server1 → Server1).",
  executionMode: "Normal: ejecuta todo de una vez. Batches: procesa en lotes para grandes volúmenes de datos.",
  existenceCheck: "Tabla y campo clave para verificar existencia de registros y construir el WHERE del SQL Post-Ejecución.",

};

const FieldHelp = ({ field }) => (
  <HelpIcon className="tooltip">
    <FaQuestionCircle size={12} />
    <Tooltip className="tooltip">{FIELD_HELP[field]}</Tooltip>
  </HelpIcon>
);

export const TaskFormModal = ({ task, isOpen, onClose, onSave, allTasks = [] }) => {
    const [activeTab, setActiveTab] = useState("general");
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "", type: "manual", transferType: "general", executionMode: "normal",
        active: true, clearBeforeInsert: false, query: "", parameters: "[]",
        linkedGroup: "", linkedExecutionOrder: 0, executeLinkedTasks: false,
        linkedTasks: [], postUpdateQuery: "", 
        validationRules: { requiredFields: [], existenceCheck: { table: "", key: "" } },
        postUpdateMapping: { viewKey: null, tableKey: null }
    });

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                parameters: JSON.stringify(task.parameters || [], null, 2),
                linkedGroup: task.linkedGroup || "",
                linkedExecutionOrder: task.linkedExecutionOrder || 0,
                linkedTasks: task.linkedTasks || [],
                postUpdateQuery: task.postUpdateQuery || "",
                validationRules: task.validationRules || { requiredFields: [], existenceCheck: { table: "", key: "" } },
                postUpdateMapping: task.postUpdateMapping || { viewKey: null, tableKey: null }
            });
        } else {
            setFormData({
                name: "", type: "manual", transferType: "general", executionMode: "normal",
                active: true, clearBeforeInsert: false, query: "", parameters: "[]",
                linkedGroup: "", linkedExecutionOrder: 0, executeLinkedTasks: false,
                linkedTasks: [], postUpdateQuery: "", 
                validationRules: { requiredFields: [], existenceCheck: { table: "", key: "" } },
                postUpdateMapping: { viewKey: null, tableKey: null }
            });
        }
    }, [task, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === "checkbox") {
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleValidationChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            validationRules: { ...prev.validationRules, [field]: value }
        }));
    };

    const handleSave = async () => {
        try {
            const finalData = {
                ...formData,
                parameters: JSON.parse(formData.parameters),
                linkedExecutionOrder: parseInt(formData.linkedExecutionOrder),
                executeLinkedTasks: formData.linkedGroup !== ""
            };
            setLoading(true);
            await onSave(finalData);
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Overlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <h3 style={{ margin: 0 }}>
                        {task ? "Editar Tarea de Transferencia" : "Nueva Tarea de Transferencia"}
                    </h3>
                    <FaTimes style={{ cursor: 'pointer' }} onClick={onClose} />
                </Header>

                <TabContainer>
                    <Tab active={activeTab === "general"} onClick={() => setActiveTab("general")}>
                        <FaList /> General
                    </Tab>
                    <Tab active={activeTab === "query"} onClick={() => setActiveTab("query")}>
                        <FaDatabase /> SQL & Params
                    </Tab>
                    <Tab active={activeTab === "linking"} onClick={() => setActiveTab("linking")}>
                        <FaLink /> Vinculación
                    </Tab>
                    <Tab active={activeTab === "advanced"} onClick={() => setActiveTab("advanced")}>
                        <FaVial /> Avanzado
                    </Tab>
                </TabContainer>

                <Body>
                    {activeTab === "general" && (
                        <>
                            <FormGroup>
                                <Label>Nombre de la Tarea <FieldHelp field="name" /></Label>
                                <Input name="name" value={formData.name} onChange={handleChange} placeholder="Ej: Importar Pedidos Pendientes" />
                            </FormGroup>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <FormGroup>
                                    <Label>Tipo de Ejecución <FieldHelp field="type" /></Label>
                                    <Select name="type" value={formData.type} onChange={handleChange}>
                                        <option value="manual">Manual - Solo se ejecuta con botón</option>
                                        <option value="auto">Automática - Solo con programador (cron)</option>
                                        <option value="both">Ambas - Manual y Automática</option>
                                    </Select>
                                </FormGroup>
                                <FormGroup>
                                    <Label>Tipo de Transferencia <FieldHelp field="transferType" /></Label>
                                    <Select name="transferType" value={formData.transferType} onChange={handleChange}>
                                        <option value="general">General - Transferencia estándar</option>
                                        <option value="up">↑ Transfer Up (Server1 → Server2)</option>
                                        <option value="down">↓ Transfer Down (Server2 → Server1)</option>
                                        <option value="internal">⇄ Interno (Server1 → Server1)</option>
                                    </Select>
                                </FormGroup>
                            </div>
                            
                            <CheckboxGroup>
                                <CheckboxLabel>
                                    <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                                    <span>Tarea Activa</span>
                                    <FieldHelp field="active" />
                                </CheckboxLabel>
                                <CheckboxLabel>
                                    <input type="checkbox" name="clearBeforeInsert" checked={formData.clearBeforeInsert} onChange={handleChange} />
                                    <span>Borrar antes de insertar</span>
                                    <FieldHelp field="clearBeforeInsert" />
                                </CheckboxLabel>
                            </CheckboxGroup>

                            <SectionTitle>Tabla Destino (Solo para Transferencias Internas)</SectionTitle>
                            <FormGroup>
                                <Label>Nombre de Tabla <FieldHelp field="targetTable" /></Label>
                                <Input name="targetTable" value={formData.targetTable || ""} onChange={handleChange} placeholder="Ej: IMPLT_Orders" />
                            </FormGroup>
                        </>
                    )}

                    {activeTab === "query" && (
                        <>
                            <FormGroup>
                                <Label>Consulta SQL Principal <FieldHelp field="query" /></Label>
                                <TextArea name="query" value={formData.query} onChange={handleChange} 
                                    placeholder="SELECT NUM_PED, COD_CLI, FECHA_PED, ... FROM PEDIDO WHERE ESTADO = 'A'" />
                            </FormGroup>
                            <FormGroup>
                                <Label>Parámetros de Filtrado (JSON) <FieldHelp field="parameters" /></Label>
                                <TextArea name="parameters" value={formData.parameters} onChange={handleChange} 
                                    placeholder='[{"field": "ESTADO", "operator": "=", "value": "A"}, {"field": "FECHA_PED", "operator": ">=", "value": "2024-01-01"}]' />
                            </FormGroup>
                            <div style={{ background: '#e3f2fd', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#1565c0' }}>
                                <strong>Operadores disponibles:</strong> =, !=, &gt;, &lt;, &gt;=, &lt;=, LIKE, IN, NOT IN
                            </div>
                        </>
                    )}

                    {activeTab === "linking" && (
                        <>
                            <SectionTitle>Grupo de Tareas Vinculadas</SectionTitle>
                            <FormGroup>
                                <Label>Nombre del Grupo <FieldHelp field="linkedGroup" /></Label>
                                <Input name="linkedGroup" value={formData.linkedGroup} onChange={handleChange} 
                                    placeholder="Ej: Sincronizacion_Diaria_Completa" />
                                <small style={{ color: '#888', fontSize: '11px' }}>
                                    Las tareas con el mismo nombre de grupo se ejecutarán de forma coordinada
                                </small>
                            </FormGroup>
                            <FormGroup>
                                <Label>Orden de Ejecución <FieldHelp field="linkedExecutionOrder" /></Label>
                                <Input type="number" name="linkedExecutionOrder" value={formData.linkedExecutionOrder} onChange={handleChange} 
                                    min="0" placeholder="0" />
                                <small style={{ color: '#888', fontSize: '11px' }}>
                                    Las tareas se ejecutan en orden ascendente (0 → 1 → 2...)
                                </small>
                            </FormGroup>
                            
                            <SectionTitle>Vinculación Directa (Alternativa al Grupo)</SectionTitle>
                            <FormGroup>
                                <Label>Seleccionar Tareas Vinculadas <FieldHelp field="linkedTasks" /></Label>
                                <Select multiple style={{ height: '120px' }}
                                    value={formData.linkedTasks}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, option => option.value);
                                        setFormData(prev => ({ ...prev, linkedTasks: values }));
                                    }}
                                >
                                    {allTasks.filter(t => t._id !== task?._id).map(t => (
                                        <option key={t._id} value={t._id}>{t.name}</option>
                                    ))}
                                </Select>
                                <small style={{ color: '#888', fontSize: '11px' }}>
                                    Estas tareas se ejecutarán automáticamente después de completar la actual
                                </small>
                            </FormGroup>
                        </>
                    )}

                    {activeTab === "advanced" && (
                        <>
                            <SectionTitle>Validación de Datos</SectionTitle>
                            <FormGroup>
                                <Label>Campos Obligatorios <FieldHelp field="requiredFields" /></Label>
                                <Input value={formData.validationRules.requiredFields.join(', ')}
                                    onChange={(e) => handleValidationChange('requiredFields', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                    placeholder="CAMPO1, CAMPO2, CAMPO3" />
                                <small style={{ color: '#888', fontSize: '11px' }}>
                                    Lista de campos que no pueden estar vacíos. Separados por coma.
                                </small>
                            </FormGroup>

                            <SectionTitle>Verificación de Existencia</SectionTitle>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <FormGroup>
                                    <Label>Tabla <FieldHelp field="existenceCheck" /></Label>
                                    <Input 
                                        value={formData.validationRules.existenceCheck?.table || ''}
                                        onChange={(e) => handleValidationChange('existenceCheck', { ...formData.validationRules.existenceCheck, table: e.target.value })}
                                        placeholder="CATELLI.CLIENTE" />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Campo Clave <FieldHelp field="existenceCheck" /></Label>
                                    <Input 
                                        value={formData.validationRules.existenceCheck?.key || ''}
                                        onChange={(e) => handleValidationChange('existenceCheck', { ...formData.validationRules.existenceCheck, key: e.target.value })}
                                        placeholder="Code_ofClient" />
                                </FormGroup>
                            </div>
                            <small style={{ color: '#888', fontSize: '11px', marginBottom: '15px', display: 'block' }}>
                                Tabla y campo PK para verificar existencia y construir el WHERE del SQL Post-Ejecución automáticamente.
                            </small>

                            <SectionTitle>Consulta Post-Transferencia</SectionTitle>
                            <FormGroup>
                                <Label>SQL Post-Ejecución <FieldHelp field="postUpdateQuery" /></Label>
                                <TextArea name="postUpdateQuery" value={formData.postUpdateQuery} onChange={handleChange} 
                                    placeholder="UPDATE CATELLI.CLIENTE SET U_TRANSFER_STATUS = 'Normal'" />
                                <small style={{ color: '#888', fontSize: '11px' }}>
                                    NO incluir WHERE. Se agregará automáticamente usando el Campo Clave de verificación de existencia.
                                </small>
                            </FormGroup>

                            <SectionTitle>Modo de Ejecución</SectionTitle>
                            <FormGroup>
                                <Label>Modo de Proceso <FieldHelp field="executionMode" /></Label>
                                <Select name="executionMode" value={formData.executionMode} onChange={handleChange}>
                                    <option value="normal">Normal - Todo en una sola ejecución</option>
                                    <option value="batchesSSE">Batches (SSE) - En lotes con progreso en tiempo real</option>
                                </Select>
                            </FormGroup>
                        </>
                    )}
                </Body>

                <Footer>
                    <Button onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} loading={loading}>
                        <FaSave /> {task ? "Actualizar Tarea" : "Crear Tarea"}
                    </Button>
                </Footer>
            </ModalContent>
        </Overlay>
    );
};
