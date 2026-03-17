// src/components/atomos/StatusBadge.jsx
import React from "react";
import styled from "styled-components";

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;

  ${({ variant, theme }) => {
    const variants = {
      success: `
        background: ${theme.success}20;
        color: ${theme.success};
        border: 1px solid ${theme.success}40;
      `,
      warning: `
        background: ${theme.warning}20;
        color: ${theme.warning};
        border: 1px solid ${theme.warning}40;
      `,
      danger: `
        background: ${theme.danger}20;
        color: ${theme.danger};
        border: 1px solid ${theme.danger}40;
      `,
      info: `
        background: ${theme.info}20;
        color: ${theme.info};
        border: 1px solid ${theme.info}40;
      `,
      secondary: `
        background: ${theme.secondary}20;
        color: ${theme.secondary};
        border: 1px solid ${theme.secondary}40;
      `,
      primary: `
        background: ${theme.primary}20;
        color: ${theme.primary};
        border: 1px solid ${theme.primary}40;
      `,
    };
    return variants[variant] || variants.secondary;
  }}

  .icon {
    font-size: 10px;
  }
`;

export const StatusBadge = ({
  children,
  status,
  variant,
  icon,
  tooltip,
  className,
  ...props
}) => {
  // Auto-determinar variant basado en status común
  const getVariantFromStatus = (status) => {
    const statusVariants = {
      COMPLETED: "success",
      SUCCESS: "success",
      ACTIVE: "success",
      APPROVED: "success",

      PENDING: "warning",
      PROCESSING: "warning",
      IN_PROGRESS: "warning",
      WAITING: "warning",

      ERROR: "danger",
      FAILED: "danger",
      CANCELLED: "danger",
      REJECTED: "danger",

      INFO: "info",
      NEW: "info",
      DRAFT: "info",

      INACTIVE: "secondary",
      DISABLED: "secondary",
      PAUSED: "secondary",
    };

    return statusVariants[status?.toUpperCase()] || "secondary";
  };

  const finalVariant = variant || getVariantFromStatus(status);
  const displayText = children || status;

  return (
    <Badge
      variant={finalVariant}
      className={className}
      title={tooltip}
      {...props}
    >
      {icon && <span className="icon">{icon}</span>}
      {displayText}
    </Badge>
  );
};
