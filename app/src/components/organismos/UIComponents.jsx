import React, { useEffect } from "react";
import ReactDOM from "react-dom";

/**
 * Corporate UI Components (Tailwind Edition)
 * Componentes UI reutilizables para toda la aplicación
 */

export const Modal = ({ children, isOpen, onClose, maxWidth = "max-w-lg" }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl w-[95%] ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden relative shadow-2xl border border-slate-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

// shrink-0 en Header/Footer + overflow-y-auto en Body: antes toda la tarjeta
// (header incluido) scrolleaba junto con el contenido — en modales con
// contenido largo (ej. historial con muchas filas) el header desaparecía
// al hacer scroll en vez de quedar fijo arriba.
export const ModalHeader = ({ children, className = "", ...props }) => (
  <div className={`flex justify-between items-center mb-4 pb-3 border-b border-slate-200 shrink-0 ${className}`} {...props}>
    {children}
  </div>
);

export const ModalTitle = ({ children, className = "", ...props }) => (
  <h2 className={`m-0 text-lg text-slate-800 ${className}`} {...props}>
    {children}
  </h2>
);

export const ModalBody = ({ children, className = "", ...props }) => (
  <div className={`mb-4 overflow-y-auto flex-1 ${className}`} {...props}>
    {children}
  </div>
);

export const ModalFooter = ({ children, className = "", ...props }) => (
  <div className={`flex justify-end gap-2.5 pt-4 border-t border-slate-200 shrink-0 ${className}`} {...props}>
    {children}
  </div>
);

export const UIInput = ({ className = "", ...props }) => (
  <input
    className={`
      px-4 py-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white w-full
      focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
      disabled:bg-slate-100 disabled:cursor-not-allowed
      ${className}
    `}
    {...props}
  />
);

export const FormGroup = ({ children, className = "", ...props }) => (
  <div className={`mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const Label = ({ children, className = "", ...props }) => (
  <label className={`block mb-1 font-medium text-sm text-slate-700 ${className}`} {...props}>
    {children}
  </label>
);

export const Select = ({ className = "", ...props }) => (
  <select
    className={`
      px-4 py-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white w-full
      focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
      ${className}
    `}
    {...props}
  />
);

export const Textarea = ({ className = "", height = "h-24", ...props }) => (
  <textarea
    className={`
      px-4 py-2.5 border border-slate-300 rounded text-sm text-slate-800 bg-white w-full
      ${height} resize-y
      focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
      ${className}
    `}
    {...props}
  />
);
