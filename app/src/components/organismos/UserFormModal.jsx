import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaUser, FaEnvelope, FaShieldAlt, FaPhone, FaLock, FaUserShield } from "react-icons/fa";
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
  max-width: 700px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
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

const Form = styled.form`
  padding: 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  overflow-y: auto;
  flex: 1;

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

const InputWrapper = styled.div`
  position: relative;
  
  svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 12px 12px 42px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 14px;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: white;
  min-height: 120px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  cursor: pointer;
  grid-column: 1 / -1;

  span {
    font-weight: 700;
    color: #1e293b;
    font-size: 14px;
  }

  input {
    width: 20px;
    height: 20px;
    accent-color: #3b82f6;
  }
`;

const Footer = styled.div`
  padding: 24px;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const SectionTitle = styled.h3`
  grid-column: 1 / -1;
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  margin: 20px 0 10px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ResourceCard = styled.div`
  grid-column: 1 / -1;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
`;

const ResourceHeader = styled.div`
  margin-bottom: 12px;
  
  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: #1e293b;
  }
  
  p {
    margin: 4px 0 0 0;
    font-size: 12px;
    color: #64748b;
  }
`;

const ActionsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const PermissionCheck = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: ${props => props.checked ? '#dbeafe' : '#f1f5f9'};
  border: 1px solid ${props => props.checked ? '#3b82f6' : '#e2e8f0'};
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.checked ? '#1e40af' : '#64748b'};
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.checked ? '#bfdbfe' : '#e2e8f0'};
  }
  
  input {
    display: none;
  }
`;

const InfoText = styled.p`
  grid-column: 1 / -1;
  font-size: 12px;
  color: #64748b;
  margin: 0;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
  overflow-x: auto;
`;

const Tab = styled.button`
  padding: 8px 16px;
  border: none;
  background: ${props => props.$active ? '#3b82f6' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#64748b'};
  border-radius: 8px 8px 0 0;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  
  &:hover {
    background: ${props => props.$active ? '#3b82f6' : '#f1f5f9'};
    color: ${props => props.$active ? 'white' : '#1e293b'};
  }
`;

const TabContent = styled.div`
  max-height: 400px;
  overflow-y: auto;
`;

