import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaSync, FaDatabase } from "react-icons/fa";
import { TransferApi, useAuth } from "../../index";
import Swal from "sweetalert2";

// Instancia de la API
const api = new TransferApi();

export function CustomerEditor({ customer, mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [editedCustomer, setEditedCustomer] = useState({});
  const [originalSourceData, setOriginalSourceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState(null);
  const [fieldLoading, setFieldLoading] = useState({});
  const [fieldMeta, setFieldMeta] = useState({});
  const [fieldGroups, setFieldGroups] = useState([]);

  // Cargar datos iniciales y mapping
  useEffect(() => {
    const initializeEditor = async () => {
      if (!mappingId) {
        console.error("No se proporcionó ID de mapping");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Cargar configuración de mapping
        const mappingData = await api.getMappingById(accessToken, mappingId);
        setMapping(mappingData);

        // Determinar ID del documento
        let documentId = null;
        if (customer) {
          // Buscar la tabla principal en la configuración
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable && mainTable.primaryKey) {
            // Buscar el campo destino que corresponde al primaryKey
            const primaryKeyMapping = mainTable.fieldMappings.find(
              (fm) => fm.sourceField === mainTable.primaryKey
            );

            if (primaryKeyMapping) {
              documentId = customer[primaryKeyMapping.targetField];
            } else {
              // Si no hay mapeo específico, probar con el campo directamente
              documentId = customer[mainTable.primaryKey];
            }
          }

          // Si no encontramos el ID mediante la configuración, usar la primera propiedad
          if (!documentId) {
            documentId = customer[Object.keys(customer)[0]];
          }
        }

        // Si tenemos un ID de documento, intentar cargar datos de la tabla origen
        if (documentId) {
          try {
            console.log(
              `Cargando datos de origen para documento ${documentId}`
            );
            const sourceDataResult = await api.getSourceDataByMapping(
              accessToken,
              mappingId,
              documentId
            );

            if (sourceDataResult.success) {
              // Guardar datos originales para referencia
              const sourceData = sourceDataResult.data.sourceData;
              setOriginalSourceData(sourceData);

              // Inicializar objeto de cliente
              const newCustomerData = {};

              // Buscar la tabla principal
              const mainTable = mappingData.tableConfigs.find(
                (tc) => !tc.isDetailTable
              );

              if (mainTable && mainTable.fieldMappings) {
                // Para cada mapeo de campo, aplicar la transformación
                mainTable.fieldMappings.forEach((field) => {
                  // Si el campo tiene un origen definido, obtener el valor de los datos de origen
                  if (field.sourceField) {
                    let value = sourceData[field.sourceField];

                    // Aplicar eliminación de prefijo si está configurado
                    if (
                      field.removePrefix &&
                      typeof value === "string" &&
                      value.startsWith(field.removePrefix)
                    ) {
                      const originalValue = value;
                      value = value.substring(field.removePrefix.length);
                      console.log(
                        `Prefijo '${field.removePrefix}' eliminado del campo ${field.sourceField}: '${originalValue}' → '${value}'`
                      );
                    }

                    // Aplicar mapeo de valores si existe
                    if (
                      value !== null &&
                      value !== undefined &&
                      field.valueMappings?.length > 0
                    ) {
                      const valueMap = field.valueMappings.find(
                        (vm) => vm.sourceValue === value
                      );
                      if (valueMap) {
                        value = valueMap.targetValue;
                      }
                    }

                    // Guardar en el objeto del cliente
                    newCustomerData[field.targetField] = value;
                  } else if (field.defaultValue !== undefined) {
                    // Si no hay campo origen pero sí valor por defecto
                    newCustomerData[field.targetField] =
                      field.defaultValue === "NULL" ? null : field.defaultValue;
                  }
                });
              }

              console.log("Datos transformados desde origen:", newCustomerData);
              setEditedCustomer(newCustomerData);
            } else {
              // Si no hay éxito, usar los datos que nos pasaron
              console.warn(
                "No se obtuvieron datos de origen, usando datos proporcionados"
              );
              setEditedCustomer(customer || {});
            }
          } catch (sourceError) {
            console.warn("Error al cargar datos de origen:", sourceError);
            // Si falla, simplemente usamos los datos que nos pasaron
            setEditedCustomer(customer || {});
          }
        } else {
          // No hay ID o no se pudo determinar, usar los datos que nos pasaron
          setEditedCustomer(customer || {});
        }

        // Inicializar metadatos de los campos
        if (mappingData && mappingData.tableConfigs) {
          // Buscar la tabla principal
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );

          if (mainTable && mainTable.fieldMappings) {
            // Organizar campos en grupos para la UI
            organizeFieldsInGroups(mainTable.fieldMappings);

            // Crear metadatos para cada campo
            const meta = {};
            mainTable.fieldMappings.forEach((field) => {
              meta[field.targetField] = {
                ...field,
                loading: false,
                originalField: field.sourceField,
                dynamicValue: null,
              };

              // Si el campo tiene consulta dinámica, cargar su valor
              if (field.dynamicQuery) {
                loadDynamicValue(field.targetField, field);
              }
            });

            setFieldMeta(meta);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error al inicializar editor:", error);
        Swal.fire({
          title: "Error",
          text: `No se pudo cargar la configuración: ${error.message}`,
          icon: "error",
        });
        setLoading(false);
      }
    };

    initializeEditor();
  }, [mappingId, accessToken, customer]);

  // Función para cargar datos desde la tabla origen
  const loadSourceData = async () => {
    try {
      setLoading(true);

      // Determinar ID del documento actual
      let documentId = null;
      if (mapping) {
        const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
        if (mainTable && mainTable.primaryKey) {
          // Buscar el campo destino que corresponde al primaryKey
          const primaryKeyMapping = mainTable.fieldMappings.find(
            (fm) => fm.sourceField === mainTable.primaryKey
          );

          if (primaryKeyMapping) {
            documentId = editedCustomer[primaryKeyMapping.targetField];
          } else {
            // Si no hay mapeo específico, probar con el campo directamente
            documentId = editedCustomer[mainTable.primaryKey];
          }
        }

        // Si no encontramos el ID mediante la configuración, usar la primera propiedad
        if (!documentId) {
          documentId = editedCustomer[Object.keys(editedCustomer)[0]];
        }
      }

      if (!documentId) {
        Swal.fire({
          title: "Error",
          text: "No se pudo determinar el ID del documento",
          icon: "error",
        });
        setLoading(false);
        return;
      }

      // Cargar datos de la tabla origen
      const sourceDataResult = await api.getSourceDataByMapping(
        accessToken,
        mappingId,
        documentId
      );

      if (sourceDataResult.success) {
        const sourceData = sourceDataResult.data.sourceData;
        setOriginalSourceData(sourceData);

        // Confirmar si se desea reemplazar los datos actuales
        const confirmResult = await Swal.fire({
          title: "Datos cargados",
          text: "¿Desea reemplazar los datos actuales con los datos de la tabla origen?",
          icon: "question",
          showCancelButton: true,
          confirmButtonText: "Sí, reemplazar",
          cancelButtonText: "No, mantener mis cambios",
        });

        if (confirmResult.isConfirmed) {
          // Inicializar objeto de cliente
          const newCustomerData = {};

          // Buscar la tabla principal
          const mainTable = mapping.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );

          if (mainTable && mainTable.fieldMappings) {
            // Para cada mapeo de campo, aplicar la transformación
            mainTable.fieldMappings.forEach((field) => {
              // Si el campo tiene un origen definido, obtener el valor de los datos de origen
              if (field.sourceField) {
                let value = sourceData[field.sourceField];

                // Aplicar eliminación de prefijo si está configurado
                if (
                  field.removePrefix &&
                  typeof value === "string" &&
                  value.startsWith(field.removePrefix)
                ) {
                  const originalValue = value;
                  value = value.substring(field.removePrefix.length);
                  console.log(
                    `Prefijo '${field.removePrefix}' eliminado del campo ${field.sourceField}: '${originalValue}' → '${value}'`
                  );
                }

                // Aplicar mapeo de valores si existe
                if (
                  value !== null &&
                  value !== undefined &&
                  field.valueMappings?.length > 0
                ) {
                  const valueMap = field.valueMappings.find(
                    (vm) => vm.sourceValue === value
                  );
                  if (valueMap) {
                    value = valueMap.targetValue;
                  }
                }

                // Guardar en el objeto del cliente
                newCustomerData[field.targetField] = value;
              } else if (field.defaultValue !== undefined) {
                // Si no hay campo origen pero sí valor por defecto
                newCustomerData[field.targetField] =
                  field.defaultValue === "NULL" ? null : field.defaultValue;
              }
            });
          }

          setEditedCustomer(newCustomerData);
        }
      }
    } catch (error) {
      console.error("Error al cargar datos de origen:", error);
      Swal.fire({
        title: "Error",
        text: `No se pudieron cargar los datos de origen: ${error.message}`,
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Clasificación inteligente de campos en grupos
  const organizeFieldsInGroups = (fieldMappings) => {
    // Clasificación inteligente basada en prefijos o sufijos comunes
    const identifyGroupByFieldName = (fieldName) => {
      // Normalizar a mayúsculas para comparaciones consistentes
      const name = fieldName.toUpperCase();

      // Mapeo de patrones a grupos
      const patternGroups = {
        "INFORMACIÓN BÁSICA": [
          /^NOMBRE/i,
          /^ALIAS/i,
          /^RAZON/i,
          /^COD/i,
          /^ID/i,
          /^CODE/i,
          /UNIT/i,
          /ORG/i,
          /CLIENTE/i,
        ],
        CONTACTO: [
          /CONTACTO/i,
          /MAIL/i,
          /EMAIL/i,
          /^E_MAIL/i,
          /TELEFONO/i,
          /^TEL/i,
          /FAX/i,
          /DIRECCION/i,
          /DIR_/i,
        ],
        UBICACIÓN: [
          /PAIS/i,
          /ZONA/i,
          /RUTA/i,
          /GEO/i,
          /LATITUD/i,
          /LONGITUD/i,
          /UBICACION/i,
          /DIVISION_GEO/i,
          /GEOGRAFICA/i,
        ],
        COMERCIAL: [
          /VENDEDOR/i,
          /COBRADOR/i,
          /CATEGORIA/i,
          /CLASE/i,
          /NIVEL/i,
          /PRECIO/i,
          /LIMITE/i,
          /CREDITO/i,
          /CONDICION/i,
          /TARJETA/i,
          /MORA/i,
          /DESCUENTO/i,
          /TASA/i,
        ],
        FINANZAS: [
          /SALDO/i,
          /MONTO/i,
          /LIMITE_CREDITO/i,
          /MORA/i,
          /MONEDA/i,
          /TASA_INTERES/i,
          /IMPUESTO/i,
          /CREDITO/i,
          /COBRO/i,
        ],
        IMPUESTOS: [
          /IMPUESTO/i,
          /CONTRIBUYENTE/i,
          /EXEN/i,
          /IVA/i,
          /REGIMEN/i,
          /RETENCION/i,
          /TARIFA/i,
          /IMP[0-9]/i,
          /TRIBUTA/i,
        ],
        CONFIGURACIÓN: [
          /ACTIVO/i,
          /CONFIG/i,
          /ACEPTA/i,
          /PERMITE/i,
          /USA/i,
          /^ES_/i,
          /DOC_/i,
          /USUARIO/i,
          /FECHA_HORA/i,
          /ELECTRONICO/i,
          /API/i,
        ],
      };

      // Verificar cada patrón
      for (const [groupName, patterns] of Object.entries(patternGroups)) {
        for (const pattern of patterns) {
          if (pattern.test(name)) {
            return groupName;
          }
        }
      }

      // Campo no clasificado
      return "OTROS CAMPOS";
    };

    // Crear grupos iniciales vacíos
    const groupsMap = {};

    // Clasificar cada campo
    fieldMappings.forEach((field) => {
      const targetField = field.targetField;
      const groupName = identifyGroupByFieldName(targetField);

      if (!groupsMap[groupName]) {
        groupsMap[groupName] = {
          title: groupName,
          fields: [],
        };
      }

      groupsMap[groupName].fields.push(targetField);
    });

    // Convertir el mapa a array
    const groups = Object.values(groupsMap);

    // Ordenar grupos para una presentación consistente
    const groupOrder = [
      "INFORMACIÓN BÁSICA",
      "CONTACTO",
      "UBICACIÓN",
      "COMERCIAL",
      "FINANZAS",
      "IMPUESTOS",
      "CONFIGURACIÓN",
      "OTROS CAMPOS",
    ];

    groups.sort((a, b) => {
      const indexA = groupOrder.indexOf(a.title);
      const indexB = groupOrder.indexOf(b.title);

      // Si ambos están en la lista de orden, ordenar por esa posición
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // Si solo uno está en la lista, ese va primero
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // Si ninguno está en la lista, orden alfabético
      return a.title.localeCompare(b.title);
    });

    setFieldGroups(groups);
  };

  // Cargar valor dinámico para un campo
  const loadDynamicValue = async (fieldName, fieldConfig) => {
    try {
      setFieldLoading((prev) => ({ ...prev, [fieldName]: true }));

      // Construir contexto con los valores actuales
      const context = { ...editedCustomer };

      const result = await api.queryDynamicFieldValue(
        accessToken,
        mappingId,
        fieldConfig,
        context
      );

      if (result.success) {
        // Actualizar valor según tipo de consulta
        let newValue;
        if (fieldConfig.queryType === "sequence") {
          newValue = result.nextValue;

          // Actualizar metadatos con la info de secuencia
          setFieldMeta((prev) => ({
            ...prev,
            [fieldName]: {
              ...prev[fieldName],
              currentValue: result.currentValue,
              dynamicValue: newValue,
            },
          }));
        } else {
          newValue = result.value;

          // Actualizar metadatos
          setFieldMeta((prev) => ({
            ...prev,
            [fieldName]: {
              ...prev[fieldName],
              dynamicValue: newValue,
            },
          }));
        }

        // Actualizar valor en el cliente
        setEditedCustomer((prev) => ({
          ...prev,
          [fieldName]: newValue,
        }));
      }
    } catch (error) {
      console.error(`Error al cargar valor dinámico para ${fieldName}:`, error);
      Swal.fire({
        title: "Error",
        text: `No se pudo obtener valor para ${fieldName}: ${error.message}`,
        icon: "error",
        timer: 3000,
      });
    } finally {
      setFieldLoading((prev) => ({ ...prev, [fieldName]: false }));
    }
  };

  // Manejar cambios en los campos
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditedCustomer({
      ...editedCustomer,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  // Manejar refresco de campo dinámico
  const handleRefreshDynamicField = (fieldName) => {
    const fieldConfig = fieldMeta[fieldName];
    if (fieldConfig && fieldConfig.dynamicQuery) {
      loadDynamicValue(fieldName, fieldConfig);
    }
  };

  // Guardar cambios
  const handleSave = async () => {
    try {
      setLoading(true);

      // Validar campos requeridos
      const requiredFields = Object.entries(fieldMeta)
        .filter(([_, meta]) => meta.isRequired)
        .map(([field]) => field);

      const missingFields = requiredFields.filter(
        (field) =>
          !editedCustomer[field] &&
          editedCustomer[field] !== 0 &&
          editedCustomer[field] !== false
      );

      if (missingFields.length > 0) {
        Swal.fire({
          title: "Campos requeridos",
          html: `Por favor complete los siguientes campos:<br><br>
          <ul style="text-align: left; display: inline-block;">
            ${missingFields.map((field) => `<li>${field}</li>`).join("")}
          </ul>`,
          icon: "warning",
        });
        setLoading(false);
        return;
      }

      // Preparar datos para actualizar el origen
      const updateData = {
        mappingId,
        documentId: null, // Se determinará abajo
        targetData: editedCustomer,
        sourceData: {}, // Datos a actualizar en la tabla origen
        _dynamicFields: {},
      };

      // Determinar el ID del documento
      if (mapping) {
        const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
        if (mainTable && mainTable.primaryKey) {
          // Buscar el ID en los datos editados
          const primaryKeyMapping = mainTable.fieldMappings.find(
            (fm) => fm.sourceField === mainTable.primaryKey
          );

          if (primaryKeyMapping) {
            updateData.documentId =
              editedCustomer[primaryKeyMapping.targetField];
          } else {
            updateData.documentId = editedCustomer[mainTable.primaryKey];
          }
        }

        // Si aún no encontramos el ID, usar la primera propiedad
        if (!updateData.documentId) {
          updateData.documentId =
            editedCustomer[Object.keys(editedCustomer)[0]];
        }

        // Mapear los datos de vuelta a los campos origen
        if (mainTable && mainTable.fieldMappings) {
          mainTable.fieldMappings.forEach((field) => {
            if (
              field.sourceField &&
              editedCustomer[field.targetField] !== undefined
            ) {
              let sourceValue = editedCustomer[field.targetField];

              // Aplicar mapeo de valores inverso si existe
              if (field.valueMappings?.length > 0) {
                const inverseMap = field.valueMappings.find(
                  (vm) => vm.targetValue === sourceValue
                );
                if (inverseMap) {
                  sourceValue = inverseMap.sourceValue;
                }
              }

              // Aplicar prefijo si fue removido originalmente
              if (field.removePrefix && originalSourceData) {
                const originalValue = originalSourceData[field.sourceField];
                if (
                  originalValue &&
                  typeof originalValue === "string" &&
                  originalValue.startsWith(field.removePrefix)
                ) {
                  sourceValue = field.removePrefix + sourceValue;
                }
              }

              // Guardar valor para actualizar en origen
              updateData.sourceData[field.sourceField] = sourceValue;
            }
          });
        }
      }

      // Incluir información de campos dinámicos que necesitan actualización
      Object.entries(fieldMeta).forEach(([fieldName, meta]) => {
        if (
          meta.dynamicQuery &&
          meta.queryType === "sequence" &&
          meta.queryDefinition &&
          meta.queryDefinition.updateOnSave
        ) {
          updateData._dynamicFields[fieldName] = {
            ...meta,
            newValue: editedCustomer[fieldName],
          };
        }
      });

      // Llamar al handler de guardado pasando los datos completos
      await onSave(updateData);

      Swal.fire({
        title: "Guardado",
        text: "Los datos se guardaron correctamente en ambas tablas",
        icon: "success",
        timer: 2000,
      });
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudieron guardar los cambios",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Renderizar campo según su tipo
  const renderField = (fieldName) => {
    // Obtener metadatos del campo
    const meta = fieldMeta[fieldName] || {};
    const value =
      editedCustomer[fieldName] !== undefined ? editedCustomer[fieldName] : "";
    const isLoading = fieldLoading[fieldName] || false;

    // Determinar tipo de campo
    let inputType = "text"; // Por defecto

    // Intentar inferir el tipo basándose en el nombre o el valor
    if (fieldName.includes("EMAIL") || fieldName.includes("E_MAIL")) {
      inputType = "email";
    } else if (fieldName.includes("FECHA") || fieldName.includes("DATE")) {
      inputType = "date";
    } else if (
      fieldName.includes("TELEFONO") ||
      fieldName.includes("PHONE") ||
      fieldName.includes("TEL")
    ) {
      inputType = "tel";
    } else if (
      typeof value === "number" ||
      fieldName.includes("PRECIO") ||
      fieldName.includes("MONTO") ||
      fieldName.includes("CREDITO") ||
      fieldName.includes("SALDO") ||
      fieldName.includes("LIMITE")
    ) {
      inputType = "number";
    } else if (
      (typeof value === "string" && value.length > 100) ||
      fieldName.includes("NOTAS") ||
      fieldName.includes("DIRECCION") ||
      fieldName.includes("OBSERVACION")
    ) {
      inputType = "textarea";
    }

    // Si es un valor booleano o campos que suelen ser checkbox
    const booleanFields = ["ACTIVO", "ES_", "PERMITE_", "ACEPTA_", "USA_"];
    const isBoolean =
      typeof value === "boolean" ||
      booleanFields.some((prefix) => fieldName.toUpperCase().includes(prefix));

    if (isBoolean) {
      inputType = "checkbox";
    }

    // Renderizar según el tipo
    return (
      <div key={fieldName} className="form-group" style={{ flex: "1 1 250px" }}>
        <label>
          {fieldName}
          {meta.isRequired && (
            <span style={{ color: "var(--danger-color)" }}> *</span>
          )}
        </label>

        <div style={{ display: "flex", gap: "5px" }}>
          {inputType === "textarea" ? (
            <textarea
              name={fieldName}
              value={value || ""}
              onChange={handleChange}
              className="swal2-textarea"
              rows="3"
              disabled={isLoading}
              style={{ flex: 1 }}
            />
          ) : inputType === "checkbox" ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                type="checkbox"
                name={fieldName}
                checked={Boolean(value)}
                onChange={handleChange}
                disabled={isLoading}
                style={{
                  marginRight: "8px",
                  width: "18px",
                  height: "18px",
                }}
              />
              <span>{fieldName}</span>
            </div>
          ) : (
            <input
              type={inputType}
              name={fieldName}
              value={value || ""}
              onChange={handleChange}
              className="swal2-input"
              style={{ flex: 1 }}
              disabled={isLoading}
              step={inputType === "number" ? "0.01" : undefined}
            />
          )}

          {meta.dynamicQuery && (
            <button
              onClick={() => handleRefreshDynamicField(fieldName)}
              disabled={isLoading}
              style={{
                backgroundColor: "#17a2b8",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "0 10px",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
              title="Refrescar valor"
            >
              <FaSync />
            </button>
          )}
        </div>

        {meta.dynamicQuery &&
          meta.queryType === "sequence" &&
          meta.currentValue !== undefined && (
            <small
              style={{
                display: "block",
                fontSize: "0.8rem",
                color: "#6c757d",
                marginTop: "3px",
              }}
            >
              Valor actual en secuencia: {meta.currentValue}
            </small>
          )}

        {meta.originalField && (
          <small
            style={{
              display: "block",
              fontSize: "0.8rem",
              color: "#6c757d",
              marginTop: "3px",
            }}
          >
            Campo origen: {meta.originalField}
          </small>
        )}
      </div>
    );
  };

  // Mostrar pantalla de carga
  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div className="loading-spinner"></div>
        <p>Cargando formulario...</p>
      </div>
    );
  }

  return (
    <div className="customer-editor">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ margin: 0 }}>
          Editar {mapping?.entityType === "customers" ? "Cliente" : "Documento"}
        </h3>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            style={{
              backgroundColor: "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "8px 15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
            onClick={loadSourceData}
            title="Cargar datos de la tabla origen"
          >
            <FaDatabase /> Actualizar desde origen
          </button>
          <button
            style={{
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "8px 15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
            onClick={onCancel}
          >
            <FaTimes /> Cancelar
          </button>
          <button
            style={{
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "8px 15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
            onClick={handleSave}
          >
            <FaSave /> Guardar
          </button>
        </div>
      </div>

      {/* Sección para mostrar datos originales cuando estén disponibles */}
      {originalSourceData && (
        <div
          style={{
            marginBottom: "20px",
            borderBottom: "1px solid #dee2e6",
            paddingBottom: "10px",
          }}
        >
          <button
            onClick={() => {
              Swal.fire({
                title: "Datos originales",
                html: `
                  <div style="max-height: 60vh; overflow-y: auto; text-align: left;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <thead>
                        <tr>
                          <th style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">Campo</th>
                          <th style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${Object.entries(originalSourceData)
                          .map(
                            ([key, value]) => `
                            <tr>
                              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${key}</td>
                              <td style="padding: 8px; border-bottom: 1px solid #eee;">${
                                value !== null && value !== undefined
                                  ? value
                                  : "N/A"
                              }</td>
                            </tr>
                          `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `,
                width: 800,
                showConfirmButton: true,
                confirmButtonText: "Cerrar",
              });
            }}
            style={{
              backgroundColor: "transparent",
              color: "#17a2b8",
              border: "1px solid #17a2b8",
              borderRadius: "4px",
              padding: "5px 10px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Ver datos originales de la tabla fuente
          </button>
        </div>
      )}

      {fieldGroups.map((group, groupIndex) => (
        <div key={groupIndex} style={{ marginBottom: "20px" }}>
          <h4
            style={{
              borderBottom: "1px solid #dee2e6",
              paddingBottom: "8px",
              marginBottom: "15px",
            }}
          >
            {group.title}
          </h4>

          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
            {group.fields.map((fieldName) => renderField(fieldName))}
          </div>
        </div>
      ))}

      <style jsx="true">{`
        .loading-spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid rgba(0, 123, 255, 0.1);
          border-radius: 50%;
          border-top-color: #007bff;
          animation: spin 1s linear infinite;
          margin-bottom: 15px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .swal2-input,
        .swal2-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 14px;
        }

        .swal2-textarea {
          min-height: 80px;
          resize: vertical;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
