import styled from "styled-components";
import { useState, useRef, useEffect } from "react";
import { FaChevronDown, FaTimes, FaCheck } from "react-icons/fa";

const SelectContainer = styled.div`
  position: relative;
  width: 100%;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${(props) => props.theme.textSecondary || "#6b7280"};
  display: block;
  margin-bottom: 4px;
`;

const SelectButton = styled.button`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border || "#d1d5db"};
  border-radius: 6px;
  background: ${(props) => props.theme.inputBg || "white"};
  color: ${(props) => props.theme.text || "#111827"};
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary || "#3b82f6"};
    box-shadow: 0 0 0 3px ${(props) => props.theme.primary || "#3b82f6"}20;
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
    font-size: 13px;
  }
`;

const SelectText = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) =>
    props.hasSelection
      ? props.theme.text || "#111827"
      : props.theme.textTertiary || "#9ca3af"};
`;

const ChevronIcon = styled(FaChevronDown)`
  transition: transform 0.2s ease;
  transform: ${(props) => (props.isOpen ? "rotate(180deg)" : "rotate(0deg)")};
  color: ${(props) => props.theme.textSecondary || "#6b7280"};
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background: ${(props) => props.theme.cardBg || "white"};
  border: 1px solid ${(props) => props.theme.border || "#e5e7eb"};
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  display: ${(props) => (props.isOpen ? "block" : "none")};
  margin-top: 2px;
`;

const Option = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.cardHeaderBg || "#f9fafb"};
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
  }
`;

const CheckIcon = styled(FaCheck)`
  color: ${(props) => props.theme.primary || "#3b82f6"};
  font-size: 12px;
  opacity: ${(props) => (props.visible ? 1 : 0)};
`;

const OptionText = styled.span`
  flex: 1;
  font-size: 14px;
  color: ${(props) => props.theme.text || "#111827"};

  @media (max-width: 768px) {
    font-size: 13px;
  }
`;

const SelectedCount = styled.div`
  background: ${(props) => props.theme.primary || "#3b82f6"};
  color: white;
  border-radius: 12px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
`;

const SelectedTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const Tag = styled.div`
  background: ${(props) => props.theme.primary || "#3b82f6"}10;
  color: ${(props) => props.theme.primary || "#3b82f6"};
  border: 1px solid ${(props) => props.theme.primary || "#3b82f6"}30;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 150px;

  @media (max-width: 768px) {
    max-width: 120px;
  }
`;

const TagText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TagRemove = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.theme.primary || "#3b82f6"};
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;

  &:hover {
    opacity: 0.7;
  }
`;

export function MultiSelectInput({
  label,
  value = [],
  onChange,
  options = [],
  placeholder = "Seleccionar...",
  showTags = true,
  maxTagsShown = 3,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleOptionClick = (optionValue) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];

    onChange?.(newValue);
  };

  const handleRemoveTag = (optionValue, event) => {
    event.stopPropagation();
    const newValue = value.filter((v) => v !== optionValue);
    onChange?.(newValue);
  };

  const getDisplayText = () => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const option = options.find((opt) => opt.value === value[0]);
      return option?.label || value[0];
    }
    return `${value.length} seleccionados`;
  };

  const getSelectedOptions = () => {
    return value
      .map((val) => options.find((opt) => opt.value === val))
      .filter(Boolean);
  };

  return (
    <SelectContainer ref={selectRef}>
      {label && <Label>{label}</Label>}

      <SelectButton onClick={handleToggle} type="button" {...props}>
        <SelectText hasSelection={value.length > 0}>
          {getDisplayText()}
          {value.length > 1 && <SelectedCount>{value.length}</SelectedCount>}
        </SelectText>
        <ChevronIcon isOpen={isOpen} />
      </SelectButton>

      {showTags && value.length > 0 && (
        <SelectedTags>
          {getSelectedOptions()
            .slice(0, maxTagsShown)
            .map((option) => (
              <Tag key={option.value}>
                <TagText>{option.label}</TagText>
                <TagRemove onClick={(e) => handleRemoveTag(option.value, e)}>
                  <FaTimes size={8} />
                </TagRemove>
              </Tag>
            ))}
          {value.length > maxTagsShown && (
            <Tag>
              <TagText>+{value.length - maxTagsShown} más</TagText>
            </Tag>
          )}
        </SelectedTags>
      )}

      <Dropdown isOpen={isOpen}>
        {options.map((option) => (
          <Option
            key={option.value}
            onClick={() => handleOptionClick(option.value)}
          >
            <CheckIcon visible={value.includes(option.value)} />
            <OptionText>{option.label}</OptionText>
          </Option>
        ))}
      </Dropdown>
    </SelectContainer>
  );
}
