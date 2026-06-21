import React from "react";
import {
  FaGift,
  FaPercentage,
  FaPlus,
  FaTrash,
  FaEdit,
  FaInfoCircle,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import { usePromotionConfig, Button, Input } from "../../index";

const PromotionConfigSection = ({ mapping = {}, handleChange }) => {
  const {
    promotionConfig,
    rules,
    showAdvanced,
    setShowAdvanced,
    handleEnableChange,
    handleDetectFieldChange,
    handleTargetFieldChange,
    addRule,
    editRule,
    deleteRule,
  } = usePromotionConfig(mapping, handleChange);

  const isEnabled = promotionConfig.enabled || false;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 mb-8 text-slate-900 dark:text-white shadow-lg">
      <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-200/50 dark:border-slate-700/50">
        <h2 className="flex items-center gap-3 text-2xl font-extrabold m-0 text-slate-900 dark:text-white">
          <FaGift className="text-blue-500" /> Configuración de Promociones
        </h2>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="promo-enable"
            className="absolute opacity-0 w-0 h-0"
            checked={isEnabled}
            onChange={handleEnableChange}
          />
          <label
            htmlFor="promo-enable"
            className="cursor-pointer w-12 h-6 bg-slate-200 dark:bg-slate-700 rounded-full relative border border-slate-300 dark:border-slate-600 before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:bg-white before:rounded-full before:transition-all duration-300"
          />
          <span className="ml-3 font-semibold text-white">
            {isEnabled ? "Activo" : "Inactivo"}
          </span>
        </div>
      </div>

      {!isEnabled ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400 gap-4 bg-slate-50/10 dark:bg-slate-700/10 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <FaInfoCircle size={40} className="opacity-50" />
          <p>El procesamiento de promociones está desactivado.</p>
          <small>Habilítalo para configurar reglas y campos de detección.</small>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-100/40 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-3xl p-6">
              <div className="flex justify-between items-center font-extrabold text-lg mb-6 text-slate-900 dark:text-white">
                Detección de Campos
              </div>
              <div className="flex flex-col gap-2">
                <Input
                  label="Campo Bonificación"
                  value={promotionConfig.detectFields?.bonusField || "ART_BON"}
                  onChange={(e) => handleDetectFieldChange("bonusField", e.target.value)}
                  placeholder="Ej: ART_BON"
                />
                <Input
                  label="Campo Referencia"
                  value={promotionConfig.detectFields?.referenceField || "COD_ART_RFR"}
                  onChange={(e) => handleDetectFieldChange("referenceField", e.target.value)}
                  placeholder="Ej: COD_ART_RFR"
                />
                <Input
                  label="Campo Descuento"
                  value={promotionConfig.detectFields?.discountField || "MON_DSC"}
                  onChange={(e) => handleDetectFieldChange("discountField", e.target.value)}
                  placeholder="Ej: MON_DSC"
                />
              </div>
            </div>

            <div className="bg-slate-100/40 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-3xl p-6">
              <div className="flex justify-between items-center font-extrabold text-lg mb-6 text-slate-900 dark:text-white">
                Campos Destino
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="bg-transparent border-none text-blue-400 cursor-pointer p-1 flex items-center hover:scale-110 transition-transform"
                >
                  {showAdvanced ? <FaChevronUp /> : <FaChevronDown />}
                </button>
              </div>

              {showAdvanced && (
                <div className="flex flex-col gap-2">
                  <Input
                    label="Línea Bonificación Ref"
                    value={promotionConfig.targetFields?.bonusLineRef || "PEDIDO_LINEA_BONIF"}
                    onChange={(e) => handleTargetFieldChange("bonusLineRef", e.target.value)}
                  />
                  <Input
                    label="Cantidad Pedida"
                    value={promotionConfig.targetFields?.orderedQuantity || "CANTIDAD_PEDIDA"}
                    onChange={(e) => handleTargetFieldChange("orderedQuantity", e.target.value)}
                  />
                  <Input
                    label="Cantidad Bonificación"
                    value={promotionConfig.targetFields?.bonusQuantity || "CANTIDAD_BONIF"}
                    onChange={(e) => handleTargetFieldChange("bonusQuantity", e.target.value)}
                  />
                </div>
              )}
              {!showAdvanced && <div className="text-xs text-slate-400 italic">Haz clic para configurar mapeo de campos destino.</div>}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-extrabold text-lg text-slate-900 dark:text-white">
                <FaGift /> Reglas de Promoción ({rules.length})
              </div>
              <Button variant="primary" onClick={addRule}>
                <FaPlus /> Nueva Regla
              </Button>
            </div>

            {rules.length === 0 ? (
              <div className="p-8 text-center bg-white/5 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300/30 text-slate-500/50 text-sm">
                No hay reglas configuradas. Las promociones se procesarán según los campos de detección por defecto.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {rules.map((rule, index) => (
                  <div
                    key={index}
                    className={`flex gap-5 bg-white dark:bg-slate-800 border-l-4 border-l-${getRuleColor(rule.type)} border-slate-200 dark:border-slate-700 rounded-2xl p-5 transition-all duration-300 ${
                      rule.enabled ? "" : "opacity-60"
                    } hover:bg-slate-100/30 dark:hover:bg-slate-700/30 hover:-translate-y-1 hover:shadow-lg`}
                    style={{ ...style }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                      style={{
                        backgroundColor: `${getRuleColor(rule.type)}40`,
                        color: getRuleColor(rule.type),
                      }}
                    >
                      {getRuleIcon(rule.type)}
                    </div>

                    <div className="flex-1 flex flex-col gap-1">
                      <div className="font-bold text-base">{rule.name}</div>
                      <span
                        className="text-xs font-extrabold uppercase px-1.5 py-0.5 rounded self-start"
                        style={{
                          color: getRuleColor(rule.type),
                          backgroundColor: `${getRuleColor(rule.type)}15`,
                        }}
                      >
                        {rule.type.replace(/_/g, " ")}
                      </span>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                        {rule.description}
                      </div>
                      <div className="flex gap-3.5 text-xs font-semibold mt-2.5 text-slate-500 dark:text-slate-400 opacity-70">
                        <span>Prioridad: {rule.priority || 0}</span>
                        {rule.isOneTime && <span className="text-amber-400 font-semibold">Oferta Única</span>}
                        <span className={rule.enabled ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                          {rule.enabled ? "Habilitada" : "Deshabilitada"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => editRule(index)}
                        title="Editar"
                        className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-700/60 text-blue-500 hover:bg-blue-500 hover:text-white hover:border-transparent transition-all"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={() => deleteRule(index)}
                        title="Eliminar"
                        className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-700/60 text-red-500 hover:bg-red-500 hover:text-white hover:border-transparent transition-all"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const getRuleIcon = (type) => {
  switch (type) {
    case "FAMILY_DISCOUNT":
    case "INVOICE_DISCOUNT":
      return <FaPercentage />;
    case "QUANTITY_BONUS":
    case "SCALED_BONUS":
    case "PRODUCT_BONUS":
      return <FaGift />;
    default:
      return <FaInfoCircle />;
  }
};

const getRuleColor = (type) => {
  switch (type) {
    case "FAMILY_DISCOUNT": return "#ef4444";
    case "INVOICE_DISCOUNT": return "#f87171";
    case "QUANTITY_BONUS": return "#10b981";
    case "SCALED_BONUS": return "#34d399";
    case "PRODUCT_BONUS": return "#60a5fa";
    default: return "#94a3b8";
  }
};

export default PromotionConfigSection;
