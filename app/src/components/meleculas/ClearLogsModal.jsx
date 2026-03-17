import React from "react";
import styled from "styled-components";
import { FaTrashAlt, FaTimes, FaExclamationTriangle } from "react-icons/fa";

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
  max-width: 500px;
  border-radius: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.border};
`;

const Header = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: ${({ theme, $variant }) => $variant === 'danger' ? `${theme.danger}10` : theme.bg2};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  color: ${({ theme, $variant }) => $variant === 'danger' ? theme.danger : theme.text};
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.textSecondary};
`;

const Body = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const WarningBox = styled.div`
  background: ${({ theme }) => theme.danger}15;
  color: ${({ theme }) => theme.danger};
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  gap: 10px;
  border: 1px solid ${({ theme }) => theme.danger}30;
  line-height: 1.4;

  svg { flex-shrink: 0; font-size: 16px; margin-top: 2px; }
`;

const OptionsGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.text};
`;

const Select = styled.select`
  padding: 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text};
  font-weight: 500;
  outline: none;

  &:focus { border-color: ${({ theme }) => theme.danger}; }
`;

const Footer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: ${({ theme }) => theme.bg2};
`;

const Button = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;

  ${({ variant, theme }) => variant === 'danger' ? `
    background: ${theme.danger};
    color: white;
    &:hover { filter: brightness(1.2); }
  ` : `
    background: ${theme.border};
    color: ${theme.text};
    &:hover { background: ${theme.secondary}20; }
  `}
`;

export const ClearLogsModal = ({ isOpen, onClose, onConfirm, value, onChange }) => {
    if (!isOpen) return null;

    return (
        <Overlay onClick={onClose}>
            <Content onClick={(e) => e.stopPropagation()}>
                <Header $variant="danger">
                    <Title $variant="danger"><FaTrashAlt /> Limpiar Historial</Title>
                    <CloseButton onClick={onClose}><FaTimes /></CloseButton>
                </Header>
                <Body>
                    <WarningBox>
                        <FaExclamationTriangle />
                        <span>Esta acción es irreversible. Se eliminarán permanentemente los registros del servidor.</span>
                    </WarningBox>

                    <OptionsGroup>
                        <Label>Eliminar logs más antiguos que:</Label>
                        <Select value={value} onChange={(e) => onChange(parseInt(e.target.value))}>
                            <option value={1}>1 día</option>
                            <option value={7}>7 días (1 semana)</option>
                            <option value={30}>30 días (1 mes)</option>
                            <option value={90}>90 días (3 meses)</option>
                            <option value={0}>Todos los registros (Limpieza total)</option>
                        </Select>
                    </OptionsGroup>
                </Body>
                <Footer>
                    <Button onClick={onClose}>Cancelar</Button>
                    <Button variant="danger" onClick={onConfirm}>Confirmar Limpieza</Button>
                </Footer>
            </Content>
        </Overlay>
    );
};
