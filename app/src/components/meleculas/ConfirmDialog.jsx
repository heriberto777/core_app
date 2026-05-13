import React from "react";
import {
  FaExclamationTriangle,
  FaQuestion,
  FaInfo,
  FaTimes,
} from "react-icons/fa";

/**
 * Corporate ConfirmDialog Component (Tailwind Edition)
 */
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
  className = "",
}) => {
  if (!show) return null;

  const iconColors = {
    warning: "text-amber-500",
    danger: "text-red-500",
    info: "text-primary-500",
    success: "text-emerald-500",
    primary: "text-indigo-500",
  };

  const buttonVariants = {
    primary: "bg-primary-600 hover:bg-primary-700 text-white focus:ring-primary-500/20",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 focus:ring-slate-500/20",
    danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500/20",
    warning: "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500/20",
    success: "bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-500/20",
  };

  const getIcon = () => {
    switch (variant) {
      case "warning":
        return <FaExclamationTriangle className={`text-xl ${iconColors.warning}`} />;
      case "danger":
        return <FaExclamationTriangle className={`text-xl ${iconColors.danger}`} />;
      case "info":
        return <FaInfo className={`text-xl ${iconColors.info}`} />;
      case "success":
        return <FaQuestion className={`text-xl ${iconColors.success}`} />;
      default:
        return <FaQuestion className={`text-xl ${iconColors.primary}`} />;
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001] p-5 backdrop-blur-[2px]"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`bg-white rounded-lg shadow-xl max-w-[500px] w-full max-h-[90vh] overflow-auto animate-scaleIn ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {getIcon()}
            <h3 id="dialog-title" className="text-lg font-semibold text-slate-900 m-0">
              {title}
            </h3>
          </div>
          {showCloseButton && (
            <button
              onClick={onCancel}
              disabled={loading}
              className="bg-transparent border-none text-slate-400 cursor-pointer p-1 rounded hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Cerrar"
            >
              <FaTimes />
            </button>
          )}
        </div>

        <div className="px-6 py-4">
          <p className="m-0 text-slate-600 leading-relaxed whitespace-pre-line">
            {message}
          </p>
          {details && (
            <div className="mt-3 p-3 bg-slate-50 rounded-md border-l-3 border-slate-300 text-sm text-slate-500">
              {details}
            </div>
          )}
        </div>

        <div className="px-6 py-5 flex gap-3 justify-end border-t border-slate-200">
          <button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all duration-200 min-w-[80px] justify-center disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium 
              cursor-pointer transition-all duration-200 min-w-[80px] justify-center
              disabled:opacity-50 disabled:cursor-not-allowed
              ${loading ? "pointer-events-none opacity-70" : ""}
              ${buttonVariants[variant] || buttonVariants.primary}
            `}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};