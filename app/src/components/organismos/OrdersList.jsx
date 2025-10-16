import styled from "styled-components";
import { useState, useMemo } from "react";
import { OrderCard, LoadsButton} from "../../index";
import { FaList, FaTh, FaTable, FaTruck } from "react-icons/fa";

const Container = styled.div`
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;

  @media (max-width: 768px) {
    margin-bottom: 16px;
    gap: 8px;
  }
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: ${props => props.theme.text || '#111827'};

  @media (max-width: 768px) {
    font-size: 16px;
    width: 100%;
  }
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 8px;
    width: 100%;
    justify-content: space-between;
  }
`;

const ViewModeButtons = styled.div`
  display: flex;
  border: 1px solid ${props => props.theme.border || '#e5e7eb'};
  border-radius: 6px;
  overflow: hidden;
`;

const ViewModeButton = styled.button`
  padding: 8px 12px;
  border: none;
  background: ${props => props.active ? (props.theme.primary || '#3b82f6') : 'transparent'};
  color: ${props => props.active ? 'white' : (props.theme.textSecondary || '#6b7280')};
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;

  &:hover {
    background: ${props => props.active ? (props.theme.primary || '#3b82f6') : (props.theme.cardBg || '#f9fafb')};
  }

  @media (max-width: 768px) {
    padding: 6px 10px;
    font-size: 13px;
  }
`;

const SelectionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: ${props => props.theme.textSecondary || '#6b7280'};
  font-size: 14px;

  @media (max-width: 768px) {
    font-size: 13px;
    gap: 8px;
  }
`;

const SelectAllButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.primary || '#3b82f6'};
  cursor: pointer;
  text-decoration: underline;
  font-size: 14px;

  &:hover {
    opacity: 0.8;
  }

  @media (max-width: 768px) {
    font-size: 13px;
  }
`;

const BulkActions = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 8px;
    margin-bottom: 16px;
  }
`;

const OrdersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const OrdersTable = styled.div`
  border: 1px solid ${(props) => props.theme.border || "#e5e7eb"};
  border-radius: 8px;
  overflow: hidden;
  background: ${(props) => props.theme.cardBg || "white"};
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: auto 120px 1fr 120px 100px 120px 180px;
  background: ${(props) => props.theme.cardHeaderBg || "#f9fafb"};
  padding: 12px;
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => props.theme.textSecondary || "#6b7280"};
  text-transform: uppercase;
  letter-spacing: 0.5px;

  @media (max-width: 768px) {
    grid-template-columns: auto 100px 1fr 80px 120px;
    padding: 10px 8px;
    font-size: 11px;

    & > span:nth-child(6),
    & > span:nth-child(7) {
      display: none;
    }
  }
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: auto 120px 1fr 120px 100px 120px 180px;
  padding: 12px;
  border-top: 1px solid ${(props) => props.theme.border || "#e5e7eb"};
  align-items: center;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.cardBg || "#f9fafb"};
  }

  ${(props) =>
    props.selected &&
    `
    background: ${props.theme.primary || "#3b82f6"}10;
  `}

  @media (max-width: 768px) {
    grid-template-columns: auto 100px 1fr 80px 120px;
    padding: 10px 8px;

    & > *:nth-child(6),
    & > *:nth-child(7) {
      display: none;
    }
  }
`;

const TableCell = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.text || "#111827"};
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 768px) {
    font-size: 12px;
    gap: 6px;
  }
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${(props) => props.theme.textSecondary || "#6b7280"};

  @media (max-width: 768px) {
    padding: 40px 16px;
  }
`;

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  color: ${(props) => props.theme.textSecondary || "#6b7280"};

  @media (max-width: 768px) {
    padding: 40px 16px;
  }
