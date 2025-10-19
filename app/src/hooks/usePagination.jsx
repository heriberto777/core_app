// src/hooks/usePagination.jsx
import { useState, useCallback, useMemo } from 'react';

/**
 * Hook para gestionar paginación
 * Siguiendo el patrón de tus hooks existentes
 */
export const usePagination = (initialPage = 1, initialPageSize = 20) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);

  /**
   * Ir a una página específica
   */
  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  /**
   * Ir a la página siguiente
   */
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  /**
   * Ir a la página anterior
   */
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  /**
   * Ir a la primera página
   */
  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  /**
   * Ir a la última página
   */
  const goToLastPage = useCallback(() => {
    if (totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages]);

  /**
   * Resetear a la primera página
   */
  const resetToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  /**
   * Cambiar el tamaño de página
   */
  const changePageSize = useCallback((newPageSize) => {
    setPageSize(newPageSize);

    // Recalcular página actual para mantener posición relativa
    const currentRecord = (currentPage - 1) * pageSize + 1;
    const newPage = Math.ceil(currentRecord / newPageSize);
    setCurrentPage(newPage);
  }, [currentPage, pageSize]);

  /**
   * Actualizar totales (llamar desde el componente padre)
   */
  const updateTotals = useCallback((records, pages) => {
    setTotalRecords(records);
    setTotalPages(pages);

    // Ajustar página actual si es necesario
    if (currentPage > pages && pages > 0) {
      setCurrentPage(pages);
    }
  }, [currentPage]);

  /**
   * Datos computados
   */
  const paginationInfo = useMemo(() => ({
    currentPage,
    pageSize,
    totalPages,
    totalRecords,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    isFirstPage: currentPage === 1,
    isLastPage: currentPage === totalPages,
    startRecord: totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0,
    endRecord: Math.min(currentPage * pageSize, totalRecords),
    offset: (currentPage - 1) * pageSize
  }), [currentPage, pageSize, totalPages, totalRecords]);

  /**
   * Generar array de páginas para mostrar en el paginador
   */
  const getPageNumbers = useCallback((maxVisible = 5) => {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);

    // Ajustar si estamos cerca del final
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }, [currentPage, totalPages]);

  return {
    // Estados
    currentPage,
    pageSize,
    totalPages,
    totalRecords,

    // Funciones de navegación
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    resetToFirstPage,

    // Funciones de configuración
    changePageSize,
    updateTotals,
    setTotalPages, // Para compatibilidad con tu código existente

    // Información computada
    paginationInfo,
    getPageNumbers,

    // Propiedades de conveniencia
    hasNextPage: paginationInfo.hasNextPage,
    hasPreviousPage: paginationInfo.hasPreviousPage,
    isFirstPage: paginationInfo.isFirstPage,
    isLastPage: paginationInfo.isLastPage,
    startRecord: paginationInfo.startRecord,
    endRecord: paginationInfo.endRecord,
    offset: paginationInfo.offset
  };
};