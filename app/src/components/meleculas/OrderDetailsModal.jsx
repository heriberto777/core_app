import styled from "styled-components";
import { LoadsButton, StatusBadge } from "../../index";
import { FaTimes, FaTrash, FaEdit } from "react-icons/fa";

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;

  @media (max-width: 768px) {
    padding: 10px;
  }
`;

const ModalContent = styled.div`
  background: ${props => props.theme.cardBg || 'white'};
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    max-width: 100%;
    max-height: 95vh;
  }
`;

const ModalHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid ${props => props.theme.border || '#e5e7eb'};
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 16px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  padding: 4px;
  border-radius: 4px;
  transition: color 0.2s ease;

  &:hover {
    color: ${props => props.theme.text || '#111827'};
  }
`;

const ModalBody = styled.div`
  padding: 20px;
  overflow-y: auto;
  flex: 1;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const OrderInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: ${props => props.theme.cardBg || '#f9fafb'};
  border-radius: 8px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 20px;
    padding: 12px;
  }
`;

const InfoField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 13px;
  }
`;

const LinesSection = styled.div`
  margin-top: 24px;

  @media (max-width: 768px) {
    margin-top: 20px;
  }
`;

const SectionTitle = styled.h4`
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 15px;
    margin-bottom: 12px;
  }
`;

const LinesTable = styled.div`
  border: 1px solid ${props => props.theme.border || '#e5e7eb'};
  border-radius: 8px;
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr 80px 100px 120px 80px;
  background: ${props => props.theme.cardHeaderBg || '#f9fafb'};
  padding: 12px;
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  text-transform: uppercase;
  letter-spacing: 0.5px;

  @media (max-width: 768px) {
    grid-template-columns: auto 1fr 60px 80px;
    padding: 10px 8px;
    font-size: 11px;

    & > span:nth-child(5),
    & > span:nth-child(6) {
      display: none;
    }
  }
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr 80px 100px 120px 80px;
  padding: 12px;
  border-top: 1px solid ${props => props.theme.border || '#e5e7eb'};
  align-items: center;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${props => props.theme.cardBg || '#f9fafb'};
  }

  ${props => props.selected && `
    background: ${props.theme.primary || '#3b82f6'}10;
  `}

  @media (max-width: 768px) {
    grid-template-columns: auto 1fr 60px 80px;
    padding: 10px 8px;

    & > span:nth-child(5),
    & > span:nth-child(6) {
      display: none;
    }
  }
`;

const TableCell = styled.span`
  font-size: 13px;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const LineCheckbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const ModalFooter = styled.div`
  padding: 20px;
  border-top: 1px solid ${props => props.theme.border || '#e5e7eb'};
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  @media (max-width: 768px) {
    padding: 16px;
    gap: 8px;
    flex-direction: column;
  }
`;

export function OrderDetailsModal({
  isOpen,
  onClose,
  orderDetails = [],
  onRemoveLines,
  editable = false,
  loading = false
}) {
  const [selectedLines, setSelectedLines] = useState([]);

  if (!isOpen) return null;

  const handleLineSelect = (lineaId) => {
    setSelectedLines(prev =>
      prev.includes(lineaId)
        ? prev.filter(id => id !== lineaId)
        : [...prev, lineaId]
    );
  };

  const handleSelectAll = () => {
    if (selectedLines.length === orderDetails.length) {
      setSelectedLines([]);
    } else {
      setSelectedLines(orderDetails.map(line => line.LINEA_TIPO));
    }
  };

  const handleRemoveSelected = () => {
    if (selectedLines.length === 0) return;

    onRemoveLines?.(selectedLines);
    setSelectedLines([]);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const orderInfo = orderDetails[0] || {};
  const totalAmount = orderDetails.reduce((sum, line) => sum + (line.TotalAmount || 0), 0);
  const totalQuantity = orderDetails.reduce((sum, line) => sum + (line.Cantidad || 0), 0);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            Detalles del Pedido #{orderInfo.PEDIDO}
          </ModalTitle>
          <CloseButton onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <OrderInfo>
            <InfoField>
              <InfoLabel>Cliente</InfoLabel>
              <InfoValue>{orderInfo.CLIENTE}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Fecha del Pedido</InfoLabel>
              <InfoValue>{formatDate(orderInfo.FECHA_PEDIDO)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Fecha Prometida</InfoLabel>
              <InfoValue>{formatDate(orderInfo.FECHA_PROMETIDA)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Vendedor</InfoLabel>
              <InfoValue>{orderInfo.VENDEDOR}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Líneas</InfoLabel>
              <InfoValue>{orderDetails.length}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Cantidad</InfoLabel>
              <InfoValue>{totalQuantity.toLocaleString()}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Pedido</InfoLabel>
              <InfoValue>{formatCurrency(totalAmount)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Estado</InfoLabel>
              <StatusBadge status="pending">Pendiente</StatusBadge>
            </InfoField>
          </OrderInfo>

          <LinesSection>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <SectionTitle>
                Líneas del Pedido ({orderDetails.length})
              </SectionTitle>
              {editable && selectedLines.length > 0 && (
                <LoadsButton
                  variant="danger"
                  size="small"
                  onClick={handleRemoveSelected}
                  loading={loading}
                >
                  <FaTrash /> Eliminar Seleccionadas ({selectedLines.length})
                </LoadsButton>
              )}
            </div>

            <LinesTable>
              <TableHeader>
                <span>
                  {editable && (
                    <LineCheckbox
                      type="checkbox"
                      checked={selectedLines.length === orderDetails.length && orderDetails.length > 0}
                      onChange={handleSelectAll}
                    />
                  )}
                </span>
                <span>Producto</span>
                <span>Tipo</span>
                <span>Cantidad</span>
                <span>Precio Unit.</span>
                <span>Total</span>
              </TableHeader>

              {orderDetails.map((line) => (
                <TableRow
                  key={line.LINEA_TIPO}
                  selected={selectedLines.includes(line.LINEA_TIPO)}
                >
                  <TableCell>
                    {editable && (
                      <LineCheckbox
                        type="checkbox"
                        checked={selectedLines.includes(line.LINEA_TIPO)}
                        onChange={() => handleLineSelect(line.LINEA_TIPO)}
                      />
                    )}
                  </TableCell>
                  <TableCell>{line.ARTICULO}</TableCell>
                  <TableCell>
                    <StatusBadge status={line.TIPO_LINEA === 'P' ? 'completed' : 'warning'}>
                      {line.TIPO_LINEA === 'P' ? 'Pedida' : 'Bonif.'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{line.Cantidad?.toLocaleString()}</TableCell>
                  <TableCell>{formatCurrency(line.PRECIO_UNITARIO)}</TableCell>
                  <TableCell>{formatCurrency(line.TotalAmount)}</TableCell>
                </TableRow>
              ))}
            </LinesTable>
          </LinesSection>
        </ModalBody>

        <ModalFooter>
          <LoadsButton variant="secondary" onClick={onClose}>
            Cerrar
          </LoadsButton>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}