import React, { useState } from "react";
import { TransferApi, useAuth } from "../../index";
import Swal from "sweetalert2";
import { FaCog } from "react-icons/fa";
import styled from "styled-components";

const cnnApi = new TransferApi();

// Estilos para SweetAlert2
const scheduleManagerStyles = `
  .schedule-manager-form {
    text-align: left;
    max-width: 500px;
    margin: 0 auto;
  }
  
  .toggle-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .toggle-label {
    font-weight: 500;
    font-size: 16px;
  }
  
  .toggle-button {
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 30px;
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  
  .toggle-button.active {
    background-color: #28a745;
  }
  
  .divider {
    border: 0;
    border-top: 1px solid #eee;
    margin: 20px 0;
  }
  
  .time-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .time-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
  }
  
  .time-input {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 16px;
  }
  
  .time-input.disabled {
    background-color: #f5f5f5;
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .next-execution {
    background-color: rgba(108, 117, 125, 0.05);
    border-radius: 8px;
    padding: 15px;
    margin: 15px 0;
  }
  
  .next-execution.active {
    background-color: rgba(0, 123, 255, 0.05);
  }
  
  .next-run-label {
    font-weight: 500;
    margin-bottom: 5px;
  }
  
  .next-run-time {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  
  .schedule-description {
    font-size: 14px;
    color: #666;
  }
  
  .info-section {
    margin-top: 25px;
    border-top: 1px dashed #ddd;
    padding-top: 15px;
  }
  
  .info-section h4 {
    font-size: 16px;
    margin-bottom: 10px;
    color: #17a2b8;
  }
  
  .info-section p {
    font-size: 14px;
    margin: 8px 0;
  }
`;

