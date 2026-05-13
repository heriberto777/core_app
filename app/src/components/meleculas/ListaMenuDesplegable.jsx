import React from "react";
import { ItemsDesplegable } from "../../index";

/**
 * Corporate ListaMenuDesplegable (Tailwind Edition)
 */
export function ListaMenuDesplegable({ data, top = "0", funcion, className = "" }) {
  return (
    <div 
      className={`p-2.5 flex flex-col absolute bg-slate-800 rounded-[22px] shadow-lg ${className}`}
      style={{ top }}
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