import React from "react";
import styled, { css, keyframes } from "styled-components";

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const SpinnerIcon = styled.svg`
  animation: ${spin} 1s linear infinite;
  width: 1em;
  height: 1em;
  margin-right: 0px; /* Spacing handled by gap in button */
`;

const StyledButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
  outline: none;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(1);
  }

  ${({ variant, theme }) => {
    switch (variant) {
      case "primary":
        return css`
          background: ${theme.primary};
          color: white;
          box-shadow: 0 4px 12px ${theme.primary}40;
          &:hover:not(:disabled) {
            background: ${theme.primary}dd;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px ${theme.primary}60;
          }
        `;
      case "secondary":
        return css`
          background: ${theme.bg2};
          color: ${theme.text};
          border: 1px solid ${theme.border};
          &:hover:not(:disabled) {
            background: ${theme.border}30;
            transform: translateY(-1px);
          }
        `;
      case "danger":
        return css`
          background: ${theme.danger};
          color: white;
          box-shadow: 0 4px 12px ${theme.danger}40;
          &:hover:not(:disabled) {
            background: ${theme.danger}dd;
            transform: translateY(-1px);
          }
        `;
      case "success":
        return css`
          background: ${theme.success};
          color: white;
          box-shadow: 0 4px 12px ${theme.success}40;
          &:hover:not(:disabled) {
            background: ${theme.success}dd;
          }
        `;
      case "ghost":
        return css`
          background: transparent;
          color: ${theme.textSecondary};
          &:hover:not(:disabled) {
            background: ${theme.border}20;
            color: ${theme.text};
          }
        `;
      default:
        return css`
          background: ${theme.border};
          color: ${theme.text};
        `;
    }
  }}

  &:active:not(:disabled) {
    transform: translateY(0);
    filter: brightness(0.9);
  }
`;

export const Button = React.forwardRef(({ children, loading, disabled, ...props }, ref) => {
  return (
    <StyledButton ref={ref} disabled={disabled || loading} {...props}>
      {loading && (
        <SpinnerIcon viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </SpinnerIcon>
      )}
      {children}
    </StyledButton>
  );
});

Button.displayName = "Button";
