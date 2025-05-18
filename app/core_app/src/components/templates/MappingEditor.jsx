import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ConsecutiveConfigSection, TransferApi, useAuth } from "../../index";
import { FaSave, FaPlus, FaTrash, FaTimes, FaEdit } from "react-icons/fa";
import Swal from "sweetalert2";

const api = new TransferApi();

export function MappingEditor({ mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState({
    name: "",
    description: "",
    transferType: "down",
    active: true,
    sourceServer: "server2",
    targetServer: "server1",
    entityType: "orders", // Añadido: tipo de entidad por defecto
    documentTypeRules: [],
    tableConfigs: [],
    markProcessedField: "IS_PROCESSED",
    markProcessedValue: 1,
    consecutiveConfig: { enabled: false },
  });
  const [isEditing, setIsEditing] = useState(!!mappingId);
  const [activeTab, setActiveTab] = useState("general");
  // const [consecutiveConfig, setConsecutiveConfig] = useState(
  //   mapping?.consecutiveConfig || { enabled: false }
  // );

  useEffect(() => {
    if (mappingId) {
      loadMapping();
    } else {
      setLoading(false);
    }
  }, [mappingId]);

  const loadMapping = async () => {
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
      onCancel();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === "custom" && name === "consecutiveConfig") {
      // Caso especial para el objeto completo de configuración de consecutivos
      setMapping((prevState) => ({
        ...prevState,
        consecutiveConfig: value,
      }));
      return;
    }

    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setMapping((prevState) => ({
        ...prevState,
        [parent]: {
          ...(prevState[parent] || {}),
          [child]: type === "checkbox" ? checked : value,
        },
      }));
    } else {
      // Manejo normal para campos no anidados
      setMapping((prevState) => ({
        ...prevState,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleSave = async () => {
    // Validaciones
    if (!mapping.name) {
      Swal.fire({
        icon: "warning",
        title: "Datos incompletos",
        text: "Por favor, ingrese un nombre para la configuración",
      });
      return;
    }

    if (mapping.tableConfigs.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Configuración incompleta",
        text: "Debe configurar al menos una tabla",
      });
      return;
    }

    setLoading(true);
    try {
      let result;
      if (isEditing) {
        result = await api.updateMapping(accessToken, mappingId, mapping);
      } else {
        result = await api.createMapping(accessToken, mapping);
      }

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: isEditing
            ? "Configuración actualizada"
            : "Configuración creada",
          text: "Los cambios han sido guardados correctamente",
        });

        if (onSave) {
          onSave(result);
        }
      } else {
        console.log(result);
        throw new Error(
          result.message || "No se pudo guardar la configuración"
        );
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al guardar los datos",
      });
    } finally {
      setLoading(false);
    }
  };

  // Document Type Rules
  const addDocumentTypeRule = () => {
    Swal.fire({
      title: "Nueva Regla de Tipo de Documento",
      html: `
        <div class="form-group">
          <label for="ruleName">Nombre</label>
          <input id="ruleName" class="swal2-input" placeholder="Ej: pedido">
        </div>
        <div class="form-group">
          <label for="sourceField">Campo de origen</label>
          <input id="sourceField" class="swal2-input" placeholder="Ej: EST_PED">
        </div>
        <div class="form-group">
          <label for="sourceValues">Valores (separados por coma)</label>
          <input id="sourceValues" class="swal2-input" placeholder="Ej: P, p">
        </div>
        <div class="form-group">
          <label for="description">Descripción</label>
          <input id="description" class="swal2-input" placeholder="Ej: Pedidos pendientes">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const sourceField = document.getElementById("sourceField").value;
        const sourceValuesStr = document.getElementById("sourceValues").value;
        const description = document.getElementById("description").value;

        if (!name || !sourceField || !sourceValuesStr) {
          Swal.showValidationMessage(
            "Los campos nombre, campo origen y valores son obligatorios"
          );
          return false;
        }

        const sourceValues = sourceValuesStr.split(",").map((v) => v.trim());

        return { name, sourceField, sourceValues, description };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        setMapping({
          ...mapping,
          documentTypeRules: [...mapping.documentTypeRules, result.value],
        });
      }
    });
  };

  const removeDocumentTypeRule = (index) => {
    const newRules = [...mapping.documentTypeRules];
    newRules.splice(index, 1);
    setMapping({
      ...mapping,
      documentTypeRules: newRules,
    });
  };

  // Table Configs
  const addTableConfig = () => {
    Swal.fire({
      title: "Nueva Configuración de Tabla",
      html: `
    <div class="form-group">
      <label for="tableName">Nombre</label>
      <input id="tableName" class="swal2-input" placeholder="Ej: pedidosHeader">
    </div>
    <div class="form-group">
      <label for="sourceTable">Tabla origen</label>
      <input id="sourceTable" class="swal2-input" placeholder="Ej: FAC_ENC_PED">
    </div>
    <div class="form-group">
      <label for="targetTable">Tabla destino</label>
      <input id="targetTable" class="swal2-input" placeholder="Ej: PEDIDO">
    </div>
    <div class="form-group">
      <label for="primaryKey">Clave primaria en tabla origen</label>
      <input id="primaryKey" class="swal2-input" placeholder="Ej: NUM_PED">
    </div>
    <div class="form-group">
      <label for="targetPrimaryKey">Clave primaria en tabla destino</label>
      <input id="targetPrimaryKey" class="swal2-input" placeholder="Ej: PEDIDO">
    </div>
    <div class="form-check">
      <input type="checkbox" id="isDetailTable" class="swal2-checkbox">
      <label for="isDetailTable">¿Es tabla de detalle?</label>
    </div>
    <div id="detailOptions" style="display: none; margin-left: 20px; padding-left: 10px; border-left: 2px solid #eee;">
      <div class="form-group">
        <label for="parentTableRef">Referencia a tabla padre</label>
        <input id="parentTableRef" class="swal2-input" placeholder="Ej: pedidosHeader">
      </div>
      <div class="form-check">
        <input type="checkbox" id="useSameSourceTable" class="swal2-checkbox">
        <label for="useSameSourceTable"><strong>Usar misma tabla de origen que el encabezado</strong></label>
        <small style="display:block;margin-top:4px;color:#666;">
          Seleccione esta opción si los detalles provienen de la misma tabla que el encabezado.
        </small>
      </div>
      <div class="form-group">
        <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
        <input id="orderByColumn" class="swal2-input" placeholder="Ej: SECUENCIA">
        <small style="display:block;margin-top:4px;color:#666;">
          Solo para tablas de detalle. Ej: SECUENCIA, LINEA, etc.
        </small>
      </div>
    </div>
    <div class="form-group">
      <label for="filterCondition">Condición de filtro adicional (opcional)</label>
      <input id="filterCondition" class="swal2-input" placeholder="Ej: ESTADO = 'A'">
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Mostrar/ocultar opciones de detalle según checkbox
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptionsDiv = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", function () {
          detailOptionsDiv.style.display = this.checked ? "block" : "none";
        });
      },
      preConfirm: () => {
        const name = document.getElementById("tableName").value;
        const sourceTable = document.getElementById("sourceTable").value;
        const targetTable = document.getElementById("targetTable").value;
        const primaryKey = document.getElementById("primaryKey").value;
        const targetPrimaryKey =
          document.getElementById("targetPrimaryKey").value;
        const isDetailTable = document.getElementById("isDetailTable").checked;
        const parentTableRef =
          document.getElementById("parentTableRef")?.value || "";
        const useSameSourceTable = isDetailTable
          ? document.getElementById("useSameSourceTable")?.checked
          : false;
        const orderByColumn =
          document.getElementById("orderByColumn")?.value || "";
        const filterCondition =
          document.getElementById("filterCondition").value;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre, tabla origen y tabla destino son obligatorios"
          );
          return false;
        }

        if (isDetailTable && !parentTableRef) {
          Swal.showValidationMessage(
            "Para tablas de detalle, debe especificar la referencia a la tabla padre"
          );
          return false;
        }

        return {
          name,
          sourceTable,
          targetTable,
          primaryKey,
          targetPrimaryKey,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : null,
          useSameSourceTable, // Nuevo campo
          orderByColumn: orderByColumn || null,
          filterCondition: filterCondition || null,
          fieldMappings: [],
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        setMapping({
          ...mapping,
          tableConfigs: [...mapping.tableConfigs, result.value],
        });
      }
    });
  };

  const removeTableConfig = (index) => {
    const newConfigs = [...mapping.tableConfigs];
    newConfigs.splice(index, 1);
    setMapping({
      ...mapping,
      tableConfigs: newConfigs,
    });
  };

  const addFieldMapping = (tableIndex) => {
    Swal.fire({
      title: "Nuevo Mapeo de Campo",
      html: `
      <div class="mapping-form">
        <div class="field-section">
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Campo origen (opcional)</div>
              <input id="sourceField" class="swal2-input" placeholder="Ej: COD_CLT">
            </div>
          </div>
          
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Campo destino (obligatorio)</div>
              <input id="targetField" class="swal2-input" placeholder="Ej: CODIGO">
            </div>
          </div>
        </div>
        
        <!-- Opciones para especificar el origen de datos -->
        <div class="data-source-options">
          <!-- NUEVA OPCIÓN: Consulta en base de datos destino -->
          <div class="form-check">
            <input type="checkbox" id="lookupFromTarget" class="swal2-checkbox">
            <label for="lookupFromTarget"><strong>¿Consultar en BD destino?</strong></label>
          </div>
        </div>
        
        <!-- Opciones para valor por defecto -->
        <div id="defaultValueSection" class="form-group">
          <div class="field-container">
            <div id="defaultValueLabel" class="field-header">Valor por defecto</div>
            <textarea id="defaultValue" class="swal2-textarea" rows="3" placeholder="Ingrese valor por defecto o función SQL nativa (GETDATE(), etc.)"></textarea>
            <div class="form-info">
              <strong>Nota:</strong> Para usar funciones SQL nativas como GETDATE(), NEWID(), etc. ingréselas directamente en el valor por defecto.
            </div>
          </div>
        </div>
        
        <!-- NUEVA SECCIÓN: Opciones para consulta en BD destino -->
        <div id="lookupSection" class="lookup-section" style="display:none;">
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Consulta SQL en destino</div>
              <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="Ej: SELECT nombre FROM clientes WHERE codigo = @codigo"></textarea>
              <div class="form-info" style="margin-top: 8px;">
                <strong>Nota:</strong> Use @parametro en la consulta para referenciar valores.
              </div>
            </div>
          </div>
          
          <div class="lookup-params-container">
            <div class="lookup-params-header">
              <h4>Parámetros para la consulta</h4>
              <button type="button" id="addLookupParam" class="btn-add-param">
                <i class="fa fa-plus"></i> Añadir
              </button>
            </div>
            
            <div id="lookupParamsContainer">
              <!-- Los parámetros se generarán dinámicamente aquí -->
            </div>
          </div>
          
          <div class="validation-options">
            <div class="form-check">
              <input type="checkbox" id="validateExistence" class="swal2-checkbox">
              <label for="validateExistence"><strong>Validar existencia</strong></label>
            </div>
            
            <div class="form-check">
              <input type="checkbox" id="failIfNotFound" class="swal2-checkbox">
              <label for="failIfNotFound"><strong>Fallar si no existe</strong></label>
              <small>Si está marcado, el procesamiento fallará si no se encuentra un valor. De lo contrario, usará NULL.</small>
            </div>
          </div>
        </div>
        
        <!-- Sección de eliminación de prefijos - Destacada visualmente -->
        <div class="form-group">
          <div class="field-container">
            <div class="field-header">Eliminar prefijo específico</div>
            <input id="removePrefix" class="swal2-input" placeholder="Ej: CN">
            <div class="form-info" style="margin-top: 8px;">
              <strong>Ejemplo de uso de prefijos:</strong><br>
              <span style="display: block; margin-top: 5px;">
                Si el valor en origen es <code>CN10133</code> y el prefijo es <code>CN</code>, 
                el valor en destino será <code>10133</code>
              </span>
              <span style="display: block; margin-top: 5px;">
                Esto aplica tanto para campos normales como para parámetros de lookups
              </span>
            </div>
          </div>
        </div>
        
        <div class="form-check">
          <input type="checkbox" id="isRequired" class="swal2-checkbox">
          <label for="isRequired"><strong>¿Campo obligatorio en destino?</strong></label>
        </div>
        
        <div class="form-info">
          <strong>Nota:</strong> Para campos obligatorios en la tabla destino, asegúrese de proporcionar un valor por defecto si no hay campo origen.
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      customClass: {
        popup: "mapping-editor-modal",
      },
      didOpen: () => {
        // Control de visibilidad de secciones según selección
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );

        // Función para actualizar la UI según selección
        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;

          // Mostrar/ocultar secciones según corresponda
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";
        };

        // Asignar eventos
        lookupFromTargetCheckbox.addEventListener("change", updateUI);

        // Inicializar UI
        updateUI();

        // Manejar parámetros de consulta
        const addLookupParamButton = document.getElementById("addLookupParam");
        const lookupParamsContainer = document.getElementById(
          "lookupParamsContainer"
        );

        // Función para añadir una fila de parámetro
        const addLookupParamRow = (paramName = "", sourceField = "") => {
          const index = document.querySelectorAll(".lookup-param-row").length;
          const row = document.createElement("div");
          row.className = "lookup-param-row";
          row.dataset.index = index;

          row.innerHTML = `
          <input type="text" class="swal2-input param-name" placeholder="Nombre parámetro" value="${paramName}">
          <input type="text" class="swal2-input source-field" placeholder="Campo origen" value="${sourceField}">
          <button type="button" class="btn-remove-param">
            <i class="fa fa-trash"></i>
          </button>
        `;

          // Añadir evento para eliminar parámetro
          const removeBtn = row.querySelector(".btn-remove-param");
          removeBtn.addEventListener("click", () => {
            row.remove();
          });

          lookupParamsContainer.appendChild(row);
        };

        // Evento para añadir parámetro
        addLookupParamButton.addEventListener("click", () => {
          addLookupParamRow();
        });

        // Añadir un parámetro inicial vacío
        if (lookupParamsContainer.children.length === 0) {
          addLookupParamRow();
        }
      },
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document.getElementById("removePrefix").value;
        const isRequired = document.getElementById("isRequired").checked;

        // Nuevos campos
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;

        // Validaciones básicas
        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        // Validar que tengamos origen de datos (source, lookup o valor default)
        if (!sourceField && !lookupFromTarget && !defaultValue && isRequired) {
          Swal.showValidationMessage(
            "Los campos obligatorios deben tener un origen de datos (campo origen, consulta o valor por defecto)"
          );
          return false;
        }

        // Procesar el valor por defecto
        let processedDefaultValue;
        if (defaultValue === "NULL") {
          processedDefaultValue = null;
        } else if (defaultValue === "") {
          processedDefaultValue = undefined;
        } else {
          processedDefaultValue = defaultValue;
        }

        // Propiedades de lookup
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false;

        if (lookupFromTarget) {
          lookupQuery = document.getElementById("lookupQuery").value;
          validateExistence =
            document.getElementById("validateExistence").checked;
          failIfNotFound = document.getElementById("failIfNotFound").checked;

          // Recopilar parámetros
          document.querySelectorAll(".lookup-param-row").forEach((row) => {
            const paramName = row.querySelector(".param-name").value;
            const sourceField = row.querySelector(".source-field").value;

            if (paramName && sourceField) {
              lookupParams.push({ paramName, sourceField });
            }
          });

          // Validar consulta
          if (!lookupQuery) {
            Swal.showValidationMessage(
              "Debe proporcionar una consulta SQL para el lookup"
            );
            return false;
          }

          // Validar que exista al menos un parámetro si la consulta utiliza parámetros
          const paramRegex = /@(\w+)/g;
          const expectedParams = [];
          let match;
          while ((match = paramRegex.exec(lookupQuery)) !== null) {
            expectedParams.push(match[1]);
          }

          if (expectedParams.length > 0) {
            const definedParams = lookupParams.map((p) => p.paramName);
            const missingParams = expectedParams.filter(
              (p) => !definedParams.includes(p)
            );

            if (missingParams.length > 0) {
              Swal.showValidationMessage(
                `Faltan definiciones para los siguientes parámetros: ${missingParams.join(
                  ", "
                )}`
              );
              return false;
            }
          }
        }

        return {
          sourceField: sourceField || null,
          targetField,
          defaultValue: processedDefaultValue,
          removePrefix: removePrefix || null,
          isRequired,
          valueMappings: [],
          // Propiedades de lookup
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs[tableIndex].fieldMappings.push(result.value);

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
  };

  const removeFieldMapping = (tableIndex, fieldIndex) => {
    const newTableConfigs = [...mapping.tableConfigs];
    newTableConfigs[tableIndex].fieldMappings.splice(fieldIndex, 1);

    setMapping({
      ...mapping,
      tableConfigs: newTableConfigs,
    });
  };

  // Value Mappings
  const addValueMapping = (tableIndex, fieldIndex) => {
    Swal.fire({
      title: "Nuevo Mapeo de Valor",
      html: `
        <div class="form-group">
          <label for="sourceValue">Valor origen</label>
          <input id="sourceValue" class="swal2-input" placeholder="Ej: P">
        </div>
        <div class="form-group">
          <label for="targetValue">Valor destino</label>
          <input id="targetValue" class="swal2-input" placeholder="Ej: PENDIENTE">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const sourceValue = document.getElementById("sourceValue").value;
        const targetValue = document.getElementById("targetValue").value;

        if (!sourceValue || !targetValue) {
          Swal.showValidationMessage("Ambos valores son obligatorios");
          return false;
        }

        return { sourceValue, targetValue };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs[tableIndex].fieldMappings[
          fieldIndex
        ].valueMappings.push(result.value);

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
  };

  const removeValueMapping = (tableIndex, fieldIndex, valueIndex) => {
    const newTableConfigs = [...mapping.tableConfigs];
    newTableConfigs[tableIndex].fieldMappings[fieldIndex].valueMappings.splice(
      valueIndex,
      1
    );

    setMapping({
      ...mapping,
      tableConfigs: newTableConfigs,
    });
  };

  const editDocumentTypeRule = (index) => {
    const rule = mapping.documentTypeRules[index];

    Swal.fire({
      title: "Editar Regla de Tipo de Documento",
      html: `
      <div class="form-group">
        <label for="ruleName">Nombre</label>
        <input id="ruleName" class="swal2-input" value="${
          rule.name
        }" placeholder="Ej: pedido">
      </div>
      <div class="form-group">
        <label for="sourceField">Campo de origen</label>
        <input id="sourceField" class="swal2-input" value="${
          rule.sourceField
        }" placeholder="Ej: EST_PED">
      </div>
      <div class="form-group">
        <label for="sourceValues">Valores (separados por coma)</label>
        <input id="sourceValues" class="swal2-input" value="${rule.sourceValues.join(
          ", "
        )}" placeholder="Ej: P, p">
      </div>
      <div class="form-group">
        <label for="description">Descripción</label>
        <input id="description" class="swal2-input" value="${
          rule.description || ""
        }" placeholder="Ej: Pedidos pendientes">
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const sourceField = document.getElementById("sourceField").value;
        const sourceValuesStr = document.getElementById("sourceValues").value;
        const description = document.getElementById("description").value;

        if (!name || !sourceField || !sourceValuesStr) {
          Swal.showValidationMessage(
            "Los campos nombre, campo origen y valores son obligatorios"
          );
          return false;
        }

        const sourceValues = sourceValuesStr.split(",").map((v) => v.trim());

        return { name, sourceField, sourceValues, description };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newRules = [...mapping.documentTypeRules];
        newRules[index] = result.value;

        setMapping({
          ...mapping,
          documentTypeRules: newRules,
        });
      }
    });
  };

  const editTableConfig = (index) => {
    const tableConfig = mapping.tableConfigs[index];

    Swal.fire({
      title: "Editar Configuración de Tabla",
      html: `
    <div class="form-group">
      <label for="tableName">Nombre</label>
      <input id="tableName" class="swal2-input" value="${
        tableConfig.name
      }" placeholder="Ej: pedidosHeader">
    </div>
    <div class="form-group">
      <label for="sourceTable">Tabla origen</label>
      <input id="sourceTable" class="swal2-input" value="${
        tableConfig.sourceTable
      }" placeholder="Ej: FAC_ENC_PED">
    </div>
    <div class="form-group">
      <label for="targetTable">Tabla destino</label>
      <input id="targetTable" class="swal2-input" value="${
        tableConfig.targetTable
      }" placeholder="Ej: PEDIDO">
    </div>
    <div class="form-group">
      <label for="primaryKey">Clave primaria en tabla origen</label>
      <input id="primaryKey" class="swal2-input" value="${
        tableConfig.primaryKey || ""
      }" placeholder="Ej: NUM_PED">
    </div>
    <div class="form-group">
      <label for="targetPrimaryKey">Clave primaria en tabla destino</label>
      <input id="targetPrimaryKey" class="swal2-input" value="${
        tableConfig.targetPrimaryKey || ""
      }" placeholder="Ej: PEDIDO">
    </div>
    <div class="form-check">
      <input type="checkbox" id="isDetailTable" class="swal2-checkbox" ${
        tableConfig.isDetailTable ? "checked" : ""
      }>
      <label for="isDetailTable">¿Es tabla de detalle?</label>
    </div>
    <div id="detailOptions" style="display: ${
      tableConfig.isDetailTable ? "block" : "none"
    }; margin-left: 20px; padding-left: 10px; border-left: 2px solid #eee;">
      <div class="form-group">
        <label for="parentTableRef">Referencia a tabla padre</label>
        <input id="parentTableRef" class="swal2-input" value="${
          tableConfig.parentTableRef || ""
        }" placeholder="Ej: pedidosHeader">
      </div>
      <div class="form-check">
        <input type="checkbox" id="useSameSourceTable" class="swal2-checkbox" ${
          tableConfig.useSameSourceTable ? "checked" : ""
        }>
        <label for="useSameSourceTable"><strong>Usar misma tabla de origen que el encabezado</strong></label>
        <small style="display:block;margin-top:4px;color:#666;">
          Seleccione esta opción si los detalles provienen de la misma tabla que el encabezado.
        </small>
      </div>
      <div class="form-group">
        <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
        <input id="orderByColumn" class="swal2-input" value="${
          tableConfig.orderByColumn || ""
        }" placeholder="Ej: SECUENCIA">
        <small style="display:block;margin-top:4px;color:#666;">
          Solo para tablas de detalle. Ej: SECUENCIA, LINEA, etc.
        </small>
      </div>
    </div>
    <div class="form-group">
      <label for="filterCondition">Condición de filtro adicional (opcional)</label>
      <input id="filterCondition" class="swal2-input" value="${
        tableConfig.filterCondition || ""
      }" placeholder="Ej: ESTADO = 'A'">
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Mostrar/ocultar opciones de detalle según checkbox
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptionsDiv = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", function () {
          detailOptionsDiv.style.display = this.checked ? "block" : "none";
        });
      },
      preConfirm: () => {
        const name = document.getElementById("tableName").value;
        const sourceTable = document.getElementById("sourceTable").value;
        const targetTable = document.getElementById("targetTable").value;
        const primaryKey = document.getElementById("primaryKey").value;
        const targetPrimaryKey =
          document.getElementById("targetPrimaryKey").value;
        const isDetailTable = document.getElementById("isDetailTable").checked;
        const parentTableRef =
          document.getElementById("parentTableRef")?.value || "";
        const useSameSourceTable = isDetailTable
          ? document.getElementById("useSameSourceTable")?.checked
          : false;
        const orderByColumn =
          document.getElementById("orderByColumn")?.value || "";
        const filterCondition =
          document.getElementById("filterCondition").value;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre, tabla origen y tabla destino son obligatorios"
          );
          return false;
        }

        if (isDetailTable && !parentTableRef) {
          Swal.showValidationMessage(
            "Para tablas de detalle, debe especificar la referencia a la tabla padre"
          );
          return false;
        }

        return {
          name,
          sourceTable,
          targetTable,
          primaryKey,
          targetPrimaryKey,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : null,
          useSameSourceTable, // Nuevo campo
          orderByColumn: orderByColumn || null,
          filterCondition: filterCondition || null,
          fieldMappings: tableConfig.fieldMappings,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs[index] = result.value;

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
  };

  const editFieldMapping = (tableIndex, fieldIndex) => {
    const field = mapping.tableConfigs[tableIndex].fieldMappings[fieldIndex];

    Swal.fire({
      title: "Editar Mapeo de Campo",
      html: `
      <div class="mapping-form">
        <div class="field-section">
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Campo origen (opcional)</div>
              <input id="sourceField" class="swal2-input" value="${
                field.sourceField || ""
              }" placeholder="Ej: COD_CLT">
            </div>
          </div>
          
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Campo destino (obligatorio)</div>
              <input id="targetField" class="swal2-input" value="${
                field.targetField
              }" placeholder="Ej: CODIGO">
            </div>
          </div>
        </div>
        
        <!-- Opciones para especificar el origen de datos -->
        <div class="data-source-options">
          <!-- NUEVA OPCIÓN: Consulta en base de datos destino -->
          <div class="form-check">
            <input type="checkbox" id="lookupFromTarget" class="swal2-checkbox" ${
              field.lookupFromTarget ? "checked" : ""
            }>
            <label for="lookupFromTarget"><strong>¿Consultar en BD destino?</strong></label>
          </div>
        </div>
        
        <!-- Opciones para valor por defecto -->
        <div id="defaultValueSection" class="form-group" style="display:${
          field.lookupFromTarget ? "none" : "block"
        }">
          <div class="field-container">
            <div id="defaultValueLabel" class="field-header">Valor por defecto</div>
            <textarea id="defaultValue" class="swal2-textarea" rows="3" placeholder="Ingrese valor por defecto o función SQL nativa (GETDATE(), etc.)">${
              field.defaultValue !== undefined ? field.defaultValue : ""
            }</textarea>
            <div class="form-info">
              <strong>Nota:</strong> Para usar funciones SQL nativas como GETDATE(), NEWID(), etc. ingréselas directamente en el valor por defecto.
            </div>
          </div>
        </div>
        
        <!-- NUEVA SECCIÓN: Opciones para consulta en BD destino -->
        <div id="lookupSection" class="lookup-section" style="display:${
          field.lookupFromTarget ? "block" : "none"
        }">
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Consulta SQL en destino</div>
              <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="Ej: SELECT nombre FROM clientes WHERE codigo = @codigo">${
                field.lookupQuery || ""
              }</textarea>
              <div class="form-info" style="margin-top: 8px;">
                <strong>Nota:</strong> Use @parametro en la consulta para referenciar valores.
              </div>
            </div>
          </div>
          
          <div class="lookup-params-container">
            <div class="lookup-params-header">
              <h4>Parámetros para la consulta</h4>
              <button type="button" id="addLookupParam" class="btn-add-param">
                <i class="fa fa-plus"></i> Añadir
              </button>
            </div>
            
            <div id="lookupParamsContainer">
              <!-- Los parámetros se generarán dinámicamente aquí -->
              ${(field.lookupParams || [])
                .map(
                  (param, idx) => `
                <div class="lookup-param-row" data-index="${idx}">
                  <input type="text" class="swal2-input param-name" placeholder="Nombre parámetro" value="${
                    param.paramName || ""
                  }">
                  <input type="text" class="swal2-input source-field" placeholder="Campo origen" value="${
                    param.sourceField || ""
                  }">
                  <button type="button" class="btn-remove-param">
                    <i class="fa fa-trash"></i>
                  </button>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
          
          <div class="validation-options">
            <div class="form-check">
              <input type="checkbox" id="validateExistence" class="swal2-checkbox" ${
                field.validateExistence ? "checked" : ""
              }>
              <label for="validateExistence"><strong>Validar existencia</strong></label>
            </div>
            
            <div class="form-check">
              <input type="checkbox" id="failIfNotFound" class="swal2-checkbox" ${
                field.failIfNotFound ? "checked" : ""
              }>
              <label for="failIfNotFound"><strong>Fallar si no existe</strong></label>
              <small>Si está marcado, el procesamiento fallará si no se encuentra un valor. De lo contrario, usará NULL.</small>
            </div>
          </div>
        </div>
        
        <!-- Sección de eliminación de prefijos -->
        <div class="form-group">
          <div class="field-container">
            <div class="field-header">Eliminar prefijo específico</div>
            <input id="removePrefix" class="swal2-input" value="${
              field.removePrefix || ""
            }" placeholder="Ej: CN">
            <div class="form-info" style="margin-top: 8px;">
              <strong>Ejemplo de uso de prefijos:</strong><br>
              <span style="display: block; margin-top: 5px;">
                Si el valor en origen es <code>CN10133</code> y el prefijo es <code>CN</code>, 
                el valor en destino será <code>10133</code>
              </span>
            </div>
          </div>
        </div>
        
        <div class="form-check">
          <input type="checkbox" id="isRequired" class="swal2-checkbox" ${
            field.isRequired ? "checked" : ""
          }>
          <label for="isRequired"><strong>¿Campo obligatorio en destino?</strong></label>
        </div>
        
        <div class="form-info">
          <strong>Nota:</strong> Para campos obligatorios en la tabla destino, asegúrese de proporcionar un valor por defecto si no hay campo origen.
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      customClass: {
        popup: "mapping-editor-modal",
      },
      didOpen: () => {
        // Control de visibilidad de secciones según selección
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );

        // Función para actualizar la UI según selección
        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;

          // Mostrar/ocultar secciones según corresponda
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";
        };

        // Asignar eventos
        lookupFromTargetCheckbox.addEventListener("change", updateUI);

        // Inicializar UI
        updateUI();

        // Manejar parámetros de consulta
        const addLookupParamButton = document.getElementById("addLookupParam");
        const lookupParamsContainer = document.getElementById(
          "lookupParamsContainer"
        );

        // Función para añadir una fila de parámetro
        const addLookupParamRow = (paramName = "", sourceField = "") => {
          const index = document.querySelectorAll(".lookup-param-row").length;
          const row = document.createElement("div");
          row.className = "lookup-param-row";
          row.dataset.index = index;

          row.innerHTML = `
          <input type="text" class="swal2-input param-name" placeholder="Nombre parámetro" value="${paramName}">
          <input type="text" class="swal2-input source-field" placeholder="Campo origen" value="${sourceField}">
          <button type="button" class="btn-remove-param">
            <i class="fa fa-trash"></i>
          </button>
        `;

          // Añadir evento para eliminar parámetro
          const removeBtn = row.querySelector(".btn-remove-param");
          removeBtn.addEventListener("click", () => {
            row.remove();
          });

          lookupParamsContainer.appendChild(row);
        };

        // Evento para añadir parámetro
        addLookupParamButton.addEventListener("click", () => {
          addLookupParamRow();
        });

        // Añadir eventos para eliminar parámetros existentes
        document.querySelectorAll(".btn-remove-param").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest(".lookup-param-row").remove();
          });
        });

        // Si no hay parámetros iniciales, añadir uno vacío
        if (
          lookupParamsContainer.children.length === 0 &&
          lookupFromTargetCheckbox.checked
        ) {
          addLookupParamRow();
        }
      },
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document.getElementById("removePrefix").value;
        const isRequired = document.getElementById("isRequired").checked;

        // Nuevos campos
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;

        // Validaciones básicas
        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        // Validar que tengamos origen de datos (source, lookup o valor default)
        if (!sourceField && !lookupFromTarget && !defaultValue && isRequired) {
          Swal.showValidationMessage(
            "Los campos obligatorios deben tener un origen de datos (campo origen, consulta o valor por defecto)"
          );
          return false;
        }

        // Procesar el valor por defecto
        let processedDefaultValue;
        if (defaultValue === "NULL") {
          processedDefaultValue = null;
        } else if (defaultValue === "") {
          processedDefaultValue = undefined;
        } else {
          processedDefaultValue = defaultValue;
        }

        // Propiedades de lookup
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false;

        if (lookupFromTarget) {
          lookupQuery = document.getElementById("lookupQuery").value;
          validateExistence =
            document.getElementById("validateExistence").checked;
          failIfNotFound = document.getElementById("failIfNotFound").checked;

          // Recopilar parámetros
          document.querySelectorAll(".lookup-param-row").forEach((row) => {
            const paramName = row.querySelector(".param-name").value;
            const sourceField = row.querySelector(".source-field").value;

            if (paramName && sourceField) {
              lookupParams.push({ paramName, sourceField });
            }
          });

          // Validar consulta
          if (!lookupQuery) {
            Swal.showValidationMessage(
              "Debe proporcionar una consulta SQL para el lookup"
            );
            return false;
          }

          // Validar que exista al menos un parámetro si la consulta utiliza parámetros
          if (lookupQuery.includes("@") && lookupParams.length === 0) {
            Swal.showValidationMessage(
              "La consulta utiliza parámetros pero no se han definido"
            );
            return false;
          }
        }

        return {
          sourceField: sourceField || null,
          targetField,
          defaultValue: processedDefaultValue,
          removePrefix: removePrefix || null,
          isRequired,
          valueMappings: field.valueMappings || [],
          // Propiedades de lookup
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false,
          // Establecemos estas en false explícitamente para que no se usen
          isSqlFunction: false,
          sqlFunctionPreExecute: false,
          sqlFunctionServer: "target",
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs[tableIndex].fieldMappings[fieldIndex] = result.value;

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
  };

  if (loading) {
    return <LoadingContainer>Cargando configuración...</LoadingContainer>;
  }

  return (
    <Container>
      <Header>
        <h2>{mappingId ? "Editar" : "Nueva"} Configuración de Mapeo</h2>
        <ButtonsGroup>
          <Button onClick={handleSave}>
            <FaSave /> Guardar
          </Button>
          <Button $secondary onClick={onCancel}>
            <FaTimes /> Cancelar
          </Button>
        </ButtonsGroup>
      </Header>

      <Tabs>
        <Tab
          $active={activeTab === "general"}
          onClick={() => setActiveTab("general")}
        >
          General
        </Tab>
        <Tab
          $active={activeTab === "documentTypes"}
          onClick={() => setActiveTab("documentTypes")}
        >
          Tipos de Documento
        </Tab>
        <Tab
          $active={activeTab === "tables"}
          onClick={() => setActiveTab("tables")}
        >
          Tablas y Campos
        </Tab>
      </Tabs>

      <Content>
        {/* Pestaña General */}
        {activeTab === "general" && (
          <Section>
            <FormGroup>
              <Label>Nombre</Label>
              <Input
                type="text"
                name="name"
                value={mapping.name}
                onChange={handleChange}
                placeholder="Nombre de la configuración"
              />
            </FormGroup>

            <FormGroup>
              <Label>Descripción</Label>
              <Textarea
                name="description"
                value={mapping.description || ""}
                onChange={handleChange}
                placeholder="Descripción de la configuración"
              />
            </FormGroup>

            {/* Nuevo campo: Tipo de Entidad */}
            <FormGroup>
              <Label>Tipo de Entidad</Label>
              <Select
                name="entityType"
                value={mapping.entityType || "orders"}
                onChange={handleChange}
              >
                <option value="orders">Pedidos</option>
                <option value="customers">Clientes</option>
                <option value="invoices">Facturas</option>
                {/* <option value="other">Otros</option> */}
              </Select>
            </FormGroup>

            <FormRow>
              <FormGroup>
                <Label>Tipo de Transferencia</Label>
                <Select
                  name="transferType"
                  value={mapping.transferType}
                  onChange={handleChange}
                >
                  <option value="down">DOWN (server2 → server1)</option>
                  <option value="up">UP (server1 → server2)</option>
                  <option value="both">Ambos</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Servidor Origen</Label>
                <Select
                  name="sourceServer"
                  value={mapping.sourceServer}
                  onChange={handleChange}
                >
                  <option value="server1">server1</option>
                  <option value="server2">server2</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Servidor Destino</Label>
                <Select
                  name="targetServer"
                  value={mapping.targetServer}
                  onChange={handleChange}
                >
                  <option value="server1">server1</option>
                  <option value="server2">server2</option>
                </Select>
              </FormGroup>
            </FormRow>

            <CheckboxGroup>
              <Checkbox
                type="checkbox"
                name="active"
                checked={mapping.active}
                onChange={handleChange}
                id="active"
              />
              <CheckboxLabel htmlFor="active">
                Configuración activa
              </CheckboxLabel>
            </CheckboxGroup>

            <FormRow>
              <FormGroup>
                <Label>Campo de marcado procesado</Label>
                <Input
                  type="text"
                  name="markProcessedField"
                  value={mapping.markProcessedField}
                  onChange={handleChange}
                  placeholder="Ej: IS_PROCESSED"
                />
              </FormGroup>

              <FormGroup>
                <Label>Valor de marcado procesado</Label>
                <Input
                  type="text"
                  name="markProcessedValue"
                  value={mapping.markProcessedValue}
                  onChange={handleChange}
                  placeholder="Ej: 1"
                />
              </FormGroup>
            </FormRow>
            <FormGroup>
              <ConsecutiveConfigSection
                mapping={mapping}
                handleChange={handleChange}
              />
            </FormGroup>
          </Section>
        )}

        {/* Pestaña Tipos de Documento */}
        {activeTab === "documentTypes" && (
          <Section>
            <SectionHeader>
              <h3>Reglas de Tipo de Documento</h3>
              <SmallButton onClick={addDocumentTypeRule}>
                <FaPlus /> Añadir Regla
              </SmallButton>
            </SectionHeader>

            {mapping.documentTypeRules.length === 0 ? (
              <EmptyMessage>No hay reglas configuradas</EmptyMessage>
            ) : (
              mapping.documentTypeRules.map((rule, index) => (
                <Card key={index}>
                  <CardHeader>
                    <h4>{rule.name}</h4>
                    <div className="button_container">
                      <SmallButton
                        onClick={() => editDocumentTypeRule(index)}
                        title="Editar regla"
                      >
                        <FaEdit />
                      </SmallButton>
                      <SmallButton
                        $danger
                        onClick={() => removeDocumentTypeRule(index)}
                      >
                        <FaTrash />
                      </SmallButton>
                    </div>
                  </CardHeader>

                  <CardBody>
                    <PropertyList>
                      <PropertyItem>
                        <PropertyLabel>Campo origen:</PropertyLabel>
                        <PropertyValue>{rule.sourceField}</PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Valores:</PropertyLabel>
                        <PropertyValue>
                          {rule.sourceValues.join(", ")}
                        </PropertyValue>
                      </PropertyItem>

                      {rule.description && (
                        <PropertyItem>
                          <PropertyLabel>Descripción:</PropertyLabel>
                          <PropertyValue>{rule.description}</PropertyValue>
                        </PropertyItem>
                      )}
                    </PropertyList>
                  </CardBody>
                </Card>
              ))
            )}
          </Section>
        )}

        {/* Pestaña Tablas y Campos */}
        {activeTab === "tables" && (
          <Section>
            <SectionHeader>
              <h3>Configuración de Tablas</h3>
              <SmallButton onClick={addTableConfig}>
                <FaPlus /> Añadir Tabla
              </SmallButton>
            </SectionHeader>

            {mapping.tableConfigs.length === 0 ? (
              <EmptyMessage>No hay tablas configuradas</EmptyMessage>
            ) : (
              mapping.tableConfigs.map((tableConfig, tableIndex) => (
                <Card key={tableIndex} $isDetail={tableConfig.isDetailTable}>
                  <CardHeader>
                    <h4>{tableConfig.name}</h4>
                    <div className="button_container">
                      <SmallButton
                        onClick={() => editTableConfig(tableIndex)}
                        title="Editar tabla"
                      >
                        <FaEdit />
                      </SmallButton>
                      <SmallButton
                        $danger
                        onClick={() => removeTableConfig(tableIndex)}
                      >
                        <FaTrash />
                      </SmallButton>
                    </div>
                  </CardHeader>

                  <CardBody>
                    <PropertyList>
                      <PropertyItem>
                        <PropertyLabel>Tabla origen:</PropertyLabel>
                        <PropertyValue>{tableConfig.sourceTable}</PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Tabla destino:</PropertyLabel>
                        <PropertyValue>{tableConfig.targetTable}</PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Clave primaria:</PropertyLabel>
                        <PropertyValue>
                          {tableConfig.primaryKey || "N/A"}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Tipo:</PropertyLabel>
                        <PropertyValue>
                          {tableConfig.isDetailTable ? "Detalle" : "Principal"}
                        </PropertyValue>
                      </PropertyItem>

                      {tableConfig.isDetailTable &&
                        tableConfig.parentTableRef && (
                          <PropertyItem>
                            <PropertyLabel>Tabla padre:</PropertyLabel>
                            <PropertyValue>
                              {tableConfig.parentTableRef}
                            </PropertyValue>
                          </PropertyItem>
                        )}
                    </PropertyList>

                    <SubSection>
                      <SubSectionHeader>
                        <h5>Mapeo de Campos</h5>
                        <SmallButton
                          onClick={() => addFieldMapping(tableIndex)}
                        >
                          <FaPlus /> Añadir Campo
                        </SmallButton>
                      </SubSectionHeader>

                      {tableConfig.fieldMappings.length === 0 ? (
                        <EmptyMessage>No hay campos mapeados</EmptyMessage>
                      ) : (
                        <Table>
                          <thead>
                            <tr>
                              <th>Campo Origen</th>
                              <th>Campo Destino</th>
                              <th>Valor Default</th>
                              <th>Función SQL</th>
                              <th>Mapeos</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableConfig.fieldMappings.map(
                              (field, fieldIndex) => (
                                <tr key={fieldIndex}>
                                  <td>{field.sourceField}</td>
                                  <td>{field.targetField}</td>
                                  <td>
                                    {field.defaultValue !== undefined
                                      ? String(field.defaultValue)
                                      : "-"}
                                  </td>
                                  <td>{field.isSqlFunction ? "Sí" : "No"}</td>
                                  <td>
                                    <ValueMappingsCell>
                                      <span>
                                        {field.valueMappings?.length || 0}
                                      </span>
                                      <MiniButton
                                        onClick={() =>
                                          addValueMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                      >
                                        <FaPlus />
                                      </MiniButton>
                                    </ValueMappingsCell>
                                  </td>
                                  <td>
                                    <ActionButtons>
                                      <MiniButton
                                        onClick={() =>
                                          editFieldMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                        title="Editar campo"
                                      >
                                        <FaEdit />
                                      </MiniButton>
                                      <MiniButton
                                        $danger
                                        onClick={() =>
                                          removeFieldMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                      >
                                        <FaTrash />
                                      </MiniButton>
                                    </ActionButtons>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </Table>
                      )}
                    </SubSection>
                  </CardBody>
                </Card>
              ))
            )}
          </Section>
        )}
      </Content>
    </Container>
  );
}

// Estilos
const Container = styled.div`
  padding: 20px;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h2 {
    margin: 0;
    color: ${(props) => props.theme.title};
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;

    h2 {
      margin-bottom: 10px;
    }
  }
`;

const ButtonsGroup = styled.div`
  display: flex;
  gap: 10px;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) =>
    props.$secondary ? props.theme.secondary : props.theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) =>
      props.$secondary ? props.theme.secondaryHover : props.theme.primaryHover};
  }

  @media (max-width: 768px) {
    flex: 1;
    justify-content: center;
  }
`;

const SmallButton = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background-color: ${(props) =>
    props.$danger ? props.theme.danger : props.theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) =>
      props.$danger ? props.theme.dangerHover : props.theme.primaryHover};
  }
`;

const MiniButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background-color: ${(props) =>
    props.$danger ? props.theme.danger : props.theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) =>
      props.$danger ? props.theme.dangerHover : props.theme.primaryHover};
  }
`;

const Tabs = styled.div`
  display: flex;
  margin-bottom: 20px;
  border-bottom: 1px solid ${(props) => props.theme.border};
`;

const Tab = styled.div`
  padding: 10px 20px;
  cursor: pointer;
  border-bottom: 3px solid
    ${(props) => (props.$active ? props.theme.primary : "transparent")};
  color: ${(props) => (props.$active ? props.theme.primary : props.theme.text)};
  font-weight: ${(props) => (props.$active ? "bold" : "normal")};

  &:hover {
    color: ${(props) => props.theme.primary};
  }
`;

const Content = styled.div`
  margin-top: 20px;
`;

const Section = styled.div`
  margin-bottom: 30px;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;

  h3 {
    margin: 0;
    color: ${(props) => props.theme.title};
  }
`;

const FormGroup = styled.div`
  margin-bottom: 15px;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FormRow = styled.div`
  display: flex;
  gap: 15px;
  margin-bottom: 15px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 10px;
  }
`;

const Label = styled.label`
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: ${(props) => props.theme.text};
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};
  min-height: 100px;
  resize: vertical;
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
`;

const Checkbox = styled.input`
  margin-right: 8px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  cursor: pointer;
