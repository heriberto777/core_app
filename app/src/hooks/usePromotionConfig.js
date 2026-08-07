import { useState, useEffect } from "react";
import Swal from "sweetalert2";

// Coincide exactamente con lo que server/services/PromotionProcessor.js sabe
// procesar (applyPromotionRule / evaluateRuleConditions). El schema real
// (server/models/transferMappingModel.js: PromotionRuleSchema) usa
// conditions/actions como Mixed precisamente porque la forma cambia según
// el tipo — no hay un shape único para todas las reglas.
const RULE_TYPES = [
    { value: "FAMILY_DISCOUNT", label: "Descuento por Familia" },
    { value: "QUANTITY_BONUS", label: "Bonificación por Cantidad" },
    { value: "SCALED_BONUS", label: "Bonificación Escalada" },
    { value: "PRODUCT_BONUS", label: "Bonificación por Producto" },
    { value: "INVOICE_DISCOUNT", label: "Descuento en Factura" },
    { value: "ONE_TIME_OFFER", label: "Oferta Única" },
    { value: "MINIMUM_QUANTITY", label: "Cantidad Mínima" },
    { value: "PERCENTAGE_BONUS", label: "Bonificación por Porcentaje" },
];

const CONDITION_OPERATORS = [
    { value: "equals", label: "Igual a" },
    { value: "greaterThan", label: "Mayor que" },
    { value: "lessThan", label: "Menor que" },
    { value: "includes", label: "Está en lista (separado por coma)" },
    { value: "excludes", label: "No está en lista (separado por coma)" },
];

const MAX_CONDITION_ROWS = 3;
const MAX_SCALE_ROWS = 3;
const MAX_BONUS_PRODUCT_ROWS = 3;

// conditions real: { [nombreCampo]: { equals|greaterThan|lessThan|includes|excludes: valor } }
// Se edita como hasta 3 filas (campo, operador, valor) por simplicidad de formulario.
function conditionsToRows(conditions = {}) {
    const rows = Object.entries(conditions).map(([field, condition]) => {
        const [operator, rawValue] = Object.entries(condition || {})[0] || ["equals", ""];
        const value = Array.isArray(rawValue) ? rawValue.join(", ") : (rawValue ?? "");
        return { field, operator, value };
    });
    while (rows.length < MAX_CONDITION_ROWS) rows.push({ field: "", operator: "equals", value: "" });
    return rows.slice(0, MAX_CONDITION_ROWS);
}

function rowsToConditions(rows) {
    const conditions = {};
    rows.forEach(({ field, operator, value }) => {
        if (!field || !field.trim() || value === "" || value === undefined) return;
        const isListOp = operator === "includes" || operator === "excludes";
        const parsedValue = isListOp
            ? value.split(",").map((v) => v.trim()).filter(Boolean)
            : (isNaN(Number(value)) ? value.trim() : Number(value));
        conditions[field.trim()] = { [operator]: parsedValue };
    });
    return conditions;
}

function conditionsRowsHtml(rows) {
    return rows.map((row, i) => `
    <div class="promotion-form-condition-row" style="display:flex;gap:6px;margin-bottom:6px;">
      <input id="condField${i}" class="promotion-form-input" placeholder="Campo (ej: COD_FAM)" value="${row.field || ""}" style="flex:1;">
      <select id="condOperator${i}" class="promotion-form-select" style="flex:1;">
        ${CONDITION_OPERATORS.map((op) => `<option value="${op.value}" ${row.operator === op.value ? "selected" : ""}>${op.label}</option>`).join("")}
      </select>
      <input id="condValue${i}" class="promotion-form-input" placeholder="Valor" value="${row.value || ""}" style="flex:1;">
    </div>
  `).join("");
}

function readConditionsFromForm() {
    const rows = [];
    for (let i = 0; i < MAX_CONDITION_ROWS; i++) {
        const fieldEl = document.getElementById(`condField${i}`);
        const operatorEl = document.getElementById(`condOperator${i}`);
        const valueEl = document.getElementById(`condValue${i}`);
        if (!fieldEl) continue;
        rows.push({ field: fieldEl.value, operator: operatorEl.value, value: valueEl.value });
    }
    return rowsToConditions(rows);
}

