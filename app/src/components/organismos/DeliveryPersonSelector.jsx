// app/src/components/organismos/DeliveryPersonSelector.jsx - MEJORADO CON STICKY HEADER Y ICONOS
import styled from "styled-components";
import { useState } from "react";
import { LoadsButton } from "../../index";
import { FaTruck, FaWarehouse, FaTimes, FaUser, FaCheckCircle, FaCircle,  } from "react-icons/fa";

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
  position: sticky;
  top: 0;
  background: ${props => props.theme.cardBg || 'white'};
  z-index: 10;

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

const StickySection = styled.div`
  position: sticky;
  top: 81px; /* Altura del header + border */
  background: ${props => props.theme.cardBg || 'white'};
  z-index: 9;
  padding: 20px 20px 0 20px;

  @media (max-width: 768px) {
    top: 65px; /* Altura ajustada para móvil */
    padding: 16px 16px 0 16px;
  }
`;

const ModalBody = styled.div`
  padding: 0 20px 20px 20px;
  overflow-y: auto;
  flex: 1;

  @media (max-width: 768px) {
    padding: 0 16px 16px 16px;
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
    grid-template-columns: 1fr 1fr 1fr;
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
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 20px;

  @media (max-width: 768px) {
    gap: 10px;
    margin-top: 16px;
  }
`;

const DeliveryPersonCard = styled.div`
  border: 2px solid ${props => props.selected ? '#10b981' : (props.theme.border || '#e5e7eb')};
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.selected ? '#dcfce7' : (props.theme.cardBg || 'white')};
  position: relative;

  &:hover {
    border-color: ${props => props.selected ? '#10b981' : '#3b82f6'};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    padding: 12px;
  }
`;

const SelectionIcon = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 20px;
  color: ${props => props.selected ? '#10b981' : '#d1d5db'};
  transition: color 0.2s ease;

  @media (max-width: 768px) {
    top: 10px;
    right: 10px;
    font-size: 18px;
  }
`;

const DeliveryPersonHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-right: 30px; /* Espacio para el ícono de selección */

  @media (max-width: 768px) {
    gap: 10px;
    margin-bottom: 10px;
    padding-right: 25px;
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

const ModalFooter = styled.div`
  padding: 20px;
  border-top: 1px solid ${props => props.theme.border || '#e5e7eb'};
  background: ${props => props.theme.cardBg || 'white'};
  position: sticky;
  bottom: 0;
  z-index: 10;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const SelectedVendedorInfo = styled.div`
  background: #f0f9ff;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  display: ${props => props.show ? 'block' : 'none'};

  @media (max-width: 768px) {
    padding: 10px;
    margin-bottom: 12px;
  }
`;

const SelectedVendedorTitle = styled.div`
  font-size: 12px;
  color: #1e40af;
  font-weight: 600;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SelectedVendedorDetails = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const SelectedVendedorName = styled.div`
  font-weight: 600;
  color: #1e40af;
`;

const SelectedVendedorCode = styled.div`
  font-size: 12px;
  color: #6b7280;
  font-family: monospace;
