import React from "react";
import { ItemsDesplegable } from "../../index";

/**
 * Corporate ListaMenuDesplegable (Tailwind Edition)
 */
export function ListaMenuDesplegable({ data, top = "0", funcion, className = "" }) {
  return (
    <div
      className={`p-1.5 min-w-[180px] flex flex-col absolute bg-white border border-slate-200 rounded-xl shadow-xl ${className}`}
      style={{ top: top }}
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