`;

const Card = styled.div`
  margin-bottom: 20px;
  border: 1px solid ${(props) => props.theme.border};
  border-left: 4px solid
    ${(props) => (props.$isDetail ? props.theme.info : props.theme.primary)};
  border-radius: 6px;
  background-color: ${(props) => props.theme.cardBg};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background-color: ${(props) => props.theme.cardHeaderBg};
  border-bottom: 1px solid ${(props) => props.theme.border};

  h4 {
    margin: 0;
    color: ${(props) => props.theme.title};
  }
`;

const CardBody = styled.div`
  padding: 15px;
`;

const PropertyList = styled.div`
  margin-bottom: 20px;
`;

const PropertyItem = styled.div`
  display: flex;
  margin-bottom: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const PropertyLabel = styled.div`
  width: 120px;
  font-weight: 500;
  color: ${(props) => props.theme.textSecondary};

  @media (max-width: 768px) {
    width: 100%;
    margin-bottom: 2px;
  }
`;

const PropertyValue = styled.div`
  flex: 1;
`;

const SubSection = styled.div`
  margin-top: 20px;
`;

const SubSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;

  h5 {
    margin: 0;
    color: ${(props) => props.theme.title};
    font-size: 14px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid ${(props) => props.theme.border};
  }

  th {
    background-color: ${(props) => props.theme.tableHeader};
    color: ${(props) => props.theme.tableHeaderText};
    font-weight: 600;
  }

  tr:hover td {
    background-color: ${(props) => props.theme.tableHover};
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 5px;
`;

const ValueMappingsCell = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 15px;
  color: ${(props) => props.theme.textSecondary};
  background-color: ${(props) => props.theme.cardBg};
  border-radius: 4px;
  border: 1px dashed ${(props) => props.theme.border};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: ${(props) => props.theme.textSecondary};
`;
