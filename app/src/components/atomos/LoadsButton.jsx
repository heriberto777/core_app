import React from "react";
import { FaSpinner } from "react-icons/fa";

/**
 * Corporate LoadsButton Component (Tailwind Edition)
 */
export function LoadsButton({
  children,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  onClick,
  type = 'button',
  minWidth,
  className = "",
  ...props
}) {
  const sizeClasses = {
    small: 'px-3 py-1.5 text-xs',
    medium: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base',
  };

  const variantClasses = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    success: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    secondary: 'bg-slate-500 hover:bg-slate-600 text-white',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-2 font-medium rounded-lg cursor-pointer
        transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size] || sizeClasses.medium}
        ${variantClasses[variant] || variantClasses.primary}
        ${className}
      `}
      style={{ minWidth: minWidth }}
      {...props}
    >
      {loading && <FaSpinner className="animate-spin" />}
      {children}
    </button>
  );
}