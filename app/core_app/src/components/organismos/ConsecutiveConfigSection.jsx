import React from "react";
import styled from "styled-components";

// Estilos para el componente
const ConfigSection = styled.div`
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
  color: ${({ theme }) => theme?.primary || "#333"};
  border-bottom: 1px solid ${({ theme }) => theme?.border || "#eee"};
  padding-bottom: 0.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const FormLabel = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
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

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
`;

const CheckboxInput = styled.input`
  margin-right: 8px;
  width: 16px;
  height: 16px;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  user-select: none;
  cursor: pointer;
`;

const HelpText = styled.small`
  display: block;
  margin-top: 0.25rem;
  color: ${({ theme }) => theme?.textSecondary || "#6c757d"};
  font-size: 12px;
`;

const ConsecutiveConfigSection = ({ mapping = {}, handleChange }) => {
  // Accedemos a consecutiveConfig de manera segura
  const consecutiveConfig = mapping.consecutiveConfig || {};
  const isEnabled = consecutiveConfig.enabled || false;

  return (
    <ConfigSection>
      <SectionTitle>Configuración de Numeración Consecutiva</SectionTitle>

      <CheckboxContainer>
        <CheckboxInput
          type="checkbox"
          id="consecutive-enabled"
          name="consecutiveConfig.enabled"
          checked={isEnabled}
          onChange={handleChange}
        />
        <CheckboxLabel htmlFor="consecutive-enabled">
          Activar numeración consecutiva automática
        </CheckboxLabel>
      </CheckboxContainer>

      {isEnabled && (
        <>
          <FormGroup>
            <FormLabel htmlFor="field-name">Campo en encabezado:</FormLabel>
            <FormInput
              type="text"
              id="field-name"
              name="consecutiveConfig.fieldName"
              placeholder="Nombre del campo en tabla principal (ej: NUM_CONSECUTIVO)"
              value={consecutiveConfig.fieldName || ""}
              onChange={handleChange}
            />
            <HelpText>
              Nombre del campo donde se guardará el consecutivo en la tabla
              principal
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="detail-field-name">Campo en detalle:</FormLabel>
            <FormInput
              type="text"
              id="detail-field-name"
              name="consecutiveConfig.detailFieldName"
              placeholder="Nombre del campo en tabla de detalle (ej: NUM_CONSECUTIVO)"
              value={consecutiveConfig.detailFieldName || ""}
              onChange={handleChange}
            />
            <HelpText>
              Nombre del campo donde se guardará el mismo consecutivo en la
              tabla de detalle
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="last-value">Último valor usado:</FormLabel>
            <FormInput
              type="text"
              id="last-value"
              name="consecutiveConfig.lastValue"
              value={consecutiveConfig.lastValue || 0}
              onChange={handleChange}
              placeholder="0"
            />
            <HelpText>El próximo consecutivo será este valor + 1</HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="prefix">Prefijo (opcional):</FormLabel>
            <FormInput
              type="text"
              id="prefix"
              name="consecutiveConfig.prefix"
              placeholder="Ej: INV-"
              value={consecutiveConfig.prefix || ""}
              onChange={handleChange}
            />
            <HelpText>
              Texto que se añadirá antes del número (ej: "FAC-", "INV-", etc.)
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="pattern">Formato (opcional):</FormLabel>
            <FormInput
              type="text"
              id="pattern"
              name="consecutiveConfig.pattern"
              placeholder="Ej: {PREFIX}{VALUE:6}"
              value={consecutiveConfig.pattern || ""}
              onChange={handleChange}
            />
            <HelpText>Formato del consecutivo. Variables disponibles:</HelpText>
            <HelpText>{"{PREFIX}"}: Prefijo especificado arriba</HelpText>
            <HelpText>
              {"{VALUE:n}"}: Número consecutivo con n dígitos (ej: {"{VALUE:6}"}{" "}
              para 000001)
            </HelpText>
            <HelpText>{"{YEAR}"}: Año actual (ej: 2023)</HelpText>
            <HelpText>
              {"{MONTH}"}: Mes actual con dos dígitos (ej: 05)
            </HelpText>
            <HelpText>{"{DAY}"}: Día actual con dos dígitos (ej: 09)</HelpText>
            <HelpText>
              Ejemplo:
              {/* "FAC-{YEAR}{MONTH}-{VALUE}" generará "FAC-202305-0001" */}
            </HelpText>
          </FormGroup>

          <CheckboxContainer>
            <CheckboxInput
              type="checkbox"
              id="update-after"
              name="consecutiveConfig.updateAfterTransfer"
              checked={consecutiveConfig.updateAfterTransfer !== false}
              onChange={handleChange}
            />
            <CheckboxLabel htmlFor="update-after">
              Actualizar consecutivo inmediatamente después de cada documento
            </CheckboxLabel>
          </CheckboxContainer>
          <HelpText>
            Si está desactivado, el consecutivo se actualizará al finalizar todo
            el proceso
          </HelpText>
        </>
      )}
    </ConfigSection>
  );
};

export default ConsecutiveConfigSection;
