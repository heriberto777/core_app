import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import { FaTrash, FaEye, FaSort, FaCrown, FaUsers } from "react-icons/fa";
import { TransferApi } from "../../api/index";

const api = new TransferApi();

const LinkedGroupsManager = ({
  accessToken,
  onGroupDeleted = null, // 👈 Hacer opcional con valor por defecto
  onClose = null, // 👈 También hacer opcional onClose
}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const data = await api.getLinkedGroups(accessToken);

      if (data.success) {
        setGroups(data.groups);
      } else {
        throw new Error(data.message || "Error al obtener grupos");
      }
    } catch (error) {
      console.error("Error al obtener grupos:", error);
      Swal.fire(
        "Error",
        "No se pudieron cargar los grupos vinculados",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const viewGroupDetails = async (groupName) => {
    try {
      const data = await api.getGroupDetails(accessToken, groupName);

      if (data.success) {
        showGroupDetailsModal(data);
      } else {
        throw new Error(data.message || "Error al obtener detalles");
      }
    } catch (error) {
      console.error("Error al obtener detalles:", error);
      Swal.fire(
        "Error",
        "No se pudieron cargar los detalles del grupo",
        "error"
      );
    }
  };

  const showGroupDetailsModal = (groupData) => {
    const tasksHtml = groupData.tasks
      .map(
        (task, index) => `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        margin: 5px 0;
        background-color: ${task.isCoordinator ? "#e8f5e8" : "#f8f9fa"};
        border-radius: 4px;
        border-left: 4px solid ${task.isCoordinator ? "#4caf50" : "#6c757d"};
      ">
        <div>
          <strong>${task.name}</strong>
          ${
            task.isCoordinator
              ? '<span style="color: #4caf50; margin-left: 10px;">👑 Coordinadora</span>'
              : ""
          }
          <br>
          <small>Orden: ${task.order} | Tipo: ${task.type}</small>
        </div>
        <button onclick="window.removeTaskFromGroupHandler('${
          task.id
        }')" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
        ">
          Quitar
        </button>
      </div>
    `
      )
      .join("");

    const coordinatorInfo = groupData.coordinator
      ? `
      <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 15px 0;">
        <h4 style="margin: 0 0 10px 0; color: #2e7d32;">👑 Tarea Coordinadora: ${groupData.coordinator.name}</h4>
        <p><strong>Post-Update Query:</strong></p>
        <code style="background: #f5f5f5; padding: 10px; display: block; border-radius: 4px;">${groupData.coordinator.postUpdateQuery}</code>
        <p><strong>Mapeo:</strong> ${groupData.coordinator.postUpdateMapping?.viewKey} → ${groupData.coordinator.postUpdateMapping?.tableKey}</p>
      </div>
    `
      : '<p style="color: #dc3545;">⚠️ Este grupo no tiene tarea coordinadora</p>';

    // Hacer disponible la función globalmente para los botones del modal
    window.removeTaskFromGroupHandler = (taskId) => {
      removeTaskFromGroup(taskId);
    };

    Swal.fire({
      title: `Grupo: ${groupData.groupName}`,
      html: `
        <div style="text-align: left;">
          <p><strong>Total de tareas:</strong> ${groupData.totalTasks}</p>

          ${coordinatorInfo}

          <h4>Tareas en el grupo:</h4>
          ${tasksHtml}

          <div style="margin-top: 20px; padding: 15px; background-color: #fff3cd; border-radius: 6px;">
            <strong>⚠️ Importante:</strong> Al quitar tareas del grupo, perderán su configuración de vinculación y post-update.
          </div>
        </div>
      `,
      width: "600px",
      showCancelButton: true,
      confirmButtonText: "Cerrar",
      cancelButtonText: "Eliminar Grupo Completo",
      cancelButtonColor: "#dc3545",
      willClose: () => {
        // Limpiar la función global al cerrar
        delete window.removeTaskFromGroupHandler;
      },
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) {
        deleteGroup(groupData.groupName);
      }
    });
  };

  const deleteGroup = async (groupName) => {
    const confirmation = await Swal.fire({
      title: "¿Eliminar grupo completo?",
      html: `
        <p>¿Estás seguro de que deseas eliminar el grupo <strong>"${groupName}"</strong>?</p>
        <div style="background-color: #f8d7da; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <strong>⚠️ Esta acción:</strong>
          <ul style="text-align: left; margin: 10px 0;">
            <li>Quitará la vinculación de todas las tareas del grupo</li>
            <li>Eliminará las configuraciones de post-update</li>
            <li>Restablecerá las tareas como individuales</li>
            <li><strong>NO SE PUEDE DESHACER</strong></li>
          </ul>
        </div>
        <p>Escribe <strong>"CONFIRMAR"</strong> para continuar:</p>
      `,
      input: "text",
      inputPlaceholder: "Escribe CONFIRMAR",
      showCancelButton: true,
      confirmButtonText: "Eliminar Grupo",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc3545",
      inputValidator: (value) => {
        if (value !== "CONFIRMAR") {
          return 'Debes escribir "CONFIRMAR" exactamente';
        }
      },
    });

    if (confirmation.isConfirmed) {
      try {
        const data = await api.deleteLinkedGroup(accessToken, groupName);

        if (data.success) {
          Swal.fire(
            "Eliminado",
            `Grupo "${groupName}" eliminado correctamente`,
            "success"
          );
          fetchGroups(); // Recargar la lista

          // 👈 VERIFICAR QUE EXISTE ANTES DE LLAMAR
          if (onGroupDeleted && typeof onGroupDeleted === "function") {
            console.log(
              "🔄 Notificando eliminación de grupo al componente padre"
            );
            onGroupDeleted();
          }
        } else {
          throw new Error(data.message || "Error al eliminar grupo");
        }
      } catch (error) {
        console.error("Error al eliminar grupo:", error);
        Swal.fire("Error", "No se pudo eliminar el grupo", "error");
      }
    }
  };

  const removeTaskFromGroup = async (taskId) => {
    try {
      const data = await api.removeTaskFromGroup(accessToken, taskId);

      if (data.success) {
        Swal.fire(
          "Removida",
          `Tarea removida del grupo correctamente`,
          "success"
        );
        fetchGroups(); // Recargar la lista

        // 👈 VERIFICAR QUE EXISTE ANTES DE LLAMAR
        if (onGroupDeleted && typeof onGroupDeleted === "function") {
          console.log("🔄 Notificando remoción de tarea al componente padre");
          onGroupDeleted();
        }
      } else {
        throw new Error(data.message || "Error al remover tarea");
      }
    } catch (error) {
      console.error("Error al remover tarea:", error);
      Swal.fire("Error", "No se pudo remover la tarea del grupo", "error");
    }
  };

  // Hacer disponible globalmente para los botones del modal
  window.removeTaskFromGroup = removeTaskFromGroup;

  if (loading) {
    return <LoadingContainer>Cargando grupos vinculados...</LoadingContainer>;
  }

  return (
    <Container>
      <Header>
        <h2>🔗 Gestión de Grupos Vinculados</h2>
        <p>Administra los grupos de tareas vinculadas y sus configuraciones</p>
      </Header>

      {groups.length === 0 ? (
        <EmptyState>
          <FaUsers size={48} color="#6c757d" />
          <h3>No hay grupos vinculados</h3>
          <p>
            Crea grupos vinculados editando las tareas y asignándoles el mismo
            nombre de grupo.
          </p>
        </EmptyState>
      ) : (
        <GroupsGrid>
          {groups.map((group) => (
            <GroupCard key={group.groupName}>
              <GroupHeader>
                <GroupName>{group.groupName}</GroupName>
                <GroupStats>
                  <StatBadge>
                    <FaUsers /> {group.totalTasks} tareas
                  </StatBadge>
                  <StatBadge $coordinator={group.coordinatorCount > 0}>
                    <FaCrown />{" "}
                    {group.coordinatorCount > 0
                      ? "Con coordinadora"
                      : "Sin coordinadora"}
                  </StatBadge>
                </GroupStats>
              </GroupHeader>

              <TasksList>
                {group.tasks.slice(0, 3).map((task) => (
                  <TaskItem key={task.id} $isCoordinator={task.isCoordinator}>
                    <TaskName>{task.name}</TaskName>
                    <TaskOrder>#{task.linkedExecutionOrder}</TaskOrder>
                    {task.isCoordinator && (
                      <CoordinatorBadge>👑</CoordinatorBadge>
                    )}
                  </TaskItem>
                ))}
                {group.totalTasks > 3 && (
                  <MoreTasks>+ {group.totalTasks - 3} más...</MoreTasks>
                )}
              </TasksList>

              <GroupActions>
                <ActionButton
                  $variant="info"
                  onClick={() => viewGroupDetails(group.groupName)}
                >
                  <FaEye /> Ver Detalles
                </ActionButton>
                <ActionButton
                  $variant="danger"
                  onClick={() => deleteGroup(group.groupName)}
                >
                  <FaTrash /> Eliminar Grupo
                </ActionButton>
              </GroupActions>
            </GroupCard>
          ))}
        </GroupsGrid>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h2 {
    margin: 0 0 10px 0;
    color: #333;
  }

  p {
    color: #666;
    margin: 0;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #666;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 50px 20px;
  color: #666;

  h3 {
    margin: 20px 0 10px 0;
  }
`;

const GroupsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
`;

const GroupCard = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.15);
  }
`;

const GroupHeader = styled.div`
  padding: 20px 20px 15px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
`;

const GroupName = styled.h3`
  margin: 0 0 10px 0;
  font-size: 18px;
  font-weight: 600;
`;

const GroupStats = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const StatBadge = styled.span`
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;

  ${(props) =>
    props.$coordinator &&
    `
    background: rgba(76, 175, 80, 0.8);
  `}
`;

const TasksList = styled.div`
  padding: 15px 20px;
`;

const TaskItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;

  ${(props) =>
    props.$isCoordinator &&
    `
    background-color: #f8fffe;
    margin: 0 -10px;
    padding: 8px 10px;
    border-radius: 4px;
    border-left: 3px solid #4caf50;
    border-bottom: none;
  `}

  &:last-child {
    border-bottom: none;
  }
`;

const TaskName = styled.span`
  font-size: 14px;
  flex: 1;
`;

const TaskOrder = styled.span`
  background: #e9ecef;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 12px;
  color: #495057;
`;

const CoordinatorBadge = styled.span`
  margin-left: 8px;
  font-size: 16px;
`;

const MoreTasks = styled.div`
  text-align: center;
  color: #6c757d;
  font-size: 13px;
  font-style: italic;
  margin-top: 10px;
`;

const GroupActions = styled.div`
  padding: 15px 20px;
  background: #f8f9fa;
  display: flex;
  gap: 10px;
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;

  ${(props) => {
    switch (props.$variant) {
      case "info":
        return `
          background: #17a2b8;
          color: white;
          &:hover { background: #138496; }
        `;
      case "danger":
        return `
          background: #dc3545;
          color: white;
          &:hover { background: #c82333; }
        `;
      default:
        return `
          background: #6c757d;
          color: white;
          &:hover { background: #5a6268; }
        `;
    }
  }}
`;

export default LinkedGroupsManager;
