import React from "react";
import styled from "styled-components";

export const Input = ({ label, error, icon: Icon, ...props }) => {
  return (
    <InputWrapper>
      {label && <Label>{label}</Label>}
      <InputRelative>
        {Icon && (
          <IconWrapper>
            <Icon size={18} />
          </IconWrapper>
        )}
        <StyledInput error={!!error} hasIcon={!!Icon} {...props} />
      </InputRelative>
      {error && <ErrorText>{error}</ErrorText>}
    </InputWrapper>
  );
};

const InputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs || "4px"};
  width: 100%;
  margin-bottom: ${({ theme }) => theme.spacing.sm || "12px"};
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

const IconWrapper = styled.div`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.textSecondary || "#94a3b8"};
  pointer-events: none;
  z-index: 2;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 12px ${({ hasIcon }) => (hasIcon ? "12px 12px 42px" : "16px")};
  padding-left: ${({ hasIcon }) => (hasIcon ? "42px" : "16px")};
  border-radius: 12px;
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme, error }) => (error ? theme.danger : theme.border)};
  color: ${({ theme }) => theme.text};
  font-size: 15px;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);

  &::placeholder {
    color: ${({ theme }) => theme.textSecondary};
  }

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
`;

const ErrorText = styled.span`
  color: ${({ theme }) => theme.danger || "#ff4d4d"};
  font-size: 12px;
  margin-left: 4px;
  font-weight: 500;
`;
