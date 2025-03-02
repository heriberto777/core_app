import styled from "styled-components";
import { Header, TransferApi, useAuth, useFetchData } from "../../index";
import { useState } from "react";

import Swal from "sweetalert2";

const cnnApi = new TransferApi();

export function LoadsTasks() {
  const [openstate, setOpenState] = useState(false);
  const [search, setSearch] = useState("");
  const { accessToken, user } = useAuth();
  const [viewMode, setViewMode] = useState("cards"); // "cards", "list", "table"
  const [selectedTask, setSelectedTask] = useState(null);

  const {
    data: tasks,
    setData: setTasks,
    loading,
    error,
  } = useFetchData(() => cnnApi.getTasks(accessToken), [accessToken], false, 0);

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

    // ──────────────────────────────────────────────────────────────────────────
    //  PASO 1: Obtener las ventas (fecha, vendedores) en la misma ventana
    //     -> Muestra el loadId en el título o en el contenido
    // ──────────────────────────────────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      Swal.fire({
        title: `Obteniendo la ventas para - ${loadId}`,
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
              // Ej: /api/transfer/runTask/LoadSales con overrideParams {Fecha, Vendedor}, etc.

              if (!response.success) {
                throw new Error("Error al obtener las ventas");
              }

              salesData = response.result; // suponer que 'result' es un array con las ventas
              Swal.hideLoading();

              console.log("Ventas obtenidas:", salesData);

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

    // Si llegamos aquí, es que el usuario hizo clic en “Siguiente” y tenemos salesData
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
      Swal.fire({
        title: "Parámetros para cargar camiones",
        html: `
        <div style="text-align:left;">
          <label>Repartidor / Code Route:</label>
          <input id="swal-input-route" class="swal2-input" placeholder="Ej: RUTA01" />

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
          const inputRoute = document.getElementById("swal-input-route");
          const btnSiguienteLoad = document.getElementById("btnSiguienteLoad");
          const btnCancelarLoad = document.getElementById("btnCancelarLoad");

          // (Ya tenemos loadId, no hace falta volver a pedirlo)

          // Habilitar “Siguiente” cuando se ingrese la ruta
          inputRoute.addEventListener("input", () => {
            btnSiguienteLoad.disabled = !inputRoute.value.trim();
          });

          btnSiguienteLoad.addEventListener("click", () => {
            if (!inputRoute.value.trim()) {
              Swal.showValidationMessage("Debes ingresar la ruta");
              return;
            }
            route = inputRoute.value.trim();
            Swal.close();
            resolve(true);
          });

          btnCancelarLoad.addEventListener("click", () => {
            Swal.close();
            reject("Cancelado por el usuario");
          });
        },
      });
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
          salesData
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
      // Enviar salesData, route y loadId (para Code, etc.)
      const response = await cnnApi.executeInsertTrapaso(
        accessToken,
        route,
        loadId,
        salesData
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
          {/* <SearchSection>
            <Button color="#28a745" onClick={() => startLoadProcess()}>
              {" "}
              ➕ Iniciar
            </Button>
            <SearchInput
              type="text"
              placeholder="Buscar tarea..."
              value={search}
              onChange={handleSearch}
            />
          </SearchSection> */}

          <OptionsContainer>
            <ViewSection>
              <ViewButton color="#28a745" onClick={() => setViewMode("cards")}>
                🃏 Cards
              </ViewButton>
              <ViewButton color="#ffc107" onClick={() => setViewMode("table")}>
                📊 Table
              </ViewButton>
            </ViewSection>
          </OptionsContainer>
        </ToolbarContainer>
      </section>
      <section className="area2"></section>
      <section className="main">
        <ContainerTask>
          {loading ? (
            <p>Cargando tareas...</p>
          ) : viewMode === "cards" ? (
            <CardsContainer>
              {tasks
                .filter((task) => task.executionMode === "batchesSSE")
                .map((task) => (
                  <Card
                    key={task._id}
                    selected={selectedTask && selectedTask._id === task._id}
                  >
                    <CardContent>
                      <h3>{task.name}</h3>

                      {/* Estado con iconos */}
                      <StatusContainer>
                        {task.status === "completed" && (
                          <SuccessIcon>✅ Completada</SuccessIcon>
                        )}
                        {task.status === "running" && (
                          <LoadingIcon>🔄 En Progreso</LoadingIcon>
                        )}
                        {task.status === "error" && (
                          <ErrorIcon>⚠️ Error</ErrorIcon>
                        )}
                      </StatusContainer>

                      <p>
                        <strong>Estado:</strong>{" "}
                        {task.active ? "Activo" : "Inactivo"}
                      </p>
                      <p>
                        <strong>Tipo:</strong> {task.type}
                      </p>

                      <Textarea readOnly value={task.query} />

                      {/* Barra de progreso si está corriendo */}
                      {task.status === "running" && (
                        <ProgressBar>
                          <ProgressFill style={{ width: `${task.progress}%` }}>
                            {task.progress}%
                          </ProgressFill>
                        </ProgressBar>
                      )}

                      <ButtonGroup>
                        {/* Botón "Editar" */}
                        {/* <Button
                          color="#007bff"
                          onClick={() => addOrEditTask(task)}
                          disabled={task.status === "running"}
                        >
                          ✏ Editar
                        </Button> */}
                        {/* Botón "Iniciar" */}
                        <ButtonAcction
                          color="#17a2b8"
                          onClick={() => startLoadProcess(task.name)}
                          disabled={task.status === "running"}
                        >
                          🚀 Iniciar
                        </ButtonAcction>
                      </ButtonGroup>
                    </CardContent>
                  </Card>
                ))}
            </CardsContainer>
          ) : (
            <Table>
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
                  <tr key={task._id}>
                    <td>{task.name}</td>
                    <td>{task.active ? "Activo" : "Inactivo"}</td>
                    <td>{task.type}</td>
                    <td>
                      <ButtonGroup>
                        <ButtonAcction
                          color="#17a2b8"
                          onClick={() => startLoadProcess(task.name)}
                          disabled={task.status === "running"}
                        >
                          🚀 Iniciar
                        </ButtonAcction>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </ContainerTask>
      </section>
    </Container>
  );
}
const Container = styled.div`
  min-height: 100vh;
  padding: 15px;
  width: 100%;
  background-color: ${(props) => props.theme.bg};
  color: ${({ theme }) => theme.text};
  display: grid;

  grid-template:
    "header" 90px
    "area1" 50px
    "area2" 80px
    "main" auto;

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
    justify-content: center;
    margin-top: 20px;
    margin-bottom: 15px;

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

const ContainerTask = styled.div`
  width: 90%;
  max-width: 1200px;
  margin: 0px;
  padding: 10px;
  display: flex;
  flex-direction: center;
  align-items: center;
`;

const Button = styled.button`
  padding: 10px 15px;
  font-size: 14px;
  border: none;
  color: white;
  border-radius: 5px;
  cursor: pointer;
  background-color: ${(props) => props.color || "#28a745"};

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  /* 📌 En pantallas pequeñas, los botones ocupan el 100% del ancho */
  @media (max-width: 768px) {
    width: 100%;
  }
`;

const ButtonAcction = styled.button`
  width: 100%;
  padding: 10px 15px;
  font-size: 14px;
  border: none;
  color: white;
  border-radius: 5px;
  cursor: pointer;
  background-color: ${(props) => props.color || "#28a745"};

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  /* 📌 En pantallas pequeñas, los botones ocupan el 100% del ancho */
  @media (max-width: 768px) {
    width: 100%;
  }
`;

const CardsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  width: 100%;
`;

const Card = styled.div`
  width: 300px;
  background: ${(props) => (props.selected ? "#f0f8ff" : "#fff")};
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  &:hover {
    background-color: #f9f9f9;
  }
`;

const CardContent = styled.div`
  text-align: center;
`;

const Textarea = styled.textarea`
  width: 100%;
  height: 80px;
  margin-top: 10px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 5px;
  resize: none;
`;
const ButtonGroup = styled.div`
  display: flex;
  gap: 5px;
  margin-top: 10px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;

  th,
  td {
    border: 1px solid #ddd;
    padding: 10px;
    text-align: left;
  }

  th {
    background-color: #f4f4f4;
  }
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  width: ${({ sidebarOpen }) => (sidebarOpen ? "calc(100% - 250px)" : "100%")};
  margin-left: ${({ sidebarOpen }) => (sidebarOpen ? "250px" : "0")};
  transition: margin-left 0.3s ease-in-out, width 0.3s ease-in-out;
  margin-bottom: 5px;
  gap: 10px;
  width: 100%;

  /* 📌 En pantallas pequeñas, los elementos se apilan en columna */
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    width: 90%;
    margin-left: 0;
  }
`;

const SearchSection = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  gap: 10px;

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: center;
  }
`;

const SearchInput = styled.input`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 85%;

  @media (max-width: 600px) {
    width: 90%;
  }
`;
const OptionsContainer = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 600px;
  flex-wrap: wrap;
  gap: 10px;

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: center;
  }
`;
const ViewSection = styled.div`
  display: flex;
  gap: 10px;

  @media (max-width: 600px) {
    width: 90%;
    justify-content: center;
  }
`;

const ViewButton = styled.button`
  padding: 8px 12px;
  color: white;
  border: none;
  border-radius: 4px;
  background-color: ${(props) => props.color || "#28a745"};
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }

  @media (max-width: 600px) {
    width: 45%;
  }
`;
// CSS STATUS
const StatusContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
`;

const SuccessIcon = styled.span`
  color: #28a745;
  font-weight: bold;
`;

const LoadingIcon = styled.span`
  color: #ffc107;
  font-weight: bold;
  animation: blink 1s infinite alternate;

  @keyframes blink {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }
`;

const ErrorIcon = styled.span`
  color: #dc3545;
  font-weight: bold;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 20px;
  background-color: #eee;
  border-radius: 10px;
  margin-top: 10px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background-color: #17a2b8;
  text-align: center;
  font-size: 14px;
  color: white;
  line-height: 20px;
  transition: width 0.5s ease-in-out;
`;
