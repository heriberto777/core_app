import React from "react";
import styled from "styled-components";
import { Device } from "../../styles/breakpoints";

/**
 * Componentes UI reutilizables para toda la aplicación
 * Estos componentes mantienen la coherencia visual en todos los módulos
 */

// Contenedores

export const Card = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border-left: 4px solid
    ${(props) =>
      props.variant === "danger"
        ? "#dc3545"
        : props.variant === "warning"
        ? "#ffc107"
        : props.variant === "info"
        ? "#17a2b8"
        : props.variant === "success"
        ? "#28a745"
        : props.accent
        ? props.accent
        : props.theme.primary || "#007bff"};
  transition: all 0.2s;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};

  &:hover {
    box-shadow: ${(props) =>
      props.interactive
        ? "0 6px 12px rgba(0, 0, 0, 0.15)"
        : "0 4px 6px rgba(0, 0, 0, 0.1)"};
    transform: ${(props) => (props.interactive ? "translateY(-2px)" : "none")};
  }
`;

export const CardHeader = styled.div`
  padding: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => theme.cardHeaderBg || "#f8f9fa"};
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-size: ${(props) => props.size || "16px"};
  font-weight: 600;
  color: ${({ theme }) => theme.title || theme.text};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 10px;
`;

export const CardContent = styled.div`
  padding: 15px;
  flex: 1;
`;

export const CardFooter = styled.div`
  padding: 15px;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  background-color: ${({ theme }) => theme.cardFooterBg || "#f8f9fa"};
  display: flex;
  justify-content: ${(props) => props.align || "flex-end"};
  gap: 8px;
  flex-wrap: wrap;
`;

export const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(${(props) => props.columns || 2}, 1fr);
  gap: ${(props) => props.gap || "20px"};

  @media (max-width: 992px) {
    grid-template-columns: ${(props) =>
      props.responsiveColumns?.lg ||
      (props.columns > 2 ? "repeat(2, 1fr)" : "1fr")};
  }

  @media (max-width: 768px) {
    grid-template-columns: ${(props) => props.responsiveColumns?.md || "1fr"};
  }
`;

// Botones y Acciones

export const Button = styled.button`
  background-color: ${(props) => {
    if (props.variant === "primary") return props.theme.primary || "#007bff";
    if (props.variant === "secondary")
      return props.theme.secondary || "#6c757d";
    if (props.variant === "success") return props.theme.success || "#28a745";
    if (props.variant === "danger") return props.theme.danger || "#dc3545";
    if (props.variant === "warning") return props.theme.warning || "#ffc107";
    if (props.variant === "info") return props.theme.info || "#17a2b8";
    return props.theme.primary || "#007bff";
  }};
  color: ${(props) => (props.variant === "warning" ? "#212529" : "white")};
  border: none;
  border-radius: 4px;
  padding: ${(props) => (props.size === "sm" ? "6px 10px" : "10px 15px")};
  font-size: ${(props) => (props.size === "sm" ? "12px" : "14px")};
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.3s;
  width: ${(props) => (props.fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    filter: brightness(90%);
  }

  &:disabled {
    background-color: #adb5bd;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: ${(props) => props.align || "center"};

  @media (max-width: 480px) {
    flex-direction: ${(props) => (props.responsive ? "column" : "row")};
    width: ${(props) => (props.responsive ? "100%" : "auto")};
  }
`;

export const ActionButton = styled(Button)`
  padding: 8px 12px;
`;

export const IconButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.color || props.theme?.primary || "#007bff"};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    color: ${(props) => props.color || props.theme?.primary || "#007bff"};
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    color: #adb5bd;
    cursor: not-allowed;
  }
`;

// Inputs y Forms

export const Input = styled.input`
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || "#007bff"};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  &:disabled {
    background-color: #f8f9fa;
    cursor: not-allowed;
  }
`;

export const Select = styled.select`
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || "#007bff"};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 15px;
`;

export const Label = styled.label`
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
`;

export const Textarea = styled.textarea`
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  width: 100%;
  min-height: ${(props) => props.height || "100px"};
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || "#007bff"};
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

export const Checkbox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  label {
    font-size: 14px;
    cursor: pointer;
    user-select: none;
  }
`;

export const SearchContainer = styled.div`
  display: flex;
  width: 100%;
  max-width: ${(props) => props.maxWidth || "800px"};
  margin: 0 auto;
