import React from "react";
import styled from "styled-components";
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 90%; max-width: 600px; max-height: 85vh;
  border-radius: 20px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 20px 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
`;

const Body = styled.div`
  padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;
`;

const SummaryGrid = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
`;

const SummaryCard = styled.div`
  padding: 16px; border-radius: 12px; border: 1px solid ${({ theme, $type }) =>
        $type === 'success' ? '#28a74540' : $type === 'error' ? '#dc354540' : theme.border};
  background: ${({ $type }) =>
        $type === 'success' ? '#28a74510' : $type === 'error' ? '#dc354510' : '#f8f9fa10'};
  text-align: center;
`;

const SummaryVal = styled.div`
  font-size: 24px; font-weight: 800; color: ${({ theme, $type }) =>
        $type === 'success' ? '#28a745' : $type === 'error' ? '#dc3545' : theme.text};
`;

const SummaryLabel = styled.div`
  font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${({ theme }) => theme.textSecondary};
`;

const ErrorList = styled.div`
  display: flex; flex-direction: column; gap: 10px;
`;

const ErrorItem = styled.div`
  padding: 12px; border-radius: 10px; background: ${({ theme }) => theme.bg2}40;
  border-left: 4px solid #dc3545; font-size: 13px;
`;

const formatErrorMessage = (errMsg, errorCode) => {
    if (errorCode === "NULL_VALUE_ERROR") return errMsg;
    if (errorCode === "TRUNCATION_ERROR") return errMsg;
    if (errorCode === "CONNECTION_ERROR") return "Error de conexión a la base de datos. Intente nuevamente.";
    if (errorCode === "SEVERE_CONNECTION_ERROR") return "Error crítico de conexión. Contacte al administrador.";

    if (errMsg.includes("Cannot insert the value NULL into column")) {
        const colMatch = errMsg.match(/column '([^']+)'/);
        return `Campo '${colMatch ? colMatch[1] : "?"}' obligatorio vacío en destino.`;
    }
    if (errMsg.includes("String or binary data would be truncated")) {
        const colMatch = errMsg.match(/column '([^']+)'/);
        return `Texto demasiado largo para '${colMatch ? colMatch[1] : "?"}'.`;
    }
    return errMsg;
};

export function ProcessingResultsModal({ isOpen, onClose, results }) {
    if (!isOpen || !results) return null;

    const { processed = 0, failed = 0, skipped = 0, errorDetails = [], details = [] } = results.data || {};

    // Normalizar errores de diferentes versiones de la API
    const errors = errorDetails.length > 0 ? errorDetails : (details || []).filter(d => !d.success);

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {failed === 0 ? <FaCheckCircle color="#28a745" size={24} /> : <FaExclamationCircle color="#ffc107" size={24} />}
                        <h3 style={{ margin: 0 }}>Procesamiento Finalizado</h3>
                    </div>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}><FaTimes /></Button>
                </Header>
                <Body>
                    <SummaryGrid>
                        <SummaryCard $type="success">
                            <SummaryVal $type="success">{processed}</SummaryVal>
                            <SummaryLabel>Procesados</SummaryLabel>
                        </SummaryCard>
                        <SummaryCard $type="error">
                            <SummaryVal $type="error">{failed}</SummaryVal>
                            <SummaryLabel>Fallidos</SummaryLabel>
                        </SummaryCard>
                        <SummaryCard $type="info">
                            <SummaryVal $type="info">{skipped}</SummaryVal>
                            <SummaryLabel>Omitidos</SummaryLabel>
                        </SummaryCard>
                    </SummaryGrid>

                    {errors.length > 0 && (
                        <div>
                            <Label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <FaExclamationCircle color="#dc3545" /> Detalles de Errores
                            </Label>
                            <ErrorList>
                                {errors.map((err, i) => (
                                    <ErrorItem key={i}>
                                        <strong>Doc: {err.documentId}</strong> — {formatErrorMessage(err.error || err.message || "Error desconocido", err.errorCode)}
                                    </ErrorItem>
                                ))}
                            </ErrorList>
                        </div>
                    )}

                    {failed === 0 && processed > 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#28a745' }}>
                            <FaCheckCircle size={48} style={{ marginBottom: '16px' }} />
                            <p>Todos los documentos seleccionados han sido procesados correctamente en el ERP.</p>
                        </div>
                    )}
                </Body>
                <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" onClick={onClose}>Entendido</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}

const Label = styled.div`
  font-size: 14px; font-weight: 700; color: ${({ theme }) => theme.text};
`;
