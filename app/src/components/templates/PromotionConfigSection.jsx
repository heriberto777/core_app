import React from "react";
import styled from "styled-components";
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
    <Container>
      <Header>
        <HeaderTitle>
          <FaGift /> Configuración de Promociones
        </HeaderTitle>
        <ToggleSwitch>
          <input
            type="checkbox"
            id="promo-enable"
            checked={isEnabled}
            onChange={handleEnableChange}
          />
          <label htmlFor="promo-enable"></label>
          <span style={{ marginLeft: "10px", fontWeight: 600, color: "#fff" }}>
            {isEnabled ? "Activo" : "Inactivo"}
          </span>
        </ToggleSwitch>
      </Header>

      {!isEnabled ? (
        <EmptyState>
          <FaInfoCircle size={40} opacity={0.5} />
          <p>El procesamiento de promociones está desactivado.</p>
          <small>Habilítalo para configurar reglas y campos de detección.</small>
        </EmptyState>
      ) : (
        <Content>
          <Grid>
            <SectionCard>
              <CardTitle>Detección de Campos</CardTitle>
              <InputGroup>
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
              </InputGroup>
            </SectionCard>

            <SectionCard>
              <CardTitle>
                Campos Destino
                <AdvancedToggle onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? <FaChevronUp /> : <FaChevronDown />}
                </AdvancedToggle>
              </CardTitle>

              {showAdvanced && (
                <InputGroup>
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
                </InputGroup>
              )}
              {!showAdvanced && <HelpText>Haz clic para configurar mapeo de campos destino.</HelpText>}
            </SectionCard>
          </Grid>

          <RulesContainer>
            <RulesHeader>
              <CardTitle><FaGift /> Reglas de Promoción ({rules.length})</CardTitle>
              <Button variant="primary" onClick={addRule}>
                <FaPlus /> Nueva Regla
              </Button>
            </RulesHeader>

            {rules.length === 0 ? (
              <EmptyRules>
                No hay reglas configuradas. Las promociones se procesarán según los campos de detección por defecto.
              </EmptyRules>
            ) : (
              <RulesList>
                {rules.map((rule, index) => (
                  <RuleCard key={index} type={rule.type} enabled={rule.enabled}>
                    <RuleIconWrapper type={rule.type}>
                      {getRuleIcon(rule.type)}
                    </RuleIconWrapper>

                    <RuleInfo>
                      <RuleName>{rule.name}</RuleName>
                      <RuleBadge type={rule.type}>{rule.type.replace(/_/g, " ")}</RuleBadge>
                      <RuleDesc>{rule.description}</RuleDesc>
                      <RuleMeta>
                        <span>Prioridad: {rule.priority || 0}</span>
                        {rule.isOneTime && <span className="one-time">Oferta Única</span>}
                        <span className={rule.enabled ? "status-on" : "status-off"}>
                          {rule.enabled ? "Habilitada" : "Deshabilitada"}
                        </span>
                      </RuleMeta>
                    </RuleInfo>

                    <RuleActions>
                      <ActionButton onClick={() => editRule(index)} title="Editar">
                        <FaEdit />
                      </ActionButton>
                      <ActionButton danger onClick={() => deleteRule(index)} title="Eliminar">
                        <FaTrash />
                      </ActionButton>
                    </RuleActions>
                  </RuleCard>
                ))}
              </RulesList>
            )}
          </RulesContainer>
        </Content>
      )}
    </Container>
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

// Estilos Glassmorphism
const Container = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(12px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 24px;
  padding: 2rem;
  margin-bottom: 2rem;
  color: ${({ theme }) => theme.text};
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.border}80;
`;

const HeaderTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0;
  color: ${({ theme }) => theme.titleColor};
  
  svg {
    color: ${({ theme }) => theme.primary};
  }
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
`;

const SectionCard = styled.div`
  background: ${({ theme }) => theme.bg2}40;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 20px;
  padding: 1.5rem;
`;

const CardTitle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 800;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
  color: ${({ theme }) => theme.titleColor};
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const AdvancedToggle = styled.button`
  background: none;
  border: none;
  color: #4facfe;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: transform 0.2s;
  &:hover { transform: scale(1.1); }
`;

const RulesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const RulesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const RulesList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1rem;
`;

const RuleCard = styled.div`
  display: flex;
  gap: 1.25rem;
  background: ${({ theme }) => theme.cardBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-left: 5px solid ${props => getRuleColor(props.type)};
  border-radius: 18px;
  padding: 1.25rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: ${props => props.enabled ? 1 : 0.6};
  box-shadow: ${({ theme }) => theme.shadows.soft};

  &:hover {
    background: ${({ theme }) => theme.bg2}30;
    transform: translateY(-4px);
    box-shadow: ${({ theme }) => theme.shadows.medium};
  }
`;

const RuleIconWrapper = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: ${props => getRuleColor(props.type)}20;
  color: ${props => getRuleColor(props.type)};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1.2rem;
`;

const RuleInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RuleName = styled.div`
  font-weight: 700;
  font-size: 0.95rem;
`;

const RuleBadge = styled.span`
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: ${props => getRuleColor(props.type)};
  background: ${props => getRuleColor(props.type)}15;
  padding: 2px 6px;
  border-radius: 4px;
  align-self: flex-start;
`;

const RuleDesc = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.textSecondary};
  margin-top: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const RuleMeta = styled.div`
  display: flex;
  gap: 14px;
  font-size: 11px;
  font-weight: 600;
  margin-top: 10px;
  color: ${({ theme }) => theme.textSecondary};
  opacity: 0.7;

  .one-time { color: #fbbf24; font-weight: 600; }
  .status-on { color: #34d399; font-weight: 600; }
  .status-off { color: #f87171; font-weight: 600; }
`;

const RuleActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ActionButton = styled.button`
  background: ${({ theme }) => theme.bg2}60;
  border: 1px solid ${({ theme }) => theme.border};
  color: ${props => props.danger ? theme.danger : theme.primary};
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.danger ? theme.danger : theme.primary};
    color: white;
    border-color: transparent;
  }
`;

const ToggleSwitch = styled.div`
  display: flex;
  align-items: center;
  
  input {
    height: 0;
    width: 0;
    visibility: hidden;
  }

  label {
    cursor: pointer;
    text-indent: -9999px;
    width: 48px;
    height: 26px;
    background: ${({ theme }) => theme.bg2};
    display: block;
    border-radius: 100px;
    position: relative;
    border: 1px solid ${({ theme }) => theme.border};
  }

  label:after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 90px;
    transition: 0.3s;
  }

  input:checked + label {
    background: #10b981;
    border-color: #10b981;
  }

  input:checked + label:after {
    left: calc(100% - 2px);
    transform: translateX(-100%);
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary};
  gap: 1rem;
  background: ${({ theme }) => theme.bg2}20;
  border-radius: 24px;
  border: 2px dashed ${({ theme }) => theme.border};
`;

const EmptyRules = styled.div`
  padding: 2rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.9rem;
`;

const HelpText = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
`;
