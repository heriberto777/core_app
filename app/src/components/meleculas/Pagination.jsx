
import React from "react";
import styled from "styled-components";
import {
  FaChevronLeft,
  FaChevronRight,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
} from "react-icons/fa";

const PaginationContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 12px;
  }
`;

const PaginationInfo = styled.div`
  font-size: 14px;
  color: #6b7280;

  .highlight {
    font-weight: 600;
    color: #374151;
  }
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #f9fafb;
    color: #d1d5db;
    cursor: not-allowed;
    border-color: #e5e7eb;
  }

  ${({ active }) =>
    active &&
    `
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;

    &:hover {
      background: #2563eb;
      border-color: #2563eb;
    }
  `}

  ${({ variant }) =>
    variant === "nav" &&
    `
    min-width: 36px;
    height: 36px;
  `}
`;

const Ellipsis = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  color: #9ca3af;
  font-size: 14px;
  font-weight: 500;
`;

const PageSizeSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #6b7280;

  select {
    padding: 4px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    color: #374151;
    font-size: 14px;
    cursor: pointer;

    &:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
  }
`;

export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  totalRecords = 0,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  showFirstLast = true,
  showPrevNext = true,
  showPageNumbers = true,
  showPageSize = true,
  showInfo = true,
  maxVisible = 5,
  pageSizeOptions = [10, 20, 50, 100],
  disabled = false,
}) => {
  // No mostrar paginación si no hay suficientes páginas
  if (totalPages <= 1 && !showInfo && !showPageSize) {
    return null;
  }

  // Calcular rango de registros
  const startRecord = totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  // Generar números de página visibles
  const getVisiblePages = () => {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages = [];

    // Agregar primera página y ellipsis si es necesario
    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push("...");
      }
    }

    // Agregar páginas del rango
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Agregar ellipsis y última página si es necesario
    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !disabled) {
      onPageChange?.(page);
    }
  };

  const handlePageSizeChange = (newPageSize) => {
    if (onPageSizeChange && !disabled) {
      onPageSizeChange(parseInt(newPageSize));
    }
  };

  return (
    <PaginationContainer>
      {/* Información de registros */}
      {showInfo && (
        <PaginationInfo>
          Mostrando <span className="highlight">{startRecord}</span> a{" "}
          <span className="highlight">{endRecord}</span> de{" "}
          <span className="highlight">{totalRecords.toLocaleString()}</span>{" "}
          registros
        </PaginationInfo>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* Selector de tamaño de página */}
        {showPageSize && onPageSizeChange && (
          <PageSizeSelector>
            <span>Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              disabled={disabled}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </PageSizeSelector>
        )}

        {/* Controles de paginación */}
        {totalPages > 1 && (
          <PaginationControls>
            {/* Primera página */}
            {showFirstLast && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || disabled}
                title="Primera página"
              >
                <FaAngleDoubleLeft />
              </PageButton>
            )}

            {/* Página anterior */}
            {showPrevNext && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || disabled}
                title="Página anterior"
              >
                <FaChevronLeft />
              </PageButton>
            )}

            {/* Números de página */}
            {showPageNumbers &&
              visiblePages.map((page, index) =>
                page === "..." ? (
                  <Ellipsis key={`ellipsis-${index}`}>...</Ellipsis>
                ) : (
                  <PageButton
                    key={page}
                    active={page === currentPage}
                    onClick={() => handlePageChange(page)}
                    disabled={disabled}
                    title={`Página ${page}`}
                  >
                    {page}
                  </PageButton>
                )
              )}

            {/* Página siguiente */}
            {showPrevNext && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || disabled}
                title="Página siguiente"
              >
                <FaChevronRight />
              </PageButton>
            )}

            {/* Última página */}
            {showFirstLast && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || disabled}
                title="Última página"
              >
                <FaAngleDoubleRight />
              </PageButton>
            )}
          </PaginationControls>
        )}
      </div>
    </PaginationContainer>
  );
};
