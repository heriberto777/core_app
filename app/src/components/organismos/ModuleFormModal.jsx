import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaCog, FaEye, FaShieldAlt, FaList, FaSortAmountDown, FaCheckSquare, FaSquare, FaInfoCircle } from "react-icons/fa";
import { Button } from "../index";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const Modal = styled.div`
  background: white;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  background: #f8fafc;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;

  h2 {
    font-size: 20px;
    font-weight: 900;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 12px;
  }
`;

const ScrollContent = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 32px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  grid-column: ${props => props.fullWidth ? "1 / -1" : "auto"};
`;

const Label = styled.label`
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 14px;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
  
  &:disabled {
    background: #f8fafc;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: white;
  font-size: 14px;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
`;

const ActionCheck = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: ${props => props.checked ? "#dbeafe" : "white"};
  border: 1px solid ${props => props.checked ? "#3b82f6" : "#e2e8f0"};
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: ${props => props.checked ? "#1e40af" : "#64748b"};
  transition: all 0.2s;

  input {
    display: none;
  }

  &:hover {
    border-color: #3b82f6;
  }
`;

const Footer = styled.div`
  padding: 24px;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #e2e8f0;
`;

const SystemAlert = styled.div`
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 12px;
  border-radius: 12px;
  font-size: 13px;
  margin-bottom: 20px;
  display: flex;
  gap: 12px;
  align-items: center;
`;

export const ModuleFormModal = ({ isOpen, onClose, onSave, initialData = null, categories = [], availableActions = [] }) => {
    const [formData, setFormData] = useState({
        name: "",
        displayName: "",
        description: "",
        isActive: true,
        actions: ["read"],
        uiConfig: {
            category: "otros",
            icon: "FaRegCircle",
            order: 10,
            visible: true
        }
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                actions: (initialData.actions || []).map(a => typeof a === 'string' ? a : (a.name || a.displayName || '')),
                uiConfig: {
                    ...initialData.uiConfig || {
                        category: "otros",
                        icon: "FaRegCircle",
                        order: 10,
                        visible: true
                    }
                }
            });
        } else {
            setFormData({
                name: "",
                displayName: "",
                description: "",
                isActive: true,
                actions: ["read"],
                uiConfig: {
                    category: "otros",
                    icon: "FaRegCircle",
                    order: 10,
                    visible: true
                }
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleToggleAction = (action) => {
        const currentActions = [...formData.actions];
        if (currentActions.includes(action)) {
            setFormData({
                ...formData,
                actions: currentActions.filter(a => a !== action)
            });
        } else {
            setFormData({
                ...formData,
                actions: [...currentActions, action]
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Overlay>
            <Modal>
                <Header>
                    <h2><FaCog /> {initialData ? "Editar Módulo" : "Nuevo Módulo del Sistema"}</h2>
                    <Button variant="ghost" onClick={onClose}>✕</Button>
                </Header>

                <ScrollContent>
                    <SystemAlert>
                        <FaInfoCircle />
                        <span>La configuración del módulo define cómo se comporta y se visualiza en todo el ecosistema.</span>
                    </SystemAlert>

                    <FormGrid>
                        <FormGroup>
                            <Label>Nombre Técnico (Indispensable)</Label>
                            <Input
                                disabled={initialData?.isSystem}
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                                placeholder="ej: facturacion_electronica"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Nombre de Visualización</Label>
                            <Input
                                required
                                value={formData.displayName}
                                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                placeholder="ej: Facturación Electrónica"
                            />
                        </FormGroup>
                        <FormGroup fullWidth>
                            <Label>Descripción Funcional</Label>
                            <Input
                                as="textarea"
                                style={{ height: '60px' }}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Escribe qué hace este módulo..."
                            />
                        </FormGroup>

                        <FormGroup>
                            <Label>Categoría UI</Label>
                            <Select
                                value={formData.uiConfig.category}
                                onChange={e => setFormData({ ...formData, uiConfig: { ...formData.uiConfig, category: e.target.value } })}
                            >
                                <option value="principal">Principal</option>
                                <option value="administracion">Administración</option>
                                <option value="reportes">Reportes</option>
                                <option value="configuracion">Configuración</option>
                                <option value="otros">Otros</option>
                                {categories.map(c => !["principal", "administracion", "reportes", "configuracion", "otros"].includes(c.name) && (
                                    <option key={c.name} value={c.name}>{c.displayName || c.name}</option>
                                ))}
                            </Select>
                        </FormGroup>
                        <FormGroup>
                            <Label>Orden de Visualización</Label>
                            <Input
                                type="number"
                                value={formData.uiConfig.order}
                                onChange={e => setFormData({ ...formData, uiConfig: { ...formData.uiConfig, order: parseInt(e.target.value) || 0 } })}
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Identificador de Icono (FontAwesome)</Label>
                            <Input
                                value={formData.uiConfig.icon}
                                onChange={e => setFormData({ ...formData, uiConfig: { ...formData.uiConfig, icon: e.target.value } })}
                                placeholder="FaCog, FaUsers, etc."
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Estado Inicial</Label>
                            <Select
                                value={formData.isActive}
                                onChange={e => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                            >
                                <option value="true">Activo / Visible</option>
                                <option value="false">Desactivado / Oculto</option>
                            </Select>
                        </FormGroup>
                    </FormGrid>

                    <SectionTitle><FaCheckSquare /> Capacidades Atómicas (Acciones)</SectionTitle>
                    <ActionsGrid>
                        {availableActions.map(actionObj => {
                            const actionValue = typeof actionObj === 'string' ? actionObj : (actionObj.name || actionObj.value || '');
                            const actionLabel = typeof actionObj === 'string' ? actionObj : (actionObj.displayName || actionObj.name || '');
                            
                            const checked = formData.actions.includes(actionValue);
                            return (
                                <ActionCheck key={actionValue} checked={checked}>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => handleToggleAction(actionValue)}
                                    />
                                    {checked ? <FaCheckSquare /> : <FaSquare />}
                                    {actionLabel.toUpperCase()}
                                </ActionCheck>
                            );
                        })}
                    </ActionsGrid>
                </ScrollContent>

                <Footer>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        loading={loading}
                    >
                        {initialData ? "Actualizar Módulo" : "Registrar Módulo"}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};