`;

export function OrdersList({
  orders = [],
  selectedOrders = [],
  onOrderSelect,
  onSelectAll,
  onView,
  onEdit,
  onCancel,
  onLoad,
  onBulkLoad,
  onBulkCancel,
  loading = false,
  viewMode = "cards",
}) {
  const [currentViewMode, setCurrentViewMode] = useState(viewMode);

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length && orders.length > 0) {
      onSelectAll([]);
    } else {
      onSelectAll(orders.map((order) => order.pedido));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("es-DO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const pendingOrders = useMemo(() => {
    return orders.filter((order) => order.transferStatus === "pending");
  }, [orders]);

  if (loading) {
    return (
      <Container>
        <LoadingState>
          <div>Cargando pedidos...</div>
        </LoadingState>
      </Container>
    );
  }

  if (orders.length === 0) {
    return (
      <Container>
        <EmptyState>
          <div>No se encontraron pedidos con los filtros aplicados</div>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Pedidos Encontrados ({orders.length})</Title>
        <Controls>
          <ViewModeButtons>
            <ViewModeButton
              active={currentViewMode === "cards"}
              onClick={() => setCurrentViewMode("cards")}
            >
              <FaTh />
            </ViewModeButton>
            <ViewModeButton
              active={currentViewMode === "table"}
              onClick={() => setCurrentViewMode("table")}
            >
              <FaTable />
            </ViewModeButton>
          </ViewModeButtons>

          <SelectionInfo>
            <span>{selectedOrders.length} seleccionados</span>
            <SelectAllButton onClick={handleSelectAll}>
              {selectedOrders.length === orders.length && orders.length > 0
                ? "Deseleccionar todos"
                : "Seleccionar todos"}
            </SelectAllButton>
          </SelectionInfo>
        </Controls>
      </Header>

      {selectedOrders.length > 0 && (
        <BulkActions>
          <LoadsButton
            variant="primary"
            onClick={() => onBulkLoad(selectedOrders)}
            disabled={selectedOrders.some((id) => {
              const order = orders.find((o) => o.pedido === id);
              return order?.transferStatus !== "pending";
            })}
          >
            <FaTruck /> Cargar Seleccionados ({selectedOrders.length})
          </LoadsButton>

          <LoadsButton
            variant="danger"
            onClick={() => onBulkCancel(selectedOrders)}
          >
            Cancelar Seleccionados ({selectedOrders.length})
          </LoadsButton>
        </BulkActions>
      )}

      {currentViewMode === "cards" ? (
        <OrdersGrid>
          {orders.map((order) => (
            <OrderCard
              key={order.pedido}
              order={order}
              selected={selectedOrders.includes(order.pedido)}
              onSelect={onOrderSelect}
              onView={onView}
              onEdit={onEdit}
              onCancel={onCancel}
              onLoad={onLoad}
            />
          ))}
        </OrdersGrid>
      ) : (
        <OrdersTable>
          <TableHeader>
            <span>
              <Checkbox
                type="checkbox"
                checked={
                  selectedOrders.length === orders.length && orders.length > 0
                }
                onChange={handleSelectAll}
              />
            </span>
            <span>Pedido</span>
            <span>Cliente</span>
            <span>Vendedor</span>
            <span>Estado</span>
            <span>Total</span>
            <span>Acciones</span>
          </TableHeader>

          {orders.map((order) => (
            <TableRow
              key={order.pedido}
              selected={selectedOrders.includes(order.pedido)}
            >
              <TableCell>
                <Checkbox
                  type="checkbox"
                  checked={selectedOrders.includes(order.pedido)}
                  onChange={() => onOrderSelect(order.pedido)}
                />
              </TableCell>
              <TableCell>#{order.pedido}</TableCell>
              <TableCell>{order.cliente}</TableCell>
              <TableCell>{order.nombreVendedor}</TableCell>
              <TableCell>
                <StatusBadge status={order.transferStatus}>
                  {order.transferStatus === "pending"
                    ? "Pendiente"
                    : order.transferStatus === "processing"
                    ? "Procesando"
                    : order.transferStatus === "completed"
                    ? "Completado"
                    : order.transferStatus}
                </StatusBadge>
              </TableCell>
              <TableCell>{formatCurrency(order.totalPedido)}</TableCell>
              <TableCell>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  <LoadsButton
                    variant="primary"
                    size="small"
                    onClick={() => onLoad(order.pedido)}
                    disabled={order.transferStatus !== "pending"}
                  >
                    Cargar
                  </LoadsButton>
                  <LoadsButton
                    variant="secondary"
                    size="small"
                    onClick={() => onView(order.pedido)}
                  >
                    Ver
                  </LoadsButton>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </OrdersTable>
      )}
    </Container>
  );
}