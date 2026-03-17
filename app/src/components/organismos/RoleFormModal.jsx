import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaShieldAlt, FaInfoCircle, FaLock, FaCheckSquare, FaSquare } from "react-icons/fa";
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

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ResourceCard = styled.div`
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
`;

const ResourceHeader = styled.div`
  margin-bottom: 12px;
  h4 {
    font-size: 14px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 4px;
  }
  p {
    font-size: 12px;
    color: #64748b;
  }
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
`;

const PermissionCheck = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${props => props.checked ? "#dbeafe" : "white"};
  border: 1px solid ${props => props.checked ? "#3b82f6" : "#e2e8f0"};
  border-radius: 8px;
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
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
  padding: 12px;
  border-radius: 12px;
  font-size: 13px;
  margin-bottom: 20px;
  display: flex;
  gap: 12px;
  align-items: center;
`;

export const RoleFormModal = ({ isOpen, onClose, onSave, initialData = null, resources = [] }) => {
    const [formData, setFormData] = useState({
        name: "",
        displayName: "",
        description: "",
        permissions: []
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || "",
                displayName: initialData.displayName || "",
                description: initialData.description || "",
                permissions: initialData.permissions || []
            });
        } else {
            setFormData({
                name: "", displayName: "", description: "", permissions: []
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleTogglePermission = (resourceId, action) => {
        const currentPermissions = [...formData.permissions];
        const resourceIdx = currentPermissions.findIndex(p => p.resource === resourceId);

        if (resourceIdx >= 0) {
            const actions = currentPermissions[resourceIdx].actions;
            if (actions.includes(action)) {
                currentPermissions[resourceIdx].actions = actions.filter(a => a !== action);
                if (currentPermissions[resourceIdx].actions.length === 0) {
                    currentPermissions.splice(resourceIdx, 1);
                }
            } else {
                currentPermissions[resourceIdx].actions.push(action);
            }
        } else {
            currentPermissions.push({ resource: resourceId, actions: [action] });
        }

        setFormData({ ...formData, permissions: currentPermissions });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.permissions.length) {
            alert("Debe seleccionar al menos un permiso.");
            return;
        }
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
                    <h2><FaShieldAlt /> {initialData ? "Editar Rol de Seguridad" : "Nuevo Rol de Seguridad"}</h2>
                    <Button variant="ghost" onClick={onClose}>✕</Button>
                </Header>

                <ScrollContent>
                    {initialData?.isSystem && (
                        <SystemAlert>
                            <FaLock />
                            <span>Este es un rol del sistema. Ciertas propiedades están bloqueadas por seguridad.</span>
                        </SystemAlert>
                    )}

                    <FormGrid>
                        <FormGroup>
                            <Label>Nombre Técnico (Slug)</Label>
                            <Input
                                disabled={initialData?.isSystem}
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                                placeholder="ej: analista-ventas"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Nombre Amigable</Label>
                            <Input
                                disabled={initialData?.isSystem}
                                required
                                value={formData.displayName}
                                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                placeholder="ej: Analista de Ventas"
                            />
                        </FormGroup>
                        <FormGroup fullWidth>
                            <Label>Descripción del Rol</Label>
                            <Input
                                disabled={initialData?.isSystem}
                                as="textarea"
                                style={{ height: '60px' }}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe las responsabilidades de este rol..."
                            />
                        </FormGroup>
                    </FormGrid>

                    <SectionTitle><FaCheckSquare /> Matriz de Permisos</SectionTitle>

                    {resources.map(res => {
                        const resPerm = formData.permissions.find(p => p.resource === res.id);
                        return (
                            <ResourceCard key={res.id}>
                                <ResourceHeader>
                                    <h4>{res.name}</h4>
                                    <p>{res.description}</p>
                                </ResourceHeader>
                                <ActionsGrid>
                                    {res.actions.map(action => {
                                        const checked = resPerm?.actions.includes(action);
                                        return (
                                            <PermissionCheck key={action} checked={checked}>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => handleTogglePermission(res.id, action)}
                                                />
                                                {checked ? <FaCheckSquare /> : <FaSquare />}
                                                {action.toUpperCase()}
                                            </PermissionCheck>
                                        );
                                    })}
                                </ActionsGrid>
                            </ResourceCard>
                        );
                    })}
                </ScrollContent>

                <Footer>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        loading={loading}
                    >
                        {initialData ? "Guardar Cambios" : "Crear Rol"}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};
