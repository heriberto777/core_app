import React from "react";
import { FaSync } from "react-icons/fa";
import { LoadingSpinner } from "../atomos/LoadingSpinner";

/**
 * Corporate RefreshButton Component (Tailwind Edition)
 */
export const RefreshButton = ({ onClick, refreshing, label = "Refrescar", className = "" }) => {
  return (
    <button
      onClick={onClick}
      disabled={refreshing}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white
        transition-all duration-300 cursor-pointer
        ${refreshing 
          ? 'bg-slate-500 cursor-not-allowed' 
          : 'bg-cyan-600 hover:bg-cyan-700 active:scale-95'}
        ${className}
      `}
    >
      {refreshing ? (
        <LoadingSpinner size="tiny" color="#ffffff" type="ring" />
      ) : (
        <FaSync className={refreshing ? "animate-spin" : ""} />
      )}
      <span>{refreshing ? "Actualizando..." : label}</span>
    </button>
  );
};