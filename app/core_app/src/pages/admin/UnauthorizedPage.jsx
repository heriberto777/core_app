import React from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "../../index";
import {
  FaLock,
  FaHome,
  FaArrowLeft,
  FaExclamationTriangle,
} from "react-icons/fa";

const UnauthorizedPage = () => {
  const { user } = usePermissions();
  const navigate = useNavigate();

  return (
    <Container>
      <Content>
        <IconContainer>
          <FaLock />
        </IconContainer>

        <Title>Acceso Denegado</Title>

        <Message>
          No tienes permisos suficientes para acceder a esta página.
        </Message>

        {user && (
          <UserInfo>
            <InfoItem>
              <strong>Usuario:</strong> {user.name} {user.lastname}
            </InfoItem>
            <InfoItem>
              <strong>Email:</strong> {user.email}
            </InfoItem>
            <InfoItem>
              <strong>Roles:</strong>{" "}
              {user.roles?.length > 0
                ? user.roles
                    .map((role) => role.displayName || role.name)
                    .join(", ")
                : user.role?.join(", ") || "Sin roles asignados"}
            </InfoItem>
            <InfoItem>
              <strong>Admin:</strong> {user.isAdmin ? "Sí" : "No"}
            </InfoItem>
          </UserInfo>
        )}

        <ButtonContainer>
          <ActionButton $primary onClick={() => navigate("/dashboard")}>
            <FaHome />
            Ir al Dashboard
          </ActionButton>

          <ActionButton onClick={() => window.history.back()}>
            <FaArrowLeft />
            Volver
          </ActionButton>
        </ButtonContainer>

        <HelpText>
          <FaExclamationTriangle />
          Si crees que esto es un error, contacta con tu administrador del
          sistema.
        </HelpText>
      </Content>
    </Container>
  );
};

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.bg};
  padding: 20px;
`;

const Content = styled.div`
  text-align: center;
  max-width: 500px;
  width: 100%;
`;

const IconContainer = styled.div`
  font-size: 4rem;
  color: ${({ theme }) => theme.error || "#dc3545"};
  margin-bottom: 20px;
`;

const Title = styled.h1`
  font-size: 2rem;
  color: ${({ theme }) => theme.error || "#dc3545"};
  margin-bottom: 15px;
`;

const Message = styled.p`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.text};
  margin-bottom: 25px;
  line-height: 1.5;
`;

const UserInfo = styled.div`
  background-color: ${({ theme }) => theme.cardBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  text-align: left;
`;

const InfoItem = styled.div`
  margin-bottom: 8px;
  color: ${({ theme }) => theme.text};

  &:last-child {
    margin-bottom: 0;
  }

  strong {
    color: ${({ theme }) => theme.title};
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-bottom: 25px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  background-color: ${({ $primary, theme }) =>
    $primary ? theme.primary : theme.secondary};
  color: white;

  &:hover {
    background-color: ${({ $primary, theme }) =>
      $primary ? theme.primaryHover : theme.secondaryHover};
    transform: translateY(-2px);
  }
`;

const HelpText = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary};

  svg {
    color: ${({ theme }) => theme.warning || "#ffc107"};
  }
`;

export default UnauthorizedPage;
