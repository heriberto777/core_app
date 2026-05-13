import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { FaEye, FaPlus, FaTrash, FaInfoCircle, FaCheckCircle, FaExclamationCircle, FaHashtag, FaCogs, FaShareAlt, FaLayerGroup } from "react-icons/fa";
import { useAuth, Button } from "../../index";
import { ConsecutiveApi } from "../../api/index";

const api = new ConsecutiveApi();

const ConsecutiveConfigSection = ({ mapping = {}, handleChange }) => {
  const { accessToken } = useAuth();
  const consecutiveConfig = mapping.consecutiveConfig || {};
  const isEnabled = consecutiveConfig.enabled || false;

  const [assignedConsecutives, setAssignedConsecutives] = useState([]);
  const [selectedCentralizedConsecutive, setSelectedCentralizedConsecutive] = useState("");
  const [useCentralizedSystem, setUseCentralizedSystem] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tableMappings, setTableMappings] = useState(consecutiveConfig.applyToTables || []);

  useEffect(() => {
    const loadAssignedConsecutives = async () => {
      try {
        if (mapping && mapping._id) {
          setLoading(true);
          const response = await api.getConsecutivesByEntity(accessToken, "mapping", mapping._id);
          const allAssigned = Array.isArray(response) ? response : (response?.data || []);

          if (allAssigned.length > 0) {
            setAssignedConsecutives(allAssigned);
            setSelectedCentralizedConsecutive(allAssigned[0]._id);
            setUseCentralizedSystem(true);
          } else {
            setUseCentralizedSystem(false);
          }
        }
      } catch (error) {
        console.error("Error al cargar consecutivos asignados:", error);
        setUseCentralizedSystem(false);
      } finally {
        setLoading(false);
      }
    };

    loadAssignedConsecutives();
  }, [mapping._id, accessToken]);

  useEffect(() => {
    setTableMappings(consecutiveConfig.applyToTables || []);
  }, [consecutiveConfig.applyToTables]);

  const availableTables = React.useMemo(() => {
    if (!mapping.tableConfigs) return [];
    return mapping.tableConfigs.map((config) => ({
      name: config.name,
      isDetail: config.isDetailTable || false,
      fields: (config.fieldMappings || []).map((field) => field.targetField),
    }));
  }, [mapping.tableConfigs]);

  const handleViewConsecutiveDetails = async () => {
    if (!selectedCentralizedConsecutive) return;
    try {
      setLoading(true);
      const response = await api.getConsecutiveById(accessToken, selectedCentralizedConsecutive);
      const consec = (response && response._id) ? response : (response?.data);

      if (consec && consec._id) {
        Swal.fire({
          title: `Consecutivo: ${consec.name}`,
          html: `
            <div style="text-align: left; padding: 10px; font-family: 'Inter', sans-serif;">
              <p style="margin-bottom: 8px;"><strong>Descripción:</strong> ${consec.description || "N/A"}</p>
              <p style="margin-bottom: 8px;"><strong>Valor actual:</strong> <span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-weight: 800;">${consec.currentValue}</span></p>
              <p style="margin-bottom: 8px;"><strong>Formato:</strong> <code>${consec.pattern || `${consec.prefix || ""}[valor]${consec.suffix || ""}`}</code></p>
              <p style="margin-bottom: 8px;"><strong>Segmentado:</strong> ${consec.segments?.enabled ? `Sí (${consec.segments.type})` : "No"}</p>
              <p style="margin-bottom: 8px;"><strong>Estado:</strong> <span style="color: ${consec.active ? "#10b981" : "#ef4444"}; font-weight: bold;">${consec.active ? "Activo" : "Inactivo"}</span></p>
            </div>
          `,
          icon: "info",
          confirmButtonText: "Entendido",
          confirmButtonColor: "#2563eb",
          customClass: {
            popup: 'rounded-[24px]',
            confirmButton: 'rounded-xl px-8 font-bold uppercase text-xs tracking-widest'
          }
        });
      }
    } catch (error) {
      console.error("Error al obtener detalles del consecutivo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewAssignedConsecutive = async () => {
    const isNewMapping = !mapping || !mapping._id;
    try {
      setLoading(true);
      const response = await api.getConsecutives(accessToken);
      setLoading(false);

      const allConsecutives = Array.isArray(response) ? response : (response.data || []);
      if (allConsecutives.length === 0) {
        Swal.fire({ title: "Sin consecutivos", text: "No hay consecutivos disponibles", icon: "info" });
        return;
      }

      const assignedIds = assignedConsecutives.map((c) => c._id);
      const availableConsecutives = allConsecutives.filter((c) => !assignedIds.includes(c._id));

      if (availableConsecutives.length === 0) {
        Swal.fire({ title: "Sin consecutivos", text: "Todos ya están asignados", icon: "info" });
        return;
      }

      const options = availableConsecutives
        .map((c) => `<option value="${c._id}">${c.name}</option>`)
        .join("");

      const { value: selectedId } = await Swal.fire({
        title: "Asignar Consecutivo",
        html: `
          <div style="text-align: left;">
            <label style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Seleccione un consecutivo:</label>
            <select id="consecutive-select" class="swal2-select" style="width: 100%; margin-top: 10px; border-radius: 12px; border-color: #e2e8f0; font-weight: 600;">
              ${options}
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Asignar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#2563eb",
        customClass: { popup: 'rounded-[24px]' },
        preConfirm: () => document.getElementById("consecutive-select").value,
      });

      if (selectedId) {
        if (isNewMapping) {
          handleChange({
            target: {
              name: "consecutiveConfig",
              type: "custom",
              value: { ...consecutiveConfig, pendingAssignmentId: selectedId, enabled: true }
            }
          });
          const selectedConsec = availableConsecutives.find(c => c._id === selectedId);
          setAssignedConsecutives([selectedConsec]);
          setSelectedCentralizedConsecutive(selectedId);
          setUseCentralizedSystem(true);
          return;
        }

        setLoading(true);
        const assignResult = await api.assignConsecutive(accessToken, selectedId, {
          entityType: "mapping",
          entityId: mapping._id,
          allowedOperations: ["read", "increment"],
        });
        setLoading(false);

        if (assignResult && (assignResult._id || assignResult.success)) {
          const newConsecutive = availableConsecutives.find((c) => c._id === selectedId);
          setAssignedConsecutives([...assignedConsecutives, newConsecutive]);
          setSelectedCentralizedConsecutive(selectedId);
          setUseCentralizedSystem(true);
          Swal.fire({ title: "Éxito", text: "Asignado correctamente", icon: "success", timer: 2000, showConfirmButton: false });
        }
      }
    } catch (error) {
      setLoading(false);
      console.error("Error al asignar:", error);
    }
  };

  const handleCreateAndAssignConsecutive = async () => {
    if (!mapping || !mapping._id) {
      Swal.fire({ title: "Atención", text: "Guarde el mapeo primero para crear nuevos consecutivos.", icon: "warning" });
      return;
    }
    try {
      const { value: formValues } = await Swal.fire({
        title: "Crear Nuevo Consecutivo",
        html: `
          <div style="display: flex; flex-direction: column; gap: 15px; text-align: left;">
            <div>
              <label style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Nombre:</label>
              <input id="name" class="swal2-input" style="width: 100%; margin: 5px 0 0; border-radius: 12px;" placeholder="Ej: Facturas Ventas">
            </div>
            <div>
              <label style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Valor Inicial:</label>
              <input id="current-value" type="number" class="swal2-input" style="width: 100%; margin: 5px 0 0; border-radius: 12px;" value="0">
            </div>
            <div>
              <label style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Prefijo (Opcional):</label>
              <input id="prefix" class="swal2-input" style="width: 100%; margin: 5px 0 0; border-radius: 12px;" placeholder="Ej: FAC-">
            </div>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Crear y Asignar",
        confirmButtonColor: "#2563eb",
        customClass: { popup: 'rounded-[28px]' },
        preConfirm: () => {
          const name = document.getElementById("name").value;
          if (!name) { Swal.showValidationMessage("El nombre es obligatorio"); return false; }
          return {
            name,
            currentValue: parseInt(document.getElementById("current-value").value || "0", 10),
            prefix: document.getElementById("prefix").value,
            active: true,
          };
        },
      });

      if (formValues) {
        setLoading(true);
        const createResult = await api.createConsecutive(accessToken, formValues);
        const newConsecutive = (createResult && createResult._id) ? createResult : (createResult?.data);

        if (newConsecutive && newConsecutive._id) {
          const assignResult = await api.assignConsecutive(accessToken, newConsecutive._id, {
            entityType: "mapping",
            entityId: mapping._id,
            allowedOperations: ["read", "increment"],
          });

          if (assignResult && (assignResult._id || assignResult.success)) {
            setAssignedConsecutives([...assignedConsecutives, newConsecutive]);
            setSelectedCentralizedConsecutive(newConsecutive._id);
            setUseCentralizedSystem(true);
            Swal.fire({ title: "Éxito", text: "Creado y asignado", icon: "success" });
          }
        }
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
    }
  };

  const addTableFieldMapping = async () => {
    if (!availableTables.length) {
      Swal.fire({ icon: "warning", title: "No hay tablas", text: "Configure tablas en 'Tablas y Campos' primero." });
      return;
    }

    const tableOptions = availableTables
      .map(t => `<option value="${t.name}">${t.name} (${t.isDetail ? "Detalle" : "Principal"})</option>`)
      .join("");

    const { value: formValues } = await Swal.fire({
      title: "Asignar Consecutivo a Tabla",
      html: `
        <div style="display: flex; flex-direction: column; gap: 15px; text-align: left;">
          <div>
            <label style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Seleccione Tabla:</label>
            <select id="table-select" class="swal2-select" style="width: 100%; margin: 5px 0 0; border-radius: 12px; border-color: #e2e8f0;">
              ${tableOptions}
            </select>
          </div>
          <div>
            <label style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Campo Destino:</label>
            <select id="field-select" class="swal2-select" style="width: 100%; margin: 5px 0 0; border-radius: 12px; border-color: #e2e8f0;" disabled>
              <option value="">Seleccione una tabla...</option>
            </select>
          </div>
        </div>
      `,
      didOpen: () => {
        const tSel = document.getElementById("table-select");
        const fSel = document.getElementById("field-select");
        const updateFields = () => {
          const selected = availableTables.find(t => t.name === tSel.value);
          if (selected?.fields.length) {
            fSel.disabled = false;
            fSel.innerHTML = selected.fields.map(f => `<option value="${f}">${f}</option>`).join("");
          } else {
            fSel.disabled = true;
            fSel.innerHTML = '<option value="">Sin campos</option>';
          }
        };
        tSel.addEventListener("change", updateFields);
        updateFields();
      },
      preConfirm: () => ({
        tableName: document.getElementById("table-select").value,
        fieldName: document.getElementById("field-select").value,
      }),
      confirmButtonColor: "#2563eb",
      customClass: { popup: 'rounded-[28px]' }
    });

    if (!formValues) return;
    if (tableMappings.some(m => m.tableName === formValues.tableName && m.fieldName === formValues.fieldName)) {
      Swal.fire({ icon: "warning", title: "Duplicado", text: "Esta asignación ya existe." });
      return;
    }

    const updated = [...(tableMappings || []), formValues];
    setTableMappings(updated);
    handleChange({ target: { name: "consecutiveConfig", value: { ...consecutiveConfig, applyToTables: updated }, type: "custom" } });
  };

  const removeTableFieldMapping = async (index) => {
    const result = await Swal.fire({
      title: "¿Eliminar?",
      text: "Se eliminará esta asignación específica.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444"
    });
    if (!result.isConfirmed) return;

    const updated = [...tableMappings];
    updated.splice(index, 1);
    setTableMappings(updated);
    handleChange({ target: { name: "consecutiveConfig", value: { ...consecutiveConfig, applyToTables: updated }, type: "custom" } });
  };

  return (
    <div className="relative bg-white border border-slate-200 rounded-[32px] p-8 mb-8 shadow-sm animate-in fade-in duration-500 overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-20 animate-in fade-in duration-300">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-lg mb-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Sincronizando...</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 mb-10 border-b border-slate-50 pb-6">
        <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <FaHashtag />
          </div>
          Configuración de Consecutivos
        </h3>
        <p className="text-sm text-slate-500 font-medium ml-13">
          Gestione la numeración automática para sus documentos y registros en el sistema de destino.
        </p>
      </div>

      {/* Enable Toggle */}
      <label className={`flex items-center gap-4 px-8 py-5 rounded-[20px] cursor-pointer transition-all border mb-8 group ${
        isEnabled ? "bg-blue-50/50 border-blue-200" : "bg-slate-50 border-slate-100 hover:bg-slate-100/50"
      }`}>
        <div className={`w-12 h-6 rounded-full p-1 transition-colors relative ${isEnabled ? "bg-blue-600" : "bg-slate-300"}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${isEnabled ? "translate-x-6" : "translate-x-0"}`} />
        </div>
        <input 
          type="checkbox" 
          className="sr-only" 
          id="consecutive-enabled"
          name="consecutiveConfig.enabled"
          checked={isEnabled}
          onChange={handleChange}
        />
        <div className="flex flex-col">
          <span className={`text-sm font-black uppercase tracking-wider ${isEnabled ? "text-blue-700" : "text-slate-500"}`}>Numeración Automática</span>
          <span className="text-[10px] font-bold text-slate-400">Activa la generación de folios secuenciales para este proceso</span>
        </div>
      </label>

      {isEnabled && (
        <div className="flex flex-col gap-10 animate-in slide-in-from-top-4 duration-500">
          {/* System Selection */}
          <div className="p-8 bg-slate-50/50 border border-slate-200 rounded-[24px] flex flex-col gap-6">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <FaCogs /> Sistema de Ejecución
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { id: "local-system", label: "Sistema Local", sub: "Configuración específica para este mapeo", icon: <FaLayerGroup />, active: !useCentralizedSystem, val: false },
                { id: "centralized-system", label: "Sistema Centralizado", sub: "Consecutivos compartidos en toda la red", icon: <FaShareAlt />, active: useCentralizedSystem, val: true }
              ].map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => setUseCentralizedSystem(opt.val)}
                  className={`p-6 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-4 ${
                    opt.active ? "bg-white border-blue-500 shadow-xl shadow-blue-500/5 ring-4 ring-blue-500/5" : "bg-white/50 border-slate-100 hover:border-slate-300 grayscale opacity-60"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${opt.active ? "bg-blue-600 text-white shadow-lg" : "bg-slate-100 text-slate-400"}`}>
                    {opt.icon}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm font-black ${opt.active ? "text-slate-900" : "text-slate-400"}`}>{opt.label}</span>
                    <span className="text-[11px] font-medium text-slate-400 leading-tight">{opt.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {useCentralizedSystem && (
              <div className="mt-4 p-8 bg-white border border-slate-200 rounded-[24px] shadow-sm animate-in zoom-in-95 duration-300">
                {assignedConsecutives.length > 0 ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Consecutivo Asignado</label>
                      <select
                        className="w-full px-5 py-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-slate-50 font-black transition-all appearance-none"
                        value={selectedCentralizedConsecutive}
                        onChange={(e) => setSelectedCentralizedConsecutive(e.target.value)}
                      >
                        {assignedConsecutives.map((c) => (
                          <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button variant="ghost" onClick={handleViewConsecutiveDetails} className="font-bold flex items-center gap-2">
                        <FaEye className="text-blue-500" /> Ver Detalles
                      </Button>
                      <Button variant="ghost" onClick={handleAddNewAssignedConsecutive} className="font-bold flex items-center gap-2">
                        <FaPlus className="text-blue-500" /> Asignar Otro
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6 py-4 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                      <FaInfoCircle className="text-2xl text-blue-500 opacity-30" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-black text-slate-900">No hay vinculaciones activas</span>
                      <p className="text-xs text-slate-400 max-w-[280px]">Asigne un consecutivo existente o cree uno nuevo para habilitar este sistema.</p>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={handleAddNewAssignedConsecutive} variant="secondary" className="px-6">Vincular Existente</Button>
                      <Button onClick={handleCreateAndAssignConsecutive} disabled={!mapping?._id} className="px-6 shadow-lg shadow-blue-600/20">Crear Nuevo</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Destination Fields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 px-1">Campo Encabezado</label>
                <p className="text-[10px] text-slate-400 font-medium px-1 mb-2">Campo en la tabla principal que recibirá el folio</p>
                <input 
                  type="text" 
                  name="consecutiveConfig.fieldName"
                  placeholder="Ej: NUM_FACTURA"
                  className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white font-black transition-all shadow-sm placeholder:text-slate-200"
                  value={consecutiveConfig.fieldName || ""}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 px-1">Campo Detalle (Opcional)</label>
                <p className="text-[10px] text-slate-400 font-medium px-1 mb-2">Campo en la tabla de detalle para vinculación</p>
                <input 
                  type="text" 
                  name="consecutiveConfig.detailFieldName"
                  placeholder="Ej: NUM_PEDIDO"
                  className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white font-black transition-all shadow-sm placeholder:text-slate-200"
                  value={consecutiveConfig.detailFieldName || ""}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {/* Local Config Specifics */}
          {!useCentralizedSystem && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 bg-slate-50/50 border border-slate-200 rounded-[24px] animate-in slide-in-from-right-4 duration-500">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Último Valor Usado</label>
                  <input 
                    type="number" 
                    name="consecutiveConfig.lastValue"
                    className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white font-black transition-all"
                    value={consecutiveConfig.lastValue || 0}
                    onChange={handleChange}
                  />
                  <small className="text-[10px] text-blue-600 font-bold px-1">El próximo valor generado será {Number(consecutiveConfig.lastValue || 0) + 1}</small>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Prefijo Local</label>
                  <input 
                    type="text" 
                    name="consecutiveConfig.prefix"
                    placeholder="Ej: INV-"
                    className="w-full px-5 py-4 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 bg-white font-black transition-all"
                    value={consecutiveConfig.prefix || ""}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Formato de Patrón</label>
                  <input 
                    type="text" 
                    name="consecutiveConfig.pattern"
                    placeholder="Ej: {PREFIX}{YEAR}-{VALUE:6}"
                    className="w-full px-5 py-4 border border-slate-200 rounded-2xl font-mono text-sm focus:outline-none focus:border-blue-500 bg-white font-black transition-all"
                    value={consecutiveConfig.pattern || ""}
                    onChange={handleChange}
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 px-1">
                    {["{PREFIX}", "{YEAR}", "{VALUE:n}", "{MONTH}", "{DAY}"].map(v => (
                      <span key={v} className="text-[9px] font-bold text-slate-400 font-mono">{v}</span>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer group mt-2">
                  <input 
                    type="checkbox" 
                    name="consecutiveConfig.updateAfterTransfer"
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={consecutiveConfig.updateAfterTransfer !== false}
                    onChange={handleChange} 
                  />
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Actualización inmediata (por documento)</span>
                </label>
              </div>
            </div>
          )}

          {/* Table-Specific Mappings */}
          <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] flex flex-col gap-6">
            <div className="flex justify-between items-center px-1">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">Asignación Específica por Tablas</span>
                <p className="text-[10px] text-slate-400 font-medium">Prioridad máxima sobre campos generales</p>
              </div>
              <Button onClick={addTableFieldMapping} className="px-6 py-2.5 text-[10px] font-black uppercase shadow-lg shadow-blue-600/20">
                <FaPlus className="mr-2" /> Añadir Mapeo
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-2">
              {tableMappings && tableMappings.length > 0 ? (
                tableMappings.map((m, index) => (
                  <div key={index} className="p-6 bg-white border border-slate-200 rounded-[20px] shadow-sm hover:border-blue-300 transition-all group flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <FaLayerGroup />
                      </div>
                      <button onClick={() => removeTableFieldMapping(index)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                        <FaTrash className="text-sm" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{m.tableName}</span>
                      <span className="text-sm font-black text-slate-900">{m.fieldName}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-12 flex flex-col items-center justify-center gap-3 opacity-30">
                  <FaInfoCircle className="text-2xl" />
                  <span className="text-xs font-black uppercase tracking-widest">Sin mapeos específicos</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsecutiveConfigSection;
