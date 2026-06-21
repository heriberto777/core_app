import React from "react";

/**
 * Corporate LoadingUI (Tailwind Edition)
 */
export const LoadingUI = ({ message = "Cargando...", fullPage = false }) => {
    return (
        <div 
          className={`
            flex flex-col items-center justify-center gap-4
            ${fullPage ? "min-h-[60vh]" : "min-h-[200px]"}
            p-12
          `}
        >
            <div className="w-10 h-10 border-3 border-slate-200 border-t-primary-600 rounded-full animate-spin" />
            <div className="text-sm font-semibold text-slate-400 animate-pulse uppercase tracking-widest">
              {message}
            </div>
        </div>
    );
};

/**
 * Corporate Skeleton Loader
 */
export const Skeleton = ({ width = "100%", height = "20px", className = "" }) => (
  <div
    className={`bg-slate-200 rounded-lg animate-pulse ${className}`}
    style={{ width: width, height: height }}
  />
);
