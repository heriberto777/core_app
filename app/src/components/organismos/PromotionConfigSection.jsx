import React from "react";
import { FaCogs, FaPlus, FaTrash, FaEdit, FaTrophy } from "react-icons/fa";
import { Button, Input, Select } from "../../index";

const PROMOTION_TYPES = [
  { value: "FAMILY_DISCOUNT", label: "Descuento por Familia" },
  { value: "QUANTITY_BONUS", label: "Bonificación por Cantidad" },
  { value: "SCALED_BONUS", label: "Bonificación Escalada" },
  { value: "PRODUCT_BONUS", label: "Bonificación por Producto" },
  { value: "INVOICE_DISCOUNT", label: "Descuento en Factura" },
  { value: "ONE_TIME_OFFER", label: "Oferta Única" },
];

const DETECT_FIELDS = [
  { value: "ART_BON", label: "Artículo con bonificación" },
  { value: "COD_ART_RFR", label: "Referencia del artículo" },
  { value: "MON_DSC", label: "Moneda de descuento" },
];

const TARGET_FIELDS = [
  { value: "PEDIDO_LINEA_BONIF", label: "Línea de bonificación pedido" },
  { value: "CANTIDAD_PEDIDA", label: "Cantidad solicitada" },
  { value: "CANTIDAD_BONIF", label: "Cantidad de bonificación" },
];

