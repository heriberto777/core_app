import styled from "styled-components";
import { FaSpinner } from "react-icons/fa";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: ${props =>
    props.size === 'small' ? '6px 12px' :
    props.size === 'large' ? '12px 24px' : '8px 16px'};
  border: none;
  border-radius: 6px;
  font-size: ${props =>
    props.size === 'small' ? '12px' :
    props.size === 'large' ? '16px' : '14px'};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: ${props => props.minWidth || 'auto'};

  background-color: ${props => {
    if (props.disabled) return '#e5e7eb';
    switch (props.variant) {
      case 'primary': return '#3b82f6';
      case 'success': return '#10b981';
      case 'danger': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'secondary': return '#6b7280';
      default: return '#3b82f6';
    }
  }};

  color: ${props => props.disabled ? '#9ca3af' : 'white'};

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    padding: ${props =>
      props.size === 'small' ? '4px 8px' :
      props.size === 'large' ? '10px 20px' : '6px 12px'};
    font-size: ${props =>
      props.size === 'small' ? '11px' :
      props.size === 'large' ? '15px' : '13px'};
  }
`;

export function LoadsButton({
  children,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  onClick,
  type = 'button',
  minWidth,
  ...props
}) {
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
      minWidth={minWidth}
      {...props}
    >
      {loading && <FaSpinner className="spin" />}
      {children}
    </Button>
  );
}