`;

export const SearchInput = styled(Input)`
  border-radius: 4px 0 0 4px;
`;

export const SearchButton = styled(Button)`
  border-radius: 0 4px 4px 0;
  padding: 10px 15px;
`;

// Tablas y Datos

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  th,
  td {
    padding: 12px 15px;
    text-align: left;
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader || "#f0f0f0"};
    color: ${({ theme }) => theme.tableHeaderText || "#333"};
    font-weight: bold;
    position: ${(props) => (props.stickyHeader ? "sticky" : "static")};
    top: 0;
    z-index: 1;
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }

    &.disabled {
      opacity: 0.6;
      background-color: ${({ theme }) => theme.tableDisabled || "#f2f2f2"};
    }
  }
`;

export const TableContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto; // Ya tienes esto, correcto
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  /* Añadir esto */
  -webkit-overflow-scrolling: touch; /* Para mejor scroll en iOS */

  @media (max-width: 576px) {
    /* Mejora la visualización en móviles pequeños */
    margin-left: -10px;
    margin-right: -10px;
    width: calc(100% + 20px);
    border-radius: 0;
  }
`;

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: ${(props) => (props.size === "sm" ? "3px 8px" : "5px 10px")};
  border-radius: 50px;
  font-size: ${(props) => (props.size === "sm" ? "12px" : "14px")};
  font-weight: 500;
  color: ${(props) => props.textColor || "white"};
  background-color: ${(props) => {
    if (props.variant === "primary") return props.theme.primary || "#007bff";
    if (props.variant === "secondary")
      return props.theme.secondary || "#6c757d";
    if (props.variant === "success") return props.theme.success || "#28a745";
    if (props.variant === "danger") return props.theme.danger || "#dc3545";
    if (props.variant === "warning") return props.theme.warning || "#ffc107";
    if (props.variant === "info") return props.theme.info || "#17a2b8";
    return props.color || props.theme.primary || "#007bff";
  }};
`;

// Utilidades

export const Spinner = styled.div`
  border: 4px solid ${({ theme }) => theme.border || "#f3f3f3"};
  border-top: 4px solid ${({ theme }) => theme.primary || "#007bff"};
  border-radius: 50%;
  width: ${(props) =>
    props.size === "sm" ? "20px" : props.size === "lg" ? "50px" : "30px"};
  height: ${(props) =>
    props.size === "sm" ? "20px" : props.size === "lg" ? "50px" : "30px"};
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

export const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 15px;
`;

export const ErrorContainer = styled.div`
  background-color: rgba(220, 53, 69, 0.1);
  color: #dc3545;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  margin: 20px 0;
`;

export const EmptyContainer = styled.div`
  padding: 30px;
  text-align: center;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

export const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  margin: 20px 0;
`;

// Layout helpers

export const Flex = styled.div`
  display: flex;
  flex-direction: ${(props) => props.direction || "row"};
  align-items: ${(props) => props.align || "center"};
  justify-content: ${(props) => props.justify || "flex-start"};
  gap: ${(props) => props.gap || "10px"};
  flex-wrap: ${(props) => props.wrap || "nowrap"};
  width: ${(props) => (props.fullWidth ? "100%" : "auto")};

  @media (max-width: 768px) {
    flex-direction: ${(props) =>
      props.responsiveDirection || props.direction || "row"};
  }
`;

export const Box = styled.div`
  padding: ${(props) => props.padding || "0"};
  margin: ${(props) => props.margin || "0"};
  width: ${(props) => props.width || "auto"};
  max-width: ${(props) => props.maxWidth || "none"};
  text-align: ${(props) => props.textAlign || "left"};
`;

// Paginación

export const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  margin-top: 20px;
`;

export const PageButton = styled.button`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  background-color: ${(props) =>
    props.active
      ? props.theme.primary || "#007bff"
      : props.theme.cardBg || "#fff"};
  color: ${(props) => (props.active ? "white" : props.theme.text)};
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: ${(props) =>
      props.active
        ? props.theme.primaryHover || "#0069d9"
        : props.theme.hoverBg || "#f8f9fa"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const PageInfo = styled.span`
  padding: 0 10px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

// Filtros comunes

export const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 15px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

export const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: ${(props) => props.minWidth || "150px"};

  @media (max-width: 768px) {
    width: 100%;
  }
`;

export const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;
