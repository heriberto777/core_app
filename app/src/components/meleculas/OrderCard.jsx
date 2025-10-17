import styled from "styled-components";
import { StatusBadge, LoadsButton } from "../../index";
import { FaEye, FaEdit, FaTrash, FaTruck, FaCalendar, FaUser, FaDollarSign } from "react-icons/fa";

const Card = styled.div`
  background: ${props => props.theme.cardBg || 'white'};
  border: 1px solid ${props => props.theme.border || '#e5e7eb'};
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  ${props => props.selected && `
    border-color: ${props.theme.primary || '#3b82f6'};
    box-shadow: 0 0 0 2px ${props.theme.primary || '#3b82f6'}20;
  `}

  @media (max-width: 768px) {
    padding: 12px;
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 8px;
  }
`;

const OrderInfo = styled.div`
  flex: 1;
`;

const OrderNumber = styled.h4`
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 15px;
  }
`;

const ClientName = styled.p`
  margin: 0 0 8px 0;
  font-size: 14px;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  font-weight: 500;

  @media (max-width: 768px) {
    font-size: 13px;
  }
`;

const CardBody = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${props => props.theme.textSecondary || '#6b7280'};

  svg {
    color: ${props => props.theme.primary || '#3b82f6'};
  }

  @media (max-width: 768px) {
    font-size: 11px;
  }
`;

const InfoValue = styled.span`
  font-weight: 500;
  color: ${props => props.theme.text || '#111827'};
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 6px;
  }
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

export function OrderCard({
  order,
  selected = false,
  onSelect,
  onView,
  onEdit,
  onCancel,
  onLoad,
  showActions = true
}) {
  const handleCardClick = (e) => {
    e.stopPropagation();
    onSelect?.(order.pedido);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <Card selected={selected} onClick={handleCardClick}>
      <CardHeader>
        <CheckboxContainer onClick={e => e.stopPropagation()}>
          <Checkbox
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(order.pedido)}
          />
          <OrderInfo>
            <OrderNumber>Pedido #{order.pedido}</OrderNumber>
            <ClientName>{order.cliente}</ClientName>
          </OrderInfo>
        </CheckboxContainer>
        <StatusBadge status={order.transferStatus}>
          {order.transferStatus === 'pending' ? 'Pendiente' :
           order.transferStatus === 'processing' ? 'Procesando' :
           order.transferStatus === 'completed' ? 'Completado' :
           order.transferStatus}
        </StatusBadge>
      </CardHeader>

      <CardBody>
        <InfoItem>
          <FaCalendar />
          <InfoValue>{formatDate(order.fechaPedido)}</InfoValue>
        </InfoItem>
        <InfoItem>
          <FaUser />
          <InfoValue>{order.nombreVendedor}</InfoValue>
        </InfoItem>
        <InfoItem>
          <FaDollarSign />
          <InfoValue>{formatCurrency(order.totalPedido)}</InfoValue>
        </InfoItem>
        <InfoItem>
          <FaTruck />
          <InfoValue>{order.totalLineas} líneas</InfoValue>
        </InfoItem>
      </CardBody>

      {showActions && (
        <CardActions onClick={e => e.stopPropagation()}>
          <LoadsButton
            variant="primary"
            size="small"
            onClick={() => onLoad?.(order.pedido)}
            disabled={order.transferStatus !== 'pending'}
          >
            <FaTruck /> Cargar
          </LoadsButton>
          <LoadsButton
            variant="secondary"
            size="small"
            onClick={() => onView?.(order.pedido)}
          >
            <FaEye /> Ver
          </LoadsButton>
          <LoadsButton
            variant="warning"
            size="small"
            onClick={() => onEdit?.(order.pedido)}
          >
            <FaEdit /> Editar
          </LoadsButton>
          <LoadsButton
            variant="danger"
            size="small"
            onClick={() => onCancel?.(order.pedido)}
          >
            <FaTrash /> Cancelar
          </LoadsButton>
        </CardActions>
      )}
    </Card>
  );
}