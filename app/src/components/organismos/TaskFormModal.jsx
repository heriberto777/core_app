import React, { useState } from "react";
import { FaTimes, FaSave, FaDatabase, FaLink, FaList, FaQuestionCircle, FaPlay, FaCogs, FaSync, FaClock, FaTrash, FaUsers, FaLink as FaLinkIcon } from "react-icons/fa";
import { Button, Input, Select, StatusBadge } from "../../index";

/**
 * Corporate TaskFormModal (Tailwind Edition)
 * Formulario completo para crear/editar tareas de transferencia
 */
export function TaskFormModal({
    isOpen,
    onClose,
    onSave,
    task = null,
    loading = false,
    allTasks = [],
    accessToken
}) {
    const [activeTab, setActiveTab] = useState("general");
    const [formData, setFormData] = useState({ ...task });

    if (!isOpen) return null;

    const tabs = [
        { id: "general", label: "General", icon: <FaList /> },
        { id: "database", label: "Base de Datos", icon: <FaDatabase /> },
        { id: "mapping", label: "Mapeo", icon: <FaLink /> },
        { id: "workflow", label: "Flujo", icon: <FaLinkIcon /> },
        { id: "execution", label: "Ejecución", icon: <FaPlay /> },
    ];

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave?.(formData);
    };

    const getTaskOptions = () => {
        // Filtrar tareas que no sean la actual (evitar circularidad)
        return allTasks.filter(t => t._id !== task?._id);
    };

    const nextTasksOptions = getTaskOptions().map(t => (
        <option key={t._id} value={t._id}>{t.name}</option>
    ));

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-[95%] max-w-[1000px] max-h-[95vh] rounded-xl flex flex-col shadow-premium border border-slate-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800 m-0">
                        {task ? "Editar Tarea" : "Nueva Tarea"}
                    </h2>
                    <button onClick={onClose} className="bg-transparent border-none text-slate-400 cursor-pointer hover:text-slate-600">
                        <FaTimes />
                    </button>
                </div>

                {/* TABS */}
                <div className="flex bg-slate-50 border-b border-slate-200 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex-1 px-4 py-3 border-none bg-none text-sm font-semibold cursor-pointer border-b-2 transition-all duration-200 flex items-center justify-center gap-2
                                ${activeTab === tab.id
                                    ? "text-primary-500 border-primary-500"
                                    : "text-slate-500 border-transparent hover:bg-slate-100"}
                            `}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* BODY */}
                <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-6">
                    {/* GENERAL TAB */}
                    {activeTab === "general" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    Nombre de la Tarea
                                    <FaQuestionCircle className="text-primary-500 cursor-help text-xs" />
                                </label>
                                <input
                                    type="text"
                                    value={formData.name || ""}
                                    onChange={e => handleChange("name", e.target.value)}
                                    placeholder="Nombre identificador de la tarea"
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Descripción</label>
                                <textarea
                                    value={formData.description || ""}
                                    onChange={e => handleChange("description", e.target.value)}
                                    placeholder="Descripción opcional de la tarea"
                                    rows={3}
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-y"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tipo de Tarea</label>
                                    <Select
                                        value={formData.type || "both"}
                                        onChange={e => handleChange("type", e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    >
                                        <option value="manual">Manuales</option>
                                        <option value="auto">Automáticas</option>
                                        <option value="both">Ambas</option>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Transfer Type</label>
                                    <Select
                                        value={formData.transferType || "general"}
                                        onChange={e => handleChange("transferType", e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    >
                                        <option value="up">↑ Up (Server2 → Server1)</option>
                                        <option value="down">↓ Down (Server1 → Server2)</option>
                                        <option value="internal">⇄ Internal</option>
                                        <option value="general">○ General</option>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Ejecución</label>
                                    <Select
                                        value={formData.executionMode || "normal"}
                                        onChange={e => handleChange("executionMode", e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="batchesSSE">Batches SSE</option>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Cron (Programación)</label>
                                    <input
                                        type="text"
                                        value={formData.schedule || ""}
                                        onChange={e => handleChange("schedule", e.target.value)}
                                        placeholder="0 * * * *"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Base de Datos Origen</label>
                                    <Select
                                        value={formData.sourceServer || "server2"}
                                        onChange={e => handleChange("sourceServer", e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    >
                                        <option value="server2">Server 2 (ERP)</option>
                                        <option value="server1">Server 1 (Warehouse)</option>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Base de Datos Destino</label>
                                    <Select
                                        value={formData.targetServer || "server1"}
                                        onChange={e => handleChange("targetServer", e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    >
                                        <option value="server1">Server 1 (Warehouse)</option>
                                        <option value="server2">Server 2 (ERP)</option>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">SQL Query</label>
                                <textarea
                                    value={formData.query || ""}
                                    onChange={e => handleChange("query", e.target.value)}
                                    placeholder="SELECT * FROM tabla WHERE ..."
                                    rows={4}
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-y"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Clear Before Insert</label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.clearBeforeInsert || false}
                                        onChange={e => handleChange("clearBeforeInsert", e.target.checked)}
                                        className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm font-bold text-slate-600">Borrar registros antes de insertar</span>
                                </label>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Target Table (Internal)</label>
                                <input
                                    type="text"
                                    value={formData.targetTable || ""}
                                    onChange={e => handleChange("targetTable", e.target.value)}
                                    placeholder="Tabla destino para transferencias internas"
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Field Mapping</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        value={formData.fieldMapping?.sourceTable || ""}
                                        onChange={e => handleChange("fieldMapping", { ...formData.fieldMapping, sourceTable: e.target.value })}
                                        placeholder="Tabla origen"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                    <input
                                        type="text"
                                        value={formData.fieldMapping?.targetTable || ""}
                                        onChange={e => handleChange("fieldMapping", { ...formData.fieldMapping, targetTable: e.target.value })}
                                        placeholder="Tabla destino"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Next Tasks</label>
                                <div className="flex flex-col gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        const newTask = allTasks.find(t => t._id !== task?._id);
                                        setFormData(prev => ({
                                            ...prev,
                                            nextTasks: [...(prev.nextTasks || []), newTask]
                                        }));
                                    }} className="w-full justify-between">
                                        <span>+ Añadir Tarea Siguiente</span>
                                        <span className="text-xs text-slate-400">Selecciona una tarea para ejecutar después</span>
                                    </Button>
                                    {formData.nextTasks && formData.nextTasks.length > 0 && (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs font-bold text-slate-500">Tareas Siguientes:</label>
                                            {formData.nextTasks.map((taskId, idx) => {
                                                const task = allTasks.find(t => t._id === taskId);
                                                return task ? (
                                                    <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                                                        <span className="text-sm font-medium">{task.name}</span>
                                                        <Button variant="ghost" size="sm" onClick={() => {
                                                            const newTasks = formData.nextTasks.filter((_, i) => i !== idx);
                                                            setFormData(prev => ({ ...prev, nextTasks: newTasks }));
                                                        }} className="text-red-500">
                                                            <FaTrash />
                                                        </Button>
                                                    </div>
                                                ) : null;
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Linked Tasks</label>
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="text"
                                        value={formData.linkedGroup || ""}
                                        onChange={e => handleChange("linkedGroup", e.target.value)}
                                        placeholder="Nombre del grupo de tareas vinculadas"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                    <p className="text-xs text-slate-400">Las tareas vinculadas se ejecutarán juntas automáticamente</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Linked Execution Order</label>
                                <input
                                    type="number"
                                    value={formData.linkedExecutionOrder || 0}
                                    onChange={e => handleChange("linkedExecutionOrder", parseInt(e.target.value) || 0)}
                                    placeholder="0"
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Post-Update Query</label>
                                <textarea
                                    value={formData.postUpdateQuery || ""}
                                    onChange={e => handleChange("postUpdateQuery", e.target.value)}
                                    placeholder="SELECT * FROM tabla WHERE ..."
                                    rows={3}
                                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-y"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Post-Update Mapping</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        value={formData.postUpdateMapping?.viewKey || ""}
                                        onChange={e => handleChange("postUpdateMapping", { ...formData.postUpdateMapping, viewKey: e.target.value })}
                                        placeholder="viewKey"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                    <input
                                        type="text"
                                        value={formData.postUpdateMapping?.tableKey || ""}
                                        onChange={e => handleChange("postUpdateMapping", { ...formData.postUpdateMapping, tableKey: e.target.value })}
                                        placeholder="tableKey"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DATABASE TAB */}
                    {activeTab === "database" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-3">Configuración de Conexión</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-slate-500">Server Origen</label>
                                        <Select
                                            value={formData.sourceServer || "server2"}
                                            onChange={e => handleChange("sourceServer", e.target.value)}
                                            className="w-full"
                                        >
                                            <option value="server2">Server 2 (ERP)</option>
                                            <option value="server1">Server 1 (Warehouse)</option>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-slate-500">Server Destino</label>
                                        <Select
                                            value={formData.targetServer || "server1"}
                                            onChange={e => handleChange("targetServer", e.target.value)}
                                            className="w-full"
                                        >
                                            <option value="server1">Server 1 (Warehouse)</option>
                                            <option value="server2">Server 2 (ERP)</option>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-200">
                                <h4 className="font-bold text-emerald-700 mb-3">Estado de Conexión</h4>
                                <StatusBadge status={formData.active ? "active" : "inactive"} />
                                <p className="text-sm text-emerald-600 mt-2">
                                    {formData.active ? "Conexiones activas y listas para usar" : "Conexiones desactivadas"}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* MAPPING TAB */}
                    {activeTab === "mapping" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-3">Campo Marcado</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={formData.markProcessedField || ""}
                                        onChange={e => handleChange("markProcessedField", e.target.value)}
                                        placeholder="Ej: IS_PROCESSED"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                    <input
                                        type="number"
                                        value={formData.markProcessedValue || ""}
                                        onChange={e => handleChange("markProcessedValue", parseInt(e.target.value) || 0)}
                                        placeholder="Ej: 1"
                                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-200">
                                <h4 className="font-bold text-blue-700 mb-3">Validaciones</h4>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={formData.validationRules?.existenceCheck?.enabled || false} onChange={e => handleChange("validationRules", { ...formData.validationRules, existenceCheck: { ...formData.validationRules.existenceCheck, enabled: e.target.checked } })} />
                                        <span className="text-sm font-bold text-slate-600">Validar existencia de registros</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* WORKFLOW TAB */}
                    {activeTab === "workflow" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-purple-50/50 rounded-lg border border-purple-200">
                                <h4 className="font-bold text-purple-700 mb-3">Workflow Configuration</h4>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.workflowConfig?.enabled !== false}
                                            onChange={e => handleChange("workflowConfig", { ...formData.workflowConfig, enabled: e.target.checked })}
                                        />
                                        <span className="text-sm font-bold text-slate-600">Habilitar Encadenamiento (PADRE)</span>
                                    </label>

                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.workflowConfig?.stopWorkflowOnError !== false}
                                            onChange={e => handleChange("workflowConfig", { ...formData.workflowConfig, stopWorkflowOnError: e.target.checked })}
                                        />
                                        <span className="text-sm font-bold text-slate-600">Detener workflow en error</span>
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-3">Siguientes Mapeos</h4>
                                <div className="flex flex-col gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        const filteredTasks = allTasks.filter(t => t._id !== task?._id);
                                        const nextMapping = filteredTasks[0];
                                        if (nextMapping) {
                                            setFormData(prev => ({
                                                ...prev,
                                                workflowConfig: {
                                                    ...formData.workflowConfig,
                                                    nextMappings: [...(formData.workflowConfig?.nextMappings || []), nextMapping]
                                                }
                                            }));
                                        }
                                    }} className="w-full justify-between">
                                        <span>+ Añadir Siguiente Mapeo</span>
                                        <span className="text-xs text-slate-400">Selecciona una tarea para ejecutar después</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* EXECUTION TAB */}
                    {activeTab === "execution" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="p-4 bg-orange-50/50 rounded-lg border border-orange-200">
                                <h4 className="font-bold text-orange-700 mb-3">Estado de Ejecución</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-slate-500">Ejecuciones</label>
                                        <input
                                            type="number"
                                            value={formData.executionCount || 0}
                                            onChange={e => handleChange("executionCount", parseInt(e.target.value) || 0)}
                                            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-slate-500">Progreso Actual</label>
                                        <input
                                            type="number"
                                            value={formData.progress || 0}
                                            onChange={e => handleChange("progress", parseInt(e.target.value) || 0)}
                                            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-3">Historial de Ejecución</h4>
                                <div className="flex flex-col gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        const task = allTasks.find(t => t._id === task?._id);
                                        if (task) {
                                            handleChange("lastExecutionDate", task.lastExecutionDate);
                                            handleChange("lastExecutionResult", task.lastExecutionResult);
                                        }
                                    }} className="w-full justify-between">
                                        <span>Ver Última Ejecución</span>
                                        <span className="text-xs text-slate-400">Cargar datos de la última ejecución</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 border-none rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <FaSave />
                        {loading ? "Guardando..." : "Guardar Tarea"}
                    </button>
                </div>
            </div>
        </div>
    );
}
