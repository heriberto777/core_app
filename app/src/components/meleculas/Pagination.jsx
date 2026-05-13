import React from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
} from "react-icons/fa";

/**
 * Corporate Pagination Component (Tailwind Edition)
 */
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
  className = "",
}) => {
  if (totalPages <= 1 && !showInfo && !showPageSize) {
    return null;
  }

  const startRecord = totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

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

    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push("...");
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

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

  const PageButton = ({ active, variant, children, ...props }) => (
    <button
      className={`
        flex items-center justify-center min-w-[32px] h-8 px-2 border rounded-md text-sm font-medium cursor-pointer transition-all duration-200
        ${active 
          ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700 hover:border-primary-700' 
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus:ring-2 focus:ring-primary-500/20'}
        ${variant === 'nav' ? 'min-w-9 h-9' : ''}
        ${disabled ? 'bg-slate-50 text-slate-300 cursor-not-allowed border-slate-200' : ''}
      `}
      {...props}
    >
      {children}
    </button>
  );

  const Ellipsis = () => (
    <span className="flex items-center justify-center min-w-8 h-8 text-slate-400 text-sm font-medium">
      ...
    </span>
  );

  return (
    <div className={`flex items-center justify-between gap-4 py-4 ${className}`}>
      {showInfo && (
        <div className="text-sm text-slate-500">
          Mostrando <span className="font-semibold text-slate-700">{startRecord}</span> a{" "}
          <span className="font-semibold text-slate-700">{endRecord}</span> de{" "}
          <span className="font-semibold text-slate-700">{totalRecords.toLocaleString()}</span>{" "}
          registros
        </div>
      )}

      <div className="flex items-center gap-4">
        {showPageSize && onPageSizeChange && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              disabled={disabled}
              className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-700 text-sm cursor-pointer focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            {showFirstLast && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || disabled}
                title="Primera página"
              >
                <FaAngleDoubleLeft size={12} />
              </PageButton>
            )}

            {showPrevNext && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || disabled}
                title="Página anterior"
              >
                <FaChevronLeft size={12} />
              </PageButton>
            )}

            {showPageNumbers &&
              visiblePages.map((page, index) =>
                page === "..." ? (
                  <Ellipsis key={`ellipsis-${index}`} />
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

            {showPrevNext && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || disabled}
                title="Página siguiente"
              >
                <FaChevronRight size={12} />
              </PageButton>
            )}

            {showFirstLast && (
              <PageButton
                variant="nav"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || disabled}
                title="Última página"
              >
                <FaAngleDoubleRight size={12} />
              </PageButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
};