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
    success: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    warning: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    danger: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    info: "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    primary: "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800",
    secondary: "bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600",
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