// Componente principal de botón de configuración
export function ScheduleConfigButton({ disabled = false, onSuccess }) {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const openScheduleModal = async () => {
    setLoading(true);

    try {
      // Obtener la configuración actual
      const response = await cnnApi.getSchuledTime(accessToken);
      const currentHour = response?.hour || "02:00";
      const currentEnabled = response?.enabled !== false;

      showConfigModal(currentHour, currentEnabled);
    } catch (error) {
      console.error("Error fetching schedule config:", error);
      // Mostrar el modal con valores por defecto si hay error
      showConfigModal("02:00", true);
    } finally {
      setLoading(false);
    }
  };

  const showConfigModal = (initialTime, initialEnabled) => {
    // Variables locales para el estado del modal
    let modalTime = initialTime;
    let modalEnabled = initialEnabled;

    // Format next execution time
    const getNextExecutionDisplay = () => {
      if (!modalEnabled) {
        return "Programación automática desactivada";
      }

      const [hours, minutes] = modalTime.split(":").map(Number);
      const nextRun = new Date();
      nextRun.setHours(hours, minutes, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (nextRun < new Date()) {
        nextRun.setDate(nextRun.getDate() + 1);
      }

      const formattedTime = nextRun.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const formattedDate = nextRun.toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      return `${formattedTime} - ${formattedDate}`;
    };

    // Generate HTML for the modal
    const generateHTML = () => {
      return `
        <div class="schedule-manager-form">
          <div class="toggle-section">
            <div class="toggle-label">Activar ejecución automática</div>
            <button id="toggleScheduler" class="toggle-button ${
              modalEnabled ? "active" : "inactive"
            }">
              ${
                modalEnabled
                  ? '<i class="fa fa-play"></i> Activado'
                  : '<i class="fa fa-pause"></i> Desactivado'
              }
            </button>
          </div>
          
          <hr class="divider" />
          
          <div class="time-section">
            <div class="time-label">
              <i class="fa fa-clock"></i> Hora de ejecución diaria:
            </div>
            <input 
              id="timeInput" 
              type="time" 
              value="${modalTime}" 
              ${!modalEnabled ? "disabled" : ""}
              class="time-input ${!modalEnabled ? "disabled" : ""}"
            />
          </div>
          
          <div class="next-execution ${modalEnabled ? "active" : "inactive"}">
            <div class="next-run-label">Próxima ejecución:</div>
            <div class="next-run-time">${getNextExecutionDisplay()}</div>
            <div class="schedule-description">
              ${
                modalEnabled
                  ? 'A la hora programada, se ejecutarán automáticamente todas las tareas configuradas como "automáticas" o "ambas".'
                  : "La ejecución automática está desactivada. Las tareas tendrán que ser ejecutadas manualmente."
              }
            </div>
          </div>
          
          <div class="info-section">
            <h4>Información Adicional</h4>
            <p>El planificador automático ejecutará todas las tareas configuradas como <strong>automáticas</strong> a la hora especificada cada día.</p>
            <p>Las tareas con tipo <strong>manual</strong> no se ejecutarán automáticamente, independientemente de esta configuración.</p>
            <p>Si desactiva la ejecución automática, las tareas seguirán disponibles, pero no se ejecutarán por sí solas.</p>
          </div>
        </div>
      `;
    };

    // Show SweetAlert modal
    Swal.fire({
      title: "Gestión de Programación Automática",
      html: generateHTML(),
      width: 600,
      showCancelButton: true,
      confirmButtonText: "Guardar Configuración",
      cancelButtonText: "Cancelar",
      showLoaderOnConfirm: true,
      didOpen: (popup) => {
        // Add CSS styles
        const style = document.createElement("style");
        style.innerHTML = scheduleManagerStyles;
        document.head.appendChild(style);

        // Set up event handlers
        const timeInput = popup.querySelector("#timeInput");
        const toggleButton = popup.querySelector("#toggleScheduler");
        const nextExecution = popup.querySelector(".next-execution");
        const scheduleDescription = popup.querySelector(
          ".schedule-description"
        );
        const nextRunTime = popup.querySelector(".next-run-time");

        // Handle time change
        if (timeInput) {
          timeInput.addEventListener("change", (e) => {
            modalTime = e.target.value;
            // Update next execution time display
            if (nextRunTime) {
              nextRunTime.textContent = getNextExecutionDisplay();
            }
          });
        }

        // Handle toggle button
        if (toggleButton) {
          toggleButton.addEventListener("click", () => {
            modalEnabled = !modalEnabled;

            // Update UI
            toggleButton.classList.toggle("active");
            toggleButton.classList.toggle("inactive");

            if (toggleButton.classList.contains("active")) {
              toggleButton.innerHTML = '<i class="fas fa-play"></i> Activado';
              if (timeInput) {
                timeInput.disabled = false;
                timeInput.classList.remove("disabled");
              }
            } else {
              toggleButton.innerHTML =
                '<i class="fas fa-pause"></i> Desactivado';
              if (timeInput) {
                timeInput.disabled = true;
                timeInput.classList.add("disabled");
              }
            }

            // Update next execution display
            if (nextExecution) {
              nextExecution.classList.toggle("active", modalEnabled);
              nextExecution.classList.toggle("inactive", !modalEnabled);
            }

            // Update description text
            if (scheduleDescription) {
              scheduleDescription.textContent = modalEnabled
                ? 'A la hora programada, se ejecutarán automáticamente todas las tareas configuradas como "automáticas" o "ambas".'
                : "La ejecución automática está desactivada. Las tareas tendrán que ser ejecutadas manualmente.";
            }

            // Update next execution time
            if (nextRunTime) {
              nextRunTime.textContent = getNextExecutionDisplay();
            }
          });
        }
      },
      preConfirm: async () => {
        try {
          // Save configuration with local modal values
          const result = await cnnApi.addTimeTransfer(accessToken, {
            hour: modalTime,
            enabled: modalEnabled,
          });

          if (result) {
            return {
              success: true,
              hour: modalTime,
              enabled: modalEnabled,
              message: `Configuración guardada correctamente. Las tareas ${
                modalEnabled
                  ? `se ejecutarán automáticamente todos los días a las ${modalTime}.`
                  : "automáticas han sido desactivadas."
              }`,
            };
          } else {
            throw new Error("No se pudo actualizar la configuración.");
          }
        } catch (error) {
          console.error("Error saving configuration:", error);
          Swal.showValidationMessage(error.message || "Error desconocido");
          return { success: false };
        }
      },
    }).then((result) => {
      if (result.isConfirmed && result.value?.success) {
        Swal.fire("Configuración Guardada", result.value.message, "success");

        // Notificar al componente padre (si se proporcionó un callback)
        if (onSuccess && typeof onSuccess === "function") {
          onSuccess(result.value);
        }
      }
    });
  };

  return (
    <StyledButton onClick={openScheduleModal} disabled={disabled || loading}>
      <FaCog /> {loading ? "Cargando..." : "Configuración Avanzada"}
    </StyledButton>
  );
}

// Función para abrir el modal desde cualquier componente
export function openScheduleConfigModal(accessToken, onSuccess) {
  // Verificar que tenemos un token de acceso
  if (!accessToken) {
    console.error(
      "Se requiere accessToken para abrir el modal de configuración"
    );
    return;
  }

  // Crear un div temporal y renderizar el componente en él
  const tempDiv = document.createElement("div");
  document.body.appendChild(tempDiv);

  // Obtener la configuración actual
  cnnApi
    .getSchuledTime(accessToken)
    .then((response) => {
      const currentHour = response?.hour || "02:00";
      const currentEnabled = response?.enabled !== false;

      // Variables locales para el estado del modal
      let modalTime = currentHour;
      let modalEnabled = currentEnabled;

      // Format next execution time
      const getNextExecutionDisplay = () => {
        if (!modalEnabled) {
          return "Programación automática desactivada";
        }

        const [hours, minutes] = modalTime.split(":").map(Number);
        const nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);

        // If the time has already passed today, schedule for tomorrow
        if (nextRun < new Date()) {
          nextRun.setDate(nextRun.getDate() + 1);
        }

        const formattedTime = nextRun.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const formattedDate = nextRun.toLocaleDateString([], {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

        return `${formattedTime} - ${formattedDate}`;
      };

      // Generate HTML for the modal
      const generateHTML = () => {
        return `
          <div class="schedule-manager-form">
            <div class="toggle-section">
              <div class="toggle-label">Activar ejecución automática</div>
              <button id="toggleScheduler" class="toggle-button ${
                modalEnabled ? "active" : "inactive"
              }">
                ${
                  modalEnabled
                    ? '<i class="fa fa-play"></i> Activado'
                    : '<i class="fa fa-pause"></i> Desactivado'
                }
              </button>
            </div>
            
            <hr class="divider" />
            
            <div class="time-section">
              <div class="time-label">
                <i class="fa fa-clock"></i> Hora de ejecución diaria:
              </div>
              <input 
                id="timeInput" 
                type="time" 
                value="${modalTime}" 
                ${!modalEnabled ? "disabled" : ""}
                class="time-input ${!modalEnabled ? "disabled" : ""}"
              />
            </div>
            
            <div class="next-execution ${modalEnabled ? "active" : "inactive"}">
              <div class="next-run-label">Próxima ejecución:</div>
              <div class="next-run-time">${getNextExecutionDisplay()}</div>
              <div class="schedule-description">
                ${
                  modalEnabled
                    ? 'A la hora programada, se ejecutarán automáticamente todas las tareas configuradas como "automáticas" o "ambas".'
                    : "La ejecución automática está desactivada. Las tareas tendrán que ser ejecutadas manualmente."
                }
              </div>
            </div>
            
            <div class="info-section">
              <h4>Información Adicional</h4>
              <p>El planificador automático ejecutará todas las tareas configuradas como <strong>automáticas</strong> a la hora especificada cada día.</p>
              <p>Las tareas con tipo <strong>manual</strong> no se ejecutarán automáticamente, independientemente de esta configuración.</p>
              <p>Si desactiva la ejecución automática, las tareas seguirán disponibles, pero no se ejecutarán por sí solas.</p>
            </div>
          </div>
        `;
      };

      // Show SweetAlert modal
      Swal.fire({
        title: "Gestión de Programación Automática",
        html: generateHTML(),
        width: 600,
        showCancelButton: true,
        confirmButtonText: "Guardar Configuración",
        cancelButtonText: "Cancelar",
        showLoaderOnConfirm: true,
        didOpen: (popup) => {
          // Add CSS styles
          const style = document.createElement("style");
          style.innerHTML = scheduleManagerStyles;
          document.head.appendChild(style);

          // Set up event handlers
          const timeInput = popup.querySelector("#timeInput");
          const toggleButton = popup.querySelector("#toggleScheduler");
          const nextExecution = popup.querySelector(".next-execution");
          const scheduleDescription = popup.querySelector(
            ".schedule-description"
          );
          const nextRunTime = popup.querySelector(".next-run-time");

          // Handle time change
          if (timeInput) {
            timeInput.addEventListener("change", (e) => {
              modalTime = e.target.value;
              // Update next execution time display
              if (nextRunTime) {
                nextRunTime.textContent = getNextExecutionDisplay();
              }
            });
          }

          // Handle toggle button
          if (toggleButton) {
            toggleButton.addEventListener("click", () => {
              modalEnabled = !modalEnabled;

              // Update UI
              toggleButton.classList.toggle("active");
              toggleButton.classList.toggle("inactive");

              if (toggleButton.classList.contains("active")) {
                toggleButton.innerHTML = '<i class="fas fa-play"></i> Activado';
                if (timeInput) {
                  timeInput.disabled = false;
                  timeInput.classList.remove("disabled");
                }
              } else {
                toggleButton.innerHTML =
                  '<i class="fas fa-pause"></i> Desactivado';
                if (timeInput) {
                  timeInput.disabled = true;
                  timeInput.classList.add("disabled");
                }
              }

              // Update next execution display
              if (nextExecution) {
                nextExecution.classList.toggle("active", modalEnabled);
                nextExecution.classList.toggle("inactive", !modalEnabled);
              }

              // Update description text
              if (scheduleDescription) {
                scheduleDescription.textContent = modalEnabled
                  ? 'A la hora programada, se ejecutarán automáticamente todas las tareas configuradas como "automáticas" o "ambas".'
                  : "La ejecución automática está desactivada. Las tareas tendrán que ser ejecutadas manualmente.";
              }

              // Update next execution time
              if (nextRunTime) {
                nextRunTime.textContent = getNextExecutionDisplay();
              }
            });
          }
        },
        preConfirm: async () => {
          try {
            // Save configuration with local modal values
            const result = await cnnApi.addTimeTransfer(accessToken, {
              hour: modalTime,
              enabled: modalEnabled,
            });

            if (result) {
              return {
                success: true,
                hour: modalTime,
                enabled: modalEnabled,
                message: `Configuración guardada correctamente. Las tareas ${
                  modalEnabled
                    ? `se ejecutarán automáticamente todos los días a las ${modalTime}.`
                    : "automáticas han sido desactivadas."
                }`,
              };
            } else {
              throw new Error("No se pudo actualizar la configuración.");
            }
          } catch (error) {
            console.error("Error saving configuration:", error);
            Swal.showValidationMessage(error.message || "Error desconocido");
            return { success: false };
          }
        },
      }).then((result) => {
        if (result.isConfirmed && result.value?.success) {
          Swal.fire("Configuración Guardada", result.value.message, "success");

          // Notificar al componente padre (si se proporcionó un callback)
          if (onSuccess && typeof onSuccess === "function") {
            onSuccess(result.value);
          }
        }

        // Limpiar el div temporal
        document.body.removeChild(tempDiv);
      });
    })
    .catch((error) => {
      console.error("Error fetching schedule config:", error);

      // Limpiar el div temporal en caso de error
      document.body.removeChild(tempDiv);

      Swal.fire("Error", "No se pudo cargar la configuración", "error");
    });
}

// Styled component para el botón
const StyledButton = styled.button`
  background-color: #6f42c1;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  margin-left: 10px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a36a5;
  }

  &:disabled {
    background-color: #a18cc9;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    width: 100%;
    margin-left: 0;
  }
`;
