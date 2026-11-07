import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FaSync, FaClipboardCheck, FaBoxes, FaSearch } from "react-icons/fa";
import {
  useAuth,
  useWarehouseReview,
  Button,
  LoadingUI,
} from "../../index";

/**
 * fechaEntrega llega como 'YYYYMMDD' (CONVERT(..., 112) en
 * getTransformedOrdersData) — new Date() directo sobre eso da "Invalid Date".
 */
function formatFechaEntrega(value) {
  if (!value) return "—";
  const str = String(value);
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

/**
 * WarehouseReview — lista de cargas pendientes de Revisión de Almacén.
 * Nada de lo que aparece acá subió todavía a server2: review_status sigue
 * en 'pending' hasta que se autorice el despacho desde el detalle.
 */
export function WarehouseReview() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { loads, loading, refreshing, error, actions } = useWarehouseReview(accessToken);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (accessToken) actions.fetchLoads();
  }, [accessToken]);

  const filteredLoads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return loads;
    return loads.filter((carga) =>
      carga.loadId?.toLowerCase().includes(term) ||
      carga.route?.toLowerCase().includes(term) ||
      carga.bodega?.toLowerCase().includes(term)
    );
  }, [loads, search]);

  return (
    <div className="min-h-dvh bg-slate-50/50 dark:bg-slate-900 animate-fadeIn">
      <Helmet>
        <title>Revisión de Almacén | Catelli Core</title>
      </Helmet>

      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        <header className="flex flex-col xl:flex-row justify-between items-start gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Revisión de Almacén</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg font-medium leading-relaxed">
              Cargas armadas pendientes de conciliar antes de autorizar el despacho. Nada se envía
              a server2 hasta autorizar.
            </p>
          </div>
          <Button variant="primary" onClick={actions.refresh} loading={refreshing} className="!px-8">
            <FaSync /> Actualizar
          </Button>
        </header>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="relative max-w-md">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por carga, repartidor o bodega..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-premium overflow-hidden">
          {loading && !refreshing ? (
            <LoadingUI message="Cargando cargas pendientes de revisión..." />
          ) : loads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 dark:text-slate-500">
              <FaClipboardCheck className="text-4xl" />
              <p className="font-semibold">No hay cargas pendientes de revisión</p>
            </div>
          ) : filteredLoads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 dark:text-slate-500">
              <FaSearch className="text-4xl" />
              <p className="font-semibold">Ninguna carga coincide con la búsqueda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    <th className="text-left px-6 py-3">Carga</th>
                    <th className="text-left px-6 py-3">Repartidor</th>
                    <th className="text-left px-6 py-3">Bodega</th>
                    <th className="text-left px-6 py-3">Pedidos</th>
                    <th className="text-left px-6 py-3">Productos</th>
                    <th className="text-left px-6 py-3">Entrega</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoads.map((carga) => (
                    <tr key={carga.loadId} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-700/40">
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{carga.loadId}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{carga.route || "—"}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{carga.bodega || "—"}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{carga.totalPedidos}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 flex items-center gap-2">
                        <FaBoxes className="text-slate-400 dark:text-slate-500" /> {carga.totalProductos}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        {formatFechaEntrega(carga.fechaEntrega)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="secondary"
                          className="!px-5 !py-2"
                          onClick={() => navigate(`/loads/revision/${carga.loadId}`)}
                        >
                          Revisar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
