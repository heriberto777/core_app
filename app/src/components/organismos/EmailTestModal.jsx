import React, { useState } from "react";
import styled from "styled-components";
import { FaVial, FaPaperPlane, FaTimes, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { Modal, Button } from "../../index";

const Content = styled.div` display: flex; flex-direction: column; gap: 24px; padding: 24px; `;

const InfoBox = styled.div`
  padding: 16px; background: ${({ theme }) => theme.primary}08; border: 1px dashed ${({ theme }) => theme.primary}40;
  border-radius: 16px; font-size: 13px; color: ${({ theme }) => theme.textSecondary}; line-height: 1.5;
`;

const Form = styled.div` display: flex; flex-direction: column; gap: 12px; `;

const Label = styled.label` font-size: 12px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; text-transform: uppercase; `;

const InputWrapper = styled.div`
  display: flex; align-items: center; gap: 12px; background: ${({ theme }) => theme.bg2}10;
  border: 1px solid ${({ theme }) => theme.border}; border-radius: 12px; padding: 0 16px;
`;

const Input = styled.input`
  flex: 1; background: transparent; border: none; padding: 12px 0; color: ${({ theme }) => theme.text};
  font-size: 14px; font-weight: 600; &:focus { outline: none; }
`;

const ResultMessage = styled.div`
  padding: 16px; border-radius: 16px; display: flex; align-items: flex-start; gap: 12px;
  background: ${({ $success }) => $success ? "#10b98115" : "#ef444415"};
  border: 1px solid ${({ $success }) => $success ? "#10b98140" : "#ef444440"};
  color: ${({ $success }) => $success ? "#10b981" : "#ef4444"};
  font-size: 13px; font-weight: 600;
`;

export function EmailTestModal({ isOpen, onClose, config, onSendTest }) {
    const [testEmail, setTestEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!testEmail) return;
        setLoading(true);
        setResult(null);
        try {
            const success = await onSendTest(config._id, testEmail);
            if (success) {
                setResult({ success: true, message: `Correo de prueba enviado con éxito a ${testEmail}. Por favor revisa la bandeja de entrada y la carpeta de spam.` });
            } else {
                setResult({ success: false, message: "El servidor SMTP rechazó la conexión o las credenciales son inválidas." });
            }
        } catch (err) {
            setResult({ success: false, message: err.message || "Error inesperado al intentar enviar el correo de prueba." });
        } finally {
            setLoading(false);
        }
    };

    const resetAndClose = () => {
        setTestEmail("");
        setResult(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={resetAndClose} width="500px">
            <Content>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FaVial color="var(--primary)" /> Probar Configuración
                </h2>

                <InfoBox>
                    Estás probando la configuración <strong>{config?.name}</strong>. Se enviará un correo técnico para validar que el host, puerto y credenciales funcionen correctamente.
                </InfoBox>

                <Form>
                    <Label>Email de Destino</Label>
                    <InputWrapper>
                        <FaPaperPlane opacity={0.5} />
                        <Input
                            type="email"
                            placeholder="correo@ejemplo.com"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            disabled={loading}
                        />
                    </InputWrapper>
                </Form>

                {result && (
                    <ResultMessage $success={result.success}>
                        {result.success ? <FaCheckCircle size={18} /> : <FaExclamationTriangle size={18} />}
                        <span>{result.message}</span>
                    </ResultMessage>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button variant="ghost" onClick={resetAndClose} disabled={loading}>Cerrar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSend}
                        loading={loading}
                        disabled={!testEmail || loading}
                        icon={<FaPaperPlane />}
                    >
                        Enviar Prueba
                    </Button>
                </div>
            </Content>
        </Modal>
    );
}
