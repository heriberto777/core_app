import React, { useState, useEffect, useMemo, useRef } from "react";
import { FaTimes, FaSave, FaDatabase, FaLink, FaList, FaVial, FaQuestionCircle } from "react-icons/fa";
import {
    Button,
    Modal,
    ModalHeader,
    ModalTitle,
    ModalBody,
    ModalFooter,
    FormGroup,
    Label,
    UIInput,
    Select,
    Textarea,
    useNotification,
} from "../../index";

const FIELD_HELP = {
    name: "Identificador único de la tarea. Debe ser un nombre descriptivo sin espacios ni caracteres especiales.",
    type: "Define cómo se ejecuta la tarea: Manual (solo clic), Automática (cron), o Ambas.",
    transferType: "Dirección de la transferencia de datos entre servidores.",
    active: "Si está desmarcado, la tarea no podrá ejecutarse ni manualmente ni automáticamente.",
    clearBeforeInsert: "Elimina todos los registros de la tabla destino antes de insertar los nuevos. Útil para sincronizaciones completas.",
    updateOnDuplicate: "Si un registro ya existe en destino (mismo campo clave), actualiza sus valores en vez de saltarlo. Solo tiene efecto con \"Borrar antes de insertar\" desactivado — si no, nunca hay duplicados que actualizar.",
    query: "Consulta SQL que se ejecutará en el servidor origen para obtener los datos a transferir.",
    parameters: "Condiciones para filtrar los datos en formato JSON. Ej: [{\"field\": \"status\", \"operator\": \"=\", \"value\": \"A\"}]",
    linkedGroup: "Nombre del grupo de tareas que se ejecutarán de forma coordinada. Todas las tareas con el mismo grupo se ejecutan juntas. Si escribes el nombre de un grupo existente, esta tarea se une a él.",
    linkedExecutionOrder: "Orden de ejecución dentro del grupo. Las tareas se ejecutan en orden ascendente (0, 1, 2...). Se sugiere automáticamente al elegir un grupo existente, pero puedes cambiarlo.",
    linkedTasks: "Selecciona otras tareas que se ejecutarán automáticamente después de completar esta tarea.",
    requiredFields: "Lista de campos que deben tener valor. Si están vacíos, la transferencia fallará.",
    postUpdateQuery: "SQL que se ejecutará después de transferir los datos. Útil para actualizar estados o limpiar tablas. NO incluir WHERE, se agregará automáticamente con los registros afectados.",
    targetTable: "Tabla destino para transferencias internas (Server1 → Server1).",
    executionMode: "Normal: ejecuta todo de una vez. Batches: procesa en lotes para grandes volúmenes de datos.",
    existenceCheck: "Tabla y campo clave para verificar existencia de registros y construir el WHERE del SQL Post-Ejecución.",
    postUpdateMapping: "Si se completa, el campo clave acá ABAJO tiene prioridad sobre el 'Campo Clave' de Verificación de Existencia para construir el WHERE del SQL Post-Ejecución. Dejar vacío para usar el Campo Clave de arriba (lo normal). Útil solo cuando el nombre de la clave en la vista de origen es distinto al de la tabla que actualiza el Post-Ejecución.",
    isCoordinator: "Si esta tarea pertenece a un grupo, marca si ES la coordinadora: solo la coordinadora ejecuta su SQL Post-Ejecución durante la corrida del grupo — el de las demás tareas del grupo se ignora. Debe haber exactamente una coordinadora por grupo, y debe tener SQL Post-Ejecución definido.",
    coordinationConfig: "Configuración de cómo se coordina la ejecución dentro del grupo vinculado.",
    fieldMapping: "Mapeo de campos para transferencias DOWN (Server2 → Server1) que no usan un SELECT directo con alias — permite redirigir la tabla destino y remapear nombres de columna. Dejar todo vacío si la query principal ya hace el SELECT con los alias correctos (lo normal).",
};

const FieldHelp = ({ field }) => (
    <span className="relative inline-flex group/help cursor-help text-primary-500">
        <FaQuestionCircle size={12} />
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/help:block w-64 bg-slate-900 text-white text-xs font-normal normal-case tracking-normal leading-relaxed rounded px-3 py-2 z-20 shadow-xl">
            {FIELD_HELP[field]}
        </span>
    </span>
);

const SectionTitle = ({ children }) => (
    <h4 className="mt-3 mb-1 text-xs font-bold text-primary-600 uppercase tracking-wider">{children}</h4>
);

