import styled from "styled-components";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaPlus,
  FaSync,
} from "react-icons/fa";
import { EmailRecipientApi, useAuth, useFetchData, Header } from "../../index";

const cnnApi = new EmailRecipientApi();

export function ControlPlanilla() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken, user } = useAuth();
  const FETCH_INTERVAL = 5000;

  const fetchControlCallback = useCallback(
    async (options = {}) => {
      try {
        const result = await cnnApi.getRecipients(accessToken);
        return result;
      } catch (error) {
        console.error("Error al obtener tareas:", error);
        throw error; // Permitir que el hook maneje el error
      }
    },
    [accessToken]
  );

  const {
    data: recipients,
    loading,
    refreshing: tasksRefreshing,
    loadingState,
    error,
    refetch: fetchRecipients,
  } = useFetchData(fetchControlCallback, [accessToken], {
    autoRefresh: true,
    refreshInterval: FETCH_INTERVAL,
    enableCache: true,
    cacheTime: 60000, // 1 minuto
    initialData: [],
  });

  const handleAdd = () => {
    Swal.fire({
      title: "Agregar Destinatario",
      html: `
        <div class="form-group">
          <label for="name">Nombre</label>
          <input id="name" class="swal2-input" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label for="email">Correo electrónico</label>
          <input id="email" class="swal2-input" placeholder="correo@ejemplo.com">
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifTraspaso" class="swal2-checkbox">
          <label for="notifTraspaso">Recibir notificaciones de Traspasos</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifTransferencias" class="swal2-checkbox">
          <label for="notifTransferencias">Recibir notificaciones de Transferencias</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifErrores" class="swal2-checkbox">
          <label for="notifErrores">Recibir notificaciones de Errores Críticos</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="isSend" class="swal2-checkbox" checked>
          <label for="isSend">Activar envío de correos</label>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = Swal.getPopup().querySelector("#name").value;
        const email = Swal.getPopup().querySelector("#email").value;
        const notifTraspaso =
          Swal.getPopup().querySelector("#notifTraspaso").checked;
        const notifTransferencias = Swal.getPopup().querySelector(
          "#notifTransferencias"
        ).checked;
        const notifErrores =
          Swal.getPopup().querySelector("#notifErrores").checked;
        const isSend = Swal.getPopup().querySelector("#isSend").checked;

        if (!name) {
          Swal.showValidationMessage("Por favor ingrese un nombre");
          return false;
        }

        if (!email) {
          Swal.showValidationMessage("Por favor ingrese un correo electrónico");
          return false;
        }

        // Validar formato de correo
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          Swal.showValidationMessage("Ingrese un correo electrónico válido");
          return false;
        }

        return {
          name,
          email,
          notificationTypes: {
            traspaso: notifTraspaso,
            transferencias: notifTransferencias,
            erroresCriticos: notifErrores,
          },
          isSend,
        };
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Mostrar indicador de carga
          Swal.fire({
            title: "Guardando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          // Crear el destinatario usando la API
          const response = await recipientApi.createRecipient(
            accessToken,
            result.value
          );

          // Refrescar la lista
          await fetchRecipients();

          // Mostrar mensaje de éxito
          Swal.fire(
            "¡Guardado!",
            "El destinatario ha sido agregado correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al agregar destinatario:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo agregar el destinatario",
            "error"
          );
        }
      }
    });
  };

  const handleEdit = (recipient) => {
    Swal.fire({
      title: "Editar Destinatario",
      html: `
        <div class="form-group">
          <label for="name">Nombre</label>
          <input id="name" class="swal2-input" value="${
            recipient.name
          }" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label for="email">Correo electrónico</label>
          <input id="email" class="swal2-input" value="${
            recipient.email
          }" placeholder="correo@ejemplo.com">
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifTraspaso" class="swal2-checkbox" ${
            recipient.notificationTypes?.traspaso ? "checked" : ""
          }>
          <label for="notifTraspaso">Recibir notificaciones de Traspasos</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifTransferencias" class="swal2-checkbox" ${
            recipient.notificationTypes?.transferencias ? "checked" : ""
          }>
          <label for="notifTransferencias">Recibir notificaciones de Transferencias</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="notifErrores" class="swal2-checkbox" ${
            recipient.notificationTypes?.erroresCriticos ? "checked" : ""
          }>
          <label for="notifErrores">Recibir notificaciones de Errores Críticos</label>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = Swal.getPopup().querySelector("#name").value;
        const email = Swal.getPopup().querySelector("#email").value;
        const notifTraspaso =
          Swal.getPopup().querySelector("#notifTraspaso").checked;
        const notifTransferencias = Swal.getPopup().querySelector(
          "#notifTransferencias"
        ).checked;
        const notifErrores =
          Swal.getPopup().querySelector("#notifErrores").checked;

        if (!name) {
          Swal.showValidationMessage("Por favor ingrese un nombre");
          return false;
        }

        if (!email) {
          Swal.showValidationMessage("Por favor ingrese un correo electrónico");
          return false;
        }

        // Validar formato de correo
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          Swal.showValidationMessage("Ingrese un correo electrónico válido");
          return false;
        }

        return {
          name,
          email,
          notificationTypes: {
            traspaso: notifTraspaso,
            transferencias: notifTransferencias,
            erroresCriticos: notifErrores,
          },
        };
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Mostrar indicador de carga
          Swal.fire({
            title: "Actualizando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          // Actualizar el destinatario usando la API
          await recipientApi.updateRecipient(
            accessToken,
            recipient._id,
            result.value
          );

          // Refrescar la lista
          await fetchRecipients();

          // Mostrar mensaje de éxito
          Swal.fire(
            "¡Actualizado!",
            "El destinatario ha sido actualizado correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al actualizar destinatario:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo actualizar el destinatario",
            "error"
          );
        }
      }
    });
  };

  const handleDelete = (id, name) => {
    Swal.fire({
      title: "¿Estás seguro?",
      text: `¿Deseas eliminar al destinatario "${name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Mostrar indicador de carga
          Swal.fire({
            title: "Eliminando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          // Eliminar usando la API
          await recipientApi.deleteRecipient(accessToken, id);

          // Refrescar la lista
          await fetchRecipients();

          // Mostrar mensaje de éxito
          Swal.fire(
            "¡Eliminado!",
            "El destinatario ha sido eliminado correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al eliminar destinatario:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo eliminar el destinatario",
            "error"
          );
        }
      }
    });
  };

  const handleToggle = async (id, currentStatus, name) => {
    try {
      // Mostrar indicador de carga
      Swal.fire({
        title: `${currentStatus ? "Desactivando" : "Activando"}...`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Cambiar estado usando la API
      await recipientApi.toggleSendStatus(accessToken, id);

      // Refrescar la lista
      await fetchRecipients();

      // Mostrar mensaje de éxito
      Swal.fire(
        "Estado Actualizado",
        `El envío de correos a "${name}" ha sido ${
          currentStatus ? "desactivado" : "activado"
        }.`,
        "success"
      );
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo cambiar el estado",
        "error"
      );
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      // Confirmación
      const confirm = await Swal.fire({
        title: "Inicializar destinatarios por defecto",
        text: "¿Deseas crear los destinatarios por defecto del sistema?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, inicializar",
        cancelButtonText: "Cancelar",
      });

      if (!confirm.isConfirmed) return;

      // Mostrar indicador de carga
      Swal.fire({
        title: "Inicializando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Llamar a la API
      await recipientApi.initializeDefaults(accessToken);

      // Refrescar la lista
      await fetchRecipients();

      // Mostrar mensaje de éxito
      Swal.fire(
        "¡Inicializado!",
        "Los destinatarios por defecto han sido creados correctamente.",
        "success"
      );
    } catch (error) {
      console.error("Error al inicializar destinatarios:", error);
      Swal.fire(
        "Error",
        error.message ||
          "No se pudieron inicializar los destinatarios por defecto",
        "error"
      );
    }
  };

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <h2>Control de Destinatarios de Correo</h2>
          <p>
            Configura qué usuarios recibirán notificaciones por correo
            electrónico del sistema.
          </p>
        </InfoSection>
      </ToolbarContainer>

      <section className="main-content">
        <ActionsContainer>
          <AddButton onClick={handleAdd}>
            <FaPlus /> Agregar Destinatario
          </AddButton>
          <RefreshButton
            onClick={fetchRecipients}
            refreshing={tasksRefreshing}
            label="Recargar"
            className={tasksRefreshing ? "refreshing" : ""}
          >
            <FaSync className={tasksRefreshing ? "spinning" : ""} />
            {tasksRefreshing ? "Actualizando..." : "Refrescar"}
          </RefreshButton>
          <DefaultsButton onClick={handleInitializeDefaults}>
            Inicializar por defecto
          </DefaultsButton>
        </ActionsContainer>
      </section>

      <section className="main-content" style={{ position: "relative" }}>
        {tasksRefreshing && (
          <RefreshOverlay>
            <RefreshContent>
              <FaSync className="refresh-icon-spin" />
              <RefreshText>Actualizando tareas...</RefreshText>
            </RefreshContent>
          </RefreshOverlay>
        )}
        {loading && !tasksRefreshing && (
          <LoadingContainer>
            <LoadingMessage>Cargando destinatarios...</LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !tasksRefreshing && recipients.length === 0 && (
          <EmptyMessage>
            No hay destinatarios configurados. Haga clic en "Agregar
            Destinatario" para crear uno.
          </EmptyMessage>
        )}

        {recipients.length > 0 && (
          <TableContainer>
            <StyledTable>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo Electrónico</th>
                  <th>Traspasos</th>
                  <th>Transferencias</th>
                  <th>Errores</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr
                    key={recipient._id}
                    className={!recipient.isSend ? "disabled" : ""}
                  >
                    <td>{recipient.name}</td>
                    <td>{recipient.email}</td>
                    <td>
                      {recipient.notificationTypes?.traspaso ? (
                        <CheckIcon>✓</CheckIcon>
                      ) : (
                        <CrossIcon>✗</CrossIcon>
                      )}
                    </td>
                    <td>
                      {recipient.notificationTypes?.transferencias ? (
                        <CheckIcon>✓</CheckIcon>
                      ) : (
                        <CrossIcon>✗</CrossIcon>
                      )}
                    </td>
                    <td>
                      {recipient.notificationTypes?.erroresCriticos ? (
                        <CheckIcon>✓</CheckIcon>
                      ) : (
                        <CrossIcon>✗</CrossIcon>
                      )}
                    </td>
                    <td>
                      <StatusIcon $active={recipient.isSend}>
                        {recipient.isSend ? (
                          <span title="Envío activo">Activo</span>
                        ) : (
                          <span title="Envío desactivado">Inactivo</span>
                        )}
                      </StatusIcon>
                    </td>
                    <td>
                      <ActionButtons>
                        <ActionButton
                          title="Editar"
                          onClick={() => handleEdit(recipient)}
                        >
                          <FaEdit />
                        </ActionButton>

                        <ActionButton
                          title={
                            recipient.isSend
                              ? "Desactivar envío"
                              : "Activar envío"
                          }
                          color={recipient.isSend ? "#ffa500" : "#28a745"}
                          onClick={() =>
                            handleToggle(
                              recipient._id,
                              recipient.isSend,
                              recipient.name
                            )
                          }
                        >
                          {recipient.isSend ? <FaToggleOn /> : <FaToggleOff />}
                        </ActionButton>

                        <ActionButton
                          title="Eliminar"
                          color="#dc3545"
                          onClick={() =>
                            handleDelete(recipient._id, recipient.name)
                          }
                        >
                          <FaTrash />
                        </ActionButton>
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

const Container = styled.div`
  min-height: 100vh;
  padding: 15px;
  width: 100%;
  background-color: ${(props) => props.theme.bg};
  color: ${({ theme }) => theme.text};
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
  justify-content: center;
  align-items: center;
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

const ActionsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }

  @media (max-width: 480px) {
    flex-direction: column;
  }
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

const DefaultsButton = styled.button`
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 15px;
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
    color: ${(props) => props.hoverColor || props.color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
  }
`;

const CheckIcon = styled.span`
  color: #28a745;
  font-weight: bold;
`;

const CrossIcon = styled.span`
  color: #dc3545;
  font-weight: bold;
`;

const StatusIcon = styled.div`
  color: ${(props) => (props.$active ? "#28a745" : "#dc3545")};
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 5px;
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
