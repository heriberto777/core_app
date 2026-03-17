import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaUser, FaEnvelope, FaBell, FaCheckCircle, FaTimesCircle, FaSave } from "react-icons/fa";
import { Button } from "../index";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Modal = styled.div`
  background: white;
  width: 90%;
  max-width: 550px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  padding: 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
`;

const Content = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 70vh;
  overflow-y: auto;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  svg {
    position: absolute;
    left: 12px;
    color: #94a3b8;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 12px 12px 40px;
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

const SectionTitle = styled.div`
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;

  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }
`;

const CheckboxGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
`;

const CheckItem = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f8fafc;
  }

  ${props => props.active && `
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  `}
`;

const CheckInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const CheckLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
`;

const CheckDesc = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const Switch = styled.input`
  width: 40px;
  height: 20px;
  cursor: pointer;
`;

const Footer = styled.div`
  padding: 20px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

export const RecipientFormModal = ({ isOpen, onClose, onSave, editingRecipient = null, loading }) => {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        notificationTypes: {
            traspaso: true,
            transferencias: true,
            erroresCriticos: true
        },
        isSend: true
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (editingRecipient) {
            setFormData({
                name: editingRecipient.name || "",
                email: editingRecipient.email || "",
                notificationTypes: {
                    traspaso: editingRecipient.notificationTypes?.traspaso ?? true,
                    transferencias: editingRecipient.notificationTypes?.transferencias ?? true,
                    erroresCriticos: editingRecipient.notificationTypes?.erroresCriticos ?? true
                },
                isSend: editingRecipient.isSend ?? true
            });
        } else {
            setFormData({
                name: "",
                email: "",
                notificationTypes: {
                    traspaso: true,
                    transferencias: true,
                    erroresCriticos: true
                },
                isSend: true
            });
        }
    }, [editingRecipient, isOpen]);

    if (!isOpen) return null;

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = "El nombre es obligatorio";
        if (!formData.email.trim()) newErrors.email = "El correo es obligatorio";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "Formato de correo inválido";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSave(formData);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={e => e.stopPropagation()}>
                <Header>
                    <Title>{editingRecipient ? "Editar Destinatario" : "Nuevo Destinatario"}</Title>
                    <Button variant="ghost" size="small" onClick={onClose}><FaTimesCircle /></Button>
                </Header>

                <Content>
                    <FormGroup>
                        <Label><FaUser /> Nombre Completo</Label>
                        <InputWrapper>
                            <FaUser />
                            <Input
                                placeholder="Ej: Juan Pérez"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </InputWrapper>
                        {errors.name && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.name}</span>}
                    </FormGroup>

                    <FormGroup>
                        <Label><FaEnvelope /> Correo Electrónico</Label>
                        <InputWrapper>
                            <FaEnvelope />
                            <Input
                                placeholder="juan@ejemplo.com"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </InputWrapper>
                        {errors.email && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.email}</span>}
                    </FormGroup>

                    <SectionTitle><FaBell /> Preferencias de Notificación</SectionTitle>

                    <CheckboxGrid>
                        <CheckItem active={formData.notificationTypes.traspaso}>
                            <CheckInfo>
                                <CheckLabel>Traspasos Operativos</CheckLabel>
                                <CheckDesc>Aliertas sobre cargas procesadas y auditorías</CheckDesc>
                            </CheckInfo>
                            <input
                                type="checkbox"
                                checked={formData.notificationTypes.traspaso}
                                onChange={e => setFormData({
                                    ...formData,
                                    notificationTypes: { ...formData.notificationTypes, traspaso: e.target.checked }
                                })}
                            />
                        </CheckItem>

                        <CheckItem active={formData.notificationTypes.transferencias}>
                            <CheckInfo>
                                <CheckLabel>Transferencias Directas</CheckLabel>
                                <CheckDesc>Notificaciones de movimientos entre bodegas</CheckDesc>
                            </CheckInfo>
                            <input
                                type="checkbox"
                                checked={formData.notificationTypes.transferencias}
                                onChange={e => setFormData({
                                    ...formData,
                                    notificationTypes: { ...formData.notificationTypes, transferencias: e.target.checked }
                                })}
                            />
                        </CheckItem>

                        <CheckItem active={formData.notificationTypes.erroresCriticos}>
                            <CheckInfo>
                                <CheckLabel>Errores Críticos</CheckLabel>
                                <CheckDesc>Alertas inmediatas ante fallos en el sistema</CheckDesc>
                            </CheckInfo>
                            <input
                                type="checkbox"
                                checked={formData.notificationTypes.erroresCriticos}
                                onChange={e => setFormData({
                                    ...formData,
                                    notificationTypes: { ...formData.notificationTypes, erroresCriticos: e.target.checked }
                                })}
                            />
                        </CheckItem>
                    </CheckboxGrid>
                </Content>

                <Footer>
                    <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave /> {editingRecipient ? "Actualizar" : "Guardar"}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};