const TABS = [
    { id: "general", label: "General", icon: FaList },
    { id: "query", label: "SQL & Params", icon: FaDatabase },
    { id: "linking", label: "Vinculación", icon: FaLink },
    { id: "advanced", label: "Avanzado", icon: FaVial },
];

const DEFAULT_FORM_DATA = {
    name: "", type: "manual", transferType: "general", executionMode: "normal",
    active: true, clearBeforeInsert: false, updateOnDuplicate: false, query: "", parameters: "[]",
    linkedGroup: "", linkedExecutionOrder: 0, executeLinkedTasks: false,
    linkedTasks: [], postUpdateQuery: "",
    validationRules: { requiredFields: [], existenceCheck: { table: "", key: "" } },
    postUpdateMapping: { viewKey: null, tableKey: null },
    linkingMetadata: { isCoordinator: false },
    coordinationConfig: { waitForLinkedTasks: false, maxWaitTime: 300000, postUpdateStrategy: "individual" },
    fieldMapping: { sourceTable: "", targetTable: "", sourceFields: "", targetFields: "", defaultValues: "[]" },
};

export const TaskFormModal = ({ task, isOpen, onClose, onSave, allTasks = [] }) => {
    const { showError } = useNotification();
    const [activeTab, setActiveTab] = useState("general");
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

    useEffect(() => {
        if (task) {
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...task,
                parameters: JSON.stringify(task.parameters || [], null, 2),
                updateOnDuplicate: task.updateOnDuplicate || false,
                linkedGroup: task.linkedGroup || "",
                linkedExecutionOrder: task.linkedExecutionOrder || 0,
                linkedTasks: task.linkedTasks || [],
                postUpdateQuery: task.postUpdateQuery || "",
                validationRules: task.validationRules || DEFAULT_FORM_DATA.validationRules,
                postUpdateMapping: task.postUpdateMapping || DEFAULT_FORM_DATA.postUpdateMapping,
                linkingMetadata: task.linkingMetadata || DEFAULT_FORM_DATA.linkingMetadata,
                coordinationConfig: task.coordinationConfig || DEFAULT_FORM_DATA.coordinationConfig,
                fieldMapping: {
                    ...DEFAULT_FORM_DATA.fieldMapping,
                    ...(task.fieldMapping || {}),
                    sourceFields: (task.fieldMapping?.sourceFields || []).join(', '),
                    targetFields: (task.fieldMapping?.targetFields || []).join(', '),
                    defaultValues: JSON.stringify(task.fieldMapping?.defaultValues || [], null, 2),
                },
            });
        } else {
            setFormData(DEFAULT_FORM_DATA);
        }
        setActiveTab("general");
    }, [task, isOpen]);

    const existingGroupNames = useMemo(() => {
        const names = new Set(allTasks.map((t) => t.linkedGroup).filter(Boolean));
        return Array.from(names).sort();
    }, [allTasks]);

    // Órdenes ya usados por cada grupo, para poder sugerir "el siguiente
    // disponible" al unirse a uno existente en vez de forzar a adivinarlo.
    const groupTaskOrders = useMemo(() => {
        const map = {};
        allTasks.forEach((t) => {
            if (!t.linkedGroup) return;
            (map[t.linkedGroup] ||= []).push(t.linkedExecutionOrder || 0);
        });
        return map;
    }, [allTasks]);

    // Último grupo para el que ya se evaluó una sugerencia de orden (arranca
    // en el grupo con el que la tarea entró al modal). Sin este control, cada
    // vez que el campo de grupo pierde el foco sin haber cambiado de valor
    // (ej. el usuario ajustó el orden a mano y volvió a hacer clic fuera del
    // campo de grupo) se recalcularía de nuevo y pisaría el ajuste manual.
    const lastSuggestedGroupRef = useRef(task?.linkedGroup || "");
    useEffect(() => {
        lastSuggestedGroupRef.current = task?.linkedGroup || "";
    }, [task, isOpen]);

    const handleGroupBlur = () => {
        const groupName = formData.linkedGroup.trim();
        if (!groupName || groupName === lastSuggestedGroupRef.current) return;
        lastSuggestedGroupRef.current = groupName;
        const orders = groupTaskOrders[groupName];
        if (!orders || orders.length === 0) return; // grupo nuevo: se deja el valor actual (por defecto 0)
        setFormData((prev) => ({ ...prev, linkedExecutionOrder: Math.max(...orders) + 1 }));
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e?.target || {};
        if (!name) return;
        if (type === "checkbox") {
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleValidationChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            validationRules: { ...prev.validationRules, [field]: value }
        }));
    };

    const handlePostUpdateMappingChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            postUpdateMapping: { ...prev.postUpdateMapping, [field]: value || null }
        }));
    };

    const handleLinkingMetadataChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            linkingMetadata: { ...prev.linkingMetadata, [field]: value }
        }));
    };

    const handleCoordinationConfigChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            coordinationConfig: { ...prev.coordinationConfig, [field]: value }
        }));
    };

    const handleFieldMappingChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            fieldMapping: { ...prev.fieldMapping, [field]: value }
        }));
    };

    const handleSave = async () => {
        let finalData;
        try {
            finalData = {
                ...formData,
                parameters: JSON.parse(formData.parameters),
                linkedExecutionOrder: parseInt(formData.linkedExecutionOrder, 10) || 0,
                executeLinkedTasks: formData.linkedGroup !== "",
                fieldMapping: {
                    ...formData.fieldMapping,
                    sourceFields: formData.fieldMapping.sourceFields.split(',').map(s => s.trim()).filter(Boolean),
                    targetFields: formData.fieldMapping.targetFields.split(',').map(s => s.trim()).filter(Boolean),
                    defaultValues: JSON.parse(formData.fieldMapping.defaultValues),
                },
            };
        } catch (e) {
            showError("El JSON de Parámetros o de Valores por Defecto no es válido: " + e.message);
            return;
        }

        try {
            setLoading(true);
            await onSave(finalData);
        } catch (e) {
            showError(e.message || "Error al guardar la tarea");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
            <div className="flex flex-col max-h-[90vh]">
                <div className="px-6 pt-6">
                    <ModalHeader className="mb-0 pb-4">
                        <ModalTitle>{task ? "Editar Tarea de Transferencia" : "Nueva Tarea de Transferencia"}</ModalTitle>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors" aria-label="Cerrar">
                            <FaTimes />
                        </button>
                    </ModalHeader>
                </div>

                <div className="flex border-b border-slate-200 px-6">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex items-center justify-center gap-2 flex-1 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                                activeTab === id
                                    ? "text-primary-600 border-primary-600"
                                    : "text-slate-500 border-transparent hover:text-slate-800"
                            }`}
                        >
                            <Icon size={12} /> {label}
                        </button>
                    ))}
                </div>

                <div className="px-6 py-5 overflow-y-auto flex-1">
                    {activeTab === "general" && (
                        <>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Nombre de la Tarea <FieldHelp field="name" /></Label>
                                <UIInput name="name" value={formData.name} onChange={handleChange} placeholder="Ej: Importar Pedidos Pendientes" />
                            </FormGroup>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Tipo de Ejecución <FieldHelp field="type" /></Label>
                                    <Select name="type" value={formData.type} onChange={handleChange}>
                                        <option value="manual">Manual - Solo se ejecuta con botón</option>
                                        <option value="auto">Automática - Solo con programador (cron)</option>
                                        <option value="both">Ambas - Manual y Automática</option>
                                    </Select>
                                </FormGroup>
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Tipo de Transferencia <FieldHelp field="transferType" /></Label>
                                    <Select name="transferType" value={formData.transferType} onChange={handleChange}>
                                        <option value="general">General - Transferencia estándar</option>
                                        <option value="up">↑ Transfer Up (Server1 → Server2)</option>
                                        <option value="down">↓ Transfer Down (Server2 → Server1)</option>
                                        <option value="internal">⇄ Interno (Server1 → Server1)</option>
                                    </Select>
                                </FormGroup>
                            </div>

                            <div className="flex gap-3 flex-wrap mt-1 mb-4">
                                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-sm cursor-pointer hover:border-primary-500 transition-colors">
                                    <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} className="w-4 h-4 cursor-pointer accent-primary-600" />
                                    <span>Tarea Activa</span>
                                    <FieldHelp field="active" />
                                </label>
                                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-sm cursor-pointer hover:border-primary-500 transition-colors">
                                    <input type="checkbox" name="clearBeforeInsert" checked={formData.clearBeforeInsert} onChange={handleChange} className="w-4 h-4 cursor-pointer accent-primary-600" />
                                    <span>Borrar antes de insertar</span>
                                    <FieldHelp field="clearBeforeInsert" />
                                </label>
                                <label className={`flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-sm transition-colors ${formData.clearBeforeInsert ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary-500"}`}>
                                    <input type="checkbox" name="updateOnDuplicate" checked={formData.updateOnDuplicate} onChange={handleChange} disabled={formData.clearBeforeInsert} className="w-4 h-4 cursor-pointer accent-primary-600" />
                                    <span>Actualizar si ya existe</span>
                                    <FieldHelp field="updateOnDuplicate" />
                                </label>
                            </div>

                            <SectionTitle>Tabla Destino (Solo para Transferencias Internas)</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Nombre de Tabla <FieldHelp field="targetTable" /></Label>
                                <UIInput name="targetTable" value={formData.targetTable || ""} onChange={handleChange} placeholder="Ej: IMPLT_Orders" />
                            </FormGroup>
                        </>
                    )}

                    {activeTab === "query" && (
                        <>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Consulta SQL Principal <FieldHelp field="query" /></Label>
                                <Textarea name="query" value={formData.query} onChange={handleChange} height="h-32" className="font-mono text-[13px]"
                                    placeholder="SELECT NUM_PED, COD_CLI, FECHA_PED, ... FROM PEDIDO WHERE ESTADO = 'A'" />
                            </FormGroup>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Parámetros de Filtrado (JSON) <FieldHelp field="parameters" /></Label>
                                <Textarea name="parameters" value={formData.parameters} onChange={handleChange} height="h-32" className="font-mono text-[13px]"
                                    placeholder='[{"field": "ESTADO", "operator": "=", "value": "A"}, {"field": "FECHA_PED", "operator": ">=", "value": "2024-01-01"}]' />
                            </FormGroup>
                            <div className="bg-primary-50 border border-primary-100 text-primary-700 rounded p-3 text-xs">
                                <strong>Operadores disponibles:</strong> =, !=, &gt;, &lt;, &ge;, &le;, LIKE, IN, NOT IN
                            </div>
                        </>
                    )}

                    {activeTab === "linking" && (
                        <>
                            <SectionTitle>Grupo de Tareas Vinculadas</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Nombre del Grupo <FieldHelp field="linkedGroup" /></Label>
                                {/* Antes era texto libre sin ninguna referencia a los grupos ya
                                    existentes — para "agregar" una tarea a un grupo había que
                                    recordar y volver a escribir el nombre exacto, con el riesgo
                                    de un typo silencioso creando un grupo nuevo en vez de sumarse
                                    al existente. El datalist sugiere los nombres reales sin quitar
                                    la posibilidad de escribir uno nuevo para crear otro grupo. */}
                                <UIInput name="linkedGroup" value={formData.linkedGroup} onChange={handleChange}
                                    onBlur={handleGroupBlur}
                                    list="linked-group-names" autoComplete="off"
                                    placeholder="Ej: Sincronizacion_Diaria_Completa" />
                                <datalist id="linked-group-names">
                                    {existingGroupNames.map((name) => (
                                        <option key={name} value={name} />
                                    ))}
                                </datalist>
                                <small className="text-slate-400 text-[11px]">
                                    Las tareas con el mismo nombre de grupo se ejecutarán de forma coordinada.
                                    {existingGroupNames.length > 0 && " Empieza a escribir para ver los grupos existentes."}
                                </small>
                            </FormGroup>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Orden de Ejecución <FieldHelp field="linkedExecutionOrder" /></Label>
                                <UIInput type="number" name="linkedExecutionOrder" value={formData.linkedExecutionOrder} onChange={handleChange}
                                    min="0" placeholder="0" />
                                <small className="text-slate-400 text-[11px]">
                                    Las tareas se ejecutan en orden ascendente (0 → 1 → 2...). Al elegir un grupo
                                    existente se sugiere automáticamente el siguiente orden disponible — podés
                                    cambiarlo si necesitás una posición distinta.
                                </small>
                            </FormGroup>

                            <label className={`flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-sm mb-4 ${formData.linkedGroup ? "cursor-pointer hover:border-primary-500" : "opacity-50 cursor-not-allowed"}`}>
                                <input type="checkbox" checked={!!formData.linkingMetadata?.isCoordinator}
                                    disabled={!formData.linkedGroup}
                                    onChange={(e) => handleLinkingMetadataChange('isCoordinator', e.target.checked)}
                                    className="w-4 h-4 cursor-pointer accent-primary-600" />
                                <span>Es la Coordinadora del Grupo</span>
                                <FieldHelp field="isCoordinator" />
                            </label>

                            {formData.linkedGroup && (
                                <>
                                    <SectionTitle>Configuración de Coordinación <FieldHelp field="coordinationConfig" /></SectionTitle>
                                    <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded text-sm mb-3 cursor-pointer hover:border-primary-500">
                                        <input type="checkbox" checked={!!formData.coordinationConfig?.waitForLinkedTasks}
                                            onChange={(e) => handleCoordinationConfigChange('waitForLinkedTasks', e.target.checked)}
                                            className="w-4 h-4 cursor-pointer accent-primary-600" />
                                        <span>Esperar a que terminen las tareas vinculadas</span>
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                        <FormGroup>
                                            <Label>Tiempo Máximo de Espera (ms)</Label>
                                            <UIInput type="number" min="0"
                                                value={formData.coordinationConfig?.maxWaitTime ?? 300000}
                                                onChange={(e) => handleCoordinationConfigChange('maxWaitTime', parseInt(e.target.value, 10) || 0)}
                                                placeholder="300000" />
                                        </FormGroup>
                                        <FormGroup>
                                            <Label>Estrategia de Post-Actualización</Label>
                                            <Select value={formData.coordinationConfig?.postUpdateStrategy || 'individual'}
                                                onChange={(e) => handleCoordinationConfigChange('postUpdateStrategy', e.target.value)}>
                                                <option value="individual">Individual</option>
                                                <option value="coordinated">Coordinada</option>
                                                <option value="delayed">Diferida</option>
                                            </Select>
                                        </FormGroup>
                                    </div>
                                </>
                            )}

                            <SectionTitle>Vinculación Directa (Alternativa al Grupo)</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Seleccionar Tareas Vinculadas <FieldHelp field="linkedTasks" /></Label>
                                <Select multiple className="h-32"
                                    value={formData.linkedTasks}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, option => option.value);
                                        setFormData(prev => ({ ...prev, linkedTasks: values }));
                                    }}
                                >
                                    {allTasks.filter(t => t._id !== task?._id).map(t => (
                                        <option key={t._id} value={t._id}>{t.name}</option>
                                    ))}
                                </Select>
                                <small className="text-slate-400 text-[11px]">
                                    Estas tareas se ejecutarán automáticamente después de completar la actual
                                </small>
                            </FormGroup>
                        </>
                    )}

                    {activeTab === "advanced" && (
                        <>
                            <SectionTitle>Validación de Datos</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Campos Obligatorios <FieldHelp field="requiredFields" /></Label>
                                <UIInput value={formData.validationRules.requiredFields.join(', ')}
                                    onChange={(e) => handleValidationChange('requiredFields', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                    placeholder="CAMPO1, CAMPO2, CAMPO3" />
                                <small className="text-slate-400 text-[11px]">
                                    Lista de campos que no pueden estar vacíos. Separados por coma.
                                </small>
                            </FormGroup>

                            <SectionTitle>Verificación de Existencia</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Tabla <FieldHelp field="existenceCheck" /></Label>
                                    <UIInput
                                        value={formData.validationRules.existenceCheck?.table || ''}
                                        onChange={(e) => handleValidationChange('existenceCheck', { ...formData.validationRules.existenceCheck, table: e.target.value })}
                                        placeholder="CATELLI.CLIENTE" />
                                </FormGroup>
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Campo Clave <FieldHelp field="existenceCheck" /></Label>
                                    <UIInput
                                        value={formData.validationRules.existenceCheck?.key || ''}
                                        onChange={(e) => handleValidationChange('existenceCheck', { ...formData.validationRules.existenceCheck, key: e.target.value })}
                                        placeholder="Code_ofClient" />
                                </FormGroup>
                            </div>
                            <small className="text-slate-400 text-[11px] mb-3 block">
                                Tabla y campo PK para verificar existencia y construir el WHERE del SQL Post-Ejecución automáticamente.
                            </small>

                            <SectionTitle>Mapeo de Post-Actualización (avanzado, opcional)</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Clave en Vista de Origen <FieldHelp field="postUpdateMapping" /></Label>
                                    <UIInput
                                        value={formData.postUpdateMapping?.viewKey || ''}
                                        onChange={(e) => handlePostUpdateMappingChange('viewKey', e.target.value)}
                                        placeholder="Ej: Code_ofClient" />
                                </FormGroup>
                                <FormGroup>
                                    <Label className="flex items-center gap-2">Clave en Tabla Real <FieldHelp field="postUpdateMapping" /></Label>
                                    <UIInput
                                        value={formData.postUpdateMapping?.tableKey || ''}
                                        onChange={(e) => handlePostUpdateMappingChange('tableKey', e.target.value)}
                                        placeholder="Ej: code_ofclient" />
                                </FormGroup>
                            </div>
                            <small className="text-slate-400 text-[11px] mb-3 block">
                                Si Clave en Tabla Real tiene un valor, GANA sobre el Campo Clave de Verificación de Existencia de arriba
                                para construir el WHERE del SQL Post-Ejecución. Dejar ambos vacíos en el caso normal.
                            </small>

                            <SectionTitle>Consulta Post-Transferencia</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">SQL Post-Ejecución <FieldHelp field="postUpdateQuery" /></Label>
                                <Textarea name="postUpdateQuery" value={formData.postUpdateQuery} onChange={handleChange} className="font-mono text-[13px]"
                                    placeholder="UPDATE CATELLI.CLIENTE SET U_TRANSFER_STATUS = 'Normal'" />
                                <small className="text-slate-400 text-[11px]">
                                    NO incluir WHERE. Se agregará automáticamente usando el Campo Clave de verificación de existencia.
                                </small>
                            </FormGroup>

                            <SectionTitle>Modo de Ejecución</SectionTitle>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Modo de Proceso <FieldHelp field="executionMode" /></Label>
                                <Select name="executionMode" value={formData.executionMode} onChange={handleChange}>
                                    <option value="normal">Normal - Todo en una sola ejecución</option>
                                    <option value="batchesSSE">Batches (SSE) - En lotes con progreso en tiempo real</option>
                                </Select>
                            </FormGroup>

                            <SectionTitle>Mapeo de Campos — Transferencias DOWN <FieldHelp field="fieldMapping" /></SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <FormGroup>
                                    <Label>Tabla Origen (Server2)</Label>
                                    <UIInput value={formData.fieldMapping?.sourceTable || ''}
                                        onChange={(e) => handleFieldMappingChange('sourceTable', e.target.value)}
                                        placeholder="Ej: FAC_ENC_PED" />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Tabla Destino (Server1)</Label>
                                    <UIInput value={formData.fieldMapping?.targetTable || ''}
                                        onChange={(e) => handleFieldMappingChange('targetTable', e.target.value)}
                                        placeholder="Ej: IMPLT_users_fiscal" />
                                </FormGroup>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                <FormGroup>
                                    <Label>Campos Origen (en orden)</Label>
                                    <UIInput value={formData.fieldMapping?.sourceFields || ''}
                                        onChange={(e) => handleFieldMappingChange('sourceFields', e.target.value)}
                                        placeholder="VENDEDOR, RUTA, NCF" />
                                </FormGroup>
                                <FormGroup>
                                    <Label>Campos Destino (mismo orden)</Label>
                                    <UIInput value={formData.fieldMapping?.targetFields || ''}
                                        onChange={(e) => handleFieldMappingChange('targetFields', e.target.value)}
                                        placeholder="Code_Seller, Code_Route, N_Counter" />
                                </FormGroup>
                            </div>
                            <small className="text-slate-400 text-[11px] mb-3 block">
                                El campo N en &quot;Campos Origen&quot; se mapea al campo N en &quot;Campos Destino&quot; — deben tener la misma cantidad, en el mismo orden.
                            </small>
                            <FormGroup>
                                <Label>Valores por Defecto (JSON)</Label>
                                <Textarea value={formData.fieldMapping?.defaultValues ?? '[]'}
                                    onChange={(e) => handleFieldMappingChange('defaultValues', e.target.value)}
                                    height="h-20" className="font-mono text-[13px]"
                                    placeholder='[{"field": "Transfer_status", "value": 1}]' />
                            </FormGroup>
                            <small className="text-slate-400 text-[11px] mb-3 block">
                                Dejar todo esto vacío si la query principal ya hace el SELECT con los alias correctos (el caso normal, usado por la gran mayoría de las tareas).
                            </small>
                        </>
                    )}
                </div>

                <div className="px-6 pb-6">
                    <ModalFooter className="mt-0 pt-4">
                        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave} loading={loading}>
                            <FaSave /> {task ? "Actualizar Tarea" : "Crear Tarea"}
                        </Button>
                    </ModalFooter>
                </div>
            </div>
        </Modal>
    );
};
