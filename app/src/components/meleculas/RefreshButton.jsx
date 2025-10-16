import React from "react";
import styled from "styled-components";
import { FaSync } from "react-icons/fa";
import { Spinner } from "../../index"; // Usando tu componente Spinner existente

// Versión mejorada del botón de refresco
export const RefreshButton = ({ onClick, refreshing, label = "Refrescar" }) => {
  return (
    <StyledRefreshButton onClick={onClick} disabled={refreshing}>
      {refreshing ? (
        <>
          <SpinnerWrapper>
            <Spinner size="small" color="#ffffff" />
          </SpinnerWrapper>
          <span>Actualizando...</span>
        </>
      ) : (
        <>
          <FaSync />
          <span>{label}</span>
        </>
      )}
    </StyledRefreshButton>
  );
};

// Estilos para el botón
const StyledRefreshButton = styled.button`
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #138496;
  }

  &:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const SpinnerWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
`;
