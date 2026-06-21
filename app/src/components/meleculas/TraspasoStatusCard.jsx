import { StatusBadge } from "../../index";

/**
 * Corporate TraspasoStatusCard (Tailwind Edition)
 */
export function TraspasoStatusCard({
  title,
  value,
  color,
  description,
  variant = "default",
  className = ""
}) {
  const getColorByVariant = (variant) => {
    switch (variant) {
      case "success": return "text-emerald-500";
      case "danger": return "text-red-500";
      case "warning": return "text-amber-500";
      case "info": return "text-primary-500";
      default: return color || "text-primary-500";
    }
  };

  const getBorderByVariant = (variant) => {
    switch (variant) {
      case "success": return "border-l-emerald-500";
      case "danger": return "border-l-red-500";
      case "warning": return "border-l-amber-500";
      case "info": return "border-l-primary-500";
      default: return "border-l-primary-500";
    }
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-5 text-center transition-transform duration-200 hover:-translate-y-0.5 ${className}`}>
      <div className={`text-[32px] font-bold ${getColorByVariant(variant)} mb-2`}>
        {value.toLocaleString()}
      </div>
      <div className="text-sm text-slate-500 font-medium mb-1">{title}</div>
      {description && <div className="text-xs text-slate-400">{description}</div>}
    </div>
  );
}