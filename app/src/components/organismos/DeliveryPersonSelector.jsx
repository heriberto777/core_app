import styled from "styled-components";
import { useState, useEffect } from "react";
import { LoadsButton, FilterInput } from "../../index";
import { FaTruck, FaWarehouse, FaPlus, FaTimes } from "react-icons/fa";

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
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    max-width: 100%;
    max-height: 90vh;
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

const OrderSummary = styled.div`
  background: ${props => props.theme.cardBg || '#f9fafb'};
  border: 1px solid ${props => props.theme.border || '#e5e7eb'};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    padding: 12px;
    margin-bottom: 16px;
  }
`;

const SummaryTitle = styled.h4`
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 13px;
    margin-bottom: 10px;
  }
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
`;

const SummaryItem = styled.div`
  text-align: center;
`;

const SummaryValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${props => props.theme.primary || '#3b82f6'};

  @media (max-width: 768px) {
    font-size: 16px;
  }
`;

const SummaryLabel = styled.div`
  font-size: 12px;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  margin-top: 2px;

  @media (max-width: 768px) {
    font-size: 11px;
  }
`;

const DeliveryPersonsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
`;

const DeliveryPersonCard = styled.div`
  border: 2px solid ${props => props.selected ? (props.theme.primary || '#3b82f6') : (props.theme.border || '#e5e7eb')};
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.selected ? (props.theme.primary || '#3b82f6') + '10' : (props.theme.cardBg || 'white')};

  &:hover {
    border-color: ${props => props.theme.primary || '#3b82f6'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    padding: 12px;
  }
`;

const DeliveryPersonHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  @media (max-width: 768px) {
    gap: 10px;
    margin-bottom: 10px;
  }
`;

const DeliveryPersonIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.theme.primary || '#3b82f6'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;

  @media (max-width: 768px) {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }
`;

const DeliveryPersonInfo = styled.div`
  flex: 1;
`;

const DeliveryPersonName = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};
  margin-bottom: 4px;

  @media (max-width: 768px) {
    font-size: 15px;
  }
`;

const DeliveryPersonCode = styled.div`
  font-size: 12px;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  font-family: monospace;

  @media (max-width: 768px) {
    font-size: 11px;
  }
`;

const WarehouseInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${props => props.theme.cardHeaderBg || '#f9fafb'};
  border-radius: 6px;
  font-size: 13px;
  color: ${props => props.theme.textSecondary || '#6b7280'};

  @media (max-width: 768px) {
    font-size: 12px;
    padding: 6px 10px;
  }
`;

const AddDeliveryPersonButton = styled.button`
  width: 100%;
  padding: 20px;
  border: 2px dashed ${props => props.theme.border || '#e5e7eb'};
  border-radius: 8px;
  background: none;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    border-color: ${props => props.theme.primary || '#3b82f6'};
    color: ${props => props.theme.primary || '#3b82f6'};
  }

  @media (max-width: 768px) {
    padding: 16px;
    font-size: 13px;
  }
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

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${props => props.theme.textSecondary || '#6b7280'};

  @media (max-width: 768px) {
    padding: 30px 16px;
  }
`;

export function DeliveryPersonSelector({
  isOpen,
  onClose,
  onSelect,
  selectedOrders = [],
  deliveryPersons = [],
  onCreateDeliveryPerson,
  loading = false
}) {
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState(null);

  if (!isOpen) return null;

  const orderCount = selectedOrders.length;
  const totalAmount = selectedOrders.reduce((sum, order) => sum + (order.totalPedido || 0), 0);
  const totalLines = selectedOrders.reduce((sum, order) => sum + (order.totalLineas || 0), 0);

  const handleSelect = () => {
    if (!selectedDeliveryPerson) return;
    onSelect(selectedDeliveryPerson.code);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            Seleccionar Repartidor
          </ModalTitle>
          <CloseButton onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <OrderSummary>
            <SummaryTitle>Resumen de la Carga</SummaryTitle>
            <SummaryGrid>
              <SummaryItem>
                <SummaryValue>{orderCount}</SummaryValue>
                <SummaryLabel>Pedidos</SummaryLabel>
              </SummaryItem>
              <SummaryItem>
                <SummaryValue>{totalLines}</SummaryValue>
                <SummaryLabel>Líneas</SummaryLabel>
              </SummaryItem>
              <SummaryItem>
                <SummaryValue>{formatCurrency(totalAmount)}</SummaryValue>
                <SummaryLabel>Total</SummaryLabel>
              </SummaryItem>
            </SummaryGrid>
          </OrderSummary>

          {deliveryPersons.length === 0 ? (
            <EmptyState>
              <div>No hay repartidores configurados</div>
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                Agrega un repartidor para continuar con la carga
              </div>
            </EmptyState>
          ) : (
            <DeliveryPersonsGrid>
              {deliveryPersons.map(person => (
                <DeliveryPersonCard
                  key={person.code}
                  selected={selectedDeliveryPerson?.code === person.code}
                  onClick={() => setSelectedDeliveryPerson(person)}
                >
                  <DeliveryPersonHeader>
                    <DeliveryPersonIcon>
                      <FaTruck />
                    </DeliveryPersonIcon>
                    <DeliveryPersonInfo>
                      <DeliveryPersonName>{person.name}</DeliveryPersonName>
                      <DeliveryPersonCode>#{person.code}</DeliveryPersonCode>
                    </DeliveryPersonInfo>
                  </DeliveryPersonHeader>
                  <WarehouseInfo>
                    <FaWarehouse />
                    Bodega: {person.assignedWarehouse}
                  </WarehouseInfo>
                </DeliveryPersonCard>
              ))}

              <AddDeliveryPersonButton onClick={onCreateDeliveryPerson}>
                <FaPlus />
                Agregar Repartidor
              </AddDeliveryPersonButton>
            </DeliveryPersonsGrid>
          )}
        </ModalBody>

        <ModalFooter>
          <LoadsButton variant="secondary" onClick={onClose}>
            Cancelar
          </LoadsButton>
          <LoadsButton
            variant="primary"
            onClick={handleSelect}
            disabled={!selectedDeliveryPerson}
            loading={loading}
          >
            <FaTruck /> Asignar y Cargar
          </LoadsButton>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}