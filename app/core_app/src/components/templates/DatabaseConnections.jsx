import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useAuth, DBConfigApi } from "../../index";
import Swal from "sweetalert2";
import {
  FaDatabase,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSync,
  FaCheck,
  FaTimes,
  FaServer,
  FaVial,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

const dbConfigApi = new DBConfigApi();

// Styled Components
const Container = styled.div`
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
`;

const Title = styled.h1`
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 28px;
  margin: 0;
`;

const ActionsBar = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;

  &.primary {
    background: linear-gradient(135deg, #3498db, #2980b9);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #2980b9, #1f3a93);
      transform: translateY(-2px);
    }
  }

  &.secondary {
    background: #ecf0f1;
    color: #2c3e50;

    &:hover {
      background: #d5dbdb;
    }
  }
`;

const RefreshButton = styled(Button)`
  &.spinning svg {
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

const LoadingMessage = styled.div`
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
  font-size: 18px;
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;

  svg {
    margin-bottom: 20px;
    color: #bdc3c7;
  }

  h3 {
    margin: 20px 0 10px 0;
    color: #2c3e50;
  }

  p {
    margin-bottom: 30px;
    line-height: 1.6;
  }
`;

const ConnectionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
`;

const ConnectionCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${(props) => getDBColor(props.$type)};
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  gap: 12px;
`;

const DBTypeIcon = styled.div`
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(52, 152, 219, 0.1);
`;

const ServerName = styled.h3`
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
`;

const DBType = styled.span`
  background: ${(props) => props.$color};
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
`;

const CardBody = styled.div`
  margin-bottom: 15px;
`;

const ConnectionInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7f8c8d;
  font-size: 14px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const SecurityBadges = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 15px;
`;

const SecurityBadge = styled.span`
  background: ${(props) => {
    switch (props.$type) {
      case "encrypt":
        return "#27ae60";
      case "ssl":
        return "#3498db";
      case "trust":
        return "#f39c12";
      default:
        return "#95a5a6";
    }
  }};
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: bold;
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const ActionButton = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;

  &.test {
    background: #3498db;
    color: white;

    &:hover {
      background: #2980b9;
    }
  }

  &.edit {
    background: #f39c12;
    color: white;

    &:hover {
      background: #d68910;
    }
  }

  &.delete {
    background: #e74c3c;
    color: white;

    &:hover {
      background: #c0392b;
    }
  }
`;

// Funciones auxiliares
const getDBIcon = (type) => {
  const icons = {
    mssql: "🗃️",
    mysql: "🐬",
    postgres: "🐘",
    mongodb: "🍃",
    mariadb: "🦭",
  };
  return icons[type] || "🗄️";
};

const getDBColor = (type) => {
  const colors = {
    mssql: "#CC2927",
    mysql: "#4479A1",
    postgres: "#336791",
    mongodb: "#47A248",
    mariadb: "#003545",
  };
  return colors[type] || "#7f8c8d";
};

export function DatabaseConnections() {
  const { accessToken } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar configuraciones
  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      const result = await dbConfigApi.getDBConfigs(accessToken);
      setConnections(result || []);
    } catch (error) {
      console.error("Error al cargar conexiones:", error);
      Swal.fire("Error", "No se pudieron cargar las conexiones", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      loadConnections();
    }
  }, [loadConnections]);

  // Formulario para crear/editar conexión
  const showConnectionForm = async (connection = null) => {
    const isEdit = !!connection;
    const title = isEdit ? "Editar Conexión" : "Nueva Conexión a Base de Datos";

    const { value: formValues } = await Swal.fire({
      title,
      html: `
        <div class="task-form-container">
          <div class="task-form-section">
            <h4 class="task-form-section-title">Información del Servidor</h4>

            <div class="task-form-group">
              <label class="task-form-label">Nombre del Servidor *</label>
              <input id="serverName" class="task-form-input" value="${
                connection?.serverName || ""
              }"
                     placeholder="Ej: SERVIDOR_PRINCIPAL" ${
                       isEdit ? "readonly" : ""
                     }>
              <small class="task-form-help-text">Identificador único para esta conexión</small>
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Tipo de Base de Datos *</label>
              <select id="type" class="task-form-select">
                <option value="">Seleccione un tipo</option>
                <option value="mssql" ${
                  connection?.type === "mssql" ? "selected" : ""
                }>SQL Server (MSSQL)</option>
                <option value="mysql" ${
                  connection?.type === "mysql" ? "selected" : ""
                }>MySQL</option>
                <option value="postgres" ${
                  connection?.type === "postgres" ? "selected" : ""
                }>PostgreSQL</option>
                <option value="mariadb" ${
                  connection?.type === "mariadb" ? "selected" : ""
                }>MariaDB</option>
                <option value="mongodb" ${
                  connection?.type === "mongodb" ? "selected" : ""
                }>MongoDB</option>
              </select>
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Host/Dirección IP *</label>
              <input id="host" class="task-form-input" value="${
                connection?.host || ""
              }"
                     placeholder="Ej: localhost, 192.168.1.100, servidor.dominio.com">
            </div>

            <!-- CAMPO INSTANCIA MOVIDO AQUÍ para mejor UX -->
            <div class="task-form-group" id="instanceGroup" style="display: ${
              connection?.type === "mssql" ? "block" : "none"
            };">
              <label class="task-form-label">Instancia de SQL Server</label>
              <input id="instance" class="task-form-input" value="${
                connection?.instance || ""
              }"
                     placeholder="Ej: SQLEXPRESS, CALIDADSTDB">
              <small class="task-form-help-text">
                <strong>Importante:</strong> Si especifica una instancia, el puerto se detectará automáticamente.
                Deje el puerto en blanco para instancias nombradas.
              </small>
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Puerto</label>
              <input id="port" type="number" class="task-form-input" value="${
                connection?.port || ""
              }"
                     placeholder="Ej: 1433 (SQL Server), 3306 (MySQL), 5432 (PostgreSQL)">
              <small class="task-form-help-text" id="portHelp">
                Puerto por defecto: SQL Server: 1433, MySQL: 3306, PostgreSQL: 5432<br>
                <span id="instanceWarning" style="color: #f39c12; display: none;">
                  ⚠️ Cuando usa instancia nombrada, el puerto es opcional (SQL Server usa puertos dinámicos)
                </span>
              </small>
            </div>
          </div>

          <div class="task-form-section">
            <h4 class="task-form-section-title">Credenciales de Acceso</h4>

            <div class="task-form-group">
              <label class="task-form-label">Usuario *</label>
              <input id="user" class="task-form-input" value="${
                connection?.user || ""
              }"
                     placeholder="Nombre de usuario">
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Contraseña *</label>
              <div style="position: relative;">
                <input id="password" type="password" class="task-form-input"
                       value="${
                         connection?.password || ""
                       }" placeholder="Contraseña">
                <button type="button" id="togglePassword" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer;">
                  <i class="fa fa-eye"></i>
                </button>
              </div>
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Base de Datos *</label>
              <input id="database" class="task-form-input" value="${
                connection?.database || ""
              }"
                     placeholder="Nombre de la base de datos">
            </div>
          </div>

          <div class="task-form-section">
            <h4 class="task-form-section-title">Opciones Avanzadas</h4>

            <div class="task-form-checkbox-container">
              <input type="checkbox" id="encrypt" ${
                connection?.options?.encrypt !== false ? "checked" : ""
              }>
              <label class="task-form-checkbox-label" for="encrypt">Encriptar conexión</label>
            </div>

            <div class="task-form-checkbox-container">
              <input type="checkbox" id="trustServerCertificate" ${
                connection?.options?.trustServerCertificate !== false
                  ? "checked"
                  : ""
              }>
              <label class="task-form-checkbox-label" for="trustServerCertificate">Confiar en certificado del servidor</label>
            </div>

            <div class="task-form-checkbox-container" id="sslGroup" style="display: ${
              ["postgres", "mysql", "mariadb"].includes(connection?.type)
                ? "block"
                : "none"
            };">
              <input type="checkbox" id="ssl" ${
                connection?.options?.ssl ? "checked" : ""
              }>
              <label class="task-form-checkbox-label" for="ssl">Usar SSL</label>
            </div>

            <div class="task-form-group" id="authSourceGroup" style="display: ${
              connection?.type === "mongodb" ? "block" : "none"
            };">
              <label class="task-form-label">Auth Source (MongoDB)</label>
              <input id="authSource" class="task-form-input" value="${
                connection?.options?.authSource || "admin"
              }"
                     placeholder="admin">
            </div>
          </div>
        </div>
      `,
      width: 700,
      showCancelButton: true,
      confirmButtonText: isEdit ? "Actualizar Conexión" : "Crear Conexión",
      cancelButtonText: "Cancelar",
      showDenyButton: true,
      denyButtonText: "Probar Conexión",
      didOpen: () => {
        // Función para actualizar visibilidad de campos
        const updateFieldsVisibility = () => {
          const selectedType = document.getElementById("type").value;
          const instanceGroup = document.getElementById("instanceGroup");
          const sslGroup = document.getElementById("sslGroup");
          const authSourceGroup = document.getElementById("authSourceGroup");
          const instanceWarning = document.getElementById("instanceWarning");
          const portField = document.getElementById("port");
          const instanceField = document.getElementById("instance");

          // Mostrar/ocultar campo de instancia para SQL Server
          instanceGroup.style.display =
            selectedType === "mssql" ? "block" : "none";

          // SSL para PostgreSQL, MySQL, MariaDB
          sslGroup.style.display = ["postgres", "mysql", "mariadb"].includes(
            selectedType
          )
            ? "block"
            : "none";

          // Auth Source para MongoDB
          authSourceGroup.style.display =
            selectedType === "mongodb" ? "block" : "none";

          // Manejar warning de instancia para SQL Server
          if (selectedType === "mssql") {
            const checkInstanceWarning = () => {
              const hasInstance = instanceField.value.trim() !== "";
              instanceWarning.style.display = hasInstance ? "inline" : "none";

              // Auto-llenar puerto por defecto si no hay instancia
              if (!hasInstance && !portField.value) {
                portField.value = "1433";
              }
            };

            instanceField.addEventListener("input", checkInstanceWarning);
            checkInstanceWarning(); // Verificar inicialmente
          }
        };

        // Configurar toggle de contraseña
        const togglePassword = document.getElementById("togglePassword");
        const passwordField = document.getElementById("password");

        togglePassword?.addEventListener("click", () => {
          const type =
            passwordField.getAttribute("type") === "password"
              ? "text"
              : "password";
          passwordField.setAttribute("type", type);
          togglePassword.innerHTML =
            type === "password"
              ? '<i class="fa fa-eye"></i>'
              : '<i class="fa fa-eye-slash"></i>';
        });

        // Configurar evento de cambio de tipo
        const typeSelect = document.getElementById("type");
        typeSelect?.addEventListener("change", updateFieldsVisibility);

        // Inicializar visibilidad
        updateFieldsVisibility();
      },
      preConfirm: () => {
        return getFormData();
      },
      preDeny: async () => {
        const testData = getFormData();
        if (testData) {
          await testConnection(testData);
        }
        return false; // Prevent closing the dialog
      },
    });

    // FUNCIÓN MEJORADA DE VALIDACIÓN
    function getFormData() {
      const serverName = document.getElementById("serverName").value.trim();
      const type = document.getElementById("type").value;
      const host = document.getElementById("host").value.trim();
      const portValue = document.getElementById("port").value.trim();
      const user = document.getElementById("user").value.trim();
      const password = document.getElementById("password").value;
      const database = document.getElementById("database").value.trim();
      const instance =
        document.getElementById("instance")?.value.trim() || null;
      const encrypt = document.getElementById("encrypt").checked;
      const trustServerCertificate = document.getElementById(
        "trustServerCertificate"
      ).checked;
      const ssl = document.getElementById("ssl")?.checked || false;
      const authSource =
        document.getElementById("authSource")?.value.trim() || "admin";

      // Validaciones básicas
      if (!serverName) {
        Swal.showValidationMessage("El nombre del servidor es obligatorio");
        return false;
      }

      if (!type) {
        Swal.showValidationMessage("Debe seleccionar un tipo de base de datos");
        return false;
      }

      if (!host) {
        Swal.showValidationMessage("La dirección del host es obligatoria");
        return false;
      }

      if (!user) {
        Swal.showValidationMessage("El usuario es obligatorio");
        return false;
      }

      if (!password) {
        Swal.showValidationMessage("La contraseña es obligatoria");
        return false;
      }

      if (!database) {
        Swal.showValidationMessage(
          "El nombre de la base de datos es obligatorio"
        );
        return false;
      }

      // VALIDACIÓN ESPECIAL PARA PUERTO
      let port = null;

      if (portValue !== "") {
        port = parseInt(portValue);
        if (isNaN(port) || port < 1 || port > 65535) {
          Swal.showValidationMessage(
            "El puerto debe ser un número válido entre 1 y 65535"
          );
          return false;
        }
      }

      // LÓGICA ESPECIAL PARA SQL SERVER CON INSTANCIA
      if (type === "mssql") {
        if (instance && instance !== "") {
          // Si hay instancia nombrada, el puerto es opcional
          console.log(
            `SQL Server con instancia nombrada: ${instance}. Puerto: ${
              port || "automático"
            }`
          );
        } else if (!port) {
          // Si no hay instancia, el puerto es obligatorio
          Swal.showValidationMessage(
            "Para SQL Server sin instancia, debe especificar un puerto (generalmente 1433)"
          );
          return false;
        }
      } else {
        // Para otros tipos de BD, el puerto es obligatorio
        if (!port) {
          const defaultPorts = {
            mysql: 3306,
            postgres: 5432,
            mongodb: 27017,
            mariadb: 3306,
          };

          Swal.showValidationMessage(
            `El puerto es obligatorio para ${type.toUpperCase()}. Puerto por defecto: ${
              defaultPorts[type] || "consulte documentación"
            }`
          );
          return false;
        }
      }

      return {
        serverName,
        type,
        host,
        port, // Puede ser null para instancias nombradas de SQL Server
        user,
        password,
        database,
        instance,
        options: {
          encrypt,
          trustServerCertificate,
          ssl,
          authSource: type === "mongodb" ? authSource : undefined,
        },
      };
    }

    // Función para probar conexión
    async function testConnection(connectionData) {
      try {
        Swal.fire({
          title: "Probando conexión...",
          text: "Por favor espere mientras se verifica la conexión",
          allowOutsideClick: false,
          showConfirmButton: false,
          willOpen: () => {
            Swal.showLoading();
          },
        });

        const result = await dbConfigApi.testConnection(
          connectionData,
          accessToken
        );

        if (result.success) {
          Swal.fire({
            icon: "success",
            title: "¡Conexión exitosa!",
            text: "La configuración es correcta y la conexión funciona",
            timer: 3000,
          });
        } else {
          Swal.fire({
            icon: "error",
            title: "Error de conexión",
            text: result.message || "No se pudo establecer la conexión",
          });
        }
      } catch (error) {
        console.error("Error al probar conexión:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "Error al probar la conexión: " + error.message,
        });
      }
    }

    // Procesar resultado del formulario
    if (formValues) {
      try {
        // Usar createDBConfig tanto para crear como para editar
        const result = await dbConfigApi.createDBConfig(
          formValues,
          accessToken
        );

        if (result.message) {
          const message = isEdit ? "actualizada" : "creada";
          Swal.fire(
            "¡Éxito!",
            `La conexión ha sido ${message} correctamente`,
            "success"
          );
        } else {
          throw new Error("Error desconocido al guardar");
        }

        await loadConnections();
      } catch (error) {
        console.error("Error al guardar conexión:", error);
        const action = isEdit ? "actualizar" : "crear";
        Swal.fire(
          "Error",
          `Error al ${action} la conexión: ${error.message}`,
          "error"
        );
      }
    }
  };

  // Función para probar conexión existente
  const testConnection = async (connection) => {
    try {
      Swal.fire({
        title: "Probando conexión...",
        text: `Verificando conexión a ${connection.serverName}`,
        allowOutsideClick: false,
        showConfirmButton: false,
        willOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await dbConfigApi.testConnection(connection, accessToken);

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: "¡Conexión exitosa!",
          text: `La conexión a ${connection.serverName} funciona correctamente`,
          timer: 3000,
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Error de conexión",
          text: result.message || "No se pudo establecer la conexión",
        });
      }
    } catch (error) {
      console.error("Error al probar conexión:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Error al probar la conexión: " + error.message,
      });
    }
  };

  // Función para eliminar conexión
  const deleteConnection = async (connection) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: `Se eliminará la conexión "${connection.serverName}". Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e74c3c",
      cancelButtonColor: "#95a5a6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        // Usar serverName en lugar de _id para eliminar
        const deleteResult = await dbConfigApi.deleteDBConfig(
          connection.serverName,
          accessToken
        );

        if (deleteResult.message) {
          Swal.fire(
            "¡Eliminado!",
            "La conexión ha sido eliminada correctamente",
            "success"
          );
          await loadConnections();
        } else {
          throw new Error("Error desconocido al eliminar");
        }
      } catch (error) {
        console.error("Error al eliminar conexión:", error);
        Swal.fire(
          "Error",
          "Error al eliminar la conexión: " + error.message,
          "error"
        );
      }
    }
  };

  return (
    <Container>
      <Header>
        <Title>
          <FaDatabase />
          Configuración de Bases de Datos
        </Title>
        <ActionsBar>
          <Button className="primary" onClick={() => showConnectionForm()}>
            <FaPlus />
            Nueva Conexión
          </Button>
          <RefreshButton
            className={`secondary ${loading ? "spinning" : ""}`}
            onClick={loadConnections}
            disabled={loading}
          >
            <FaSync className={loading ? "spinning" : ""} />
          </RefreshButton>
        </ActionsBar>
      </Header>

      {loading ? (
        <LoadingMessage>Cargando conexiones...</LoadingMessage>
      ) : (
        <>
          {connections.length === 0 ? (
            <EmptyMessage>
              <FaDatabase size={48} />
              <h3>No hay conexiones configuradas</h3>
              <p>Agregue su primera conexión a base de datos para comenzar</p>
              <Button className="primary" onClick={() => showConnectionForm()}>
                <FaPlus /> Crear Primera Conexión
              </Button>
            </EmptyMessage>
          ) : (
            <ConnectionsGrid>
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.serverName}
                  $type={connection.type}
                >
                  <CardHeader>
                    <DBTypeIcon>{getDBIcon(connection.type)}</DBTypeIcon>
                    <div>
                      <ServerName>{connection.serverName}</ServerName>
                      <DBType $color={getDBColor(connection.type)}>
                        {connection.type.toUpperCase()}
                      </DBType>
                    </div>
                  </CardHeader>

                  <CardBody>
                    <ConnectionInfo>
                      <InfoItem>
                        <FaServer />
                        <span>
                          {connection.host}
                          {connection.port ? `:${connection.port}` : ""}
                        </span>
                      </InfoItem>
                      <InfoItem>
                        <FaDatabase />
                        <span>{connection.database}</span>
                      </InfoItem>
                      {connection.instance && (
                        <InfoItem>
                          <span>📋</span>
                          <span>Instancia: {connection.instance}</span>
                        </InfoItem>
                      )}
                    </ConnectionInfo>

                    <SecurityBadges>
                      {connection.options?.encrypt && (
                        <SecurityBadge $type="encrypt">
                          Encriptado
                        </SecurityBadge>
                      )}
                      {connection.options?.ssl && (
                        <SecurityBadge $type="ssl">SSL</SecurityBadge>
                      )}
                      {connection.options?.trustServerCertificate && (
                        <SecurityBadge $type="trust">
                          Certificado Confiable
                        </SecurityBadge>
                      )}
                    </SecurityBadges>
                  </CardBody>

                  <CardActions>
                    <ActionButton
                      className="test"
                      onClick={() => testConnection(connection)}
                    >
                      <FaVial />
                      Probar
                    </ActionButton>
                    <ActionButton
                      className="edit"
                      onClick={() => showConnectionForm(connection)}
                    >
                      <FaEdit />
                      Editar
                    </ActionButton>
                    <ActionButton
                      className="delete"
                      onClick={() => deleteConnection(connection)}
                    >
                      <FaTrash />
                      Eliminar
                    </ActionButton>
                  </CardActions>
                </ConnectionCard>
              ))}
            </ConnectionsGrid>
          )}
        </>
      )}
    </Container>
  );
}
