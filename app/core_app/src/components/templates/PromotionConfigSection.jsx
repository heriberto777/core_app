import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import {
  FaGift,
  FaPercentage,
  FaPlus,
  FaTrash,
  FaEdit,
  FaCheck,
  FaTimes,
  FaInfoCircle,
  FaArrowRight,
} from "react-icons/fa";

const PromotionConfigSection = ({ mapping = {}, handleChange }) => {
  // Acceso seguro a la configuración de promociones
  const promotionConfig = mapping.promotionConfig || {};
  const isEnabled = promotionConfig.enabled || false;

  // Estados locales
  const [rules, setRules] = useState(promotionConfig.rules || []);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sincronizar con el estado principal cuando cambie
  useEffect(() => {
    setRules(promotionConfig.rules || []);
  }, [promotionConfig.rules]);

  // Función para actualizar la configuración completa
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

  // Manejar cambio de habilitación
  const handleEnableChange = (e) => {
    updatePromotionConfig({ enabled: e.target.checked });
  };

  // Manejar cambio de campos de detección
  const handleDetectFieldChange = (fieldName, value) => {
    const newDetectFields = {
      ...promotionConfig.detectFields,
      [fieldName]: value,
    };

    updatePromotionConfig({ detectFields: newDetectFields });
  };

  // Manejar cambio de campos destino
  const handleTargetFieldChange = (fieldName, value) => {
    const newTargetFields = {
      ...promotionConfig.targetFields,
      [fieldName]: value,
    };

    updatePromotionConfig({ targetFields: newTargetFields });
  };

  // Agregar nueva regla
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
      customClass: {
        popup: "promotion-popup",
        title: "promotion-title",
        content: "promotion-content",
      },
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const type = document.getElementById("ruleType").value;
        const description = document.getElementById("ruleDescription").value;
        const priority = parseInt(
          document.getElementById("rulePriority").value
        );
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
          conditions: {},
          actions: {},
        };
      },
    });

    if (formValues) {
      const newRules = [...rules, formValues];
      setRules(newRules);
      updatePromotionConfig({ rules: newRules });
    }
  };

  // Editar regla existente
  const editRule = async (index) => {
    const rule = rules[index];

    const { value: formValues } = await Swal.fire({
      title: "Editar Regla de Promoción",
      html: `
        <div class="promotion-form-container">
          <div class="promotion-form-group">
            <label class="promotion-form-label">Nombre de la Regla *</label>
            <input id="ruleName" class="promotion-form-input" value="${
              rule.name
            }">
          </div>

          <div class="promotion-form-group">
            <label class="promotion-form-label">Tipo de Promoción *</label>
            <select id="ruleType" class="promotion-form-select">
              <option value="FAMILY_DISCOUNT" ${
                rule.type === "FAMILY_DISCOUNT" ? "selected" : ""
              }>Descuento por Familia</option>
              <option value="QUANTITY_BONUS" ${
                rule.type === "QUANTITY_BONUS" ? "selected" : ""
              }>Bonificación por Cantidad</option>
              <option value="SCALED_BONUS" ${
                rule.type === "SCALED_BONUS" ? "selected" : ""
              }>Bonificación Escalada</option>
              <option value="PRODUCT_BONUS" ${
                rule.type === "PRODUCT_BONUS" ? "selected" : ""
              }>Bonificación por Producto</option>
              <option value="INVOICE_DISCOUNT" ${
                rule.type === "INVOICE_DISCOUNT" ? "selected" : ""
              }>Descuento en Factura</option>
              <option value="ONE_TIME_OFFER" ${
                rule.type === "ONE_TIME_OFFER" ? "selected" : ""
              }>Oferta Única</option>
            </select>
          </div>

          <div class="promotion-form-group">
            <label class="promotion-form-label">Descripción</label>
            <textarea id="ruleDescription" class="promotion-form-textarea" rows="3">${
              rule.description || ""
            }</textarea>
          </div>

          <div class="promotion-form-group">
            <label class="promotion-form-label">Prioridad</label>
            <input id="rulePriority" type="number" class="promotion-form-input" value="${
              rule.priority || 0
            }" min="0" max="100">
          </div>

          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleEnabled" type="checkbox" ${
                rule.enabled ? "checked" : ""
              }> Habilitada
            </label>
          </div>

          <div class="promotion-form-group">
            <label class="promotion-form-checkbox">
              <input id="ruleOneTime" type="checkbox" ${
                rule.isOneTime ? "checked" : ""
              }> Oferta de una sola vez
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar Cambios",
      cancelButtonText: "Cancelar",
      customClass: {
        popup: "promotion-popup",
        title: "promotion-title",
        content: "promotion-content",
      },
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const type = document.getElementById("ruleType").value;
        const description = document.getElementById("ruleDescription").value;
        const priority = parseInt(
          document.getElementById("rulePriority").value
        );
        const enabled = document.getElementById("ruleEnabled").checked;
        const isOneTime = document.getElementById("ruleOneTime").checked;

        if (!name || !type) {
          Swal.showValidationMessage("Nombre y tipo son requeridos");
          return false;
        }

        return {
          ...rule,
          name,
          type,
          description,
          priority,
          enabled,
          isOneTime,
        };
      },
    });

    if (formValues) {
      const newRules = [...rules];
      newRules[index] = formValues;
      setRules(newRules);
      updatePromotionConfig({ rules: newRules });
    }
  };

  // Eliminar regla
  const deleteRule = async (index) => {
    const rule = rules[index];

    const result = await Swal.fire({
      title: "¿Eliminar Regla?",
      text: `¿Está seguro que desea eliminar la regla "${rule.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      const newRules = rules.filter((_, i) => i !== index);
      setRules(newRules);
      updatePromotionConfig({ rules: newRules });
    }
  };

  // Obtener icono según tipo de regla
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

  // Obtener color según tipo de regla
  const getRuleColor = (type) => {
    switch (type) {
      case "FAMILY_DISCOUNT":
      case "INVOICE_DISCOUNT":
        return "#e74c3c";
      case "QUANTITY_BONUS":
      case "SCALED_BONUS":
      case "PRODUCT_BONUS":
        return "#2ecc71";
      case "ONE_TIME_OFFER":
        return "#f39c12";
      default:
        return "#3498db";
    }
  };

  return (
    <ConfigSection>
      <SectionTitle>
        <FaGift /> Configuración de Promociones y Bonificaciones
      </SectionTitle>

      {/* Habilitación principal */}
      <EnableSection>
        <CheckboxContainer>
          <CheckboxInput
            type="checkbox"
            checked={isEnabled}
            onChange={handleEnableChange}
          />
          <FormLabel>Habilitar procesamiento de promociones</FormLabel>
        </CheckboxContainer>
        <HelpText>
          Al habilitar esta opción, el sistema detectará automáticamente
          promociones en los documentos y las procesará según la configuración
          definida.
        </HelpText>
      </EnableSection>

      {isEnabled && (
        <>
          {/* Configuración básica */}
          <BasicConfigSection>
            <SubSectionTitle>Configuración Básica</SubSectionTitle>

            <ConfigGrid>
              <FormGroup>
                <FormLabel>Campo de Bonificación</FormLabel>
                <FormInput
                  type="text"
                  value={promotionConfig.detectFields?.bonusField || "ART_BON"}
                  onChange={(e) =>
                    handleDetectFieldChange("bonusField", e.target.value)
                  }
                  placeholder="Ej: ART_BON"
                />
                <HelpText>
                  Campo que indica si una línea es bonificación (normalmente
                  'B')
                </HelpText>
              </FormGroup>

              <FormGroup>
                <FormLabel>Campo de Referencia</FormLabel>
                <FormInput
                  type="text"
                  value={
                    promotionConfig.detectFields?.referenceField ||
                    "COD_ART_RFR"
                  }
                  onChange={(e) =>
                    handleDetectFieldChange("referenceField", e.target.value)
                  }
                  placeholder="Ej: COD_ART_RFR"
                />
                <HelpText>Campo que referencia al artículo regular</HelpText>
              </FormGroup>

              <FormGroup>
                <FormLabel>Campo de Descuento</FormLabel>
                <FormInput
                  type="text"
                  value={
                    promotionConfig.detectFields?.discountField || "MON_DSC"
                  }
                  onChange={(e) =>
                    handleDetectFieldChange("discountField", e.target.value)
                  }
                  placeholder="Ej: MON_DSC"
                />
                <HelpText>Campo que contiene el monto de descuento</HelpText>
              </FormGroup>

              <FormGroup>
                <FormLabel>Campo Número de Línea</FormLabel>
                <FormInput
                  type="text"
                  value={
                    promotionConfig.detectFields?.lineNumberField || "NUM_LN"
                  }
                  onChange={(e) =>
                    handleDetectFieldChange("lineNumberField", e.target.value)
                  }
                  placeholder="Ej: NUM_LN"
                />
                <HelpText>Campo que contiene el número de línea</HelpText>
              </FormGroup>
            </ConfigGrid>
          </BasicConfigSection>

          {/* Configuración avanzada */}
          <AdvancedToggle onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? <FaTimes /> : <FaPlus />}
            Configuración Avanzada
          </AdvancedToggle>

          {showAdvanced && (
            <AdvancedConfigSection>
              <SubSectionTitle>Campos Destino</SubSectionTitle>

              <ConfigGrid>
                <FormGroup>
                  <FormLabel>Campo Línea Bonificación</FormLabel>
                  <FormInput
                    type="text"
                    value={
                      promotionConfig.targetFields?.bonusLineRef ||
                      "PEDIDO_LINEA_BONIF"
                    }
                    onChange={(e) =>
                      handleTargetFieldChange("bonusLineRef", e.target.value)
                    }
                    placeholder="Ej: PEDIDO_LINEA_BONIF"
                  />
                </FormGroup>

                <FormGroup>
                  <FormLabel>Campo Cantidad Pedida</FormLabel>
                  <FormInput
                    type="text"
                    value={
                      promotionConfig.targetFields?.orderedQuantity ||
                      "CANTIDAD_PEDIDA"
                    }
                    onChange={(e) =>
                      handleTargetFieldChange("orderedQuantity", e.target.value)
                    }
                    placeholder="Ej: CANTIDAD_PEDIDA"
                  />
                </FormGroup>

                <FormGroup>
                  <FormLabel>Campo Cantidad Bonificación</FormLabel>
                  <FormInput
                    type="text"
                    value={
                      promotionConfig.targetFields?.bonusQuantity ||
                      "CANTIDAD_BONIF"
                    }
                    onChange={(e) =>
                      handleTargetFieldChange("bonusQuantity", e.target.value)
                    }
                    placeholder="Ej: CANTIDAD_BONIF"
                  />
                </FormGroup>

                <FormGroup>
                  <FormLabel>Campo Cantidad a Facturar</FormLabel>
                  <FormInput
                    type="text"
                    value={
                      promotionConfig.targetFields?.invoiceQuantity ||
                      "CANTIDAD_A_FACTURAR"
                    }
                    onChange={(e) =>
                      handleTargetFieldChange("invoiceQuantity", e.target.value)
                    }
                    placeholder="Ej: CANTIDAD_A_FACTURAR"
                  />
                </FormGroup>
              </ConfigGrid>
            </AdvancedConfigSection>
          )}

          {/* Reglas de promoción */}
          <RulesSection>
            <RulesHeader>
              <SubSectionTitle>Reglas de Promoción</SubSectionTitle>
              <AddRuleButton onClick={addRule}>
                <FaPlus /> Agregar Regla
              </AddRuleButton>
            </RulesHeader>

            {rules.length > 0 ? (
              <RulesList>
                {rules.map((rule, index) => (
                  <RuleItem key={index} ruleColor={getRuleColor(rule.type)}>
                    <RuleIcon ruleColor={getRuleColor(rule.type)}>
                      {getRuleIcon(rule.type)}
                    </RuleIcon>

                    <RuleContent>
                      <RuleTitle>{rule.name}</RuleTitle>
                      <RuleType>{rule.type.replace("_", " ")}</RuleType>
                      {rule.description && (
                        <RuleDescription>{rule.description}</RuleDescription>
                      )}
                      <RuleStatus>
                        {rule.enabled ? (
                          <StatusActive>
                            <FaCheck /> Activa
                          </StatusActive>
                        ) : (
                          <StatusInactive>
                            <FaTimes /> Inactiva
                          </StatusInactive>
                        )}
                        {rule.isOneTime && (
                          <OneTimeTag>Oferta Única</OneTimeTag>
                        )}
                        <PriorityTag>
                          Prioridad: {rule.priority || 0}
                        </PriorityTag>
                      </RuleStatus>
                    </RuleContent>

                    <RuleActions>
                      <ActionButton
                        onClick={() => editRule(index)}
                        title="Editar"
                      >
                        <FaEdit />
                      </ActionButton>
                      <ActionButton
                        onClick={() => deleteRule(index)}
                        title="Eliminar"
                        danger
                      >
                        <FaTrash />
                      </ActionButton>
                    </RuleActions>
                  </RuleItem>
                ))}
              </RulesList>
            ) : (
              <EmptyRules>
                <FaInfoCircle />
                <p>No hay reglas de promoción configuradas.</p>
                <p>Haz clic en "Agregar Regla" para crear tu primera regla.</p>
              </EmptyRules>
            )}
          </RulesSection>

          {/* Información de ayuda */}
          <HelpSection>
            <HelpTitle>
              <FaInfoCircle /> Información
            </HelpTitle>
            <HelpList>
              <HelpListItem>
                <FaArrowRight /> <strong>Detección automática:</strong> El
                sistema detecta promociones usando los campos configurados
              </HelpListItem>
              <HelpListItem>
                <FaArrowRight /> <strong>Transformación:</strong> Convierte
                referencias de artículos a números de línea automáticamente
              </HelpListItem>
              <HelpListItem>
                <FaArrowRight /> <strong>Reglas:</strong> Define reglas
                específicas para diferentes tipos de promociones
              </HelpListItem>
              <HelpListItem>
                <FaArrowRight /> <strong>Prioridad:</strong> Las reglas con
                menor número tienen mayor prioridad
              </HelpListItem>
            </HelpList>
          </HelpSection>
        </>
      )}
    </ConfigSection>
  );
};

