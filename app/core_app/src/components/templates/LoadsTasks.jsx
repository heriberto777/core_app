import styled from "styled-components";
import { Header, TransferApi, useAuth, useFetchData } from "../../index";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { FaPlay, FaSync, FaList, FaTable, FaHistory } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const cnnApi = new TransferApi();

export function LoadsTasks() {
  const [openstate, setOpenState] = useState(false);
  const [search, setSearch] = useState("");
  const { accessToken, user } = useAuth();
  const [viewMode, setViewMode] = useState("cards"); // "cards", "list", "table"
  const [selectedTask, setSelectedTask] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [loadingVendedores, setLoadingVendedores] = useState(false);

  const navigate = useNavigate();

  const {
    data: tasks,
    setData: setTasks,
    loading,
    error,
    refetch: fetchTasks,
  } = useFetchData(() => cnnApi.getTasks(accessToken), [accessToken], false, 0);

  // Función para cargar los vendedores
  const fetchVendedores = async () => {
    try {
      setLoadingVendedores(true);
      const response = await cnnApi.getVendedores(accessToken);
      if (response && response.success) {
        setVendedores(response.data || []);
      }
    } catch (error) {
      console.error("Error al cargar vendedores:", error);
    } finally {
      setLoadingVendedores(false);
    }
  };

  // Cargar vendedores al iniciar el componente
  useEffect(() => {
    if (accessToken) {
      fetchVendedores();
    }
  }, [accessToken]);

  // Aquí forzamos que siempre cumplan executionMode = "batchesSSE"
  const filteredTasks = tasks.filter((task) => {
    // Coincidencia de nombre (búsqueda)
    const matchName = task.name.toLowerCase().includes(search.toLowerCase());

    // Filtro fijo de executionMode
    const matchExecutionMode = task.executionMode === "batchesSSE";

    return matchName && matchExecutionMode;
  });

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const startLoadProcess = async (taskId) => {
    let salesData = []; // Aquí guardaremos las ventas obtenidas
    let loadId = ""; // ID del load que obtengamos
    let route = ""; // Route/Repartidor
    let bodega = ""; // Bodega asignada al vendedor

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 0: Obtener el loadId antes de todo (con loading)
    // ──────────────────────────────────────────────────────────────────────────
    Swal.fire({
      title: "Obteniendo consecutivo...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      // Llamada a tu API o cnnApi para obtener el consecutivo
      const loadResp = await cnnApi.getLoadConsecutivo(accessToken);
      // Suponiendo que "cnnApi.getLoadConsecutivo" devuelve un Response.
      // Asegúrate de que devuelva { loadId: "LOADC000000001", ... }
      if (!loadResp.success) {
        throw new Error("Error al obtener loadId");
      }
      const data = await loadResp;
      loadId = data.loadId; // Ej: "LOADC000000001" o "load# 0000002"

      Swal.close();
    } catch (error) {
      console.error("Error al obtener loadId:", error);
      Swal.close();
      Swal.fire("Error", "No se pudo obtener el loadId", "error");
      return; // Salimos de la función
    }

    console.log("loadId obtenido:", loadId);

    // Cargar vendedores si no los hemos cargado ya
    if (vendedores.length === 0) {
      try {
        Swal.fire({
          title: "Obteniendo vendedores...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });
        await fetchVendedores();
        Swal.close();
      } catch (error) {
        console.error("Error al cargar vendedores:", error);
        Swal.close();
        Swal.fire("Error", "No se pudieron cargar los vendedores", "error");
        // Continuar de todos modos con la lista vacía
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 1: Obtener las ventas (fecha, vendedores) en la misma ventana
    //     -> Muestra el loadId en el título o en el contenido
    // ──────────────────────────────────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      Swal.fire({
        title: `Obteniendo ventas para - ${loadId}`,
        html: `
        <div style="text-align:left;">
          <label>Fecha:</label>
          <input id="swal-input-date" type="date" class="swal2-input" style="margin-bottom:10px;" />

          <label>Vendedores (separados por coma):</label>
          <input id="swal-input-vendors" class="swal2-input" placeholder="Ej: 001,002,003" style="margin-bottom:10px;" />

          <div class="form-group">
            <button id="btnBuscar" class="swal2-confirm swal2-styled" style="background-color: #3085d6; margin-right:10px;">
              Buscar
            </button>
            <button id="btnSiguiente" class="swal2-confirm swal2-styled" style="background-color: #28a745; margin-right:10px;" disabled>
              Siguiente
            </button>
            <button id="btnCancelar" class="swal2-cancel swal2-styled" style="background-color: #aaa;">
              Cancelar
            </button>
          </div>

          <div class="form-group">
            <div id="salesSummary" style="margin:10px 0; font-weight:500;"></div>
          </div>
        </div>
      `,
        showConfirmButton: false,
        showCancelButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,

        didOpen: () => {
          const inputDate = document.getElementById("swal-input-date");
          const inputVendors = document.getElementById("swal-input-vendors");
          const btnBuscar = document.getElementById("btnBuscar");
          const btnSiguiente = document.getElementById("btnSiguiente");
          const btnCancelar = document.getElementById("btnCancelar");
          const salesSummary = document.getElementById("salesSummary");

          // BOTÓN BUSCAR
          btnBuscar.addEventListener("click", async () => {
            const date = inputDate.value;
            const vendors = inputVendors.value;
            if (!date || !vendors) {
              Swal.showValidationMessage("Debes ingresar fecha y vendedores");
              return;
            }

            try {
              Swal.showLoading();
              // Llamada a tu API para obtener las ventas
              const response = await cnnApi.executeLoadTask(
                accessToken,
                date,
                vendors,
                taskId
              );

              if (!response.success) {
                throw new Error("Error al obtener las ventas");
              }

              salesData = response.result; // suponer que 'result' es un array con las ventas
              Swal.hideLoading();

              // Mostramos resumen
              salesSummary.innerHTML = `
              Se han encontrado <b>${salesData.length}</b> ventas
              para la fecha <b>${date}</b>.
            `;
              btnSiguiente.disabled = false;
            } catch (error) {
              console.error(error);
              Swal.showValidationMessage(
                "Ocurrió un error al buscar las ventas."
              );
            }
          });

          // BOTÓN SIGUIENTE
          btnSiguiente.addEventListener("click", () => {
            Swal.close();
            resolve(true);
          });

          // BOTÓN CANCELAR
          btnCancelar.addEventListener("click", () => {
            Swal.close();
            reject("Cancelado por el usuario");
          });
        },
      });
    });

    // Si llegamos aquí, es que el usuario hizo clic en "Siguiente" y tenemos salesData
    if (!salesData.length) {
      const noSales = await Swal.fire({
        icon: "info",
        title: "Sin ventas",
        text: "No se encontraron ventas. ¿Deseas continuar?",
        showCancelButton: true,
        confirmButtonText: "Sí, continuar",
        cancelButtonText: "No",
      });
      if (!noSales.isConfirmed) {
        return;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  (AÑADIDO) Agregar "Code_load" a cada venta antes de insertar en IMPLT_Orders
    // ──────────────────────────────────────────────────────────────────────────
    if (salesData.length > 0) {
      for (const item of salesData) {
        item.Code_load = loadId; // Asignar el loadId en el campo Code_load
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 2: Confirmar e insertar en IMPLT_Orders (usando loadId si deseas)
    // ──────────────────────────────────────────────────────────────────────────
    {
      const confirm = await Swal.fire({
        title: "¿Deseas generar la carga a IMPLT_Orders?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, generar",
        cancelButtonText: "No",
      });
      if (confirm.isConfirmed) {
        Swal.fire({
          title: "Insertando las ventas a IMPLT_Orders...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });
        try {
          // Enviar salesData y loadId (para que se guarde en Code_Load)
          const response = await cnnApi.executeInsertOrders(
            accessToken,
            salesData,
            loadId
          );
          if (!response.success) {
            throw new Error("Error al insertar en IMPLT_Orders");
          }
          console.log("Datos insertados en IMPLT_Orders -> ", response);
          Swal.close();
        } catch (error) {
          console.error(error);
          Swal.close();
          await Swal.fire({
            icon: "error",
            title: "Error",
            text: "Ocurrió un error al insertar en IMPLT_Orders",
          });
          return;
        }
      } else {
        await Swal.fire("Proceso cancelado", "No se generó la carga.", "info");
        return;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 3: Parámetros para cargar el load (route/repartidor)
    // ──────────────────────────────────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      // Generar las opciones para el select
      const vendedoresOptions = vendedores
        .map(
          (vend) =>
            `<option value="${vend.VENDEDOR}" data-bodega="${
              vend.U_BODEGA || "02"
            }">${vend.VENDEDOR} - ${vend.NOMBRE || "Sin nombre"}</option>`
        )
        .join("");

      Swal.fire({
        title: "Parámetros para cargar camiones",
        html: `
        <div style="text-align:left;">
          <label>Selecciona Repartidor / Code Route:</label>
          <select id="swal-select-route" class="swal2-select" style="width:100%; margin-bottom:10px;">
            <option value="">-- Selecciona un vendedor --</option>
            ${vendedoresOptions}
          </select>
          
          <div>
            <label>Código de Vendedor:</label>
            <input id="swal-input-route" class="swal2-input" readonly />
          </div>
          
          <div>
            <label>Bodega Asignada:</label>
            <input id="swal-input-bodega" class="swal2-input" readonly />
          </div>

          <div style="margin-top:10px;">
            <button id="btnSiguienteLoad" class="swal2-confirm swal2-styled" style="background-color: #28a745; margin-right:10px;" disabled>
              Siguiente
            </button>
            <button id="btnCancelarLoad" class="swal2-cancel swal2-styled" style="background-color: #aaa;">
              Cancelar
            </button>
          </div>
        </div>
      `,
        showConfirmButton: false,
        showCancelButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,

        didOpen: async () => {
          const selectRoute = document.getElementById("swal-select-route");
          const inputRoute = document.getElementById("swal-input-route");
          const inputBodega = document.getElementById("swal-input-bodega");
          const btnSiguienteLoad = document.getElementById("btnSiguienteLoad");
          const btnCancelarLoad = document.getElementById("btnCancelarLoad");

          // Manejar la selección del vendedor
          selectRoute.addEventListener("change", () => {
            const selectedOption =
              selectRoute.options[selectRoute.selectedIndex];
            if (selectedOption.value) {
              route = selectedOption.value;
              bodega = selectedOption.getAttribute("data-bodega") || "02";

              inputRoute.value = route;
              inputBodega.value = bodega;

              btnSiguienteLoad.disabled = false;
            } else {
              route = "";
              bodega = "";
              inputRoute.value = "";
              inputBodega.value = "";
              btnSiguienteLoad.disabled = true;
            }
          });

          btnSiguienteLoad.addEventListener("click", () => {
            if (!route) {
              Swal.showValidationMessage("Debes seleccionar un vendedor");
              return;
            }
            Swal.close();
            resolve({ route, bodega });
          });

          btnCancelarLoad.addEventListener("click", () => {
            Swal.close();
            reject("Cancelado por el usuario");
          });
        },
      });
    })
      .then(({ route, bodega }) => {
        // Guardar la información seleccionada para usarla después
        console.log(`Vendedor seleccionado: ${route}, Bodega: ${bodega}`);
      })
      .catch((error) => {
        console.log("Operación cancelada por el usuario:", error);
        throw new Error("Operación cancelada");
      });

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 4: Insertar en IMPLT_loads_detail
    // ──────────────────────────────────────────────────────────────────────────
    {
      Swal.fire({
        title: `Insertando datos en IMPLT_loads_detail para el load: ${loadId}`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        // Enviar salesData, route y loadId (para Code, etc.)
        const response = await cnnApi.executeInsertLoads(
          accessToken,
          route,
          loadId,
          salesData,
          bodega
        );
        if (!response.success) {
          throw new Error("Error al insertar en IMPLT_loads_detail");
        }
        await response;
        Swal.close();
      } catch (error) {
        console.error(error);
        Swal.close();
        await Swal.fire({
          icon: "error",
          title: "Error",
          text: `Ocurrió un error al insertar en IMPLT_loads_detail ${error}`,
        });
        return;
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 5: Confirmar traspaso de bodega en el ERP
    // ──────────────────────────────────────────────────────────────────────────
    const confirmTraspaso = await Swal.fire({
      title: "Hemos terminado el proceso de carga",
      text: "¿Deseas realizar el proceso de traspaso de bodegas en el ERP?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, traspasar",
      cancelButtonText: "No",
    });

    if (!confirmTraspaso.isConfirmed) {
      await Swal.fire({
        icon: "info",
        title: "Proceso de traspaso",
        text: "Debe realizarlo manualmente.",
      });
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 6: Hacer el traspaso en el ERP
    // ──────────────────────────────────────────────────────────────────────────
    Swal.fire({
      title: "Realizando traspaso al ERP...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      console.log(
        `Seleccionado vendedor y bodega : ${route}, Bodega: ${bodega}`
      );
      // Enviar salesData, route, bodega y loadId (para Code, etc.)
      const response = await cnnApi.executeInsertTrapaso(
        accessToken,
        route,
        loadId,
        salesData,
        bodega
      );
      if (!response.success) {
        throw new Error("Error al insertar el TRAPASO");
      }
      await response;
      Swal.close();
      // Mensaje final
      await Swal.fire({
        icon: "success",
        title: "Proceso completado",
        text: "El proceso ha terminado correctamente.",
      });
    } catch (error) {
      console.error(error);
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "Ocurrió un error al realizar el traspaso en el ERP",
      });
    }
  };

  return (
    <>
      <section className="main">
        <ToolbarContainer>
          <InfoSection>
            <h2>Gestor de Tareas de Carga</h2>
            <p>
              Administre y ejecute las tareas de carga de camiones y traspasos
              entre bodegas.
            </p>
          </InfoSection>
        </ToolbarContainer>
      </section>
      <section className="main">
        <ActionsContainer>
          <SearchInputContainer>
            <SearchInput
              type="text"
              placeholder="Buscar tarea..."
              value={search}
              onChange={handleSearch}
            />
          </SearchInputContainer>

          <ButtonsRow>
            <RefreshButton onClick={fetchTasks}>
              <FaSync /> Refrescar
            </RefreshButton>

            <ViewButtonsGroup>
              <ViewButton
                $active={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                title="Ver como tarjetas"
              >
                <FaList /> Cards
              </ViewButton>
              <ViewButton
                $active={viewMode === "table"}
                onClick={() => setViewMode("table")}
                title="Ver como tabla"
              >
                <FaTable /> Tabla
              </ViewButton>
            </ViewButtonsGroup>
          </ButtonsRow>
        </ActionsContainer>

        {loading && (
          <LoadingContainer>
            <LoadingMessage>Cargando tareas...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !error && filteredTasks.length === 0 && (
          <EmptyMessage>
            No hay tareas de carga disponibles. Las tareas deben tener modo de
            ejecución "batchesSSE".
          </EmptyMessage>
        )}

        {!loading && filteredTasks.length > 0 && viewMode === "cards" && (
          <CardsContainer>
            {filteredTasks.map((task) => (
              <Card
                key={task._id}
                $selected={selectedTask && selectedTask._id === task._id}
                $active={task.active}
              >
                <CardHeader>
                  <CardTitle>{task.name}</CardTitle>
                  <StatusBadge $status={task.status} $active={task.active}>
                    {task.status === "completed" && "✅ Completada"}
                    {task.status === "running" && "🔄 En Progreso"}
                    {task.status === "error" && "⚠️ Error"}
                    {!task.status && (task.active ? "Activa" : "Inactiva")}
                  </StatusBadge>
                </CardHeader>

                <CardContent>
                  <CardInfo>
                    <InfoItem>
                      <InfoLabel>Tipo:</InfoLabel>
                      <InfoValue>{task.type}</InfoValue>
                    </InfoItem>

                    <InfoItem>
                      <InfoLabel>Modo de ejecución:</InfoLabel>
                      <InfoValue>{task.executionMode}</InfoValue>
                    </InfoItem>

                    {task.transferType && (
                      <InfoItem>
                        <InfoLabel>Dirección:</InfoLabel>
                        <InfoValue>
                          {task.transferType === "up" && "Transfer Up ↑"}
                          {task.transferType === "down" && "Transfer Down ↓"}
                          {task.transferType === "general" && "General"}
                        </InfoValue>
                      </InfoItem>
                    )}
                  </CardInfo>

                  <CardQuerySection>
                    <QueryLabel>Consulta SQL:</QueryLabel>
                    <QueryBox readOnly value={task.query} />
                  </CardQuerySection>

                  {/* Barra de progreso para tareas en ejecución */}
                  {task.status === "running" && (
                    <ProgressBar>
                      <ProgressFill style={{ width: `${task.progress}%` }}>
                        {task.progress}%
                      </ProgressFill>
                    </ProgressBar>
                  )}
                </CardContent>

                <CardActions>
                  <ActionButton
                    $color="#17a2b8"
                    onClick={() => startLoadProcess(task.name)}
                    disabled={task.status === "running" || !task.active}
                    title="Iniciar proceso de carga"
                  >
                    <FaPlay /> Iniciar Proceso
                  </ActionButton>
                  <ActionButton
                    $color="#6f42c1"
                    onClick={() => navigate(`/summaries`)}
                    title="Ver histórico de traspasos"
                  >
                    <FaHistory /> Histórico
                  </ActionButton>
                </CardActions>
              </Card>
            ))}
          </CardsContainer>
        )}

        {!loading && filteredTasks.length > 0 && viewMode === "table" && (
          <TableContainer>
            <StyledTable>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task._id} className={!task.active ? "disabled" : ""}>
                    <td>{task.name}</td>
                    <td>
                      <StatusBadge
                        $status={task.status}
                        $active={task.active}
                        $small
                      >
                        {task.status === "completed" && "✅ Completada"}
                        {task.status === "running" && "🔄 En Progreso"}
                        {task.status === "error" && "⚠️ Error"}
                        {!task.status && (task.active ? "Activa" : "Inactiva")}
                      </StatusBadge>
                    </td>
                    <td>{task.type}</td>
                    <td>
                      <ActionButtons>
                        <TableActionButton
                          title="Iniciar proceso de carga"
                          $color="#17a2b8"
                          onClick={() => startLoadProcess(task.name)}
                          disabled={task.status === "running" || !task.active}
                        >
                          <FaPlay />
                        </TableActionButton>
                        <TableActionButton
                          $color="#6f42c1"
                          onClick={() => navigate(`/summaries`)}
                          title="Ver histórico de traspasos"
                        >
                          <FaHistory />
                        </TableActionButton>
                      </ActionButtons>
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </TableContainer>
        )}
      </section>
    </>
  );
}
// Estilos del Contenedor Principal
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

// Sección de Información
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

// Barra de Acciones
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

const ViewButtonsGroup = styled.div`
  display: flex;
  margin-left: 10px;
`;

// Se ha reemplazado por ViewButtonsGroup

const RefreshButton = styled.button`
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

  @media (max-width: 480px) {
    width: 100%;
  }
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

// Contenedores de Carga, Error y Mensaje Vacío
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

// Vista de Tarjetas
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

const Card = styled.div`
  width: 320px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-left: 4px solid
    ${(props) =>
      props.$selected ? "#007bff" : props.$active ? "#28a745" : "#6c757d"};
  opacity: ${(props) => (props.$active ? 1 : 0.7)};
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
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.title || theme.text};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 10px;
`;

const StatusBadge = styled.div`
  padding: ${(props) => (props.$small ? "3px 8px" : "5px 10px")};
  border-radius: 50px;
  font-size: ${(props) => (props.$small ? "12px" : "14px")};
  font-weight: 500;
  color: white;
  background-color: ${(props) => {
    if (!props.$active) return "#6c757d";
    switch (props.$status) {
      case "completed":
        return "#28a745";
      case "running":
        return "#ffc107";
      case "error":
        return "#dc3545";
      default:
        return "#17a2b8";
    }
  }};
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  min-width: 80px;
  justify-content: center;
  animation: ${(props) =>
    props.$status === "running" ? "blink 1s infinite alternate" : "none"};

  @keyframes blink {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.6;
    }
  }
`;

const CardContent = styled.div`
  padding: 15px;
  margin: 10px;
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
  width: 120px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const InfoValue = styled.span`
  flex: 1;
`;

const CardQuerySection = styled.div`
  margin-top: 15px;
`;

const QueryLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 5px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const QueryBox = styled.textarea`
  width: 100%;
  height: 80px;
  padding: 8px;
  border: 1px solid ${({ theme }) => theme.border || "#ddd"};
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  resize: none;
  background-color: ${({ theme }) => theme.codeBg || "#f5f5f5"};
  color: ${({ theme }) => theme.text};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 20px;
  background-color: #eee;
  border-radius: 10px;
  margin-top: 15px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background-color: #17a2b8;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: white;
  line-height: 20px;
  transition: width 0.5s ease-in-out;
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  padding: 15px;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  background-color: ${({ theme }) => theme.cardFooterBg || "#f8f9fa"};
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  background-color: ${(props) => props.$color || "#6c757d"};
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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

// Vista de Tabla
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
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }

    &.disabled {
      opacity: 0.6;
      background-color: ${({ theme }) => theme.tableDisabled || "#f2f2f2"};
    }
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
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
