import React, { useState, useEffect } from "react";
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
    query: "Consulta SQL que se ejecutará en el servidor origen para obtener los datos a transferir.",
    parameters: "Condiciones para filtrar los datos en formato JSON. Ej: [{\"field\": \"status\", \"operator\": \"=\", \"value\": \"A\"}]",
    linkedGroup: "Nombre del grupo de tareas que se ejecutarán de forma coordinada. Todas las tareas con el mismo grupo se ejecutan juntas.",
    linkedExecutionOrder: "Orden de ejecución dentro del grupo. Las tareas se ejecutan en orden ascendente (0, 1, 2...).",
    linkedTasks: "Selecciona otras tareas que se ejecutarán automáticamente después de completar esta tarea.",
    requiredFields: "Lista de campos que deben tener valor. Si están vacíos, la transferencia fallará.",
    postUpdateQuery: "SQL que se ejecutará después de transferir los datos. Útil para actualizar estados o limpiar tablas. NO incluir WHERE, se agregará automáticamente con los registros afectados.",
    targetTable: "Tabla destino para transferencias internas (Server1 → Server1).",
    executionMode: "Normal: ejecuta todo de una vez. Batches: procesa en lotes para grandes volúmenes de datos.",
    existenceCheck: "Tabla y campo clave para verificar existencia de registros y construir el WHERE del SQL Post-Ejecución.",
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

export const TaskFormModal = ({ task, isOpen, onClose, onSave, allTasks = [] }) => {
    const { showError } = useNotification();
    const [activeTab, setActiveTab] = useState("general");
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "", type: "manual", transferType: "general", executionMode: "normal",
        active: true, clearBeforeInsert: false, query: "", parameters: "[]",
        linkedGroup: "", linkedExecutionOrder: 0, executeLinkedTasks: false,
        linkedTasks: [], postUpdateQuery: "",
        validationRules: { requiredFields: [], existenceCheck: { table: "", key: "" } },
        postUpdateMapping: { viewKey: null, tableKey: null }
    });

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                parameters: JSON.stringify(task.parameters || [], null, 2),
                linkedGroup: task.linkedGroup || "",
                linkedExecutionOrder: task.linkedExecutionOrder || 0,
                linkedTasks: task.linkedTasks || [],
                postUpdateQuery: task.postUpdateQuery || "",
                validationRules: task.validationRules || { requiredFields: [], existenceCheck: { table: "", key: "" } },
                postUpdateMapping: task.postUpdateMapping || { viewKey: null, tableKey: null }
            });
        } else {
            setFormData({
                name: "", type: "manual", transferType: "general", executionMode: "normal",
                active: true, clearBeforeInsert: false, query: "", parameters: "[]",
                linkedGroup: "", linkedExecutionOrder: 0, executeLinkedTasks: false,
                linkedTasks: [], postUpdateQuery: "",
                validationRules: { requiredFields: [], existenceCheck: { table: "", key: "" } },
                postUpdateMapping: { viewKey: null, tableKey: null }
            });
        }
        setActiveTab("general");
    }, [task, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
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

    const handleSave = async () => {
        let finalData;
        try {
            finalData = {
                ...formData,
                parameters: JSON.parse(formData.parameters),
                linkedExecutionOrder: parseInt(formData.linkedExecutionOrder, 10) || 0,
                executeLinkedTasks: formData.linkedGroup !== ""
            };
        } catch (e) {
            showError("El JSON de Parámetros no es válido: " + e.message);
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
                                <UIInput name="linkedGroup" value={formData.linkedGroup} onChange={handleChange}
                                    placeholder="Ej: Sincronizacion_Diaria_Completa" />
                                <small className="text-slate-400 text-[11px]">
                                    Las tareas con el mismo nombre de grupo se ejecutarán de forma coordinada
                                </small>
                            </FormGroup>
                            <FormGroup>
                                <Label className="flex items-center gap-2">Orden de Ejecución <FieldHelp field="linkedExecutionOrder" /></Label>
                                <UIInput type="number" name="linkedExecutionOrder" value={formData.linkedExecutionOrder} onChange={handleChange}
                                    min="0" placeholder="0" />
                                <small className="text-slate-400 text-[11px]">
                                    Las tareas se ejecutan en orden ascendente (0 → 1 → 2...)
                                </small>
                            </FormGroup>

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
