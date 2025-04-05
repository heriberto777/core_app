import styled from "styled-components";
import { Header, TransferApi, useAuth, useFetchData } from "../../index";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  FaSync,
  FaFilter,
  FaFileDownload,
  FaPlay,
  FaSearch,
  FaCalendarAlt,
  FaTable,
  FaListAlt,
  FaSpinner,
  FaTrash,
  FaEye,
} from "react-icons/fa";

const orderApi = new TransferApi();

export function OrdersVisualization() {
  const [search, setSearch] = useState("");
  const [openstate, setOpenState] = useState(false);
  const [viewMode, setViewMode] = useState("table"); // "cards", "table"
  const { accessToken, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    warehouse: "all",
    showProcessed: false,
  });

  // Fetch orders data
  const {
    data: orders,
    setData: setOrders,
    loading,
    error,
    refetch: fetchOrders,
  } = useFetchData(
    () => orderApi.getOrders(accessToken, filters),
    [accessToken, filters],
    true,
    30000 // Refresh every 30 seconds
  );

  // Fetch warehouses for filter
  const { data: warehouses, loading: loadingWarehouses } = useFetchData(
    () => orderApi.getWarehouses(accessToken),
    [accessToken],
    true
  );

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      [filterType]: value,
    }));
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    // Search filter
    const matchesSearch =
      order.NUM_PED.toLowerCase().includes(search.toLowerCase()) ||
      order.COD_CLT.toLowerCase().includes(search.toLowerCase()) ||
      (order.COD_BOD &&
        order.COD_BOD.toLowerCase().includes(search.toLowerCase()));

    // Other filters are applied server-side through the API call

    return matchesSearch;
  });

  // Handle selection of orders
  const handleSelectOrder = (orderId) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter((id) => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  // Handle select all orders
  const handleSelectAll = () => {
    if (selectAll || selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
      setSelectAll(false);
    } else {
      setSelectedOrders(filteredOrders.map((order) => order.NUM_PED));
      setSelectAll(true);
    }
  };

  // Process selected orders
  const processOrders = async () => {
    if (selectedOrders.length === 0) {
      Swal.fire({
        title: "Ningún pedido seleccionado",
        text: "Por favor, seleccione al menos un pedido para procesar",
        icon: "warning",
      });
      return;
    }

    try {
      // Ask for confirmation
      const confirmResult = await Swal.fire({
        title: "¿Procesar pedidos?",
        text: `¿Está seguro de procesar ${selectedOrders.length} pedidos?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, procesar",
        cancelButtonText: "Cancelar",
      });

      if (!confirmResult.isConfirmed) return;

      // Show loading
      setIsLoading(true);
      Swal.fire({
        title: "Procesando pedidos...",
        text: "Esto puede tomar un momento",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Execute transfer task with selected order IDs
      const result = await orderApi.processOrders(accessToken, {
        orders: selectedOrders,
        taskName: "STDB_FAC_ENC_PED",
      });

      setIsLoading(false);

      if (result.success) {
        Swal.fire({
          title: "Éxito",
          text: `Se procesaron ${
            result.processed || selectedOrders.length
          } pedidos correctamente`,
          icon: "success",
        });

        // Refresh orders and reset selection
        fetchOrders();
        setSelectedOrders([]);
        setSelectAll(false);
      } else {
        throw new Error(result.message || "Error al procesar los pedidos");
      }
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        title: "Error",
        text: error.message || "Ocurrió un error al procesar los pedidos",
        icon: "error",
      });
    }
  };

  // View order details
  const viewOrderDetails = async (order) => {
    try {
      setIsLoading(true);

      // Get order details including items
      const details = await orderApi.getOrderDetails(
        accessToken,
        order.NUM_PED
      );

      setIsLoading(false);

      // Format currency
      const formatCurrency = (amount) => {
        return new Intl.NumberFormat("es-DO", {
          style: "currency",
          currency: "DOP",
        }).format(amount || 0);
      };

      // Show order details modal
      Swal.fire({
        title: `Pedido: ${order.NUM_PED}`,
        width: 800,
        html: `
          <div class="order-details">
            <div class="order-header">
              <div class="order-header-item">
                <strong>Cliente:</strong> ${order.COD_CLT}
              </div>
              <div class="order-header-item">
                <strong>Fecha:</strong> ${new Date(
                  order.FEC_PED
                ).toLocaleDateString()}
              </div>
              <div class="order-header-item">
                <strong>Estado:</strong> ${order.ESTADO}
              </div>
              <div class="order-header-item">
                <strong>Bodega:</strong> ${order.COD_BOD || "N/A"}
              </div>
              <div class="order-header-item">
                <strong>Total:</strong> ${formatCurrency(order.MON_IMP_VT)}
              </div>
            </div>
            
            <h4>Productos</h4>
            <div class="items-table-container">
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${details.items
                    .map(
                      (item) => `
                    <tr>
                      <td>${item.COD_PRO}</td>
                      <td>${item.DES_PRO || "N/A"}</td>
                      <td>${item.CANTIDAD}</td>
                      <td>${formatCurrency(item.PRECIO)}</td>
                      <td>${formatCurrency(item.SUBTOTAL)}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            
            <div class="order-summary">
              <div class="summary-item"><strong>Subtotal:</strong> ${formatCurrency(
                order.MON_SIV
              )}</div>
              <div class="summary-item"><strong>Impuestos:</strong> ${formatCurrency(
                order.MON_CIV
              )}</div>
              <div class="summary-item"><strong>Descuento:</strong> ${formatCurrency(
                order.MON_DSC
              )}</div>
              <div class="summary-item total"><strong>Total:</strong> ${formatCurrency(
                order.MON_IMP_VT
              )}</div>
            </div>
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: "Cerrar",
        customClass: {
          container: "order-details-container",
        },
      });

      // Add styles for the modal
      const style = document.createElement("style");
      style.textContent = `
        .order-details-container {
          z-index: 9999;
        }
        .order-details {
          text-align: left;
        }
        .order-header {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 20px;
          padding: 10px;
          background-color: #f8f9fa;
          border-radius: 5px;
        }
        .order-header-item {
          flex: 1 1 30%;
          min-width: 150px;
        }
        .items-table-container {
          max-height: 300px;
          overflow-y: auto;
          margin-bottom: 20px;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .items-table th, .items-table td {
          padding: 8px;
          border: 1px solid #ddd;
          text-align: left;
        }
        .items-table th {
          background-color: #f0f0f0;
          position: sticky;
          top: 0;
        }
        .order-summary {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
          padding: 10px;
          background-color: #f8f9fa;
          border-radius: 5px;
        }
        .summary-item.total {
          font-size: 1.2em;
          margin-top: 5px;
          padding-top: 5px;
          border-top: 1px solid #ddd;
        }
      `;
      document.head.appendChild(style);
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudieron cargar los detalles del pedido",
        icon: "error",
      });
    }
  };

  // Export orders to Excel
  const exportToExcel = async () => {
    try {
      setIsLoading(true);

      const exportResult = await orderApi.exportOrders(accessToken, {
        orders: selectedOrders.length > 0 ? selectedOrders : null,
        filters: filters,
      });

      setIsLoading(false);

      // Create blob and download
      const blob = new Blob([exportResult], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        title: "Error",
        text: error.message || "Error al exportar los pedidos",
        icon: "error",
      });
    }
  };

  return (
    <Container>
      <header className="header">
        <Header
          stateConfig={{
            openstate: openstate,
            setOpenState: () => setOpenState(!openstate),
          }}
        />
      </header>

      <section className="area1">
        <ToolbarContainer>
          <InfoSection>
            <h2>Gestión de Pedidos</h2>
            <p>Visualice y procese los pedidos pendientes del sistema</p>
          </InfoSection>
        </ToolbarContainer>
      </section>

      <section className="area2">
        <ActionsContainer>
          <SearchInputContainer>
            <SearchInput
              type="text"
              placeholder="Buscar pedido o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </SearchInputContainer>

          {/* Filters Container */}
          <FiltersContainer>
            <FilterGroup>
              <FilterLabel>Desde:</FilterLabel>
              <DateInput
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              />
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Hasta:</FilterLabel>
              <DateInput
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              />
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Estado:</FilterLabel>
              <FilterSelect
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="P">Pendientes</option>
                <option value="F">Facturados</option>
                <option value="A">Anulados</option>
              </FilterSelect>
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Bodega:</FilterLabel>
              <FilterSelect
                value={filters.warehouse}
                onChange={(e) =>
                  handleFilterChange("warehouse", e.target.value)
                }
                disabled={loadingWarehouses}
              >
                <option value="all">Todas</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.COD_BOD} value={warehouse.COD_BOD}>
                    {warehouse.COD_BOD} - {warehouse.NOM_BOD}
                  </option>
                ))}
              </FilterSelect>
            </FilterGroup>

            <FilterGroup>
              <CheckboxContainer>
                <CheckboxInput
                  type="checkbox"
                  id="showProcessed"
                  checked={filters.showProcessed}
                  onChange={(e) =>
                    handleFilterChange("showProcessed", e.target.checked)
                  }
                />
                <CheckboxLabel htmlFor="showProcessed">
                  Mostrar procesados
                </CheckboxLabel>
              </CheckboxContainer>
            </FilterGroup>

            <ResetFiltersButton
              onClick={() =>
                setFilters({
                  dateFrom: new Date(
                    new Date().setDate(new Date().getDate() - 30)
                  )
                    .toISOString()
                    .split("T")[0],
                  dateTo: new Date().toISOString().split("T")[0],
                  status: "all",
                  warehouse: "all",
                  showProcessed: false,
                })
              }
            >
              Limpiar Filtros
            </ResetFiltersButton>
          </FiltersContainer>

          <ButtonsRow>
            <ActionButton onClick={fetchOrders} title="Refrescar datos">
              <FaSync /> Refrescar
            </ActionButton>

            <ActionButton
              onClick={processOrders}
              title="Procesar pedidos seleccionados"
              disabled={isLoading || selectedOrders.length === 0}
            >
              <FaPlay /> Procesar Seleccionados
            </ActionButton>

            <ActionButton
              onClick={exportToExcel}
              title="Exportar a Excel"
              disabled={isLoading || filteredOrders.length === 0}
            >
              <FaFileDownload /> Exportar
            </ActionButton>

            <ViewButtonsGroup>
              <ViewButton
                $active={viewMode === "table"}
                onClick={() => setViewMode("table")}
                title="Ver como tabla"
              >
                <FaTable /> Tabla
              </ViewButton>
              <ViewButton
                $active={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                title="Ver como tarjetas"
              >
                <FaListAlt /> Tarjetas
              </ViewButton>
            </ViewButtonsGroup>
          </ButtonsRow>

          <OrdersCountLabel>
            Mostrando {filteredOrders.length} de {orders.length} pedidos
            {selectedOrders.length > 0 &&
              ` | ${selectedOrders.length} seleccionados`}
          </OrdersCountLabel>
        </ActionsContainer>
      </section>

      <section className="main">
        {loading && (
          <LoadingContainer>
            <LoadingSpinner />
            <LoadingMessage>Cargando pedidos...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && filteredOrders.length === 0 && (
          <EmptyMessage>
            No se encontraron pedidos con los filtros seleccionados.
          </EmptyMessage>
        )}

        {isLoading && (
          <OverlayLoading>
            <LoadingSpinner size="large" />
          </OverlayLoading>
        )}

        {!loading && filteredOrders.length > 0 && viewMode === "table" && (
          <TableContainer>
            <StyledTable>
              <thead>
                <tr>
                  <th className="checkbox-column">
                    <CheckboxInput
                      type="checkbox"
                      checked={
                        selectAll ||
                        (selectedOrders.length > 0 &&
                          selectedOrders.length === filteredOrders.length)
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Bodega</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th className="actions-column">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.NUM_PED}>
                    <td className="checkbox-column">
                      <CheckboxInput
                        type="checkbox"
                        checked={selectedOrders.includes(order.NUM_PED)}
                        onChange={() => handleSelectOrder(order.NUM_PED)}
                      />
                    </td>
                    <td>{order.NUM_PED}</td>
                    <td>{order.COD_CLT}</td>
                    <td>{new Date(order.FEC_PED).toLocaleDateString()}</td>
                    <td>{order.COD_BOD || "N/A"}</td>
                    <td>
                      <StatusBadge status={order.ESTADO}>
                        {order.ESTADO === "P" && "Pendiente"}
                        {order.ESTADO === "F" && "Facturado"}
                        {order.ESTADO === "A" && "Anulado"}
                        {!["P", "F", "A"].includes(order.ESTADO) &&
                          order.ESTADO}
                      </StatusBadge>
                    </td>
                    <td className="amount-column">
                      {new Intl.NumberFormat("es-DO", {
                        style: "currency",
                        currency: "DOP",
                      }).format(order.MON_IMP_VT || 0)}
                    </td>
                    <td className="actions-column">
                      <ActionButtons>
                        <TableActionButton
                          title="Ver detalles"
                          $color="#007bff"
                          onClick={() => viewOrderDetails(order)}
                        >
                          <FaEye />
                        </TableActionButton>

                        <TableActionButton
                          title="Procesar pedido"
                          $color="#28a745"
                          onClick={() => {
                            setSelectedOrders([order.NUM_PED]);
                            processOrders();
                          }}
                          disabled={order.ESTADO !== "P" || order.IS_PROCESSED}
                        >
                          <FaPlay />
                        </TableActionButton>
                      </ActionButtons>
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </TableContainer>
        )}

        {!loading && filteredOrders.length > 0 && viewMode === "cards" && (
          <CardsContainer>
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.NUM_PED}
                $selected={selectedOrders.includes(order.NUM_PED)}
                $status={order.ESTADO}
              >
                <CardHeader>
                  <CardTitle>Pedido: {order.NUM_PED}</CardTitle>
                  <StatusBadge status={order.ESTADO}>
                    {order.ESTADO === "P" && "Pendiente"}
                    {order.ESTADO === "F" && "Facturado"}
                    {order.ESTADO === "A" && "Anulado"}
                    {!["P", "F", "A"].includes(order.ESTADO) && order.ESTADO}
                  </StatusBadge>
                </CardHeader>

                <CardContent>
                  <CardInfo>
                    <InfoItem>
                      <InfoLabel>Cliente:</InfoLabel>
                      <InfoValue>{order.COD_CLT}</InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Fecha:</InfoLabel>
                      <InfoValue>
                        {new Date(order.FEC_PED).toLocaleDateString()}
                      </InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Bodega:</InfoLabel>
                      <InfoValue>{order.COD_BOD || "N/A"}</InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Total:</InfoLabel>
                      <InfoValue>
                        {new Intl.NumberFormat("es-DO", {
                          style: "currency",
                          currency: "DOP",
                        }).format(order.MON_IMP_VT || 0)}
                      </InfoValue>
                    </InfoItem>
                  </CardInfo>
                </CardContent>

                <CardActions>
                  <CardCheckbox>
                    <CheckboxInput
                      type="checkbox"
                      checked={selectedOrders.includes(order.NUM_PED)}
                      onChange={() => handleSelectOrder(order.NUM_PED)}
                    />
                    <span>Seleccionar</span>
                  </CardCheckbox>

                  <ActionButtonsContainer>
                    <ActionRow>
                      <CardActionButton
                        $color="#007bff"
                        onClick={() => viewOrderDetails(order)}
                        title="Ver detalles"
                      >
                        <FaEye />
                      </CardActionButton>

                      <CardActionButton
                        $color="#28a745"
                        onClick={() => {
                          setSelectedOrders([order.NUM_PED]);
                          processOrders();
                        }}
                        disabled={order.ESTADO !== "P" || order.IS_PROCESSED}
                        title="Procesar pedido"
                      >
                        <FaPlay />
                      </CardActionButton>
                    </ActionRow>
                  </ActionButtonsContainer>
                </CardActions>
              </OrderCard>
            ))}
          </CardsContainer>
        )}
      </section>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  min-height: 100vh;
  padding: 15px;
  width: 100%;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  display: grid;
  grid-template:
    "header" 90px
    "area1" auto
    "area2" auto
    "main" 1fr;

  @media (max-width: 768px) {
    grid-template:
      "header" 70px
      "area1" auto
      "area2" auto
      "main" 1fr;
    padding: 10px;
  }

  @media (max-width: 480px) {
    grid-template:
      "header" 60px
      "area1" auto
      "area2" auto
      "main" 1fr;
    padding: 5px;
  }

  .header {
    grid-area: header;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .area1 {
    grid-area: area1;
    margin-bottom: 10px;
  }

  .area2 {
    grid-area: area2;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 20px;

    @media (max-width: 768px) {
      margin-top: 15px;
      margin-bottom: 10px;
    }

    @media (max-width: 480px) {
      margin-top: 10px;
      margin-bottom: 5px;
      flex-direction: column;
    }
  }

  .main {
    grid-area: main;
    margin-top: 10px;
    overflow-x: auto;
    position: relative;

    @media (max-width: 768px) {
      padding: 10px;
    }

    @media (max-width: 480px) {
      padding: 5px;
    }
  }
`;

// Toolbar & Info Section
const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 0;
`;

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 5px;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.title || theme.text};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }
`;

// Actions Container
const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const SearchInputContainer = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  margin-bottom: 10px;
`;

const SearchInput = styled.input`
  width: 100%;
  max-width: 800px;
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

// Filters
const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 15px;
  justify-content: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;

  @media (max-width: 768px) {
    width: 100%;
    max-width: 300px;
  }
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  white-space: nowrap;
`;

const FilterSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  color: ${({ theme }) => theme.text};

  @media (max-width: 768px) {
    flex: 1;
  }
`;

const DateInput = styled.input`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  color: ${({ theme }) => theme.text};

  @media (max-width: 768px) {
    flex: 1;
  }
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const CheckboxInput = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  cursor: pointer;
`;

const ResetFiltersButton = styled.button`
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #5a6268;
  }

  @media (max-width: 768px) {
    width: 100%;
    max-width: 300px;
  }
`;

// Buttons row
const ButtonsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;

  @media (max-width: 480px) {
    flex-direction: column;
    width: 100%;
  }
`;

const ActionButton = styled.button`
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #138496;
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const ViewButtonsGroup = styled.div`
  display: flex;
  margin-left: 10px;
`;

const ViewButton = styled.button`
  background-color: ${(props) => (props.$active ? "#6c757d" : "#f8f9fa")};
  color: ${(props) => (props.$active ? "white" : "#212529")};
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;

  &:hover {
    background-color: ${(props) => (props.$active ? "#5a6268" : "#e2e6ea")};
  }

  @media (max-width: 480px) {
    flex: 1;
  }
`;

const OrdersCountLabel = styled.div`
  text-align: center;
  margin-bottom: 15px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

// Loading and Error
const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 200px;
  gap: 20px;
`;

const LoadingSpinner = styled(FaSpinner)`
  font-size: ${(props) => (props.size === "large" ? "4rem" : "2rem")};
  color: #17a2b8;
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const OverlayLoading = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ErrorMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 8px;
  margin: 20px 0;
`;

const EmptyMessage = styled.div`
  padding: 30px;
  text-align: center;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

// Table View
const TableContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};

  th,
  td {
    padding: 12px 15px;
    text-align: left;
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader || "#f0f0f0"};
    color: ${({ theme }) => theme.tableHeaderText || "#333"};
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }
  }

  .checkbox-column {
    width: 40px;
    text-align: center;
  }

  .actions-column {
    width: 100px;
    text-align: center;
  }

  .amount-column {
    text-align: right;
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  background-color: ${(props) => {
    switch (props.status) {
      case "P":
        return "#17a2b8"; // Pending
      case "F":
        return "#28a745"; // Facturado
      case "A":
        return "#dc3545"; // Anulado
      default:
        return "#6c757d"; // Other
    }
  }};
  color: white;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 5px;
  justify-content: center;
`;

const TableActionButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.$color || "#0275d8"};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.$color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    color: #adb5bd;
    cursor: not-allowed;
  }
`;

// Cards View
const CardsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  justify-content: center;
  padding: 10px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

const OrderCard = styled.div`
  width: 320px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-left: 4px solid
    ${(props) => {
      if (props.$selected) return "#007bff";
      switch (props.$status) {
        case "P":
          return "#17a2b8"; // Pending
        case "F":
          return "#28a745"; // Facturado
        case "A":
          return "#dc3545"; // Anulado
        default:
          return "#6c757d"; // Other
      }
    }};
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  padding: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => theme.cardHeaderBg || "#f8f9fa"};
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.title || theme.text};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 10px;
`;

const CardContent = styled.div`
  padding: 15px;
  flex: 1;
`;

const CardInfo = styled.div`
  margin-bottom: 15px;
`;

const InfoItem = styled.div`
  display: flex;
  margin-bottom: 8px;
  font-size: 14px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const InfoLabel = styled.span`
  font-weight: 500;
  width: 80px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const InfoValue = styled.span`
  flex: 1;
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  padding: 15px;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  background-color: ${({ theme }) => theme.cardFooterBg || "#f8f9fa"};
  justify-content: space-between;
  align-items: center;
`;

const CardCheckbox = styled.label`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  cursor: pointer;
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
`;

const CardActionButton = styled.button`
  padding: 8px;
  border: none;
  border-radius: 4px;
  background-color: ${(props) => props.$color || "#6c757d"};
  color: white;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;

  &:hover {
    filter: brightness(90%);
  }

  &:disabled {
    background-color: #adb5bd;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;
