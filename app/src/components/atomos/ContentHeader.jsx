import React from "react";

/**
 * Corporate ContentHeader Component (Tailwind Edition)
 */
export const ContentHeader = ({ children, className = "", ...props }) => (
  <div 
    className={`w-full flex items-center relative justify-end ${className}`} 
    {...props}
  >
    {children}
  </div>
);