import React from "react";

/**
 * Corporate Icon Component (Tailwind Edition)
 */
export const Icono = ({ children, className = "", ...props }) => (
  <span className={`text-slate-600 text-2xl ${className}`} {...props}>
    {children}
  </span>
);