export function PromotionConfigSection({ mapping = {}, handleChange }) {
  const promotionConfig = mapping.promotionConfig || {};
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const detectFieldOptions = DETECT_FIELDS.map(f => (
    <option key={f.value} value={f.value}>{f.label}</option>
  ));

  const targetFieldOptions = TARGET_FIELDS.map(f => (
    <option key={f.value} value={f.value}>{f.label}</option>
  ));

  const detectFieldInputs = [
    { value: "detectFields.bonusField", label: "Artículo con bonificación", default: "ART_BON" },
    { value: "detectFields.referenceField", label: "Referencia del artículo", default: "COD_ART_RFR" },
    { value: "detectFields.discountField", label: "Moneda de descuento", default: "MON_DSC" },
  ];

  const targetFieldInputs = [
    { value: "targetFields.bonusLineRef", label: "Línea de bonificación pedido", default: "PEDIDO_LINEA_BONIF" },
    { value: "targetFields.orderedQuantity", label: "Cantidad solicitada", default: "CANTIDAD_PEDIDA" },
    { value: "targetFields.bonusQuantity", label: "Cantidad de bonificación", default: "CANTIDAD_BONIF" },
  ];

  const handleAddRule = async () => {
    const { value: formValues } = await import("sweetalert2").then(m => m.Swal.fire({
      title: "Nueva Regla de Promoción",
      html: `
        <div class="promotion-form-container">
          <div class="promotion-form-group">
            <label class="promotion-form-label">Nombre de la Regla *</label>
            <input id="ruleName" class="promotion-form-input" placeholder="Ej: Descuento Familia Desechables">
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Tipo de Promoción *</label>
            <select id="ruleType" class="promotion-form-select">
              ${PROMOTION_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Descripción</label>
            <textarea id="ruleDescription" class="promotion-form-textarea" rows="3" placeholder="Describe cómo funciona esta promoción"></textarea>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Prioridad</label>
            <input id="rulePriority" type="number" class="promotion-form-input" value="0" min="0" max="100">
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleEnabled" type="checkbox" checked> Habilitada
            </label>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleOneTime" type="checkbox"> Oferta de una sola vez
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Crear Regla",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const type = document.getElementById("ruleType").value;
        const description = document.getElementById("ruleDescription").value;
        const priority = parseInt(document.getElementById("rulePriority").value);
        const enabled = document.getElementById("ruleEnabled").checked;
        const isOneTime = document.getElementById("ruleOneTime").checked;

        if (!name || !type) {
          Swal.showValidationMessage("Nombre y tipo son requeridos");
          return false;
        }

        return {
          name,
          type,
          description,
          priority,
          enabled,
          isOneTime,
          conditions: {
            detectFields: {
              bonusField: promotionConfig.detectFields?.bonusField || "ART_BON",
              referenceField: promotionConfig.detectFields?.referenceField || "COD_ART_RFR",
              discountField: promotionConfig.detectFields?.discountField || "MON_DSC"
            },
            targetFields: {
              bonusLineRef: promotionConfig.targetFields?.bonusLineRef || "PEDIDO_LINEA_BONIF",
              orderedQuantity: promotionConfig.targetFields?.orderedQuantity || "CANTIDAD_PEDIDA",
              bonusQuantity: promotionConfig.targetFields?.bonusQuantity || "CANTIDAD_BONIF"
            }
          },
          actions: {
            bonusField: promotionConfig.detectFields?.bonusField || "ART_BON",
            bonusFieldValue: promotionConfig.detectFields?.discountField || "MON_DSC",
            targetField: promotionConfig.targetFields?.bonusLineRef || "PEDIDO_LINEA_BONIF",
            targetFieldValue: promotionConfig.targetFields?.orderedQuantity || "CANTIDAD_PEDIDA"
          }
        };
      }
    }));

    if (formValues) {
      const newRules = [...(promotionConfig.rules || []), formValues];
      handleChange({
        target: {
          name: "promotionConfig",
          type: "custom",
          value: { ...promotionConfig, rules: newRules }
        }
      });
    }
  };

  const handleEditRule = async (index) => {
    const rule = promotionConfig.rules[index];
    const { value: formValues } = await import("sweetalert2").then(m => m.Swal.fire({
      title: "Editar Regla de Promoción",
      html: `
        <div class="promotion-form-container">
          <div class="promotion-form-group">
            <label class="promotion-form-label">Nombre de la Regla *</label>
            <input id="ruleName" class="promotion-form-input" value="${rule.name}">
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Tipo de Promoción *</label>
            <select id="ruleType" class="promotion-form-select">
              ${PROMOTION_TYPES.map(t => `<option value="${t.value}" ${t.value === rule.type ? "selected" : ""}>${t.label}</option>`).join("")}
            </select>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Descripción</label>
            <textarea id="ruleDescription" class="promotion-form-textarea" rows="3">${rule.description || ""}</textarea>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-label">Prioridad</label>
            <input id="rulePriority" type="number" class="promotion-form-input" value="${rule.priority || 0}" min="0" max="100">
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleEnabled" type="checkbox" ${rule.enabled ? "checked" : ""}> Habilitada
            </label>
          </div>
          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleOneTime" type="checkbox" ${rule.isOneTime ? "checked" : ""}> Oferta de una sola vez
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar Cambios",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const type = document.getElementById("ruleType").value;
        const description = document.getElementById("ruleDescription").value;
        const priority = parseInt(document.getElementById("rulePriority").value);
        const enabled = document.getElementById("ruleEnabled").checked;
        const isOneTime = document.getElementById("ruleOneTime").checked;

        if (!name || !type) {
          Swal.showValidationMessage("Nombre y tipo son requeridos");
          return false;
        }

        return { ...rule, name, type, description, priority, enabled, isOneTime };
      }
    }));

    if (formValues) {
      const newRules = [...promotionConfig.rules];
      newRules[index] = formValues;
      handleChange({
        target: {
          name: "promotionConfig",
          type: "custom",
          value: { ...promotionConfig, rules: newRules }
        }
      });
    }
  };

  const handleDeleteRule = async (index) => {
    const rule = promotionConfig.rules[index];
    const result = await import("sweetalert2").then(m => m.Swal.fire({
      title: "¿Eliminar Regla?",
      text: `¿Está seguro que desea eliminar la regla "${rule.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    }));

    if (result.isConfirmed) {
      const newRules = promotionConfig.rules.filter((_, i) => i !== index);
      handleChange({
        target: {
          name: "promotionConfig",
          type: "custom",
          value: { ...promotionConfig, rules: newRules }
        }
      });
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 border-2 border-indigo-200 rounded-3xl p-8 mb-8 shadow-lg animate-fadeIn">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/30">
          <FaTrophy className="text-2xl" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-2xl font-black text-slate-900 leading-tight">
            Reglas de Promoción
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Configure las reglas de bonificación para aplicar descuentos y recompensas en sus documentos
          </p>
        </div>
      </div>

      {/* ENABLE TOGGLE */}
      <label className="flex items-center gap-4 px-8 py-5 rounded-2xl cursor-pointer transition-all border-2 mb-8 group">
        <div className={`w-12 h-6 rounded-full p-1 transition-colors relative ${promotionConfig.enabled ? "bg-indigo-600" : "bg-slate-300"}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${promotionConfig.enabled ? "translate-x-6" : "translate-x-0"}`} />
        </div>
        <input
          type="checkbox"
          className="sr-only"
          id="promotion-enabled"
          checked={promotionConfig.enabled}
          onChange={(e) => handleChange({
            target: {
              name: "promotionConfig",
              type: "custom",
              value: { ...promotionConfig, enabled: e.target.checked }
            }
          })}
        />
        <div className="flex flex-col">
          <span className={`text-sm font-black uppercase tracking-wider ${promotionConfig.enabled ? "text-indigo-700" : "text-slate-500"}`}>
            Activar Promociones
          </span>
          <span className="text-xs font-bold text-slate-400">
            {promotionConfig.enabled ? "Promociones activas" : "Promociones desactivadas"}
          </span>
        </div>
      </label>

      {/* DETECT FIELDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 bg-white/80 backdrop-blur-sm border border-indigo-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FaCogs className="text-indigo-500" />
            <h4 className="font-bold text-slate-700">Campos de Detección</h4>
          </div>
          <div className="space-y-3">
            {detectFieldInputs.map(({ value, label, default: defaultVal }) => (
              <div key={value}>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  {label}
                </label>
                <input
                  type="text"
                  name={value}
                  value={promotionConfig[`${value.replace(/\./g, '_')}] || defaultVal}` || defaultVal}
                  onChange={(e) => handleChange({
                    target: {
                      name: value,
                      type: "text",
                      value: e.target.value
                    }
                  })}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-medium"
                  placeholder={`Ej: ${defaultVal}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-white/80 backdrop-blur-sm border border-purple-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FaCogs className="text-purple-500" />
            <h4 className="font-bold text-slate-700">Campos de Destino</h4>
          </div>
          <div className="space-y-3">
            {targetFieldInputs.map(({ value, label, default: defaultVal }) => (
              <div key={value}>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  {label}
                </label>
                <input
                  type="text"
                  name={value}
                  value={promotionConfig[`${value.replace(/\./g, '_')}] || defaultVal}` || defaultVal}
                  onChange={(e) => handleChange({
                    target: {
                      name: value,
                      type: "text",
                      value: e.target.value
                    }
                  })}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all font-medium"
                  placeholder={`Ej: ${defaultVal}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RULES LIST */}
      <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center pb-4 border-b border-indigo-100">
          <div>
            <h4 className="text-lg font-bold text-slate-800">Reglas Activas</h4>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {promotionConfig.rules?.length || 0} reglas configuradas
            </p>
          </div>
          <Button variant="primary" onClick={handleAddRule} className="flex items-center gap-2">
            <FaPlus /> Añadir Regla
          </Button>
        </div>

        {promotionConfig.rules?.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {promotionConfig.rules.map((rule, idx) => (
              <div key={idx} className="flex justify-between items-center p-5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 hover:from-indigo-50/100 hover:to-purple-50/100 border border-indigo-100 rounded-2xl transition-all group">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-wider bg-indigo-100 px-2 py-1 rounded-md">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-slate-800 text-lg">{rule.name}</div>
                      <div className="text-xs text-slate-500 font-medium mt-1">
                        <span className="text-indigo-600 font-bold">{PROMOTION_TYPES.find(t => t.value === rule.type)?.label || rule.type}</span>
                        {rule.isOneTime && <span className="text-purple-600 font-bold ml-2">• Oferta Única</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" className="bg-white p-2" onClick={() => handleEditRule(idx)}><FaEdit /></Button>
                  <Button variant="ghost" className="bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => handleDeleteRule(idx)}><FaTrash /></Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white/60 backdrop-blur-sm rounded-2xl border-2 border-dashed border-indigo-200">
            <FaTrophy className="text-4xl text-indigo-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay reglas de promoción configuradas</p>
            <Button variant="primary" onClick={handleAddRule} className="mt-4 flex items-center gap-2">
              <FaPlus /> Crear Primera Regla
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PromotionConfigSection;
