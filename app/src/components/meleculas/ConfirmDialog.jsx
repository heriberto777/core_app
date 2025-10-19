// src/components/moleculas/ConfirmDialog.jsx
import React from "react";
import styled from "styled-components";
import {
  FaExclamationTriangle,
  FaQuestion,
  FaInfo,
  FaTimes,
} from "react-icons/fa";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001; /* 🔄 Sobre las notificaciones */
  padding: 20px;
  backdrop-filter: blur(2px);
`;

const Dialog = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  animation: slideIn 0.2s ease-out;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const Header = styled.div`
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .icon {
    font-size: 20px;

    &.warning {
      color: #f59e0b;
    }
    &.danger {
      color: #ef4444;
    }
    &.info {
      color: #3b82f6;
    }
    &.primary {
      color: #6366f1;
    }
    &.success {
      color: #10b981;
    }
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #111827;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

const Body = styled.div`
  padding: 16px 24px 20px;

  p {
    margin: 0;
    color: #374151;
    line-height: 1.5;
    white-space: pre-line;
  }

  .details {
    margin-top: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 6px;
    border-left: 3px solid #d1d5db;
    font-size: 14px;
    color: #6b7280;
  }
`;

const Footer = styled.div`
  padding: 16px 24px 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  border-top: 1px solid #e5e7eb;

  @media (max-width: 480px) {
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;
  justify-content: center;

  ${({ variant = "secondary" }) => {
    const variants = {
      primary: `
        background: #3b82f6;
        color: white;
        &:hover { background: #2563eb; }
        &:focus { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
      `,
      secondary: `
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        &:hover { background: #e5e7eb; }
        &:focus { box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1); }
      `,
      danger: `
        background: #ef4444;
        color: white;
        &:hover { background: #dc2626; }
        &:focus { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1); }
      `,
      warning: `
        background: #f59e0b;
        color: white;
        &:hover { background: #d97706; }
        &:focus { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1); }
      `,
      success: `
        background: #10b981;
        color: white;
        &:hover { background: #059669; }
        &:focus { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1); }
      `,
    };
    return variants[variant];
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ loading }) =>
    loading &&
    `
    pointer-events: none;
    opacity: 0.7;

    &:before {
      content: "";
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `}
`;

export const ConfirmDialog = ({
  show = false,
  title = "Confirmar acción",
  message = "¿Estás seguro de continuar?",
  details = null,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "primary",
  onConfirm,
  onCancel,
  loading = false,
  showCloseButton = true,
}) => {
  if (!show) return null;

  const getIcon = () => {
    switch (variant) {
      case "warning":
        return <FaExclamationTriangle className="icon warning" />;
      case "danger":
        return <FaExclamationTriangle className="icon danger" />;
      case "info":
        return <FaInfo className="icon info" />;
      case "success":
        return <FaQuestion className="icon success" />;
      default:
        return <FaQuestion className="icon primary" />;
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && !loading) {
      onCancel?.();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <Dialog role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <Header>
          <div className="header-content">
            {getIcon()}
            <h3 id="dialog-title">{title}</h3>
          </div>
          {showCloseButton && (
            <CloseButton
              onClick={onCancel}
              disabled={loading}
              aria-label="Cerrar"
            >
              <FaTimes />
            </CloseButton>
          )}
        </Header>

        <Body>
          <p>{message}</p>
          {details && <div className="details">{details}</div>}
        </Body>

        <Footer>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>

          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </Footer>
      </Dialog>
    </Overlay>
  );
};