export default PromotionConfigSection;

// Estilos con styled-components
const ConfigSection = styled.div`
  position: relative;
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h3`
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: ${({ theme }) => theme?.primary || "#333"};
  border-bottom: 2px solid ${({ theme }) => theme?.border || "#eee"};
  padding-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SubSectionTitle = styled.h4`
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
`;

const EnableSection = styled.div`
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
  border-radius: 6px;
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const CheckboxInput = styled.input`
  margin-right: 8px;
  width: 16px;
  height: 16px;
`;

const FormLabel = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme?.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme?.primary || "#0275d8"};
    box-shadow: 0 0 0 2px rgba(2, 117, 216, 0.25);
  }
`;

const HelpText = styled.p`
  font-size: 0.8rem;
  color: ${({ theme }) => theme?.textMuted || "#666"};
  margin-top: 0.25rem;
  margin-bottom: 0;
`;

const BasicConfigSection = styled.div`
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme?.border || "#eee"};
  border-radius: 6px;
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
`;

const AdvancedToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme?.primary || "#0275d8"};
  cursor: pointer;
  padding: 0.5rem;
  font-size: 0.9rem;
  margin-bottom: 1rem;

  &:hover {
    text-decoration: underline;
  }
`;

const AdvancedConfigSection = styled.div`
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme?.border || "#eee"};
  border-radius: 6px;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
