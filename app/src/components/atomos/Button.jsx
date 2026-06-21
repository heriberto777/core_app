import React from "react";

/**
 * Corporate Button Component (Tailwind Edition)
 */
export const Button = React.forwardRef(({ children, variant = "primary", size = "md", loading, disabled, className = "", ...props }, ref) => {
  
  const baseStyles = "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap rounded-xl";
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  
  const variants = {
    primary: "bg-primary-600 text-white shadow-soft hover:bg-primary-700 hover:shadow-md",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
    danger: "bg-red-500 text-white shadow-soft hover:bg-red-600",
    success: "bg-emerald-500 text-white shadow-soft hover:bg-emerald-600",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    outline: "bg-transparent border-2 border-primary-600 text-primary-600 hover:bg-primary-50",
  };

  const currentVariant = variants[variant] || variants.primary;
  const currentSize = sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${baseStyles} ${currentVariant} ${currentSize} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
});

Button.displayName = "Button";
