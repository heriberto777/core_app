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

  ${({ variant }) => {
    const variants = {
      success: `
        background: #dcfce7;
        color: #166534;
        border: 1px solid #bbf7d0;
      `,
      warning: `
        background: #fefce8;
        color: #a16207;
        border: 1px solid #fde047;
      `,
      danger: `
        background: #fee2e2;
        color: #dc2626;
        border: 1px solid #fecaca;
      `,
      info: `
        background: #dbeafe;
        color: #2563eb;
        border: 1px solid #bfdbfe;
      `,
      secondary: `
        background: #f1f5f9;
        color: #64748b;
        border: 1px solid #e2e8f0;
      `,
      primary: `
        background: #ede9fe;
        color: #7c3aed;
        border: 1px solid #d8b4fe;
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
