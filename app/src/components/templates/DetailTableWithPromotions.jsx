import React, { useState, useEffect } from "react";
import PromotionIndicator from "./PromotionIndicator";
import { FaEye, FaEyeSlash, FaGift } from "react-icons/fa";

const DetailTableWithPromotions = ({ data = [], mapping = {}, documentId }) => {
  const [showPromotionColumns, setShowPromotionColumns] = useState(true);
  const [processedData, setProcessedData] = useState([]);

  useEffect(() => {
    const processed = data.map((item) => ({
      ...item,
      _isPromotion: item._IS_BONUS_LINE || item._IS_TRIGGER_LINE,
      _promotionType: item._PROMOTION_TYPE || "NONE",
      _hasPromotionData: item.PEDIDO_LINEA_BONIF || item.CANTIDAD_BONIF,
    }));

    setProcessedData(processed);
  }, [data]);

  const promotionConfig = mapping.promotionConfig || {};
  const isPromotionEnabled = promotionConfig.enabled;

  const basicColumns = [
    { key: "NUM_LN", label: "Línea", width: "80px" },
    { key: "COD_ART", label: "Código", width: "120px" },
    { key: "DESCRIPCION", label: "Descripción", width: "200px" },
    { key: "CANTIDAD", label: "Cantidad", width: "100px" },
    { key: "PRECIO", label: "Precio", width: "100px" },
    { key: "TOTAL", label: "Total", width: "100px" },
  ];

  const promotionColumns = [
    { key: "PEDIDO_LINEA_BONIF", label: "Ref. Bonif.", width: "80px" },
    { key: "CANTIDAD_PEDIDA", label: "Cant. Pedida", width: "100px" },
    { key: "CANTIDAD_BONIF", label: "Cant. Bonif.", width: "100px" },
    { key: "CANTIDAD_A_FACTURAR", label: "Cant. Facturar", width: "100px" },
  ];

  const allColumns =
    showPromotionColumns && isPromotionEnabled
      ? [...basicColumns, ...promotionColumns]
      : basicColumns;

  const getRowClasses = (item) => {
    if (!isPromotionEnabled) return "";

    if (item._IS_BONUS_LINE) {
      return "bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-500";
    }
    if (item._IS_TRIGGER_LINE) {
      return "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500";
    }
    return "";
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
      <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
        <h3 className="flex items-center gap-2 m-0 text-lg font-semibold text-slate-900 dark:text-white">
          Detalles del Documento {documentId}
          {isPromotionEnabled && (
            <span className="flex items-center gap-1 bg-green-500 text-white px-2 py-1 rounded-full text-sm font-medium">
              <FaGift /> Promociones Activas
            </span>
          )}
        </h3>

        {isPromotionEnabled && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowPromotionColumns(!showPromotionColumns)}
              className={`flex items-center gap-2 px-4 py-2 border rounded text-sm cursor-pointer transition-opacity ${
                showPromotionColumns
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
              }`}
            >
              {showPromotionColumns ? <FaEyeSlash /> : <FaEye />}
              {showPromotionColumns ? "Ocultar" : "Mostrar"} Columnas de
              Promoción
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.key}
                  className="p-3 text-left bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 sticky top-0 z-10"
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
              {isPromotionEnabled && (
                <th className="p-3 text-left bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 sticky top-0 z-10" style={{ width: "60px" }}>
                  Promo
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {processedData.map((item, index) => (
              <tr key={index} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${getRowClasses(item)}`}>
                {allColumns.map((col) => (
                  <td key={col.key} className="p-3 border-b border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    {col.key === "PEDIDO_LINEA_BONIF" && item[col.key] ? (
                      <span className="text-blue-500 font-medium cursor-pointer hover:underline">→ Línea {item[col.key]}</span>
                    ) : (
                      item[col.key] || "-"
                    )}
                  </td>
                ))}
                {isPromotionEnabled && (
                  <td className="p-3 border-b border-slate-100 dark:border-slate-700">
                    <PromotionIndicator
                      promotionType={item._promotionType}
                      isBonus={item._IS_BONUS_LINE}
                      isTrigger={item._IS_TRIGGER_LINE}
                      bonusLineRef={item.PEDIDO_LINEA_BONIF}
                      size="small"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isPromotionEnabled && (
        <div className="p-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              Línea de Bonificación
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="w-4 h-4 rounded bg-blue-500"></div>
              Línea que Dispara Promoción
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="w-4 h-4 rounded bg-amber-500"></div>
              Promoción Aplicada
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetailTableWithPromotions;
