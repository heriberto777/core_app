import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaSync } from "react-icons/fa";
import { TransferApi, useAuth } from "../../index";
import Swal from "sweetalert2";

// Instancia de la API
const api = new TransferApi();

export function CustomerEditor({ customer, mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [editedCustomer, setEditedCustomer] = useState({});
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

        // Preparar datos del cliente
        setEditedCustomer(customer || {});

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

  // Organizar campos en grupos para mejor presentación
  const organizeFieldsInGroups = (fieldMappings) => {
    // Predefinir algunos grupos comunes
    const groups = [
      {
        title: "Información Principal",
        fields: [
          "CLIENTE",
          "NOMBRE_CLIENTE",
          "ALIAS",
          "CONTACTO",
          "CARGO",
          "CONTRIBUYENTE",
        ],
      },
      {
        title: "Contacto y Ubicación",
        fields: [
          "TELEFONO1",
          "TELEFONO2",
          "E_MAIL",
          "DIRECCION",
          "PAIS",
          "ZONA",
          "GEO_LATITUD",
          "GEO_LONGITUD",
        ],
      },
      {
        title: "Configuración Comercial",
        fields: [
          "LIMITE_CREDITO",
          "CONDICION_PAGO",
          "NIVEL_PRECIO",
          "MULTIMONEDA",
          "VENDEDOR",
          "RUTA",
          "COBRADOR",
        ],
      },
      {
        title: "Clasificación",
        fields: ["CATEGORIA_CLIENTE", "CLASE_ABC", "CODIGO_IMPUESTO"],
      },
    ];

    // Grupo para campos no clasificados
    const otherGroup = {
      title: "Otros Campos",
      fields: [],
    };

    // Asignar campos a los grupos
    const assignedFields = new Set();
    fieldMappings.forEach((field) => {
      const targetField = field.targetField;
      let assigned = false;

      for (const group of groups) {
        if (group.fields.includes(targetField)) {
          assignedFields.add(targetField);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        otherGroup.fields.push(targetField);
        assignedFields.add(targetField);
      }
    });

    // Añadir el grupo "otros" solo si tiene campos
    if (otherGroup.fields.length > 0) {
      groups.push(otherGroup);
    }

    // Filtrar cada grupo para incluir solo campos que existen en el mapping
    groups.forEach((group) => {
      group.fields = group.fields.filter((field) =>
        fieldMappings.some((f) => f.targetField === field)
      );
    });

    // Filtrar grupos que no tienen campos
    const filteredGroups = groups.filter((group) => group.fields.length > 0);
    setFieldGroups(filteredGroups);
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

      // Preparar datos para guardar
      const saveData = {
        ...editedCustomer,
        _dynamicFields: {},
      };

      // Incluir información de campos dinámicos que necesitan actualización
      Object.entries(fieldMeta).forEach(([fieldName, meta]) => {
        if (
          meta.dynamicQuery &&
          meta.queryType === "sequence" &&
          meta.queryDefinition &&
          meta.queryDefinition.updateOnSave
        ) {
          saveData._dynamicFields[fieldName] = {
            ...meta,
            newValue: editedCustomer[fieldName],
          };
        }
      });

      // Llamar al handler de guardado pasando la configuración de mapping
      await onSave(saveData, mappingId);

      Swal.fire({
        title: "Guardado",
        text: "Los datos se guardaron correctamente",
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
    const value = editedCustomer[fieldName] || "";
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
              value={value}
              onChange={handleChange}
              className="swal2-textarea"
              rows="3"
              disabled={isLoading}
            />
          ) : (
            <input
              type={inputType}
              name={fieldName}
              value={value}
              onChange={handleChange}
              className="swal2-input"
              style={{ flex: 1 }}
              disabled={isLoading}
              step={inputType === "number" ? "0.01" : undefined}
            />
          )}

          {meta.dynamicQuery && (
            <button
              className="btn-refresh"
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
            className="button"
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
            className="button"
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

      <style jsx>{`
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

        .btn-refresh:hover {
          background-color: #138496 !important;
        }
      `}</style>
    </div>
  );
}
