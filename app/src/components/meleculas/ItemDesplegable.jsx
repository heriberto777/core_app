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
        cursor-pointer p-2 rounded-[20px] flex items-center gap-2.5
        hover:bg-slate-700
        ${className}
      `}
    >
      <Icono className="text-2xl block">{item.icono && <item.icono />}</Icono>
      <span className="text-white text-sm">{item.text}</span>
    </div>
  );
}