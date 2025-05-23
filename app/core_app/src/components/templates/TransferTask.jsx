import styled from "styled-components";
import {
  ScheduleConfigButton,
  TransferApi,
  useAuth,
  useFetchData,
  progressClient,
} from "../../index";
import { useEffect, useState, useRef, useCallback } from "react";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaPlay,
  FaPlus,
  FaList,
  FaTable,
  FaHistory,
  FaStop,
  FaBell,
  FaChartLine,
  FaInfoCircle,
  FaSync,
} from "react-icons/fa";

const cnnApi = new TransferApi();

export function TransferTasks() {
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const { accessToken, user } = useAuth();

  const [viewMode, setViewMode] = useState("cards"); // "cards", "list", "table"
  const [executionTime, setExecutionTime] = useState("20:30");
  const [cancellationStatus, setCancellationStatus] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const [activeTasks, setActiveTasks] = useState({});
  const [taskEstimates, setTaskEstimates] = useState({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const previousTasksRef = useRef(null);
  const FETCH_INTERVAL = 5000;

  // Estados para filtros
  const [filters, setFilters] = useState({
    type: "all", // "all", "manual", "auto", "both"
    executionMode: "all", // "all", "normal", "batchesSSE"
    transferType: "all", // "all", "general", "up", "down", "internal"
    status: "all", // "all", "active", "inactive"
  });

  // Usamos useCallback para crear funciones estables para fetchData
  const fetchTasksCallback = useCallback(
    async (options = {}) => {
      try {
        const result = await cnnApi.getTasks(accessToken);
        return result;
      } catch (error) {
        console.error("Error al obtener tareas:", error);
        throw error; // Permitir que el hook maneje el error
      }
    },
    [accessToken]
  );

  const fetchScheduleTimeCallback = useCallback(
    async (options = {}) => {
      try {
        const result = await cnnApi.getSchuledTime(accessToken);
        return result;
      } catch (error) {
        console.error("Error al obtener hora programada:", error);
        throw error;
      }
    },
    [accessToken]
  );

  // Fetch de tareas con el hook mejorado
  const {
    data: tasks,
    loading: tasksLoading,
    refreshing: tasksRefreshing,
    loadingState: tasksLoadingState,
    setData: setTasks,
    error: tasksError,
    refetch: fetchTasks,
  } = useFetchData(fetchTasksCallback, [accessToken], {
    autoRefresh: true,
    refreshInterval: FETCH_INTERVAL,
    enableCache: true,
    cacheTime: 60000, // 1 minuto
    initialData: [],
  });

  // Fetch de hora programada
  const {
    data: scheduleTime,
    loading: scheduleLoading,
    error: scheduleError,
    refetch: fetchScheduleTime,
  } = useFetchData(fetchScheduleTimeCallback, [accessToken], {
    autoRefresh: false,
    initialData: { hour: "02:00", enabled: true },
  });

  // ⏰ Sincronizar `executionTime` con `scheduleTime`
  useEffect(() => {
    if (scheduleTime?.hour) {
      setExecutionTime(scheduleTime.hour);
    }
  }, [scheduleTime?.hour]);

  // Pedir permiso para notificaciones
  useEffect(() => {
    const requestNotificationPermission = async () => {
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        setNotificationsEnabled(permission === "granted");
      }
    };

    requestNotificationPermission();
  }, []);

  // Configurar SSE para tareas en ejecución
  useEffect(() => {
    // Identificar tareas en ejecución que necesitan suscripción
    const runningTasks = tasks.filter((task) => task.status === "running");

    // Para cada tarea en ejecución, configurar SSE si no está ya configurado
    runningTasks.forEach((task) => {
      if (!progressClient.isSubscribed(task._id)) {
        progressClient.subscribe(task._id, {
          // Manejar evento de progreso
          progress: (data) => {
            // Actualizar el progreso en la tarea
            setTasks((prevTasks) =>
              prevTasks.map((t) =>
                t._id === task._id
                  ? {
                      ...t,
                      progress: data.progress,
                      status: data.status || t.status,
                    }
                  : t
              )
            );

            // Si tenemos la hora de inicio, calcular la estimación de tiempo
            if (activeTasks[task._id]?.startTime) {
              const startTime = activeTasks[task._id].startTime;
              const elapsed = Date.now() - startTime;

              // Solo calcular si tenemos un progreso válido
              if (data.progress > 0) {
                const totalEstimate = (elapsed / data.progress) * 100;
                const remaining = totalEstimate - elapsed;

                setTaskEstimates((prev) => ({
                  ...prev,
                  [task._id]: {
                    elapsed,
                    remaining,
                    total: totalEstimate,
                    speed: data.progress / (elapsed / 1000 / 60), // % por minuto
                  },
                }));
              }
            }
          },

          // Manejar evento de estado
          status: (data) => {
            // Actualizar el estado de la tarea
            setTasks((prevTasks) =>
              prevTasks.map((t) =>
                t._id === task._id ? { ...t, status: data.status } : t
              )
            );

            // Si la tarea ha completado, mostrar notificación
            if (data.status === "completed" && notificationsEnabled) {
              new Notification("Tarea completada", {
                body: `La tarea "${task.name}" ha finalizado correctamente.`,
                icon: "/favicon.ico",
              });
            } else if (data.status === "error" && notificationsEnabled) {
              new Notification("Error en tarea", {
                body: `La tarea "${task.name}" ha finalizado con errores.`,
                icon: "/favicon.ico",
              });
            }
          },

          // Manejar evento de conexión
          connected: () => {
            console.log(`Conectado a SSE para tarea ${task._id}`);
          },

          // Manejar errores
          error: (error) => {
            console.error(`Error en SSE para tarea ${task._id}:`, error);
          },

          // Manejar fallos en reconexión
          reconnectFailed: () => {
            console.warn(`Reconexión fallida para tarea ${task._id}`);
            // Actualizar UI para mostrar que perdimos conexión
            setTasks((prevTasks) =>
              prevTasks.map((t) =>
                t._id === task._id
                  ? {
                      ...t,
                      connectionLost: true,
                    }
                  : t
              )
            );
          },
        });

        // Registrar tiempo de inicio si no existe
        if (!activeTasks[task._id]) {
          setActiveTasks((prev) => ({
            ...prev,
            [task._id]: {
              startTime: Date.now(),
            },
          }));
        }
      }
    });

    // Cancelar suscripciones para tareas que ya no están en ejecución
    tasks.forEach((task) => {
      if (task.status !== "running" && progressClient.isSubscribed(task._id)) {
        progressClient.unsubscribe(task._id);
      }
    });

    // Limpiar al desmontar
    return () => {
      progressClient.closeAll();
    };
  }, [tasks, activeTasks, notificationsEnabled]);

  // Detectar cambios en el estado de las tareas
  useEffect(() => {
    if (!previousTasksRef.current) {
      previousTasksRef.current = tasks;
      return;
    }

    // Verificar tareas que cambiaron de estado running a completed/error
    tasks.forEach((task) => {
      const prevTask = previousTasksRef.current.find((t) => t._id === task._id);
      if (
        prevTask &&
        prevTask.status === "running" &&
        (task.status === "completed" || task.status === "error")
      ) {
        // Mostrar notificación solo si están habilitadas
        if (notificationsEnabled) {
          const notificationTitle =
            task.status === "completed" ? "Tarea completada" : "Error en tarea";
          const notificationBody =
            task.status === "completed"
              ? `La tarea "${task.name}" ha finalizado correctamente.`
              : `La tarea "${task.name}" ha finalizado con errores.`;

          new Notification(notificationTitle, {
            body: notificationBody,
            icon: "/favicon.ico",
          });
        }
      }
    });

    // Actualizar referencia
    previousTasksRef.current = tasks;
  }, [tasks, notificationsEnabled]);

  // Función para manejar cambios en los filtros
  const handleFilterChange = (filterType, value) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      [filterType]: value,
    }));
  };

  // Filtro dinámico
  const filteredTasks = tasks.filter((task) => {
    // Filtro por texto de búsqueda
    const matchesSearch = task.name
      .toLowerCase()
      .includes(search.toLowerCase());

    // Filtros adicionales
    const matchesType = filters.type === "all" || task.type === filters.type;
    const matchesExecutionMode =
      filters.executionMode === "all" ||
      task.executionMode === filters.executionMode;
    const matchesTransferType =
      filters.transferType === "all" ||
      task.transferType === filters.transferType;
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "active" ? task.active : !task.active);

    // Aplicar todos los filtros
    return (
      matchesSearch &&
      matchesType &&
      matchesExecutionMode &&
      matchesTransferType &&
      matchesStatus
    );
  });

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const addOrEditTask = async (task = null) => {
    const isEdit = Boolean(task);

    // ✅ OBTENER INFORMACIÓN DE VINCULACIÓN ANTES DEL HTML
    let linkingInfo = null;
    if (isEdit && task?._id) {
      try {
        const linkingResponse = await cnnApi.getTaskLinkingInfo(
          accessToken,
          task._id
        );
        linkingInfo = linkingResponse.data || null;
        console.log("Información de vinculación:", linkingInfo);
      } catch (error) {
        console.warn("No se pudo obtener info de vinculación:", error);
        linkingInfo = null;
      }
    }

    const { value: formValues } = await Swal.fire({
      title: isEdit ? "Editar Tarea" : "Nueva Tarea",
      width: 600,
      html: `
    <div style="max-width:100%;">
      <!-- SECCIÓN 1: CONFIGURACIÓN BÁSICA -->
      <div class="form-section">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Configuración Básica</h4>
        
        <div class="form-group">
          <label>Nombre de la tarea:</label>
          <input id="swal-name" class="swal2-input" placeholder="Nombre" value="${
            task?.name || ""
          }" />
        </div>

        <div class="form-group">
          <label>Tipo de tarea:</label>
          <select id="swal-type" class="swal2-select">
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
        </div>

        <div class="form-group">
          <label>Tipo de Transferencia:</label>
          <select id="swal-transferType" class="swal2-select">
            <option value="" ${
              !task?.transferType ? "selected" : ""
            }>General</option>
            <option value="up" ${
              task?.transferType === "up" ? "selected" : ""
            }>Transfer Up (Server1 → Server2)</option>
            <option value="down" ${
              task?.transferType === "down" ? "selected" : ""
            }>Transfer Down (Server2 → Server1)</option>
            <option value="internal" ${
              task?.transferType === "internal" ? "selected" : ""
            }>Transfer Interno (Server1 → Server1)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Modo de Ejecución:</label>
          <select id="swal-executionMode" class="swal2-select">
            <option value="normal" ${
              task?.executionMode === "normal" || !task?.executionMode
                ? "selected"
                : ""
            }>Normal Transfer</option>
            <option value="batchesSSE" ${
              task?.executionMode === "batchesSSE" ? "selected" : ""
            }>Batches SSE</option>
          </select>
        </div>
        
        <div class="swal2-checkbox-container">
          <input id="swal-active" type="checkbox" ${
            task?.active !== false ? "checked" : ""
          } />
          <label for="swal-active">Activo</label>
        </div>

        <div class="swal2-checkbox-container">
          <input id="swal-clearBeforeInsert" type="checkbox" ${
            task?.clearBeforeInsert ? "checked" : ""
          } />
          <label for="swal-clearBeforeInsert">Borrar registros antes de insertar</label>
        </div>
      </div>
      
      <!-- SECCIÓN 2: CONSULTA Y PARÁMETROS -->
      <div class="form-section">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Consulta y Parámetros</h4>
        
        <div class="form-group">
          <label>Consulta SQL:</label>
          <textarea id="swal-query" class="textarea-sql" placeholder="Consulta SQL">${
            task?.query || ""
          }</textarea>
        </div>

        <div class="form-group">
          <label>Parámetros (JSON):</label>
          <textarea id="swal-parameters" class="swal2-textarea" placeholder='[{"field": "nivel_precio", "operator": "=", "value": "Gold"}]'>${JSON.stringify(
            task?.parameters || [],
            null,
            2
          )}</textarea>
        </div>
      </div>

      <!-- SECCIÓN 3: TAREAS VINCULADAS -->
      <div class="form-section">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">🔗 Tareas Vinculadas</h4>
        
        <div style="margin-bottom: 15px; padding: 12px; background-color: #e3f2fd; border-radius: 6px; border-left: 4px solid #2196f3;">
          <div style="font-weight: 600; color: #1565c0; margin-bottom: 8px;">ℹ️ ¿Cómo funciona?</div>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #424242; line-height: 1.5;">
            <li><strong>Grupo vinculado:</strong> Si esta tarea pertenece a un grupo, al ejecutar CUALQUIER tarea del grupo se ejecutarán TODAS las tareas del grupo</li>
            <li><strong>Post-update coordinado:</strong> Solo se ejecutará UN post-update al final con TODOS los registros procesados</li>
            <li><strong>Evita conflictos:</strong> Perfecto para tareas como IMPLT_Accounts + IMPLT_Accounts_function que actualizan el mismo campo U_ESTATUS</li>
            <li><strong>Orden de ejecución:</strong> Las tareas se ejecutan según el orden especificado</li>
          </ul>
        </div>
        
        <div class="form-group">
          <label>Grupo de vinculación:</label>
          <input id="swal-linkedGroup" class="swal2-input" 
                 placeholder="Ejemplo: IMPLT_Accounts_Group" 
                 value="${task?.linkedGroup || ""}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Importante:</strong> Todas las tareas con el mismo nombre de grupo se ejecutarán juntas automáticamente
          </small>
        </div>

        <div class="form-group">
          <label>Orden de ejecución en el grupo:</label>
          <input id="swal-linkedExecutionOrder" class="swal2-input" type="number" 
                 placeholder="0" min="0" max="100"
                 value="${task?.linkedExecutionOrder || 0}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            Orden en que se ejecutará dentro del grupo (0 = primera, 1 = segunda, etc.)
          </small>
        </div>

        <div class="swal2-checkbox-container">
          <input id="swal-isCoordinator" type="checkbox" ${
            task?.postUpdateQuery ? "checked" : ""
          } />
          <label for="swal-isCoordinator">Esta tarea será la coordinadora del post-update del grupo</label>
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Regla importante:</strong> Solo UNA tarea del grupo debe tener post-update definido (será la coordinadora). 
            Las demás tareas del grupo deben tener post-update vacío.
          </small>
        </div>

        <div class="form-group">
          <label>Tareas vinculadas directamente (alternativa al grupo):</label>
          <select id="swal-linkedTasks" class="swal2-select" multiple style="height: 100px; width: 100%;">
            ${tasks
              .filter((t) => t._id !== task?._id)
              .map(
                (t) =>
                  `<option value="${t._id}" ${
                    Array.isArray(task?.linkedTasks) &&
                    task.linkedTasks.some(
                      (id) => id.toString() === t._id.toString()
                    )
                      ? "selected"
                      : ""
                  }>${t.name}</option>`
              )
              .join("")}
          </select>
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Alternativa:</strong> Si no usas grupos, puedes vincular tareas específicas aquí. 
            Mantén presionada Ctrl para seleccionar múltiples tareas.
          </small>
        </div>

        ${
          linkingInfo && linkingInfo.hasLinkedTasks
            ? `
          <div style="margin-top: 15px; padding: 12px; background-color: #e8f5e8; border-radius: 6px; border-left: 4px solid #4caf50;">
            <div style="font-weight: 600; color: #2e7d32; margin-bottom: 8px;">📊 Estado actual de vinculación</div>
            <div style="font-size: 13px; color: #424242;">
              <div style="margin-bottom: 4px;"><strong>Grupo:</strong> ${
                linkingInfo.linkedGroup || "Vinculación directa"
              }</div>
              <div style="margin-bottom: 4px;"><strong>Total de tareas en el grupo:</strong> ${
                linkingInfo.linkedTasksCount
              }</div>
              <div style="margin-bottom: 4px;"><strong>Tareas vinculadas:</strong></div>
              <ul style="margin: 4px 0; padding-left: 20px;">
                ${linkingInfo.linkedTasks
                  .map((t) => `<li>${t.name} (orden: ${t.order})</li>`)
                  .join("")}
              </ul>
              <div style="margin-top: 8px; padding: 6px; background-color: #fff; border-radius: 4px; font-size: 12px;">
                <strong>💡 Recordatorio:</strong> Al ejecutar cualquiera de estas tareas, se ejecutarán todas automáticamente
              </div>
            </div>
          </div>
        `
            : linkingInfo === null && isEdit
            ? `
          <div style="margin-top: 15px; padding: 12px; background-color: #fff3e0; border-radius: 6px; border-left: 4px solid #ff9800;">
            <div style="font-weight: 500; color: #e65100;">⚠️ No se pudo cargar información de vinculación</div>
            <div style="font-size: 12px; color: #424242; margin-top: 4px;">
              Es posible que esta tarea no tenga vinculaciones configuradas o haya ocurrido un error al cargar la información.
            </div>
          </div>
        `
            : ""
        }

        <div style="margin-top: 15px; padding: 10px; background-color: #fff3e0; border-radius: 6px; border-left: 4px solid #ff9800;">
          <div style="font-weight: 600; color: #e65100; margin-bottom: 6px;">⚠️ Recomendaciones</div>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #424242; line-height: 1.4;">
            <li>Usa <strong>grupos</strong> para tareas que siempre se ejecutan juntas</li>
            <li>Usa <strong>vinculación directa</strong> solo para casos especiales</li>
            <li>Define el <strong>orden de ejecución</strong> cuidadosamente</li>
            <li>Solo <strong>una tarea</strong> del grupo debe tener post-update</li>
          </ul>
        </div>
      </div>
      
      <!-- RESTO DE SECCIONES... -->
      ${getRestOfSections(task, tasks)}
    </div>
    `,
      confirmButtonText: isEdit ? "Actualizar" : "Agregar",
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      customClass: {
        container: "swal-container",
        popup: "swal-popup",
        htmlContainer: "swal-html-container",
        input: "swal-input",
        actions: "swal-actions",
      },
      didOpen: () => {
        // Ajustar el tamaño del popup después de abrirlo
        const popup = Swal.getPopup();
        popup.style.maxWidth = "500px";
        popup.style.width = "95%";

        // Función para actualizar las secciones visibles basado en el tipo de transferencia
        const updateVisibleSections = () => {
          const transferType =
            document.getElementById("swal-transferType").value;

          // Sección de mapeo de campos (solo para DOWN)
          const fieldMappingSection = document.getElementById(
            "section-field-mapping"
          );
          fieldMappingSection.style.display =
            transferType === "down" ? "block" : "none";

          // Sección de tareas encadenadas (solo para DOWN)
          const chainTasksSection = document.getElementById(
            "section-chain-tasks"
          );
          chainTasksSection.style.display =
            transferType === "down" ? "block" : "none";

          // Sección de tabla destino (solo para INTERNAL)
          const targetTableSection = document.getElementById(
            "section-target-table"
          );
          targetTableSection.style.display =
            transferType === "internal" ? "block" : "none";

          // Secciones más relevantes para UP (opcional mostrarlas/ocultarlas)
          const validationSection =
            document.getElementById("section-validation");
          const postTransferSection = document.getElementById(
            "section-post-transfer"
          );

          if (transferType === "down") {
            validationSection.style.display = "none";
            postTransferSection.style.display = "none";
          } else {
            validationSection.style.display = "block";
            postTransferSection.style.display = "block";
          }
        };

        // Agregar event listener para el cambio de tipo de transferencia
        document
          .getElementById("swal-transferType")
          .addEventListener("change", updateVisibleSections);

        // Ejecutar una vez para configurar la vista inicial según el tipo de transferencia actual
        updateVisibleSections();

        // Añadir estilos para las secciones
        const style = document.createElement("style");
        style.innerHTML = `
        .form-section {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f9f9f9;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .form-section h4 {
          color: #444;
          font-size: 16px;
          margin-top: 0;
        }
        .textarea-sql {
          width: 100%;
          height: 120px;
          padding: 8px;
          font-family: monospace;
          font-size: 14px;
          line-height: 1.5;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          resize: vertical;
        }
      `;
        document.head.appendChild(style);
      },
      preConfirm: () => {
        try {
          // Obtener valores básicos
          const name = document.getElementById("swal-name").value.trim();
          const type = document.getElementById("swal-type").value.trim();
          const transferType = document
            .getElementById("swal-transferType")
            .value.trim();
          const executionMode = document
            .getElementById("swal-executionMode")
            .value.trim();
          const query = document.getElementById("swal-query").value.trim();
          const active = document.getElementById("swal-active").checked;
          const clearBeforeInsert = document.getElementById(
            "swal-clearBeforeInsert"
          ).checked;

          // Validaciones requeridas
          if (!name) {
            Swal.showValidationMessage(
              "⚠️ El nombre de la tarea es obligatorio"
            );
            return false;
          }

          if (!query) {
            Swal.showValidationMessage("⚠️ La consulta SQL es obligatoria");
            return false;
          }

          // Procesar parámetros JSON
          let parsedParams = [];
          try {
            const paramValue = document
              .getElementById("swal-parameters")
              .value.trim();
            if (paramValue) {
              parsedParams = JSON.parse(paramValue);
            }
          } catch (e) {
            console.error("Error al parsear JSON:", e);
            Swal.showValidationMessage(
              "⚠️ Error en el formato de parámetros JSON"
            );
            return false;
          }

          // Construir el objeto base de la tarea
          const formData = {
            name,
            type,
            transferType,
            executionMode,
            query,
            parameters: parsedParams,
            active,
            clearBeforeInsert,
          };

          // Si es una edición, incluir el ID original
          if (isEdit && task?._id) {
            formData._id = task._id;
          }

          // Obtener los campos de validación para todo tipo de tarea
          const requiredFieldsStr = document
            .getElementById("swal-requiredFields")
            .value.trim();
          const existenceTable = document
            .getElementById("swal-existenceTable")
            .value.trim();
          const existenceKey = document
            .getElementById("swal-existenceKey")
            .value.trim();

          // Inicializar validationRules base para todos los tipos
          formData.validationRules = {
            requiredFields: requiredFieldsStr
              ? requiredFieldsStr
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            existenceCheck: {
              table: existenceTable || "",
              key: existenceKey || "",
            },
          };

          // Post-transferencia (para todos los tipos)
          const postUpdateQuery = document
            .getElementById("swal-postUpdateQuery")
            .value.trim();
          const viewKey = document
            .getElementById("swal-postUpdateKeyView")
            .value.trim();
          const tableKey = document
            .getElementById("swal-postUpdateKeyTable")
            .value.trim();

          formData.postUpdateQuery = postUpdateQuery || null;
          formData.postUpdateMapping = {
            viewKey: viewKey || null,
            tableKey: tableKey || null,
          };

          // Procesar campos específicos según el tipo de transferencia
          if (transferType === "down") {
            // Para transferencias DOWN, procesar el mapeo de campos
            const sourceTable = document
              .getElementById("swal-source-table")
              .value.trim();
            const targetTable = document
              .getElementById("swal-target-table")
              .value.trim();
            const sourceFieldsStr = document
              .getElementById("swal-source-fields")
              .value.trim();
            const targetFieldsStr = document
              .getElementById("swal-target-fields")
              .value.trim();
            const defaultValuesStr = document
              .getElementById("swal-default-values")
              .value.trim();

            // Obtener campo identificador especificado para DOWN
            const downKeyField = document
              .getElementById("swal-down-key-field")
              .value.trim();

            // Validar campos específicos para DOWN
            if (!sourceTable) {
              Swal.showValidationMessage(
                "⚠️ Debe especificar la tabla origen en Server2"
              );
              return false;
            }

            if (!targetTable) {
              Swal.showValidationMessage(
                "⚠️ Debe especificar la tabla destino en Server1"
              );
              return false;
            }

            if (!sourceFieldsStr || !targetFieldsStr) {
              Swal.showValidationMessage(
                "⚠️ Debe especificar los campos origen y destino"
              );
              return false;
            }

            const sourceFields = sourceFieldsStr
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean);
            const targetFields = targetFieldsStr
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean);

            if (sourceFields.length !== targetFields.length) {
              Swal.showValidationMessage(
                "⚠️ Debe haber el mismo número de campos origen y destino"
              );
              return false;
            }

            // Procesar valores por defecto
            const defaultValues = [];
            if (defaultValuesStr) {
              const defaultPairs = defaultValuesStr.split(",");
              for (const pair of defaultPairs) {
                const parts = pair.split(":");
                if (parts.length === 2) {
                  const field = parts[0].trim();
                  const value = parts[1].trim();
                  if (field) {
                    defaultValues.push({ field, value });
                  }
                }
              }
            }

            // Configurar fieldMapping para DOWN
            formData.fieldMapping = {
              sourceTable,
              targetTable,
              sourceFields,
              targetFields,
              defaultValues: defaultValues.length > 0 ? defaultValues : [],
            };

            // Procesar tareas encadenadas
            const nextTasksSelect = document.getElementById("swal-next-tasks");
            if (nextTasksSelect) {
              const selectedOptions = Array.from(
                nextTasksSelect.selectedOptions || []
              );
              formData.nextTasks = selectedOptions.map(
                (option) => option.value
              );
            } else {
              formData.nextTasks = [];
            }

            // IMPORTANTE: Configurar validationRules para transferencias DOWN
            // Verificar si se especificó un campo identificador específico
            if (downKeyField) {
              // Verificar si el campo especificado está en los campos destino
              if (!targetFields.includes(downKeyField)) {
                Swal.showValidationMessage(
                  `⚠️ El campo identificador "${downKeyField}" debe estar en la lista de campos destino`
                );
                return false;
              }

              // Usar el campo identificador especificado
              formData.validationRules.existenceCheck.key = downKeyField;
              formData.validationRules.requiredFields = [downKeyField];

              // Asignar tabla para validación si está vacía
              if (!formData.validationRules.existenceCheck.table) {
                formData.validationRules.existenceCheck.table = targetTable;
              }
            }
            // Si no se especificó un campo identificador, usar el primer campo destino
            else if (targetFields.length > 0) {
              const primaryField = targetFields[0];
              console.log(
                `Usando primer campo destino '${primaryField}' como clave para validación en transferencia DOWN`
              );

              formData.validationRules.existenceCheck.key = primaryField;
              formData.validationRules.requiredFields = [primaryField];

              // Asignar tabla para validación si está vacía
              if (!formData.validationRules.existenceCheck.table) {
                formData.validationRules.existenceCheck.table = targetTable;
              }
            } else {
              Swal.showValidationMessage(
                "⚠️ No se pueden determinar campos para identificar registros. Especifique al menos un campo destino."
              );
              return false;
            }
          } else if (transferType === "internal") {
            // Para transferencias INTERNAL, procesar tabla destino
            const targetTable = document
              .getElementById("swal-targetTable")
              .value.trim();

            if (!targetTable) {
              Swal.showValidationMessage(
                "⚠️ Para transferencias internas debe especificar la tabla destino"
              );
              return false;
            }

            formData.targetTable = targetTable;

            // Agregar fieldMapping vacío para mantener consistencia
            formData.fieldMapping = {
              sourceTable: "",
              targetTable: "",
              sourceFields: [],
              targetFields: [],
              defaultValues: [],
            };
            formData.nextTasks = [];

            // Verificar que haya al menos una clave primaria o campo requerido
            if (
              !formData.validationRules.existenceCheck.key &&
              formData.validationRules.requiredFields.length === 0
            ) {
              Swal.showValidationMessage(
                "⚠️ Debe especificar al menos una clave primaria o un campo obligatorio para identificar registros"
              );
              return false;
            }
          } else {
            // Para otros tipos, agregar fieldMapping vacío para mantener consistencia
            formData.fieldMapping = {
              sourceTable: "",
              targetTable: "",
              sourceFields: [],
              targetFields: [],
              defaultValues: [],
            };
            formData.nextTasks = [];

            // Verificar que haya al menos una clave primaria o campo requerido
            if (
              !formData.validationRules.existenceCheck.key &&
              formData.validationRules.requiredFields.length === 0
            ) {
              Swal.showValidationMessage(
                "⚠️ Debe especificar al menos una clave primaria o un campo obligatorio para identificar registros"
              );
              return false;
            }
          }

          // Depuración: imprimir objeto completo
          console.log("Datos del formulario:", formData);

          return formData;
        } catch (error) {
          console.error("Error en el formulario:", error);
          Swal.showValidationMessage(`⚠️ Error: ${error.message}`);
          return false;
        }
      },
    });

    function getRestOfSections(task, tasks) {
      return `
      <!-- SECCIÓN 4: MAPEO DE CAMPOS (SOLO PARA DOWN) -->
      <div id="section-field-mapping" class="form-section" style="display: none;">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Mapeo de Campos (Server2 → Server1)</h4>
        
        <div style="margin-bottom: 10px;">
          <p style="font-size: 13px; color: #666;">Define las tablas y la correspondencia entre campos.</p>
        </div>
        
        <div class="form-group">
          <label>Tabla origen en Server2:</label>
          <input id="swal-source-table" class="swal2-input" placeholder="Ejemplo: dbo.CLIENTES_EXTERNOS" 
            value="${task?.fieldMapping?.sourceTable || ""}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            Nombre de la tabla en Server2 de donde se obtendrán los datos
          </small>
        </div>

        <div class="form-group">
          <label>Tabla destino en Server1:</label>
          <input id="swal-target-table" class="swal2-input" placeholder="Ejemplo: dbo.Clientes" 
            value="${task?.fieldMapping?.targetTable || task?.name || ""}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            Nombre de la tabla en Server1 donde se insertarán los datos
          </small>
        </div>
        
        <div class="mapping-fields">
          <div style="margin-bottom: 10px;">
            <label for="swal-source-fields">Campos Origen (Server2):</label>
            <textarea id="swal-source-fields" class="swal2-textarea" placeholder="ID, NOMBRE_COMPLETO, TELEFONO_CONTACTO...">${
              Array.isArray(task?.fieldMapping?.sourceFields)
                ? task.fieldMapping.sourceFields.join(", ")
                : ""
            }</textarea>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label for="swal-target-fields">Campos Destino (Server1):</label>
            <textarea id="swal-target-fields" class="swal2-textarea" placeholder="ClienteID, Nombre, Telefono...">${
              Array.isArray(task?.fieldMapping?.targetFields)
                ? task.fieldMapping.targetFields.join(", ")
                : ""
            }</textarea>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label for="swal-default-values">Valores por defecto (opcional):</label>
            <textarea id="swal-default-values" class="swal2-textarea" placeholder="Campo1:Valor1, Campo2:Valor2...">${
              Array.isArray(task?.fieldMapping?.defaultValues)
                ? task.fieldMapping.defaultValues
                    .map((d) => `${d.field}:${d.value}`)
                    .join(", ")
                : ""
            }</textarea>
            <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
              Formato: NombreCampo:Valor (separados por comas)
            </small>
          </div>
        </div>
        
        <div class="form-group" style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #ddd;">
          <label>Campo identificador único:</label>
          <input id="swal-down-key-field" class="swal2-input" placeholder="Ejemplo: ClienteID, Codigo, etc." 
            value="${task?.validationRules?.existenceCheck?.key || ""}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Importante:</strong> Especifique un campo que identifique de manera única cada registro (debe estar en los campos destino).
          </small>
        </div>
        
        <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
          Los campos deben estar separados por comas y en el mismo orden para establecer la correspondencia correcta.
        </small>
      </div>
      
      <!-- SECCIÓN DE TAREAS ENCADENADAS (SOLO PARA DOWN) -->
      <div id="section-chain-tasks" class="form-section" style="display: none;">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Tareas Encadenadas</h4>
        
        <div class="form-group">
          <label>Ejecutar estas tareas al finalizar (opcional):</label>
          <select id="swal-next-tasks" class="swal2-select" multiple style="height: 100px; width: 100%;">
            ${tasks
              .filter((t) => t._id !== task?._id)
              .map(
                (t) =>
                  `<option value="${t._id}" ${
                    Array.isArray(task?.nextTasks) &&
                    task.nextTasks.some(
                      (id) => id.toString() === t._id.toString()
                    )
                      ? "selected"
                      : ""
                  }>${t.name}</option>`
              )
              .join("")}
          </select>
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            Mantén presionada la tecla Ctrl para seleccionar múltiples tareas que se ejecutarán en secuencia al finalizar esta tarea.
          </small>
        </div>
      </div>
      
      <!-- SECCIÓN 5: VALIDACIÓN DE DATOS -->
      <div id="section-validation" class="form-section">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Validación de Datos</h4>
        
        <div class="form-group">
          <label>Campos obligatorios:</label>
          <input id="swal-requiredFields" class="swal2-input" placeholder="Ejemplo: Code_ofClient, Name1" 
            value="${
              Array.isArray(task?.validationRules?.requiredFields)
                ? task.validationRules.requiredFields.join(", ")
                : ""
            }" />
        </div>

        <div class="form-group">
          <label>Tabla de validación:</label>
          <input id="swal-existenceTable" class="swal2-input" placeholder="Ejemplo: dbo.IMPLT_clients" 
            value="${task?.validationRules?.existenceCheck?.table || ""}" />
        </div>

        <div class="form-group">
          <label>Clave primaria:</label>
          <input id="swal-existenceKey" class="swal2-input" placeholder="Ejemplo: Code_ofClient" 
            value="${task?.validationRules?.existenceCheck?.key || ""}" />
        </div>
      </div>
      
      <!-- SECCIÓN 6: POST-TRANSFERENCIA -->
      <div id="section-post-transfer" class="form-section">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Operaciones Post-Transferencia</h4>
        
        <div class="form-group">
          <label>Consulta Post-Transferencia:</label>
          <textarea id="swal-postUpdateQuery" class="swal2-textarea"
            placeholder="Ejemplo: UPDATE CATELLI.CLIENTE SET U_ESTATUS = 'Normal'">${
              task?.postUpdateQuery || ""
            }</textarea>
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Para tareas vinculadas:</strong> Solo la tarea coordinadora debe tener esta consulta definida
          </small>
        </div>

        <div class="form-group">
          <label>Clave en Vista:</label>
          <input id="swal-postUpdateKeyView" class="swal2-input" placeholder="Ejemplo: Code_OfClient"
            value="${task?.postUpdateMapping?.viewKey || ""}" />
        </div>
        
        <div class="form-group">
          <label>Clave en Tabla Real:</label>
          <input id="swal-postUpdateKeyTable" class="swal2-input" placeholder="Ejemplo: CLIENTE"
            value="${task?.postUpdateMapping?.tableKey || ""}" />
        </div>
      </div>
      
      <!-- SECCIÓN 7: TABLA DESTINO (SÓLO PARA TRANSFERENCIA INTERNA) -->
      <div id="section-target-table" class="form-section" style="display: none;">
        <h4 style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin: 15px 0;">Configuración de Transferencia Interna</h4>
        
        <div class="form-group">
          <label>Tabla destino:</label>
          <input id="swal-targetTable" class="swal2-input" placeholder="Ejemplo: dbo.IMPLT_Hist_Orders" 
            value="${task?.targetTable || ""}" />
          <small style="display: block; margin-top: 5px; font-size: 12px; color: #666;">
            Especifique la tabla destino para transferencias internas en Server1
          </small>
        </div>
      </div>
  `;
    }

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

      // Depuración: Mostrar datos enviados al backend
      console.log("Enviando al backend:", formValues);

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
      console.log("Error al guardar:", error);
      Swal.fire("Error", error.message || "Error desconocido", "error");
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

      // Registrar tiempo de inicio para estimaciones
      setActiveTasks((prev) => ({
        ...prev,
        [taskId]: {
          startTime: Date.now(),
        },
      }));

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

        // Notificación solo si tenemos permiso
        if (notificationsEnabled) {
          new Notification("Tarea completada", {
            body: `La tarea "${selectedTask.name}" ha finalizado correctamente.`,
            icon: "/favicon.ico",
          });
        }
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

      // Notificación de error solo si tenemos permiso
      if (notificationsEnabled) {
        new Notification("Error en tarea", {
          body: `La tarea "${selectedTask.name}" ha finalizado con errores.`,
          icon: "/favicon.ico",
        });
      }
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

  // Función mejorada de cancelación de tareas
  const handleCancelTask = async (taskId) => {
    const taskToCancel = tasks.find((task) => task._id === taskId);

    console.log(taskToCancel);
    if (!taskToCancel) return;

    // Solicitar confirmación
    const result = await Swal.fire({
      title: "¿Detener tarea?",
      text: `¿Estás seguro de que deseas detener la tarea "${taskToCancel.name}"? Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, detener",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    setCancelling(true);

    // Actualizar UI inmediatamente para mejor feedback
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task._id === taskId
          ? { ...task, status: "cancelling", cancellationRequested: true }
          : task
      )
    );

    // Mostrar indicador de progreso de cancelación
    const cancelSwal = Swal.fire({
      title: "Deteniendo tarea...",
      html: `
        <div>
          <p>Por favor espera mientras se detiene la tarea "${taskToCancel.name}".</p>
          <p>Esta operación puede tardar unos segundos...</p>
          <div class="progress-container" style="width: 100%; background-color: #f3f3f3; border-radius: 4px; height: 10px; margin-top: 15px; overflow: hidden;">
            <div class="progress-bar" style="width: 0; height: 100%; background-color: #dc3545; transition: width 0.3s;"></div>
          </div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        // Simulación visual del progreso de cancelación
        let width = 0;
        const progressBar = Swal.getPopup().querySelector(".progress-bar");
        const interval = setInterval(() => {
          if (width < 95) {
            width += 5;
            progressBar.style.width = `${width}%`;
          }
        }, 500);

        // Guardar el interval para poder limpiarlo después
        Swal.getPopup().interval = interval;
      },
      willClose: () => {
        clearInterval(Swal.getPopup().interval);
      },
    });

    try {
      // Llamar a la API para cancelar la tarea
      const result = await cnnApi.cancelTask(accessToken, taskId, {
        force: false,
        reason: "Cancelado por el usuario desde la interfaz",
        onStatusChange: (status) => {
          setCancellationStatus((prev) => ({
            ...prev,
            [taskId]: status.data,
          }));

          // Actualizar UI con el estado más reciente
          if (status.data && status.data.state) {
            setTasks((prevTasks) =>
              prevTasks.map((task) =>
                task._id === taskId
                  ? { ...task, status: status.data.state }
                  : task
              )
            );
          }
        },
      });

      // Cerrar el indicador de progreso
      cancelSwal.close();

      if (result.success) {
        Swal.fire({
          title: "Tarea detenida",
          text: "La solicitud de cancelación se ha procesado correctamente.",
          icon: "success",
          timer: 3000,
          timerProgressBar: true,
        });

        // Actualizar estado en la UI
        setTasks((prevTasks) =>
          prevTasks.map((task) =>
            task._id === taskId
              ? { ...task, status: "cancelled", progress: -1 }
              : task
          )
        );

        // Mostrar notificación si está habilitado
        if (notificationsEnabled) {
          new Notification("Tarea cancelada", {
            body: `La tarea "${taskToCancel.name}" ha sido cancelada.`,
            icon: "/favicon.ico",
          });
        }
      } else {
        throw new Error(result.message || "Error al cancelar la tarea");
      }

      // Refrescar la lista de tareas después de un breve retraso
      setTimeout(() => {
        fetchTasks();
      }, 2000);
    } catch (error) {
      // Cerrar el indicador de progreso
      cancelSwal.close();

      // Mostrar error
      Swal.fire({
        title: "Error",
        text: `No se pudo detener la tarea: ${error.message}`,
        icon: "error",
      });

      // Intentar restablecer el estado
      fetchTasks();
    } finally {
      setCancelling(false);
    }
  };

  // Panel para ver detalles de progreso detallado
  const showDetailedProgress = (taskId) => {
    const task = tasks.find((t) => t._id === taskId);
    if (!task || task.status !== "running") return;

    // Obtener estimaciones de tiempo
    const estimate = taskEstimates[taskId] || {};
    const elapsedMinutes = estimate.elapsed
      ? Math.floor(estimate.elapsed / 1000 / 60)
      : 0;
    const elapsedSeconds = estimate.elapsed
      ? Math.floor((estimate.elapsed / 1000) % 60)
      : 0;
    const remainingMinutes = estimate.remaining
      ? Math.floor(estimate.remaining / 1000 / 60)
      : 0;
    const remainingSeconds = estimate.remaining
      ? Math.floor((estimate.remaining / 1000) % 60)
      : 0;

    Swal.fire({
      title: `Progreso de tarea: ${task.name}`,
      html: `
        <div class="detailed-progress">
          <div class="progress-container">
            <div class="progress-bar-detailed">
              <div class="progress-fill" style="width: ${task.progress}%">${
        task.progress
      }%</div>
            </div>
          </div>
          
          <div class="time-estimates">
            <p><strong>Tiempo transcurrido:</strong> ${elapsedMinutes}m ${elapsedSeconds}s</p>
            <p><strong>Tiempo restante est.:</strong> ${remainingMinutes}m ${remainingSeconds}s</p>
            <p><strong>Velocidad de procesamiento:</strong> ${
              estimate.speed?.toFixed(2) || 0
            }% por minuto</p>
            <p><strong>Hora estimada de finalización:</strong> ${
              estimate.remaining
                ? new Date(Date.now() + estimate.remaining).toLocaleTimeString()
                : "Desconocida"
            }</p>
          </div>
          
          <div class="status-info">
            <p><strong>Estado de la tarea:</strong> <span class="status-badge">${
              task.status === "running" ? "En ejecución" : task.status
            }</span></p>
            <p><strong>Conexión SSE:</strong> <span class="connection-badge ${
              progressClient.getConnectionState(taskId) === "open"
                ? "connected"
                : "disconnected"
            }">${
        progressClient.getConnectionState(taskId) === "open"
          ? "Conectado"
          : progressClient.getConnectionState(taskId) || "Desconectado"
      }</span></p>
          </div>
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: "Cerrar",
      showCancelButton: true,
      cancelButtonText: "Cancelar tarea",
      cancelButtonColor: "#dc3545",
      customClass: {
        container: "progress-modal",
      },
      didOpen: () => {
        // Agregar estilos para este diálogo
        const style = document.createElement("style");
        style.innerHTML = `
          .progress-modal .detailed-progress {
            text-align: left;
          }
          .progress-modal .progress-container {
            margin: 20px 0;
          }
          .progress-modal .progress-bar-detailed {
            width: 100%;
            height: 30px;
            background-color: #f3f3f3;
            border-radius: 15px;
            overflow: hidden;
          }
          .progress-modal .progress-fill {
            height: 100%;
            background-color: #17a2b8;
            text-align: center;
            line-height: 30px;
            color: white;
            font-weight: bold;
            transition: width 0.5s ease;
            position: relative;
          }
          .progress-modal .progress-fill::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
              90deg, 
              rgba(255,255,255,0) 0%, 
              rgba(255,255,255,0.3) 50%, 
              rgba(255,255,255,0) 100%
            );
            animation: progressShine 2s infinite linear;
            width: 200%;
          }
          @keyframes progressShine {
            from { transform: translateX(-100%); }
            to { transform: translateX(50%); }
          }
          .progress-modal .time-estimates {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 8px;
          }
          .progress-modal .status-info {
            margin: 20px 0;
            padding: 15px;
            background-color: #e9ecef;
            border-radius: 8px;
          }
          .progress-modal .status-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            background-color: #17a2b8;
            color: white;
            font-weight: 500;
          }
          .progress-modal .connection-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 500;
          }
          .progress-modal .connection-badge.connected {
            background-color: #28a745;
            color: white;
          }
          .progress-modal .connection-badge.disconnected {
            background-color: #dc3545;
            color: white;
          }
        `;
        document.head.appendChild(style);

        // Actualizar la barra de progreso en tiempo real
        const progressFill = Swal.getPopup().querySelector(".progress-fill");
        const progressInterval = setInterval(() => {
          const updatedTask = tasks.find((t) => t._id === taskId);
          if (updatedTask && progressFill) {
            progressFill.style.width = `${updatedTask.progress}%`;
            progressFill.textContent = `${updatedTask.progress}%`;
          }
        }, 1000);

        // Guardar el interval para limpiarlo después
        Swal.getPopup().progressInterval = progressInterval;
      },
      willClose: () => {
        // Limpiar el interval al cerrar
        clearInterval(Swal.getPopup().progressInterval);
      },
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) {
        // Usuario quiere cancelar la tarea
        handleCancelTask(taskId);
      }
    });
  };

  // Nueva función para mostrar el panel de métricas
  const showTaskMetricsPanel = async () => {
    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: "Cargando métricas...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Calcular métricas
      const completedToday = tasks.filter((task) => {
        if (!task.lastExecutionDate) return false;
        const execDate = new Date(task.lastExecutionDate);
        const today = new Date();
        return (
          execDate.getDate() === today.getDate() &&
          execDate.getMonth() === today.getMonth() &&
          execDate.getFullYear() === today.getFullYear() &&
          task.lastExecutionResult?.success === true
        );
      }).length;

      const failedToday = tasks.filter((task) => {
        if (!task.lastExecutionDate) return false;
        const execDate = new Date(task.lastExecutionDate);
        const today = new Date();
        return (
          execDate.getDate() === today.getDate() &&
          execDate.getMonth() === today.getMonth() &&
          execDate.getFullYear() === today.getFullYear() &&
          task.lastExecutionResult?.success === false
        );
      }).length;

      // Calcular tasa de éxito general
      const totalExecutions = tasks.reduce(
        (sum, task) => sum + (task.executionCount || 0),
        0
      );
      const successRate =
        totalExecutions > 0
          ? (tasks.filter((t) => t.lastExecutionResult?.success).length /
              tasks.length) *
            100
          : 0;

      // Tareas más ejecutadas
      const topTasks = [...tasks]
        .sort((a, b) => (b.executionCount || 0) - (a.executionCount || 0))
        .slice(0, 5)
        .map((task) => ({
          name: task.name,
          executions: task.executionCount || 0,
          lastExecution: task.lastExecutionDate
            ? new Date(task.lastExecutionDate).toLocaleString()
            : "Nunca",
          successRate: task.lastExecutionResult?.success ? 100 : 0,
        }));

      // Cerrar indicador de carga
      Swal.close();

      // Mostrar panel de métricas
      Swal.fire({
        title: "Métricas de Tareas",
        html: `
          <div class="metrics-panel">
            <div class="metrics-summary">
              <div class="metric-card">
                <h4>Tareas Completadas Hoy</h4>
                <p class="metric-value">${completedToday}</p>
              </div>
              <div class="metric-card">
                <h4>Tareas Fallidas Hoy</h4>
                <p class="metric-value">${failedToday}</p>
              </div>
              <div class="metric-card">
                <h4>Tasa de Éxito General</h4>
                <p class="metric-value">${successRate.toFixed(1)}%</p>
              </div>
            </div>
            
            <div class="metrics-table-container">
              <h4>Tareas más ejecutadas</h4>
              <table>
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Ejecuciones</th>
                    <th>Última ejecución</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${topTasks
                    .map(
                      (task) => `
                    <tr>
                      <td>${task.name}</td>
                      <td>${task.executions}</td>
                      <td>${task.lastExecution}</td>
                      <td>${
                        task.successRate === 100
                          ? '<span class="status-ok">✓</span>'
                          : '<span class="status-fail">✗</span>'
                      }</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        `,
        width: "600px",
        showConfirmButton: true,
        confirmButtonText: "Cerrar",
        didOpen: () => {
          // Estilos para el panel de métricas
          const style = document.createElement("style");
          style.innerHTML = `
            .metrics-panel {
              font-family: Arial, sans-serif;
            }
            .metrics-summary {
              display: flex;
              justify-content: space-between;
              gap: 15px;
              margin-bottom: 30px;
            }
            .metric-card {
              flex: 1;
              background-color: #f8f9fa;
              border-radius: 8px;
              padding: 15px;
              text-align: center;
            }
            .metric-card h4 {
              font-size: 14px;
              margin: 0 0 10px;
              color: #495057;
            }
            .metric-value {
              font-size: 24px;
              font-weight: 600;
              margin: 0;
              color: #007bff;
            }
            .metrics-table-container {
              background-color: #fff;
              border-radius: 8px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              padding: 15px;
            }
            .metrics-table-container h4 {
              margin-top: 0;
              margin-bottom: 15px;
              color: #495057;
            }
            .metrics-table-container table {
              width: 100%;
              border-collapse: collapse;
            }
            .metrics-table-container th, 
            .metrics-table-container td {
              padding: 8px 12px;
              text-align: left;
              border-bottom: 1px solid #dee2e6;
            }
            .metrics-table-container th {
              font-weight: 600;
              background-color: #f8f9fa;
            }
            .status-ok {
              color: #28a745;
              font-weight: bold;
            }
            .status-fail {
              color: #dc3545;
              font-weight: bold;
            }
          `;
          document.head.appendChild(style);
        },
      });
    } catch (error) {
      console.error("Error al mostrar métricas:", error);
      Swal.fire("Error", "No se pudieron cargar las métricas", "error");
    }
  };

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <h2>Gestor de Tareas de Transferencia</h2>
          <p>
            Configure y administre las tareas de transferencia de datos entre
            sistemas.
          </p>
        </InfoSection>
      </ToolbarContainer>

      <ActionsContainer>
        <SearchInputContainer>
          <SearchInput
            type="text"
            placeholder="Buscar tarea..."
            value={search}
            onChange={handleSearch}
          />
        </SearchInputContainer>

        {/* Contenedor de Filtros */}
        <FiltersContainer>
          <FilterGroup>
            <FilterLabel>Tipo:</FilterLabel>
            <FilterSelect
              value={filters.type}
              onChange={(e) => handleFilterChange("type", e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="manual">Manual</option>
              <option value="auto">Automática</option>
              <option value="both">Ambas</option>
            </FilterSelect>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Modo:</FilterLabel>
            <FilterSelect
              value={filters.executionMode}
              onChange={(e) =>
                handleFilterChange("executionMode", e.target.value)
              }
            >
              <option value="all">Todos</option>
              <option value="normal">Normal</option>
              <option value="batchesSSE">Batches SSE</option>
            </FilterSelect>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Dirección:</FilterLabel>
            <FilterSelect
              value={filters.transferType}
              onChange={(e) =>
                handleFilterChange("transferType", e.target.value)
              }
            >
              <option value="all">Todas</option>
              <option value="">General</option>
              <option value="up">Transfer Up</option>
              <option value="down">Transfer Down</option>
              <option value="internal">Transfer Interno</option>
            </FilterSelect>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>Estado:</FilterLabel>
            <FilterSelect
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </FilterSelect>
          </FilterGroup>

          <ResetFiltersButton
            onClick={() =>
              setFilters({
                type: "all",
                executionMode: "all",
                transferType: "all",
                status: "all",
              })
            }
          >
            Limpiar Filtros
          </ResetFiltersButton>
        </FiltersContainer>
        <TaskCounter>
          Mostrando {filteredTasks.length} de {tasks.length} tareas
          {selectedTask && ` | ${selectedTask.name} seleccionada`}
        </TaskCounter>

        <ButtonsRow>
          <AddButton onClick={() => addOrEditTask()}>
            <FaPlus /> Nueva Tarea
          </AddButton>

          <RefreshButton
            onClick={fetchTasks}
            refreshing={tasksRefreshing}
            label="Recargar"
            className={tasksRefreshing ? "refreshing" : ""}
          >
            <FaSync className={tasksRefreshing ? "spinning" : ""} />
            {tasksRefreshing ? "Actualizando..." : "Refrescar"}
          </RefreshButton>

          {/* Botón para métricas */}
          <MetricsButton onClick={showTaskMetricsPanel}>
            <FaChartLine /> Métricas
          </MetricsButton>

          {/* Botón para habilitar/deshabilitar notificaciones */}
          <NotificationButton
            $enabled={notificationsEnabled}
            onClick={() => {
              if (!notificationsEnabled && "Notification" in window) {
                Notification.requestPermission().then((permission) => {
                  setNotificationsEnabled(permission === "granted");
                });
              } else {
                setNotificationsEnabled(!notificationsEnabled);
              }
            }}
            title={
              notificationsEnabled
                ? "Notificaciones activadas"
                : "Activar notificaciones"
            }
          >
            <FaBell /> {notificationsEnabled ? "" : "Activar Notificaciones"}
          </NotificationButton>

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
          <ScheduleConfigButton
            disabled={tasksLoading || scheduleLoading}
            onSuccess={(result) => {
              // Actualizar el estado local si es necesario
              if (result.hour) {
                setExecutionTime(result.hour);
              }
              // Refrescar la lista de tareas
              fetchTasks();
              fetchScheduleTime();
            }}
          />
        </ScheduleRow>
      </ActionsContainer>

      <div style={{ position: "relative" }}>
        {tasksRefreshing && (
          <RefreshOverlay>
            <RefreshContent>
              <FaSync className="refresh-icon-spin" />
              <RefreshText>Actualizando tareas...</RefreshText>
            </RefreshContent>
          </RefreshOverlay>
        )}

        {tasksLoading && !tasksRefreshing && (
          <LoadingContainer>
            <LoadingMessage>Cargando tareas...</LoadingMessage>
          </LoadingContainer>
        )}

        {tasksError && <ErrorMessage>{tasksError}</ErrorMessage>}

        {!tasksLoading && !tasksRefreshing && filteredTasks.length === 0 && (
          <EmptyMessage>
            No hay tareas disponibles. Haga clic en "Nueva Tarea" para crear
            una.
          </EmptyMessage>
        )}

        {/* Mostrar contador de tareas en ejecución */}
        {tasks.filter((task) => task.status === "running").length > 0 && (
          <RunningTasksCounter>
            {tasks.filter((task) => task.status === "running").length} tarea(s)
            en ejecución
          </RunningTasksCounter>
        )}

        {!tasksLoading && filteredTasks.length > 0 && viewMode === "cards" && (
          <CardsContainer>
            {filteredTasks.map((task) => (
              <Card
                key={task._id}
                $selected={selectedTask && selectedTask._id === task._id}
                $active={task.active}
                $transferType={task.transferType}
                $status={task.status}
              >
                <CardHeader>
                  <CardTitle>{task.name}</CardTitle>
                  <StatusBadge $status={task.status} $active={task.active}>
                    {task.status === "completed" && "✅ Completada"}
                    {task.status === "running" && "🔄 En Progreso"}
                    {task.status === "cancelling" && "⏹️ Cancelando..."}
                    {task.status === "cancelled" && "⏹️ Cancelada"}
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
                          {task.transferType === "internal" && (
                            <span
                              style={{ color: "#dc3545", fontWeight: "bold" }}
                            >
                              Interno (Server1→Server1)
                            </span>
                          )}
                          {!task.transferType && "General"}
                        </InfoValue>
                      </InfoItem>
                    )}

                    {/* Mostrar estimación de tiempo si está en ejecución */}
                    {task.status === "running" && taskEstimates[task._id] && (
                      <InfoItem>
                        <InfoLabel>Tiempo est.:</InfoLabel>
                        <InfoValue>
                          {Math.floor(
                            taskEstimates[task._id].remaining / 60000
                          )}{" "}
                          min
                          <TimeEstimateButton
                            onClick={() => showDetailedProgress(task._id)}
                            title="Ver detalles de progreso"
                          >
                            <FaInfoCircle />
                          </TimeEstimateButton>
                        </InfoValue>
                      </InfoItem>
                    )}

                    {task.transferType === "internal" && task.targetTable && (
                      <InfoItem>
                        <InfoLabel>Tabla destino:</InfoLabel>
                        <InfoValue>{task.targetTable}</InfoValue>
                      </InfoItem>
                    )}
                  </CardInfo>

                  <CardQuerySection>
                    <QueryLabel>Consulta SQL:</QueryLabel>
                    <QueryBox readOnly value={task.query} />
                  </CardQuerySection>

                  {/* Barra de progreso para tareas en ejecución */}
                  {task.status === "running" && (
                    <>
                      <ProgressBar
                        onClick={() => showDetailedProgress(task._id)}
                      >
                        <ProgressFill style={{ width: `${task.progress}%` }}>
                          {task.progress}%
                        </ProgressFill>
                      </ProgressBar>
                      <ProgressText>
                        Haga clic en la barra de progreso para más detalles
                      </ProgressText>
                    </>
                  )}

                  {/* Barra de progreso para tareas en cancelación */}
                  {task.status === "cancelling" && (
                    <ProgressBar $cancelling>
                      <ProgressFill $cancelling style={{ width: "100%" }}>
                        Cancelando...
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
                        disabled={
                          task.status === "running" ||
                          task.status === "cancelling"
                        }
                        title="Editar tarea"
                      >
                        <FaEdit />
                      </ActionButton>

                      <ActionButton
                        $color="#dc3545"
                        onClick={() => deleteTask(task._id)}
                        disabled={
                          task.status === "running" ||
                          task.status === "cancelling"
                        }
                        title="Eliminar tarea"
                      >
                        <FaTrash />
                      </ActionButton>

                      <ActionButton
                        $color="#17a2b8"
                        onClick={() => executeTask(task._id)}
                        disabled={
                          task.status === "running" ||
                          task.status === "cancelling" ||
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
                          disabled={cancelling || task.status === "cancelling"}
                          title="Detener tarea en ejecución"
                        >
                          <FaStop />
                        </ActionButton>
                      )}

                      {/* Botón para mostrar detalles del progreso */}
                      {task.status === "running" && (
                        <ActionButton
                          $color="#17a2b8"
                          onClick={() => showDetailedProgress(task._id)}
                          title="Ver detalles del progreso"
                        >
                          <FaInfoCircle />
                        </ActionButton>
                      )}
                    </ActionRow>
                  </ActionButtonsContainer>
                </CardActions>
              </Card>
            ))}
          </CardsContainer>
        )}

        {!tasksLoading && filteredTasks.length > 0 && viewMode === "table" && (
          <TableContainer>
            <StyledTable>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Modo</th>
                  <th>Progreso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr
                    key={task._id}
                    className={`${!task.active ? "disabled" : ""} ${
                      task.transferType === "internal"
                        ? "internal-transfer"
                        : ""
                    } ${task.status === "running" ? "running" : ""} ${
                      task.status === "cancelling" ? "cancelling" : ""
                    }`}
                  >
                    <td>{task.name}</td>
                    <td>
                      <StatusBadge
                        $status={task.status}
                        $active={task.active}
                        $small
                      >
                        {task.status === "completed" && "✅ Completada"}
                        {task.status === "running" && "🔄 En Progreso"}
                        {task.status === "cancelling" && "⏹️ Cancelando..."}
                        {task.status === "cancelled" && "⏹️ Cancelada"}
                        {task.status === "error" && "⚠️ Error"}
                        {!task.status && (task.active ? "Activa" : "Inactiva")}
                      </StatusBadge>
                    </td>
                    <td>
                      {task.transferType === "internal" ? (
                        <span style={{ color: "#dc3545", fontWeight: "bold" }}>
                          Interno (Server1→Server1)
                        </span>
                      ) : task.transferType === "up" ? (
                        "Transfer Up (Server1→Server2)"
                      ) : task.transferType === "down" ? (
                        "Transfer Down (Server2→Server1)"
                      ) : (
                        "General"
                      )}
                    </td>
                    <td>{task.executionMode}</td>
                    <td>
                      {task.status === "running" && (
                        <TableProgressBar
                          onClick={() => showDetailedProgress(task._id)}
                        >
                          <TableProgressFill
                            style={{ width: `${task.progress}%` }}
                          >
                            {task.progress}%
                          </TableProgressFill>
                        </TableProgressBar>
                      )}
                      {task.status === "cancelling" && (
                        <TableProgressBar $cancelling>
                          <TableProgressFill
                            $cancelling
                            style={{ width: "100%" }}
                          >
                            Cancelando...
                          </TableProgressFill>
                        </TableProgressBar>
                      )}
                    </td>
                    <td>
                      <ActionButtons>
                        <TableActionButton
                          title="Editar"
                          $color="#007bff"
                          onClick={() => addOrEditTask(task)}
                          disabled={
                            task.status === "running" ||
                            task.status === "cancelling"
                          }
                        >
                          <FaEdit />
                        </TableActionButton>

                        <TableActionButton
                          title="Eliminar"
                          $color="#dc3545"
                          onClick={() => deleteTask(task._id)}
                          disabled={
                            task.status === "running" ||
                            task.status === "cancelling"
                          }
                        >
                          <FaTrash />
                        </TableActionButton>

                        <TableActionButton
                          title="Ejecutar tarea"
                          $color="#17a2b8"
                          onClick={() => executeTask(task._id)}
                          disabled={
                            task.status === "running" ||
                            task.status === "cancelling" ||
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
                          <>
                            <TableActionButton
                              title="Detener tarea"
                              $color="#dc3545"
                              onClick={() => handleCancelTask(task._id)}
                              disabled={
                                cancelling || task.status === "cancelling"
                              }
                            >
                              <FaStop />
                            </TableActionButton>

                            <TableActionButton
                              title="Ver detalles"
                              $color="#17a2b8"
                              onClick={() => showDetailedProgress(task._id)}
                            >
                              <FaInfoCircle />
                            </TableActionButton>
                          </>
                        )}
                      </ActionButtons>
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </TableContainer>
        )}
      </div>
    </>
  );
}

