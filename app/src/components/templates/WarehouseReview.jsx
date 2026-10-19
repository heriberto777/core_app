import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FaSync, FaClipboardCheck, FaBoxes } from "react-icons/fa";
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

  useEffect(() => {
    if (accessToken) actions.fetchLoads();
  }, [accessToken]);

  return (
    <div className="min-h-dvh bg-slate-50/50 animate-fadeIn">
      <Helmet>
        <title>Revisión de Almacén | Catelli Core</title>
      </Helmet>

      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        <header className="flex flex-col xl:flex-row justify-between items-start gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Revisión de Almacén</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
              Cargas armadas pendientes de conciliar antes de autorizar el despacho. Nada se envía
              a server2 hasta autorizar.
            </p>
          </div>
          <Button variant="primary" onClick={actions.refresh} loading={refreshing} className="!px-8">
            <FaSync /> Actualizar
          </Button>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-100 shadow-premium overflow-hidden">
          {loading && !refreshing ? (
            <LoadingUI message="Cargando cargas pendientes de revisión..." />
          ) : loads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
              <FaClipboardCheck className="text-4xl" />
              <p className="font-semibold">No hay cargas pendientes de revisión</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
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
                  {loads.map((carga) => (
                    <tr key={carga.loadId} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-6 py-4 font-semibold text-slate-900">{carga.loadId}</td>
                      <td className="px-6 py-4 text-slate-600">{carga.route || "—"}</td>
                      <td className="px-6 py-4 text-slate-600">{carga.bodega || "—"}</td>
                      <td className="px-6 py-4 text-slate-600">{carga.totalPedidos}</td>
                      <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                        <FaBoxes className="text-slate-400" /> {carga.totalProductos}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
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