// Cada tipo de regla necesita campos de `actions` distintos — ver
// PromotionProcessor.js: applyFamilyDiscountRule/applyQuantityBonusRule/etc.
function actionsFieldsHtml(type, actions = {}) {
    switch (type) {
        case "FAMILY_DISCOUNT":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Descuento (%)</label>
          <input id="actDiscount" type="number" step="0.01" class="promotion-form-input" value="${actions.discount ?? ""}" placeholder="Ej: 10">
        </div>`;
        case "QUANTITY_BONUS":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Cantidad Umbral (bonusThreshold)</label>
          <input id="actBonusThreshold" type="number" class="promotion-form-input" value="${actions.bonusThreshold ?? ""}" placeholder="Ej: 10">
        </div>
        <div class="promotion-form-group">
          <label class="promotion-form-label">Cantidad de Bonificación por cada umbral</label>
          <input id="actBonusAmount" type="number" class="promotion-form-input" value="${actions.bonusAmount ?? ""}" placeholder="Ej: 1">
        </div>`;
        case "SCALED_BONUS": {
            const scales = actions.scales?.length ? actions.scales : [];
            const rows = [...scales];
            while (rows.length < MAX_SCALE_ROWS) rows.push({ minQuantity: "", maxQuantity: "", bonusAmount: "" });
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Escalas (mínimo / máximo opcional / bonificación)</label>
          ${rows.slice(0, MAX_SCALE_ROWS).map((s, i) => `
            <div style="display:flex;gap:6px;margin-bottom:6px;">
              <input id="scaleMin${i}" type="number" class="promotion-form-input" placeholder="Mín." value="${s.minQuantity ?? ""}" style="flex:1;">
              <input id="scaleMax${i}" type="number" class="promotion-form-input" placeholder="Máx. (opcional)" value="${s.maxQuantity ?? ""}" style="flex:1;">
              <input id="scaleBonus${i}" type="number" class="promotion-form-input" placeholder="Bonificación" value="${s.bonusAmount ?? ""}" style="flex:1;">
            </div>
          `).join("")}
        </div>`;
        }
        case "PRODUCT_BONUS": {
            const products = actions.bonusProducts?.length ? actions.bonusProducts : [];
            const rows = [...products];
            while (rows.length < MAX_BONUS_PRODUCT_ROWS) rows.push({ productCode: "", quantity: "" });
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Productos de Bonificación (código / cantidad)</label>
          ${rows.slice(0, MAX_BONUS_PRODUCT_ROWS).map((p, i) => `
            <div style="display:flex;gap:6px;margin-bottom:6px;">
              <input id="bonusProdCode${i}" class="promotion-form-input" placeholder="Código de producto" value="${p.productCode ?? ""}" style="flex:2;">
              <input id="bonusProdQty${i}" type="number" class="promotion-form-input" placeholder="Cantidad" value="${p.quantity ?? ""}" style="flex:1;">
            </div>
          `).join("")}
        </div>`;
        }
        case "INVOICE_DISCOUNT":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Monto Mínimo de Factura</label>
          <input id="actMinimumAmount" type="number" step="0.01" class="promotion-form-input" value="${actions.minimumAmount ?? ""}" placeholder="Ej: 5000">
        </div>
        <div class="promotion-form-group">
          <label class="promotion-form-label">Descuento (%)</label>
          <input id="actDiscountPercentage" type="number" step="0.01" class="promotion-form-input" value="${actions.discountPercentage ?? ""}" placeholder="Ej: 5">
        </div>`;
        case "ONE_TIME_OFFER":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Precio Especial</label>
          <input id="actSpecialPrice" type="number" step="0.01" class="promotion-form-input" value="${actions.specialPrice ?? ""}" placeholder="Ej: 99.00">
        </div>`;
        case "MINIMUM_QUANTITY":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Cantidad Mínima</label>
          <input id="actMinimumQuantity" type="number" class="promotion-form-input" value="${actions.minimumQuantity ?? ""}" placeholder="Ej: 5">
        </div>`;
        case "PERCENTAGE_BONUS":
            return `
        <div class="promotion-form-group">
          <label class="promotion-form-label">Bonificación (%)</label>
          <input id="actBonusPercentage" type="number" step="0.01" class="promotion-form-input" value="${actions.bonusPercentage ?? ""}" placeholder="Ej: 10">
        </div>`;
        default:
            return `<div class="promotion-form-group"><em>Selecciona un tipo de promoción para configurar sus parámetros.</em></div>`;
    }
}

function readActionsFromForm(type) {
    const num = (id) => {
        const el = document.getElementById(id);
        if (!el || el.value === "") return undefined;
        const n = parseFloat(el.value);
        return isNaN(n) ? undefined : n;
    };
    const str = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
    };

    switch (type) {
        case "FAMILY_DISCOUNT":
            return { discount: num("actDiscount") };
        case "QUANTITY_BONUS":
            return { bonusThreshold: num("actBonusThreshold"), bonusAmount: num("actBonusAmount") };
        case "SCALED_BONUS": {
            const scales = [];
            for (let i = 0; i < MAX_SCALE_ROWS; i++) {
                const minQuantity = num(`scaleMin${i}`);
                const bonusAmount = num(`scaleBonus${i}`);
                if (minQuantity === undefined || bonusAmount === undefined) continue;
                const maxQuantity = num(`scaleMax${i}`);
                scales.push({ minQuantity, ...(maxQuantity !== undefined ? { maxQuantity } : {}), bonusAmount });
            }
            return { scales };
        }
        case "PRODUCT_BONUS": {
            const bonusProducts = [];
            for (let i = 0; i < MAX_BONUS_PRODUCT_ROWS; i++) {
                const productCode = str(`bonusProdCode${i}`);
                if (!productCode) continue;
                bonusProducts.push({ productCode, quantity: num(`bonusProdQty${i}`) || 1 });
            }
            return { bonusProducts };
        }
        case "INVOICE_DISCOUNT":
            return { minimumAmount: num("actMinimumAmount"), discountPercentage: num("actDiscountPercentage") };
        case "ONE_TIME_OFFER":
            return { specialPrice: num("actSpecialPrice") };
        case "MINIMUM_QUANTITY":
            return { minimumQuantity: num("actMinimumQuantity") };
        case "PERCENTAGE_BONUS":
            return { bonusPercentage: num("actBonusPercentage") };
        default:
            return {};
    }
}

function ruleFormHtml(rule) {
    const conditionsRows = conditionsToRows(rule?.conditions);
    return `
    <div class="promotion-form-container" style="text-align:left;">
      <div class="promotion-form-group">
        <label class="promotion-form-label">Nombre de la Regla *</label>
        <input id="ruleName" class="promotion-form-input" placeholder="Ej: Descuento Familia Desechables" value="${rule?.name || ""}">
      </div>
      <div class="promotion-form-group">
        <label class="promotion-form-label">Tipo de Promoción *</label>
        <select id="ruleType" class="promotion-form-select">
          <option value="">Seleccione un tipo</option>
          ${RULE_TYPES.map((t) => `<option value="${t.value}" ${rule?.type === t.value ? "selected" : ""}>${t.label}</option>`).join("")}
        </select>
      </div>
      <div class="promotion-form-group">
        <label class="promotion-form-label">Descripción</label>
        <textarea id="ruleDescription" class="promotion-form-textarea" rows="2" placeholder="Describe cómo funciona esta promoción">${rule?.description || ""}</textarea>
      </div>
      <div class="promotion-form-group">
        <label class="promotion-form-label">Prioridad</label>
        <input id="rulePriority" type="number" class="promotion-form-input" value="${rule?.priority ?? 0}" min="0" max="100">
      </div>
      <div class="promotion-form-group">
        <label class="promotion-form-checkbox">
          <input id="ruleEnabled" type="checkbox" ${rule ? (rule.enabled ? "checked" : "") : "checked"}> Habilitada
        </label>
      </div>
      <div class="promotion-form-group">
        <label class="promotion-form-checkbox">
          <input id="ruleOneTime" type="checkbox" ${rule?.isOneTime ? "checked" : ""}> Oferta de una sola vez
        </label>
      </div>
      <hr style="margin:12px 0;border-color:#e5e7eb;">
      <div class="promotion-form-group">
        <label class="promotion-form-label">Condiciones (se deben cumplir todas)</label>
        <div id="conditionsRows">${conditionsRowsHtml(conditionsRows)}</div>
      </div>
      <hr style="margin:12px 0;border-color:#e5e7eb;">
      <div id="actionsFields">${actionsFieldsHtml(rule?.type, rule?.actions)}</div>
    </div>
  `;
}

export function usePromotionConfig(mapping = {}, handleChange) {
    const promotionConfig = mapping.promotionConfig || {};
    const [rules, setRules] = useState(promotionConfig.rules || []);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        setRules(promotionConfig.rules || []);
    }, [promotionConfig.rules]);

    const updatePromotionConfig = (newConfig) => {
        const updatedConfig = {
            ...promotionConfig,
            ...newConfig,
        };

        const event = {
            target: {
                name: "promotionConfig",
                value: updatedConfig,
                type: "custom",
            },
        };

        handleChange(event);
    };

    const handleEnableChange = (e) => {
        updatePromotionConfig({ enabled: e.target.checked });
    };

    const handleDetectFieldChange = (fieldName, value) => {
        const newDetectFields = {
            ...promotionConfig.detectFields,
            [fieldName]: value,
        };
        updatePromotionConfig({ detectFields: newDetectFields });
    };

    const handleTargetFieldChange = (fieldName, value) => {
        const newTargetFields = {
            ...promotionConfig.targetFields,
            [fieldName]: value,
        };
        updatePromotionConfig({ targetFields: newTargetFields });
    };

    const openRuleDialog = async (existingRule = null) => {
        const { value: formValues } = await Swal.fire({
            title: existingRule ? "Editar Regla de Promoción" : "Nueva Regla de Promoción",
            html: ruleFormHtml(existingRule),
            width: 560,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: existingRule ? "Guardar Cambios" : "Crear Regla",
            cancelButtonText: "Cancelar",
            didOpen: () => {
                const typeSelect = document.getElementById("ruleType");
                const actionsContainer = document.getElementById("actionsFields");
                typeSelect.addEventListener("change", () => {
                    actionsContainer.innerHTML = actionsFieldsHtml(typeSelect.value, existingRule?.type === typeSelect.value ? existingRule.actions : {});
                });
            },
            preConfirm: () => {
                const name = document.getElementById("ruleName").value.trim();
                const type = document.getElementById("ruleType").value;
                const description = document.getElementById("ruleDescription").value.trim();
                const priority = parseInt(document.getElementById("rulePriority").value, 10) || 0;
                const enabled = document.getElementById("ruleEnabled").checked;
                const isOneTime = document.getElementById("ruleOneTime").checked;

                if (!name || !type) {
                    Swal.showValidationMessage("Nombre y tipo son requeridos");
                    return false;
                }

                return {
                    ...(existingRule || {}),
                    name,
                    type,
                    description,
                    priority,
                    enabled,
                    isOneTime,
                    conditions: readConditionsFromForm(),
                    actions: readActionsFromForm(type),
                };
            },
        });

        return formValues || null;
    };

    const addRule = async () => {
        const formValues = await openRuleDialog();
        if (formValues) {
            const newRules = [...rules, formValues];
            setRules(newRules);
            updatePromotionConfig({ rules: newRules });
        }
    };

    const editRule = async (index) => {
        const formValues = await openRuleDialog(rules[index]);
        if (formValues) {
            const newRules = [...rules];
            newRules[index] = formValues;
            setRules(newRules);
            updatePromotionConfig({ rules: newRules });
        }
    };

    const deleteRule = async (index) => {
        const rule = rules[index];
        const result = await Swal.fire({
            title: "¿Eliminar Regla?",
            text: `¿Está seguro que desea eliminar la regla "${rule.name}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#ef4444",
            cancelButtonColor: "#6b7280",
            confirmButtonText: "Sí, eliminar",
            cancelButtonText: "Cancelar",
        });

        if (result.isConfirmed) {
            const newRules = rules.filter((_, i) => i !== index);
            setRules(newRules);
            updatePromotionConfig({ rules: newRules });
        }
    };

    return {
        promotionConfig,
        rules,
        showAdvanced,
        setShowAdvanced,
        handleEnableChange,
        handleDetectFieldChange,
        handleTargetFieldChange,
        addRule,
        editRule,
        deleteRule
    };
}
