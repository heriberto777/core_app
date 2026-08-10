import React from "react";

/**
 * Corporate ContentHeader Component (Tailwind Edition)
 * `title`/`description` nunca se renderizaban — ni en la versión original
 * con styled-components, que también era solo un <div> — así que las 3
 * pantallas que lo llaman con esas props (TransferTask, MappingEditor,
 * LoadsTasks) quedaban sin título ni descripción propios.
 */
export const ContentHeader = ({ title, description, children, className = "", ...props }) => (
  <div
    className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
    {...props}
  >
    {(title || description) && (
      <div>
        {title && <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h1>}
        {description && <p className="text-slate-500 mt-1 text-sm font-medium">{description}</p>}
      </div>
    )}
    {children}
  </div>
);