// Estilos para componentes
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

// const RefreshButton = styled.button`
//   background-color: #17a2b8;
//   color: white;
//   border: none;
//   border-radius: 4px;
//   padding: 10px 15px;
//   font-size: 14px;
//   cursor: pointer;
//   display: flex;
//   align-items: center;
//   gap: 8px;
//   transition: background-color 0.3s;

//   &:hover {
//     background-color: #138496;
//   }

//   @media (max-width: 480px) {
//     width: 100%;
//   }
// `;

const MetricsButton = styled.button`
  background-color: #6f42c1;
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
    background-color: #5e35b1;
  }

  @media (max-width: 480px) {
    width: 100%;
    justify-content: center;
  }
`;

const NotificationButton = styled.button`
  background-color: ${(props) => (props.$enabled ? "#28a745" : "#6c757d")};
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
    background-color: ${(props) => (props.$enabled ? "#218838" : "#5a6268")};
  }

  @media (max-width: 480px) {
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

const RunningTasksCounter = styled.div`
  padding: 10px 15px;
  background-color: #f8d7da;
  color: #721c24;
  border-radius: 4px;
  margin: 0 auto 20px;
  text-align: center;
  font-weight: 500;
  max-width: 300px;
  animation: pulse 2s infinite;

  @keyframes pulse {
    0% {
      background-color: #f8d7da;
    }
    50% {
      background-color: #fadfe1;
    }
    100% {
      background-color: #f8d7da;
    }
  }
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
    ${(props) => {
      if (props.$status === "running") return "#17a2b8"; // Azul para en ejecución
      if (props.$status === "cancelling") return "#dc3545"; // Rojo para cancelando
      if (props.$transferType === "internal") return "#dc3545"; // Rojo para transferencias internas
      if (props.$selected) return "#007bff";
      if (props.$active) return "#28a745";
      return "#6c757d";
    }};
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
        return "#17a2b8";
      case "cancelling":
        return "#dc3545";
      case "cancelled":
        return "#dc3545";
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
  display: flex;
  align-items: center;
