import React, { useState, useEffect } from "react";
import styled from "styled-components";
import {
  ConsecutiveConfigSection,
  PromotionConfigSection,
  useAuth,
} from "../../index";
import { TransferApi } from "../../api/index";
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
    entityType: "orders",
    documentTypeRules: [],
    tableConfigs: [],
    markProcessedField: "IS_PROCESSED",
    markProcessedValue: 1,
    consecutiveConfig: { enabled: false },
    foreignKeyDependencies: [],
  });
  const [isEditing, setIsEditing] = useState(!!mappingId);
  const [activeTab, setActiveTab] = useState("general");

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
      setMapping((prevState) => ({
        ...prevState,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleSave = async () => {
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

    const mappingCopy = JSON.parse(JSON.stringify(mapping));

    // Verificar y corregir propiedades faltantes para cada campo
    mappingCopy.tableConfigs.forEach((tableConfig) => {
      if (tableConfig.fieldMappings) {
        tableConfig.fieldMappings.forEach((field) => {
          field.isEditable = field.isEditable !== false;
          field.showInList = field.showInList === true;
          field.displayName = field.displayName || null;
          field.displayOrder = field.displayOrder || 0;
          field.fieldGroup = field.fieldGroup || null;
          field.fieldType = field.fieldType || "text";

          if (field.fieldType === "select") {
            field.options = field.options || [];
          } else {
            field.options = null;
          }
        });
      }
    });

    console.log("Mapping a guardar:", mappingCopy);

    setLoading(true);
    try {
      let result;
      if (isEditing) {
        result = await api.updateMapping(accessToken, mappingId, mappingCopy);
      } else {
        result = await api.createMapping(accessToken, mappingCopy);
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

  const removeDocumentTypeRule = (index) => {
    const newRules = [...mapping.documentTypeRules];
    newRules.splice(index, 1);
    setMapping({
      ...mapping,
      documentTypeRules: newRules,
    });
  };

  // Foreign Key Dependencies
  const addForeignKeyDependency = () => {
    Swal.fire({
      title: "Nueva Dependencia de Foreign Key",
      html: `
      <div class="dependency-form">
        <div class="form-group">
          <label for="fieldName">Campo que causa la dependencia</label>
          <input id="fieldName" class="swal2-input" placeholder="Ej: CONTRIBUYENTE">
          <small>Campo en la tabla principal que debe existir en otra tabla</small>
        </div>

        <div class="form-group">
          <label for="dependentTable">Tabla donde debe existir/insertarse</label>
          <input id="dependentTable" class="swal2-input" placeholder="Ej: NIT">
        </div>

        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="0" placeholder="0">
          <small>Menor número = se ejecuta primero</small>
        </div>

        <div class="form-check">
          <input type="checkbox" id="insertIfNotExists" class="swal2-checkbox" checked>
          <label for="insertIfNotExists">Insertar si no existe</label>
        </div>

        <div class="form-check">
          <input type="checkbox" id="validateOnly" class="swal2-checkbox">
          <label for="validateOnly">Solo validar (no insertar)</label>
        </div>

        <div class="dependent-fields-section">
          <h4>Campos a insertar en la tabla dependiente</h4>
          <div id="dependentFieldsContainer">
            <div class="dependent-field-row">
              <input type="text" class="swal2-input source-field" placeholder="Campo origen (opcional)">
              <input type="text" class="swal2-input target-field" placeholder="Campo destino" required>
              <input type="text" class="swal2-input default-value" placeholder="Valor por defecto">
              <div class="form-check">
                <input type="checkbox" class="swal2-checkbox is-key">
                <label>Es clave referenciada</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value.trim();
        const dependentTable = document
          .getElementById("dependentTable")
          .value.trim();
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").checked;
        const validateOnly = document.getElementById("validateOnly").checked;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Los campos nombre y tabla dependiente son obligatorios"
          );
          return false;
        }

        const dependentFields = [];
        document.querySelectorAll(".dependent-field-row").forEach((row) => {
          const sourceField = row.querySelector(".source-field").value.trim();
          const targetField = row.querySelector(".target-field").value.trim();
          const defaultValue = row.querySelector(".default-value").value.trim();
          const isKey = row.querySelector(".is-key").checked;

          if (targetField) {
            dependentFields.push({
              sourceField: sourceField || null,
              targetField,
              defaultValue: defaultValue || null,
              isKey,
            });
          }
        });

        if (dependentFields.length === 0) {
          Swal.showValidationMessage(
            "Debe definir al menos un campo a insertar"
          );
          return false;
        }

        return {
          fieldName,
          dependentTable,
          executionOrder,
          insertIfNotExists,
          validateOnly,
          dependentFields,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        setMapping({
          ...mapping,
          foreignKeyDependencies: [
            ...(mapping.foreignKeyDependencies || []),
            result.value,
          ],
        });
      }
    });
  };

  const removeForeignKeyDependency = (index) => {
    const newDependencies = [...(mapping.foreignKeyDependencies || [])];
    newDependencies.splice(index, 1);
    setMapping({
      ...mapping,
      foreignKeyDependencies: newDependencies,
    });
  };

  // Table Configurations
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
    <div id="detailOptions" style="display: none; margin-left: 20px;">
      <div class="form-group">
        <label for="parentTableRef">Referencia a tabla padre</label>
        <input id="parentTableRef" class="swal2-input" placeholder="Ej: pedidosHeader">
      </div>
      <div class="form-check">
        <input type="checkbox" id="useSameSourceTable" class="swal2-checkbox">
        <label for="useSameSourceTable">Usar misma tabla de origen que el encabezado</label>
      </div>
      <div class="form-group">
        <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
        <input id="orderByColumn" class="swal2-input" placeholder="Ej: SECUENCIA">
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
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptionsDiv = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", function () {
          detailOptionsDiv.style.display = this.checked ? "block" : "none";
        });
      },
      preConfirm: () => {
        const name = document.getElementById("tableName").value.trim();
        const sourceTable = document.getElementById("sourceTable").value.trim();
        const targetTable = document.getElementById("targetTable").value.trim();
        const primaryKey = document.getElementById("primaryKey").value.trim();
        const targetPrimaryKey = document
          .getElementById("targetPrimaryKey")
          .value.trim();
        const isDetailTable = document.getElementById("isDetailTable").checked;
        const parentTableRef = document
          .getElementById("parentTableRef")
          .value.trim();
        const useSameSourceTable =
          document.getElementById("useSameSourceTable").checked;
        const orderByColumn = document
          .getElementById("orderByColumn")
          .value.trim();
        const filterCondition = document
          .getElementById("filterCondition")
          .value.trim();

        if (!name || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre y tabla destino son obligatorios"
          );
          return false;
        }

        if (!isDetailTable && !sourceTable) {
          Swal.showValidationMessage(
            "La tabla origen es obligatoria para tablas principales"
          );
          return false;
        }

        if (isDetailTable && !parentTableRef && !useSameSourceTable) {
          Swal.showValidationMessage(
            "Para tablas de detalle debe especificar la tabla padre o usar la misma tabla de origen"
          );
          return false;
        }

        return {
          name,
          sourceTable: sourceTable || null,
          targetTable,
          primaryKey: primaryKey || null,
          targetPrimaryKey: targetPrimaryKey || null,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : null,
          useSameSourceTable,
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
    };">
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
        <label for="useSameSourceTable">Usar misma tabla de origen que el encabezado</label>
      </div>
      <div class="form-group">
        <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
        <input id="orderByColumn" class="swal2-input" value="${
          tableConfig.orderByColumn || ""
        }" placeholder="Ej: SECUENCIA">
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
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptionsDiv = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", function () {
          detailOptionsDiv.style.display = this.checked ? "block" : "none";
        });
      },
      preConfirm: () => {
        const name = document.getElementById("tableName").value.trim();
        const sourceTable = document.getElementById("sourceTable").value.trim();
        const targetTable = document.getElementById("targetTable").value.trim();
        const primaryKey = document.getElementById("primaryKey").value.trim();
        const targetPrimaryKey = document
          .getElementById("targetPrimaryKey")
          .value.trim();
        const isDetailTable = document.getElementById("isDetailTable").checked;
        const parentTableRef = document
          .getElementById("parentTableRef")
          .value.trim();
        const useSameSourceTable =
          document.getElementById("useSameSourceTable").checked;
        const orderByColumn = document
          .getElementById("orderByColumn")
          .value.trim();
        const filterCondition = document
          .getElementById("filterCondition")
          .value.trim();

        if (!name || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre y tabla destino son obligatorios"
          );
          return false;
        }

        return {
          name,
          sourceTable: sourceTable || null,
          targetTable,
          primaryKey: primaryKey || null,
          targetPrimaryKey: targetPrimaryKey || null,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : null,
          useSameSourceTable,
          orderByColumn: orderByColumn || null,
          filterCondition: filterCondition || null,
          fieldMappings: tableConfig.fieldMappings || [],
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

  const removeTableConfig = (index) => {
    const newConfigs = [...mapping.tableConfigs];
    newConfigs.splice(index, 1);
    setMapping({
      ...mapping,
      tableConfigs: newConfigs,
    });
  };

  // Field Mappings
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

        <!-- SECCIÓN: Opciones para consulta en BD destino -->
        <div id="lookupSection" class="lookup-section" style="display:none;">
          <div class="form-group">
            <div class="field-container">
              <div class="field-header">Consulta SQL en destino</div>
              <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="Ej: SELECT NOMBRE FROM CATELLI.CLIENTE WHERE CLIENTE = @codigo"></textarea>
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
              <small>Si está marcado, el procesamiento fallará si no se encuentra un valor. Si no está marcado, usará NULL o valor por defecto.</small>
            </div>
          </div>
        </div>

        <!-- Sección de eliminación de prefijos -->
        <div class="form-group">
          <div class="field-container">
            <div class="field-header">Eliminar prefijo específico</div>
            <input id="removePrefix" class="swal2-input" placeholder="Ej: CN">
            <div class="form-info" style="margin-top: 8px;">
              <strong>Ejemplo:</strong> Si el valor es CN10133 y el prefijo es CN, el resultado será 10133
            </div>
          </div>
        </div>

        <div class="form-check">
          <input type="checkbox" id="isRequired" class="swal2-checkbox">
          <label for="isRequired"><strong>¿Campo obligatorio en destino?</strong></label>
        </div>

        <!-- Propiedades de visualización -->
        <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Propiedades de Visualización</h4>

        <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
          <div class="form-group" style="flex: 1 1 200px;">
            <label for="displayName">Nombre a mostrar</label>
            <input id="displayName" class="swal2-input" placeholder="Ej: Código de Cliente">
            <small style="display: block; margin-top: 5px;">Nombre amigable para mostrar en listas y formularios.</small>
          </div>

          <div class="form-group" style="flex: 1 1 100px;">
            <label for="displayOrder">Orden de visualización</label>
            <input id="displayOrder" type="number" class="swal2-input" value="0" placeholder="0">
            <small style="display: block; margin-top: 5px;">Orden en listas y formularios.</small>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
          <div class="form-check">
            <input type="checkbox" id="isEditable" class="swal2-checkbox" checked>
            <label for="isEditable">¿Editable?</label>
          </div>

          <div class="form-check">
            <input type="checkbox" id="showInList" class="swal2-checkbox">
            <label for="showInList">¿Mostrar en listas?</label>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
          <div class="form-group" style="flex: 1 1 200px;">
            <label for="fieldGroup">Grupo de campos</label>
            <input id="fieldGroup" class="swal2-input" placeholder="Ej: Información General">
            <small style="display: block; margin-top: 5px;">Grupo donde aparecerá en formularios.</small>
          </div>

          <div class="form-group" style="flex: 1 1 200px;">
            <label for="fieldType">Tipo de campo</label>
            <select id="fieldType" class="swal2-select">
              <option value="text" selected>Texto</option>
              <option value="number">Número</option>
              <option value="date">Fecha</option>
              <option value="boolean">Sí/No</option>
              <option value="select">Lista desplegable</option>
              <option value="textarea">Texto largo</option>
              <option value="email">Correo electrónico</option>
              <option value="tel">Teléfono</option>
              <option value="hidden">Oculto</option>
            </select>
          </div>
        </div>
      </div>

      <style>
        .mapping-form { text-align: left; }
        .field-container { margin-bottom: 15px; }
        .field-header { font-weight: 600; margin-bottom: 5px; color: #333; }
        .form-info { font-size: 0.85em; color: #666; margin-top: 5px; }
        .data-source-options { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
        .lookup-section { margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 5px; border-left: 4px solid #2196f3; }
        .lookup-params-container { margin-top: 15px; }
        .lookup-params-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .lookup-param-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
        .lookup-param-row input { flex: 1; }
        .btn-add-param, .btn-remove-param { padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-add-param { background: #28a745; color: white; }
        .btn-remove-param { background: #dc3545; color: white; }
        .validation-options { margin-top: 15px; }
        .validation-options .form-check { margin-bottom: 10px; }
        .validation-options small { display: block; margin-top: 5px; color: #666; font-size: 0.85em; }
      </style>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Referencias a elementos
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );
        const addLookupParamButton = document.getElementById("addLookupParam");
        const lookupParamsContainer = document.getElementById(
          "lookupParamsContainer"
        );

        // Manejar visibilidad de secciones
        lookupFromTargetCheckbox.addEventListener("change", function () {
          const isLookup = this.checked;
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";

          // Añadir un parámetro inicial si está en modo lookup y no hay parámetros
          if (isLookup && lookupParamsContainer.children.length === 0) {
            addLookupParamRow();
          }
        });

        // Función para añadir una fila de parámetro
        const addLookupParamRow = (
          paramName = "",
          sourceField = "",
          removePrefix = ""
        ) => {
          const index = document.querySelectorAll(".lookup-param-row").length;
          const row = document.createElement("div");
          row.className = "lookup-param-row";
          row.dataset.index = index;

          row.innerHTML = `
            <input type="text" class="swal2-input param-name" placeholder="Nombre parámetro" value="${paramName}">
            <input type="text" class="swal2-input source-field" placeholder="Campo origen" value="${sourceField}">
            <input type="text" class="swal2-input remove-prefix" placeholder="Prefijo a eliminar" value="${removePrefix}">
            <button type="button" class="btn-remove-param">✕</button>
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
      },
      preConfirm: () => {
        // Recopilar todos los valores
        const sourceField = document.getElementById("sourceField").value.trim();
        const targetField = document.getElementById("targetField").value.trim();
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document
          .getElementById("removePrefix")
          .value.trim();
        const isRequired = document.getElementById("isRequired").checked;

        // Valores para lookup
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;

        // Propiedades de visualización
        const isEditable = document.getElementById("isEditable").checked;
        const showInList = document.getElementById("showInList").checked;
        const displayName = document.getElementById("displayName").value.trim();
        const displayOrder =
          parseInt(document.getElementById("displayOrder").value) || 0;
        const fieldGroup = document.getElementById("fieldGroup").value.trim();
        const fieldType = document.getElementById("fieldType").value;

        // Validaciones básicas
        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        // Recopilar parámetros de lookup y configuración
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false; // CAMBIADO: Por defecto false para permitir NULL

        if (lookupFromTarget) {
          lookupQuery = document.getElementById("lookupQuery").value.trim();
          validateExistence =
            document.getElementById("validateExistence").checked;
          failIfNotFound = document.getElementById("failIfNotFound").checked;

          // Recopilar parámetros
          document.querySelectorAll(".lookup-param-row").forEach((row) => {
            const paramName = row.querySelector(".param-name").value.trim();
            const paramSourceField = row
              .querySelector(".source-field")
              .value.trim();
            const paramRemovePrefix = row
              .querySelector(".remove-prefix")
              .value.trim();

            if (paramName && paramSourceField) {
              lookupParams.push({
                paramName,
                sourceField: paramSourceField,
                removePrefix: paramRemovePrefix || null, // NUEVO: Soporte para prefijos en parámetros
              });
            }
          });

          // Validar consulta
          if (!lookupQuery) {
            Swal.showValidationMessage(
              "Debe proporcionar una consulta SQL para el lookup"
            );
            return false;
          }

          // Validar que existan parámetros si la consulta los usa
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
                `Faltan parámetros en la configuración: ${missingParams.join(
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
          defaultValue: defaultValue || null,
          removePrefix: removePrefix || null,
          isRequired,
          valueMappings: [],

          // Configuración de lookup
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false, // CAMBIADO: Por defecto false

          // Propiedades de visualización
          isEditable,
          showInList,
          displayName: displayName || null,
          displayOrder,
          fieldGroup: fieldGroup || null,
          fieldType,
          options: null,

          // Configuración adicional
          unitConversion: { enabled: false },
        };
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        console.log("Nuevo campo a agregar:", result.value);

        const newTableConfigs = JSON.parse(
          JSON.stringify(mapping.tableConfigs)
        );

        if (!newTableConfigs[tableIndex].fieldMappings) {
          newTableConfigs[tableIndex].fieldMappings = [];
        }

        newTableConfigs[tableIndex].fieldMappings.push(result.value);

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });

        console.log("Tabla actualizada:", newTableConfigs[tableIndex]);
      }
    });
  };

  const editFieldMapping = (tableIndex, fieldIndex) => {
    const field = mapping.tableConfigs[tableIndex].fieldMappings[fieldIndex];

    if (!field) {
      console.error(
        `Campo no encontrado en posición ${tableIndex}-${fieldIndex}`
      );
      return;
    }

    console.log("Campo a editar:", field);

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
             field.defaultValue !== undefined && field.defaultValue !== null
               ? field.defaultValue
               : ""
           }</textarea>
           <div class="form-info">
             <strong>Nota:</strong> Para usar funciones SQL nativas como GETDATE(), NEWID(), etc. ingréselas directamente en el valor por defecto.
           </div>
         </div>
       </div>

       <!-- SECCIÓN: Opciones para consulta en BD destino -->
       <div id="lookupSection" class="lookup-section" style="display:${
         field.lookupFromTarget ? "block" : "none"
       }">
         <div class="form-group">
           <div class="field-container">
             <div class="field-header">Consulta SQL en destino</div>
             <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="Ej: SELECT NOMBRE FROM CATELLI.CLIENTE WHERE CLIENTE = @codigo">${
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
                 <input type="text" class="swal2-input remove-prefix" placeholder="Prefijo a eliminar" value="${
                   param.removePrefix || ""
                 }">
                 <button type="button" class="btn-remove-param">✕</button>
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
             <small>Si está marcado, el procesamiento fallará si no encuentra valor. Si no está marcado, usará NULL o valor por defecto.</small>
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
             <strong>Ejemplo:</strong> Si el valor es CN10133 y el prefijo es CN, el resultado será 10133
           </div>
         </div>
       </div>

       <div class="form-check">
         <input type="checkbox" id="isRequired" class="swal2-checkbox" ${
           field.isRequired ? "checked" : ""
         }>
         <label for="isRequired"><strong>¿Campo obligatorio en destino?</strong></label>
       </div>

       <!-- Propiedades de visualización -->
       <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Propiedades de Visualización</h4>

       <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
         <div class="form-group" style="flex: 1 1 200px;">
           <label for="displayName">Nombre a mostrar</label>
           <input id="displayName" class="swal2-input" value="${
             field.displayName || ""
           }" placeholder="Ej: Código de Cliente">
         </div>

         <div class="form-group" style="flex: 1 1 100px;">
           <label for="displayOrder">Orden de visualización</label>
           <input id="displayOrder" type="number" class="swal2-input" value="${
             field.displayOrder || 0
           }" placeholder="0">
         </div>
       </div>

       <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
         <div class="form-check">
           <input type="checkbox" id="isEditable" class="swal2-checkbox" ${
             field.isEditable !== false ? "checked" : ""
           }>
           <label for="isEditable">¿Editable?</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="showInList" class="swal2-checkbox" ${
             field.showInList ? "checked" : ""
           }>
           <label for="showInList">¿Mostrar en listas?</label>
         </div>
       </div>

       <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
         <div class="form-group" style="flex: 1 1 200px;">
           <label for="fieldGroup">Grupo de campos</label>
           <input id="fieldGroup" class="swal2-input" value="${
             field.fieldGroup || ""
           }" placeholder="Ej: Información General">
         </div>

         <div class="form-group" style="flex: 1 1 200px;">
           <label for="fieldType">Tipo de campo</label>
           <select id="fieldType" class="swal2-select">
             <option value="text" ${
               field.fieldType === "text" ? "selected" : ""
             }>Texto</option>
             <option value="number" ${
               field.fieldType === "number" ? "selected" : ""
             }>Número</option>
             <option value="date" ${
               field.fieldType === "date" ? "selected" : ""
             }>Fecha</option>
             <option value="boolean" ${
               field.fieldType === "boolean" ? "selected" : ""
             }>Sí/No</option>
             <option value="select" ${
               field.fieldType === "select" ? "selected" : ""
             }>Lista desplegable</option>
             <option value="textarea" ${
               field.fieldType === "textarea" ? "selected" : ""
             }>Texto largo</option>
             <option value="email" ${
               field.fieldType === "email" ? "selected" : ""
             }>Correo electrónico</option>
             <option value="tel" ${
               field.fieldType === "tel" ? "selected" : ""
             }>Teléfono</option>
             <option value="hidden" ${
               field.fieldType === "hidden" ? "selected" : ""
             }>Oculto</option>
           </select>
         </div>
       </div>
     </div>

     <style>
       .mapping-form { text-align: left; }
       .field-container { margin-bottom: 15px; }
       .field-header { font-weight: 600; margin-bottom: 5px; color: #333; }
       .form-info { font-size: 0.85em; color: #666; margin-top: 5px; }
       .data-source-options { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
       .lookup-section { margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 5px; border-left: 4px solid #2196f3; }
       .lookup-params-container { margin-top: 15px; }
       .lookup-params-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
       .lookup-param-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
       .lookup-param-row input { flex: 1; }
       .btn-add-param, .btn-remove-param { padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; }
       .btn-add-param { background: #28a745; color: white; }
       .btn-remove-param { background: #dc3545; color: white; }
       .validation-options { margin-top: 15px; }
       .validation-options .form-check { margin-bottom: 10px; }
       .validation-options small { display: block; margin-top: 5px; color: #666; font-size: 0.85em; }
     </style>
     `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Referencias a elementos
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );
        const addLookupParamButton = document.getElementById("addLookupParam");
        const lookupParamsContainer = document.getElementById(
          "lookupParamsContainer"
        );

        // Manejar visibilidad de secciones
        lookupFromTargetCheckbox.addEventListener("change", function () {
          const isLookup = this.checked;
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";

          if (isLookup && lookupParamsContainer.children.length === 0) {
            addLookupParamRow();
          }
        });

        // Función para añadir una fila de parámetro
        const addLookupParamRow = (
          paramName = "",
          sourceField = "",
          removePrefix = ""
        ) => {
          const index = document.querySelectorAll(".lookup-param-row").length;
          const row = document.createElement("div");
          row.className = "lookup-param-row";
          row.dataset.index = index;

          row.innerHTML = `
            <input type="text" class="swal2-input param-name" placeholder="Nombre parámetro" value="${paramName}">
            <input type="text" class="swal2-input source-field" placeholder="Campo origen" value="${sourceField}">
            <input type="text" class="swal2-input remove-prefix" placeholder="Prefijo a eliminar" value="${removePrefix}">
            <button type="button" class="btn-remove-param">✕</button>
          `;

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

        // Añadir eventos a los botones de eliminar existentes
        document.querySelectorAll(".btn-remove-param").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest(".lookup-param-row").remove();
          });
        });
      },
      preConfirm: () => {
        // Recopilar todos los valores
        const sourceField = document.getElementById("sourceField").value.trim();
        const targetField = document.getElementById("targetField").value.trim();
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document
          .getElementById("removePrefix")
          .value.trim();
        const isRequired = document.getElementById("isRequired").checked;

        // Valores para lookup
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;

        // Propiedades de visualización
        const isEditable = document.getElementById("isEditable").checked;
        const showInList = document.getElementById("showInList").checked;
        const displayName = document.getElementById("displayName").value.trim();
        const displayOrder =
          parseInt(document.getElementById("displayOrder").value) || 0;
        const fieldGroup = document.getElementById("fieldGroup").value.trim();
        const fieldType = document.getElementById("fieldType").value;

        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        // Recopilar parámetros de lookup
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false; // CAMBIADO: Por defecto false

        if (lookupFromTarget) {
          const lookupQueryElem = document.getElementById("lookupQuery");
          if (lookupQueryElem) {
            lookupQuery = lookupQueryElem.value.trim();
          }

          const validateExistenceElem =
            document.getElementById("validateExistence");
          if (validateExistenceElem) {
            validateExistence = validateExistenceElem.checked;
          }

          const failIfNotFoundElem = document.getElementById("failIfNotFound");
          if (failIfNotFoundElem) {
            failIfNotFound = failIfNotFoundElem.checked;
          }

          // Recopilar parámetros
          document.querySelectorAll(".lookup-param-row").forEach((row) => {
            const paramName = row.querySelector(".param-name").value.trim();
            const paramSourceField = row
              .querySelector(".source-field")
              .value.trim();
            const paramRemovePrefix = row
              .querySelector(".remove-prefix")
              .value.trim();

            if (paramName && paramSourceField) {
              lookupParams.push({
                paramName,
                sourceField: paramSourceField,
                removePrefix: paramRemovePrefix || null, // NUEVO: Soporte para prefijos en parámetros
              });
            }
          });

          if (!lookupQuery && lookupFromTarget) {
            Swal.showValidationMessage(
              "Debe proporcionar una consulta SQL para el lookup"
            );
            return false;
          }

          if (lookupQuery && lookupFromTarget) {
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
                  `Faltan parámetros: ${missingParams.join(", ")}`
                );
                return false;
              }
            }
          }
        }

        const updatedField = {
          sourceField: sourceField || null,
          targetField,
          defaultValue: defaultValue || null,
          removePrefix: removePrefix || null,
          isRequired,
          valueMappings: field.valueMappings || [],

          // Configuración de lookup
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false, // CAMBIADO: Por defecto false

          // Propiedades de visualización
          isEditable,
          showInList,
          displayName: displayName || null,
          displayOrder,
          fieldGroup: fieldGroup || null,
          fieldType,
          options: field.options || null,

          // Configuración adicional
          unitConversion: field.unitConversion || { enabled: false },
        };

        return updatedField;
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        console.log("Campo actualizado:", result.value);

        const newTableConfigs = JSON.parse(
          JSON.stringify(mapping.tableConfigs)
        );
        newTableConfigs[tableIndex].fieldMappings[fieldIndex] = result.value;

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });

        console.log(
          "Campo después de la actualización:",
          newTableConfigs[tableIndex].fieldMappings[fieldIndex]
        );
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

  if (loading) {
    return (
      <LoadingContainer>
        <div>Cargando configuración...</div>
      </LoadingContainer>
    );
  }

  return (
    <Container>
      <Header>
        <h2>{isEditing ? "Editar" : "Nueva"} Configuración de Mapeo</h2>
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
          $active={activeTab === "dependencies"}
          onClick={() => setActiveTab("dependencies")}
        >
          Dependencias FK
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

            <FormGroup>
              <Label>Tipo de Entidad</Label>
              <Select
                name="entityType"
                value={mapping.entityType || "orders"}
                onChange={handleChange}
              >
                <option value="orders">Pedidos</option>
                <option value="invoices">Facturas</option>
                <option value="customers">Clientes</option>
                <option value="products">Productos</option>
                <option value="inventory">Inventario</option>
                <option value="payments">Pagos</option>
                <option value="other">Otro</option>
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
                  <option value="down">Descendente (Server2 → Server1)</option>
                  <option value="up">Ascendente (Server1 → Server2)</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <CheckboxGroup>
                  <Checkbox
                    type="checkbox"
                    name="active"
                    checked={mapping.active}
                    onChange={handleChange}
                  />
                  <CheckboxLabel>Configuración activa</CheckboxLabel>
                </CheckboxGroup>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Servidor Origen</Label>
                <Select
                  name="sourceServer"
                  value={mapping.sourceServer}
                  onChange={handleChange}
                >
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Servidor Destino</Label>
                <Select
                  name="targetServer"
                  value={mapping.targetServer}
                  onChange={handleChange}
                >
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </Select>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label>Campo para marcar procesado</Label>
                <Input
                  type="text"
                  name="markProcessedField"
                  value={mapping.markProcessedField}
                  onChange={handleChange}
                  placeholder="Ej: IS_PROCESSED"
                />
              </FormGroup>

              <FormGroup>
                <Label>Valor para marcar procesado</Label>
                <Input
                  type="text"
                  name="markProcessedValue"
                  value={mapping.markProcessedValue}
                  onChange={handleChange}
                  placeholder="Ej: 1"
                />
              </FormGroup>
            </FormRow>

            {/* Sección de Consecutivos */}
            <FormGroup>
              <ConsecutiveConfigSection
                mapping={mapping}
                handleChange={handleChange}
              />
            </FormGroup>
            <PromotionConfigSection
              mapping={mapping}
              handleChange={handleChange}
            />
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

        {/* Pestaña dependencias de Foreign Key */}
        {activeTab === "dependencies" && (
          <Section>
            <SectionHeader>
              <h3>Dependencias de Foreign Key</h3>
              <SmallButton onClick={addForeignKeyDependency}>
                <FaPlus /> Añadir Dependencia
              </SmallButton>
            </SectionHeader>

            {mapping.foreignKeyDependencies.length === 0 ? (
              <EmptyMessage>
                <p>No hay dependencias configuradas</p>
                <small>
                  Las dependencias de Foreign Key permiten insertar registros en
                  tablas relacionadas antes de procesar el documento principal,
                  evitando errores de integridad referencial.
                </small>
              </EmptyMessage>
            ) : (
              mapping.foreignKeyDependencies.map((dependency, index) => (
                <Card key={index}>
                  <CardHeader>
                    <h4>
                      {dependency.fieldName} → {dependency.dependentTable}
                    </h4>
                    <div className="button_container">
                      <SmallButton
                        onClick={() => editForeignKeyDependency(index)}
                        title="Editar dependencia"
                      >
                        <FaEdit />
                      </SmallButton>
                      <SmallButton
                        $danger
                        onClick={() => removeForeignKeyDependency(index)}
                      >
                        <FaTrash />
                      </SmallButton>
                    </div>
                  </CardHeader>

                  <CardBody>
                    <PropertyList>
                      <PropertyItem>
                        <PropertyLabel>Campo origen:</PropertyLabel>
                        <PropertyValue>{dependency.fieldName}</PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Tabla dependiente:</PropertyLabel>
                        <PropertyValue>
                          {dependency.dependentTable}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Acción:</PropertyLabel>
                        <PropertyValue>
                          {dependency.validateOnly
                            ? "Solo validar"
                            : dependency.insertIfNotExists
                            ? "Insertar si no existe"
                            : "Solo validar existencia"}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Orden de ejecución:</PropertyLabel>
                        <PropertyValue>
                          {dependency.executionOrder || 0}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Campos a insertar:</PropertyLabel>
                        <PropertyValue>
                          {dependency.dependentFields
                            .map(
                              (f) =>
                                `${f.targetField}${f.isKey ? " (clave)" : ""}`
                            )
                            .join(", ")}
                        </PropertyValue>
                      </PropertyItem>
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
                    <h4>
                      {tableConfig.name}
                      {tableConfig.isDetailTable && " (Detalle)"}
                    </h4>
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
                        <PropertyValue>
                          {tableConfig.sourceTable || "N/A"}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Tabla destino:</PropertyLabel>
                        <PropertyValue>{tableConfig.targetTable}</PropertyValue>
                      </PropertyItem>

                      {tableConfig.primaryKey && (
                        <PropertyItem>
                          <PropertyLabel>Clave primaria origen:</PropertyLabel>
                          <PropertyValue>
                            {tableConfig.primaryKey}
                          </PropertyValue>
                        </PropertyItem>
                      )}

                      {tableConfig.targetPrimaryKey && (
                        <PropertyItem>
                          <PropertyLabel>Clave primaria destino:</PropertyLabel>
                          <PropertyValue>
                            {tableConfig.targetPrimaryKey}
                          </PropertyValue>
                        </PropertyItem>
                      )}

                      {tableConfig.filterCondition && (
                        <PropertyItem>
                          <PropertyLabel>Filtro:</PropertyLabel>
                          <PropertyValue>
                            {tableConfig.filterCondition}
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

                      {!tableConfig.fieldMappings ||
                      tableConfig.fieldMappings.length === 0 ? (
                        <EmptyMessage>
                          No hay campos mapeados en esta tabla
                        </EmptyMessage>
                      ) : (
                        <Table>
                          <thead>
                            <tr>
                              <th>Campo Origen</th>
                              <th>Campo Destino</th>
                              <th>Obligatorio</th>
                              <th>Lookup BD</th>
                              <th>Prefijo</th>
                              <th>Val. por Defecto</th>
                              <th>Mapeos</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableConfig.fieldMappings.map(
                              (field, fieldIndex) => (
                                <tr key={fieldIndex}>
                                  <td>{field.sourceField || "N/A"}</td>
                                  <td>
                                    <strong>{field.targetField}</strong>
                                  </td>
                                  <td>{field.isRequired ? "Sí" : "No"}</td>
                                  <td>
                                    {field.lookupFromTarget ? (
                                      <span style={{ color: "#2196f3" }}>
                                        ✓ Sí
                                        {field.failIfNotFound && (
                                          <small
                                            style={{
                                              display: "block",
                                              color: "#f44336",
                                            }}
                                          >
                                            (Fallar si no existe)
                                          </small>
                                        )}
                                      </span>
                                    ) : (
                                      "No"
                                    )}
                                  </td>
                                  <td>{field.removePrefix || "N/A"}</td>
                                  <td>
                                    {field.defaultValue !== null &&
                                    field.defaultValue !== undefined
                                      ? String(field.defaultValue).substring(
                                          0,
                                          20
                                        ) +
                                        (String(field.defaultValue).length > 20
                                          ? "..."
                                          : "")
                                      : "N/A"}
                                  </td>
                                  <td>
                                    <ValueMappingsCell>
                                      <span>
                                        {field.valueMappings?.length || 0}
                                      </span>
                                      {field.valueMappings?.length > 0 && (
                                        <SmallButton
                                          onClick={() =>
                                            addValueMapping(
                                              tableIndex,
                                              fieldIndex
                                            )
                                          }
                                        >
                                          <FaPlus />
                                        </SmallButton>
                                      )}
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
                                        onClick={() =>
                                          addValueMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                        title="Añadir mapeo de valor"
                                      >
                                        <FaPlus />
                                      </MiniButton>
                                      <MiniButton
                                        $danger
                                        onClick={() =>
                                          removeFieldMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                        title="Eliminar campo"
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

// Estilos (mantener todos los estilos existentes)
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
