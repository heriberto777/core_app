import React from "react";
import ReactDOM from "react-dom";

/**
 * Corporate UI Components (Tailwind Edition)
 * Componentes UI reutilizables para toda la aplicación
 */

export const Card = ({ children, variant, accent, disabled, interactive, className = "", ...props }) => {
  const accentColors = {
    danger: "border-l-red-500",
    warning: "border-l-amber-500",
    info: "border-l-cyan-500",
    success: "border-l-emerald-500",
    primary: "border-l-primary-500",
  };

  return (
    <div
      className={`
        bg-white rounded-lg shadow-md overflow-hidden border-l-4
        ${accentColors[variant] || accentColors.primary}
        ${disabled ? "opacity-70" : ""}
        ${interactive ? "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = "", ...props }) => (
  <div className={`px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ children, size = "text-base", className = "", ...props }) => (
  <h3 className={`m-0 font-semibold text-slate-800 flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-2 ${size} ${className}`} {...props}>
    {children}
  </h3>
);

export const CardContent = ({ children, className = "", ...props }) => (
  <div className={`p-4 flex-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, align = "justify-end", className = "", ...props }) => (
  <div className={`px-4 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 flex-wrap ${align} ${className}`} {...props}>
    {children}
  </div>
);

export const GridContainer = ({ children, columns = 2, gap = "gap-5", className = "", ...props }) => (
  <div className={`grid grid-cols-${columns} ${gap} ${className}`} {...props}>
    {children}
  </div>
);

export const ButtonGroup = ({ children, align = "justify-center", responsive, className = "", ...props }) => (
  <div className={`flex gap-2.5 flex-wrap items-center ${align} ${responsive ? "sm:flex-row flex-col sm:w-auto w-full" : ""} ${className}`} {...props}>
    {children}
  </div>
);

export const UIButton = ({ children, variant = "primary", size = "md", fullWidth, disabled, className = "", ...props }) => {
  const variants = {
    primary: "bg-primary-600 text-white hover:bg-primary-700",
    secondary: "bg-slate-500 text-white hover:bg-slate-600",
    success: "bg-emerald-500 text-white hover:bg-emerald-600",
    danger: "bg-red-500 text-white hover:bg-red-600",
    warning: "bg-amber-500 text-gray-900 hover:bg-amber-600",
    info: "bg-cyan-500 text-white hover:bg-cyan-600",
  };

  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2 font-medium rounded cursor-pointer transition-all duration-300
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? "w-full" : ""}
        ${disabled ? "bg-slate-300 cursor-not-allowed opacity-70" : "hover:brightness-90"}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

export const ActionButton = ({ children, className = "", ...props }) => (
  <UIButton className={`px-3 py-2 ${className}`} {...props}>
    {children}
  </UIButton>
);

export const IconButton = ({ children, color, disabled, className = "", ...props }) => (
  <button
    disabled={disabled}
    className={`
      bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center transition-all duration-200
      ${color || "text-primary-500"}
      ${disabled ? "text-slate-300 cursor-not-allowed" : "hover:bg-black/5"}
      ${className}
    `}
    {...props}
  >
    {children}
  </button>
);

export const Modal = ({ children, isOpen, onClose, maxWidth = "max-w-lg" }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl w-[95%] ${maxWidth} max-h-[90vh] overflow-y-auto relative shadow-2xl border border-slate-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const ModalHeader = ({ children, className = "", ...props }) => (
  <div className={`flex justify-between items-center mb-4 pb-3 border-b border-slate-200 ${className}`} {...props}>
    {children}
  </div>
);

export const ModalTitle = ({ children, className = "", ...props }) => (
  <h2 className={`m-0 text-lg text-slate-800 ${className}`} {...props}>
    {children}
  </h2>
);

export const ModalBody = ({ children, className = "", ...props }) => (
  <div className={`mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const ModalFooter = ({ children, className = "", ...props }) => (
  <div className={`flex justify-end gap-2.5 pt-4 border-t border-slate-200 ${className}`} {...props}>
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

export const Checkbox = ({ children, className = "", ...props }) => (
  <div className={`flex items-center gap-2 mb-2.5 ${className}`}>
    <input type="checkbox" className="w-4 h-4 cursor-pointer" {...props} />
    <label className="text-sm cursor-pointer select-none">{children}</label>
  </div>
);

export const SearchContainer = ({ children, maxWidth = "max-w-2xl", className = "", ...props }) => (
  <div className={`flex w-full ${maxWidth} mx-auto ${className}`} {...props}>
    {children}
  </div>
);

export const SearchInput = ({ className = "", ...props }) => (
  <UIInput className={`rounded-l ${className}`} {...props} />
);

export const SearchButton = ({ className = "", ...props }) => (
  <UIButton className={`rounded-r px-4 py-2.5 ${className}`} {...props}>
    Buscar
  </UIButton>
);

export const Table = ({ children, stickyHeader, className = "", ...props }) => (
  <table
    className={`
      w-full border-collapse bg-white text-slate-800 rounded-lg overflow-hidden shadow-md
      ${className}
    `}
    {...props}
  >
    {children}
  </table>
);

export const TableContainer = ({ children, className = "", ...props }) => (
  <div className={`w-full max-w-6xl mx-auto overflow-x-auto rounded-lg shadow-md -webkit-overflow-touch ${className}`} {...props}>
    {children}
  </div>
);

export const Badge = ({ children, variant = "primary", size = "md", textColor = "white", className = "", ...props }) => {
  const variants = {
    primary: "bg-primary-500",
    secondary: "bg-slate-500",
    success: "bg-emerald-500",
    danger: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-cyan-500",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${className}
      `}
      style={{ color: textColor }}
      {...props}
    >
      {children}
    </span>
  );
};

export const LoadingContainer = ({ children, className = "", ...props }) => (
  <div className={`flex flex-col items-center justify-center p-8 gap-4 ${className}`} {...props}>
    {children}
  </div>
);

export const ErrorContainer = ({ children, className = "", ...props }) => (
  <div className={`bg-red-500/10 text-red-600 p-5 rounded-lg text-center my-5 ${className}`} {...props}>
    {children}
  </div>
);

export const EmptyContainer = ({ children, className = "", ...props }) => (
  <div className={`p-8 text-center bg-white rounded-lg shadow-md text-slate-500 ${className}`} {...props}>
    {children}
  </div>
);

export const Divider = ({ className = "", ...props }) => (
  <hr className={`border-none border-t border-slate-200 my-5 ${className}`} {...props} />
);

export const Flex = ({ children, direction = "row", align = "items-center", justify = "justify-start", gap = "gap-2.5", wrap = "flex-nowrap", fullWidth, responsiveDirection, className = "", ...props }) => (
  <div
    className={`
      flex ${direction} ${align} ${justify} ${gap} ${wrap}
      ${fullWidth ? "w-full" : ""}
      ${responsiveDirection ? `sm:${responsiveDirection} ${direction}` : ""}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
);

export const Box = ({ children, padding = "", margin = "", width = "auto", maxWidth = "none", textAlign = "left", className = "", ...props }) => (
  <div
    className={`
      ${padding} ${margin} ${width} ${maxWidth !== "none" ? maxWidth : ""} ${textAlign !== "left" ? textAlign : ""}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
);

export const FiltersContainer = ({ children, className = "", ...props }) => (
  <div className={`flex flex-wrap gap-4 mb-4 bg-white p-4 rounded-lg shadow-sm ${className}`} {...props}>
    {children}
  </div>
);

export const FilterGroup = ({ children, minWidth = "min-w-[150px]", className = "", ...props }) => (
  <div className={`flex flex-col gap-1 flex-1 ${minWidth} ${className}`} {...props}>
    {children}
  </div>
);

export const FilterLabel = ({ children, className = "", ...props }) => (
  <label className={`text-sm font-medium text-slate-500 ${className}`} {...props}>
    {children}
  </label>
);

export const Spinner = ({ size = "md", className = "", ...props }) => {
  const sizes = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-12 h-12",
  };

  return (
    <div
      className={`
        border-4 border-slate-200 border-t-primary-500 rounded-full animate-spin
        ${sizes[size] || sizes.md}
        ${className}
      `}
      {...props}
    />
  );
};

export const PageInfo = ({ children, className = "", ...props }) => (
  <span className={`px-2.5 text-slate-500 ${className}`} {...props}>
    {children}
  </span>
);

export const Pagination = ({ children, className = "", ...props }) => (
  <div className={`flex justify-center items-center gap-1 mt-5 ${className}`} {...props}>
    {children}
  </div>
);

export const PageButton = ({ children, active, disabled, className = "", ...props }) => (
  <button
    className={`
      px-3 py-2 border border-slate-200
      ${active ? "bg-primary-500 text-white border-primary-500 hover:bg-primary-600" : "bg-white text-slate-700 hover:bg-slate-50"}
      ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      rounded
      ${className}
    `}
    disabled={disabled}
    {...props}
  >
    {children}
  </button>
);