import { useState, useEffect } from "react";
import Swal from "sweetalert2";

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

    const addRule = async () => {
        const { value: formValues } = await Swal.fire({
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
              <option value="">Seleccione un tipo</option>
              <option value="FAMILY_DISCOUNT">Descuento por Familia</option>
              <option value="QUANTITY_BONUS">Bonificación por Cantidad</option>
              <option value="SCALED_BONUS">Bonificación Escalada</option>
              <option value="PRODUCT_BONUS">Bonificación por Producto</option>
              <option value="INVOICE_DISCOUNT">Descuento en Factura</option>
              <option value="ONE_TIME_OFFER">Oferta Única</option>
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

                return { name, type, description, priority, enabled, isOneTime, conditions: {}, actions: {} };
            },
        });

        if (formValues) {
            const newRules = [...rules, formValues];
            setRules(newRules);
            updatePromotionConfig({ rules: newRules });
        }
    };

    const editRule = async (index) => {
        const rule = rules[index];
        const { value: formValues } = await Swal.fire({
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
              <option value="FAMILY_DISCOUNT" ${rule.type === "FAMILY_DISCOUNT" ? "selected" : ""}>Descuento por Familia</option>
              <option value="QUANTITY_BONUS" ${rule.type === "QUANTITY_BONUS" ? "selected" : ""}>Bonificación por Cantidad</option>
              <option value="SCALED_BONUS" ${rule.type === "SCALED_BONUS" ? "selected" : ""}>Bonificación Escalada</option>
              <option value="PRODUCT_BONUS" ${rule.type === "PRODUCT_BONUS" ? "selected" : ""}>Bonificación por Producto</option>
              <option value="INVOICE_DISCOUNT" ${rule.type === "INVOICE_DISCOUNT" ? "selected" : ""}>Descuento en Factura</option>
              <option value="ONE_TIME_OFFER" ${rule.type === "ONE_TIME_OFFER" ? "selected" : ""}>Oferta Única</option>
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
            },
        });

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
