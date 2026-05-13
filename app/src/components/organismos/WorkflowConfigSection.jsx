import React, { useState, useEffect } from "react";
import { FaPlus, FaTrash, FaLink, FaArrowRight, FaCogs, FaProjectDiagram, FaInfoCircle, FaExclamationTriangle } from "react-icons/fa";
import { Button } from "../../index";
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
        setAllMappings(response.filter(m => m._id !== mapping._id)); // Evitar circularidad simple
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
        value: e.target.checked,
        checked: e.target.checked,
        type: "checkbox"
      }
    });
  };

  const handleToggleStopOnError = (e) => {
    handleChange({
      target: {
        name: "workflowConfig.stopWorkflowOnError",
        value: e.target.checked,
        checked: e.target.checked,
        type: "checkbox"
      }
    });
  };

  const addNextMapping = () => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings.push({
      mappingId: "",
      linkField: "",
      description: "",
      autoExecute: true,
      executionOrder: nextMappings.length
    });
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  const removeNextMapping = (index) => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings.splice(index, 1);
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  const updateNextMapping = (index, field, value) => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings[index] = { ...nextMappings[index], [field]: value };
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  return (
    <div className="bg-slate-50/50 border border-slate-200 rounded-[32px] p-8 mt-8 flex flex-col gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-6">
        <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <FaLink />
          </div>
          Flujo de Trabajo (Workflow)
        </h3>
        <p className="text-sm text-slate-500 font-medium ml-13">
          Configure la jerarquía de este proceso y los pasos automáticos que se disparan después de completar la transferencia.
        </p>
      </div>

      {/* 1. JERARQUÍA DEL PROCESO */}
      <div className="p-8 bg-white border border-slate-200 rounded-[24px] shadow-sm flex flex-col gap-6 group hover:border-blue-200 transition-colors">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-3">
          <FaProjectDiagram /> 1. Jerarquía de este Proceso
        </div>
        
        <div className="flex gap-8 flex-wrap">
          <label className={`flex items-center gap-3 px-6 py-4 rounded-2xl cursor-pointer transition-all border font-bold text-sm ${
            mapping.isWorkflowChild ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}>
            <input 
              type="checkbox" 
              className="sr-only"
              name="isWorkflowChild"
              checked={mapping.isWorkflowChild || false} 
              onChange={handleChange} 
            />
            {mapping.isWorkflowChild ? "ES PROCESO HIJO" : "NO ES HIJO"}
          </label>

          {mapping.isWorkflowChild && (
            <label className={`flex items-center gap-3 px-6 py-4 rounded-2xl cursor-pointer transition-all border font-bold text-sm animate-in zoom-in-95 duration-200 ${
              mapping.allowDirectExecution !== false ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}>
              <input 
                type="checkbox" 
                className="sr-only"
                name="allowDirectExecution"
                checked={mapping.allowDirectExecution !== false} 
                onChange={handleChange} 
              />
              {mapping.allowDirectExecution !== false ? "EJECUCIÓN DIRECTA PERMITIDA" : "BLOQUEADO EN GESTOR"}
            </label>
          )}
        </div>

        {!mapping.allowDirectExecution && mapping.isWorkflowChild && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex gap-3 items-start animate-in slide-in-from-left-2 duration-300">
            <FaExclamationTriangle className="text-red-500 mt-0.5" />
            <div className="text-xs text-red-800 leading-relaxed font-medium">
              <strong className="block font-black mb-1 text-[10px] uppercase">Modo Restringido</strong>
              Este proceso NO aparecerá en el Gestor Universal. Solo se ejecutará como parte de un flujo encadenado.
            </div>
          </div>
        )}
      </div>

      {/* 2. CONFIGURACIÓN DE SEGUIDORES */}
      <div className="flex flex-col gap-6">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-3 ml-1">
          <FaArrowRight /> 2. Configuración de Seguidores
        </div>

        <div className="flex gap-8 px-4 py-6 bg-slate-50/80 rounded-2xl border border-slate-100">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              checked={workflowConfig.enabled} 
              onChange={handleToggleWorkflow} 
            />
            <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Habilitar Encadenamiento (PADRE)</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              checked={workflowConfig.stopWorkflowOnError} 
              onChange={handleToggleStopOnError} 
            />
            <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Detener workflow en error</span>
          </label>
        </div>

        {workflowConfig.enabled && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-top-4 duration-500">
            <div className="flex justify-between items-center px-2">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Procesos Seguidores Activos</h4>
              <Button variant="primary" onClick={addNextMapping} className="px-5 py-2 text-[10px] font-black uppercase shadow-lg shadow-blue-600/20">
                <FaPlus className="mr-2" /> Añadir Paso
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {(workflowConfig.nextMappings || []).map((step, idx) => (
                <div key={idx} className="p-8 bg-white border border-slate-200 rounded-[24px] shadow-sm flex flex-col gap-8 group hover:border-blue-500 transition-all duration-300">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-lg">Paso {idx + 1}</div>
                    <Button variant="ghost" onClick={() => removeNextMapping(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 h-auto">
                      <FaTrash />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Mapping a Disparar</label>
                      <select 
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold appearance-none transition-all"
                        value={step.mappingId} 
                        onChange={(e) => updateNextMapping(idx, 'mappingId', e.target.value)}
                      >
                        <option value="">Seleccione un proceso...</option>
                        {allMappings.map(m => (
                          <option key={m._id} value={m._id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Campo de Enlace (Link Field)</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all placeholder:text-slate-300"
                        placeholder="Ej: NUM_FACT" 
                        value={step.linkField} 
                        onChange={(e) => updateNextMapping(idx, 'linkField', e.target.value)}
                      />
                      <small className="text-[9px] text-slate-400 font-medium px-1">Nombre de la columna en el hijo que referencia al padre.</small>
                    </div>

                    <div className="flex flex-col gap-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Configuración del Destino</label>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-2 cursor-pointer group/label">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                            checked={allMappings.find(m => m._id === step.mappingId)?.isWorkflowChild || false}
                            onChange={async (e) => {
                              const checked = e.target.checked;
                              const targetId = step.mappingId;
                              try {
                                const target = allMappings.find(m => m._id === targetId);
                                await api.updateMapping(accessToken, targetId, { ...target, isWorkflowChild: checked });
                                setAllMappings(prev => prev.map(m => m._id === targetId ? { ...m, isWorkflowChild: checked } : m));
                              } catch (err) { console.error("Error al actualizar hijo:", err); }
                            }}
                          />
                          <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wide">Definir como HIJO</span>
                        </label>
                        
                        {allMappings.find(m => m._id === step.mappingId)?.isWorkflowChild && (
                          <label className="flex items-center gap-2 cursor-pointer group/label animate-in slide-in-from-top-1 duration-200">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-red-500 focus:ring-red-500 cursor-pointer"
                              checked={allMappings.find(m => m._id === step.mappingId)?.allowDirectExecution === false}
                              onChange={async (e) => {
                                const checked = e.target.checked;
                                const targetId = step.mappingId;
                                try {
                                  const target = allMappings.find(m => m._id === targetId);
                                  await api.updateMapping(accessToken, targetId, { ...target, allowDirectExecution: !checked });
                                  setAllMappings(prev => prev.map(m => m._id === targetId ? { ...m, allowDirectExecution: !checked } : m));
                                } catch (err) { console.error("Error al actualizar restricción:", err); }
                              }}
                            />
                            <span className="text-[11px] font-bold text-red-600 uppercase tracking-wide">Ocultar de Gestor</span>
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Campo Origen (Padre)</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                        placeholder="Ej: NCF (Vacío para PK)" 
                        value={step.parentLinkField || ""} 
                        onChange={(e) => updateNextMapping(idx, 'parentLinkField', e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Descripción del Paso</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-bold transition-all"
                        placeholder="Ej: Generar Recibos" 
                        value={step.description} 
                        onChange={(e) => updateNextMapping(idx, 'description', e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2 pt-6">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          checked={step.autoExecute} 
                          onChange={(e) => updateNextMapping(idx, 'autoExecute', e.target.checked)}
                        />
                        <span className="text-sm font-bold text-slate-600 group-hover:text-emerald-600 transition-colors">Ejecución Automática</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-6 border-t border-slate-50 flex items-center gap-4 text-[10px] font-black uppercase text-blue-600 tracking-widest">
                    <div className="flex items-center gap-2">
                      <FaArrowRight className="text-xs" /> 
                      {allMappings.find(m => m._id === step.mappingId)?.name || "..."}
                    </div>
                    
                    <div className="flex gap-2 ml-auto">
                      {allMappings.find(m => m._id === step.mappingId)?.isWorkflowChild && (
                        <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-md">HIJO</span>
                      )}
                      {!allMappings.find(m => m._id === step.mappingId)?.allowDirectExecution && (
                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <FaExclamationTriangle size={8} /> SOLO WORKFLOW
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {(!workflowConfig.nextMappings || workflowConfig.nextMappings.length === 0) && (
                <div className="p-16 bg-white border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <FaCogs className="text-2xl text-slate-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin pasos seguidores</span>
                    <p className="text-xs text-slate-300 max-w-[200px]">Añada un proceso para iniciar la cadena de ejecución automática.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowConfigSection;