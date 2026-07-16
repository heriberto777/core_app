import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { FaTrash, FaEye, FaCrown, FaUsers, FaSync, FaLink, FaSearch } from "react-icons/fa";
import { TransferTaskApi, Button, GroupDetailModal } from "../../index";

const api = new TransferTaskApi();

const STATUS_DOT = {
  pending: "bg-slate-300",
  running: "bg-primary-500 animate-pulse",
  completed: "bg-emerald-500",
  error: "bg-red-500",
  failed: "bg-red-500",
  cancelled: "bg-amber-400",
};

const LinkedGroupsManager = ({
  accessToken,
  onGroupDeleted = null,
  onClose = null,
}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedGroupName, setSelectedGroupName] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [removingTaskId, setRemovingTaskId] = useState(null);

  useEffect(() => {
    if (accessToken) {
      fetchGroups();
    }
  }, [accessToken]);

  // Mientras haya un grupo abierto en el modal de detalle, refresca su
  // estado cada pocos segundos para ver en vivo cuál tarea está corriendo,
  // cuál falló y con qué error, sin depender de refrescar la página.
  useEffect(() => {
    if (!selectedGroupName) return;
    const interval = setInterval(() => {
      fetchGroupDetail(selectedGroupName).catch((err) =>
        console.error("Error actualizando estado del grupo:", err)
      );
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedGroupName]);

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

  const fetchGroupDetail = async (groupName) => {
    const data = await api.getGroupDetails(accessToken, groupName);
    const normalized = data && data.success ? data.data : data;
    if (!normalized || !normalized.tasks) throw new Error("Respuesta de detalle inválida");
    setSelectedGroup(normalized);
    return normalized;
  };

  const viewGroupDetails = async (groupName) => {
    try {
      await fetchGroupDetail(groupName);
      setSelectedGroupName(groupName);
    } catch (error) {
      console.error("Error al obtener detalles:", error);
      Swal.fire("Error", error.message || "No se pudieron cargar los detalles del grupo", "error");
    }
  };

  const closeGroupDetail = () => {
    setSelectedGroupName(null);
    setSelectedGroup(null);
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
          popup: 'rounded-xl p-8',
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

  const handleDismantleFromModal = (groupName) => {
    closeGroupDetail();
    deleteGroup(groupName);
  };

  const removeTaskFromGroup = async (taskId) => {
    setRemovingTaskId(taskId);
    try {
      const data = await api.removeTaskFromGroup(accessToken, taskId);
      if (data.success) {
        fetchGroups();
        if (onGroupDeleted) onGroupDeleted();
        if (selectedGroupName) {
          try {
            await fetchGroupDetail(selectedGroupName);
          } catch {
            // El grupo pudo quedar sin tareas suficientes; cerramos el detalle.
            closeGroupDetail();
          }
        }
      } else throw new Error(data.message || "Error al remover tarea");
    } catch (error) {
      Swal.fire("Error", "No se pudo remover la tarea del grupo", "error");
    } finally {
      setRemovingTaskId(null);
    }
  };

  const filteredGroups = groups.filter((g) =>
    g.groupName.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  if (loading) return <div className="p-20 text-center text-xs font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Analizando dependencias de red...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-black text-slate-900 flex items-center justify-center gap-4">
          <FaLink className="text-primary-600" /> Gestión de Grupos Vinculados
        </h2>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest max-w-2xl mx-auto">Administre la orquestación de tareas encadenadas y sus configuraciones de post-actualización masiva</p>
      </div>

      {error && (
        <div className="p-8 bg-red-50 border border-red-100 rounded-xl text-center space-y-6 animate-bounce-short">
          <p className="text-red-700 font-bold">{error}</p>
          <Button variant="primary" onClick={fetchGroups} className="px-10 bg-red-600 border-none shadow-lg shadow-red-600/20">Reintentar Conexión</Button>
        </div>
      )}

      {!error && groups.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between max-w-2xl mx-auto">
          <div className="relative flex-1">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-sm" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar grupo por nombre..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-primary-400 transition-all"
            />
          </div>
          <button
            onClick={fetchGroups}
            className="shrink-0 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-primary-600 hover:border-primary-300 transition-all flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest"
          >
            <FaSync /> Actualizar
          </button>
        </div>
      )}

      {!error && groups.length === 0 ? (
        <div className="p-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center gap-6 text-center group transition-all hover:bg-white hover:border-primary-200">
          <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center text-slate-300 shadow-sm group-hover:text-primary-500 transition-colors">
            <FaUsers className="text-4xl" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-black text-slate-900">Arquitectura Plana</h3>
            <p className="text-sm text-slate-400 font-medium max-w-sm">No se han detectado vínculos entre tareas. Puede crear grupos asignando el mismo nombre de grupo en la edición de tareas.</p>
          </div>
        </div>
      ) : !error && filteredGroups.length === 0 ? (
        <div className="p-16 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-center">
          <p className="text-sm text-slate-400 font-bold">Ningún grupo coincide con "{searchTerm}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredGroups.map((group) => (
            <div key={group.groupName} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 border border-slate-100 flex flex-col group/card">
              <div className="p-8 bg-primary-600 text-white relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 group-hover/card:scale-110 transition-transform duration-700">
                    <FaLink size={120} />
                </div>
                <div className="relative z-10 space-y-4">
                    <h3 className="text-xl font-black leading-tight uppercase tracking-wide break-words" title={group.groupName}>{group.groupName}</h3>
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
                    {group.tasks.slice(0, 3).map((task, idx) => (
                      <div key={task.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:bg-slate-50 ${task.isCoordinator ? "bg-emerald-50/30 border-emerald-100" : "bg-white border-slate-100"}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-black">{idx + 1}</span>
                          <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-slate-800 truncate">{task.name}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[task.status] || "bg-slate-300"}`} />
                                {task.status || "pendiente"}
                              </span>
                          </div>
                        </div>
                        {task.isCoordinator && <span className="text-lg shrink-0">👑</span>}
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
                  className="flex-1 bg-white border border-slate-200 text-slate-900 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-primary-600 hover:text-primary-600 transition-all shadow-sm"
                >
                  <FaEye className="inline mr-2" /> Ver detalle
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

      {selectedGroup && (
        <GroupDetailModal
          group={selectedGroup}
          onClose={closeGroupDetail}
          onRemoveTask={removeTaskFromGroup}
          onDismantle={handleDismantleFromModal}
          removingTaskId={removingTaskId}
        />
      )}
    </div>
  );
};

export default LinkedGroupsManager;
