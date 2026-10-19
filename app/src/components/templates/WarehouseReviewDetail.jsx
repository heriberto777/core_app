import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  FaArrowLeft,
  FaChevronDown,
  FaChevronUp,
  FaExclamationTriangle,
  FaCheckCircle,
} from "react-icons/fa";
import Swal from "sweetalert2";
import {
  useAuth,
  useWarehouseReviewDetail,
  Button,
  LoadingUI,
} from "../../index";

/**
 * Convierte unidades planas a Cajas + Unidades sueltas usando el empaque
 * (CATELLI.ARTICULO.peso_bruto) del producto — el operador de Almacén
 * piensa/cuenta en cajas, no en unidades crudas.
 */
function toCajasUnidades(totalUnidades, empaque) {
  const pack = empaque > 0 ? empaque : 1;
  const cajas = Math.floor(totalUnidades / pack);
  const unidades = Math.round(totalUnidades - cajas * pack);
  return { cajas, unidades };
}

function ProductoRow({ producto, onSaveLine, isSaving }) {
  const [expanded, setExpanded] = useState(false);
  const { cajas: cajasActuales, unidades: unidadesActuales } = toCajasUnidades(producto.totalActual, producto.empaque);
  const [armadoCajas, setArmadoCajas] = useState(cajasActuales);
  const [armadoUnidades, setArmadoUnidades] = useState(unidadesActuales);
  const [lineEdits, setLineEdits] = useState({});

  const armadoRealUnidades = (Number(armadoCajas) || 0) * producto.empaque + (Number(armadoUnidades) || 0);
  const falta = producto.totalActual - armadoRealUnidades;
  const tieneFaltante = falta > 0;

  const handleArmadoChange = (field, value) => {
    if (field === "cajas") setArmadoCajas(value);
    else setArmadoUnidades(value);
    if (falta !== 0 && !expanded) setExpanded(true);
  };

  const getLineValue = (linea) =>
    lineEdits[linea.pedidoLinea] !== undefined ? lineEdits[linea.pedidoLinea] : linea.cantidadActual;

  const handleSaveLine = async (linea) => {
    const nuevaCantidad = Number(getLineValue(linea));
    if (Number.isNaN(nuevaCantidad) || nuevaCantidad < 0) return;
    await onSaveLine({
      pedido: linea.pedido,
      pedidoLinea: linea.pedidoLinea,
      codeProduct: producto.codigo,
      cantidadOriginal: linea.cantidadOriginal,
      cantidadAjustada: nuevaCantidad,
      motivo: tieneFaltante
        ? `Ajustado de ${linea.cantidadActual} a ${nuevaCantidad} u — falta de stock`
        : `Ajustado de ${linea.cantidadActual} a ${nuevaCantidad} u`,
    });
  };

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 bg-white">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>

        <div>
          <div className="font-bold text-slate-900">{producto.codigo} — {producto.descripcion}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Empaque: {producto.empaque} u/caja · Acumulado preventa: {producto.totalActual} u
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Cajas</label>
          <input
            type="number"
            min="0"
            value={armadoCajas}
            onChange={(e) => handleArmadoChange("cajas", e.target.value)}
            className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right"
          />
          <label className="text-xs font-semibold text-slate-500">Unid.</label>
          <input
            type="number"
            min="0"
            value={armadoUnidades}
            onChange={(e) => handleArmadoChange("unidades", e.target.value)}
            className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right"
          />
        </div>

        <div>
          {tieneFaltante ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full">
              <FaExclamationTriangle /> Falta {falta} u
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full">
              <FaCheckCircle /> Completo
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="text-left px-5 py-2">Pedido</th>
                <th className="text-left px-5 py-2">Cliente</th>
                <th className="text-left px-5 py-2">Cantidad original</th>
                <th className="text-left px-5 py-2">Cantidad a enviar</th>
                <th className="text-left px-5 py-2">Ajuste</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {producto.lineas.map((linea) => (
                <tr key={`${linea.pedido}-${linea.pedidoLinea}`} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-semibold text-slate-800">{linea.pedido}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {linea.cliente}
                    {linea.direccionCliente && (
                      <div className="text-xs text-slate-400">{linea.direccionCliente}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{linea.cantidadOriginal}</td>
                  <td className="px-5 py-3">
                    <input
                      type="number"
                      min="0"
                      value={getLineValue(linea)}
                      onChange={(e) =>
                        setLineEdits((prev) => ({ ...prev, [linea.pedidoLinea]: e.target.value }))
                      }
                      className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {linea.motivo ? (
                      <span className="text-amber-700 font-medium">{linea.motivo}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="secondary"
                      className="!px-4 !py-1.5 !text-xs"
                      disabled={isSaving || Number(getLineValue(linea)) === linea.cantidadActual}
                      onClick={() => handleSaveLine(linea)}
                    >
                      Guardar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * WarehouseReviewDetail — conciliación por producto de una carga.
 * El ajuste nunca toca CATELLI.PEDIDO_LINEA: queda en
 * core_app.loads_orders_adjustments. "Autorizar despacho" regenera el
 * staging con los ajustes aplicados y recién ahí dispara el traspaso real.
 */
export function WarehouseReviewDetail() {
  const { loadId } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { productos, loading, error, isSaving, isAuthorizing, actions } =
    useWarehouseReviewDetail(accessToken, loadId);

  const handleAuthorize = async () => {
    const result = await Swal.fire({
      title: "¿Autorizar despacho?",
      text: "Se va a generar el traspaso de inventario real para esta carga. Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#6366f1",
      confirmButtonText: "Sí, autorizar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;

    try {
      Swal.fire({
        title: "Autorizando despacho",
        text: "Generando traspaso de inventario...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });
      const res = await actions.authorize();
      Swal.fire({
        icon: "success",
        title: "Despacho autorizado",
        html: `<div class="text-left p-2"><p>Documento generado:</p><p class="mt-2 text-primary-600 font-bold">${res?.documento_inv || "N/A"}</p></div>`,
        confirmButtonColor: "#6366f1",
      });
      navigate("/loads/revision");
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "No se pudo autorizar",
        text: err.message || "Error al autorizar el despacho",
        confirmButtonColor: "#ef4444",
      });
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50/50 animate-fadeIn pb-28">
      <Helmet>
        <title>Revisión de Almacén — {loadId} | Catelli Core</title>
      </Helmet>

      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <button
            onClick={() => navigate("/loads/revision")}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 w-fit"
          >
            <FaArrowLeft /> Volver a Revisión de Almacén
          </button>
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Carga {loadId}</h1>
            <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
              Ingresá el armado real en Cajas + Unidades sueltas por producto. Si falta stock,
              ajustá las líneas de los pedidos que corresponda antes de autorizar.
            </p>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <LoadingUI message="Cargando productos de la carga..." />
        ) : (
          <div className="flex flex-col gap-3">
            {productos.map((producto) => (
              <ProductoRow
                key={producto.codigo}
                producto={producto}
                onSaveLine={actions.saveAdjustment}
                isSaving={isSaving}
              />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-2xl z-50">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate("/loads/revision")}>
            Volver después
          </Button>
          <Button variant="primary" onClick={handleAuthorize} loading={isAuthorizing} className="!px-8">
            Autorizar despacho →
          </Button>
        </div>
      </div>
    </div>
  );
}
