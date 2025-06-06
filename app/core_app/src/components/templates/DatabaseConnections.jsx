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
                     placeholder="Ej: localhost, 192.168.1.100">
            </div>

            <div class="task-form-group">
              <label class="task-form-label">Puerto *</label>
              <input id="port" type="number" class="task-form-input" value="${
                connection?.port || ""
              }" 
                     placeholder="Ej: 1433 (SQL Server), 3306 (MySQL), 5432 (PostgreSQL)">
              <small class="task-form-help-text">Puerto por defecto: SQL Server: 1433, MySQL: 3306, PostgreSQL: 5432</small>
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

            <div class="task-form-group" id="instanceGroup" style="display: ${
              connection?.type === "mssql" ? "block" : "none"
            };">
              <label class="task-form-label">Instancia (SQL Server)</label>
              <input id="instance" class="task-form-input" value="${
                connection?.instance || ""
              }" 
                     placeholder="Ej: SQLEXPRESS">
              <small class="task-form-help-text">Solo requerido para instancias con nombre en SQL Server</small>
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
      customClass: {
        popup: "task-modal-popup",
        title: "task-modal-title",
        htmlContainer: "task-modal-html",
        actions: "task-modal-actions",
      },
      didOpen: () => {
        // Toggle password visibility
        const toggleBtn = document.getElementById("togglePassword");
        const passwordInput = document.getElementById("password");

        toggleBtn?.addEventListener("click", () => {
          const type = passwordInput.type === "password" ? "text" : "password";
          passwordInput.type = type;
          toggleBtn.innerHTML = `<i class="fa fa-${
            type === "password" ? "eye" : "eye-slash"
          }"></i>`;
        });

        // Show/hide specific fields based on database type
        const typeSelect = document.getElementById("type");
        const instanceGroup = document.getElementById("instanceGroup");
        const sslGroup = document.getElementById("sslGroup");
        const authSourceGroup = document.getElementById("authSourceGroup");

        const updateFieldsVisibility = () => {
          const selectedType = typeSelect.value;

          // Instance field only for SQL Server
          instanceGroup.style.display =
            selectedType === "mssql" ? "block" : "none";

          // SSL for PostgreSQL, MySQL, MariaDB
          sslGroup.style.display = ["postgres", "mysql", "mariadb"].includes(
            selectedType
          )
            ? "block"
            : "none";

          // Auth Source for MongoDB
          authSourceGroup.style.display =
            selectedType === "mongodb" ? "block" : "none";
        };

        typeSelect?.addEventListener("change", updateFieldsVisibility);
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

    function getFormData() {
      const serverName = document.getElementById("serverName").value.trim();
      const type = document.getElementById("type").value;
      const host = document.getElementById("host").value.trim();
      const port = parseInt(document.getElementById("port").value);
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

      // Validaciones
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

      if (!port || port < 1 || port > 65535) {
        Swal.showValidationMessage("Ingrese un puerto válido (1-65535)");
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

      return {
        serverName,
        type,
        host,
        port,
        user,
        password,
        database,
        instance,
        options: {
          encrypt,
          trustServerCertificate,
          ssl,
          authSource: type === "mongodb" ? authSource : null,
          useNewUrlParser: true,
          useUnifiedTopology: true,
          enableArithAbort: true,
        },
      };
    }

    if (formValues) {
      await saveConnection(formValues);
    }
  };

  // Probar conexión
  const testConnection = async (configData) => {
    try {
      Swal.fire({
        title: "Probando conexión...",
        text: "Verificando conectividad con el servidor",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await dbConfigApi.testConnection(accessToken, configData);

      if (result.success) {
        Swal.fire(
          "¡Conexión exitosa!",
          "La conexión a la base de datos se estableció correctamente",
          "success"
        );
      } else {
        Swal.fire(
          "Error de conexión",
          result.error || "No se pudo conectar a la base de datos",
          "error"
        );
      }
    } catch (error) {
      Swal.fire(
        "Error",
        error.message || "Error al probar la conexión",
        "error"
      );
    }
  };

  // Guardar conexión
  const saveConnection = async (configData) => {
    try {
      Swal.fire({
        title: "Guardando conexión...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await dbConfigApi.createDBConfig(accessToken, configData);

      if (result.message) {
        Swal.fire("¡Éxito!", result.message, "success");
        loadConnections(); // Recargar lista
      } else {
        throw new Error("Error desconocido al guardar");
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire(
        "Error",
        error.error || error.message || "No se pudo guardar la conexión",
        "error"
      );
    }
  };

  // Eliminar conexión
  const handleDeleteConnection = async (serverName) => {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar conexión?",
        text: `¿Está seguro de eliminar la conexión "${serverName}"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc3545",
        cancelButtonColor: "#6c757d",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        Swal.fire({
          title: "Eliminando conexión...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        await dbConfigApi.deleteDBConfig(accessToken, serverName);

        Swal.fire("Eliminado", "La conexión ha sido eliminada", "success");
        loadConnections(); // Recargar lista
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
      Swal.fire(
        "Error",
        error.error || error.message || "No se pudo eliminar la conexión",
        "error"
      );
    }
  };

  // Obtener icono según tipo de DB
  const getDBIcon = (type) => {
    const icons = {
      mssql: "🟦",
      mysql: "🐬",
      postgres: "🐘",
      mariadb: "🦭",
      mongodb: "🍃",
    };
    return icons[type] || "🗄️";
  };

  // Obtener color según tipo de DB
  const getDBColor = (type) => {
    const colors = {
      mssql: "#CC2927",
      mysql: "#4479A1",
      postgres: "#336791",
      mariadb: "#003545",
      mongodb: "#47A248",
    };
    return colors[type] || "#6c757d";
  };

  return (
    <Container>
      <Header>
        <h1>
          <FaDatabase /> Conexiones a Bases de Datos
        </h1>
        <p>Gestiona las conexiones a servidores de bases de datos</p>
      </Header>

      <ActionsBar>
        <Button onClick={() => showConnectionForm()}>
          <FaPlus /> Nueva Conexión
        </Button>
        <RefreshButton onClick={loadConnections} disabled={loading}>
          <FaSync className={loading ? "spinning" : ""} />
        </RefreshButton>
      </ActionsBar>

      {loading ? (
        <LoadingMessage>Cargando conexiones...</LoadingMessage>
      ) : (
        <>
          {connections.length === 0 ? (
            <EmptyMessage>
              <FaDatabase size={48} />
              <h3>No hay conexiones configuradas</h3>
              <p>Agregue su primera conexión a base de datos para comenzar</p>
              <Button onClick={() => showConnectionForm()}>
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
                          {connection.host}:{connection.port}
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
                          🔒 Encriptado
                        </SecurityBadge>
                      )}
                      {connection.options?.ssl && (
                        <SecurityBadge $type="ssl">🛡️ SSL</SecurityBadge>
                      )}
                    </SecurityBadges>
                  </CardBody>

                  <CardActions>
                    <ActionButton
                      $color="#17a2b8"
                      onClick={() => testConnection(connection)}
                      title="Probar conexión"
                    >
                      <FaVial />
                    </ActionButton>
                    <ActionButton
                      $color="#ffc107"
                      onClick={() => showConnectionForm(connection)}
                      title="Editar conexión"
                    >
                      <FaEdit />
                    </ActionButton>
                    <ActionButton
                      $color="#dc3545"
                      onClick={() =>
                        handleDeleteConnection(connection.serverName)
                      }
                      title="Eliminar conexión"
                    >
                      <FaTrash />
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

// Estilos
const Container = styled.div`
  padding: 20px;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h1 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary};
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background-color: ${({ theme }) => theme.primary};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s;

  &:hover {
    background-color: ${({ theme }) => theme.primaryHover};
    transform: translateY(-1px);
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 45px;
  height: 45px;
  background-color: ${({ theme }) => theme.secondary};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background-color: ${({ theme }) => theme.secondaryHover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

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
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: 60px;
  color: ${({ theme }) => theme.textSecondary};
  font-size: 18px;
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 60px;
  background-color: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  svg {
    color: ${({ theme }) => theme.textSecondary};
    margin-bottom: 20px;
  }

  h3 {
    margin: 20px 0 10px 0;
    color: ${({ theme }) => theme.title};
  }

  p {
    margin-bottom: 30px;
    color: ${({ theme }) => theme.textSecondary};
  }
`;

const ConnectionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const ConnectionCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s;
  border-left: 4px solid
    ${({ $type }) => {
      const colors = {
        mssql: "#CC2927",
        mysql: "#4479A1",
        postgres: "#336791",
        mariadb: "#003545",
        mongodb: "#47A248",
      };
      return colors[$type] || "#6c757d";
    }};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: ${({ theme }) => theme.tableHeader};
`;

const DBTypeIcon = styled.div`
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
`;

const ServerName = styled.h3`
  margin: 0 0 5px 0;
  color: ${({ theme }) => theme.title};
  font-size: 16px;
`;

const DBType = styled.span`
  color: ${({ $color }) => $color};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CardBody = styled.div`
  padding: 20px;
`;

const ConnectionInfo = styled.div`
  margin-bottom: 15px;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: ${({ theme }) => theme.text};
  font-size: 14px;

  svg {
    color: ${({ theme }) => theme.textSecondary};
    width: 14px;
  }
`;

const SecurityBadges = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const SecurityBadge = styled.span`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  background-color: ${({ $type }) =>
    $type === "encrypt" ? "#e3f2fd" : "#f3e5f5"};
  color: ${({ $type }) => ($type === "encrypt" ? "#1976d2" : "#7b1fa2")};
`;

const CardActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 15px 20px;
  background: ${({ theme }) => theme.bg};
  border-top: 1px solid ${({ theme }) => theme.border};
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  height: 35px;
  background: none;
  border: 1px solid ${({ $color }) => $color};
  color: ${({ $color }) => $color};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${({ $color }) => $color};
    color: white;
    transform: scale(1.05);
  }
`;
