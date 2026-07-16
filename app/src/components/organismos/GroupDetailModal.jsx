import React from "react";
import { FaTimes, FaCrown, FaExclamationTriangle, FaSpinner } from "react-icons/fa";
import { StatusBadge } from "../index";

const STATUS_LABELS = {
  pending: "Pendiente",
  running: "En curso",
  completed: "Completada",
  error: "Error",
  failed: "Error",
  cancelled: "Cancelada",
};

// Los nombres de tareas son cadenas largas unidas por "_" sin espacios;
// insertar un espacio de ancho cero después de cada "_" le da al
// navegador un punto de corte razonable en vez de partir a mitad de palabra.
const withBreakOpportunities = (text = "") => text.split("_").join("_​");

/**
 * GroupDetailModal (Grid)
 * Detalle en vivo de un grupo vinculado: reemplaza el antiguo popup de
 * SweetAlert2 (cuyo choque de estilos con Tailwind rompía el layout) por
 * un modal React consistente con el resto de la app. Muestra cada tarea
 * numerada por su orden de ejecución y su estado real (pendiente/en
 * curso/completada/error/cancelada), incluido el mensaje de error si
 * corresponde. El padre (LinkedGroupsManager) hace polling y pasa `group`
 * actualizado mientras el modal está abierto, así el estado se ve en vivo
 * durante una ejecución real del grupo.
 */
export function GroupDetailModal({ group, onClose, onRemoveTask, onDismantle, removingTaskId }) {
  if (!group) return null;

  const { groupName, coordinator, tasks = [] } = group;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Grupo: {groupName}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">{tasks.length} tareas</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors" aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-5">
          {coordinator ? (
            <div className="bg-primary-50/50 border border-primary-100 p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <FaCrown className="text-primary-600" />
                <h4 className="text-sm font-black text-primary-900 uppercase tracking-wider">
                  Tarea coordinadora: {coordinator.name}
                </h4>
              </div>
              <div>
                <span className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Query de post-actualización</span>
                <code className="block mt-1 p-3 bg-white rounded-lg border border-primary-100 text-xs font-mono text-primary-800">
                  {coordinator.postUpdateQuery}
                </code>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100">
              Este grupo no cuenta con una tarea coordinadora definida.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {tasks.map((task, idx) => {
              const isRunning = task.status === "running";
              const isError = task.status === "error" || task.status === "failed";
              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isRunning
                      ? "bg-primary-50/40 border-primary-200"
                      : isError
                      ? "bg-red-50/50 border-red-200"
                      : task.isCoordinator
                      ? "bg-emerald-50/30 border-emerald-100"
                      : "bg-white border-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900 text-white text-[11px] font-black">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-black text-slate-900 break-words" title={task.name}>{withBreakOpportunities(task.name)}</span>
                          {task.isCoordinator && <FaCrown className="text-amber-500 shrink-0" title="Coordinadora" />}
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Orden: {task.order} &bull; Tipo: {task.type}
                          {task.lastExecutionDate ? ` • Última: ${new Date(task.lastExecutionDate).toLocaleString()}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={task.status} variant={isRunning ? "primary" : undefined}>
                        {isRunning && <FaSpinner className="animate-spin mr-1" />}
                        {STATUS_LABELS[task.status] || task.status || "—"}
                      </StatusBadge>
                      <button
                        onClick={() => onRemoveTask(task.id)}
                        disabled={removingTaskId === task.id}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100 disabled:opacity-50"
                      >
                        {removingTaskId === task.id ? "..." : "Remover"}
                      </button>
                    </div>
                  </div>

                  {isRunning && (
                    <div className="mt-3 w-full h-1.5 bg-white rounded-full overflow-hidden border border-primary-100">
                      <div
                        className="h-full bg-primary-500 transition-all duration-700"
                        style={{ width: `${Math.max(task.progress || 0, 4)}%` }}
                      />
                    </div>
                  )}

                  {isError && task.errorMessage && (
                    <div className="mt-3 flex gap-2 items-start bg-red-100/60 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                      <FaExclamationTriangle className="mt-0.5 shrink-0" />
                      <span className="break-words">{task.errorMessage}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between gap-3 px-6 py-4 border-t border-slate-200">
          <button
            onClick={() => onDismantle(groupName)}
            className="px-6 py-2.5 bg-red-50 text-red-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
          >
            Desmantelar grupo
          </button>
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-black transition-all"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
