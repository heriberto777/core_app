import React from "react";
import { FaTimes, FaExclamationTriangle } from "react-icons/fa";
import { StatusBadge } from "../index";

/**
 * TraspasoDetailModal (Grid)
 * Detalle real de un traspaso: encabezado del tracking (Mongo) + líneas
 * del documento de inventario, consultadas en vivo desde SQL Server
 * (CATELLI.LINEA_DOC_INV) en el propio getTraspasoDetails.
 */
export function TraspasoDetailModal({ traspaso, onClose }) {
  if (!traspaso) return null;

  const {
    loadId,
    documentoInv,
    route,
    deliveryPersonName,
    warehouseOrigin,
    warehouseDestination,
    status,
    executionSource,
    totalLines,
    successfulLines,
    failedLines,
    totalQuantity,
    errorMessage,
    createdAt,
    lineas = [],
  } = traspaso;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Detalle del Traspaso</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{loadId}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Estado">
              <StatusBadge status={status === "completed" ? "ACTIVE" : "INACTIVE"}>
                {status === "completed" ? "Completado" : "Fallido"}
              </StatusBadge>
            </Field>
            <Field label="Documento">
              <span className="font-extrabold text-primary-600">{documentoInv || "—"}</span>
            </Field>
            <Field label="Origen de Ejecución">
              {executionSource === "manual" ? "Manual" : "Automático"}
            </Field>
            <Field label="Repartidor / Ruta">{route}{deliveryPersonName ? ` — ${deliveryPersonName}` : ""}</Field>
            <Field label="Bodega Origen">{warehouseOrigin || "—"}</Field>
            <Field label="Bodega Destino">{warehouseDestination || "—"}</Field>
            <Field label="Líneas">{successfulLines}/{totalLines} exitosas{failedLines > 0 ? ` (${failedLines} fallidas)` : ""}</Field>
            <Field label="Cantidad Total">{totalQuantity}</Field>
            <Field label="Fecha">{createdAt ? new Date(createdAt).toLocaleString() : "—"}</Field>
          </div>

          {errorMessage && (
            <div className="flex gap-3 items-start bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">
              <FaExclamationTriangle className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Líneas del Documento {documentoInv ? `(${documentoInv})` : ""}
            </h4>
            {!documentoInv ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No se generó documento de inventario para este intento.</p>
            ) : lineas.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No se encontraron líneas en SQL Server para este documento.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Artículo</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Bodega</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Destino</th>
                      <th className="px-3 py-2 text-right text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lineas.map((l, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{l.ARTICULO}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.BODEGA}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.BODEGA_DESTINO}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-slate-100">{l.CANTIDAD}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{children}</span>
  </div>
);