`;

const TimeEstimateButton = styled.button`
  background: none;
  border: none;
  color: #007bff;
  font-size: 14px;
  cursor: pointer;
  margin-left: 10px;
  padding: 2px 5px;
  border-radius: 4px;

  &:hover {
    background-color: rgba(0, 123, 255, 0.1);
  }
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

const ProgressText = styled.div`
  text-align: center;
  font-size: 12px;
  color: #6c757d;
  margin-top: 5px;
  cursor: pointer;
`;

// Mejoras a los estilos de progreso
const ProgressBar = styled.div`
  width: 100%;
  height: 24px;
  background-color: ${(props) => (props.$cancelling ? "#f8d7da" : "#eee")};
  border-radius: 12px;
  margin-top: 15px;
  overflow: hidden;
  cursor: ${(props) => (props.$cancelling ? "default" : "pointer")};
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  position: relative;

  &:hover {
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  }
`;

const ProgressFill = styled.div`
  height: 100%;
  background-color: ${(props) => (props.$cancelling ? "#dc3545" : "#17a2b8")};
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: white;
  line-height: 24px;
  transition: width 0.3s ease-out;
  position: relative;

  /* Efecto de animación para barras en ejecución */
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.3) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    width: 200%;
    animation: shine 2s infinite linear;
  }

  @keyframes shine {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(50%);
    }
  }
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

    &.internal-transfer {
      border-left: 4px solid #dc3545; // Borde rojo para transferencias internas
      background-color: rgba(220, 53, 69, 0.05); // Fondo rojizo muy sutil
    }

    &.running {
      background-color: rgba(23, 162, 184, 0.05);
    }

    &.cancelling {
      background-color: rgba(220, 53, 69, 0.05);
    }

    /* Indicador pulsante para tareas en ejecución */
    &.running td:first-child::before {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #17a2b8;
      margin-right: 8px;
      animation: pulse 1.5s infinite;
    }

    &.cancelling td:first-child::before {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #dc3545;
      margin-right: 8px;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
      100% {
        opacity: 1;
      }
    }
  }
`;

