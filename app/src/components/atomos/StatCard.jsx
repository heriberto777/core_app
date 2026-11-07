import React from "react";

/**
 * Corporate StatCard (Tailwind Edition)
 * Tarjetas de métricas con diseño premium.
 */
export const StatCard = ({
    title,
    value,
    subtitle,
    icon,
    color,
    footer,
    fullWidth,
    children,
    className = "",
    ...props
}) => {
    return (
        <div 
          className={`
            bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-soft transition-all duration-300
            hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-2
            ${fullWidth ? 'col-span-full' : ''}
            ${className}
          `}
          {...props}
        >
            <div className="flex justify-between items-center mb-1">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    {icon && <span className="text-primary-500">{icon}</span>}
                    {title}
                </h3>
            </div>

            <div
              className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight"
              style={{ color: color }}
            >
              {value}
            </div>

            {subtitle && (
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {subtitle}
              </div>
            )}

            {children && <div className="mt-2">{children}</div>}

            {footer && (
              <div className="mt-auto pt-3 border-t border-slate-50 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400">
                {footer}
              </div>
            )}
        </div>
    );
};
