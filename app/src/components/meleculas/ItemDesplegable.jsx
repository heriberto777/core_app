import React from "react";
import { Icono } from "../../index";

/**
 * Corporate ItemDesplegable (Tailwind Edition)
 */
export function ItemsDesplegable({ item, funcion, className = "" }) {
  return (
    <div 
      onClick={funcion}
      className={`
        cursor-pointer px-3 py-2 rounded-lg flex items-center gap-2.5
        hover:bg-slate-50 dark:hover:bg-slate-700
        ${className}
      `}
    >
      <Icono className="text-lg block text-slate-500 dark:text-slate-400">{item.icono && <item.icono />}</Icono>
      <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{item.text}</span>
    </div>
  );
}