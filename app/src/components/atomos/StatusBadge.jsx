import styled from "styled-components";

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  background-color: ${props => {
    switch (props.status) {
      case 'pending': return '#fef3c7';
      case 'processing': return '#dbeafe';
      case 'completed': return '#dcfce7';
      case 'error': return '#fee2e2';
      case 'cancelled': return '#f3f4f6';
      default: return '#f3f4f6';
    }
  }};

  color: ${props => {
    switch (props.status) {
      case 'pending': return '#92400e';
      case 'processing': return '#1e40af';
      case 'completed': return '#166534';
      case 'error': return '#dc2626';
      case 'cancelled': return '#6b7280';
      default: return '#6b7280';
    }
  }};

  @media (max-width: 768px) {
    font-size: 10px;
    padding: 2px 6px;
  }
`;

export function StatusBadge({ status, children }) {
  return (
    <Badge status={status}>
      {children || status}
    </Badge>
  );
}