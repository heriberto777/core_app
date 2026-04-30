// src/components/atomos/FilterInput.jsx
import React, { useState, useMemo } from "react";
import styled from "styled-components";
import { FaSearch, FaChevronDown, FaTimes } from "react-icons/fa";

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

// Estilos para Select con búsqueda
const SelectWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const SelectSearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  padding-right: 30px;
  border: 1px solid #d1d5db;
  border-radius: 6px 6px 0 0;
  font-size: 14px;
  color: #374151;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const SelectDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: white;
  border: 1px solid #d1d5db;
  border-top: none;
  border-radius: 0 0 6px 6px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const SelectOption = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  
  &:hover {
    background: #f3f4f6;
  }
  
  ${({ selected }) => selected && `
    background: #eff6ff;
    color: #3b82f6;
    font-weight: 500;
  `}
`;

const NoResults = styled.div`
  padding: 12px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
`;

const ClearSearchButton = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  
  &:hover {
    color: #6b7280;
  }
`;

const SelectContainerWrapper = styled.div`
  position: relative;
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
  searchThreshold = 10,
  ...props
}) => {
  const [selectSearch, setSelectSearch] = useState("");
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const selectRef = React.useRef(null);

  const filteredOptions = useMemo(() => {
    if (!selectSearch.trim()) return options;
    const search = selectSearch.toLowerCase();
    return options.filter(opt => 
      opt.label?.toLowerCase().includes(search) || 
      String(opt.value).toLowerCase().includes(search)
    );
  }, [options, selectSearch]);

  const showSearch = type === "select" && options.length > searchThreshold;

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsSelectOpen(false);
        setSelectSearch("");
      }
    };
    if (isSelectOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isSelectOpen]);

  const handleSelectOptionClick = (optionValue) => {
    if (onChange) {
      const callbackSource = onChange.toString();
      const expectsEvent = callbackSource.includes('.target');
      if (expectsEvent) {
        onChange({ target: { value: optionValue } });
      } else {
        onChange(optionValue);
      }
    }
    setIsSelectOpen(false);
    setSelectSearch("");
  };

  const handleChange = (e) => {
    if (!onChange) return;

    // Detectar tipo de callback por la firma de la función
    // Si el callback usa .target, espera un evento
    // Si el callback no usa .target, espera el valor directo
    const callbackSource = onChange.toString();
    const expectsEvent = callbackSource.includes('.target');

    if (expectsEvent) {
      // Callback tradicional: onChange={(e) => setSearch(e.target.value)}
      onChange(e);
    } else {
      // Callback moderno: onChange={(value) => handleFilterChange("dateFrom", value)}
      const value = e.target ? e.target.value : e;
      onChange(value);
    }
  };

  const renderInput = () => {
    switch (type) {
      case "select":
        if (showSearch) {
          const selectedOption = options.find(opt => opt.value === value);
          return (
            <SelectContainerWrapper ref={selectRef}>
              <InputContainer>
                <StyledSelect
                  as="div"
                  onClick={() => !disabled && setIsSelectOpen(!isSelectOpen)}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
                  error={error}
                >
                  {selectedOption?.label || placeholder || "Seleccionar..."}
                </StyledSelect>
                <IconWrapper onClick={() => !disabled && setIsSelectOpen(!isSelectOpen)}>
                  <FaChevronDown style={{ transform: isSelectOpen ? 'rotate(180deg)' : 'none' }} />
                </IconWrapper>
              </InputContainer>
              {isSelectOpen && (
                <SelectDropdown>
                  <SelectSearchInput
                    placeholder="Buscar..."
                    value={selectSearch}
                    onChange={(e) => setSelectSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  {selectSearch && (
                    <ClearSearchButton onClick={(e) => { e.stopPropagation(); setSelectSearch(""); }}>
                      <FaTimes size={10} />
                    </ClearSearchButton>
                  )}
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option) => (
                      <SelectOption
                        key={option.value}
                        selected={option.value === value}
                        onClick={() => handleSelectOptionClick(option.value)}
                      >
                        {option.label}
                      </SelectOption>
                    ))
                  ) : (
                    <NoResults>Sin resultados</NoResults>
                  )}
                </SelectDropdown>
              )}
            </SelectContainerWrapper>
          );
        }
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
