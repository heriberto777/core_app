import React from "react";
import styled from "styled-components";

const CardContainer = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.soft};
  border: 1px solid ${({ theme }) => theme.border};
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.medium};
  }

  ${({ $fullWidth }) => $fullWidth && `grid-column: 1 / -1;`}
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Title = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.fontsm || "0.875em"};
  font-weight: 600;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};

  svg {
    color: ${({ theme }) => theme.primary};
  }
`;

const Value = styled.div`
  font-size: ${({ theme }) => theme.fontxl || "1.5rem"};
  font-weight: 700;
  color: ${({ theme, $color }) => $color || theme.text};
`;

const Subtitle = styled.div`
  font-size: ${({ theme }) => theme.fontxs || "0.75em"};
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const Footer = styled.div`
  margin-top: ${({ theme }) => theme.spacing.xs};
  border-top: 1px solid ${({ theme }) => theme.border};
  padding-top: ${({ theme }) => theme.spacing.xs};
`;

export const StatCard = ({
    title,
    value,
    subtitle,
    icon,
    color,
    footer,
    fullWidth,
    children,
    className,
    ...props
}) => {
    return (
        <CardContainer $fullWidth={fullWidth} className={className} {...props}>
            <CardHeader>
                <Title>
                    {icon} {title}
                </Title>
            </CardHeader>
            <Value $color={color}>{value}</Value>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
            {children}
            {footer && <Footer>{footer}</Footer>}
        </CardContainer>
    );
};
