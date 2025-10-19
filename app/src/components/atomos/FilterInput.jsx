// src/components/atomos/FilterInput.jsx
import React from "react";
import styled from "styled-components";
import { FaSearch, FaChevronDown } from "react-icons/fa";

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #374151;

  .required {
    color: #ef4444;
    margin-left: 2px;
  }
`;

const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  padding-right: ${({ hasIcon }) => (hasIcon ? "36px" : "12px")};
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  transition: all 0.2s;

  &::placeholder {
    color: #9ca3af;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
    border-color: #e5e7eb;
  }

  ${({ error }) =>
    error &&
    `
    border-color: #ef4444;
    &:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }
  `}
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  padding-right: 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  appearance: none;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
    border-color: #e5e7eb;
  }

  ${({ error }) =>
    error &&
    `
    border-color: #ef4444;
    &:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }
  `}
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  transition: all 0.2s;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;

  &::placeholder {
    color: #9ca3af;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
    border-color: #e5e7eb;
  }

  ${({ error }) =>
    error &&
    `
    border-color: #ef4444;
    &:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }
  `}
`;

const IconWrapper = styled.div`
  position: absolute;
  right: 10px;
  color: #9ca3af;
  pointer-events: none;
  font-size: 14px;
  display: flex;
  align-items: center;
`;

const ErrorMessage = styled.div`
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
`;

const HelpText = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
`;

export const FilterInput = ({
  type = "text",
  label,
  value,
  onChange,
  placeholder,
  options = [],
  disabled = false,
  required = false,
  error = null,
  helpText = null,
  icon = null,
  showSearchIcon = false,
  className,
  style,
  ...props
}) => {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value, e);
    }
  };

  const renderInput = () => {
    switch (type) {
      case "select":
        return (
          <InputContainer>
            <StyledSelect
              value={value}
              onChange={handleChange}
              disabled={disabled}
              required={required}
              error={error}
              className={className}
              style={style}
              {...props}
            >
              {placeholder && <option value="">{placeholder}</option>}
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
            </StyledSelect>
            <IconWrapper>
              <FaChevronDown />
            </IconWrapper>
          </InputContainer>
        );

      case "textarea":
        return (
          <StyledTextarea
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            error={error}
            className={className}
            style={style}
            {...props}
          />
        );

      default:
        return (
          <InputContainer>
            <StyledInput
              type={type}
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              disabled={disabled}
              required={required}
              error={error}
              hasIcon={icon || showSearchIcon}
              className={className}
              style={style}
              {...props}
            />
            {(icon || showSearchIcon) && (
              <IconWrapper>
                {icon || (showSearchIcon && <FaSearch />)}
              </IconWrapper>
            )}
          </InputContainer>
        );
    }
  };

  return (
    <InputWrapper>
      {label && (
        <Label>
          {label}
          {required && <span className="required">*</span>}
        </Label>
      )}

      {renderInput()}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {helpText && !error && <HelpText>{helpText}</HelpText>}
    </InputWrapper>
  );
};
