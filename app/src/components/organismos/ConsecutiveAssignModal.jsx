import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaTimes, FaLink, FaShieldAlt, FaLayerGroup } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";
import { ConsecutiveApi, MappingApi } from "../../api/index";

const consecutiveApi = new ConsecutiveApi();
const mappingApi = new MappingApi();

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 550px; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center; background: ${({ theme }) => theme.bg2}20;
`;

const Body = styled.div`
  padding: 24px; display: flex; flex-direction: column; gap: 24px;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 8px;
`;

const Label = styled.label`
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: ${({ theme }) => theme.textSecondary};
`;

const Select = styled.select`
  padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text}; font-size: 14px;
`;

const PermissionGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
  padding: 16px; background: ${({ theme }) => theme.bg2}05; border-radius: 16px; border: 1px solid ${({ theme }) => theme.border};
`;

const CheckboxLabel = styled.label`
  display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px;
  &:hover { opacity: 0.8; }
`;

export function ConsecutiveAssignModal({ isOpen, onClose, onAssign, consecutive, accessToken }) {
    const [loading, setLoading] = useState(false);
    const [mappings, setMappings] = useState([]);
    const [formData, setFormData] = useState({
        entityType: "mapping",
        entityId: "",
        allowedOperations: ["read", "increment"]
    });

    useEffect(() => {
        if (isOpen && formData.entityType === "mapping") {
            fetchMappings();
        }
    }, [isOpen, formData.entityType]);

    const fetchMappings = async () => {
        try {
            setLoading(true);
            const data = await mappingApi.getMappings(accessToken);
            setMappings(data || []);
            if (data?.length > 0) {
                setFormData(prev => ({ ...prev, entityId: data[0]._id }));
            }
        } catch (error) {
            console.error("Error fetching mappings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpToggle = (op) => {
        setFormData(prev => {
            const ops = prev.allowedOperations.includes(op)
                ? prev.allowedOperations.filter(o => o !== op)
                : [...prev.allowedOperations, op];
            return { ...prev, allowedOperations: ops };
        });
    };

    const handleSubmit = () => {
        if (!formData.entityId) return alert("Debe seleccionar una entidad");
        if (formData.allowedOperations.length === 0) return alert("Debe seleccionar al menos un permiso");
        onAssign(formData);
    };

    if (!isOpen || !consecutive) return null;

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaLink color={({ theme }) => theme.primary} />
                        <h3 style={{ margin: 0 }}>Vincular Folio</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose}><FaTimes /></Button>
                </Header>

                <Body>
                    <div style={{ padding: '12px', background: ({ theme }) => `${theme.primary}15`, borderRadius: '12px', fontSize: '14px' }}>
                        Asignando: <strong>{consecutive.name}</strong>
                    </div>

                    <FormGroup>
                        <Label>Tipo de Entidad</Label>
                        <Select
                            value={formData.entityType}
                            onChange={e => setFormData({ ...formData, entityType: e.target.value })}
                        >
                            <option value="mapping">Configuración de Mapeo</option>
                            <option value="user">Usuario Específico</option>
                            <option value="company">Compañía</option>
                        </Select>
                    </FormGroup>

                    {formData.entityType === 'mapping' ? (
                        <FormGroup>
                            <Label>Mapeo de Transferencia</Label>
                            <Select
                                disabled={loading}
                                value={formData.entityId}
                                onChange={e => setFormData({ ...formData, entityId: e.target.value })}
                            >
                                {mappings.map(m => (
                                    <option key={m._id} value={m._id}>{m.name} ({m.entityType})</option>
                                ))}
                            </Select>
                            {mappings.length === 0 && !loading && <small style={{ color: 'red' }}>No se encontraron mapeos disponibles.</small>}
                        </FormGroup>
                    ) : (
                        <FormGroup>
                            <Label>ID de la Entidad</Label>
                            <input
                                name="entityId"
                                style={{ padding: '12px', borderRadius: '12px', border: `1px solid ${props => props.theme.border}`, background: 'transparent', color: 'inherit' }}
                                placeholder="Ingrese el ID manual"
                                value={formData.entityId}
                                onChange={e => setFormData({ ...formData, entityId: e.target.value })}
                            />
                        </FormGroup>
                    )}

                    <FormGroup>
                        <Label><FaShieldAlt /> Permisos de Operación</Label>
                        <PermissionGrid>
                            {['read', 'increment', 'reset', 'all'].map(op => (
                                <CheckboxLabel key={op}>
                                    <input
                                        type="checkbox"
                                        checked={formData.allowedOperations.includes(op)}
                                        onChange={() => handleOpToggle(op)}
                                    />
                                    <span style={{ textTransform: 'capitalize' }}>
                                        {op === 'read' ? 'Lectura' : op === 'increment' ? 'Incremento' : op === 'reset' ? 'Reinicio' : 'Todo'}
                                    </span>
                                </CheckboxLabel>
                            ))}
                        </PermissionGrid>
                    </FormGroup>
                </Body>

                <div style={{ padding: '24px', borderTop: `1px solid ${props => props.theme.border}40`, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading}>Confirmar Vínculo</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
