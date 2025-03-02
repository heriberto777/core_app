import styled from "styled-components";
import { Header, TransferApi, useAuth, useFetchData } from "../../index";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

const cnnApi = new TransferApi();

export function TransferTasks() {
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const { accessToken, user } = useAuth();
  const [openstate, setOpenState] = useState(false);
  const [viewMode, setViewMode] = useState("cards"); // "cards", "list", "table"
  const [executionTime, setExecutionTime] = useState("20:30");

  const {
    data: tasks,
    setData: setTasks,
    loading,
    error,
  } = useFetchData(
    () => cnnApi.getTasks(accessToken),
    [accessToken],
    true,
    5000
  );

  const { data: schudleTime, setData: setSchudleTime } = useFetchData(
    () => cnnApi.getSchuledTime(accessToken),
    [accessToken]
  );

  // ⏰ Sincronizar `executionTime` con `schudleTime`
  useEffect(() => {
    if (schudleTime?.hour) {
      setExecutionTime(schudleTime.hour);
    }
  }, [schudleTime?.hour]);

  // Filtro dinámico
  const filteredTasks = tasks.filter((task) =>
    task.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const handleTimeChange = async () => {
    // onTimeChange(executionTime);

    try {
      const result = await cnnApi.addTimeTransfer(accessToken, {
        hour: executionTime,
      });
      if (result) {
        // fetchTasks();
        Swal.fire(
          "Éxito",
          `Tarea se ejecutara todo los dias ${executionTime} .`,
          "success"
        );
      } else {
        throw new Error("No se pudo guardar la tarea.");
      }
    } catch (error) {
      console.log(error);
      Swal.fire("Error", error, "error");
    }
  };

  const addOrEditTask = async (task = null) => {
    const isEdit = Boolean(task);
    console.log("Hola mundo -> ", task);

    const { value: formValues } = await Swal.fire({
      title: isEdit ? "Editar Tarea" : "Nueva Tarea",
      html: `
      <div class="swal2-form-container">
        <!-- Nombre de la tarea -->
        <input id="swal-name" class="swal2-input" placeholder="Nombre" value="${
          task?.name || ""
        }" />

        <!-- Tipo de tarea: manual, auto, both -->
        <select id="swal-type" class="swal2-input">
          <option value="manual" ${
            task?.type === "manual" ? "selected" : ""
          }>Manual</option>
          <option value="auto" ${
            task?.type === "auto" ? "selected" : ""
          }>Automática</option>
          <option value="both" ${
            task?.type === "both" ? "selected" : ""
          }>Ambas</option>
        </select>

       <label class="swal2-label">Tipo de Transferencia:</label>
        <select id="swal-transferType" class="swal2-input">
          <option value="general" ${
            !task?.transferType || task?.transferType === "general"
              ? "selected"
              : ""
          }>General</option>
          <option value="up" ${
            task?.transferType === "up" ? "selected" : ""
          }>Transfer Up (Server1 → Server2)</option>
          <option value="down" ${
            task?.transferType === "down" ? "selected" : ""
          }>Transfer Down (Server2 → Server1)</option>
        </select>

        <!-- Execution Mode: normal / batchesSSE -->
        <select id="swal-executionMode" class="swal2-input">
          <option value="normal" ${
            task?.executionMode === "normal" ? "selected" : ""
          }>Normal Transfer</option>
          <option value="batchesSSE" ${
            task?.executionMode === "batchesSSE" ? "selected" : ""
          }>Batches SSE</option>
        </select>

        <label class="swal2-label">Consulta SQL:</label>
        <textarea id="swal-query" class="textarea-sql" placeholder="Consulta SQL">${
          task?.query || ""
        }</textarea>

        <label class="swal2-label">Parámetros (JSON):</label>
        <textarea id="swal-parameters" class="swal2-textarea" placeholder='[{"field": "nivel_precio", "operator": "=", "value": "Gold"}]'>
${JSON.stringify(task?.parameters || [], null, 2)}</textarea>

        <label class="swal2-label">Campos obligatorios:</label>
        <input id="swal-requiredFields" class="swal2-input" placeholder="Ejemplo: Code_ofClient, Name1" 
          value="${task?.validationRules?.requiredFields?.join(", ") || ""}" />

        <label class="swal2-label">Tabla de validación:</label>
        <input id="swal-existenceTable" class="swal2-input" placeholder="Ejemplo: dbo.IMPLT_clients" 
          value="${task?.validationRules?.existenceCheck?.table || ""}" />

        <label class="swal2-label">Clave primaria:</label>
        <input id="swal-existenceKey" class="swal2-input" placeholder="Ejemplo: Code_ofClient" 
          value="${task?.validationRules?.existenceCheck?.key || ""}" />

       <label class="swal2-label">Consulta Post-Transferencia:</label>
<textarea id="swal-postUpdateQuery" class="swal2-textarea"
  placeholder="Ejemplo: UPDATE CATELLI.CLIENTE SET U_ESTATUS = 'Normal'">${
    task?.postUpdateQuery || ""
  }</textarea>

        <div class="swal2-checkbox-container">
          <input id="swal-active" type="checkbox" ${
            task?.active ? "checked" : ""
          } />
          <label for="swal-active">Activo</label>
        </div>
      </div>
      <label class="swal2-label">Clave en Vista:</label>
<input id="swal-postUpdateKeyView" class="swal2-input" placeholder="Ejemplo: Code_OfClient"
  value="${task?.postUpdateMapping?.viewKey || ""}" />

<label class="swal2-label">Clave en Tabla Real:</label>
<input id="swal-postUpdateKeyTable" class="swal2-input" placeholder="Ejemplo: CLIENTE"
  value="${task?.postUpdateMapping?.tableKey || ""}" />
    `,
      showCancelButton: true,
      confirmButtonText: isEdit ? "Actualizar" : "Agregar",
      preConfirm: () => {
        try {
          // Convertir parámetros a JSON
          const paramValue =
            document.getElementById("swal-parameters").value.trim() || "[]";
          const parsedParams = JSON.parse(paramValue);

          return {
            name: document.getElementById("swal-name").value.trim(),
            type: document.getElementById("swal-type").value.trim(),
            transferType: document
              .getElementById("swal-transferType")
              .value.trim(),
            executionMode: document
              .getElementById("swal-executionMode")
              .value.trim(),
            query: document.getElementById("swal-query").value.trim(),
            parameters: parsedParams,
            validationRules: {
              requiredFields:
                document
                  .getElementById("swal-requiredFields")
                  .value.split(",")
                  .map((s) => s.trim())
                  .filter(Boolean) || [],
              existenceCheck: {
                table: document
                  .getElementById("swal-existenceTable")
                  .value.trim(),
                key: document.getElementById("swal-existenceKey").value.trim(),
              },
            },
            postUpdateQuery:
              document.getElementById("swal-postUpdateQuery").value.trim() ||
              null,
            postUpdateMapping: {
              // 🔹 AHORA SÍ SE ENVÍA EL MAPEADO
              viewKey:
                document
                  .getElementById("swal-postUpdateKeyView")
                  .value.trim() || null,
              tableKey:
                document
                  .getElementById("swal-postUpdateKeyTable")
                  .value.trim() || null,
            },
            active: document.getElementById("swal-active").checked,
          };
        } catch (error) {
          Swal.showValidationMessage(
            "⚠️ Error en el formato de parámetros JSON. Verifique la sintaxis."
          );
        }
      },
    });

    if (!formValues) return; // Usuario canceló

    console.log(formValues);

    try {
      // Llamada a tu API para guardar la tarea
      const result = await cnnApi.upsertTransferTask(accessToken, formValues);

      if (result) {
        Swal.fire(
          "Éxito",
          `Tarea ${isEdit ? "actualizada" : "creada"}.`,
          "success"
        );
      } else {
        throw new Error("No se pudo guardar la tarea.");
      }
    } catch (error) {
      console.log(error.message);
      Swal.fire("Error", error.message, "error");
    }
  };

  const executeTask = async (taskId) => {
    console.log(taskId);
    const selectedTask = tasks.find((task) => task._id === taskId);
    if (!selectedTask) {
      Swal.fire("Error", "No se encontró la tarea.", "error");
      return;
    }

    if (!selectedTask.active) {
      Swal.fire(
        "Advertencia",
        "Esta tarea está inactiva y no puede ejecutarse.",
        "warning"
      );
      return;
    }

    if (selectedTask.type !== "manual" && selectedTask.type !== "both") {
      Swal.fire(
        "Advertencia",
        "Solo las tareas de tipo 'manual' o 'both' pueden ejecutarse manualmente.",
        "warning"
      );
      return;
    }

    // 🚨 Verificar si hay una tarea en curso
    const taskInProgress = tasks.some(
      (task) =>
        task.status === "running" && ["auto", "both"].includes(task.type)
    );
    if (taskInProgress) {
      Swal.fire(
        "Advertencia",
        "No puedes ejecutar esta tarea porque hay otra en curso.",
        "warning"
      );
      return;
    }

    const confirm = await Swal.fire({
      title: "¿Ejecutar tarea?",
      text: "Esto iniciará la transferencia manualmente.",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Sí, ejecutar",
      cancelButtonText: "Cancelar",
    });

    if (!confirm.isConfirmed) return;

    try {
      // 🔄 Actualizar estado antes de ejecutar
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId
            ? { ...task, status: "running", progress: 0 }
            : task
        )
      );

      const result = await cnnApi.executeTask(accessToken, taskId);

      if (result?.result.success) {
        // ✅ Actualizar estado tras completar
        setTasks((prevTasks) =>
          prevTasks.map((task) =>
            task._id === taskId
              ? { ...task, status: "completed", progress: 100 }
              : task
          )
        );
        Swal.fire("Éxito", "Tarea ejecutada correctamente.", "success");
      } else {
        throw new Error(result.message || "No se pudo completar la tarea.");
      }
    } catch (error) {
      // ❌ Manejo de error
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === taskId ? { ...task, status: "error", progress: 0 } : task
        )
      );
      Swal.fire(
        "Error",
        error.message || "No se pudo ejecutar la tarea.",
        "error"
      );
    }
  };

  const deleteTask = async () => {
    if (!selectedTask) return;
    const confirmDelete = await Swal.fire({
      title: "¿Eliminar tarea?",
      text: "Esta acción no se puede deshacer",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!confirmDelete.isConfirmed) return;

    try {
      await axios.delete(`/api/tasks/${selectedTask._id}`);
      setSelectedTask(null);
      Swal.fire("Eliminado", "La tarea ha sido eliminada.", "success");
    } catch (error) {
      Swal.fire("Error", "No se pudo eliminar la tarea.", "error");
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
          <SearchSection>
            <SearchInput
              type="text"
              placeholder="Buscar tarea..."
              value={search}
              onChange={handleSearch}
            />
            <Button color="#28a745" onClick={() => addOrEditTask()}>
              ➕ Nuevo
            </Button>
          </SearchSection>

          <OptionsContainer>
            <ViewSection>
              <ViewButton color="#28a745" onClick={() => setViewMode("cards")}>
                🃏 Cards
              </ViewButton>
              <ViewButton color="#ffc107" onClick={() => setViewMode("table")}>
                📊 Table
              </ViewButton>
            </ViewSection>

            <ScheduleSection>
              <ScheduleText>Tareas programadas para la: </ScheduleText>
              <TimeInput
                type="time"
                value={executionTime}
                onChange={(e) => setExecutionTime(e.target.value)}
              />
              <ChangeButton onClick={handleTimeChange}>Cambiar</ChangeButton>
            </ScheduleSection>
          </OptionsContainer>
        </ToolbarContainer>
      </section>
      <section className="main">
        <ContainerTask>
          {loading ? (
            <p>Cargando tareas...</p>
          ) : viewMode === "cards" ? (
            <CardsContainer>
              {filteredTasks.map((task) => (
                <Card
                  key={task._id}
                  selected={selectedTask && selectedTask._id === task._id}
                >
                  <CardContent>
                    <h3>{task.name}</h3>

                    {/* 🔹 Estado con iconos */}
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

                    {/* 🔹 Barra de progreso */}
                    {task.status === "running" && (
                      <ProgressBar>
                        <ProgressFill style={{ width: `${task.progress}%` }}>
                          {task.progress}%
                        </ProgressFill>
                      </ProgressBar>
                    )}

                    <ButtonGroup>
                      <Button
                        color="#007bff"
                        onClick={() => addOrEditTask(task)}
                        disabled={task.status === "running"}
                      >
                        ✏ Editar
                      </Button>
                      <Button
                        color="#dc3545"
                        onClick={() => deleteTask(task._id)}
                        disabled={task.status === "running"}
                      >
                        🗑 Eliminar
                      </Button>
                      <Button
                        color="#17a2b8"
                        onClick={() => executeTask(task._id)}
                        disabled={
                          task.status === "running" ||
                          tasks.some(
                            (t) =>
                              t.status === "running" &&
                              ["auto", "both"].includes(t.type)
                          )
                        }
                      >
                        🚀 Ejecutar Manual
                      </Button>
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
                        <Button
                          color="#007bff"
                          onClick={() => addOrEditTask(task)}
                        >
                          ✏ Editar
                        </Button>
                        <Button color="#dc3545">🗑 Eliminar</Button>
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
    "header" 100px
    "area1" 100px
    /* "area2" 100px */
    "main" auto;

  @media (max-width: 768px) {
    grid-template:
      "header" 70px
      "area1" auto
      /* "area2" auto */
      "main" 1fr;
    padding: 10px;
  }

  @media (max-width: 480px) {
    grid-template:
      "header" 60px
      "area1" auto
      /* "area2" auto */
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
    /* background-color: rgba(229, 67, 26, 0.14); */
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    margin-bottom: 10px;

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

  /* .area2 {
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
  } */

  .main {
    grid-area: main;
    margin-top: 0px;
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

const SearchButton = styled.button`
  padding: 8px 12px;
  background-color: #0d6efd;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: #0b5ed7;
  }

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

const ScheduleSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 600px) {
    flex-direction: column;
    width: 90%;
    align-items: center;
  }
`;

const ScheduleText = styled.span`
  font-size: 14px;
  font-weight: bold;
`;

const TimeInput = styled.input`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const ChangeButton = styled.button`
  padding: 8px 12px;
  background-color: #6f42c1;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: #5a36a5;
  }

  @media (max-width: 600px) {
    width: 90%;
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
