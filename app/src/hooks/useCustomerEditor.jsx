import { useState, useEffect, useCallback, useMemo } from "react";
import { MappingApi } from "../api/index";

const api = new MappingApi();

export function useCustomerEditor(accessToken, { customer, mappingId, onSave }) {
    const [editedCustomer, setEditedCustomer] = useState({});
    const [originalSourceData, setOriginalSourceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mapping, setMapping] = useState(null);
    const [fieldLoading, setFieldLoading] = useState({});
    const [fieldMeta, setFieldMeta] = useState({});
    const [fieldGroups, setFieldGroups] = useState([]);
    const [error, setError] = useState(null);

    // Grouping logic (Internal)
    const organizeFieldsInGroups = useCallback((fieldMappings) => {
        const hasDefinedGroups = fieldMappings.some((fm) => fm.fieldGroup);

        if (hasDefinedGroups) {
            const groupsMap = {};
            fieldMappings.forEach((field) => {
                if (field.fieldType === "hidden" || field.isEditable === false) return;
                const groupName = field.fieldGroup || "OTROS CAMPOS";
                if (!groupsMap[groupName]) groupsMap[groupName] = { title: groupName, fields: [] };
                groupsMap[groupName].fields.push(field.targetField);
            });

            const groups = Object.values(groupsMap);
            groups.forEach(g => {
                g.fields.sort((a, b) => {
                    const mA = fieldMappings.find(f => f.targetField === a);
                    const mB = fieldMappings.find(f => f.targetField === b);
                    return (mA?.displayOrder || 0) - (mB?.displayOrder || 0);
                });
            });
            return groups.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Intelligent fallback
            const patternGroups = {
                "INFORMACIÓN BÁSICA": [/NOMBRE/i, /ALIAS/i, /RAZON/i, /COD/i, /ID/i, /CODE/i, /UNIT/i, /ORG/i, /CLIENTE/i],
                CONTACTO: [/CONTACTO/i, /MAIL/i, /EMAIL/i, /^E_MAIL/i, /TELEFONO/i, /^TEL/i, /FAX/i, /DIRECCION/i, /DIR_/i],
                UBICACIÓN: [/PAIS/i, /ZONA/i, /RUTA/i, /GEO/i, /LATITUD/i, /LONGITUD/i, /UBICACION/i, /DIVISION_GEO/i, /GEOGRAFICA/i],
                COMERCIAL: [/VENDEDOR/i, /COBRADOR/i, /CATEGORIA/i, /CLASE/i, /NIVEL/i, /PRECIO/i, /LIMITE/i, /CREDITO/i, /CONDICION/i, /TARJETA/i, /MORA/i, /DESCUENTO/i, /TASA/i],
                FINANZAS: [/SALDO/i, /MONTO/i, /LIMITE_CREDITO/i, /MONEDA/i, /TASA_INTERES/i, /IMPUESTO/i, /COBRO/i],
                IMPUESTOS: [/IMPUESTO/i, /CONTRIBUYENTE/i, /EXEN/i, /IVA/i, /REGIMEN/i, /RETENCION/i, /TARIFA/i, /IMP[0-9]/i, /TRIBUTA/i],
                CONFIGURACIÓN: [/ACTIVO/i, /CONFIG/i, /ACEPTA/i, /PERMITE/i, /USA/i, /^ES_/i, /DOC_/i, /USUARIO/i, /FECHA_HORA/i, /ELECTRONICO/i, /API/i]
            };

            const groupsMap = {};
            fieldMappings.forEach(field => {
                if (field.fieldType === "hidden" || field.isEditable === false) return;
                let groupName = "OTROS CAMPOS";
                for (const [name, patterns] of Object.entries(patternGroups)) {
                    if (patterns.some(p => p.test(field.targetField.toUpperCase()))) {
                        groupName = name;
                        break;
                    }
                }
                if (!groupsMap[groupName]) groupsMap[groupName] = { title: groupName, fields: [] };
                groupsMap[groupName].fields.push(field.targetField);
            });

            const groupOrder = ["INFORMACIÓN BÁSICA", "CONTACTO", "UBICACIÓN", "COMERCIAL", "FINANZAS", "IMPUESTOS", "CONFIGURACIÓN", "OTROS CAMPOS"];
            return Object.values(groupsMap).sort((a, b) => {
                const iA = groupOrder.indexOf(a.title);
                const iB = groupOrder.indexOf(b.title);
                if (iA !== -1 && iB !== -1) return iA - iB;
                if (iA !== -1) return -1;
                if (iB !== -1) return 1;
                return a.title.localeCompare(b.title);
            });
        }
    }, []);

    const loadDynamicValue = async (fieldName, fieldConfig, currentData) => {
        try {
            setFieldLoading(prev => ({ ...prev, [fieldName]: true }));
            const result = await api.queryDynamicFieldValue(accessToken, mappingId, fieldConfig, currentData);

            if (result.success) {
                const newValue = fieldConfig.queryType === "sequence" ? result.nextValue : result.value;
                setFieldMeta(prev => ({
                    ...prev,
                    [fieldName]: {
                        ...prev[fieldName],
                        currentValue: result.currentValue,
                        dynamicValue: newValue
                    }
                }));
                setEditedCustomer(prev => ({ ...prev, [fieldName]: newValue }));
                return newValue;
            }
        } catch (err) {
            console.error(`Error loading dynamic value for ${fieldName}:`, err);
        } finally {
            setFieldLoading(prev => ({ ...prev, [fieldName]: false }));
        }
        return null;
    };

    const initialize = useCallback(async () => {
        if (!mappingId) return;
        try {
            setLoading(true);
            setError(null);
            const mappingData = await api.getMappingById(accessToken, mappingId);
            setMapping(mappingData);

            let documentId = null;
            if (customer) {
                const mainTable = mappingData.tableConfigs.find(tc => !tc.isDetailTable);
                if (mainTable && mainTable.primaryKey) {
                    const pkMap = mainTable.fieldMappings.find(fm => fm.sourceField === mainTable.primaryKey);
                    documentId = pkMap ? customer[pkMap.targetField] : customer[mainTable.primaryKey];
                }
                if (!documentId) documentId = customer[Object.keys(customer)[0]];
            }

            let finalCustomer = customer || {};

            if (documentId) {
                try {
                    const sourceResult = await api.getSourceDataByMapping(accessToken, mappingId, documentId);
                    if (sourceResult?.data?.sourceData) {
                        const source = sourceResult.data.sourceData;
                        setOriginalSourceData(source);

                        const transformed = {};
                        const mainTable = mappingData.tableConfigs.find(tc => !tc.isDetailTable);
                        mainTable?.fieldMappings?.forEach(field => {
                            if (field.sourceField) {
                                let value = source[field.sourceField];
                                if (field.removePrefix && typeof value === 'string' && value.startsWith(field.removePrefix)) {
                                    value = value.substring(field.removePrefix.length);
                                }
                                if (value !== null && field.valueMappings?.length > 0) {
                                    const vMap = field.valueMappings.find(vm => vm.sourceValue === value);
                                    if (vMap) value = vMap.targetValue;
                                }
                                transformed[field.targetField] = value;
                            } else if (field.defaultValue !== undefined) {
                                transformed[field.targetField] = field.defaultValue === "NULL" ? null : field.defaultValue;
                            }
                        });
                        finalCustomer = transformed;
                    }
                } catch (e) { console.warn("Source load failed", e); }
            }

            setEditedCustomer(finalCustomer);

            if (mappingData?.tableConfigs) {
                const mainTable = mappingData.tableConfigs.find(tc => !tc.isDetailTable);
                const fields = mainTable?.fieldMappings?.filter(f => f.fieldType !== "hidden" && f.isEditable !== false) || [];
                setFieldGroups(organizeFieldsInGroups(fields));

                const meta = {};
                fields.forEach(f => {
                    meta[f.targetField] = { ...f, originalField: f.sourceField, dynamicValue: null };
                    if (f.dynamicQuery) loadDynamicValue(f.targetField, f, finalCustomer);
                });
                setFieldMeta(meta);
            }
        } catch (err) {
            console.error("Init editor error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [accessToken, mappingId, customer, organizeFieldsInGroups]);

    useEffect(() => { initialize(); }, [initialize]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEditedCustomer(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const handleSave = async () => {
        const required = Object.entries(fieldMeta).filter(([_, m]) => m.isRequired).map(([f]) => f);
        const missing = required.filter(f => !editedCustomer[f] && editedCustomer[f] !== 0 && editedCustomer[f] !== false);

        if (missing.length > 0) throw new Error(`Campos requeridos: ${missing.join(", ")}`);

        const updateData = {
            mappingId,
            documentId: null,
            targetData: editedCustomer,
            sourceData: {},
            _dynamicFields: {}
        };

        if (mapping) {
            const mainTable = mapping.tableConfigs.find(tc => !tc.isDetailTable);
            const pkMap = mainTable.fieldMappings.find(fm => fm.sourceField === mainTable.primaryKey);
            updateData.documentId = pkMap ? editedCustomer[pkMap.targetField] : editedCustomer[mainTable.primaryKey];
            if (!updateData.documentId) updateData.documentId = editedCustomer[Object.keys(editedCustomer)[0]];

            mainTable.fieldMappings.forEach(field => {
                if (field.sourceField && editedCustomer[field.targetField] !== undefined) {
                    let val = editedCustomer[field.targetField];
                    if (field.valueMappings?.length > 0) {
                        const iMap = field.valueMappings.find(vm => vm.targetValue === val);
                        if (iMap) val = iMap.sourceValue;
                    }
                    if (field.removePrefix && originalSourceData) {
                        const oVal = originalSourceData[field.sourceField];
                        if (oVal && typeof oVal === 'string' && oVal.startsWith(field.removePrefix)) {
                            val = field.removePrefix + val;
                        }
                    }
                    updateData.sourceData[field.sourceField] = val;
                }
            });
        }

        Object.entries(fieldMeta).forEach(([f, m]) => {
            if (m.dynamicQuery && m.queryType === "sequence" && m.queryDefinition?.updateOnSave) {
                updateData._dynamicFields[f] = { ...m, newValue: editedCustomer[f] };
            }
        });

        return await onSave(updateData);
    };

    return {
        editedCustomer, setEditedCustomer,
        originalSourceData,
        loading,
        mapping,
        fieldMeta,
        fieldGroups,
        fieldLoading,
        error,
        handleChange,
        handleSave,
        handleRefreshDynamicField: (f) => loadDynamicValue(f, fieldMeta[f], editedCustomer),
        loadSourceData: initialize
    };
}
