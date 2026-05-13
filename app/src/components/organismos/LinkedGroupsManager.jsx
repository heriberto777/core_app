import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { FaTrash, FaEye, FaSort, FaCrown, FaUsers, FaSync, FaLink, FaLayerGroup } from "react-icons/fa";
import { TransferTaskApi, Button } from "../../index";

const api = new TransferTaskApi();

const LinkedGroupsManager = ({
  accessToken,
  onGroupDeleted = null,
  onClose = null,
}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (accessToken) {
      fetchGroups();
    }
  }, [accessToken]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!accessToken) throw new Error("No hay token de acceso");

      const data = await api.getLinkedGroups(accessToken);
      let groupsList = [];
      if (Array.isArray(data)) groupsList = data;
      else if (data && data.success) groupsList = data.data?.groups || data.groups || [];
      else if (data && data.data && Array.isArray(data.data)) groupsList = data.data;
      else throw new Error(data?.message || data?.error || "Formato de respuesta inválido");

      setGroups(groupsList);
    } catch (error) {
      console.error("❌ Error al obtener grupos:", error);
      setError(error.message || "No se pudieron cargar los grupos vinculados");
    } finally {
      setLoading(false);
    }
  };

  const viewGroupDetails = async (groupName) => {
    try {
      if (onClose) onClose();
      const data = await api.getGroupDetails(accessToken, groupName);
      if (data && (data.success || data.groupName || data.tasks)) showGroupDetailsModal(data);
      else if (Array.isArray(data)) showGroupDetailsModal({ tasks: data, groupName });
      else throw new Error(data?.message || data?.error || "Error al obtener detalles");
    } catch (error) {
      console.error("Error al obtener detalles:", error);
      Swal.fire("Error", error.message || "No se pudieron cargar los detalles del grupo", "error");
    }
  };

  const showGroupDetailsModal = (groupData) => {
    // Implementación de SweetAlert con estilos Premium
    const tasksHtml = groupData.tasks
      .map(task => `
      <div class="flex justify-between items-center p-4 mb-2 rounded-2xl border ${task.isCoordinator ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-black text-slate-900">${task.name}</span>
            ${task.isCoordinator ? '<span class="text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white px-2 py-0.5 rounded-full">👑 Coordinador</span>' : ''}
          </div>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orden: ${task.order} • Tipo: ${task.type}</span>
        </div>
        <button onclick="window.removeTaskFromGroupHandler('${task.id}')" class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100">
          Remover
        </button>
      </div>
    `).join("");

    const coordinatorInfo = groupData.coordinator ? `
      <div class="bg-indigo-50/50 border border-indigo-100 p-6 rounded-[24px] mb-6 space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-xs">👑</div>
          <h4 class="text-sm font-black text-indigo-900 uppercase tracking-wider">Tarea Coordinadora: ${groupData.coordinator.name}</h4>
        </div>
        <div class="space-y-2">
            <span class="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Query de Post-Actualización</span>
            <code class="block p-4 bg-white rounded-xl border border-indigo-100 text-xs font-mono text-indigo-800 shadow-sm">${groupData.coordinator.postUpdateQuery}</code>
        </div>
      </div>
    ` : '<div class="p-4 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold mb-6 border border-amber-100">⚠️ Este grupo no cuenta con una tarea coordinadora definida.</div>';

    window.removeTaskFromGroupHandler = (taskId) => removeTaskFromGroup(taskId);

    Swal.fire({
      title: `<span class="text-xl font-black text-slate-900">Grupo: ${groupData.groupName}</span>`,
      html: `
        <div class="text-left mt-6">
          ${coordinatorInfo}
          <div class="flex items-center justify-between mb-4 px-2">
            <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Tareas en el Grupo (${groupData.totalTasks})</h4>
          </div>
          <div class="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            ${tasksHtml}
          </div>
        </div>
      `,
      width: "650px",
      padding: '2rem',
      background: '#ffffff',
      showCancelButton: true,
      confirmButtonText: "Entendido",
      cancelButtonText: "Desmantelar Grupo",
      customClass: {
        popup: 'rounded-[32px] border-none shadow-2xl',
        confirmButton: 'px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-black transition-all border-none ml-2',
        cancelButton: 'px-8 py-3 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all border-none mr-2'
      },
      buttonsStyling: false,
      willClose: () => { delete window.removeTaskFromGroupHandler; },
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) deleteGroup(groupData.groupName);
    });
  };

  const deleteGroup = async (groupName) => {
    const confirmation = await Swal.fire({
      title: "Desmantelar Grupo",
      html: `
        <div class="space-y-4 mt-4">
            <p class="text-sm text-slate-500 font-medium">¿Estás seguro de que deseas eliminar el grupo <strong>"${groupName}"</strong>?</p>
            <div class="bg-red-50 border border-red-100 p-5 rounded-2xl text-left">
                <span class="text-[10px] font-black text-red-700 uppercase tracking-widest mb-2 block">Implicaciones Críticas:</span>
                <ul class="space-y-2">
                    <li class="text-[11px] font-bold text-red-600 flex gap-2"><span>•</span> Todas las tareas se volverán individuales.</li>
                    <li class="text-[11px] font-bold text-red-600 flex gap-2"><span>•</span> Se eliminarán los disparadores Post-Update.</li>
                    <li class="text-[11px] font-bold text-red-600 flex gap-2"><span>•</span> No se podrá revertir esta acción.</li>
                </ul>
            </div>
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-6">Escriba "CONFIRMAR" para proceder</p>
        </div>
      `,
      input: "text",
      inputAttributes: { autocapitalize: 'off', class: 'mt-4 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-center font-black uppercase tracking-widest text-sm focus:outline-none focus:border-red-500 transition-all' },
      showCancelButton: true,
      confirmButtonText: "Eliminar Grupo",
      customClass: {
          popup: 'rounded-[32px] p-8',
          confirmButton: 'px-10 py-3.5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20 mt-4',
          cancelButton: 'px-10 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] mt-4 ml-4'
      },
      buttonsStyling: false,
      inputValidator: (value) => value !== "CONFIRMAR" ? 'Debe escribir "CONFIRMAR" exactamente' : null,
    });

    if (confirmation.isConfirmed) {
      try {
        const data = await api.deleteLinkedGroup(accessToken, groupName);
        if (data.success) {
          Swal.fire("¡Éxito!", `Grupo desmantelado correctamente`, "success");
          fetchGroups();
          if (onGroupDeleted) onGroupDeleted();
        } else throw new Error(data.message || "Error al eliminar grupo");
      } catch (error) {
        Swal.fire("Error", "No se pudo eliminar el grupo", "error");
      }
    }
  };

  const removeTaskFromGroup = async (taskId) => {
    try {
      const data = await api.removeTaskFromGroup(accessToken, taskId);
      if (data.success) {
        Swal.fire("Removida", `Tarea desvinculada del grupo`, "success");
        fetchGroups();
        if (onGroupDeleted) onGroupDeleted();
      } else throw new Error(data.message || "Error al remover tarea");
    } catch (error) {
      Swal.fire("Error", "No se pudo remover la tarea del grupo", "error");
    }
  };

  if (loading) return <div className="p-20 text-center text-xs font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Analizando dependencias de red...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-black text-slate-900 flex items-center justify-center gap-4">
          <FaLink className="text-indigo-600" /> Gestión de Grupos Vinculados
        </h2>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest max-w-2xl mx-auto">Administre la orquestación de tareas encadenadas y sus configuraciones de post-actualización masiva</p>
      </div>

      {error && (
        <div className="p-8 bg-red-50 border border-red-100 rounded-[32px] text-center space-y-6 animate-bounce-short">
          <p className="text-red-700 font-bold">{error}</p>
          <Button variant="primary" onClick={fetchGroups} className="px-10 bg-red-600 border-none shadow-lg shadow-red-600/20">Reintentar Conexión</Button>
        </div>
      )}

      {!error && groups.length === 0 ? (
        <div className="p-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-[48px] flex flex-col items-center gap-6 text-center group transition-all hover:bg-white hover:border-indigo-200">
          <div className="w-20 h-20 bg-white rounded-[24px] flex items-center justify-center text-slate-300 shadow-sm group-hover:text-indigo-500 transition-colors">
            <FaUsers className="text-4xl" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-900">Arquitectura Plana</h3>
            <p className="text-sm text-slate-400 font-medium max-w-sm">No se han detectado vínculos entre tareas. Puede crear grupos asignando el mismo nombre de grupo en la edición de tareas.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {groups.map((group) => (
            <div key={group.groupName} className="bg-white rounded-[32px] overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 border border-slate-100 flex flex-col group/card">
              <div className="p-8 bg-gradient-to-br from-indigo-600 to-purple-700 text-white relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 group-hover/card:scale-110 transition-transform duration-700">
                    <FaLink size={120} />
                </div>
                <div className="relative z-10 space-y-4">
                    <h3 className="text-xl font-black truncate leading-tight uppercase tracking-wide">{group.groupName}</h3>
                    <div className="flex flex-wrap gap-2">
                        <span className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <FaUsers className="text-[8px]" /> {group.totalTasks} Tareas
                        </span>
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/20 ${group.coordinatorCount > 0 ? "bg-emerald-500/80" : "bg-white/10"}`}>
                            <FaCrown className="text-[8px]" /> {group.coordinatorCount > 0 ? "Master" : "No Master"}
                        </span>
                    </div>
                </div>
              </div>

              <div className="p-8 flex-1 space-y-4">
                <div className="space-y-2">
                    {group.tasks.slice(0, 3).map((task) => (
                      <div key={task.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:bg-slate-50 ${task.isCoordinator ? "bg-emerald-50/30 border-emerald-100" : "bg-white border-slate-100"}`}>
                        <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-800">{task.name}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ejecución #{task.linkedExecutionOrder}</span>
                        </div>
                        {task.isCoordinator && <span className="text-lg">👑</span>}
                      </div>
                    ))}
                    {group.totalTasks > 3 && (
                      <div className="text-center py-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">+ {group.totalTasks - 3} adicionales</span>
                      </div>
                    )}
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex gap-3">
                <button
                  onClick={() => viewGroupDetails(group.groupName)}
                  className="flex-1 bg-white border border-slate-200 text-slate-900 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm"
                >
                  <FaEye className="inline mr-2" /> Auditoría
                </button>
                <button
                  onClick={() => deleteGroup(group.groupName)}
                  className="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-100"
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LinkedGroupsManager;
