import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaPlus, FaTrash, FaCogs, FaDatabase, FaEye, FaSync } from "react-icons/fa";
import { Button, Input } from "../../index";

/**
 * FieldMappingModal (Tailwind Edition)
 * Modal corporativo avanzado para configuración de mapeo de campos.
 */
export function FieldMappingModal({ isOpen, onClose, onSave, initialData, consecutives = [] }) {
    const [formData, setFormData] = useState({
        sourceField: "",
        targetField: "",
        defaultValue: "",
        valueType: "text",
        removePrefix: "",
        isRequired: false,
        lookupFromTarget: false,
        lookupQuery: "",
        lookupParams: [],
        validateExistence: false,
        failIfNotFound: false,
        isEditable: true,
        showInList: false,
        displayName: "",
        displayOrder: 0,
        fieldGroup: "",
        fieldType: "text",
        unitConversion: { enabled: false },
        isConsecutive: false,
        consecutiveId: "",
        transform: {
          transformType: "",
          toUpperCase: false,
          toLowerCase: false,
          trim: true,
          maxLength: "",
          decimalPlaces: 2,
          thousandsSeparator: false,
          dateFormat: "YYYY-MM-DD",
          datetimeFormat: "YYYY-MM-DDTHH:MM:SS",
          trueValues: ["S", "Y", "1"],
          falseValues: ["N", "0"],
          trueOutput: "S",
          falseOutput: "N",
          defaultValue: ""
        }
    });
    const [loading, setLoading] = useState(false);
    const [showTransformConfig, setShowTransformConfig] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (initialData) {
            if (initialData.transform?.transformType) {
                setShowTransformConfig(true);
            }
            setFormData({
                ...initialData,
                sourceField: initialData.sourceField || "",
                defaultValue: initialData.defaultValue || "",
                valueType: initialData.fieldType || initialData.valueType || "text",
                removePrefix: initialData.removePrefix || "",
                lookupQuery: initialData.lookupQuery || "",
                lookupParams: initialData.lookupParams || [],
                displayName: initialData.displayName || "",
                fieldGroup: initialData.fieldGroup || "",
            });
        } else {
            setShowTransformConfig(false);
            setFormData({
                sourceField: "", targetField: "", defaultValue: "", valueType: "text",
                removePrefix: "", isRequired: false, lookupFromTarget: false,
                lookupQuery: "", lookupParams: [], validateExistence: false,
                failIfNotFound: false, isEditable: true, showInList: false,
                displayName: "", displayOrder: 0, fieldGroup: "", fieldType: "text",
                unitConversion: { enabled: false }, isConsecutive: false, consecutiveId: "",
                transform: {
                  transformType: "", trim: true, decimalPlaces: 2,
                  dateFormat: "YYYY-MM-DD", datetimeFormat: "YYYY-MM-DDTHH:MM:SS",
                  trueValues: ["S", "Y", "1"], falseValues: ["N", "0"],
                  trueOutput: "S", falseOutput: "N"
                }
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
          const [parent, child] = name.split('.');
          setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [child]: type === "checkbox" ? checked : value }
          }));
        } else {
          setFormData(prev => ({
              ...prev,
              [name]: type === "checkbox" ? checked : value
          }));
        }
    };

    const addParam = () => {
        setFormData(prev => ({
            ...prev,
            lookupParams: [...prev.lookupParams, { paramName: "", sourceField: "", removePrefix: "" }]
        }));
    };

    const updateParam = (index, field, value) => {
        setFormData(prev => {
            const newParams = [...prev.lookupParams];
            newParams[index] = { ...newParams[index], [field]: value };
            return { ...prev, lookupParams: newParams };
        });
    };

    const removeParam = (index) => {
        setFormData(prev => {
            const newParams = [...prev.lookupParams];
            newParams.splice(index, 1);
            return { ...prev, lookupParams: newParams };
        });
    };

    const handleSubmit = async () => {
        if (!formData.targetField) return;

        // Validación de Lookup
        if (formData.lookupFromTarget && !formData.lookupQuery) {
            Swal.fire({
                icon: 'warning',
                title: 'Error',
                text: 'La consulta SQL es obligatoria para Lookup',
                confirmButtonText: 'OK'
            });
            return;
        }

        // Validar que el SQL tenga @parametro
        if (formData.lookupFromTarget && !formData.lookupQuery.includes('@')) {
            Swal.fire({
                icon: 'warning',
                title: 'Error',
                text: 'La consulta SQL debe contener al menos un @parametro',
                confirmButtonText: 'OK'
            });
            return;
        }

        setLoading(true);
        try {
            const dataToSave = {
                ...formData,
                fieldType: formData.valueType,
                transform: JSON.parse(JSON.stringify(formData.transform)) || {}
            };
            await onSave(dataToSave);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-[32px] shadow-premium flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
                {/* HEADER */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                        <FaCogs size={18} />
                      </div>
                      {initialData ? "Editar Mapeo de Campo" : "Nuevo Mapeo de Campo"}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                        <FaTimes />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                    {/* SECCIÓN BÁSICOS */}
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <FaDatabase size={14} /> Conceptos Básicos
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input label="Campo Origen (Opcional)" name="sourceField" value={formData.sourceField} onChange={handleChange} placeholder="Ej: COD_CLT" />
                            <Input label="Campo Destino (Obligatorio)" name="targetField" value={formData.targetField} onChange={handleChange} placeholder="Ej: CODIGO" />
                        </div>
                        <div className="flex gap-6 pt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" name="isRequired" checked={formData.isRequired} onChange={handleChange} className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500" />
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Obligatorio</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" name="lookupFromTarget" checked={formData.lookupFromTarget} onChange={handleChange} className="w-5 h-5 rounded-lg text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Lookup en BD Destino</span>
                            </label>
                        </div>
                    </div>

                    {/* SISTEMA DE CONSECUTIVOS */}
                    <div className="bg-amber-50/30 rounded-2xl p-6 border border-amber-100 space-y-4">
                        <label className="flex items-center gap-4 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                name="isConsecutive" 
                                checked={formData.isConsecutive} 
                                onChange={handleChange}
                                className="w-6 h-6 rounded-lg text-amber-600 border-amber-200 focus:ring-amber-500"
                            />
                            <div>
                                <div className="text-base font-extrabold text-amber-900">Usar Consecutivo Independiente</div>
                                <div className="text-xs font-medium text-amber-600/70">Habilita una secuencia numérica propia para este campo.</div>
                            </div>
                        </label>

                        {formData.isConsecutive && (
                            <div className="pt-2 animate-fadeIn">
                                <label className="text-[13px] font-semibold text-amber-700 ml-1 mb-1.5 block">Seleccionar Consecutivo</label>
                                <select 
                                    name="consecutiveId" 
                                    value={formData.consecutiveId} 
                                    onChange={handleChange}
                                    className="w-full py-2.5 px-4 text-sm rounded-xl border border-amber-200 bg-white focus:border-amber-500 outline-none transition-all"
                                >
                                    <option value="">-- Seleccione un consecutivo --</option>
                                    {consecutives.map(c => (
                                        <option key={c._id} value={c._id}>
                                            {c.name} ({c.formatted || c.lastValue})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* TRANSFORMACIÓN O LOOKUP */}
                    {!formData.lookupFromTarget ? (
                        <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-6">
                            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <FaSync size={14} /> Transformación y Valores
                            </h4>
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[13px] font-semibold text-slate-500 ml-1">Valor por Defecto / Función SQL</label>
                                <textarea 
                                  name="defaultValue" 
                                  value={formData.defaultValue} 
                                  onChange={handleChange} 
                                  placeholder="Ej: GETDATE() o VALOR"
                                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none transition-all min-h-[100px]"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <label className="text-[13px] font-semibold text-slate-500 ml-1">Tipo de Dato</label>
                                    <select name="valueType" value={formData.valueType || "text"} onChange={handleChange} className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none">
                                        <option value="text">Texto</option>
                                        <option value="number">Número</option>
                                        <option value="date">Fecha</option>
                                        <option value="boolean">Boolean</option>
                                    </select>
                                </div>
                                <Input label="Eliminar Prefijo" name="removePrefix" value={formData.removePrefix} onChange={handleChange} placeholder="Ej: CN" />
                            </div>
                        </div>
                    ) : (
                        <div className="bg-indigo-50/30 rounded-2xl p-6 border border-indigo-100 space-y-6">
                            <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                              <FaEye size={14} /> Configuración de Consulta (Lookup)
                            </h4>
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[13px] font-semibold text-indigo-700 ml-1">Consulta SQL (use @parametro)</label>
                                <textarea 
                                  name="lookupQuery" 
                                  value={formData.lookupQuery} 
                                  onChange={handleChange} 
                                  placeholder="SELECT NOMBRE FROM CLIENTE WHERE ID = @codigo"
                                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-indigo-200 bg-white focus:border-indigo-500 outline-none transition-all min-h-[100px]"
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[13px] font-bold text-indigo-700">Parámetros de Consulta</label>
                                    <Button variant="ghost" size="sm" onClick={addParam} className="text-indigo-600 hover:bg-indigo-100"><FaPlus /> Añadir</Button>
                                </div>

                                <div className="space-y-3">
                                  {formData.lookupParams.map((p, i) => (
                                      <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-indigo-100 shadow-sm animate-fadeIn">
                                          <input placeholder="@nombre" value={p.paramName} onChange={e => updateParam(i, 'paramName', e.target.value)} className="py-2 px-3 text-xs rounded-lg border border-slate-100 focus:border-indigo-300 outline-none" />
                                          <input placeholder="Campo Origen" value={p.sourceField} onChange={e => updateParam(i, 'sourceField', e.target.value)} className="py-2 px-3 text-xs rounded-lg border border-slate-100 focus:border-indigo-300 outline-none" />
                                          <input placeholder="Prefijo" value={p.removePrefix} onChange={e => updateParam(i, 'removePrefix', e.target.value)} className="py-2 px-3 text-xs rounded-lg border border-slate-100 focus:border-indigo-300 outline-none" />
                                          <button onClick={() => removeParam(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex justify-center"><FaTrash /></button>
                                      </div>
                                  ))}
                                </div>
                            </div>

                            <div className="flex gap-6 pt-2">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" name="validateExistence" checked={formData.validateExistence} onChange={handleChange} className="w-5 h-5 rounded-lg text-indigo-600 border-indigo-200 focus:ring-indigo-500" />
                                    <span className="text-sm font-bold text-indigo-700/70 group-hover:text-indigo-900 transition-colors">Validar existencia</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" name="failIfNotFound" checked={formData.failIfNotFound} onChange={handleChange} className="w-5 h-5 rounded-lg text-red-600 border-red-200 focus:ring-red-500" />
                                    <span className="text-sm font-bold text-red-700/70 group-hover:text-red-900 transition-colors">Fallar si no existe</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* VISUALIZACIÓN Y TRANSFORMACIÓN AVANZADA */}
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-6">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <FaEye size={14} /> Propiedades de Visualización
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Input label="Nombre a Mostrar" name="displayName" value={formData.displayName} onChange={handleChange} placeholder="Ej: Código Cliente" />
                            <Input label="Grupo" name="fieldGroup" value={formData.fieldGroup} onChange={handleChange} placeholder="Ej: Info General" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[13px] font-semibold text-slate-500 ml-1">Tipo de Campo UI</label>
                                <select name="fieldType" value={formData.fieldType} onChange={handleChange} className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none">
                                    <option value="text">Texto</option>
                                    <option value="number">Número</option>
                                    <option value="date">Fecha</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="select">Select</option>
                                    <option value="textarea">Área de texto</option>
                                </select>
                            </div>
                            <Input type="number" label="Orden" name="displayOrder" value={formData.displayOrder} onChange={handleChange} />
                        </div>
                        <div className="flex gap-6 pt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" name="isEditable" checked={formData.isEditable} onChange={handleChange} className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500" />
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Editable</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" name="showInList" checked={formData.showInList} onChange={handleChange} className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500" />
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Mostrar en Listas</span>
                            </label>
                        </div>

                        {/* TRANSFORMACIÓN AVANZADA */}
                        <div className="pt-4 border-t border-slate-200">
                            <label className="flex items-center gap-3 cursor-pointer group text-primary-600">
                                <input 
                                    type="checkbox" 
                                    checked={showTransformConfig} 
                                    onChange={(e) => setShowTransformConfig(e.target.checked)}
                                    className="w-5 h-5 rounded-lg text-primary-600 border-primary-200 focus:ring-primary-500"
                                />
                                <span className="text-sm font-extrabold uppercase tracking-widest">⚙️ Configurar Transformación Avanzada</span>
                            </label>

                            {showTransformConfig && (
                                <div className="mt-6 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-6 animate-fadeIn">
                                    <div className="flex flex-col gap-1.5 w-full">
                                        <label className="text-[13px] font-semibold text-slate-500 ml-1">Tipo de Dato Final</label>
                                        <select 
                                            name="transform.transformType" 
                                            value={formData.transform?.transformType || ""} 
                                            onChange={handleChange}
                                            className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
                                        >
                                            <option value="">Sin transformación</option>
                                            <option value="string">Texto (String)</option>
                                            <option value="number">Número</option>
                                            <option value="date">Fecha</option>
                                            <option value="datetime">Fecha y Hora</option>
                                            <option value="boolean">Booleano</option>
                                        </select>
                                    </div>

                                    {formData.transform?.transformType && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                        {formData.transform.transformType === "string" && (
                                          <>
                                            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" name="transform.toUpperCase" checked={formData.transform.toUpperCase} onChange={handleChange} /> <span className="text-sm font-medium">Mayúsculas</span></label>
                                            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" name="transform.toLowerCase" checked={formData.transform.toLowerCase} onChange={handleChange} /> <span className="text-sm font-medium">Minúsculas</span></label>
                                            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" name="transform.trim" checked={formData.transform.trim} onChange={handleChange} /> <span className="text-sm font-medium">Trim</span></label>
                                            <Input type="number" label="Longitud Máx." name="transform.maxLength" value={formData.transform.maxLength} onChange={handleChange} />
                                          </>
                                        )}
                                        {formData.transform.transformType === "number" && (
                                          <>
                                            <div className="flex flex-col gap-1.5 w-full">
                                              <label className="text-[13px] font-semibold text-slate-500 ml-1">Decimales</label>
                                              <select name="transform.decimalPlaces" value={formData.transform.decimalPlaces} onChange={handleChange} className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none">
                                                {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                                              </select>
                                            </div>
                                            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" name="transform.thousandsSeparator" checked={formData.transform.thousandsSeparator} onChange={handleChange} /> <span className="text-sm font-medium">Sep. Miles</span></label>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    <Input label="Valor por defecto (si es null)" name="transform.defaultValue" value={formData.transform?.defaultValue || ""} onChange={handleChange} placeholder="N/A" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave /> {initialData ? "Actualizar Mapeo" : "Guardar Mapeo"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
