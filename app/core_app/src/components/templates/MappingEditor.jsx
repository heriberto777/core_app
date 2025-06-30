import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ConsecutiveConfigSection, TransferApi, useAuth } from "../../index";
import {
  FaSave,
  FaPlus,
  FaTrash,
  FaTimes,
  FaEdit,
  FaGift,
} from "react-icons/fa";
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
    // 🟢 CAMPOS PARA BONIFICACIONES COMPLETOS
    hasBonificationProcessing: false,
    bonificationConfig: {
      sourceTable: "FAC_DET_PED",
      bonificationIndicatorField: "ART_BON",
      bonificationIndicatorValue: "B",
      regularArticleField: "COD_ART",
      bonificationReferenceField: "COD_ART_RFR",
      orderField: "NUM_PED",
      lineOrderField: "NUM_LN", // 🔥 CAMPO CRÍTICO AGREGADO
      lineNumberField: "PEDIDO_LINEA",
      bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
      quantityField: "CNT_MAX",
    },
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
        // 🟢 ASEGURAR CONFIGURACIÓN DE BONIFICACIONES CON VALORES POR DEFECTO
        const mappingWithDefaults = {
          ...data,
          bonificationConfig: {
            sourceTable: "FAC_DET_PED",
            bonificationIndicatorField: "ART_BON",
            bonificationIndicatorValue: "B",
            regularArticleField: "COD_ART",
            bonificationReferenceField: "COD_ART_RFR",
            orderField: "NUM_PED",
            lineOrderField: "NUM_LN", // 🔥 CAMPO CRÍTICO AGREGADO
            lineNumberField: "PEDIDO_LINEA",
            bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
            quantityField: "CNT_MAX",
            ...data.bonificationConfig,
          },
        };
        setMapping(mappingWithDefaults);
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

    // 🟢 MANEJO DE BONIFICACIONES
    if (name.startsWith("bonificationConfig.")) {
      const field = name.replace("bonificationConfig.", "");
      setMapping((prevState) => ({
        ...prevState,
        bonificationConfig: {
          ...prevState.bonificationConfig,
          [field]: type === "checkbox" ? checked : value,
        },
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

    console.log(mapping);

    // 🟢 VALIDACIÓN DE BONIFICACIONES
    if (mapping.hasBonificationProcessing) {
      const config = mapping.bonificationConfig;
      if (
        !config.sourceTable ||
        !config.bonificationIndicatorField ||
        !config.orderField
      ) {
        Swal.fire({
          icon: "warning",
          title: "Configuración de bonificaciones incompleta",
          text: "Complete todos los campos requeridos para el procesamiento de bonificaciones",
        });
        return;
      }
    }

    const mappingCopy = JSON.parse(JSON.stringify(mapping));

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
          text: "Los cambios se han guardado correctamente",
        });
        onSave && onSave(result.data);
      } else {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: result.message || "Error al guardar la configuración",
        });
      }
    } catch (error) {
      console.error("Error guardando mapping:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "Error al guardar la configuración",
      });
    } finally {
      setLoading(false);
    }
  };

  // 🟢 FUNCIONES PARA BONIFICACIONES
  const addBonificationConfig = () => {
    setMapping({
      ...mapping,
      hasBonificationProcessing: true,
    });
  };

  const removeBonificationConfig = () => {
    setMapping({
      ...mapping,
      hasBonificationProcessing: false,
    });
  };

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
      confirmButtonText: "Agregar",
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

  // 🔧 FUNCIÓN CORREGIDA
  const removeDocumentTypeRule = (index) => {
    const newRules = [...mapping.documentTypeRules];
    newRules.splice(index, 1);

    setMapping({
      ...mapping,
      documentTypeRules: newRules,
    });
  };

  const addForeignKeyDependency = () => {
    Swal.fire({
      title: "Nueva Dependencia de Foreign Key",
      html: `
      <div class="fk-dependency-form">
        <div class="form-group">
          <label for="fieldName">Campo que causa dependencia</label>
          <input id="fieldName" class="swal2-input" placeholder="Ej: COD_CLT">
          <small>Campo en la tabla origen que referencia otra tabla</small>
        </div>

        <div class="form-group">
          <label for="dependentTable">Tabla dependiente</label>
          <input id="dependentTable" class="swal2-input" placeholder="Ej: CLIENTES">
          <small>Tabla donde debe existir/insertarse el registro referenciado</small>
        </div>

        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="0" placeholder="0">
          <small>Orden de procesamiento (0 = primero)</small>
        </div>

        <div class="form-check-group">
          <div class="form-check">
            <input type="checkbox" id="insertIfNotExists" class="swal2-checkbox">
            <label for="insertIfNotExists">Insertar si no existe</label>
          </div>

          <div class="form-check">
            <input type="checkbox" id="validateOnly" class="swal2-checkbox">
            <label for="validateOnly">Solo validar (no insertar)</label>
          </div>
        </div>

        <div class="form-group">
          <label for="dependentFields">Campos dependientes (JSON)</label>
          <textarea id="dependentFields" class="swal2-textarea" placeholder='[{"sourceField": "COD_CLT", "targetField": "CODIGO", "isKey": true}]'></textarea>
          <small>Mapeo de campos entre tabla origen y dependiente</small>
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value;
        const dependentTable = document.getElementById("dependentTable").value;
        const executionOrder = parseInt(
          document.getElementById("executionOrder").value
        );
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").checked;
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsStr =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Los campos nombre del campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        let dependentFields = [];
        if (dependentFieldsStr) {
          try {
            dependentFields = JSON.parse(dependentFieldsStr);
          } catch (e) {
            Swal.showValidationMessage(
              "El formato de campos dependientes debe ser JSON válido"
            );
            return false;
          }
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

  const editForeignKeyDependency = (index) => {
    const dependency = mapping.foreignKeyDependencies[index];

    Swal.fire({
      title: "Editar Dependencia de Foreign Key",
      html: `
      <div class="fk-dependency-form">
        <div class="form-group">
          <label for="fieldName">Campo que causa dependencia</label>
          <input id="fieldName" class="swal2-input" value="${
            dependency.fieldName
          }" placeholder="Ej: COD_CLT">
          <small>Campo en la tabla origen que referencia otra tabla</small>
        </div>

        <div class="form-group">
          <label for="dependentTable">Tabla dependiente</label>
          <input id="dependentTable" class="swal2-input" value="${
            dependency.dependentTable
          }" placeholder="Ej: CLIENTES">
          <small>Tabla donde debe existir/insertarse el registro referenciado</small>
        </div>

        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="${
            dependency.executionOrder || 0
          }" placeholder="0">
          <small>Orden de procesamiento (0 = primero)</small>
        </div>

        <div class="form-check-group">
          <div class="form-check">
            <input type="checkbox" id="insertIfNotExists" class="swal2-checkbox" ${
              dependency.insertIfNotExists ? "checked" : ""
            }>
            <label for="insertIfNotExists">Insertar si no existe</label>
          </div>

          <div class="form-check">
            <input type="checkbox" id="validateOnly" class="swal2-checkbox" ${
              dependency.validateOnly ? "checked" : ""
            }>
            <label for="validateOnly">Solo validar (no insertar)</label>
          </div>
        </div>

        <div class="form-group">
          <label for="dependentFields">Campos dependientes (JSON)</label>
          <textarea id="dependentFields" class="swal2-textarea" placeholder='[{"sourceField": "COD_CLT", "targetField": "CODIGO", "isKey": true}]'>${JSON.stringify(
            dependency.dependentFields || [],
            null,
            2
          )}</textarea>
          <small>Mapeo de campos entre tabla origen y dependiente</small>
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value;
        const dependentTable = document.getElementById("dependentTable").value;
        const executionOrder = parseInt(
          document.getElementById("executionOrder").value
        );
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").checked;
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsStr =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Los campos nombre del campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        let dependentFields = [];
        if (dependentFieldsStr) {
          try {
            dependentFields = JSON.parse(dependentFieldsStr);
          } catch (e) {
            Swal.showValidationMessage(
              "El formato de campos dependientes debe ser JSON válido"
            );
            return false;
          }
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
        const newDependencies = [...mapping.foreignKeyDependencies];
        newDependencies[index] = result.value;

        setMapping({
          ...mapping,
          foreignKeyDependencies: newDependencies,
        });
      }
    });
  };

  // 🔧 FUNCIÓN CORREGIDA
  const removeForeignKeyDependency = (index) => {
    const newDependencies = [...mapping.foreignKeyDependencies];
    newDependencies.splice(index, 1);

    setMapping({
      ...mapping,
      foreignKeyDependencies: newDependencies,
    });
  };

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
        <label for="useSameSourceTable">Usar misma tabla origen que tabla padre</label>
      </div>
    </div>
    <div class="form-group">
      <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
      <input id="orderByColumn" class="swal2-input" placeholder="Ej: LIN_PED">
    </div>
    <div class="form-group">
      <label for="filterCondition">Condición de filtro (opcional)</label>
      <input id="filterCondition" class="swal2-input" placeholder="Ej: EST_LIN = 'A'">
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptions = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", () => {
          detailOptions.style.display = isDetailCheckbox.checked
            ? "block"
            : "none";
        });
      },
      preConfirm: () => {
        const name = document.getElementById("tableName").value;
        const sourceTable = document.getElementById("sourceTable").value;
        const targetTable = document.getElementById("targetTable").value;
        const primaryKey = document.getElementById("primaryKey").value || "ID";
        const targetPrimaryKey =
          document.getElementById("targetPrimaryKey").value;
        const isDetailTable = document.getElementById("isDetailTable").checked;
        const parentTableRef = document.getElementById("parentTableRef").value;
        const useSameSourceTable =
          document.getElementById("useSameSourceTable").checked;
        const orderByColumn = document.getElementById("orderByColumn").value;
        const filterCondition =
          document.getElementById("filterCondition").value;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre, tabla origen y tabla destino son obligatorios"
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

  const removeTableConfig = (index) => {
    const newConfigs = [...mapping.tableConfigs];
    newConfigs.splice(index, 1);
    setMapping({
      ...mapping,
      tableConfigs: newConfigs,
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
        <label for="useSameSourceTable">Usar misma tabla origen que tabla padre</label>
      </div>
    </div>
    <div class="form-group">
      <label for="orderByColumn">Columna de ordenamiento (opcional)</label>
      <input id="orderByColumn" class="swal2-input" value="${
        tableConfig.orderByColumn || ""
      }" placeholder="Ej: LIN_PED">
    </div>
    <div class="form-group">
      <label for="filterCondition">Condición de filtro (opcional)</label>
      <input id="filterCondition" class="swal2-input" value="${
        tableConfig.filterCondition || ""
      }" placeholder="Ej: EST_LIN = 'A'">
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        const isDetailCheckbox = document.getElementById("isDetailTable");
        const detailOptions = document.getElementById("detailOptions");

        isDetailCheckbox.addEventListener("change", () => {
          detailOptions.style.display = isDetailCheckbox.checked
            ? "block"
            : "none";
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
        const parentTableRef = document.getElementById("parentTableRef").value;
        const useSameSourceTable =
          document.getElementById("useSameSourceTable").checked;
        const orderByColumn = document.getElementById("orderByColumn").value;
        const filterCondition =
          document.getElementById("filterCondition").value;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Los campos nombre, tabla origen y tabla destino son obligatorios"
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
          useSameSourceTable,
          orderByColumn: orderByColumn || null,
          filterCondition: filterCondition || null,
          fieldMappings: tableConfig.fieldMappings || [],
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newConfigs = [...mapping.tableConfigs];
        newConfigs[index] = result.value;
        setMapping({
          ...mapping,
          tableConfigs: newConfigs,
        });
      }
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

       <!-- Opciones de lookup -->
       <div id="lookupSection" class="form-group" style="display: none;">
         <div class="field-container">
           <div class="field-header">Consulta SQL (obligatorio si lookup está habilitado)</div>
           <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="SELECT campo FROM tabla WHERE condicion = @param"></textarea>
           <div class="form-info">
             Use parámetros como @nombreParametro en la consulta
           </div>
         </div>

         <div class="form-check">
           <input type="checkbox" id="validateExistence" class="swal2-checkbox">
           <label for="validateExistence">Validar que existe en BD destino</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="failIfNotFound" class="swal2-checkbox">
           <label for="failIfNotFound">Fallar si no se encuentra</label>
         </div>
       </div>

       <!-- Configuración adicional -->
       <div class="additional-config">
         <div class="form-check">
           <input type="checkbox" id="removePrefix" class="swal2-checkbox">
           <label for="removePrefix">Remover prefijo del valor</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="isRequired" class="swal2-checkbox">
           <label for="isRequired">Campo obligatorio</label>
         </div>

         <!-- NUEVA CONFIGURACIÓN: Conversión de unidades -->
         <div class="form-check">
           <input type="checkbox" id="enableConversion" class="swal2-checkbox">
           <label for="enableConversion">Habilitar conversión de unidades</label>
         </div>
       </div>

       <!-- NUEVA SECCIÓN: Configuración de conversión -->
       <div id="conversionConfig" class="form-group" style="display: none;">
         <div class="field-container">
           <div class="field-header">Factor de conversión</div>
           <input id="conversionFactor" type="number" step="any" class="swal2-input" placeholder="1.0">
           <div class="form-info">
             Factor numérico para multiplicar el valor original (ej: 1000 para convertir kg a g)
           </div>
         </div>

         <div class="field-container">
           <div class="field-header">Decimales</div>
           <input id="conversionDecimals" type="number" min="0" max="10" class="swal2-input" placeholder="2">
         </div>
       </div>

       <!-- Propiedades de visualización -->
       <div class="display-properties">
         <h4>Propiedades de Visualización</h4>

         <div class="form-check">
           <input type="checkbox" id="isEditable" class="swal2-checkbox" checked>
           <label for="isEditable">Campo editable</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="showInList" class="swal2-checkbox">
           <label for="showInList">Mostrar en listado</label>
         </div>

         <div class="form-group">
           <label for="displayName">Nombre a mostrar</label>
           <input id="displayName" class="swal2-input" placeholder="Nombre legible para el usuario">
         </div>

         <div class="form-group">
           <label for="displayOrder">Orden de visualización</label>
           <input id="displayOrder" type="number" class="swal2-input" value="0" placeholder="0">
         </div>

         <div class="form-group">
           <label for="fieldGroup">Grupo de campos</label>
           <input id="fieldGroup" class="swal2-input" placeholder="Ej: Información General">
         </div>

         <div class="form-group">
           <label for="fieldType">Tipo de campo</label>
           <select id="fieldType" class="swal2-select">
             <option value="text">Texto</option>
             <option value="number">Número</option>
             <option value="date">Fecha</option>
             <option value="select">Lista desplegable</option>
             <option value="textarea">Área de texto</option>
             <option value="checkbox">Casilla de verificación</option>
           </select>
         </div>

         <!-- Opciones para select -->
         <div id="selectOptions" class="form-group" style="display: none;">
           <label>Opciones de la lista</label>
           <div id="optionsContainer"></div>
           <button type="button" id="addOption" class="swal2-confirm swal2-styled" style="margin-top: 10px;">Añadir Opción</button>
         </div>
       </div>
     </div>
   `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      width: 800,
      didOpen: () => {
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );
        const fieldTypeSelect = document.getElementById("fieldType");
        const selectOptionsContainer = document.getElementById("selectOptions");
        const enableConversionCheckbox =
          document.getElementById("enableConversion");
        const conversionConfigDiv = document.getElementById("conversionConfig");

        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";

          selectOptionsContainer.style.display =
            fieldTypeSelect.value === "select" ? "block" : "none";
          conversionConfigDiv.style.display = enableConversionCheckbox.checked
            ? "block"
            : "none";
        };

        lookupFromTargetCheckbox.addEventListener("change", updateUI);
        fieldTypeSelect.addEventListener("change", updateUI);
        enableConversionCheckbox.addEventListener("change", updateUI);

        updateUI();

        const addOptionBtn = document.getElementById("addOption");
        const optionsContainer = document.getElementById("optionsContainer");

        addOptionBtn.addEventListener("click", () => {
          const optionRow = document.createElement("div");
          optionRow.className = "option-row";
          optionRow.style = "display: flex; gap: 10px; margin-bottom: 10px;";

          optionRow.innerHTML = `
        <input type="text" class="swal2-input option-label" placeholder="Etiqueta" style="flex: 1;">
        <input type="text" class="swal2-input option-value" placeholder="Valor" style="flex: 1;">
        <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
      `;

          optionsContainer.appendChild(optionRow);

          optionRow
            .querySelector(".btn-remove-option")
            .addEventListener("click", () => {
              optionRow.remove();
            });
        });
      },
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document.getElementById("removePrefix").checked;
        const isRequired = document.getElementById("isRequired").checked;
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;
        const lookupQuery = document.getElementById("lookupQuery").value;
        const validateExistence =
          document.getElementById("validateExistence").checked;
        const failIfNotFound =
          document.getElementById("failIfNotFound").checked;

        const enableConversion =
          document.getElementById("enableConversion").checked;
        const conversionFactor =
          parseFloat(document.getElementById("conversionFactor").value) || 1;
        const conversionDecimals =
          parseInt(document.getElementById("conversionDecimals").value) || 2;

        const unitConversion = enableConversion
          ? {
              enabled: true,
              factor: conversionFactor,
              decimals: conversionDecimals,
            }
          : false;

        const isEditable = document.getElementById("isEditable").checked;
        const showInList = document.getElementById("showInList").checked;
        const displayName = document.getElementById("displayName").value;
        const displayOrder =
          parseInt(document.getElementById("displayOrder").value) || 0;
        const fieldGroup = document.getElementById("fieldGroup").value;
        const fieldType = document.getElementById("fieldType").value;

        let options = [];
        if (fieldType === "select") {
          const optionRows = document.querySelectorAll(".option-row");
          optionRows.forEach((row) => {
            const label = row.querySelector(".option-label").value;
            const value = row.querySelector(".option-value").value;
            if (label && value) {
              options.push({ label, value });
            }
          });
        }

        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        if (lookupFromTarget && !lookupQuery) {
          Swal.showValidationMessage(
            "La consulta SQL es obligatoria cuando lookup está habilitado"
          );
          return false;
        }

        let lookupParams = [];
        if (lookupFromTarget && lookupQuery) {
          const paramMatches = lookupQuery.match(/@(\w+)/g);
          if (paramMatches) {
            lookupParams = paramMatches.map((param) => param.substring(1));
          }
        }

        return {
          sourceField: sourceField || null,
          targetField,
          defaultValue: defaultValue || null,
          removePrefix,
          isRequired,
          valueMappings: [],
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false,
          unitConversion,
          isEditable,
          showInList,
          displayName: displayName || null,
          displayOrder,
          fieldGroup: fieldGroup || null,
          fieldType,
          options: options.length > 0 ? options : null,
        };
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
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

    const existingOptionsHtml = (field.options || [])
      .map(
        (option, index) => `
     <div class="option-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
       <input type="text" class="swal2-input option-label" placeholder="Etiqueta" value="${option.label}" style="flex: 1;">
       <input type="text" class="swal2-input option-value" placeholder="Valor" value="${option.value}" style="flex: 1;">
       <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
     </div>
   `
      )
      .join("");

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
       <div id="defaultValueSection" class="form-group">
         <div class="field-container">
           <div class="field-header">Valor por defecto</div>
           <textarea id="defaultValue" class="swal2-textarea" rows="3" placeholder="Ingrese valor por defecto">${
             field.defaultValue || ""
           }</textarea>
         </div>
       </div>

       <!-- Opciones de lookup -->
       <div id="lookupSection" class="form-group" style="display: ${
         field.lookupFromTarget ? "block" : "none"
       };">
         <div class="field-container">
           <div class="field-header">Consulta SQL</div>
           <textarea id="lookupQuery" class="swal2-textarea" rows="3" placeholder="SELECT campo FROM tabla WHERE condicion = @param">${
             field.lookupQuery || ""
           }</textarea>
         </div>

         <div class="form-check">
           <input type="checkbox" id="validateExistence" class="swal2-checkbox" ${
             field.validateExistence ? "checked" : ""
           }>
           <label for="validateExistence">Validar que existe en BD destino</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="failIfNotFound" class="swal2-checkbox" ${
             field.failIfNotFound ? "checked" : ""
           }>
           <label for="failIfNotFound">Fallar si no se encuentra</label>
         </div>
       </div>

       <!-- Configuración adicional -->
       <div class="additional-config">
         <div class="form-check">
           <input type="checkbox" id="removePrefix" class="swal2-checkbox" ${
             field.removePrefix ? "checked" : ""
           }>
           <label for="removePrefix">Remover prefijo del valor</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="isRequired" class="swal2-checkbox" ${
             field.isRequired ? "checked" : ""
           }>
           <label for="isRequired">Campo obligatorio</label>
         </div>

         <!-- CONFIGURACIÓN: Conversión de unidades -->
         <div class="form-check">
           <input type="checkbox" id="enableConversion" class="swal2-checkbox" ${
             field.unitConversion && field.unitConversion.enabled
               ? "checked"
               : ""
           }>
           <label for="enableConversion">Habilitar conversión de unidades</label>
         </div>
       </div>

       <!-- SECCIÓN: Configuración de conversión -->
       <div id="conversionConfig" class="form-group" style="display: ${
         field.unitConversion && field.unitConversion.enabled ? "block" : "none"
       };">
         <div class="field-container">
           <div class="field-header">Factor de conversión</div>
           <input id="conversionFactor" type="number" step="any" class="swal2-input" value="${
             field.unitConversion ? field.unitConversion.factor || 1 : 1
           }" placeholder="1.0">
         </div>

         <div class="field-container">
           <div class="field-header">Decimales</div>
           <input id="conversionDecimals" type="number" min="0" max="10" class="swal2-input" value="${
             field.unitConversion ? field.unitConversion.decimals || 2 : 2
           }" placeholder="2">
         </div>
       </div>

       <!-- Propiedades de visualización -->
       <div class="display-properties">
         <h4>Propiedades de Visualización</h4>

         <div class="form-check">
           <input type="checkbox" id="isEditable" class="swal2-checkbox" ${
             field.isEditable !== false ? "checked" : ""
           }>
           <label for="isEditable">Campo editable</label>
         </div>

         <div class="form-check">
           <input type="checkbox" id="showInList" class="swal2-checkbox" ${
             field.showInList ? "checked" : ""
           }>
           <label for="showInList">Mostrar en listado</label>
         </div>

         <div class="form-group">
           <label for="displayName">Nombre a mostrar</label>
           <input id="displayName" class="swal2-input" value="${
             field.displayName || ""
           }" placeholder="Nombre legible para el usuario">
         </div>

         <div class="form-group">
           <label for="displayOrder">Orden de visualización</label>
           <input id="displayOrder" type="number" class="swal2-input" value="${
             field.displayOrder || 0
           }" placeholder="0">
         </div>

         <div class="form-group">
           <label for="fieldGroup">Grupo de campos</label>
           <input id="fieldGroup" class="swal2-input" value="${
             field.fieldGroup || ""
           }" placeholder="Ej: Información General">
         </div>

         <div class="form-group">
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
             <option value="select" ${
               field.fieldType === "select" ? "selected" : ""
             }>Lista desplegable</option>
             <option value="textarea" ${
               field.fieldType === "textarea" ? "selected" : ""
             }>Área de texto</option>
             <option value="checkbox" ${
               field.fieldType === "checkbox" ? "selected" : ""
             }>Casilla de verificación</option>
           </select>
         </div>

         <!-- Opciones para select -->
         <div id="selectOptions" class="form-group" style="display: ${
           field.fieldType === "select" ? "block" : "none"
         };">
           <label>Opciones de la lista</label>
           <div id="optionsContainer">${existingOptionsHtml}</div>
           <button type="button" id="addOption" class="swal2-confirm swal2-styled" style="margin-top: 10px;">Añadir Opción</button>
         </div>
       </div>
     </div>
   `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      width: 800,
      didOpen: () => {
        const lookupFromTargetCheckbox =
          document.getElementById("lookupFromTarget");
        const lookupSection = document.getElementById("lookupSection");
        const defaultValueSection = document.getElementById(
          "defaultValueSection"
        );
        const fieldTypeSelect = document.getElementById("fieldType");
        const selectOptionsContainer = document.getElementById("selectOptions");
        const enableConversionCheckbox =
          document.getElementById("enableConversion");
        const conversionConfigDiv = document.getElementById("conversionConfig");

        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";

          selectOptionsContainer.style.display =
            fieldTypeSelect.value === "select" ? "block" : "none";
          conversionConfigDiv.style.display = enableConversionCheckbox.checked
            ? "block"
            : "none";
        };

        lookupFromTargetCheckbox.addEventListener("change", updateUI);
        fieldTypeSelect.addEventListener("change", updateUI);
        enableConversionCheckbox.addEventListener("change", updateUI);

        updateUI();

        const addOptionBtn = document.getElementById("addOption");
        const optionsContainer = document.getElementById("optionsContainer");

        addOptionBtn.addEventListener("click", () => {
          const optionRow = document.createElement("div");
          optionRow.className = "option-row";
          optionRow.style = "display: flex; gap: 10px; margin-bottom: 10px;";

          optionRow.innerHTML = `
        <input type="text" class="swal2-input option-label" placeholder="Etiqueta" style="flex: 1;">
        <input type="text" class="swal2-input option-value" placeholder="Valor" style="flex: 1;">
        <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
      `;

          optionsContainer.appendChild(optionRow);

          optionRow
            .querySelector(".btn-remove-option")
            .addEventListener("click", () => {
              optionRow.remove();
            });
        });

        document.querySelectorAll(".btn-remove-option").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest(".option-row").remove();
          });
        });
      },
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const removePrefix = document.getElementById("removePrefix").checked;
        const isRequired = document.getElementById("isRequired").checked;
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;
        const lookupQuery = document.getElementById("lookupQuery").value;
        const validateExistence =
          document.getElementById("validateExistence").checked;
        const failIfNotFound =
          document.getElementById("failIfNotFound").checked;

        const enableConversion =
          document.getElementById("enableConversion").checked;
        const conversionFactor =
          parseFloat(document.getElementById("conversionFactor").value) || 1;
        const conversionDecimals =
          parseInt(document.getElementById("conversionDecimals").value) || 2;

        const unitConversion = enableConversion
          ? {
              enabled: true,
              factor: conversionFactor,
              decimals: conversionDecimals,
            }
          : false;

        const isEditable = document.getElementById("isEditable").checked;
        const showInList = document.getElementById("showInList").checked;
        const displayName = document.getElementById("displayName").value;
        const displayOrder =
          parseInt(document.getElementById("displayOrder").value) || 0;
        const fieldGroup = document.getElementById("fieldGroup").value;
        const fieldType = document.getElementById("fieldType").value;

        let options = [];
        if (fieldType === "select") {
          const optionRows = document.querySelectorAll(".option-row");
          optionRows.forEach((row) => {
            const label = row.querySelector(".option-label").value;
            const value = row.querySelector(".option-value").value;
            if (label && value) {
              options.push({ label, value });
            }
          });
        }

        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        if (lookupFromTarget && !lookupQuery) {
          Swal.showValidationMessage(
            "La consulta SQL es obligatoria cuando lookup está habilitado"
          );
          return false;
        }

        let lookupParams = [];
        if (lookupFromTarget && lookupQuery) {
          const paramMatches = lookupQuery.match(/@(\w+)/g);
          if (paramMatches) {
            lookupParams = paramMatches.map((param) => param.substring(1));
          }
        }

        const updatedField = {
          sourceField: sourceField || null,
          targetField,
          defaultValue: defaultValue || null,
          removePrefix,
          isRequired,
          valueMappings: field.valueMappings || [],
          lookupFromTarget,
          lookupQuery: lookupFromTarget ? lookupQuery : null,
          lookupParams: lookupFromTarget ? lookupParams : [],
          validateExistence: lookupFromTarget ? validateExistence : false,
          failIfNotFound: lookupFromTarget ? failIfNotFound : false,
          unitConversion,
          isEditable,
          showInList,
          displayName: displayName || null,
          displayOrder,
          fieldGroup: fieldGroup || null,
          fieldType,
          options: options.length > 0 ? options : null,
        };

        return updatedField;
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const newTableConfigs = JSON.parse(
          JSON.stringify(mapping.tableConfigs)
        );
        newTableConfigs[tableIndex].fieldMappings[fieldIndex] = result.value;

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

  const addValueMapping = (tableIndex, fieldIndex) => {
    Swal.fire({
      title: "Nuevo Mapeo de Valor",
      html: `
     <div class="form-group">
       <label for="sourceValue">Valor origen</label>
       <input id="sourceValue" class="swal2-input" placeholder="Valor en la tabla origen">
     </div>
     <div class="form-group">
       <label for="targetValue">Valor destino</label>
       <input id="targetValue" class="swal2-input" placeholder="Valor en la tabla destino">
     </div>
     <div class="form-group">
       <label for="description">Descripción (opcional)</label>
       <input id="description" class="swal2-input" placeholder="Descripción del mapeo">
     </div>
   `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const sourceValue = document.getElementById("sourceValue").value;
        const targetValue = document.getElementById("targetValue").value;
        const description = document.getElementById("description").value;

        if (!sourceValue || !targetValue) {
          Swal.showValidationMessage(
            "Los valores origen y destino son obligatorios"
          );
          return false;
        }

        return { sourceValue, targetValue, description };
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
        {/* 🟢 TAB DE BONIFICACIONES */}
        <Tab
          $active={activeTab === "bonifications"}
          onClick={() => setActiveTab("bonifications")}
        >
          <FaGift /> Bonificaciones
        </Tab>
      </Tabs>

      <Content>
        {/* 🔧 PESTAÑA GENERAL CORREGIDA */}
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
                <option value="customers">Clientes</option>
                <option value="invoices">Facturas</option>
                <option value="other">Otros</option>
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
              />
              <CheckboxLabel>Configuración activa</CheckboxLabel>
            </CheckboxGroup>

            {/* 🔧 SECCIÓN DE MARCADO CORREGIDA */}
            <FormGroup>
              <Label>Estrategia de marcado de procesados</Label>
              <Select
                name="markProcessedStrategy"
                value={mapping.markProcessedStrategy || "individual"}
                onChange={handleChange}
              >
                <option value="individual">Individual</option>
                <option value="batch">Por lotes</option>
                <option value="none">Ninguno</option>
              </Select>

              {mapping.markProcessedStrategy !== "none" && (
                <div style={{ marginTop: "10px" }}>
                  <Label>Campo para marcar procesados</Label>
                  <Input
                    type="text"
                    name="markProcessedField"
                    value={mapping.markProcessedField}
                    onChange={handleChange}
                    placeholder="Campo para marcar documentos procesados"
                  />

                  <div style={{ marginTop: "10px" }}>
                    <Label>Valor para marcar procesados</Label>
                    <Input
                      type="text"
                      name="markProcessedValue"
                      value={mapping.markProcessedValue}
                      onChange={handleChange}
                      placeholder="Valor para marcar como procesado"
                    />
                  </div>

                  <div
                    style={{
                      marginTop: "15px",
                      padding: "12px",
                      backgroundColor: "#fff3cd",
                      border: "1px solid #ffeaa7",
                      borderLeft: "4px solid #fdcb6e",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "600",
                        color: "#856404",
                        marginBottom: "8px",
                        fontSize: "0.95rem",
                      }}
                    >
                      ⚠️ Estrategia: {mapping.markProcessedStrategy}
                    </div>
                    <div
                      style={{
                        color: "#856404",
                        fontSize: "0.85rem",
                        lineHeight: "1.4",
                      }}
                    >
                      {mapping.markProcessedStrategy === "individual" && (
                        <>
                          Cada documento se marca individualmente después de ser
                          procesado. Esto es más seguro pero más lento para
                          grandes volúmenes.
                        </>
                      )}
                      {mapping.markProcessedStrategy === "batch" && (
                        <>
                          Los documentos se marcan en lotes al final del
                          procesamiento. Esto es más rápido pero todos los
                          documentos del lote se marcarán aunque algunos fallen.
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "15px",
                      padding: "12px",
                      backgroundColor: "#e3f2fd",
                      border: "1px solid #bbdefb",
                      borderLeft: "4px solid #2196f3",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "600",
                        color: "#1565c0",
                        marginBottom: "8px",
                        fontSize: "0.95rem",
                      }}
                    >
                      💡 Recomendaciones de Uso
                    </div>
                    <ul
                      style={{
                        margin: "0",
                        paddingLeft: "20px",
                        color: "#424242",
                        fontSize: "0.85rem",
                        lineHeight: "1.4",
                      }}
                    >
                      <li style={{ marginBottom: "4px" }}>
                        <strong>Individual:</strong> Ideal para documentos
                        críticos o volúmenes pequeños (menos de 50 documentos)
                      </li>
                      <li style={{ marginBottom: "4px" }}>
                        <strong>Lotes:</strong> Recomendado para volúmenes
                        grandes (más de 100 documentos) por mejor rendimiento
                      </li>
                      <li style={{ marginBottom: "4px" }}>
                        <strong>Ninguno:</strong> Útil para pruebas o cuando se
                        requiere reprocesamiento múltiple
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </FormGroup>

            {/* Sección de Consecutivos */}
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
                        <PropertyLabel>
                          Campo que causa dependencia:
                        </PropertyLabel>
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
                          {dependency.insertIfNotExists
                            ? dependency.validateOnly
                              ? "Solo validar"
                              : "Insertar si no existe"
                            : "Solo verificar existencia"}
                        </PropertyValue>
                      </PropertyItem>

                      <PropertyItem>
                        <PropertyLabel>Orden de ejecución:</PropertyLabel>
                        <PropertyValue>
                          {dependency.executionOrder || 0}
                        </PropertyValue>
                      </PropertyItem>

                      {dependency.dependentFields &&
                        dependency.dependentFields.length > 0 && (
                          <PropertyItem>
                            <PropertyLabel>Campos mapeados:</PropertyLabel>
                            <PropertyValue>
                              {dependency.dependentFields
                                .map(
                                  (field) =>
                                    `${field.sourceField} → ${field.targetField}`
                                )
                                .join(", ")}
                            </PropertyValue>
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
                                  <td>{field.sourceField || "-"}</td>
                                  <td>{field.targetField}</td>
                                  <td>
                                    {field.defaultValue !== undefined
                                      ? String(field.defaultValue)
                                      : "-"}
                                  </td>
                                  <td>{field.isSqlFunction ? "Sí" : "No"}</td>
                                  <td>
                                    {field.valueMappings?.length || 0}
                                    {field.valueMappings?.length > 0 && (
                                      <SmallButton
                                        onClick={() =>
                                          addValueMapping(
                                            tableIndex,
                                            fieldIndex
                                          )
                                        }
                                        style={{ marginLeft: "5px" }}
                                      >
                                        <FaPlus />
                                      </SmallButton>
                                    )}
                                  </td>
                                  <td>
                                    <SmallButton
                                      onClick={() =>
                                        editFieldMapping(tableIndex, fieldIndex)
                                      }
                                    >
                                      <FaEdit />
                                    </SmallButton>
                                    <SmallButton
                                      $danger
                                      onClick={() =>
                                        removeFieldMapping(
                                          tableIndex,
                                          fieldIndex
                                        )
                                      }
                                    >
                                      <FaTrash />
                                    </SmallButton>
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

        {/* 🟢 PESTAÑA BONIFICACIONES */}
        {/* 🟢 PESTAÑA BONIFICACIONES */}
        {activeTab === "bonifications" && (
          <Section>
            <SectionHeader>
              <h3>
                <FaGift /> Procesamiento de Bonificaciones
              </h3>
              {!mapping.hasBonificationProcessing ? (
                <SmallButton onClick={addBonificationConfig}>
                  <FaPlus /> Habilitar Bonificaciones
                </SmallButton>
              ) : (
                <SmallButton $danger onClick={removeBonificationConfig}>
                  <FaTrash /> Deshabilitar
                </SmallButton>
              )}
            </SectionHeader>

            {mapping.hasBonificationProcessing ? (
              <Card>
                <CardHeader>
                  <h4>Configuración de Bonificaciones</h4>
                </CardHeader>
                <CardBody>
                  <div
                    style={{
                      background: "#d1ecf1",
                      border: "1px solid #bee5eb",
                      borderRadius: "4px",
                      padding: "15px",
                      marginBottom: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#0c5460",
                    }}
                  >
                    <FaGift style={{ color: "#17a2b8", flexShrink: 0 }} />
                    <div>
                      <strong>Procesamiento automático habilitado:</strong> El
                      sistema asignará automáticamente números de línea
                      secuenciales y creará las referencias entre bonificaciones
                      y artículos regulares.
                    </div>
                  </div>

                  <FormRow>
                    <FormGroup>
                      <Label>Tabla de origen *</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.sourceTable"
                        value={mapping.bonificationConfig.sourceTable}
                        onChange={handleChange}
                        placeholder="ej: FAC_DET_PED"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Tabla que contiene tanto artículos regulares como
                        bonificaciones
                      </small>
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo indicador de bonificación *</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationIndicatorField"
                        value={
                          mapping.bonificationConfig.bonificationIndicatorField
                        }
                        onChange={handleChange}
                        placeholder="ej: ART_BON"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo que distingue bonificaciones de artículos
                        regulares
                      </small>
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Valor que marca bonificación *</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationIndicatorValue"
                        value={
                          mapping.bonificationConfig.bonificationIndicatorValue
                        }
                        onChange={handleChange}
                        placeholder="ej: B"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Valor en el campo indicador que identifica una
                        bonificación
                      </small>
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo de agrupación *</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.orderField"
                        value={mapping.bonificationConfig.orderField}
                        onChange={handleChange}
                        placeholder="ej: NUM_PED"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo para agrupar registros (número de pedido, factura,
                        etc.)
                      </small>
                    </FormGroup>
                  </FormRow>

                  {/* 🔥 NUEVA FILA: Campo crítico faltante */}
                  <FormRow>
                    <FormGroup>
                      <Label>Campo de orden de líneas *</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.lineOrderField"
                        value={
                          mapping.bonificationConfig.lineOrderField || "NUM_LN"
                        }
                        onChange={handleChange}
                        placeholder="ej: NUM_LN"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        <strong>CRÍTICO:</strong> Campo para ordenar registros
                        antes del procesamiento (NUM_LN)
                      </small>
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo de artículo regular</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.regularArticleField"
                        value={mapping.bonificationConfig.regularArticleField}
                        onChange={handleChange}
                        placeholder="ej: COD_ART"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo que contiene el código del artículo
                      </small>
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo de referencia de bonificación</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationReferenceField"
                        value={
                          mapping.bonificationConfig.bonificationReferenceField
                        }
                        onChange={handleChange}
                        placeholder="ej: COD_ART_RFR"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo que referencia al artículo regular que lleva la
                        bonificación
                      </small>
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo de cantidad</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.quantityField"
                        value={mapping.bonificationConfig.quantityField}
                        onChange={handleChange}
                        placeholder="ej: CNT_MAX"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo que contiene la cantidad (regular o bonificada)
                      </small>
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo de número de línea destino</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.lineNumberField"
                        value={mapping.bonificationConfig.lineNumberField}
                        onChange={handleChange}
                        placeholder="ej: PEDIDO_LINEA"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo donde se asignará el número de línea secuencial
                      </small>
                    </FormGroup>

                    <FormGroup>
                      <Label>
                        Campo de referencia de línea de bonificación
                      </Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationLineReferenceField"
                        value={
                          mapping.bonificationConfig
                            .bonificationLineReferenceField
                        }
                        onChange={handleChange}
                        placeholder="ej: PEDIDO_LINEA_BONIF"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo donde se asignará la referencia a la línea del
                        artículo regular
                      </small>
                    </FormGroup>
                  </FormRow>

                  {/* 🔥 NUEVA SECCIÓN DE VALIDACIÓN */}
                  <div
                    style={{
                      marginTop: "20px",
                      padding: "15px",
                      background: "#fff3cd",
                      borderRadius: "6px",
                      border: "1px solid #ffeaa7",
                      borderLeft: "4px solid #fdcb6e",
                    }}
                  >
                    <h5 style={{ margin: "0 0 10px 0", color: "#856404" }}>
                      ⚠️ Validación de Configuración:
                    </h5>
                    <div style={{ fontSize: "0.875rem", color: "#856404" }}>
                      {!mapping.bonificationConfig.sourceTable && (
                        <div>❌ Falta tabla de origen</div>
                      )}
                      {!mapping.bonificationConfig
                        .bonificationIndicatorField && (
                        <div>❌ Falta campo indicador de bonificación</div>
                      )}
                      {!mapping.bonificationConfig.orderField && (
                        <div>❌ Falta campo de agrupación</div>
                      )}
                      {!mapping.bonificationConfig.lineOrderField && (
                        <div>❌ Falta campo de orden de líneas (NUM_LN)</div>
                      )}
                      {mapping.bonificationConfig.sourceTable &&
                        mapping.bonificationConfig.bonificationIndicatorField &&
                        mapping.bonificationConfig.orderField &&
                        mapping.bonificationConfig.lineOrderField && (
                          <div style={{ color: "#155724" }}>
                            ✅ Configuración válida
                          </div>
                        )}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "20px",
                      padding: "15px",
                      background: "#f8f9fa",
                      borderRadius: "6px",
                      border: "1px solid #dee2e6",
                    }}
                  >
                    <h5 style={{ margin: "0 0 15px 0", color: "#495057" }}>
                      Flujo de procesamiento:
                    </h5>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        1. Agrupa registros por{" "}
                        {mapping.bonificationConfig.orderField}
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        2. Ordena por{" "}
                        {mapping.bonificationConfig.lineOrderField || "NUM_LN"}
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        3. Asigna líneas secuenciales a artículos regulares
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        4. Mapea bonificaciones con sus artículos regulares
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        5. Asigna{" "}
                        {
                          mapping.bonificationConfig
                            .bonificationLineReferenceField
                        }{" "}
                        con la línea correspondiente
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "white",
                          borderRadius: "4px",
                          borderLeft: "3px solid #007bff",
                          fontSize: "0.875rem",
                          color: "#495057",
                        }}
                      >
                        6. Limpia{" "}
                        {mapping.bonificationConfig.bonificationReferenceField}{" "}
                        original
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <EmptyMessage>
                <FaGift size={48} />
                <h3>Procesamiento de bonificaciones deshabilitado</h3>
                <p>
                  Habilite esta función para procesar automáticamente las
                  bonificaciones y asignar las referencias correctas entre
                  artículos regulares y bonificaciones.
                </p>
              </EmptyMessage>
            )}
          </Section>
        )}
      </Content>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  background: ${(props) => props.theme.cardBg};
  border-radius: 8px;
  box-shadow: ${(props) => props.theme.boxShadow};
  overflow: hidden;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: ${(props) => props.theme.text};
`;

const Header = styled.div`
  padding: 20px;
  background: ${(props) => props.theme.headerBg};
  border-bottom: 1px solid ${(props) => props.theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    margin: 0;
    color: ${(props) => props.theme.title};
  }
`;

const ButtonsGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  background: ${(props) =>
    props.$secondary ? props.theme.secondary : props.theme.primary};
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;

  &:hover {
    background: ${(props) =>
      props.$secondary ? props.theme.secondaryHover : props.theme.primaryHover};
  }
`;

const SmallButton = styled.button`
  background: ${(props) =>
    props.$danger ? props.theme.danger : props.theme.primary};
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;

  &:hover {
    background: ${(props) =>
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
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    color: ${(props) => props.theme.primary};
  }
`;

const Content = styled.div`
  margin-top: 20px;
  padding: 0 20px 20px;
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
    display: flex;
    align-items: center;
    gap: 8px;
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

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
    box-shadow: 0 0 0 2px ${(props) => props.theme.primary}20;
  }
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

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
    box-shadow: 0 0 0 2px ${(props) => props.theme.primary}20;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
    box-shadow: 0 0 0 2px ${(props) => props.theme.primary}20;
  }
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
  color: ${(props) => props.theme.text};
`;

const Card = styled.div`
  margin-bottom: 20px;
  border: 1px solid ${(props) => props.theme.border};
  border-left: 4px solid
    ${(props) =>
      props.$isDetail ? props.theme.secondary : props.theme.primary};
  border-radius: 6px;
  overflow: hidden;
  background: ${(props) => props.theme.cardBg};
`;

const CardHeader = styled.div`
  padding: 15px;
  background: ${(props) => props.theme.headerBg};
  border-bottom: 1px solid ${(props) => props.theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;

  h4 {
    margin: 0;
    color: ${(props) => props.theme.title};
  }

  .button_container {
    display: flex;
    gap: 8px;
  }
`;

const CardBody = styled.div`
  padding: 15px;
`;

const PropertyList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 15px;
`;

const PropertyItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const PropertyLabel = styled.span`
  font-size: 0.85rem;
  color: ${(props) => props.theme.textSecondary};
  margin-bottom: 2px;
`;

const PropertyValue = styled.span`
  font-weight: 500;
  color: ${(props) => props.theme.text};
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
    font-size: 1rem;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;

  th,
  td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid ${(props) => props.theme.border};
  }

  th {
    background: ${(props) => props.theme.headerBg};
    font-weight: 500;
    color: ${(props) => props.theme.title};
    font-size: 0.9rem;
  }

  td {
    color: ${(props) => props.theme.text};
    font-size: 0.85rem;
  }

  td:last-child {
    display: flex;
    gap: 5px;
  }
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 40px;
  color: ${(props) => props.theme.textSecondary};

  h3 {
    margin: 10px 0;
    color: ${(props) => props.theme.title};
  }

  p {
    margin: 0;
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.5;
  }
`;
