import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSave, FaTimes, FaServer, FaEnvelope, FaKey, FaShieldAlt } from "react-icons/fa";
import { Modal, Button } from "../../index";

const Form = styled.form` 
  display: flex; 
  flex-direction: column; 
  gap: 24px; 
  padding: 32px; 
  overflow-x: hidden;
`;

const SectionTitle = styled.h4`
  margin: 0; font-size: 13px; font-weight: 800; color: ${({ theme }) => theme.primary};
  text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px;
  &::after { content: ''; flex: 1; height: 1px; background: ${({ theme }) => theme.border}40; }
`;

const Grid = styled.div` 
  display: grid; 
  grid-template-columns: repeat(2, 1fr); 
  gap: 20px; 
  width: 100%;
  @media (max-width: 600px) { grid-template-columns: 1fr; } 
`;

const FormGroup = styled.div` display: flex; flex-direction: column; gap: 8px; `;

const Label = styled.label` font-size: 11px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; display: flex; align-items: center; gap: 4px; span { color: #ef4444; } `;

const InputWrapper = styled.div` display: flex; align-items: center; gap: 12px; background: ${({ theme }) => theme.bg2}10; border: 1px solid ${({ theme }) => theme.border}; border-radius: 12px; padding: 0 16px; transition: all 0.2s; &:focus-within { border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; } `;

const Icon = styled.div` color: ${({ theme }) => theme.textSecondary}; opacity: 0.5; font-size: 14px; `;

const Input = styled.input` flex: 1; background: transparent; border: none; padding: 12px 0; color: ${({ theme }) => theme.text}; font-size: 14px; font-weight: 600; &:focus { outline: none; } &::placeholder { color: ${({ theme }) => theme.textSecondary}80; } `;

const CheckGroup = styled.div` display: flex; flex-direction: column; gap: 12px; padding: 16px; background: ${({ theme }) => theme.bg2}08; border-radius: 16px; border: 1px dashed ${({ theme }) => theme.border}; `;

const CheckItem = styled.label` display: flex; align-items: center; gap: 10px; cursor: pointer; input { width: 18px; height: 18px; accent-color: ${({ theme }) => theme.primary}; } span { font-size: 14px; font-weight: 700; color: ${({ theme }) => theme.text}; } `;

export function EmailConfigFormModal({ isOpen, onClose, config, onSave }) {
    const [formData, setFormData] = useState({
        name: "",
        host: "",
        port: 587,
        secure: false,
        auth: { user: "", pass: "" },
        from: "",
        isDefault: false,
        isActive: true
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (config) {
            setFormData({
                ...config,
                auth: { ...config.auth, pass: "" } // Don't show password for security
            });
        } else {
            setFormData({
                name: "",
                host: "",
                port: 587,
                secure: false,
                auth: { user: "", pass: "" },
                from: "",
                isDefault: false,
                isActive: true
            });
        }
    }, [config, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes("auth.")) {
            const field = name.split(".")[1];
            setFormData(prev => ({ ...prev, auth: { ...prev.auth, [field]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.host || !formData.port || !formData.auth.user) return;

        const finalData = { ...formData };
        if (config && !finalData.auth.pass) {
            delete finalData.auth.pass; // Don't send empty pass if editing
        }

        setLoading(true);
        try {
            await onSave(finalData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <Form onSubmit={handleSubmit}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>{config ? "Editar Configuración SMTP" : "Nueva Configuración SMTP"}</h2>

                <SectionTitle><FaServer /> Servidor de Salida</SectionTitle>
                <Grid>
                    <FormGroup>
                        <Label>Nombre de la Cuenta <span>*</span></Label>
                        <InputWrapper><Icon><FaEnvelope /></Icon><Input name="name" value={formData.name} onChange={handleChange} placeholder="Ej: Gmail Notificaciones" required /></InputWrapper>
                    </FormGroup>
                    <FormGroup>
                        <Label>Servidor SMTP <span>*</span></Label>
                        <InputWrapper><Icon><FaServer /></Icon><Input name="host" value={formData.host} onChange={handleChange} placeholder="Ej: smtp.gmail.com" required /></InputWrapper>
                    </FormGroup>
                    <FormGroup>
                        <Label>Puerto <span>*</span></Label>
                        <InputWrapper><Icon><FaShieldAlt /></Icon><Input type="number" name="port" value={formData.port} onChange={handleChange} placeholder="587" required /></InputWrapper>
                    </FormGroup>
                    <FormGroup>
                        <Label>Remitente (From) <span>*</span></Label>
                        <InputWrapper><Icon><FaEnvelope /></Icon><Input name="from" value={formData.from} onChange={handleChange} placeholder='"Nombre" <email@dominio.com>' required /></InputWrapper>
                    </FormGroup>
                </Grid>

                <SectionTitle><FaKey /> Autenticación</SectionTitle>
                <Grid>
                    <FormGroup>
                        <Label>Usuario / Email <span>*</span></Label>
                        <InputWrapper><Icon><FaEnvelope /></Icon><Input type="email" name="auth.user" value={formData.auth.user} onChange={handleChange} placeholder="email@dominio.com" required /></InputWrapper>
                    </FormGroup>
                    <FormGroup>
                        <Label>Contraseña {config ? "(Mantener vacía)" : " * "}</Label>
                        <InputWrapper><Icon><FaKey /></Icon><Input type="password" name="auth.pass" value={formData.auth.pass} onChange={handleChange} placeholder="••••••••" required={!config} /></InputWrapper>
                    </FormGroup>
                </Grid>

                <CheckGroup>
                    <CheckItem><input type="checkbox" name="secure" checked={formData.secure} onChange={handleChange} /> <span>Usar conexión segura (SSL/TLS)</span></CheckItem>
                    {(!config || !config.isDefault) && (
                        <CheckItem><input type="checkbox" name="isDefault" checked={formData.isDefault} onChange={handleChange} /> <span>Establecer como cuenta predeterminada</span></CheckItem>
                    )}
                    <CheckItem><input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} /> <span>Activar configuración de inmediato</span></CheckItem>
                </CheckGroup>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" type="submit" icon={<FaSave />} loading={loading}>{config ? "Actualizar Cuenta" : "Guardar Cuenta"}</Button>
                </div>
            </Form>
        </Modal>
    );
}
