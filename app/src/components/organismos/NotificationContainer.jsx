// src/components/organismos/NotificationContainer.jsx
import React from 'react';
import styled from 'styled-components';
import { useNotification } from '../../index';

const Container = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000; /* 🔄 Asegurar que esté sobre sidebar (z-index: 999) */
  pointer-events: none;

  /* 🔄 Ajustar para tu header */
  @media (max-width: 768px) {
    top: 80px; /* Debajo del header móvil */
  }

  @media (min-width: 769px) {
    top: 90px; /* Debajo del header desktop */
  }
`;

const Notification = styled.div`
  background: ${({ type }) => {
    const backgrounds = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    return backgrounds[type] || backgrounds.info;
  }};
  color: white;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 300px;
  max-width: 500px;
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

const Message = styled.div`
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  margin-left: 12px;
  padding: 0;
  opacity: 0.8;

  &:hover {
    opacity: 1;
  }
`;

const ActionButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  margin-left: 8px;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

export const NotificationContainer = () => {
  const { notifications, hideNotification } = useNotification();

  return (
    <Container>
      {notifications.map(notification => (
        <Notification key={notification.id} type={notification.type}>
          <Message>{notification.message}</Message>

          {notification.actionLabel && notification.onAction && (
            <ActionButton onClick={() => notification.onAction(notification.id)}>
              {notification.actionLabel}
            </ActionButton>
          )}

          <CloseButton onClick={() => hideNotification(notification.id)}>
            ×
          </CloseButton>
        </Notification>
      ))}
    </Container>
  );
};