`;

const SelectedVendedorWarehouse = styled.div`
  font-size: 12px;
  color: #059669;
  font-weight: 500;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  @media (max-width: 768px) {
    gap: 8px;
    flex-direction: column;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${props => props.theme.textSecondary};

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
  loading = false
}) {
  const [selectedVendedor, setSelectedVendedor] = useState(null);

  // DEPURACIÓN: Agregar logs para entender el problema
  console.log("DeliveryPersonSelector - selectedVendedor:", selectedVendedor);
  console.log("DeliveryPersonSelector - deliveryPersons:", deliveryPersons);

  if (!isOpen) return null;

  const orderCount = selectedOrders.length;
  const totalAmount = selectedOrders.reduce(
    (sum, order) => sum + (order.totalPedido || 0),
    0
  );
  const totalLines = selectedOrders.reduce(
    (sum, order) => sum + (order.totalLineas || 0),
    0
  );

  const handleSelect = () => {
    if (!selectedVendedor) return;
    onSelect(selectedVendedor.code || selectedVendedor.VENDEDOR);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Asignar Vendedor/Repartidor</ModalTitle>
          <CloseButton onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <StickySection>
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
        </StickySection>

        <ModalBody>
          {deliveryPersons.length === 0 ? (
            <EmptyState>
              <div>No hay vendedores activos disponibles</div>
              <div style={{ marginTop: "8px", fontSize: "13px" }}>
                Contacta al administrador para configurar vendedores
              </div>
            </EmptyState>
          ) : (
            <DeliveryPersonsGrid>
              {deliveryPersons
                .filter((vendedor) => vendedor.isVendedor === "Re")
                .map((vendedor) => {
                  const vendedorId =
                    vendedor.code || vendedor.VENDEDOR || vendedor.id;
                  const selectedId =
                    selectedVendedor?.code ||
                    selectedVendedor?.VENDEDOR ||
                    selectedVendedor?.id;
                  const isSelected = selectedId === vendedorId;

                  // DEPURACIÓN: Log para cada vendedor
                  console.log(`Vendedor ${vendedorId}:`, {
                    vendedorId,
                    selectedId,
                    isSelected,
                    vendedor,
                    selectedVendedor,
                  });

                  return (
                    <DeliveryPersonCard
                      key={vendedor.code || vendedor.VENDEDOR}
                      selected={isSelected}
                      onClick={() => {
                        console.log("Seleccionando vendedor:", vendedor);
                        setSelectedVendedor(vendedor);
                      }}
                    >
                      <SelectionIcon selected={isSelected}>
                        {isSelected ? <FaCheckCircle /> : <FaCircle />}
                      </SelectionIcon>

                      <DeliveryPersonHeader>
                        <DeliveryPersonIcon>
                          <FaUser />
                        </DeliveryPersonIcon>
                        <DeliveryPersonInfo>
                          <DeliveryPersonName>
                            {vendedor.name || vendedor.NOMBRE}
                          </DeliveryPersonName>
                          <DeliveryPersonCode>
                            #{vendedor.code || vendedor.VENDEDOR}
                          </DeliveryPersonCode>
                        </DeliveryPersonInfo>
                      </DeliveryPersonHeader>
                      <WarehouseInfo>
                        <FaWarehouse />
                        Bodega:{" "}
                        {vendedor.assignedWarehouse ||
                          vendedor.BODEGA_ASIGNADA ||
                          "No asignada"}
                      </WarehouseInfo>
                    </DeliveryPersonCard>
                  );
                })}
            </DeliveryPersonsGrid>
          )}
        </ModalBody>

        <ModalFooter>
          <SelectedVendedorInfo show={!!selectedVendedor}>
            <SelectedVendedorTitle>Vendedor Seleccionado</SelectedVendedorTitle>
            <SelectedVendedorDetails>
              <div>
                <SelectedVendedorName>
                  {selectedVendedor?.name || selectedVendedor?.NOMBRE}
                </SelectedVendedorName>
                <SelectedVendedorCode>
                  #{selectedVendedor?.code || selectedVendedor?.VENDEDOR}
                </SelectedVendedorCode>
              </div>
              <SelectedVendedorWarehouse>
                Bodega:{" "}
                {selectedVendedor?.assignedWarehouse ||
                  selectedVendedor?.BODEGA_ASIGNADA ||
                  "No asignada"}
              </SelectedVendedorWarehouse>
            </SelectedVendedorDetails>
          </SelectedVendedorInfo>

          <FooterActions>
            <LoadsButton variant="secondary" onClick={onClose}>
              Cancelar
            </LoadsButton>
            <LoadsButton
              variant="primary"
              onClick={handleSelect}
              disabled={!selectedVendedor}
              loading={loading}
            >
              <FaTruck /> Asignar y Procesar ({orderCount} pedidos)
            </LoadsButton>
          </FooterActions>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}