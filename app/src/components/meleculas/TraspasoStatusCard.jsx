import styled from "styled-components";
import { StatusBadge } from "../../index";

const Card = styled.div`
  background: ${(props) => props.theme.cardBg || "white"};
  border: 1px solid ${(props) => props.theme.border || "#e5e7eb"};
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: ${(props) => props.color || props.theme.primary};
  margin-bottom: 8px;

  @media (max-width: 768px) {
    font-size: 24px;
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${(props) => props.theme.textSecondary};
  font-weight: 500;
  margin-bottom: 4px;
`;

const StatDescription = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.textTertiary};
`;

export function TraspasoStatusCard({
  title,
  value,
  color,
  description,
  variant = "default",
}) {
  const getColorByVariant = (variant) => {
    switch (variant) {
      case "success":
        return "#10b981";
      case "danger":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#3b82f6";
      default:
        return color;
    }
  };

  return (
    <Card>
      <StatValue color={getColorByVariant(variant)}>
        {value.toLocaleString()}
      </StatValue>
      <StatLabel>{title}</StatLabel>
      {description && <StatDescription>{description}</StatDescription>}
    </Card>
  );
}