// Estilos para progreso en tabla
const TableProgressBar = styled.div`
  width: 100%;
  height: 20px;
  background-color: ${(props) => (props.$cancelling ? "#f8d7da" : "#eee")};
  border-radius: 10px;
  overflow: hidden;
  cursor: ${(props) => (props.$cancelling ? "default" : "pointer")};
`;

const TableProgressFill = styled.div`
  height: 100%;
  background-color: ${(props) => (props.$cancelling ? "#dc3545" : "#17a2b8")};
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: white;
  line-height: 20px;
  transition: width 0.5s ease-in-out;
  position: relative;

  /* Agregar animación para progreso */
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.3) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    width: 200%;
    animation: tableShine 2s infinite linear;
  }

  @keyframes tableShine {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(50%);
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

// Estilos para los filtros
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

// Y el estilo
const TaskCounter = styled.div`
  text-align: center;
  margin-bottom: 15px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const RefreshOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
  animation: fadeIn 0.2s ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const RefreshContent = styled.div`
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  .refresh-icon-spin {
    font-size: 24px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const RefreshText = styled.div`
  font-size: 14px;
  font-weight: 500;
`;

// Estilos mejorados para el botón de refresco
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
  transition: all 0.3s ease;

  &:hover {
    background-color: #138496;
  }

  &:disabled {
    cursor: not-allowed;
  }

  /* Estilo especial cuando está refrescando */
  &.refreshing {
    background-color: #6c757d;
    animation: pulse 2s infinite;
  }

  /* Animación para el ícono */
  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(23, 162, 184, 0.7);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(23, 162, 184, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(23, 162, 184, 0);
    }
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;
