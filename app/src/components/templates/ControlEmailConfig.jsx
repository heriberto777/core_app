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
  FaStar,
  FaRegStar,
  FaVial,
  FaCog,
  FaEnvelope,
  FaServer,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import { useAuth, useFetchData, Header } from "../../index";
import { EmailConfigApi } from "../../api/index";

const emailConfigApi = new EmailConfigApi();

export function ControlEmailConfig() {
  const [openstate, setOpenState] = useState(false);
  const { accessToken, user } = useAuth();
  const FETCH_INTERVAL = 5000;

  const fetchEmailConfigsCallback = useCallback(
    async (options = {}) => {
      try {
        const result = await emailConfigApi.getConfigs(accessToken);
        return result;
      } catch (error) {
        console.error("Error al obtener configuraciones de email:", error);
        throw error;
      }
    },
    [accessToken]
  );

  const {
    data: emailConfigs,
    loading,
    refreshing: configsRefreshing,
    loadingState,
    error,
    refetch: fetchEmailConfigs,
  } = useFetchData(fetchEmailConfigsCallback, [accessToken], {
    autoRefresh: true,
    refreshInterval: FETCH_INTERVAL,
    enableCache: true,
    cacheTime: 60000,
    initialData: [],
  });

  const handleAdd = () => {
    Swal.fire({
      title: "Agregar Configuración de Email",
      html: `
        <div class="email-config-form">
          <div class="form-group">
            <label for="name">Nombre de configuración *</label>
            <input id="name" class="swal2-input" placeholder="Ej: Gmail Corporativo">
          </div>

          <div class="form-group">
            <label for="host">Servidor SMTP *</label>
            <input id="host" class="swal2-input" placeholder="Ej: smtp.gmail.com">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="port">Puerto *</label>
              <input id="port" type="number" class="swal2-input" value="587" placeholder="587">
            </div>
            <div class="form-check">
              <input type="checkbox" id="secure" class="swal2-checkbox">
              <label for="secure">Conexión segura (SSL)</label>
            </div>
          </div>

          <div class="form-group">
            <label for="authUser">Usuario/Email *</label>
            <input id="authUser" type="email" class="swal2-input" placeholder="usuario@ejemplo.com">
          </div>

          <div class="form-group">
            <label for="authPass">Contraseña *</label>
            <input id="authPass" type="password" class="swal2-input" placeholder="Contraseña o App Password">
          </div>

          <div class="form-group">
            <label for="fromEmail">Dirección de envío *</label>
            <input id="fromEmail" class="swal2-input" placeholder='"Sistema de Transferencia" <noreply@ejemplo.com>'>
          </div>

          <div class="form-check">
            <input type="checkbox" id="isDefault" class="swal2-checkbox">
            <label for="isDefault">Establecer como configuración por defecto</label>
          </div>

          <div class="form-check">
            <input type="checkbox" id="isActive" class="swal2-checkbox" checked>
            <label for="isActive">Activar configuración</label>
          </div>
        </div>

        <style>
          .email-config-form { text-align: left; }
          .form-group { margin-bottom: 15px; }
          .form-row { display: flex; gap: 10px; align-items: end; }
          .form-check { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .swal2-input { margin: 0 !important; }
        </style>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      width: 600,
      preConfirm: () => {
        const name = Swal.getPopup().querySelector("#name").value;
        const host = Swal.getPopup().querySelector("#host").value;
        const port = parseInt(Swal.getPopup().querySelector("#port").value);
        const secure = Swal.getPopup().querySelector("#secure").checked;
        const authUser = Swal.getPopup().querySelector("#authUser").value;
        const authPass = Swal.getPopup().querySelector("#authPass").value;
        const fromEmail = Swal.getPopup().querySelector("#fromEmail").value;
        const isDefault = Swal.getPopup().querySelector("#isDefault").checked;
        const isActive = Swal.getPopup().querySelector("#isActive").checked;

        // Validaciones
        if (!name) {
          Swal.showValidationMessage(
            "Por favor ingrese un nombre para la configuración"
          );
          return false;
        }

        if (!host) {
          Swal.showValidationMessage("Por favor ingrese el servidor SMTP");
          return false;
        }

        if (!port || port < 1 || port > 65535) {
          Swal.showValidationMessage(
            "Por favor ingrese un puerto válido (1-65535)"
          );
          return false;
        }

        if (!authUser) {
          Swal.showValidationMessage("Por favor ingrese el usuario/email");
          return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(authUser)) {
          Swal.showValidationMessage(
            "Por favor ingrese un email válido para el usuario"
          );
          return false;
        }

        if (!authPass) {
          Swal.showValidationMessage("Por favor ingrese la contraseña");
          return false;
        }

        if (!fromEmail) {
          Swal.showValidationMessage("Por favor ingrese la dirección de envío");
          return false;
        }

        return {
          name,
          host,
          port,
          secure,
          auth: {
            user: authUser,
            pass: authPass,
          },
          from: fromEmail,
          isDefault,
          isActive,
        };
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Guardando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          await emailConfigApi.createConfig(accessToken, result.value);
          await fetchEmailConfigs();

          Swal.fire(
            "¡Guardado!",
            "La configuración de email ha sido agregada correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al agregar configuración:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo agregar la configuración",
            "error"
          );
        }
      }
    });
  };

  const handleEdit = (config) => {
    Swal.fire({
      title: "Editar Configuración de Email",
      html: `
        <div class="email-config-form">
          <div class="form-group">
            <label for="name">Nombre de configuración *</label>
            <input id="name" class="swal2-input" value="${
              config.name
            }" placeholder="Ej: Gmail Corporativo">
          </div>

          <div class="form-group">
            <label for="host">Servidor SMTP *</label>
            <input id="host" class="swal2-input" value="${
              config.host
            }" placeholder="Ej: smtp.gmail.com">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="port">Puerto *</label>
              <input id="port" type="number" class="swal2-input" value="${
                config.port
              }" placeholder="587">
            </div>
            <div class="form-check">
              <input type="checkbox" id="secure" class="swal2-checkbox" ${
                config.secure ? "checked" : ""
              }>
              <label for="secure">Conexión segura (SSL)</label>
            </div>
          </div>

          <div class="form-group">
            <label for="authUser">Usuario/Email *</label>
            <input id="authUser" type="email" class="swal2-input" value="${
              config.auth?.user || ""
            }" placeholder="usuario@ejemplo.com">
          </div>

          <div class="form-group">
            <label for="authPass">Contraseña *</label>
            <input id="authPass" type="password" class="swal2-input" placeholder="Dejar vacío para mantener actual">
          </div>

          <div class="form-group">
            <label for="fromEmail">Dirección de envío *</label>
            <input id="fromEmail" class="swal2-input" value="${
              config.from
            }" placeholder='"Sistema de Transferencia" <noreply@ejemplo.com>'>
          </div>

          <div class="form-check">
            <input type="checkbox" id="isActive" class="swal2-checkbox" ${
              config.isActive ? "checked" : ""
            }>
            <label for="isActive">Activar configuración</label>
          </div>
        </div>

        <style>
          .email-config-form { text-align: left; }
          .form-group { margin-bottom: 15px; }
          .form-row { display: flex; gap: 10px; align-items: end; }
          .form-check { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .swal2-input { margin: 0 !important; }
        </style>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      width: 600,
      preConfirm: () => {
        const name = Swal.getPopup().querySelector("#name").value;
        const host = Swal.getPopup().querySelector("#host").value;
        const port = parseInt(Swal.getPopup().querySelector("#port").value);
        const secure = Swal.getPopup().querySelector("#secure").checked;
        const authUser = Swal.getPopup().querySelector("#authUser").value;
        const authPass = Swal.getPopup().querySelector("#authPass").value;
        const fromEmail = Swal.getPopup().querySelector("#fromEmail").value;
        const isActive = Swal.getPopup().querySelector("#isActive").checked;

        // Validaciones
        if (!name) {
          Swal.showValidationMessage(
            "Por favor ingrese un nombre para la configuración"
          );
          return false;
        }

        if (!host) {
          Swal.showValidationMessage("Por favor ingrese el servidor SMTP");
          return false;
        }

        if (!port || port < 1 || port > 65535) {
          Swal.showValidationMessage(
            "Por favor ingrese un puerto válido (1-65535)"
          );
          return false;
        }

        if (!authUser) {
          Swal.showValidationMessage("Por favor ingrese el usuario/email");
          return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(authUser)) {
          Swal.showValidationMessage(
            "Por favor ingrese un email válido para el usuario"
          );
          return false;
        }

        if (!fromEmail) {
          Swal.showValidationMessage("Por favor ingrese la dirección de envío");
          return false;
        }

        const updateData = {
          name,
          host,
          port,
          secure,
          auth: {
            user: authUser,
          },
          from: fromEmail,
          isActive,
        };

        // Solo incluir contraseña si se proporcionó una nueva
        if (authPass) {
          updateData.auth.pass = authPass;
        }

        return updateData;
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Actualizando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          await emailConfigApi.updateConfig(
            accessToken,
            config._id,
            result.value
          );
          await fetchEmailConfigs();

          Swal.fire(
            "¡Actualizado!",
            "La configuración de email ha sido actualizada correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al actualizar configuración:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo actualizar la configuración",
            "error"
          );
        }
      }
    });
  };

  const handleDelete = (id, name) => {
    Swal.fire({
      title: "¿Estás seguro?",
      text: `¿Deseas eliminar la configuración "${name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Eliminando...",
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            },
          });

          await emailConfigApi.deleteConfig(accessToken, id);
          await fetchEmailConfigs();

          Swal.fire(
            "¡Eliminado!",
            "La configuración ha sido eliminada correctamente.",
            "success"
          );
        } catch (error) {
          console.error("Error al eliminar configuración:", error);
          Swal.fire(
            "Error",
            error.message || "No se pudo eliminar la configuración",
            "error"
          );
        }
      }
    });
  };

  const handleToggle = async (id, currentStatus, name) => {
    try {
      Swal.fire({
        title: `${currentStatus ? "Desactivando" : "Activando"}...`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      await emailConfigApi.toggleStatus(accessToken, id);
      await fetchEmailConfigs();

      Swal.fire(
        "Estado Actualizado",
        `La configuración "${name}" ha sido ${
          currentStatus ? "desactivada" : "activada"
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

  const handleSetDefault = async (id, name) => {
    try {
      const confirm = await Swal.fire({
        title: "Establecer como predeterminada",
        text: `¿Deseas establecer "${name}" como la configuración predeterminada?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, establecer",
        cancelButtonText: "Cancelar",
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({
        title: "Actualizando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      await emailConfigApi.setAsDefault(accessToken, id);
      await fetchEmailConfigs();

      Swal.fire(
        "¡Actualizado!",
        `"${name}" es ahora la configuración predeterminada.`,
        "success"
      );
    } catch (error) {
      console.error("Error al establecer configuración por defecto:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudo establecer como predeterminada",
        "error"
      );
    }
  };

  const handleTestConfig = async (id, name) => {
    const { value: testEmail } = await Swal.fire({
      title: "Probar Configuración",
      text: `Ingresa el email donde enviar la prueba para "${name}":`,
      input: "email",
      inputPlaceholder: "correo@ejemplo.com",
      showCancelButton: true,
      confirmButtonText: "Enviar Prueba",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value) {
          return "¡Debes ingresar un email!";
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return "Ingresa un email válido";
        }
      },
    });

    if (testEmail) {
      try {
        Swal.fire({
          title: "Enviando prueba...",
          text: "Esto puede tomar unos segundos",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const result = await emailConfigApi.testConfig(
          accessToken,
          id,
          testEmail
        );

        if (result.success) {
          Swal.fire(
            "¡Prueba Exitosa!",
            `El correo de prueba fue enviado a ${testEmail}. Revisa tu bandeja de entrada.`,
            "success"
          );
        } else {
          Swal.fire(
            "Prueba Fallida",
            result.message || "No se pudo enviar el correo de prueba",
            "error"
          );
        }
      } catch (error) {
        console.error("Error al probar configuración:", error);
        Swal.fire(
          "Error",
          error.message || "No se pudo realizar la prueba",
          "error"
        );
      }
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      const confirm = await Swal.fire({
        title: "Inicializar configuraciones por defecto",
        text: "¿Deseas crear las configuraciones por defecto del sistema?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, inicializar",
        cancelButtonText: "Cancelar",
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({
        title: "Inicializando...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      await emailConfigApi.initializeDefaults(accessToken);
      await fetchEmailConfigs();

      Swal.fire(
        "¡Inicializado!",
        "Las configuraciones por defecto han sido creadas correctamente.",
        "success"
      );
    } catch (error) {
      console.error("Error al inicializar configuraciones:", error);
      Swal.fire(
        "Error",
        error.message || "No se pudieron inicializar las configuraciones",
        "error"
      );
    }
  };

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <h2>Control de Configuraciones de Email</h2>
          <p>
            Configura los servidores SMTP para el envío de notificaciones por
            correo electrónico.
          </p>
        </InfoSection>
      </ToolbarContainer>

      <section className="main-content">
        <ActionsContainer>
          <AddButton onClick={handleAdd}>
            <FaPlus /> Agregar Configuración
          </AddButton>
          <RefreshButton
            onClick={fetchEmailConfigs}
            refreshing={configsRefreshing}
            className={configsRefreshing ? "refreshing" : ""}
          >
            <FaSync className={configsRefreshing ? "spinning" : ""} />
            {configsRefreshing ? "Actualizando..." : "Refrescar"}
          </RefreshButton>
          <DefaultsButton onClick={handleInitializeDefaults}>
            <FaCog /> Inicializar por defecto
          </DefaultsButton>
        </ActionsContainer>
      </section>

      <section className="main-content" style={{ position: "relative" }}>
        {configsRefreshing && (
          <RefreshOverlay>
            <RefreshContent>
              <FaSync className="refresh-icon-spin" />
              <RefreshText>Actualizando configuraciones...</RefreshText>
            </RefreshContent>
          </RefreshOverlay>
        )}

        {loading && !configsRefreshing && (
          <LoadingContainer>
            <LoadingMessage>
              Cargando configuraciones de email...
            </LoadingMessage>
          </LoadingContainer>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {!loading && !configsRefreshing && emailConfigs.length === 0 && (
          <EmptyMessage>
            No hay configuraciones de email. Haga clic en "Agregar
            Configuración" para crear una.
          </EmptyMessage>
        )}

        {emailConfigs.length > 0 && (
          <TableContainer>
            <StyledTable>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Servidor SMTP</th>
                  <th>Puerto</th>
                  <th>Usuario</th>
                  <th>SSL</th>
                  <th>Estado</th>
                  <th>Por Defecto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {emailConfigs.map((config) => (
                  <tr
                    key={config._id}
                    className={!config.isActive ? "disabled" : ""}
                  >
                    <td>
                      <ConfigName $isDefault={config.isDefault}>
                        {config.isDefault && <FaStar />}
                        {config.name}
                      </ConfigName>
                    </td>
                    <td>
                      <ServerInfo>
                        <FaServer />
                        {config.host}
                      </ServerInfo>
                    </td>
                    <td>
                      <PortBadge $secure={config.secure}>
                        {config.port}
                        {config.secure && " (SSL)"}
                      </PortBadge>
                    </td>
                    <td>
                      <EmailInfo>
                        <FaEnvelope />
                        {config.auth?.user}
                      </EmailInfo>
                    </td>
                    <td>
                      {config.secure ? (
                        <CheckIcon>✓</CheckIcon>
                      ) : (
                        <CrossIcon>✗</CrossIcon>
                      )}
                    </td>
                    <td>
                      <StatusIcon $active={config.isActive}>
                        {config.isActive ? (
                          <span title="Configuración activa">Activa</span>
                        ) : (
                          <span title="Configuración inactiva">Inactiva</span>
                        )}
                      </StatusIcon>
                    </td>
                    <td>
                      {config.isDefault ? (
                        <DefaultBadge>
                          <FaStar /> Predeterminada
                        </DefaultBadge>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td>
                      <ActionButtons>
                        <ActionButton
                          title="Editar"
                          onClick={() => handleEdit(config)}
                        >
                          <FaEdit />
                        </ActionButton>

                        <ActionButton
                          title="Probar configuración"
                          color="#17a2b8"
                          onClick={() =>
                            handleTestConfig(config._id, config.name)
                          }
                        >
                          <FaVial />
                        </ActionButton>

                        {!config.isDefault && (
                          <ActionButton
                            title="Establecer como predeterminada"
                            color="#ffc107"
                            onClick={() =>
                              handleSetDefault(config._id, config.name)
                            }
                          >
                            <FaRegStar />
                          </ActionButton>
                        )}

                        <ActionButton
                          title={
                            config.isActive
                              ? "Desactivar configuración"
                              : "Activar configuración"
                          }
                          color={config.isActive ? "#ffa500" : "#28a745"}
                          onClick={() =>
                            handleToggle(
                              config._id,
                              config.isActive,
                              config.name
                            )
                          }
                        >
                          {config.isActive ? <FaToggleOn /> : <FaToggleOff />}
                        </ActionButton>

                        <ActionButton
                          title="Eliminar"
                          color="#dc3545"
                          onClick={() => handleDelete(config._id, config.name)}
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
  margin-bottom: 20px;

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
    justify-content: center;
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

  &.refreshing {
    opacity: 0.7;
  }

  @media (max-width: 480px) {
    width: 100%;
    justify-content: center;
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
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #5a6268;
  }

  @media (max-width: 480px) {
    width: 100%;
    justify-content: center;
  }
`;

const TableContainer = styled.div`
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  overflow-x: auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  -webkit-overflow-scrolling: touch;

  @media (max-width: 576px) {
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
  flex-wrap: wrap;
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
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: ${(props) => props.hoverColor || props.color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
    transform: scale(1.1);
  }
`;

const CheckIcon = styled.span`
  color: #28a745;
  font-weight: bold;
  font-size: 18px;
`;

const CrossIcon = styled.span`
  color: #dc3545;
  font-weight: bold;
  font-size: 18px;
`;

const StatusIcon = styled.div`
  color: ${(props) => (props.$active ? "#28a745" : "#dc3545")};
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 5px;
`;

const ConfigName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: ${(props) => (props.$isDefault ? "bold" : "normal")};
  color: ${(props) => (props.$isDefault ? "#ffc107" : "inherit")};

  svg {
    color: #ffc107;
  }
`;

const ServerInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    color: #6c757d;
  }
`;

const EmailInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    color: #007bff;
  }
`;

const PortBadge = styled.span`
  background-color: ${(props) => (props.$secure ? "#28a745" : "#6c757d")};
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
`;

const DefaultBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  color: #ffc107;
  font-weight: bold;
  font-size: 12px;
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

  .spinning {
    animation: spin 1s linear infinite;
  }
`;

const RefreshText = styled.div`
  font-size: 14px;
  font-weight: 500;
`;
