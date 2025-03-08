import styled from "styled-components";
import { Header, TransferApi, useAuth, useFetchData } from "../../index";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaPlay,
  FaPlus,
  FaSync,
  FaList,
  FaTable,
  FaHistory,
  FaStop,
} from "react-icons/fa";

const cnnApi = new TransferApi();

export function TransferTasks() {
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const { accessToken, user } = useAuth();
  const [openstate, setOpenState] = useState(false);
  const [viewMode, setViewMode] = useState("cards"); // "cards", "list", "table"
  const [executionTime, setExecutionTime] = useState("20:30");
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const [cancelling, setCancelling] = useState(false);

  const {
    data: tasks,
    setData: setTasks,
    loading,
    error,
    refetch: fetchTasks,
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
    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: "Guardando horario...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await cnnApi.addTimeTransfer(accessToken, {
        hour: executionTime,
      });

      if (result) {
        Swal.fire(
          "Éxito",
          `Las tareas se ejecutarán todos los días a las ${executionTime}.`,
          "success"
        );
      } else {
        throw new Error("No se pudo guardar el horario.");
      }
    } catch (error) {
      console.log(error);
      Swal.fire(
        "Error",
        error.message || "Ocurrió un error al guardar",
        "error"
      );
    }
  };

  const addOrEditTask = async (task = null) => {
    const isEdit = Boolean(task);

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

      <div class="swal2-checkbox-container">
        <input id="swal-clearBeforeInsert" type="checkbox" ${
          task?.clearBeforeInsert ? "checked" : ""
        } />
        <label for="swal-clearBeforeInsert">Borrar registros antes de insertar</label>
      </div>
        
        <label class="swal2-label">Clave en Vista:</label>
        <input id="swal-postUpdateKeyView" class="swal2-input" placeholder="Ejemplo: Code_OfClient"
          value="${task?.postUpdateMapping?.viewKey || ""}" />
        
        <label class="swal2-label">Clave en Tabla Real:</label>
        <input id="swal-postUpdateKeyTable" class="swal2-input" placeholder="Ejemplo: CLIENTE"
          value="${task?.postUpdateMapping?.tableKey || ""}" />
      </div>
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
            clearBeforeInsert: document.getElementById("swal-clearBeforeInsert")
              .checked,
          };
        } catch (error) {
          Swal.showValidationMessage(
            "⚠️ Error en el formato de parámetros JSON. Verifique la sintaxis."
          );
        }
      },
    });

    if (!formValues) return; // Usuario canceló

    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: isEdit ? "Actualizando..." : "Creando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Llamada a tu API para guardar la tarea
      const result = await cnnApi.upsertTransferTask(accessToken, formValues);

      if (result) {
        // Refrescar la lista
        await fetchTasks();

        Swal.fire(
          "Éxito",
          `Tarea ${isEdit ? "actualizada" : "creada"} correctamente.`,
          "success"
        );
      } else {
        throw new Error(
          `No se pudo ${isEdit ? "actualizar" : "crear"} la tarea.`
        );
      }
    } catch (error) {
      console.log(error.message);
      Swal.fire("Error", error.message, "error");
    }
  };

  const executeTask = async (taskId) => {
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
      // Mostrar indicador de carga
      Swal.fire({
        title: "Ejecutando tarea...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

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

  const deleteTask = async (taskId) => {
    const taskToDelete = tasks.find((task) => task._id === taskId);
    if (!taskToDelete) {
      Swal.fire("Error", "No se encontró la tarea.", "error");
      return;
    }

    const confirmDelete = await Swal.fire({
      title: "¿Eliminar tarea?",
      text: `¿Deseas eliminar la tarea "${taskToDelete.name}"? Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc3545",
    });

    if (!confirmDelete.isConfirmed) return;

    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: "Eliminando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Llamada a la API para eliminar
      await cnnApi.deleteTask(accessToken, taskId);

      // Refrescar la lista
      await fetchTasks();

      Swal.fire("Eliminado", "La tarea ha sido eliminada.", "success");
    } catch (error) {
      console.error("Error al eliminar tarea:", error);
      Swal.fire("Error", "No se pudo eliminar la tarea.", "error");
    }
  };

  const viewTaskHistory = async (taskId) => {
    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: "Cargando historial...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Llamar a la API para obtener el historial
      const result = await cnnApi.getTaskHistory(accessToken, taskId);

      if (!result.success) {
        throw new Error(result.message || "Error al obtener historial");
      }

      console.log(result);
      const { task, history } = result;

      // Opcional: Si no hay historial, mostrar mensaje
      if (history.length === 0) {
        Swal.fire({
          title: "Sin historial",
          text: `No hay registros de ejecuciones para la tarea "${task.name}"`,
          icon: "info",
        });
        return;
      }

      // Crear HTML para el historial
      const historyHtml = history
        .map(
          (entry, index) => `
      <tr>
        <td>${new Date(entry.date).toLocaleString()}</td>
        <td>${entry.documentId || "N/A"}</td>
        <td>${entry.totalProducts || 0}</td>
        <td>${entry.totalQuantity || 0}</td>
        <td>
          <span class="status-badge ${entry.status}">
            ${
              entry.status === "completed"
                ? "Completado"
                : entry.status === "partial_return"
                ? "Devolución Parcial"
                : entry.status === "full_return"
                ? "Devolución Total"
                : entry.status
            }
          </span>
        </td>
      </tr>
    `
        )
        .join("");

      // Mostrar historial con SweetAlert2
      Swal.fire({
        title: `Historial de Transferencias: ${task.name}`,
        html: `
        <div class="history-details">
          <p><strong>Total de ejecuciones:</strong> ${task.executionCount}</p>
          <p><strong>Última ejecución:</strong> ${
            task.lastExecutionDate
              ? new Date(task.lastExecutionDate).toLocaleString()
              : "Nunca"
          }</p>
          
          <h4>Últimas transferencias</h4>
          <div class="history-table-container">
            <table class="swal2-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Documento</th>
                  <th>Productos</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${historyHtml}
              </tbody>
            </table>
          </div>
        </div>
      `,
        width: "800px",
        showConfirmButton: true,
        customClass: {
          container: "history-modal",
        },
      });

      // Agregar estilos para las badges
      const styleSheet = document.createElement("style");
      styleSheet.textContent = `
      .history-modal .history-table-container {
        max-height: 400px;
        overflow-y: auto;
      }
      .history-modal .status-badge {
        padding: 3px 8px;
        border-radius: 50px;
        font-size: 12px;
        font-weight: 500;
        color: white;
      }
      .history-modal .status-badge.completed {
        background-color: #28a745;
      }
      .history-modal .status-badge.partial_return {
        background-color: #ffc107;
        color: #212529;
      }
      .history-modal .status-badge.full_return {
        background-color: #dc3545;
      }
    `;
      document.head.appendChild(styleSheet);
    } catch (error) {
      console.error("Error al ver historial:", error);
      Swal.fire("Error", error.message, "error");
    }
  };

  const handleCancelTask = async (taskId) => {
    // Usar SweetAlert2 para la confirmación
    const result = await Swal.fire({
      title: "¿Detener tarea?",
      text: "¿Estás seguro de que deseas detener esta tarea en ejecución? Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, detener",
      cancelButtonText: "Cancelar",
    });

    // Si el usuario cancela la acción
    if (!result.isConfirmed) {
      return;
    }

    setCancelling(true);

    // Mostrar indicador de carga
    Swal.fire({
      title: "Deteniendo tarea...",
      text: "Por favor espera mientras se detiene la tarea.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const response = await cnnApi.cancelTask(accessToken, taskId);

      // Mostrar notificación de éxito
      Swal.fire({
        title: "Tarea detenida",
        text: "La solicitud de cancelación se ha enviado correctamente. La tarea se detendrá en breve.",
        icon: "success",
        timer: 3000,
        timerProgressBar: true,
      });

      // Actualizar la lista de tareas después de un breve retraso
      setTimeout(() => {
        fetchTasks();
      }, 2000);
    } catch (error) {
      // Mostrar notificación de error
      Swal.fire({
        title: "Error",
        text: `No se pudo detener la tarea: ${error.message}`,
        icon: "error",
      });
    } finally {
      setCancelling(false);
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
            <h2>Gestor de Tareas de Transferencia</h2>
            <p>
              Configure y administre las tareas de transferencia de datos entre
              sistemas.
            </p>
          </InfoSection>
        </ToolbarContainer>
      </section>

      <section className="area2">
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
            <AddButton onClick={() => addOrEditTask()}>
              <FaPlus /> Nueva Tarea
            </AddButton>

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

          <ScheduleRow>
            <ScheduleText>Programar tareas para las:</ScheduleText>
            <TimeInput
              type="time"
              value={executionTime}
              onChange={(e) => setExecutionTime(e.target.value)}
            />
            <ScheduleButton onClick={handleTimeChange}>
              Guardar horario
            </ScheduleButton>
          </ScheduleRow>
        </ActionsContainer>
      </section>

      <section className="main">
        {loading && (
          <LoadingContainer>
            <LoadingMessage>Cargando tareas...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !error && filteredTasks.length === 0 && (
          <EmptyMessage>
            No hay tareas disponibles. Haga clic en "Nueva Tarea" para crear
            una.
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

                    {task.lastExecutionDate && (
                      <InfoItem>
                        <InfoLabel>Última ejecución:</InfoLabel>
                        <InfoValue>
                          {new Date(task.lastExecutionDate).toLocaleString()}
                          {task.lastExecutionResult?.success ? (
                            <StatusBadge $status="completed" $small>
                              Éxito
                            </StatusBadge>
                          ) : (
                            <StatusBadge $status="error" $small>
                              Error
                            </StatusBadge>
                          )}
                        </InfoValue>
                      </InfoItem>
                    )}

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
                  <ActionButtonsContainer>
                    <ActionRow>
                      <ActionButton
                        $color="#007bff"
                        onClick={() => addOrEditTask(task)}
                        disabled={task.status === "running"}
                        title="Editar tarea"
                      >
                        <FaEdit />
                      </ActionButton>

                      <ActionButton
                        $color="#dc3545"
                        onClick={() => deleteTask(task._id)}
                        disabled={task.status === "running"}
                        title="Eliminar tarea"
                      >
                        <FaTrash />
                      </ActionButton>

                      <ActionButton
                        $color="#17a2b8"
                        onClick={() => executeTask(task._id)}
                        disabled={
                          task.status === "running" ||
                          !task.active ||
                          (task.type !== "manual" && task.type !== "both") ||
                          tasks.some(
                            (t) =>
                              t.status === "running" &&
                              ["auto", "both"].includes(t.type)
                          )
                        }
                        title="Ejecutar tarea manualmente"
                      >
                        <FaPlay />
                      </ActionButton>

                      <ActionButton
                        $color="#6f42c1"
                        onClick={() => viewTaskHistory(task._id)}
                        title="Ver historial de ejecuciones"
                      >
                        <FaHistory />
                      </ActionButton>

                      {task.status === "running" && (
                        <ActionButton
                          $color="#dc3545"
                          onClick={() => handleCancelTask(task._id)}
                          disabled={cancelling}
                          title="Detener tarea en ejecución"
                        >
                          <FaStop />
                        </ActionButton>
                      )}
                    </ActionRow>
                  </ActionButtonsContainer>
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
                  <th>Modo</th>
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
                    <td>{task.executionMode}</td>
                    <td>
                      <ActionButtons>
                        <TableActionButton
                          title="Editar"
                          $color="#007bff"
                          onClick={() => addOrEditTask(task)}
                          disabled={task.status === "running"}
                        >
                          <FaEdit />
                        </TableActionButton>

                        <TableActionButton
                          title="Eliminar"
                          $color="#dc3545"
                          onClick={() => deleteTask(task._id)}
                          disabled={task.status === "running"}
                        >
                          <FaTrash />
                        </TableActionButton>

                        <TableActionButton
                          title="Ejecutar tarea"
                          $color="#17a2b8"
                          onClick={() => executeTask(task._id)}
                          disabled={
                            task.status === "running" ||
                            !task.active ||
                            (task.type !== "manual" && task.type !== "both") ||
                            tasks.some(
                              (t) =>
                                t.status === "running" &&
                                ["auto", "both"].includes(t.type)
                            )
                          }
                        >
                          <FaPlay />
                        </TableActionButton>

                        <TableActionButton
                          title="Ver historial"
                          $color="#6f42c1"
                          onClick={() => viewTaskHistory(task._id)}
                        >
                          <FaHistory />
                        </TableActionButton>

                        {task.status === "running" && (
                          <TableActionButton
                            title="Detener tarea"
                            $color="#dc3545"
                            onClick={() => handleCancelTask(task._id)}
                            disabled={cancelling}
                          >
                            <FaStop />
                          </TableActionButton>
                        )}
                      </ActionButtons>
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </TableContainer>
        )}
      </section>
    </Container>
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

const AddButton = styled.button`
  background-color: #28a745;
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
    background-color: #218838;
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

const ViewSection = styled.div`
  display: flex;
  gap: 5px;

  @media (max-width: 600px) {
    width: 100%;
    justify-content: center;
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

const ScheduleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;

  @media (max-width: 768px) {
    flex-wrap: wrap;
  }

  @media (max-width: 480px) {
    flex-direction: column;
    width: 100%;
  }
`;

const ScheduleText = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text};
`;

const TimeInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const ScheduleButton = styled.button`
  background-color: #6f42c1;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a36a5;
  }

  @media (max-width: 480px) {
    width: 100%;
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

const ActionButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: space-between;
`;

// Modificar ActionButton para que sea más compacto en esta vista
const ActionButton = styled.button`
  flex: 1;
  padding: 8px;
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
