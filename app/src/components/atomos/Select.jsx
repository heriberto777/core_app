import React from "react";
import styled from "styled-components";
import { FaChevronDown } from "react-icons/fa";

export const Select = ({ label, error, children, ...props }) => {
    return (
        <SelectWrapper>
            {label && <Label>{label}</Label>}
            <InputRelative>
                <StyledSelect error={!!error} {...props}>
                    {children}
                </StyledSelect>
                <IconWrapper>
                    <FaChevronDown size={12} />
                </IconWrapper>
            </InputRelative>
            {error && <ErrorText>{error}</ErrorText>}
        </SelectWrapper>
    );
};

const SelectWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing?.xs || "4px"};
  width: 100%;
  margin-bottom: ${({ theme }) => theme.spacing?.sm || "12px"};
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  margin-left: 4px;
`;

const InputRelative = styled.div`
  position: relative;
  width: 100%;
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: 12px 42px 12px 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.bg2 || "rgba(255, 255, 255, 0.05)"};
  border: 1px solid ${({ theme, error }) => (error ? theme.danger : theme.border || "#ddd")};
  color: ${({ theme }) => theme.text || "#fff"};
  font-size: 14px;
  appearance: none;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || "#4facfe"};
    background: ${({ theme }) => theme.bg || "rgba(255, 255, 255, 0.08)"};
    box-shadow: 0 0 0 4px ${({ theme }) => (theme.primary ? theme.primary + "20" : "rgba(79, 172, 254, 0.1)")};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  option {
    background: ${({ theme }) => theme.cardBg || "#2c2c2e"};
    color: ${({ theme }) => theme.text || "#fff"};
    padding: 10px;
  }
`;

const IconWrapper = styled.div`
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: ${({ theme }) => theme.textSecondary || "#999"};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ErrorText = styled.span`
  color: ${({ theme }) => theme.danger || "#ff4d4d"};
  font-size: 12px;
  margin-left: 4px;
  font-weight: 500;
`;