`;

const RulesSection = styled.div`
  margin-bottom: 1.5rem;
`;

const RulesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const AddRuleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: ${({ theme }) => theme?.primary || "#0275d8"};
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;

  &:hover {
    background-color: ${({ theme }) => theme?.primaryDark || "#025aa5"};
  }
`;

const RulesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const RuleItem = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme?.border || "#eee"};
  border-left: 4px solid ${({ ruleColor }) => ruleColor};
  border-radius: 6px;
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
`;

const RuleIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: ${({ ruleColor }) => ruleColor};
  color: white;
  font-size: 1.1rem;
`;

const RuleContent = styled.div`
  flex: 1;
`;

const RuleTitle = styled.h5`
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  color: ${({ theme }) => theme?.text || "#333"};
`;

const RuleType = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme?.textMuted || "#666"};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
`;

const RuleDescription = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
  margin: 0 0 0.5rem 0;
`;

const RuleStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const StatusActive = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: #27ae60;
  font-weight: 500;
`;

const StatusInactive = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: #e74c3c;
  font-weight: 500;
`;

const OneTimeTag = styled.span`
  font-size: 0.7rem;
  background-color: #f39c12;
  color: white;
  padding: 0.2rem 0.4rem;
  border-radius: 12px;
  font-weight: 500;
`;

const PriorityTag = styled.span`
  font-size: 0.7rem;
  background-color: ${({ theme }) => theme?.textMuted || "#666"};
  color: white;
  padding: 0.2rem 0.4rem;
  border-radius: 12px;
  font-weight: 500;
`;

const RuleActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: ${({ danger, theme }) =>
    danger ? "#e74c3c" : theme?.primary || "#0275d8"};
  color: white;

  &:hover {
    opacity: 0.8;
  }
`;

const EmptyRules = styled.div`
  text-align: center;
  padding: 2rem;
  color: ${({ theme }) => theme?.textMuted || "#666"};

  svg {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  p {
    margin: 0.5rem 0;
  }
`;

const HelpSection = styled.div`
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
  border-radius: 6px;
`;

const HelpTitle = styled.h5`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: ${({ theme }) => theme?.primary || "#0275d8"};
`;

const HelpList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const HelpListItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
  margin-bottom: 0.5rem;

  svg {
    margin-top: 0.2rem;
    color: ${({ theme }) => theme?.primary || "#0275d8"};
  }
`;
