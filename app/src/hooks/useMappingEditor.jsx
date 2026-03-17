import { useState, useEffect, useCallback } from "react";
import { MappingApi, ConsecutiveApi } from "../api/index";
import Swal from "sweetalert2";

const api = new MappingApi();
const consecutiveApi = new ConsecutiveApi();

const INITIAL_MAPPING_STATE = {
    name: "",
    description: "",
    transferType: "down",
    active: true,
    sourceServer: "server2",
    targetServer: "server1",
    entityType: "orders",
    documentTypeRules: [],
    tableConfigs: [],
    markProcessedField: "IS_PROCESSED",
    markProcessedValue: 1,
    consecutiveConfig: { enabled: false },
    foreignKeyDependencies: [],
};

export function useMappingEditor(mappingId, accessToken, onSave, onCancel) {
    const [mapping, setMapping] = useState(INITIAL_MAPPING_STATE);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isEditing = !!mappingId;

    const loadMapping = useCallback(async () => {
        if (!mappingId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const data = await api.getMappingById(accessToken, mappingId);
            if (data) {
                setMapping(data);
            }
        } catch (error) {
            console.error("Error al cargar la configuración:", error);
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "No se pudo cargar la configuración",
            });
            if (onCancel) onCancel();
        } finally {
            setLoading(false);
        }
    }, [mappingId, accessToken, onCancel]);

    useEffect(() => {
        loadMapping();
    }, [loadMapping]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        if (type === "custom" && name === "consecutiveConfig") {
            setMapping((prev) => ({ ...prev, consecutiveConfig: value }));
            return;
        }

        if (name.includes(".")) {
            const [parent, child] = name.split(".");
            setMapping((prev) => ({
                ...prev,
                [parent]: {
                    ...(prev[parent] || {}),
                    [child]: type === "checkbox" ? checked : value,
                },
            }));
        } else {
            setMapping((prev) => ({
                ...prev,
                [name]: type === "checkbox" ? checked : value,
            }));
        }
    };

    const handleSave = async () => {
        if (!mapping.name) {
            Swal.fire({ icon: "warning", title: "Datos incompletos", text: "El nombre es obligatorio" });
            return;
        }

        if (mapping.tableConfigs.length === 0) {
            Swal.fire({ icon: "warning", title: "Configuración incompleta", text: "Debe configurar al menos una tabla" });
            return;
        }

        setSaving(true);
        try {
            const mappingCopy = JSON.parse(JSON.stringify(mapping));

            // Normalización de campos
            mappingCopy.tableConfigs.forEach(table => {
                table.fieldMappings?.forEach(field => {
                    field.isEditable = field.isEditable !== false;
                    field.showInList = field.showInList === true;
                    field.displayOrder = field.displayOrder || 0;
                    field.fieldType = field.fieldType || "text";
                    if (field.fieldType !== "select") field.options = null;
                });
            });

            let result;
            if (isEditing) {
                result = await api.updateMapping(accessToken, mappingId, mappingCopy);
            } else {
                result = await api.createMapping(accessToken, mappingCopy);
            }

            if (result) {
                // Si hay un consecutivo pendiente de asignar (en creación de mapping nuevo)
                if (!isEditing && mapping.consecutiveConfig?.pendingAssignmentId && result.data?._id) {
                    try {
                        await consecutiveApi.assignConsecutive(accessToken, mapping.consecutiveConfig.pendingAssignmentId, {
                            entityType: "mapping",
                            entityId: result.data._id,
                            allowedOperations: ["read", "increment"]
                        });
                        console.log("Consecutivo vinculado automáticamente tras creación");
                    } catch (assignError) {
                        console.error("Error en vinculación automática:", assignError);
                        // No bloqueamos el éxito del mapping, pero notificamos el error parcial
                        Swal.fire({
                            icon: "warning",
                            title: "Mapping Creado",
                            text: "El mapeo se creó, pero hubo un problema vinculando el consecutivo. Por favor, verifique la pestaña de consecutivos.",
                        });
                        if (onSave) onSave(result);
                        return;
                    }
                }

                Swal.fire({
                    icon: "success",
                    title: isEditing ? "Actualizado" : "Creado",
                    text: "Configuración guardada correctamente",
                });
                if (onSave) onSave(result);
            }
        } catch (error) {
            Swal.fire({ icon: "error", title: "Error", text: error.message || "Error al guardar" });
        } finally {
            setSaving(false);
        }
    };

    // CRUD Helpers
    const updateMappingState = (updates) => setMapping(prev => ({ ...prev, ...updates }));

    const addTable = (table) => setMapping(prev => ({
        ...prev,
        tableConfigs: [...prev.tableConfigs, { ...table, fieldMappings: [] }]
    }));

    const removeTable = (index) => setMapping(prev => {
        const newTables = [...prev.tableConfigs];
        newTables.splice(index, 1);
        return { ...prev, tableConfigs: newTables };
    });

    const updateTable = (index, updatedTable) => setMapping(prev => {
        const newTables = [...prev.tableConfigs];
        newTables[index] = updatedTable;
        return { ...prev, tableConfigs: newTables };
    });

    const addFieldMapping = (tableIndex, field) => setMapping(prev => {
        const newTables = JSON.parse(JSON.stringify(prev.tableConfigs));
        if (!newTables[tableIndex].fieldMappings) newTables[tableIndex].fieldMappings = [];
        newTables[tableIndex].fieldMappings.push(field);
        return { ...prev, tableConfigs: newTables };
    });

    const updateFieldMapping = (tableIndex, fieldIndex, updatedField) => setMapping(prev => {
        const newTables = JSON.parse(JSON.stringify(prev.tableConfigs));
        newTables[tableIndex].fieldMappings[fieldIndex] = updatedField;
        return { ...prev, tableConfigs: newTables };
    });

    const removeFieldMapping = (tableIndex, fieldIndex) => setMapping(prev => {
        const newTables = JSON.parse(JSON.stringify(prev.tableConfigs));
        newTables[tableIndex].fieldMappings.splice(fieldIndex, 1);
        return { ...prev, tableConfigs: newTables };
    });

    // Document Type Rules
    const addDocumentTypeRule = (rule) => setMapping(prev => ({
        ...prev,
        documentTypeRules: [...prev.documentTypeRules, rule]
    }));

    const updateDocumentTypeRule = (index, updatedRule) => setMapping(prev => {
        const newRules = [...prev.documentTypeRules];
        newRules[index] = updatedRule;
        return { ...prev, documentTypeRules: newRules };
    });

    const removeDocumentTypeRule = (index) => setMapping(prev => {
        const newRules = [...prev.documentTypeRules];
        newRules.splice(index, 1);
        return { ...prev, documentTypeRules: newRules };
    });

    // Foreign Key Dependencies
    const addForeignKeyDependency = (dep) => setMapping(prev => ({
        ...prev,
        foreignKeyDependencies: [...(prev.foreignKeyDependencies || []), dep]
    }));

    const updateForeignKeyDependency = (index, updatedDep) => setMapping(prev => {
        const newDeps = [...(prev.foreignKeyDependencies || [])];
        newDeps[index] = updatedDep;
        return { ...prev, foreignKeyDependencies: newDeps };
    });

    const removeForeignKeyDependency = (index) => setMapping(prev => {
        const newDeps = [...(prev.foreignKeyDependencies || [])];
        newDeps.splice(index, 1);
        return { ...prev, foreignKeyDependencies: newDeps };
    });

    // Value Mappings (within a field)
    const addValueMapping = (tableIndex, fieldIndex, mapping) => setMapping(prev => {
        const newTables = JSON.parse(JSON.stringify(prev.tableConfigs));
        if (!newTables[tableIndex].fieldMappings[fieldIndex].valueMappings) {
            newTables[tableIndex].fieldMappings[fieldIndex].valueMappings = [];
        }
        newTables[tableIndex].fieldMappings[fieldIndex].valueMappings.push(mapping);
        return { ...prev, tableConfigs: newTables };
    });

    const removeValueMapping = (tableIndex, fieldIndex, valueIndex) => setMapping(prev => {
        const newTables = JSON.parse(JSON.stringify(prev.tableConfigs));
        newTables[tableIndex].fieldMappings[fieldIndex].valueMappings.splice(valueIndex, 1);
        return { ...prev, tableConfigs: newTables };
    });

    return {
        mapping,
        loading,
        saving,
        isEditing,
        handleChange,
        handleSave,
        updateMappingState,
        addTable,
        removeTable,
        updateTable,
        addFieldMapping,
        updateFieldMapping,
        removeFieldMapping,
        addDocumentTypeRule,
        updateDocumentTypeRule,
        removeDocumentTypeRule,
        addForeignKeyDependency,
        updateForeignKeyDependency,
        removeForeignKeyDependency,
        addValueMapping,
        removeValueMapping,
    };
}
