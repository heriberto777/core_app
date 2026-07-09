import React from "react";
import { ItemsDesplegable } from "../../index";

/**
 * Corporate ListaMenuDesplegable (Tailwind Edition)
 */
export function ListaMenuDesplegable({ data, funcion, className = "" }) {
  return (
    <div
      className={`p-1.5 min-w-[180px] flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl ${className}`}
    >
      {data.map((item, index) => (
        <ItemsDesplegable
          key={index}
          item={item}
          funcion={() => funcion(item.tipo)}
        />
      ))}
    </div>
  );
}