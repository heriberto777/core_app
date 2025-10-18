import styled from "styled-components";

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${props => props.theme.textSecondary || '#6b7280'};
`;

const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid ${props => props.theme.border || '#d1d5db'};
  border-radius: 6px;
  font-size: 14px;
  background-color: ${props => props.theme.inputBg || 'white'};
  color: ${props => props.theme.text || '#111827'};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.primary || '#3b82f6'};
    box-shadow: 0 0 0 3px ${props => props.theme.primary || '#3b82f6'}20;
  }

  &::placeholder {
    color: ${props => props.theme.textTertiary || '#9ca3af'};
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
    font-size: 13px;
  }
`;

const Select = styled.select`
  padding: 8px 12px;
  border: 1px solid ${props => props.theme.border || '#d1d5db'};
  border-radius: 6px;
  font-size: 14px;
  background-color: ${props => props.theme.inputBg || 'white'};
  color: ${props => props.theme.text || '#111827'};
  transition: border-color 0.2s ease;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.primary || '#3b82f6'};
    box-shadow: 0 0 0 3px ${props => props.theme.primary || '#3b82f6'}20;
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
    font-size: 13px;
  }
`;

export function FilterInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  options = [],
  ...props
}) {
  const handleChange = (e) => {
    const newValue = e.target.value;
    console.log("🎯 FilterInput onChange:", label, "->", newValue);
    onChange?.(newValue); // ✅ Llamar onChange con el nuevo valor
  };

  return (
    <InputContainer>
      {label && <Label>{label}</Label>}
      {type === 'select' ? (
        <Select value={value} onChange={handleChange} {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          {...props}
        />
      )}
    </InputContainer>
  );
}