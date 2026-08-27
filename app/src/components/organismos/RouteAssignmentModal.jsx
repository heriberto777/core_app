import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaRoute } from "react-icons/fa";
import { Button, RoutesApi } from "../../index";

const routesApi = new RoutesApi();

const DAYS = [
  { key: "visit_mon", label: "Lun" },
  { key: "visit_tue", label: "Mar" },
  { key: "visit_wen", label: "Mié" },
  { key: "visit_thu", label: "Jue" },
  { key: "visit_fri", label: "Vie" },
  { key: "visit_sat", label: "Sáb" },
  { key: "visit_sun", label: "Dom" },
];

const emptyDays = DAYS.reduce((acc, d) => ({ ...acc, [d.key]: false }), {});

/**
 * RouteAssignmentModal (Tailwind Edition)
 * Asigna Repartidor · Ruta · Días de visita · Frecuencia · Semana a los
 * clientes seleccionados en el Centro de Carga.
 *
 * El "Vendedor" del cliente (accounts_syncs.code_seller) NO es lo que va acá
 * — es un dato distinto (quién le vende). Lo que se guarda en
 * route_accounts_syncs.code_seller es el Repartidor (quién le reparte),
 * elegido a mano — el docx STDB describe esta tabla como "necesaria para el
 * reparto", no como ruta de visitas del vendedor.
 */
export function RouteAssignmentModal({ isOpen, onClose, onSave, selectedCount, accessToken }) {
  const [routes, setRoutes] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [codeRoute, setCodeRoute] = useState("");
  const [codeRepartidor, setCodeRepartidor] = useState("");
  const [days, setDays] = useState(emptyDays);
  const [codeFrecuency, setCodeFrecuency] = useState("S");
  const [codeWeek, setCodeWeek] = useState("");
  const [organization, setOrganization] = useState("CATELLI");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCodeRoute("");
    setCodeRepartidor("");
    setDays(emptyDays);
    setCodeFrecuency("S");
    setCodeWeek("");
    setOrganization("CATELLI");

    routesApi
      .getRoutes(accessToken, { active: "true" })
      .then(setRoutes)
      .catch(() => setRoutes([]));

    routesApi
      .getRepartidoresFilter(accessToken)
      .then(setRepartidores)
      .catch(() => setRepartidores([]));
  }, [isOpen, accessToken]);

  const toggleDay = (key) => setDays((prev) => ({ ...prev, [key]: !prev[key] }));

  const hasAnyDay = Object.values(days).some(Boolean);
  const canSubmit = codeRoute && codeRepartidor && hasAnyDay && organization.trim() && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSave({
        codeRoute,
        codeRepartidor,
        days,
        codeFrecuency,
        codeWeek: codeWeek || null,
        organization: organization.trim().toUpperCase(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-xl shadow-premium flex flex-col overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
              <FaRoute size={18} />
            </div>
            Asignar Ruta de Reparto
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-8 space-y-5">
          <p className="text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-2 rounded-lg">
            Se va a aplicar a {selectedCount} cliente{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-500 ml-1">Organización</label>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value.toUpperCase())}
              placeholder="Ej: CATELLI"
              className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none uppercase"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-500 ml-1">Repartidor</label>
            <select
              value={codeRepartidor}
              onChange={(e) => setCodeRepartidor(e.target.value)}
              className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
            >
              <option value="">-- Seleccionar repartidor --</option>
              {repartidores.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-500 ml-1">Ruta</label>
            <select
              value={codeRoute}
              onChange={(e) => setCodeRoute(e.target.value)}
              className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
            >
              <option value="">-- Seleccionar ruta --</option>
              {routes.map((r) => (
                <option key={r.code_route} value={r.code_route}>
                  {r.code_route} — {r.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-500 ml-1">Días de Visita</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    days[d.key]
                      ? "bg-primary-500 border-primary-500 text-white"
                      : "bg-white border-slate-200 text-slate-500 hover:border-primary-300"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-500 ml-1">Frecuencia</label>
              <select
                value={codeFrecuency}
                onChange={(e) => {
                  setCodeFrecuency(e.target.value);
                  setCodeWeek("");
                }}
                className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
              >
                <option value="S">Semanal</option>
                <option value="Q">Quincenal</option>
                <option value="M">Mensual</option>
              </select>
            </div>

            {codeFrecuency === "Q" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-500 ml-1">Semana</label>
                <select
                  value={codeWeek}
                  onChange={(e) => setCodeWeek(e.target.value)}
                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
                >
                  <option value="">-- Elegir --</option>
                  <option value="0">Semana par</option>
                  <option value="1">Semana impar</option>
                </select>
              </div>
            )}

            {codeFrecuency === "M" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-500 ml-1">N° de Semana</label>
                <select
                  value={codeWeek}
                  onChange={(e) => setCodeWeek(e.target.value)}
                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
                >
                  <option value="">-- Elegir --</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!hasAnyDay && (
            <p className="text-xs text-amber-600">Seleccioná al menos un día de visita.</p>
          )}
        </div>

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading} disabled={!canSubmit}>
            <FaSave /> Asignar Ruta de Reparto
          </Button>
        </div>
      </div>
    </div>
  );
}
