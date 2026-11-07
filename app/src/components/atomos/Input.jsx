import React from "react";

/**
 * Corporate Input Component (Tailwind Edition)
 */
export const Input = ({ label, error, icon: Icon, rightElement, className = "", ...props }) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full mb-3 ${className}`}>
      {label && (
        <label className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 ml-1">
          {label}
        </label>
      )}
      <div className="relative w-full group">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 dark:text-slate-500 pointer-events-none z-10 transition-colors group-focus-within:text-primary-500">
            <Icon size={18} />
          </div>
        )}
        <input
          className={`
            w-full py-2.5 px-4 text-sm rounded-xl border transition-all duration-200 outline-none
            ${Icon ? 'pl-11' : 'pl-4'}
            ${rightElement ? 'pr-11' : ''}
            ${error
              ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/30 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 focus:bg-white dark:focus:bg-slate-800'}
            text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500
            disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-900
          `}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center z-10">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <span className="text-xs font-medium text-red-500 dark:text-red-400 ml-1 animate-fadeIn">
          {error}
        </span>
      )}
    </div>
  );
};
