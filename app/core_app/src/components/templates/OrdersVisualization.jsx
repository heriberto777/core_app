// pages/OrdersVisualization.jsx
import styled from "styled-components";
import { useState, useEffect } from "react";
import {
  Header,
  TransferApi,
  useAuth,
  useFetchData,
  MappingsList,
  MappingEditor,
} from "../../index";

import Swal from "sweetalert2";
import {
  FaSync,
  FaFilter,
  FaPlay,
  FaSearch,
  FaTable,
  FaListAlt,
  FaSpinner,
  FaEye,
  FaArrowLeft,
  FaEdit,
  FaPlus,
  FaInfoCircle,
} from "react-icons/fa";

const api = new TransferApi();

export function OrdersVisualization() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const { accessToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [openstate, setOpenState] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [activeView, setActiveView] = useState("mappingsList"); // mappingsList, mappingEditor, documents
  const [activeMappingId, setActiveMappingId] = useState(null);
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [showConfigInfo, setShowConfigInfo] = useState(false);
  const [activeConfig, setActiveConfig] = useState(null);
  const [activeMappingName, setActiveMappingName] = useState("");

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

  // Fetch orders data when a mapping is selected
  const {
    data: orders,
    setData: setOrders,
    loading,
    error,
    refetch: fetchOrders,
  } = useFetchData(
    () =>
      activeMappingId
        ? api.getDocumentsByMapping(accessToken, activeMappingId, filters)
        : [],
    [accessToken, activeMappingId, filters],
    !!activeMappingId,
    30000 // Refresh every 30 seconds
  );

  // Load mapping configuration when activeMappingId changes
  useEffect(() => {
    if (activeMappingId) {
      loadMappingConfig(activeMappingId);
    }
  }, [activeMappingId]);

  // Load mapping configuration details
  const loadMappingConfig = async (mappingId) => {
    try {
      setIsLoading(true);
      const config = await api.getMappingById(accessToken, mappingId);
      setActiveConfig(config);
      setActiveMappingName(config.name || "Configuración sin nombre");
      setIsLoading(false);
    } catch (error) {
      console.error("Error al cargar configuración:", error);
      setIsLoading(false);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cargar los detalles de la configuración",
      });
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    // Simple search filter for any field
    if (!search) return true;

    const searchLower = search.toLowerCase();
    return Object.values(order).some(
      (value) =>
        value &&
        typeof value === "string" &&
        value.toLowerCase().includes(searchLower)
    );
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
      // Identifying field may vary by mapping - assuming it's the first key
      const idField =
        filteredOrders.length > 0 ? Object.keys(filteredOrders[0])[0] : null;

      if (idField) {
        setSelectedOrders(filteredOrders.map((order) => order[idField]));
        setSelectAll(true);
      }
    }
  };

  // Process selected orders using dynamic mapping
  const processOrders = async () => {
    if (!activeMappingId) {
      Swal.fire({
        title: "Error",
        text: "No hay configuración de mapeo seleccionada",
        icon: "error",
      });
      return;
    }

    if (selectedOrders.length === 0) {
      Swal.fire({
        title: "Ningún documento seleccionado",
        text: "Por favor, seleccione al menos un documento para procesar",
        icon: "warning",
      });
      return;
    }

    try {
      // Ask for confirmation
      const confirmResult = await Swal.fire({
        title: "¿Procesar documentos?",
        text: `¿Está seguro de procesar ${selectedOrders.length} documentos?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, procesar",
        cancelButtonText: "Cancelar",
      });

      if (!confirmResult.isConfirmed) return;

      // Show loading
      setIsLoading(true);
      Swal.fire({
        title: "Procesando documentos...",
        text: "Esto puede tomar un momento",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Execute process with selected document IDs
      const result = await api.processDocumentsByMapping(
        accessToken,
        activeMappingId,
        selectedOrders
      );

      setIsLoading(false);

      if (result.success) {
        // Show detailed summary with error information if available
        Swal.fire({
          title: "Procesamiento completado",
          html: `
            <div class="result-summary">
              <p><strong>Resumen:</strong></p>
              <ul>
                <li>Procesados correctamente: ${result.processed || 0}</li>
                <li>Fallidos: ${result.failed || 0}</li>
                <li>Omitidos: ${result.skipped || 0}</li>
              </ul>
              ${
                result.failed > 0 ||
                (result.details &&
                  result.details.filter((d) => !d.success).length > 0)
                  ? `<p><strong>Detalles de errores:</strong></p>
                <div class="error-details" style="max-height:200px;overflow-y:auto;text-align:left;background:#f8f8f8;padding:10px;border-radius:4px;margin-top:10px;">
                  ${
                    result.details
                      ? result.details
                          .filter((detail) => !detail.success)
                          .map(
                            (
                              detail
                            ) => `<p style="margin:5px 0;border-bottom:1px solid #eee;padding-bottom:5px;">
                        <strong>Documento ${detail.documentId}:</strong> ${
                              detail.message || "Error no especificado"
                            }
                      </p>`
                          )
                          .join("")
                      : "<p>No hay detalles específicos del error disponibles.</p>"
                  }
                </div>`
                  : ""
              }
            </div>
          `,
          icon: "success",
          width: 600,
        });

        // Refresh orders and reset selection
        fetchOrders();
        setSelectedOrders([]);
        setSelectAll(false);
      } else {
        throw new Error(result.message || "Error al procesar los documentos");
      }
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        title: "Error",
        text: error.message || "Ocurrió un error al procesar los documentos",
        icon: "error",
      });
    }
  };

  // View order details using dynamic mapping
  const viewOrderDetails = async (order) => {
    try {
      if (!activeMappingId) {
        Swal.fire({
          title: "Error",
          text: "No hay configuración de mapeo seleccionada",
          icon: "error",
        });
        return;
      }

      setIsLoading(true);

      // Determine the ID field (first property as default)
      const idField = Object.keys(order)[0];
      const documentId = order[idField];

      // Get order details including items using the mapping config
      const details = await api.getDocumentDetailsByMapping(
        accessToken,
        activeMappingId,
        documentId
      );

      setIsLoading(false);

      // Format currency
      const formatCurrency = (amount) => {
        return new Intl.NumberFormat("es-DO", {
          style: "currency",
          currency: "DOP",
        }).format(amount || 0);
      };

      // Get all detail items across all detail tables
      const allDetails = [];

      if (details.data && details.data.details) {
        // Merge all detail items from all detail tables
        Object.values(details.data.details).forEach((tableItems) => {
          if (Array.isArray(tableItems)) {
            allDetails.push(...tableItems);
          }
        });
      }

      // Show order details modal
      Swal.fire({
        title: `Documento: ${documentId}`,
        width: 800,
        html: `
          <div class="order-details">
            <div class="order-header">
              ${Object.entries(order)
                .filter(([key]) => key !== idField) // Skip ID field
                .map(
                  ([key, value]) =>
                    `<div class="order-header-item">
                    <strong>${key}:</strong> ${value !== null ? value : "N/A"}
                  </div>`
                )
                .join("")}
            </div>
            
            <h4>Detalle</h4>
            <div class="items-table-container">
              <table class="items-table">
                <thead>
                  <tr>
                    ${
                      allDetails.length > 0
                        ? Object.keys(allDetails[0])
                            .map((key) => `<th>${key}</th>`)
                            .join("")
                        : "<th>No hay detalles disponibles</th>"
                    }
                  </tr>
                </thead>
                <tbody>
                  ${allDetails
                    .map(
                      (item) =>
                        `<tr>
                      ${Object.values(item)
                        .map(
                          (value) =>
                            `<td>${value !== null ? value : "N/A"}</td>`
                        )
                        .join("")}
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
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
      `;
      document.head.appendChild(style);
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        title: "Error",
        text:
          error.message || "No se pudieron cargar los detalles del documento",
        icon: "error",
      });
    }
  };

  // Handle mapping selection from list
  const handleSelectMapping = (mappingId) => {
    setActiveMappingId(mappingId);
    setActiveView("documents");
    setSelectedOrders([]);
    setSelectAll(false);
  };

  // Handle editing mapping
  const handleEditMapping = (mappingId) => {
    setEditingMappingId(mappingId);
    setActiveView("mappingEditor");
  };

  // Handle creating new mapping
  const handleCreateMapping = () => {
    setEditingMappingId(null);
    setActiveView("mappingEditor");
  };

  // Handle save mapping
  const handleSaveMapping = (result) => {
    if (result._id) {
      // If we're editing and this is also the active mapping, refresh data
      if (activeMappingId === result._id) {
        fetchOrders();
        loadMappingConfig(result._id); // Reload config
      }
    }
    setActiveView("mappingsList");
  };

  // Render the appropriate view based on active state
  const renderView = () => {
    switch (activeView) {
      case "mappingsList":
        return (
          <MappingsList
            onSelectMapping={handleSelectMapping}
            onEditMapping={handleEditMapping}
            onCreateMapping={handleCreateMapping}
          />
        );

      case "mappingEditor":
        return (
          <MappingEditor
            mappingId={editingMappingId}
            onSave={handleSaveMapping}
            onCancel={() => setActiveView("mappingsList")}
          />
        );

      case "documents":
        return (
          <>
            {/* Back button to return to mappings list */}
            <BackButton onClick={() => setActiveView("mappingsList")}>
              <FaArrowLeft /> Volver a configuraciones
            </BackButton>

            {/* Configuration info panel */}
            <ConfigInfoButton
              onClick={() => setShowConfigInfo(!showConfigInfo)}
            >
              <FaInfoCircle /> {showConfigInfo ? "Ocultar" : "Mostrar"} Detalles
              de Configuración
            </ConfigInfoButton>

            {showConfigInfo && (
              <ConfigInfoPanel>
                <h3>Configuración activa: {activeMappingName}</h3>
                <ConfigInfoSection>
                  <h4>Información General</h4>
                  <InfoItem>
                    <InfoLabel>Tipo de transferencia:</InfoLabel>
                    <InfoValue>{activeConfig?.transferType || "N/A"}</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Servidor origen:</InfoLabel>
                    <InfoValue>{activeConfig?.sourceServer || "N/A"}</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Servidor destino:</InfoLabel>
                    <InfoValue>{activeConfig?.targetServer || "N/A"}</InfoValue>
                  </InfoItem>
                </ConfigInfoSection>

                <ConfigInfoSection>
                  <h4>Tipos de Documento</h4>
                  {activeConfig?.documentTypeRules?.length ? (
                    activeConfig.documentTypeRules.map((rule, index) => (
                      <RuleItem key={index}>
                        <div>
                          <strong>{rule.name}</strong>: {rule.sourceField} ={" "}
                          {rule.sourceValues.join(", ")}
                        </div>
                        {rule.description && <div>{rule.description}</div>}
                      </RuleItem>
                    ))
                  ) : (
                    <div>No hay reglas de tipo de documento definidas</div>
                  )}
                </ConfigInfoSection>

                <ConfigInfoSection>
                  <h4>Tablas</h4>
                  {activeConfig?.tableConfigs?.length ? (
                    activeConfig.tableConfigs.map((table, index) => (
                      <TableInfoItem key={index}>
                        <div>
                          <strong>{table.name}</strong> (
                          {table.isDetailTable ? "Detalle" : "Principal"})
                        </div>
                        <div>
                          Origen: {table.sourceTable} → Destino:{" "}
                          {table.targetTable}
                        </div>
                        <div>Clave: {table.primaryKey || "N/A"}</div>
                        {table.isDetailTable && (
                          <div>Padre: {table.parentTableRef || "N/A"}</div>
                        )}
                        <div>
                          {table.fieldMappings?.length || 0} campos mapeados
                        </div>
                      </TableInfoItem>
                    ))
                  ) : (
                    <div>No hay tablas configuradas</div>
                  )}
                </ConfigInfoSection>
              </ConfigInfoPanel>
            )}

            <ActionsContainer>
              <SearchInputContainer>
                <SearchInput
                  type="text"
                  placeholder="Buscar documento..."
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
                    onChange={(e) =>
                      setFilters({ ...filters, dateFrom: e.target.value })
                    }
                  />
                </FilterGroup>

                <FilterGroup>
                  <FilterLabel>Hasta:</FilterLabel>
                  <DateInput
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters({ ...filters, dateTo: e.target.value })
                    }
                  />
                </FilterGroup>

                <FilterGroup>
                  <FilterLabel>Estado:</FilterLabel>
                  <FilterSelect
                    value={filters.status}
                    onChange={(e) =>
                      setFilters({ ...filters, status: e.target.value })
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="P">Pendientes</option>
                    <option value="F">Facturados</option>
                    <option value="A">Anulados</option>
                  </FilterSelect>
                </FilterGroup>

                <CheckboxContainer>
                  <CheckboxInput
                    type="checkbox"
                    id="showProcessed"
                    checked={filters.showProcessed}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        showProcessed: e.target.checked,
                      })
                    }
                  />
                  <CheckboxLabel htmlFor="showProcessed">
                    Mostrar procesados
                  </CheckboxLabel>
                </CheckboxContainer>

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
                  title="Procesar documentos seleccionados"
                  disabled={isLoading || selectedOrders.length === 0}
                >
                  <FaPlay /> Procesar Seleccionados
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
                Mostrando {filteredOrders.length} de {orders.length} documentos
                {selectedOrders.length > 0 &&
                  ` | ${selectedOrders.length} seleccionados`}
              </OrdersCountLabel>
            </ActionsContainer>

            {/* Loading state */}
            {loading && (
              <LoadingContainer>
                <LoadingSpinner />
                <LoadingMessage>Cargando documentos...</LoadingMessage>
              </LoadingContainer>
            )}

            {/* Error state */}
            {error && <ErrorMessage>{error}</ErrorMessage>}

            {/* No results state */}
            {!loading && filteredOrders.length === 0 && (
              <EmptyMessage>
                No se encontraron documentos con los filtros seleccionados.
              </EmptyMessage>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <OverlayLoading>
                <LoadingSpinner size="large" />
              </OverlayLoading>
            )}

            {/* Table view */}
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
                      {/* Dynamic headers based on first document */}
                      {Object.keys(filteredOrders[0]).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                      <th className="actions-column">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      // Get document ID (assuming it's the first field)
                      const documentId = order[Object.keys(order)[0]];

                      return (
                        <tr key={index}>
                          <td className="checkbox-column">
                            <CheckboxInput
                              type="checkbox"
                              checked={selectedOrders.includes(documentId)}
                              onChange={() => handleSelectOrder(documentId)}
                            />
                          </td>
                          {/* Dynamic cells */}
                          {Object.entries(order).map(([key, value]) => (
                            <td key={key}>{value !== null ? value : "N/A"}</td>
                          ))}
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
                                title="Procesar documento"
                                $color="#28a745"
                                onClick={() => {
                                  setSelectedOrders([documentId]);
                                  processOrders();
                                }}
                              >
                                <FaPlay />
                              </TableActionButton>
                            </ActionButtons>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </StyledTable>
              </TableContainer>
            )}

            {/* Cards view */}
            {!loading && filteredOrders.length > 0 && viewMode === "cards" && (
              <CardsContainer>
                {filteredOrders.map((order, index) => {
                  // Get document ID (assuming it's the first field)
                  const documentId = order[Object.keys(order)[0]];
                  // Get type/status field if exists (for styling)
                  const statusField = Object.keys(order).find(
                    (key) =>
                      key.toLowerCase().includes("estado") ||
                      key.toLowerCase().includes("status") ||
                      key.toLowerCase().includes("type")
                  );
                  const status = statusField ? order[statusField] : null;

                  return (
                    <OrderCard
                      key={index}
                      $selected={selectedOrders.includes(documentId)}
                      $status={status}
                    >
                      <CardHeader>
                        <CardTitle>{documentId}</CardTitle>
                        {status && (
                          <StatusBadge status={status}>{status}</StatusBadge>
                        )}
                      </CardHeader>

                      <CardContent>
                        <CardInfo>
                          {Object.entries(order)
                            .filter(
                              ([key]) =>
                                key !== Object.keys(order)[0] &&
                                key !== statusField
                            )
                            .map(([key, value]) => (
                              <InfoItem key={key}>
                                <InfoLabel>{key}:</InfoLabel>
                                <InfoValue>
                                  {value !== null ? value : "N/A"}
                                </InfoValue>
                              </InfoItem>
                            ))}
                        </CardInfo>
                      </CardContent>

                      <CardActions>
                        <CardCheckbox>
                          <CheckboxInput
                            type="checkbox"
                            checked={selectedOrders.includes(documentId)}
                            onChange={() => handleSelectOrder(documentId)}
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
                                setSelectedOrders([documentId]);
                                processOrders();
                              }}
                              title="Procesar documento"
                            >
                              <FaPlay />
                            </CardActionButton>
                          </ActionRow>
                        </ActionButtonsContainer>
                      </CardActions>
                    </OrderCard>
                  );
                })}
              </CardsContainer>
            )}
          </>
        );

      default:
        return <div>Vista no encontrada</div>;
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
            <h2>Gestión de Documentos</h2>
            <p>
              {activeView === "mappingsList" &&
                "Seleccione una configuración de mapeo para comenzar"}
              {activeView === "mappingEditor" &&
                "Configure los parámetros de mapeo entre servidores"}
              {activeView === "documents" &&
                "Visualice y procese los documentos según la configuración seleccionada"}
            </p>
          </InfoSection>
        </ToolbarContainer>
      </section>

      <section className="main">{renderView()}</section>
    </Container>
  );
}

