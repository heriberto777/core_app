import React, { useState } from "react";
import styled from "styled-components";
import { FaTimes, FaChevronDown, FaChevronRight } from "react-icons/fa";
import { StatusBadge } from "../index";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const Content = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  border-radius: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.border};
`;

const Header = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: ${({ theme }) => theme.bg2};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  color: ${({ theme }) => theme.text};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.textSecondary};
  &:hover { color: ${({ theme }) => theme.danger}; }
`;

const Body = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const DetailRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Value = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  line-height: 1.5;
`;

const CodeBlock = styled.pre`
  background: ${({ theme }) => theme.bg2};
  padding: 12px;
  border-radius: 8px;
  font-family: 'Fira Code', 'Roboto Mono', monospace;
  font-size: 12px;
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.text};
`;

const CollapsibleSectionWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  overflow: hidden;
`;

const CollapsibleHeader = styled.div`
  background: ${({ theme }) => theme.bg2};
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const CollapsibleTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.text};
  flex: 1;
`;

const CollapsibleContent = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.border};
`;

const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <CollapsibleSectionWrapper>
      <CollapsibleHeader onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <FaChevronDown size={14} color="#888" /> : <FaChevronRight size={14} color="#888" />}
        <CollapsibleTitle>{title}</CollapsibleTitle>
      </CollapsibleHeader>
      {isOpen && <CollapsibleContent>{children}</CollapsibleContent>}
    </CollapsibleSectionWrapper>
  );
};

export const LogDetailModal = ({ log, onClose }) => {
    if (!log) return null;

    return (
        <Overlay onClick={onClose}>
            <Content onClick={(e) => e.stopPropagation()}>
                <Header>
                    <Title>Detalle del Registro</Title>
                    <CloseButton onClick={onClose}><FaTimes /></CloseButton>
                </Header>
                <Body>
                    {/* Sección 1: Información básica */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                        <DetailRow>
                            <Label>Nivel</Label>
                            <StatusBadge status={log.level}>{log.level}</StatusBadge>
                        </DetailRow>
                        <DetailRow>
                            <Label>Fecha</Label>
                            <Value>{new Date(log.timestamp).toLocaleString()}</Value>
                        </DetailRow>
                        <DetailRow>
                            <Label>Fuente</Label>
                            <Value>{log.source || "Sistema Central"}</Value>
                        </DetailRow>
                    </div>

                    {/* Sección 2: Información operacional */}
                    {(log.operationType || log.entityType) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                            {log.operationType && (
                                <DetailRow>
                                    <Label>Tipo de Operación</Label>
                                    <Value style={{ color: '#3b82f6', fontWeight: 600 }}>{log.operationType}</Value>
                                </DetailRow>
                            )}
                            {log.entityType && (
                                <DetailRow>
                                    <Label>Tipo de Entidad</Label>
                                    <Value style={{ color: '#22c55e', fontWeight: 600 }}>{log.entityType}</Value>
                                </DetailRow>
                            )}
                            {log.entityId && (
                                <DetailRow>
                                    <Label>ID de Entidad</Label>
                                    <Value>{log.entityId}</Value>
                                </DetailRow>
                            )}
                            {log.affectedRecords > 0 && (
                                <DetailRow>
                                    <Label>Registros Afectados</Label>
                                    <Value style={{ fontWeight: 600 }}>{log.affectedRecords}</Value>
                                </DetailRow>
                            )}
                        </div>
                    )}

                    {/* Sección 3: Rendimiento */}
                    {(log.durationMs > 0 || log.durationMs !== undefined) && (
                        <DetailRow>
                            <Label>Duración</Label>
                            <Value style={{ 
                                color: log.durationMs < 1000 ? '#22c55e' : log.durationMs < 5000 ? '#eab308' : '#ef4444',
                                fontWeight: 600 
                            }}>
                                {log.durationMs} ms
                                {log.durationMs < 1000 && " ✅"}
                                {log.durationMs >= 1000 && log.durationMs < 5000 && " ⚠️"}
                                {log.durationMs >= 5000 && " 🔴"}
                            </Value>
                        </DetailRow>
                    )}

                    {/* Sección 4: Mensaje */}
                    <DetailRow>
                        <Label>Mensaje</Label>
                        <Value style={{ fontWeight: 500, fontSize: '15px' }}>{log.message}</Value>
                    </DetailRow>

                    {/* Sección 5: Contexto HTTP */}
                    {(log.httpMethod || log.httpPath) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                            {log.httpMethod && (
                                <DetailRow>
                                    <Label>Método HTTP</Label>
                                    <Value style={{ fontWeight: 600, color: '#8b5cf6' }}>{log.httpMethod}</Value>
                                </DetailRow>
                            )}
                            {log.httpPath && (
                                <DetailRow>
                                    <Label>Ruta HTTP</Label>
                                    <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.httpPath}</Value>
                                </DetailRow>
                            )}
                            {log.httpStatusCode && (
                                <DetailRow>
                                    <Label>Status Code</Label>
                                    <Value style={{ 
                                        fontWeight: 600,
                                        color: log.httpStatusCode < 400 ? '#22c55e' : '#ef4444'
                                    }}>
                                        {log.httpStatusCode}
                                    </Value>
                                </DetailRow>
                            )}
                        </div>
                    )}

                    {/* Sección 6: Error */}
                    {(log.errorCode || log.error) && (
                        <DetailRow>
                            <Label>Código de Error</Label>
                            <Value style={{ color: '#ef4444', fontWeight: 600 }}>{log.errorCode || log.error}</Value>
                        </DetailRow>
                    )}

                    {/* Sección 7: Query SQL */}
                    {log.query && (
                        <DetailRow>
                            <Label>Query SQL</Label>
                            <CodeBlock>{log.query}</CodeBlock>
                        </DetailRow>
                    )}

                    {/* Sección 8: Context Details - Collapsible */}
                    {(log.mappingId || log.mappingName || log.fieldName || log.tableSource || log.tableTarget || log.stepName) && (
                        <CollapsibleSection title="Detalles del Mapping" defaultOpen={true}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {log.mappingId && (
                                    <DetailRow>
                                        <Label>Mapping ID</Label>
                                        <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.mappingId}</Value>
                                    </DetailRow>
                                )}
                                {log.mappingName && (
                                    <DetailRow>
                                        <Label>Mapping</Label>
                                        <Value style={{ fontWeight: 600, color: '#3b82f6' }}>{log.mappingName}</Value>
                                    </DetailRow>
                                )}
                                {log.fieldName && (
                                    <DetailRow>
                                        <Label>Campo</Label>
                                        <Value style={{ fontWeight: 500 }}>{log.fieldName}</Value>
                                    </DetailRow>
                                )}
                                {log.stepName && (
                                    <DetailRow>
                                        <Label>Paso</Label>
                                        <Value style={{ color: '#f59e0b' }}>{log.stepName}</Value>
                                    </DetailRow>
                                )}
                                {log.tableSource && (
                                    <DetailRow>
                                        <Label>Tabla Origen</Label>
                                        <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.tableSource}</Value>
                                    </DetailRow>
                                )}
                                {log.tableTarget && (
                                    <DetailRow>
                                        <Label>Tabla Destino</Label>
                                        <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.tableTarget}</Value>
                                    </DetailRow>
                                )}
                                {log.documentId && (
                                    <DetailRow>
                                        <Label>Document ID</Label>
                                        <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.documentId}</Value>
                                    </DetailRow>
                                )}
                                {log.transactionId && (
                                    <DetailRow>
                                        <Label>Transaction ID</Label>
                                        <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.transactionId}</Value>
                                    </DetailRow>
                                )}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Sección 9: Failed Value - Collapsible */}
                    {(log.failedValue !== undefined && log.failedValue !== null) && (
                        <CollapsibleSection title="Valor que Causó el Error" defaultOpen={true}>
                            <DetailRow>
                                <CodeBlock style={{ color: '#f59e0b' }}>
                                    {typeof log.failedValue === "object"
                                        ? JSON.stringify(log.failedValue, null, 2)
                                        : String(log.failedValue)}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}

                    {/* Sección 10: Error Details - Collapsible */}
                    {log.errorDetails && (
                        <CollapsibleSection title="Detalles del Error" defaultOpen={true}>
                            <DetailRow>
                                <CodeBlock>
                                    {typeof log.errorDetails === "object"
                                        ? JSON.stringify(log.errorDetails, null, 2)
                                        : log.errorDetails}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}

                    {/* Sección 11: Metadata */}
                    {log.metadata && (
                        <DetailRow>
                            <Label>Metadata</Label>
                            <CodeBlock>
                                {typeof log.metadata === "object"
                                    ? JSON.stringify(log.metadata, null, 2)
                                    : log.metadata}
                            </CodeBlock>
                        </DetailRow>
                    )}

                    {/* Sección 12: Original Stack Trace - Collapsible */}
                    {log.originalStack && (
                        <CollapsibleSection title="Stack Trace Original" defaultOpen={false}>
                            <DetailRow>
                                <CodeBlock style={{ color: '#ef4444' }}>
                                    {log.originalStack}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}
                </Body>
            </Content>
        </Overlay>
    );
};
