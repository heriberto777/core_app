import React from "react";
import styled, { keyframes } from "styled-components";

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xxl};
  gap: ${({ theme }) => theme.spacing.md};
  min-height: ${({ $fullPage }) => ($fullPage ? "60vh" : "200px")};
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.border};
  border-top: 3px solid ${({ theme }) => theme.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Text = styled.div`
  color: ${({ theme }) => theme.textSecondary};
  font-size: ${({ theme }) => theme.fontsm};
  font-weight: 500;
  animation: ${pulse} 2s ease-in-out infinite;
`;

export const LoadingUI = ({ message = "Cargando...", fullPage = false }) => {
    return (
        <Container $fullPage={fullPage}>
            <Spinner />
            <Text>{message}</Text>
        </Container>
    );
};

export const Skeleton = styled.div`
  background: ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  width: ${({ width }) => width || "100%"};
  height: ${({ height }) => height || "20px"};
  animation: ${pulse} 1.5s ease-in-out infinite;
`;
