import React from "react";
import styled from "styled-components";
import { FaTimes } from "react-icons/fa";
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <DetailRow>
                            <Label>Nivel</Label>
                            <StatusBadge status={log.level}>{log.level}</StatusBadge>
                        </DetailRow>
                        <DetailRow>
                            <Label>Fecha</Label>
                            <Value>{new Date(log.timestamp).toLocaleString()}</Value>
                        </DetailRow>
                    </div>

                    <DetailRow>
                        <Label>Fuente</Label>
                        <Value>{log.source || "Sistema Central"}</Value>
                    </DetailRow>

                    <DetailRow>
                        <Label>Mensaje</Label>
                        <Value style={{ fontWeight: 500 }}>{log.message}</Value>
                    </DetailRow>

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

                    {log.stack && (
                        <DetailRow>
                            <Label>Stack Trace</Label>
                            <CodeBlock style={{ color: ({ theme }) => theme.danger }}>
                                {log.stack}
                            </CodeBlock>
                        </DetailRow>
                    )}
                </Body>
            </Content>
        </Overlay>
    );
};
