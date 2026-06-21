import React from "react";

/**
 * Corporate StatusBadge (Tailwind Edition)
 * Etiquetas de estado estilizadas para un look corporativo moderno.
 */
export const StatusBadge = ({
  children,
  status,
  variant,
  icon,
  tooltip,
  className = "",
  ...props
}) => {
  const getVariantFromStatus = (status) => {
    const statusVariants = {
      COMPLETED: "success",
      SUCCESS: "success",
      ACTIVE: "success",
      APPROVED: "success",
      PENDING: "warning",
      PROCESSING: "warning",
      IN_PROGRESS: "warning",
      WAITING: "warning",
      ERROR: "danger",
      FAILED: "danger",
      CANCELLED: "danger",
      REJECTED: "danger",
      INFO: "info",
      NEW: "info",
      DRAFT: "info",
      INACTIVE: "secondary",
      DISABLED: "secondary",
      PAUSED: "secondary",
    };
    return statusVariants[status?.toUpperCase()] || "secondary";
  };

  const finalVariant = variant || getVariantFromStatus(status);
  const displayText = children || status;

  const variants = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
    primary: "bg-primary-50 text-primary-700 border-primary-200",
    secondary: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border 
        text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-200
        ${variants[finalVariant] || variants.secondary}
        ${className}
      `}
      title={tooltip}
      {...props}
    >
      {icon && <span className="text-[10px]">{icon}</span>}
      {displayText}
    </span>
  );
};