// Aquí todos los estilos que ya existían
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
    "main" 1fr;

  @media (max-width: 768px) {
    grid-template:
      "header" 70px
      "area1" auto
      "main" 1fr;
    padding: 10px;
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

  .main {
    grid-area: main;
    margin-top: 10px;
    overflow-x: auto;
    position: relative;
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

// Back button
const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 20px;

  &:hover {
    background-color: ${(props) => props.theme.secondaryHover};
  }
`;

// Config Info Button y Panel
const ConfigInfoButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 10px;
  &:hover {
    background-color: ${(props) => props.theme.secondaryHover};
  }
`;

const ConfigInfoPanel = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 15px;
  margin-bottom: 20px;
`;

const ConfigInfoSection = styled.div`
  margin-bottom: 15px;

  h4 {
    margin-top: 10px;
    margin-bottom: 8px;
    color: ${({ theme }) => theme.primary};
    border-bottom: 1px solid ${({ theme }) => theme.border};
    padding-bottom: 4px;
  }
`;

const InfoItem = styled.div`
  display: flex;
  margin-bottom: 5px;
`;

const InfoLabel = styled.div`
  width: 150px;
  font-weight: 500;
`;

const InfoValue = styled.div`
  flex: 1;
`;

const RuleItem = styled.div`
  padding: 5px 0;
  border-bottom: 1px dashed ${({ theme }) => theme.border};
`;

const TableInfoItem = styled.div`
  padding: 8px;
  margin-bottom: 8px;
  background-color: ${({ theme }) => theme.tableHeader};
  border-radius: 4px;
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
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  background-color: ${(props) => {
    if (typeof props.status === "string") {
      const status = props.status.toUpperCase();
      if (status === "P" || status.includes("PEND")) return "#17a2b8";
      if (status === "F" || status.includes("FACT")) return "#28a745";
      if (status === "A" || status.includes("ANUL")) return "#dc3545";
    }
    return "#6c757d"; // Default
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
      if (typeof props.$status === "string") {
        const status = props.$status.toUpperCase();
        if (status === "P" || status.includes("PEND")) return "#17a2b8";
        if (status === "F" || status.includes("FACT")) return "#28a745";
        if (status === "A" || status.includes("ANUL")) return "#dc3545";
      }
      return "#6c757d"; // Default
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
