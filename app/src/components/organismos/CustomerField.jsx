import React from "react";
import styled from "styled-components";
import { FaSync, FaInfoCircle } from "react-icons/fa";

const FieldGroup = styled.div`
  display: flex; flex-direction: column; gap: 8px; flex: 1 1 250px; min-width: 250px;
  @media (max-width: 600px) { min-width: 100%; }
`;

const LabelRow = styled.div` display: flex; align-items: center; justify-content: space-between; `;

const Label = styled.label`
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary}; display: flex; align-items: center; gap: 6px;
  span { color: #ef4444; }
`;

const InputWrapper = styled.div` display: flex; gap: 8px; align-items: stretch; `;

const StyledInput = styled.input`
  flex: 1; padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme, $readOnly }) => $readOnly ? theme.border + '40' : theme.border};
  background: ${({ theme, $readOnly }) => $readOnly ? theme.bg2 + '20' : theme.inputBg};
  color: ${({ theme, $readOnly }) => $readOnly ? theme.textSecondary : theme.text};
  font-size: 14px; font-weight: 600; transition: all 0.2s;
  &:focus { border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; outline: none; }
  &::placeholder { color: ${({ theme }) => theme.textSecondary + '60'}; }
`;

const StyledTextArea = styled.textarea`
  flex: 1; padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; font-weight: 600; min-height: 80px; resize: vertical; transition: all 0.2s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; }
`;

const StyledSelect = styled.select`
  flex: 1; padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; font-weight: 600; cursor: pointer;
`;

const CheckboxContainer = styled.label`
  display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer;
  background: ${({ theme }) => theme.bg2}10; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border}40;
  span { font-size: 14px; font-weight: 700; }
  input { width: 18px; height: 18px; accent-color: ${({ theme }) => theme.primary}; }
`;

const MetaInfo = styled.div`
  display: flex; flex-direction: column; gap: 2px;
`;

const SourceInfo = styled.div`
  font-size: 10px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; opacity: 0.6;
  display: flex; align-items: center; gap: 4px;
`;

const RefreshBtn = styled.button`
  width: 44px; display: flex; align-items: center; justify-content: center;
  background: ${({ theme }) => theme.primary}; color: white; border: none; border-radius: 12px;
  cursor: pointer; transition: all 0.2s;
  &:hover:not(:disabled) { transform: scale(1.05); filter: brightness(1.1); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg { animation: ${({ $loading }) => $loading ? "spin 1s linear infinite" : "none"}; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

export function CustomerField({
    fieldName,
    value,
    meta,
    loading,
    onChange,
    onRefresh
}) {
    const isReadOnly = meta.isEditable === false && !meta.dynamicQuery;
    const displayName = meta.displayName || fieldName;
    const type = meta.fieldType || "text";

    const renderInput = () => {
        if (type === "boolean" || typeof value === "boolean") {
            return (
                <CheckboxContainer>
                    <input
                        type="checkbox"
                        name={fieldName}
                        checked={Boolean(value)}
                        onChange={onChange}
                        disabled={loading || isReadOnly}
                    />
                    <span>{displayName}</span>
                </CheckboxContainer>
            );
        }

        if (type === "textarea") {
            return (
                <StyledTextArea
                    name={fieldName}
                    value={value || ""}
                    onChange={onChange}
                    disabled={loading || isReadOnly}
                    readOnly={isReadOnly}
                />
            );
        }

        if (type === "select") {
            return (
                <StyledSelect
                    name={fieldName}
                    value={value || ""}
                    onChange={onChange}
                    disabled={loading || isReadOnly}
                >
                    <option value="">-- Seleccione --</option>
                    {meta.options?.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
                </StyledSelect>
            );
        }

        return (
            <StyledInput
                type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                name={fieldName}
                value={value || ""}
                onChange={onChange}
                disabled={loading || isReadOnly}
                readOnly={isReadOnly}
                $readOnly={isReadOnly}
                placeholder={displayName}
            />
        );
    };

    return (
        <FieldGroup>
            <LabelRow>
                <Label>
                    {displayName}
                    {meta.isRequired && <span>*</span>}
                </Label>
            </LabelRow>

            <InputWrapper>
                {renderInput()}
                {meta.dynamicQuery && (
                    <RefreshBtn
                        onClick={() => onRefresh(fieldName)}
                        disabled={loading}
                        $loading={loading}
                        title="Sincronizar valor dinámico"
                    >
                        <FaSync />
                    </RefreshBtn>
                )}
            </InputWrapper>

            <MetaInfo>
                {meta.originalField && (
                    <SourceInfo><FaInfoCircle size={10} /> Mapeado de: <strong>{meta.originalField}</strong></SourceInfo>
                )}
                {meta.queryType === "sequence" && meta.currentValue !== undefined && (
                    <SourceInfo>Val. Actual Seq: {meta.currentValue}</SourceInfo>
                )}
            </MetaInfo>
        </FieldGroup>
    );
}
