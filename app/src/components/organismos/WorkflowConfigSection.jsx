import React, { useState, useEffect } from "react";
import { FaPlus, FaTrash, FaLink, FaArrowRight, FaCogs, FaProjectDiagram, FaInfoCircle, FaExclamationTriangle, FaCheck, FaLock, FaUnlock } from "react-icons/fa";
import { Button, Input, Select } from "../../index";
import { MappingApi } from "../../api/index";

const api = new MappingApi();

const WorkflowConfigSection = ({ mapping = {}, handleChange, accessToken }) => {
  const [allMappings, setAllMappings] = useState([]);
  const [loading, setLoading] = useState(false);

  const workflowConfig = mapping.workflowConfig || { enabled: false, nextMappings: [], stopWorkflowOnError: true };

  useEffect(() => {
    const fetchMappings = async () => {
      try {
        setLoading(true);
        const response = await api.getMappings(accessToken);
        setAllMappings(response.filter(m => m._id !== mapping._id));
      } catch (error) {
        console.error("Error fetching mappings for workflow:", error);
      } finally {
        setLoading(false);
      }
    };
    if (accessToken) fetchMappings();
  }, [accessToken, mapping._id]);

  const handleToggleWorkflow = (e) => {
    handleChange({
      target: {
        name: "workflowConfig.enabled",
        type: "custom",
        value: e.target.checked
      }
    });
  };

  const handleToggleStopOnError = (e) => {
    handleChange({
      target: {
        name: "workflowConfig.stopWorkflowOnError",
        type: "custom",
        value: e.target.checked
      }
    });
  };

  const addNextMapping = async () => {
    const result = await import("sweetalert2").then(m => m.Swal.fire({
      title: "Añadir Siguiente Mapeo",
      html: `
        <div class="workflow-form-container">
          <div class="workflow-form-group">
            <label class="workflow-form-label">Nombre del Mapeo Siguiente</label>
            <input id="nextMappingName" class="workflow-form-input" placeholder="Ej: Procesamiento de Pagos">
          </div>
          <div class="workflow-form-group">
            <label class="workflow-form-label">Tipo de Entidad</label>
            <select id="nextEntityType" class="workflow-form-select">
              <option value="orders">Pedidos</option>
              <option value="invoices">Facturas</option>
              <option value="customers">Clientes</option>
            </select>
          </div>
          <div class="workflow-form-group">
            <label class="workflow-form-checkbox">
              <input id="stopOnError" type="checkbox" checked> Detener flujo si hay error
            </label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("nextMappingName").value;
        const entityType = document.getElementById("nextEntityType").value;
        const stopOnError = document.getElementById("stopOnError").checked;

        if (!name) {
          Swal.showValidationMessage("El nombre es requerido");
          return false;
        }

        return {
          name,
          entityType,
          stopOnError
        };
      }
    }));

    if (formValues) {
      const nextMappings = [...(workflowConfig.nextMappings || [])];
      nextMappings.push(formValues);
      handleChange({
        target: {
          name: "workflowConfig",
          type: "custom",
          value: { ...workflowConfig, nextMappings }
        }
      });
    }
  };

  const removeNextMapping = async (index) => {
    const result = await import("sweetalert2").then(m => m.Swal.fire({
      title: "¿Eliminar?",
      text: `¿Está seguro que desea eliminar el siguiente mapeo "${workflowConfig.nextMappings[index]?.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    }));

    if (result.isConfirmed) {
      const nextMappings = workflowConfig.nextMappings.filter((_, i) => i !== index);
      handleChange({
        target: {
          name: "workflowConfig",
          type: "custom",
          value: { ...workflowConfig, nextMappings }
        }
      });
    }
  };

  const updateNextMapping = (index, field, value) => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings[index] = { ...nextMappings[index], [field]: value };

    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        type: "custom",
        value: nextMappings
      }
    });
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/50 border-2 border-emerald-200 rounded-3xl p-8 mb-8 shadow-lg animate-fadeIn">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/30">
          <FaArrowRight className="text-2xl" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-2xl font-black text-slate-900 leading-tight">
            Flujo de Trabajo
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Configure la secuencia de mapeos que debe ejecutarse después de este proceso
          </p>
        </div>
      </div>

      {/* ENABLE TOGGLE */}
      <label className="flex items-center gap-4 px-8 py-5 rounded-2xl cursor-pointer transition-all border-2 mb-8 group">
        <div className={`w-12 h-6 rounded-full p-1 transition-colors relative ${workflowConfig.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${workflowConfig.enabled ? "translate-x-6" : "translate-x-0"}`} />
        </div>
        <input
          type="checkbox"
          className="sr-only"
          id="workflow-enabled"
          checked={workflowConfig.enabled}
          onChange={handleToggleWorkflow}
        />
        <div className="flex flex-col">
          <span className={`text-sm font-black uppercase tracking-wider ${workflowConfig.enabled ? "text-emerald-700" : "text-slate-500"}`}>
            Activar Flujo
          </span>
          <span className="text-xs font-bold text-slate-400">
            {workflowConfig.enabled ? "Flujo activo y ejecutable" : "Flujo desactivado"}
          </span>
        </div>
      </label>

      {/* NEXT MAPPINGS LIST */}
      <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center pb-4 border-b border-emerald-100">
          <div>
            <h4 className="text-lg font-bold text-slate-800">Siguientes Mapeos</h4>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {workflowConfig.nextMappings?.length || 0} mapeos configurados
            </p>
          </div>
          <Button variant="primary" onClick={addNextMapping} className="flex items-center gap-2">
            <FaPlus /> Añadir Siguiente
          </Button>
        </div>

        {workflowConfig.nextMappings?.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {workflowConfig.nextMappings.map((nextMapping, idx) => (
              <div key={idx} className="flex justify-between items-center p-5 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 hover:from-emerald-50/100 hover:to-teal-50/100 border border-emerald-100 rounded-2xl transition-all group">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl font-black text-sm">
                    #{idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-lg">{nextMapping.name}</div>
                    <div className="text-xs text-slate-500 font-medium">
                      {nextMapping.entityType === "orders" && "Pedidos"}
                      {nextMapping.entityType === "invoices" && "Facturas"}
                      {nextMapping.entityType === "customers" && "Clientes"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" className="bg-white p-2" onClick={() => {}}>
                    <FaEdit />
                  </Button>
                  <Button variant="ghost" className="bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => removeNextMapping(idx)}>
                    <FaTrash />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white/60 backdrop-blur-sm rounded-2xl border-2 border-dashed border-emerald-200">
            <FaArrowRight className="text-4xl text-emerald-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay mapeos siguientes configurados</p>
            <p className="text-xs text-slate-400 mt-1">Configure el flujo para definir qué proceso sigue</p>
          </div>
        )}
      </div>

      {/* STOP ON ERROR CONFIG */}
      <div className="mt-8 p-6 bg-white/80 backdrop-blur-sm border border-emerald-100 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <FaExclamation />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Detener Flujo si hay Error</h4>
              <p className="text-sm text-slate-500 font-medium">
                Si este mapeo falla, detener todos los mapeos siguientes
              </p>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="workflowConfig.stopWorkflowOnError"
              checked={workflowConfig.stopWorkflowOnError !== false}
              onChange={(e) => handleChange({
                target: {
                  name: "workflowConfig",
                  type: "custom",
                  value: { ...workflowConfig, stopWorkflowOnError: e.target.checked }
                }
              })}
              className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
              Activar
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default WorkflowConfigSection;