export const UserFormModal = ({ isOpen, onClose, onSave, initialData = null, roles = [], resources = [], actions = [] }) => {
    const [formData, setFormData] = useState({
        name: "",
        lastname: "",
        email: "",
        telefono: "",
        password: "",
        roles: [],
        permissions: [],
        isAdmin: false
    });

    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("info");

    const handleTogglePermission = (resourceId, action) => {
        const currentPermissions = [...(formData.permissions || [])];
        const resourceIdx = currentPermissions.findIndex(p => p.resource === resourceId);
        
        // Extract a primitive string value from action in case it's an object
        const actionValue = typeof action === 'string' ? action : (action.name || action.value || action._id);

        if (resourceIdx > -1) {
            // Find if the actionValue is already in the array
            const actionIdx = currentPermissions[resourceIdx].actions.findIndex(a => {
                const aValue = typeof a === 'string' ? a : (a.name || a.value || a._id);
                return aValue === actionValue;
            });
            
            if (actionIdx > -1) {
                currentPermissions[resourceIdx].actions.splice(actionIdx, 1);
                if (currentPermissions[resourceIdx].actions.length === 0) {
                    currentPermissions.splice(resourceIdx, 1);
                }
            } else {
                currentPermissions[resourceIdx].actions.push(actionValue);
            }
        } else {
            currentPermissions.push({ resource: resourceId, actions: [actionValue] });
        }
        
        setFormData({ ...formData, permissions: currentPermissions });
    };

    useEffect(() => {
        if (initialData) {
            const rolesArray = Array.isArray(initialData.roles) 
                ? initialData.roles.map(r => typeof r === 'object' ? r._id : r)
                : [];
            
            const rolesFromRolesInfo = (initialData.rolesInfo || []).map(r => r._id || r);
            
            const finalRoles = rolesArray.length > 0 ? rolesArray : rolesFromRolesInfo;
            
            const userPermissions = initialData.permissions;
            const permissionsArray = Array.isArray(userPermissions) ? userPermissions : [];
            
            setFormData({
                name: initialData.name || "",
                lastname: initialData.lastname || "",
                email: initialData.email || "",
                telefono: initialData.telefono || "",
                roles: finalRoles,
                permissions: permissionsArray,
                isAdmin: initialData.isAdmin || false,
                password: ""
            });
        } else {
            setFormData({
                name: "", lastname: "", email: "", telefono: "",
                password: "", roles: [], permissions: [], isAdmin: false
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Overlay>
            <Modal style={{ maxWidth: '700px' }}>
                <Header>
                    <h2><FaUser /> {initialData ? "Editar Usuario" : "Nuevo Usuario"}</h2>
                    <Button variant="ghost" onClick={onClose}>✕</Button>
                </Header>

                <TabsContainer>
                    <Tab $active={activeTab === 'info'} onClick={() => setActiveTab('info')}>
                        Información
                    </Tab>
                    <Tab $active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}>
                        Roles
                    </Tab>
                    {resources.length > 0 && actions.length > 0 && (
                        <Tab $active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')}>
                            Permisos
                        </Tab>
                    )}
                </TabsContainer>

                <Form onSubmit={handleSubmit} id="user-form" style={{ display: activeTab === 'info' ? 'grid' : 'none' }}>
                    <FormGroup>
                        <Label>Nombre</Label>
                        <InputWrapper>
                            <FaUser />
                            <Input
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Nombre"
                            />
                        </InputWrapper>
                    </FormGroup>

                    <FormGroup>
                        <Label>Apellido</Label>
                        <InputWrapper>
                            <FaUser />
                            <Input
                                required
                                value={formData.lastname}
                                onChange={e => setFormData({ ...formData, lastname: e.target.value })}
                                placeholder="Apellido"
                            />
                        </InputWrapper>
                    </FormGroup>

                    <FormGroup>
                        <Label>Email</Label>
                        <InputWrapper>
                            <FaEnvelope />
                            <Input
                                required
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder="correo@ejemplo.com"
                            />
                        </InputWrapper>
                    </FormGroup>

                    <FormGroup>
                        <Label>Teléfono</Label>
                        <InputWrapper>
                            <FaPhone />
                            <Input
                                value={formData.telefono}
                                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                placeholder="999 999 999"
                            />
                        </InputWrapper>
                    </FormGroup>

                    {!initialData && (
                        <FormGroup fullWidth>
                            <Label>Contraseña</Label>
                            <InputWrapper>
                                <FaLock />
                                <Input
                                    required
                                    type="password"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </InputWrapper>
                        </FormGroup>
                    )}

                    <CheckboxLabel>
                        <input
                            type="checkbox"
                            checked={formData.isAdmin}
                            onChange={e => setFormData({ ...formData, isAdmin: e.target.checked })}
                        />
                        <FaUserShield color="#f39c12" />
                        <span>Administrador del sistema (Acceso total)</span>
                    </CheckboxLabel>
                </Form>

                {activeTab === 'roles' && (
                    <TabContent style={{ padding: '0 24px' }}>
                        <FormGroup fullWidth>
                            <Label>Asignar Roles (Ctrl+Click para selección múltiple)</Label>
                            <Select
                                multiple
                                value={formData.roles}
                                onChange={e => {
                                    const values = Array.from(e.target.selectedOptions, option => option.value);
                                    setFormData({ ...formData, roles: values });
                                }}
                            >
                                {roles.map(role => (
                                    <option key={role._id || role.name} value={role._id || role.name}>
                                        {role.displayName || role.name}
                                    </option>
                                ))}
                            </Select>
                        </FormGroup>
                    </TabContent>
                )}

                {activeTab === 'permissions' && resources.length > 0 && actions.length > 0 && (
                    <TabContent style={{ padding: '0 24px' }}>
                        <InfoText style={{ marginBottom: '16px' }}>
                            Asigne permisos específicos directamente a este usuario. Los permisos de rol se combinan con estos.
                        </InfoText>

                        {resources.map(resource => (
                            <ResourceCard key={resource._id || resource.name || Math.random()}>
                                <ResourceHeader>
                                    <h4>{String(resource.displayName || resource.name || 'Unknown')}</h4>
                                    <p>{String(resource.description || '')}</p>
                                </ResourceHeader>
                                <ActionsGrid>
                                    {actions.map(action => {
                                        const actionValue = typeof action === 'string' ? action : (action.name || action.value || action._id);
                                        const actionLabel = typeof action === 'string' ? action : (action.displayName || action.label || action.name);
                                        
                                        const perm = (formData.permissions || []).find(p => p.resource === (resource._id || resource.name));
                                        
                                        const isChecked = perm?.actions?.some(a => {
                                            const aValue = typeof a === 'string' ? a : (a.name || a.value || a._id);
                                            return aValue === actionValue;
                                        });

                                        return (
                                            <PermissionCheck key={String(actionValue)} checked={isChecked}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked || false}
                                                    onChange={() => handleTogglePermission(resource._id || resource.name, actionValue)}
                                                />
                                                {String(actionLabel)}
                                            </PermissionCheck>
                                        );
                                    })}
                                </ActionsGrid>
                            </ResourceCard>
                        ))}
                    </TabContent>
                )}

                <Footer>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form="user-form"
                        loading={loading}
                    >
                        {initialData ? "Actualizar Perfil" : "Crear Usuario"}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};
