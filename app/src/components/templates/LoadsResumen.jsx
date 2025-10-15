import styled from "styled-components";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import {
  FaEye,
  FaUndo,
  FaSearch,
  FaSync,
  FaFilter,
  FaCalendarAlt,
  FaFilePdf,
  FaTruck,
  FaArrowLeft,
} from "react-icons/fa";
import { Header, useAuth, useFetchData, TransferSummaryApi } from "../../index";

const summaryApi = new TransferSummaryApi();

export function LoadsResumen() {
  const [openstate, setOpenState] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    loadId: "",
    route: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const { loadId } = useParams(); // Optional loadId from URL params

  const FETCH_INTERVAL = 5000;

  // // If loadId is provided from URL params, use it in the initial filters
  // useEffect(() => {
  //   if (loadId) {
  //     setFilters((prev) => ({ ...prev, loadId }));
  //   }
  // }, [loadId]);

  // Memoizar los parámetros de la consulta para evitar re-creaciones
  const queryParams = useMemo(
    () => ({
      ...filters,
      page: currentPage,
    }),
    [filters, currentPage]
  );

  const fetchSummaries = useCallback(async () => {
    try {
      console.log("Ejecutando fetchSummaries con params:", queryParams);

      const result = await summaryApi.getSummaries(accessToken, queryParams);

      if (result.success) {
        // Actualizar totalPages solo si es necesario
        if (result.pagination.pages !== totalPages) {
          setTotalPages(result.pagination.pages);
        }
        return result.data;
      } else {
        throw new Error(result.message || "Error al obtener resúmenes");
      }
    } catch (error) {
      console.error("Error al obtener resúmenes:", error);
      throw error;
    }
  }, [accessToken, queryParams]);

  const {
    data: summaries,
    loading,
    refreshing: tasksRefreshing,
    loadingState: tasksLoadingState,
    error,
    refetch: refreshSummaries,
  } = useFetchData(
    fetchSummaries,
    [accessToken, queryParams], // Dependencias memoizadas
    {
      autoRefresh: true,
      refreshInterval: FETCH_INTERVAL,
      enableCache: true,
      cacheTime: 60000,
      initialData: [],
    }
  );

  useEffect(() => {
    if (loadId && loadId !== filters.loadId) {
      setFilters((prev) => ({ ...prev, loadId }));
    }
  }, [loadId]);

  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    // El refresh se disparará automáticamente por el cambio en currentPage
    setTimeout(() => refreshSummaries(), 100);
  }, [refreshSummaries]);

  console.log("Summaries:", summaries);

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 10,
      loadId: "",
      route: "",
      dateFrom: "",
      dateTo: "",
      status: "",
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const goBack = () => {
    navigate("/loads");
  };

  const viewSummaryDetails = async (summaryId) => {
    try {
      // Show loading
      Swal.fire({
        title: "Cargando detalles...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await summaryApi.getSummaryById(accessToken, summaryId);

      if (!result.success) {
        throw new Error(result.message || "Error al obtener detalles");
      }

      const summary = result.data;

      // Format products for display
      const productsHtml = summary.products
        .map(
          (product) => `
        <tr>
          <td>${product.code}</td>
          <td>${product.description || "Sin descripción"}</td>
          <td class="text-right">${product.quantity}</td>
          <td class="text-right">${product.returnedQuantity || 0}</td>
          <td class="text-right">${
            product.quantity - (product.returnedQuantity || 0)
          }</td>
        </tr>
      `
        )
        .join("");

      // Create return info section if applicable
      let returnInfoHtml = "";
      if (summary.returnData && summary.returnData.documentId) {
        returnInfoHtml = `
          <div class="swal2-return-info">
            <h4>Información de Devolución</h4>
            <p><strong>Documento:</strong> ${summary.returnData.documentId}</p>
            <p><strong>Fecha:</strong> ${new Date(
              summary.returnData.date
            ).toLocaleString()}</p>
            <p><strong>Motivo:</strong> ${
              summary.returnData.reason || "No especificado"
            }</p>
          </div>
        `;
      }

      // Display the summary details
      Swal.fire({
        title: `Detalles de Carga #${summary.loadId}`,
        html: `
          <div class="swal2-summary-details">
            <div class="swal2-summary-header">
              <p><strong>Ruta/Vendedor:</strong> ${summary.route}</p>
              <p><strong>Documento de Traspaso:</strong> ${
                summary.documentId || "N/A"
              }</p>
              <p><strong>Fecha:</strong> ${new Date(
                summary.date
              ).toLocaleString()}</p>
              <p><strong>Estado:</strong> 
                ${
                  summary.status === "completed"
                    ? "Completado"
                    : summary.status === "partial_return"
                    ? "Devolución Parcial"
                    : summary.status === "full_return"
                    ? "Devolución Total"
                    : summary.status
                }
              </p>
            </div>
            
            ${returnInfoHtml}
            
            <h4>Productos</h4>
            <div class="swal2-table-container">
              <table class="swal2-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th class="text-right">Cantidad</th>
                    <th class="text-right">Devuelto</th>
                    <th class="text-right">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  ${productsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <th colspan="2">Total</th>
                    <th class="text-right">${summary.totalQuantity}</th>
                    <th class="text-right">${summary.products.reduce(
                      (sum, p) => sum + (p.returnedQuantity || 0),
                      0
                    )}</th>
                    <th class="text-right">${summary.products.reduce(
                      (sum, p) =>
                        sum + (p.quantity - (p.returnedQuantity || 0)),
                      0
                    )}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        `,
        width: "800px",
        showConfirmButton: true,
        confirmButtonText: "Cerrar",
      });
    } catch (error) {
      console.error("Error viewing summary details:", error);
      Swal.fire("Error", error.message, "error");
    }
  };

  const processReturn = async (summaryId) => {
    try {
      // Show loading
      Swal.fire({
        title: "Verificando inventario disponible...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Check inventory first
      const inventoryResult = await summaryApi.checkInventoryForReturns(
        accessToken,
        summaryId
      );

      if (!inventoryResult.success) {
        throw new Error(
          inventoryResult.message || "Error al verificar inventario"
        );
      }

      const {
        summaryId: id,
        loadId,
        productsWithInventory,
      } = inventoryResult.data;

      // Create HTML for products selection
      const productsHtml = productsWithInventory
        .map((product, index) => {
          const maxReturnable = product.maxReturnableQuantity;
          const isDisabled = maxReturnable <= 0;

          return `
          <tr>
            <td>
              <input 
                type="checkbox" 
                id="return-product-${index}" 
                class="return-checkbox" 
                data-index="${index}" 
                ${isDisabled ? "disabled" : ""}
              />
            </td>
            <td>${product.code}</td>
            <td>${product.description || "Sin descripción"}</td>
            <td class="text-right">${product.quantity}</td>
            <td class="text-right">${product.returnedQuantity || 0}</td>
            <td class="text-right">${product.availableInInventory || 0}</td>
            <td class="text-right">${maxReturnable}</td>
            <td>
              <input 
                type="number" 
                id="return-quantity-${index}" 
                class="return-quantity swal2-input" 
                min="1" 
                max="${maxReturnable}" 
                value="${maxReturnable > 0 ? 1 : 0}"
                ${isDisabled ? "disabled" : ""}
                style="width: 80px; padding: 5px;"
              />
            </td>
          </tr>
        `;
        })
        .join("");

      const canReturn = productsWithInventory.some(
        (p) => p.maxReturnableQuantity > 0
      );

      if (!canReturn) {
        Swal.fire({
          title: "No se puede realizar devolución",
          text: "No hay productos disponibles para devolver en el inventario.",
          icon: "warning",
        });
        return;
      }

      // Display the return dialog
      const { value: returnData, dismiss } = await Swal.fire({
        title: `Devolución para Carga #${loadId}`,
        html: `
          <div class="swal2-return-form">
            <p>Seleccione los productos a devolver y especifique la cantidad:</p>
            
            <div class="swal2-table-container">
              <table class="swal2-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th class="text-right">Cantidad Original</th>
                    <th class="text-right">Ya Devuelto</th>
                    <th class="text-right">Disponible en Inventario</th>
                    <th class="text-right">Máximo a Devolver</th>
                    <th class="text-right">Cantidad a Devolver</th>
                  </tr>
                </thead>
                <tbody>
                  ${productsHtml}
                </tbody>
              </table>
            </div>
            
            <div class="form-group" style="margin-top: 20px;">
              <label for="return-reason">Motivo de la devolución:</label>
              <textarea id="return-reason" class="swal2-textarea" placeholder="Especifique el motivo de la devolución" style="width: 100%;"></textarea>
            </div>
          </div>
        `,
        width: "900px",
        showCancelButton: true,
        confirmButtonText: "Procesar Devolución",
        cancelButtonText: "Cancelar",
        showLoaderOnConfirm: true,
        didOpen: () => {
          // Add event listeners for checkboxes and quantity inputs
          const checkboxes = document.querySelectorAll(".return-checkbox");
          checkboxes.forEach((checkbox) => {
            checkbox.addEventListener("change", function () {
              const index = this.getAttribute("data-index");
              const quantityInput = document.getElementById(
                `return-quantity-${index}`
              );

              if (this.checked) {
                quantityInput.disabled = false;
              } else {
                quantityInput.disabled = true;
              }
            });
          });
        },
        preConfirm: () => {
          // Gather selected products and quantities
          const productsToReturn = [];
          const checkboxes = document.querySelectorAll(".return-checkbox");

          checkboxes.forEach((checkbox) => {
            if (checkbox.checked) {
              const index = checkbox.getAttribute("data-index");
              const quantityInput = document.getElementById(
                `return-quantity-${index}`
              );
              const quantity = parseInt(quantityInput.value, 10);

              if (quantity <= 0) {
                Swal.showValidationMessage(`La cantidad debe ser mayor a 0`);
                return false;
              }

              const maxQuantity = parseInt(
                quantityInput.getAttribute("max"),
                10
              );
              if (quantity > maxQuantity) {
                Swal.showValidationMessage(
                  `La cantidad no puede exceder ${maxQuantity}`
                );
                return false;
              }

              productsToReturn.push({
                code: productsWithInventory[index].code,
                quantity: quantity,
              });
            }
          });

          if (productsToReturn.length === 0) {
            Swal.showValidationMessage(
              "Seleccione al menos un producto para devolver"
            );
            return false;
          }

          const reason = document.getElementById("return-reason").value;
          if (!reason.trim()) {
            Swal.showValidationMessage("El motivo de devolución es requerido");
            return false;
          }

          return {
            summaryId: id,
            productsToReturn,
            reason,
          };
        },
      });

      if (dismiss) {
        return; // User cancelled
      }

      // Process the return
      Swal.fire({
        title: "Procesando devolución...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const processResult = await summaryApi.processTransferReturn(
        accessToken,
        returnData
      );

      if (!processResult.success) {
        throw new Error(
          processResult.message || "Error al procesar la devolución"
        );
      }

      // Success notification
      Swal.fire({
        title: "¡Devolución exitosa!",
        text: `Se ha procesado la devolución. Documento: ${processResult.returnDocument}`,
        icon: "success",
      });

      // Refresh the list
      refreshSummaries();
    } catch (error) {
      console.error("Error processing return:", error);
      Swal.fire("Error", error.message, "error");
    }
  };

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <BackButton onClick={goBack}>
            <FaArrowLeft /> Volver a cargas
          </BackButton>
          <h2>Resumen de Traspasos de Productos</h2>
          <p>
            Visualice y gestione los traspasos realizados, incluyendo opciones
            de devolución.
          </p>
        </InfoSection>
      </ToolbarContainer>

      <section className="main-content">
        <FiltersContainer>
          <FilterField>
            <FilterLabel>
              <FaTruck /> Carga #
            </FilterLabel>
            <FilterInput
              type="text"
              placeholder="ID de carga"
              value={filters.loadId}
              onChange={(e) =>
                setFilters({ ...filters, loadId: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaTruck /> Ruta/Vendedor
            </FilterLabel>
            <FilterInput
              type="text"
              placeholder="Código de ruta"
              value={filters.route}
              onChange={(e) =>
                setFilters({ ...filters, route: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaCalendarAlt /> Desde
            </FilterLabel>
            <FilterInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaCalendarAlt /> Hasta
            </FilterLabel>
            <FilterInput
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
            />
          </FilterField>

          <FilterField>
            <FilterLabel>
              <FaFilter /> Estado
            </FilterLabel>
            <FilterSelect
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Todos</option>
              <option value="completed">Completado</option>
              <option value="partial_return">Devolución Parcial</option>
              <option value="full_return">Devolución Total</option>
            </FilterSelect>
          </FilterField>

          <ButtonsContainer>
            <SearchButton onClick={handleSearch}>
              <FaSearch /> Buscar
            </SearchButton>

            <ClearButton onClick={clearFilters}>Limpiar Filtros</ClearButton>

            <RefreshButton
              onClick={refreshSummaries}
              refreshing={tasksRefreshing}
              label="Recargar"
              className={tasksRefreshing ? "refreshing" : ""}
            >
              <FaSync className={tasksRefreshing ? "spinning" : ""} />
              {tasksRefreshing ? "Actualizando..." : "Refrescar"}
            </RefreshButton>
          </ButtonsContainer>
        </FiltersContainer>

        {loading && (
          <LoadingContainer>
            <LoadingMessage>Cargando resúmenes...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !error && summaries.length === 0 && (
          <EmptyMessage>
            No se encontraron traspasos que coincidan con los criterios de
            búsqueda.
          </EmptyMessage>
        )}

        {!loading && !tasksRefreshing && summaries.length > 0 && (
          <>
            <TableContainer>
              <StyledTable>
                <thead>
                  <tr>
                    <th>ID Carga</th>
                    <th>Documento</th>
                    <th>Ruta</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Productos</th>
                    <th>Cantidad Total</th>
                    <th>Devuelto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr
                      key={summary._id}
                      className={
                        summary.status === "full_return"
                          ? "returned"
                          : summary.status === "partial_return"
                          ? "partial-returned"
                          : ""
                      }
                    >
                      <td>{summary.loadId}</td>
                      <td>{summary.documentId || "N/A"}</td>
                      <td>{summary.route}</td>
                      <td>{new Date(summary.date).toLocaleDateString()}</td>
                      <td>
                        <StatusBadge status={summary.status}>
                          {summary.status === "completed"
                            ? "Completado"
                            : summary.status === "partial_return"
                            ? "Devolución Parcial"
                            : summary.status === "full_return"
                            ? "Devolución Total"
                            : summary.status}
                        </StatusBadge>
                      </td>
                      <td>{summary.totalProducts}</td>
                      <td>{summary.totalQuantity}</td>
                      <td>
                        {summary.products.reduce(
                          (sum, p) => sum + (p.returnedQuantity || 0),
                          0
                        )}
                      </td>
                      <td>
                        <ActionButtons>
                          <ActionButton
                            title="Ver detalles"
                            onClick={() => viewSummaryDetails(summary._id)}
                          >
                            <FaEye />
                          </ActionButton>

                          {summary.status !== "full_return" && (
                            <ActionButton
                              title="Procesar devolución"
                              color="#ffa500"
                              onClick={() => processReturn(summary._id)}
                            >
                              <FaUndo />
                            </ActionButton>
                          )}
                        </ActionButtons>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StyledTable>
            </TableContainer>

            <PaginationContainer>
              <PaginationButton
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                Primera
              </PaginationButton>
              <PaginationButton
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Anterior
              </PaginationButton>

              <PageInfo>
                Página {currentPage} de {totalPages}
              </PageInfo>

              <PaginationButton
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </PaginationButton>
              <PaginationButton
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                Última
              </PaginationButton>
            </PaginationContainer>
          </>
        )}
      </section>
    </>
  );
}

// Estilos
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

    @media (max-width: 768px) {
      padding: 10px;
    }

    @media (max-width: 480px) {
      padding: 5px;
    }
  }
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 0;
`;

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: center;
  position: relative;

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

const BackButton = styled.button`
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 15px;
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a6268;
  }
`;

const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    padding: 10px;
  }
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 150px;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  display: flex;
  align-items: center;
  gap: 5px;
`;

const FilterInput = styled.input`
  padding: 8px 12px;
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

const FilterSelect = styled.select`
  padding: 8px 12px;
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

const ButtonsContainer = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin-top: 5px;

  @media (max-width: 768px) {
    width: 100%;
    flex-wrap: wrap;
  }

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const SearchButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #0069d9;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const ClearButton = styled.button`
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a6268;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const RefreshButton = styled.button`
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #138496;
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const TableContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto; // Ya tienes esto, correcto
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  /* Añadir esto */
  -webkit-overflow-scrolling: touch; /* Para mejor scroll en iOS */

  @media (max-width: 576px) {
    /* Mejora la visualización en móviles pequeños */
    margin-left: -10px;
    margin-right: -10px;
    width: calc(100% + 20px);
    border-radius: 0;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
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
    white-space: nowrap;
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }

    &.returned {
      background-color: rgba(220, 53, 69, 0.1);
    }

    &.partial-returned {
      background-color: rgba(255, 193, 7, 0.1);
    }
  }
`;

const StatusBadge = styled.div`
  display: inline-block;
  padding: 5px 10px;
  border-radius: 50px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background-color: ${(props) => {
    switch (props.status) {
      case "completed":
        return "#28a745";
      case "partial_return":
        return "#ffc107";
      case "full_return":
        return "#dc3545";
      default:
        return "#6c757d";
    }
  }};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.color || "#0275d8"};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    color: #adb5bd;
    cursor: not-allowed;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
`;

const LoadingMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary || "#666"};
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

const PaginationContainer = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  margin-top: 20px;

  @media (max-width: 480px) {
    flex-wrap: wrap;
  }
`;

const PaginationButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 15px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #0069d9;
  }

  &:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    opacity: 0.65;
  }
`;

const PageInfo = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  padding: 0 10px;
`;
