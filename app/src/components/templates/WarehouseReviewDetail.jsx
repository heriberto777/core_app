import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  FaArrowLeft,
  FaChevronDown,
  FaChevronUp,
  FaExclamationTriangle,
  FaCheckCircle,
  FaSearch,
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

/**
 * pedidoLinea es un número local a CADA pedido (dos pedidos distintos suelen
 * compartir el mismo número de línea), y una misma línea puede tener una
 * parte pagada y otra bonificada (tipoLinea 'P'/'B') — por eso la clave de
 * edición tiene que incluir las tres partes, si no, se pisa el estado entre
 * líneas de distintos pedidos o entre lo pagado y lo bonificado.
 */
function lineKey(linea) {
  return `${linea.pedido}-${linea.pedidoLinea}-${linea.tipoLinea}`;
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

  const getLineValue = (linea) => {
    const key = lineKey(linea);
    return lineEdits[key] !== undefined ? lineEdits[key] : linea.cantidadActual;
  };

  const handleSaveLine = async (linea) => {
    const nuevaCantidad = Number(getLineValue(linea));
    if (Number.isNaN(nuevaCantidad) || nuevaCantidad < 0) return;
    const esBonificado = linea.tipoLinea === "B";
    await onSaveLine({
      pedido: linea.pedido,
      pedidoLinea: linea.pedidoLinea,
      tipoLinea: linea.tipoLinea,
      codeProduct: producto.codigo,
      cantidadOriginal: linea.cantidadOriginal,
      cantidadAjustada: nuevaCantidad,
      motivo: esBonificado
        ? `Bonificación ajustada de ${linea.cantidadActual} a ${nuevaCantidad} u`
        : tieneFaltante
          ? `Ajustado de ${linea.cantidadActual} a ${nuevaCantidad} u — falta de stock`
          : `Ajustado de ${linea.cantidadActual} a ${nuevaCantidad} u`,
    });

    // No sabemos la regla de promoción de Preventa para recalcular la
    // bonificación cuando se recorta lo pagado por faltante de stock — en
    // vez de adivinar, sugerimos 0 en la línea bonificada hermana (misma
    // pedido+pedidoLinea) y dejamos que el operador la confirme o la cambie.
    if (!esBonificado && nuevaCantidad < linea.cantidadOriginal) {
      const hermanaBonificada = producto.lineas.find(
        (l) => l.pedido === linea.pedido && l.pedidoLinea === linea.pedidoLinea && l.tipoLinea === "B"
      );
      if (hermanaBonificada) {
        setLineEdits((prev) => ({ ...prev, [lineKey(hermanaBonificada)]: 0 }));
      }
    }
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
                <th className="text-left px-5 py-2">Tipo</th>
                <th className="text-left px-5 py-2">Cliente</th>
                <th className="text-left px-5 py-2">Cantidad original</th>
                <th className="text-left px-5 py-2">Cantidad a enviar</th>
                <th className="text-left px-5 py-2">Ajuste</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {producto.lineas.map((linea) => (
                <tr key={lineKey(linea)} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-semibold text-slate-800">{linea.pedido}</td>
                  <td className="px-5 py-3">
                    {linea.tipoLinea === "B" ? (
                      <span className="inline-flex text-[11px] font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
                        Bonificado
                      </span>
                    ) : (
                      <span className="inline-flex text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                        Pagado
                      </span>
                    )}
                  </td>
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
                        setLineEdits((prev) => ({ ...prev, [lineKey(linea)]: e.target.value }))
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
  const { productos, loading, error, isSaving, isAuthorizing, warehouses, bodegaOrigen, actions } =
    useWarehouseReviewDetail(accessToken, loadId);
  const [search, setSearch] = useState("");

  const filteredProductos = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return productos;
    return productos.filter((producto) =>
      producto.codigo?.toLowerCase().includes(term) ||
      producto.descripcion?.toLowerCase().includes(term) ||
      producto.lineas.some((linea) =>
        linea.pedido?.toLowerCase().includes(term) ||
        linea.cliente?.toLowerCase().includes(term)
      )
    );
  }, [productos, search]);

  const handleAuthorize = async () => {
    if (!bodegaOrigen) {
      Swal.fire({
        icon: "warning",
        title: "Falta la bodega de origen",
        text: "Elegí de qué bodega sale la mercadería antes de autorizar el despacho.",
        confirmButtonColor: "#6366f1",
      });
      return;
    }

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

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por producto, pedido o cliente..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">
              Bodega de origen
            </label>
            <select
              value={bodegaOrigen}
              onChange={(e) => actions.setBodegaOrigen(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="">Seleccionar...</option>
              {warehouses.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingUI message="Cargando productos de la carga..." />
        ) : filteredProductos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 bg-white rounded-xl border border-slate-100">
            <FaSearch className="text-4xl" />
            <p className="font-semibold">Ningún producto coincide con la búsqueda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredProductos.map((producto) => (
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
