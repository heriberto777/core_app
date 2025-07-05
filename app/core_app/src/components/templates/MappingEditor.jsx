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
  FaEye,
  FaCheck,
  FaExclamationTriangle,
  FaChevronDown,
  FaChevronUp,
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
    markProcessedStrategy: "individual",
    markProcessedConfig: {
      batchSize: 100,
      includeTimestamp: true,
      timestampField: "LAST_PROCESSED_DATE",
      allowRollback: false,
    },
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
      lineNumberField: "PEDIDO_LINEA",
      bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
      quantityField: "CNT_MAX",
      bonificationQuantityField: "CANTIDAD_BONIFICAD", // 🆕 Campo cantidad bonificada
      regularQuantityField: "CANTIDAD_REGULAR", // 🆕 Campo cantidad regular
      applyPromotionRules: false,
    },
  });
  const [isEditing, setIsEditing] = useState(!mappingId);
  const [activeTab, setActiveTab] = useState("general");

  // 🆕 Estados para los toggles de cada sección
  const [expandedSections, setExpandedSections] = useState({
    general: true,
    servers: true,
    processedFields: true,
    consecutives: true,
    bonifications: true,
    documentTypes: true,
    foreignKeys: true,
    tables: true,
  });

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
          consecutiveConfig: {
            enabled: false, // Default
            fieldName: "",
            detailFieldName: "",
            lastValue: 0,
            prefix: "",
            pattern: "",
            updateAfterTransfer: true,
            applyToTables: [],
            ...data.consecutiveConfig, // Sobrescribir con datos reales
          },
          bonificationConfig: {
            sourceTable: "FAC_DET_PED",
            bonificationIndicatorField: "ART_BON",
            bonificationIndicatorValue: "B",
            regularArticleField: "COD_ART",
            bonificationReferenceField: "COD_ART_RFR",
            orderField: "NUM_PED",
            lineNumberField: "PEDIDO_LINEA",
            bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
            quantityField: "CNT_MAX",
            bonificationQuantityField: "CANTIDAD_BONIFICAD", // 🆕
            regularQuantityField: "CANTIDAD_PEDIDA", // 🆕
            applyPromotionRules: false,
            ...data.bonificationConfig,
          },
          markProcessedStrategy: data.markProcessedStrategy || "individual",
          markProcessedConfig: {
            batchSize: 100,
            includeTimestamp: true,
            timestampField: "LAST_PROCESSED_DATE",
            allowRollback: false,
            ...data.markProcessedConfig,
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

  // 🆕 Función para toggle de secciones
  const toggleSection = (sectionName) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
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

    if (name.startsWith("markProcessedConfig.")) {
      const field = name.replace("markProcessedConfig.", "");
      setMapping((prevState) => ({
        ...prevState,
        markProcessedConfig: {
          ...prevState.markProcessedConfig,
          [field]: type === "checkbox" ? checked : value,
        },
      }));
      return;
    }

    setMapping((prevState) => ({
      ...prevState,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      let result;

      if (mappingId) {
        result = await api.updateMapping(accessToken, mappingId, mapping);
      } else {
        result = await api.createMapping(accessToken, mapping);
      }

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: "¡Éxito!",
          text: mappingId
            ? "Configuración actualizada correctamente"
            : "Configuración creada correctamente",
          timer: 2000,
          showConfirmButton: false,
        });
        onSave(result.data);
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Error al guardar la configuración",
      });
    } finally {
      setLoading(false);
    }
  };

  // 🎁 Funciones de bonificaciones
  const validateBonifications = async () => {
    if (!mappingId) {
      Swal.fire({
        icon: "warning",
        title: "Advertencia",
        text: "Debe guardar el mapping primero antes de validar bonificaciones",
      });
      return;
    }

    try {
      setLoading(true);
      const response = await api.validateBonifications(accessToken, mappingId);

      if (response.success) {
        const validation = response.data;

        if (validation.valid) {
          Swal.fire({
            icon: "success",
            title: "✅ Configuración Válida",
            text:
              validation.message ||
              "La configuración de bonificaciones es correcta",
            timer: 3000,
            showConfirmButton: false,
          });
        } else {
          const issuesHtml = validation.issues
            ? `<strong>❌ Errores:</strong><br>${validation.issues.join(
                "<br>"
              )}<br><br>`
            : "";
          const warningsHtml = validation.warnings
            ? `<strong>⚠️ Advertencias:</strong><br>${validation.warnings.join(
                "<br>"
              )}`
  : "";

          Swal.fire({
            icon: "warning",
            title: "⚠️ Problemas en Configuración",
            html: issuesHtml + warningsHtml,
            width: 600,
          });
        }
      }
    } catch (error) {
      console.error("Error validando bonificaciones:", error);
      Swal.fire({
        icon: "error",
        title: "❌ Error",
        text: "Error validando configuración de bonificaciones",
      });
    } finally {
      setLoading(false);
    }
  };

  const previewBonifications = async () => {
    if (!mappingId) {
      Swal.fire({
        icon: "warning",
        title: "Advertencia",
        text: "Debe guardar el mapping primero antes de hacer preview",
      });
      return;
    }

    try {
      const { value: documentId } = await Swal.fire({
        title: "🎁 Preview de Bonificaciones",
        text: "Ingrese el número de documento (NUM_PED) para previsualizar:",
        input: "text",
        inputPlaceholder: "Ej: PED001, 12345, etc.",
        showCancelButton: true,
        confirmButtonText: "🔍 Generar Preview",
        cancelButtonText: "Cancelar",
        inputValidator: (value) => {
          if (!value) {
            return "¡Debe ingresar un número de documento!";
          }
        },
      });

      if (documentId) {
        setLoading(true);
        const response = await api.previewBonifications(
          accessToken,
          mappingId,
          documentId
        );

        if (response.success) {
          const data = response.data;

          Swal.fire({
            icon: "info",
            title: "🎁 Preview de Bonificaciones",
            html: `
              <div style="text-align: left; font-family: monospace;">
                <h4>📋 Documento: <strong>${data.documentId}</strong></h4>

                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
                  <h5>📊 Resumen del Procesamiento:</h5>
                  <strong>Datos Originales:</strong><br>
                  • Total items: ${data.original.totalItems}<br><br>

                  <strong>Datos Procesados:</strong><br>
                  • Total items: ${data.processed.totalItems}<br>
                  • Artículos regulares: ${data.processed.regularItems}<br>
                  • Bonificaciones: ${data.processed.bonifications}<br>
                  • ✅ Bonificaciones vinculadas: ${data.processed.linkedBonifications}<br>
                  • ⚠️ Bonificaciones huérfanas: ${data.processed.orphanBonifications}<br>
                </div>

                <div style="background: #e9ecef; padding: 10px; border-radius: 5px;">
                  <strong>🔄 Transformación:</strong><br>
                  • Líneas agregadas: ${data.summary.linesAdded}<br>
                  • Bonificaciones vinculadas: ${data.summary.bonificationsLinked}<br>
                  • Bonificaciones huérfanas: ${data.summary.bonificationsOrphan}<br>
                </div>
              </div>
            `,
            width: 700,
            showConfirmButton: true,
            confirmButtonText: "Cerrar",
          });
        }
      }
    } catch (error) {
      console.error("Error en preview de bonificaciones:", error);
      Swal.fire({
        icon: "error",
        title: "❌ Error",
        text: "Error generando preview de bonificaciones",
      });
    } finally {
      setLoading(false);
    }
  };

  // Otras funciones existentes (mantienes todas las que ya tienes)
  const addDocumentTypeRule = () => {
    Swal.fire({
      title: "Nueva Regla de Tipo de Documento",
      html: `
        <div class="form-group">
          <label for="ruleName">Nombre de la regla</label>
          <input id="ruleName" class="swal2-input" placeholder="Ej: Pedidos">
        </div>
        <div class="form-group">
          <label for="sourceField">Campo origen</label>
          <input id="sourceField" class="swal2-input" placeholder="Ej: TIP_DOC">
        </div>
        <div class="form-group">
          <label for="sourceValues">Valores (separados por coma)</label>
          <input id="sourceValues" class="swal2-input" placeholder="Ej: P,PED">
        </div>
        <div class="form-group">
          <label for="description">Descripción</label>
          <input id="description" class="swal2-input" placeholder="Descripción opcional">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const sourceField = document.getElementById("sourceField").value;
        const sourceValues = document.getElementById("sourceValues").value;
        const description = document.getElementById("description").value;

        if (!name || !sourceField || !sourceValues) {
          Swal.showValidationMessage(
            "Por favor complete todos los campos obligatorios"
          );
          return false;
        }

        return {
          name,
          sourceField,
          sourceValues: sourceValues.split(",").map((v) => v.trim()),
          description,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newDocumentTypeRules = [...mapping.documentTypeRules];
        newDocumentTypeRules.push(result.value);

        setMapping({
          ...mapping,
          documentTypeRules: newDocumentTypeRules,
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
          <label for="ruleName">Nombre de la regla</label>
          <input id="ruleName" class="swal2-input" value="${rule.name}">
        </div>
        <div class="form-group">
          <label for="sourceField">Campo origen</label>
          <input id="sourceField" class="swal2-input" value="${
            rule.sourceField
          }">
        </div>
        <div class="form-group">
          <label for="sourceValues">Valores (separados por coma)</label>
          <input id="sourceValues" class="swal2-input" value="${rule.sourceValues.join(
            ", "
          )}">
        </div>
        <div class="form-group">
          <label for="description">Descripción</label>
          <input id="description" class="swal2-input" value="${
            rule.description || ""
          }">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = document.getElementById("ruleName").value;
        const sourceField = document.getElementById("sourceField").value;
        const sourceValues = document.getElementById("sourceValues").value;
        const description = document.getElementById("description").value;

        if (!name || !sourceField || !sourceValues) {
          Swal.showValidationMessage(
            "Por favor complete todos los campos obligatorios"
          );
          return false;
        }

        return {
          name,
          sourceField,
          sourceValues: sourceValues.split(",").map((v) => v.trim()),
          description,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newDocumentTypeRules = [...mapping.documentTypeRules];
        newDocumentTypeRules[index] = result.value;

        setMapping({
          ...mapping,
          documentTypeRules: newDocumentTypeRules,
        });
      }
    });
  };

  const removeDocumentTypeRule = (index) => {
    const newDocumentTypeRules = [...mapping.documentTypeRules];
    newDocumentTypeRules.splice(index, 1);

    setMapping({
      ...mapping,
      documentTypeRules: newDocumentTypeRules,
    });
  };

  const addForeignKeyDependency = () => {
    Swal.fire({
      title: "Nueva Dependencia de Foreign Key",
      html: `
        <div class="form-group">
          <label for="fieldName">Campo que causa la dependencia</label>
          <input id="fieldName" class="swal2-input" placeholder="Ej: COD_CLI">
        </div>
        <div class="form-group">
          <label for="dependentTable">Tabla dependiente</label>
          <input id="dependentTable" class="swal2-input" placeholder="Ej: CLIENTES">
        </div>
        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="0">
        </div>
        <div class="form-group">
          <label for="insertIfNotExists">Acción si no existe:</label>
          <select id="insertIfNotExists" class="swal2-input">
            <option value="false">Solo validar</option>
            <option value="true">Insertar si no existe</option>
          </select>
        </div>
        <div class="form-group">
          <label for="validateOnly">Solo verificar existencia</label>
          <input id="validateOnly" type="checkbox" class="swal2-checkbox">
        </div>
        <div class="form-group">
          <label for="dependentFields">Campos dependientes (JSON)</label>
          <textarea id="dependentFields" class="swal2-textarea" placeholder='[{"sourceField": "COD_CLI", "targetField": "CODIGO", "isKey": true}]'></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value;
        const dependentTable = document.getElementById("dependentTable").value;
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").value === "true";
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsStr =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Por favor complete los campos obligatorios"
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
        newDependencies.push(result.value);

        setMapping({
          ...mapping,
          foreignKeyDependencies: newDependencies,
        });
      }
    });
  };

  const editForeignKeyDependency = (index) => {
    const dependency = mapping.foreignKeyDependencies[index];

    Swal.fire({
      title: "Editar Dependencia de Foreign Key",
      html: `
        <div class="form-group">
          <label for="fieldName">Campo que causa la dependencia</label>
          <input id="fieldName" class="swal2-input" value="${
            dependency.fieldName
          }">
        </div>
        <div class="form-group">
          <label for="dependentTable">Tabla dependiente</label>
          <input id="dependentTable" class="swal2-input" value="${
            dependency.dependentTable
          }">
        </div>
        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="${
            dependency.executionOrder || 0
          }">
        </div>
        <div class="form-group">
          <label for="insertIfNotExists">Acción si no existe:</label>
          <select id="insertIfNotExists" class="swal2-input">
            <option value="false" ${
              !dependency.insertIfNotExists ? "selected" : ""
            }>Solo validar</option>
            <option value="true" ${
              dependency.insertIfNotExists ? "selected" : ""
            }>Insertar si no existe</option>
          </select>
        </div>
        <div class="form-group">
          <label for="validateOnly">Solo verificar existencia</label>
          <input id="validateOnly" type="checkbox" class="swal2-checkbox" ${
            dependency.validateOnly ? "checked" : ""
          }>
        </div>
        <div class="form-group">
          <label for="dependentFields">Campos dependientes (JSON)</label>
          <textarea id="dependentFields" class="swal2-textarea">${JSON.stringify(
            dependency.dependentFields || [],
            null,
            2
          )}</textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value;
        const dependentTable = document.getElementById("dependentTable").value;
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").value === "true";
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsStr =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Por favor complete los campos obligatorios"
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
          <input id="targetPrimaryKey" class="swal2-input" placeholder="Ej: ID_PEDIDO">
        </div>
        <div class="form-group">
          <label for="isDetailTable">¿Es tabla de detalle?</label>
          <input id="isDetailTable" type="checkbox" class="swal2-checkbox">
        </div>
        <div class="form-group">
          <label for="parentTableRef">Referencia a tabla padre (solo para detalles)</label>
          <input id="parentTableRef" class="swal2-input" placeholder="Ej: pedidosHeader">
        </div>
        <div class="form-group">
          <label for="useSameSourceTable">¿Usa la misma tabla del header?</label>
          <input id="useSameSourceTable" type="checkbox" class="swal2-checkbox">
        </div>
        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="0">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
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
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Por favor complete los campos obligatorios"
          );
          return false;
        }

        return {
          name,
          sourceTable,
          targetTable,
          primaryKey: primaryKey || "NUM_PED",
          targetPrimaryKey,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : undefined,
          useSameSourceTable,
          fieldMappings: [],
          executionOrder,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs.push(result.value);

        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
  };

  const editTableConfig = (index) => {
    const table = mapping.tableConfigs[index];

    Swal.fire({
      title: "Editar Configuración de Tabla",
      html: `
        <div class="form-group">
          <label for="tableName">Nombre</label>
          <input id="tableName" class="swal2-input" value="${table.name}">
        </div>
        <div class="form-group">
          <label for="sourceTable">Tabla origen</label>
          <input id="sourceTable" class="swal2-input" value="${
            table.sourceTable
          }">
        </div>
        <div class="form-group">
          <label for="targetTable">Tabla destino</label>
          <input id="targetTable" class="swal2-input" value="${
            table.targetTable
          }">
        </div>
        <div class="form-group">
          <label for="primaryKey">Clave primaria en tabla origen</label>
          <input id="primaryKey" class="swal2-input" value="${
            table.primaryKey || ""
          }">
        </div>
        <div class="form-group">
          <label for="targetPrimaryKey">Clave primaria en tabla destino</label>
          <input id="targetPrimaryKey" class="swal2-input" value="${
            table.targetPrimaryKey || ""
          }">
        </div>
        <div class="form-group">
          <label for="isDetailTable">¿Es tabla de detalle?</label>
          <input id="isDetailTable" type="checkbox" class="swal2-checkbox" ${
            table.isDetailTable ? "checked" : ""
          }>
        </div>
        <div class="form-group">
          <label for="parentTableRef">Referencia a tabla padre (solo para detalles)</label>
          <input id="parentTableRef" class="swal2-input" value="${
            table.parentTableRef || ""
          }">
        </div>
        <div class="form-group">
          <label for="useSameSourceTable">¿Usa la misma tabla del header?</label>
          <input id="useSameSourceTable" type="checkbox" class="swal2-checkbox" ${
            table.useSameSourceTable ? "checked" : ""
          }>
        </div>
        <div class="form-group">
          <label for="executionOrder">Orden de ejecución</label>
          <input id="executionOrder" type="number" class="swal2-input" value="${
            table.executionOrder || 0
          }">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
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
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;

        if (!name || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Por favor complete los campos obligatorios"
          );
          return false;
        }

        return {
          name,
          sourceTable,
          targetTable,
          primaryKey: primaryKey || "NUM_PED",
          targetPrimaryKey,
          isDetailTable,
          parentTableRef: isDetailTable ? parentTableRef : undefined,
          useSameSourceTable,
          fieldMappings: table.fieldMappings || [],
          executionOrder,
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
    const newTableConfigs = [...mapping.tableConfigs];
    newTableConfigs.splice(index, 1);

    setMapping({
      ...mapping,
      tableConfigs: newTableConfigs,
    });
  };

  const addFieldMapping = (tableIndex) => {
    Swal.fire({
      title: "Nuevo Mapeo de Campo",
      html: `
        <div class="form-group">
          <label for="sourceField">Campo origen</label>
          <input id="sourceField" class="swal2-input" placeholder="Ej: NUM_PED">
        </div>
        <div class="form-group">
          <label for="targetField">Campo destino</label>
          <input id="targetField" class="swal2-input" placeholder="Ej: NUMERO_PEDIDO">
        </div>
        <div class="form-group">
          <label for="defaultValue">Valor por defecto</label>
          <input id="defaultValue" class="swal2-input" placeholder="Valor opcional">
        </div>
        <div class="form-group">
          <label for="isRequired">¿Es obligatorio?</label>
          <input id="isRequired" type="checkbox" class="swal2-checkbox">
        </div>
        <div class="form-group">
          <label for="isSqlFunction">¿Es función SQL?</label>
          <input id="isSqlFunction" type="checkbox" class="swal2-checkbox">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const isRequired = document.getElementById("isRequired").checked;
        const isSqlFunction = document.getElementById("isSqlFunction").checked;

        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        return {
          sourceField: sourceField || null,
          targetField,
          defaultValue: defaultValue || undefined,
          isRequired,
          isSqlFunction,
          valueMappings: [],
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
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

    Swal.fire({
      title: "Editar Mapeo de Campo",
      html: `
        <div class="form-group">
          <label for="sourceField">Campo origen</label>
          <input id="sourceField" class="swal2-input" value="${
            field.sourceField || ""
          }">
        </div>
        <div class="form-group">
          <label for="targetField">Campo destino</label>
          <input id="targetField" class="swal2-input" value="${
            field.targetField
          }">
        </div>
        <div class="form-group">
          <label for="defaultValue">Valor por defecto</label>
          <input id="defaultValue" class="swal2-input" value="${
            field.defaultValue || ""
          }">
        </div>
        <div class="form-group">
          <label for="isRequired">¿Es obligatorio?</label>
          <input id="isRequired" type="checkbox" class="swal2-checkbox" ${
            field.isRequired ? "checked" : ""
          }>
        </div>
        <div class="form-group">
          <label for="isSqlFunction">¿Es función SQL?</label>
          <input id="isSqlFunction" type="checkbox" class="swal2-checkbox" ${
            field.isSqlFunction ? "checked" : ""
          }>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const sourceField = document.getElementById("sourceField").value;
        const targetField = document.getElementById("targetField").value;
        const defaultValue = document.getElementById("defaultValue").value;
        const isRequired = document.getElementById("isRequired").checked;
        const isSqlFunction = document.getElementById("isSqlFunction").checked;

        if (!targetField) {
          Swal.showValidationMessage("El campo destino es obligatorio");
          return false;
        }

        return {
          sourceField: sourceField || null,
          targetField,
          defaultValue: defaultValue || undefined,
          isRequired,
          isSqlFunction,
          valueMappings: field.valueMappings || [],
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
          <input id="sourceValue" class="swal2-input" placeholder="Ej: A">
        </div>
        <div class="form-group">
          <label for="targetValue">Valor destino</label>
          <input id="targetValue" class="swal2-input" placeholder="Ej: Activo">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const sourceValue = document.getElementById("sourceValue").value;
        const targetValue = document.getElementById("targetValue").value;

        if (!sourceValue || !targetValue) {
          Swal.showValidationMessage("Ambos valores son obligatorios");
          return false;
        }

        return {
          sourceValue,
          targetValue,
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const newTableConfigs = [...mapping.tableConfigs];
        if (
          !newTableConfigs[tableIndex].fieldMappings[fieldIndex].valueMappings
        ) {
          newTableConfigs[tableIndex].fieldMappings[fieldIndex].valueMappings =
            [];
        }
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
        <h2>{mappingId ? "Editar" : "Crear"} Configuración de Mapeo</h2>
        <Actions>
          <ActionButton onClick={handleSave} disabled={loading}>
            <FaSave /> {mappingId ? "Actualizar" : "Crear"}
          </ActionButton>
          <ActionButton $secondary onClick={onCancel}>
            <FaTimes /> Cancelar
          </ActionButton>
        </Actions>
      </Header>

      <TabContainer>
        <Tab
          $active={activeTab === "general"}
          onClick={() => setActiveTab("general")}
        >
          Configuración General
        </Tab>
        <Tab
          $active={activeTab === "tables"}
          onClick={() => setActiveTab("tables")}
        >
          Tablas y Campos
        </Tab>
        <Tab
          $active={activeTab === "bonifications"}
          onClick={() => setActiveTab("bonifications")}
        >
          <FaGift /> Bonificaciones
        </Tab>
      </TabContainer>

      <TabContent>
        {/* Pestaña General */}
        {activeTab === "general" && (
          <>
            {/* Sección Información General */}
            <Section>
              <SectionHeader>
                <h3>📋 Información General</h3>
                <ToggleButton onClick={() => toggleSection("general")}>
                  {expandedSections.general ? (
                    <FaChevronUp />
                  ) : (
                    <FaChevronDown />
                  )}
                </ToggleButton>
              </SectionHeader>

              {expandedSections.general && (
                <Card>
                  <CardBody>
                    <FormRow>
                      <FormGroup>
                        <Label>Nombre *</Label>
                        <Input
                          type="text"
                          name="name"
                          value={mapping.name}
                          onChange={handleChange}
                          placeholder="Nombre de la configuración"
                          required
                        />
                      </FormGroup>

                      <FormGroup>
                        <Label>Estado</Label>
                        <CheckboxGroup>
                          <Checkbox
                            type="checkbox"
                            name="active"
                            checked={mapping.active}
                            onChange={handleChange}
                          />
                          <CheckboxLabel>Activo</CheckboxLabel>
                        </CheckboxGroup>
                      </FormGroup>
                    </FormRow>

                    <FormGroup>
                      <Label>Descripción</Label>
                      <Input
                        type="text"
                        name="description"
                        value={mapping.description}
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
                  </CardBody>
                </Card>
              )}
            </Section>

            {/* Sección Configuración de Servidores */}
            <Section>
              <SectionHeader>
                <h3>🔗 Configuración de Servidores</h3>
                <ToggleButton onClick={() => toggleSection("servers")}>
                  {expandedSections.servers ? (
                    <FaChevronUp />
                  ) : (
                    <FaChevronDown />
                  )}
                </ToggleButton>
              </SectionHeader>

              {expandedSections.servers && (
                <Card>
                  <CardBody>
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
                  </CardBody>
                </Card>
              )}
            </Section>

            {/* Sección Campos de Procesado */}
            <Section>
              <SectionHeader>
                <h3>✅ Campos de Procesado</h3>
                <ToggleButton onClick={() => toggleSection("processedFields")}>
                  {expandedSections.processedFields ? (
                    <FaChevronUp />
                  ) : (
                    <FaChevronDown />
                  )}
                </ToggleButton>
              </SectionHeader>

              {expandedSections.processedFields && (
                <Card>
                  <CardBody>
                    <FormRow>
                      <FormGroup>
                        <Label>Campo de Marcado</Label>
                        <Input
                          type="text"
                          name="markProcessedField"
                          value={mapping.markProcessedField}
                          onChange={handleChange}
                          placeholder="IS_PROCESSED"
                        />
                      </FormGroup>

                      <FormGroup>
                        <Label>Valor de Marcado</Label>
                        <Input
                          type="text"
                          name="markProcessedValue"
                          value={mapping.markProcessedValue}
                          onChange={handleChange}
                          placeholder="1"
                        />
                      </FormGroup>

                      <FormGroup>
                        <Label>Estrategia de Marcado</Label>
                        <Select
                          name="markProcessedStrategy"
                          value={mapping.markProcessedStrategy}
                          onChange={handleChange}
                        >
                          <option value="individual">Individual</option>
                          <option value="batch">En lotes</option>
                          <option value="none">Sin marcado</option>
                        </Select>
                      </FormGroup>
                    </FormRow>

                    {mapping.markProcessedStrategy === "batch" && (
                      <FormRow>
                        <FormGroup>
                          <Label>Tamaño de Lote</Label>
                          <Input
                            type="number"
                            name="markProcessedConfig.batchSize"
                            value={mapping.markProcessedConfig.batchSize}
                            onChange={handleChange}
                            placeholder="100"
                          />
                        </FormGroup>

                        <FormGroup>
                          <Label>Campo de Timestamp</Label>
                          <Input
                            type="text"
                            name="markProcessedConfig.timestampField"
                            value={mapping.markProcessedConfig.timestampField}
                            onChange={handleChange}
                            placeholder="LAST_PROCESSED_DATE"
                          />
                        </FormGroup>

                        <FormGroup>
                          <CheckboxGroup>
                            <Checkbox
                              type="checkbox"
                              name="markProcessedConfig.includeTimestamp"
                              checked={
                                mapping.markProcessedConfig.includeTimestamp
                              }
                              onChange={handleChange}
                            />
                            <CheckboxLabel>Incluir Timestamp</CheckboxLabel>
                          </CheckboxGroup>

                          <CheckboxGroup>
                            <Checkbox
                              type="checkbox"
                              name="markProcessedConfig.allowRollback"
                              checked={
                                mapping.markProcessedConfig.allowRollback
                              }
                              onChange={handleChange}
                            />
                            <CheckboxLabel>Permitir Rollback</CheckboxLabel>
                          </CheckboxGroup>
                        </FormGroup>
                      </FormRow>
                    )}
                  </CardBody>
                </Card>
              )}
            </Section>

            {/* Sección Consecutivos */}
            <Section>
              <SectionHeader>
                <h3>🔢 Configuración de Consecutivos</h3>
                <ToggleButton onClick={() => toggleSection("consecutives")}>
                  {expandedSections.consecutives ? (
                    <FaChevronUp />
                  ) : (
                    <FaChevronDown />
                  )}
                </ToggleButton>
              </SectionHeader>

              {expandedSections.consecutives && (
                <ConsecutiveConfigSection
                  mapping={mapping}
                  handleChange={handleChange}
                />
              )}
            </Section>

            {/* 🎁 Sección Bonificaciones */}
            <Section>
              <SectionHeader>
                <h3>🎁 Procesamiento de Bonificaciones</h3>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <SmallButton
                    type="button"
                    onClick={() => {
                      setMapping({
                        ...mapping,
                        hasBonificationProcessing:
                          !mapping.hasBonificationProcessing,
                        bonificationConfig: {
                          sourceTable: "FAC_DET_PED",
                          bonificationIndicatorField: "ART_BON",
                          bonificationIndicatorValue: "B",
                          regularArticleField: "COD_ART",
                          bonificationReferenceField: "COD_ART_RFR",
                          orderField: "NUM_PED",
                          lineNumberField: "PEDIDO_LINEA",
                          bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
                          quantityField: "CNT_MAX",
                          bonificationQuantityField: "CANTIDAD_BONIFICAD",
                          ...mapping.bonificationConfig,
                        },
                      });
                    }}
                  >
                    {mapping.hasBonificationProcessing
                      ? "🔴 Deshabilitar"
                      : "🟢 Habilitar"}
                  </SmallButton>

                  {mapping.hasBonificationProcessing && (
                    <>
                      <SmallButton onClick={validateBonifications}>
                        <FaCheck /> Validar
                      </SmallButton>
                      <SmallButton onClick={previewBonifications}>
                        <FaEye /> Preview
                      </SmallButton>
                    </>
                  )}

                  <ToggleButton onClick={() => toggleSection("bonifications")}>
                    {expandedSections.bonifications ? (
                      <FaChevronUp />
                    ) : (
                      <FaChevronDown />
                    )}
                  </ToggleButton>
                </div>
              </SectionHeader>

              {expandedSections.bonifications &&
                mapping.hasBonificationProcessing && (
                  <Card>
                    <CardHeader>
                      <h4>⚙️ Configuración de Bonificaciones</h4>
                    </CardHeader>
                    <CardBody>
                      <div
                        style={{
                          background: "#d1ecf1",
                          padding: "15px",
                          borderRadius: "8px",
                          marginBottom: "20px",
                        }}
                      >
                        <strong>ℹ️ Información:</strong> El sistema procesará
                        automáticamente las bonificaciones antes de insertar en
                        destino. Los artículos con <code>ART_BON = 'B'</code>{" "}
                        serán vinculados con sus artículos de referencia usando{" "}
                        <code>COD_ART_RFR</code>.
                      </div>

                      <FormRow>
                        <FormGroup>
                          <Label>Campo Indicador de Bonificación</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.bonificationIndicatorField"
                            value={
                              mapping.bonificationConfig
                                ?.bonificationIndicatorField || "ART_BON"
                            }
                            onChange={handleChange}
                            placeholder="ART_BON"
                          />
                        </FormGroup>
                        <FormGroup>
                          <Label>Valor de Bonificación</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.bonificationIndicatorValue"
                            value={
                              mapping.bonificationConfig
                                ?.bonificationIndicatorValue || "B"
                            }
                            onChange={handleChange}
                            placeholder="B"
                          />
                        </FormGroup>
                      </FormRow>

                      <FormRow>
                        <FormGroup>
                          <Label>Campo Artículo de Referencia</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.bonificationReferenceField"
                            value={
                              mapping.bonificationConfig
                                ?.bonificationReferenceField || "COD_ART_RFR"
                            }
                            onChange={handleChange}
                            placeholder="COD_ART_RFR"
                          />
                        </FormGroup>
                        <FormGroup>
                          <Label>Campo Cantidad (Origen)</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.quantityField"
                            value={
                              mapping.bonificationConfig?.quantityField ||
                              "CNT_MAX"
                            }
                            onChange={handleChange}
                            placeholder="CNT_MAX"
                          />
                        </FormGroup>
                      </FormRow>

                      <FormRow>
                        <FormGroup>
                          <Label>Campo Línea Destino</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.lineNumberField"
                            value={
                              mapping.bonificationConfig?.lineNumberField ||
                              "PEDIDO_LINEA"
                            }
                            onChange={handleChange}
                            placeholder="PEDIDO_LINEA"
                          />
                        </FormGroup>
                        <FormGroup>
                          <Label>Campo Referencia Bonificación</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.bonificationLineReferenceField"
                            value={
                              mapping.bonificationConfig
                                ?.bonificationLineReferenceField ||
                              "PEDIDO_LINEA_BONIF"
                            }
                            onChange={handleChange}
                            placeholder="PEDIDO_LINEA_BONIF"
                          />
                        </FormGroup>
                      </FormRow>

                      <FormRow>
                        <FormGroup>
                          <Label>Campo Cantidad Bonificada (Destino)</Label>
                          <Input
                            type="text"
                            name="bonificationConfig.bonificationQuantityField"
                            value={
                              mapping.bonificationConfig
                                ?.bonificationQuantityField ||
                              "CANTIDAD_BONIFICAD"
                            }
                            onChange={handleChange}
                            placeholder="CANTIDAD_BONIFICAD"
                          />
                          <small
                            style={{ color: "#6c757d", fontSize: "0.85rem" }}
                          >
                            Campo destino donde se guardará la cantidad de
                            bonificación (CNT_MAX)
                          </small>
                        </FormGroup>
                      </FormRow>
                    </CardBody>
                  </Card>
                )}
            </Section>

            {/* Sección Tipos de Documento */}
            <Section>
              <SectionHeader>
                <h3>📄 Tipos de Documento</h3>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <SmallButton onClick={addDocumentTypeRule}>
                    <FaPlus /> Añadir Regla
                  </SmallButton>
                  <ToggleButton onClick={() => toggleSection("documentTypes")}>
                    {expandedSections.documentTypes ? (
                      <FaChevronUp />
                    ) : (
                      <FaChevronDown />
                    )}
                  </ToggleButton>
                </div>
              </SectionHeader>

              {expandedSections.documentTypes && (
                <>
                  {mapping.documentTypeRules.length === 0 ? (
                    <EmptyMessage>
                      <h3>No hay reglas de tipos de documento</h3>
                      <p>
                        Las reglas permiten clasificar automáticamente los
                        documentos según criterios específicos
                      </p>
                    </EmptyMessage>
                  ) : (
                    mapping.documentTypeRules.map((rule, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <h4>{rule.name}</h4>
                          <div className="button_container">
                            <SmallButton
                              onClick={() => editDocumentTypeRule(index)}
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
                                <PropertyValue>
                                  {rule.description}
                                </PropertyValue>
                              </PropertyItem>
                            )}
                          </PropertyList>
                        </CardBody>
                      </Card>
                    ))
                  )}
                </>
              )}
            </Section>

            {/* Sección Foreign Keys */}
            <Section>
              <SectionHeader>
                <h3>🔗 Dependencias de Foreign Key</h3>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <SmallButton onClick={addForeignKeyDependency}>
                    <FaPlus /> Añadir Dependencia
                  </SmallButton>
                  <ToggleButton onClick={() => toggleSection("foreignKeys")}>
                    {expandedSections.foreignKeys ? (
                      <FaChevronUp />
                    ) : (
                      <FaChevronDown />
                    )}
                  </ToggleButton>
                </div>
              </SectionHeader>

              {expandedSections.foreignKeys && (
                <>
                  {mapping.foreignKeyDependencies.length === 0 ? (
                    <EmptyMessage>
                      <h3>No hay dependencias de foreign key</h3>
                      <p>
                        Las dependencias aseguran que los registros relacionados
                        existan antes de la inserción
                      </p>
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
                              <PropertyValue>
                                {dependency.fieldName}
                              </PropertyValue>
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
                                  <PropertyLabel>
                                    Campos mapeados:
                                  </PropertyLabel>
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
                </>
              )}
            </Section>
          </>
        )}

        {/* Pestaña Tablas y Campos */}
        {activeTab === "tables" && (
          <Section>
            <SectionHeader>
              <h3>📊 Configuración de Tablas</h3>
              <div
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <SmallButton onClick={addTableConfig}>
                  <FaPlus /> Añadir Tabla
                </SmallButton>
                <ToggleButton onClick={() => toggleSection("tables")}>
                  {expandedSections.tables ? (
                    <FaChevronUp />
                  ) : (
                    <FaChevronDown />
                  )}
                </ToggleButton>
              </div>
            </SectionHeader>

            {expandedSections.tables && (
              <>
                {mapping.tableConfigs.length === 0 ? (
                  <EmptyMessage>
                    <h3>No hay configuraciones de tablas</h3>
                    <p>
                      Configure al menos una tabla principal para comenzar el
                      mapeo
                    </p>
                    <small>
                      Las tablas principales procesan encabezados, las de
                      detalle procesan líneas relacionadas
                    </small>
                  </EmptyMessage>
                ) : (
                  mapping.tableConfigs.map((table, tableIndex) => (
                    <Card key={tableIndex} $isDetail={table.isDetailTable}>
                      <CardHeader>
                        <h4>
                          {table.isDetailTable ? "📋" : "📄"} {table.name}
                          <span
                            style={{
                              fontSize: "0.8rem",
                              marginLeft: "10px",
                              opacity: 0.7,
                            }}
                          >
                            ({table.isDetailTable ? "Detalle" : "Principal"})
                          </span>
                        </h4>
                        <div className="button_container">
                          <SmallButton
                            onClick={() => editTableConfig(tableIndex)}
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
                            <PropertyValue>{table.sourceTable}</PropertyValue>
                          </PropertyItem>
                          <PropertyItem>
                            <PropertyLabel>Tabla destino:</PropertyLabel>
                            <PropertyValue>{table.targetTable}</PropertyValue>
                          </PropertyItem>
                          <PropertyItem>
                            <PropertyLabel>
                              Clave primaria origen:
                            </PropertyLabel>
                            <PropertyValue>
                              {table.primaryKey || "NUM_PED"}
                            </PropertyValue>
                          </PropertyItem>
                          {table.targetPrimaryKey && (
                            <PropertyItem>
                              <PropertyLabel>
                                Clave primaria destino:
                              </PropertyLabel>
                              <PropertyValue>
                                {table.targetPrimaryKey}
                              </PropertyValue>
                            </PropertyItem>
                          )}
                          {table.parentTableRef && (
                            <PropertyItem>
                              <PropertyLabel>Tabla padre:</PropertyLabel>
                              <PropertyValue>
                                {table.parentTableRef}
                              </PropertyValue>
                            </PropertyItem>
                          )}
                          <PropertyItem>
                            <PropertyLabel>Orden de ejecución:</PropertyLabel>
                            <PropertyValue>
                              {table.executionOrder || 0}
                            </PropertyValue>
                          </PropertyItem>
                        </PropertyList>

                        <SubSection>
                          <SubSectionHeader>
                            <h5>
                              Mapeo de Campos (
                              {table.fieldMappings?.length || 0})
                            </h5>
                            <SmallButton
                              onClick={() => addFieldMapping(tableIndex)}
                            >
                              <FaPlus /> Añadir Campo
                            </SmallButton>
                          </SubSectionHeader>

                          {!table.fieldMappings ||
                          table.fieldMappings.length === 0 ? (
                            <EmptyMessage>
                              <p>No hay campos mapeados para esta tabla</p>
                            </EmptyMessage>
                          ) : (
                            <Table>
                              <thead>
                                <tr>
                                  <th>Campo Origen</th>
                                  <th>Campo Destino</th>
                                  <th>Valor por Defecto</th>
                                  <th>Función SQL</th>
                                  <th>Mapeos de Valor</th>
                                  <th>Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.fieldMappings.map(
                                  (field, fieldIndex) => (
                                    <tr key={fieldIndex}>
                                      <td>{field.sourceField || "-"}</td>
                                      <td>
                                        <strong>{field.targetField}</strong>
                                        {field.isRequired && (
                                          <span
                                            style={{
                                              color: "red",
                                              marginLeft: "5px",
                                            }}
                                          >
                                            *
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        {field.defaultValue
                                          ? String(field.defaultValue)
                                          : "-"}
                                      </td>
                                      <td>
                                        {field.isSqlFunction ? "Sí" : "No"}
                                      </td>
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
                                            editFieldMapping(
                                              tableIndex,
                                              fieldIndex
                                            )
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
              </>
            )}
          </Section>
        )}

        {/* 🟢 PESTAÑA BONIFICACIONES COMPLETA */}
        {activeTab === "bonifications" && (
          <Section>
            <SectionHeader>
              <h3>
                <FaGift /> Procesamiento de Bonificaciones
              </h3>
              {!mapping.hasBonificationProcessing ? (
                <SmallButton
                  onClick={() =>
                    setMapping({
                      ...mapping,
                      hasBonificationProcessing: true,
                      bonificationConfig: {
                        sourceTable: "FAC_DET_PED",
                        bonificationIndicatorField: "ART_BON",
                        bonificationIndicatorValue: "B",
                        regularArticleField: "COD_ART",
                        bonificationReferenceField: "COD_ART_RFR",
                        orderField: "NUM_PED",
                        lineNumberField: "PEDIDO_LINEA",
                        bonificationLineReferenceField: "PEDIDO_LINEA_BONIF",
                        quantityField: "CNT_MAX",
                        bonificationQuantityField: "CANTIDAD_BONIFICAD",
                        applyPromotionRules: false,
                        ...mapping.bonificationConfig,
                      },
                    })
                  }
                >
                  <FaPlus /> Habilitar Bonificaciones
                </SmallButton>
              ) : (
                <div style={{ display: "flex", gap: "10px" }}>
                  <SmallButton onClick={validateBonifications}>
                    <FaCheck /> Validar Configuración
                  </SmallButton>

                  {mappingId && (
                    <>
                      <SmallButton onClick={previewBonifications}>
                        <FaEye /> Preview
                      </SmallButton>
                    </>
                  )}

                  <SmallButton
                    $danger
                    onClick={() =>
                      setMapping({
                        ...mapping,
                        hasBonificationProcessing: false,
                      })
                    }
                  >
                    <FaTrash /> Deshabilitar
                  </SmallButton>
                </div>
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
                      <Label>Tabla de Origen</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.sourceTable"
                        value={
                          mapping.bonificationConfig?.sourceTable ||
                          "FAC_DET_PED"
                        }
                        onChange={handleChange}
                        placeholder="FAC_DET_PED"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo de Pedido/Orden</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.orderField"
                        value={
                          mapping.bonificationConfig?.orderField || "NUM_PED"
                        }
                        onChange={handleChange}
                        placeholder="NUM_PED"
                      />
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo Indicador de Bonificación</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationIndicatorField"
                        value={
                          mapping.bonificationConfig
                            ?.bonificationIndicatorField || "ART_BON"
                        }
                        onChange={handleChange}
                        placeholder="ART_BON"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>Valor de Bonificación</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationIndicatorValue"
                        value={
                          mapping.bonificationConfig
                            ?.bonificationIndicatorValue || "B"
                        }
                        onChange={handleChange}
                        placeholder="B"
                      />
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo Artículo Regular</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.regularArticleField"
                        value={
                          mapping.bonificationConfig?.regularArticleField ||
                          "COD_ART"
                        }
                        onChange={handleChange}
                        placeholder="COD_ART"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo Artículo de Referencia</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationReferenceField"
                        value={
                          mapping.bonificationConfig
                            ?.bonificationReferenceField || "COD_ART_RFR"
                        }
                        onChange={handleChange}
                        placeholder="COD_ART_RFR"
                      />
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo Cantidad (Origen)</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.quantityField"
                        value={
                          mapping.bonificationConfig?.quantityField || "CNT_MAX"
                        }
                        onChange={handleChange}
                        placeholder="CNT_MAX"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo Cantidad Bonificada (Destino)</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationQuantityField"
                        value={
                          mapping.bonificationConfig
                            ?.bonificationQuantityField || "CANTIDAD_BONIFICAD"
                        }
                        onChange={handleChange}
                        placeholder="CANTIDAD_BONIFICAD"
                      />
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo Línea Destino</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.lineNumberField"
                        value={
                          mapping.bonificationConfig?.lineNumberField ||
                          "PEDIDO_LINEA"
                        }
                        onChange={handleChange}
                        placeholder="PEDIDO_LINEA"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>Campo Referencia Bonificación</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationLineReferenceField"
                        value={
                          mapping.bonificationConfig
                            ?.bonificationLineReferenceField ||
                          "PEDIDO_LINEA_BONIF"
                        }
                        onChange={handleChange}
                        placeholder="PEDIDO_LINEA_BONIF"
                      />
                    </FormGroup>
                  </FormRow>
                </CardBody>
              </Card>
            ) : (
              <EmptyMessage>
                <FaGift size={48} />
                <h3>Procesamiento de Bonificaciones Deshabilitado</h3>
                <p>
                  Active el procesamiento de bonificaciones para configurar la
                  detección automática de ofertas y promociones en pedidos y
                  facturas.
                </p>
                <small>
                  El sistema identificará automáticamente artículos marcados
                  como bonificación (ART_BON = 'B') y los vinculará con sus
                  artículos de referencia.
                </small>
              </EmptyMessage>
            )}
          </Section>
        )}
      </TabContent>
    </Container>
  );
}

// Styled Components (mantener todos los estilos existentes)
const Container = styled.div`
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 2px solid ${(props) => props.theme?.border || "#dee2e6"};

  h2 {
    margin: 0;
    color: ${(props) => props.theme?.title || "#343a40"};
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;

  background: ${(props) =>
    props.$secondary
      ? props.theme?.border || "#6c757d"
      : props.theme?.primary || "#007bff"};
  color: ${(props) => (props.$secondary ? "#333" : "#fff")};

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const TabContainer = styled.div`
  display: flex;
  margin-bottom: 30px;
  border-bottom: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
`;

const Tab = styled.button`
  padding: 12px 20px;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  color: ${(props) =>
    props.$active
      ? props.theme?.primary || "#007bff"
      : props.theme?.textSecondary || "#6c757d"};
  font-weight: ${(props) => (props.$active ? "600" : "normal")};
  border-bottom-color: ${(props) =>
    props.$active ? props.theme?.primary || "#007bff" : "transparent"};
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.theme?.primary || "#007bff"};
  }

  display: flex;
  align-items: center;
  gap: 8px;
`;

const TabContent = styled.div``;

const Section = styled.div`
  margin-bottom: 30px;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 10px 0;

  h3 {
    margin: 0;
    color: ${(props) => props.theme?.title || "#343a40"};
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

// 🆕 Nuevo componente para el botón de toggle
const ToggleButton = styled.button`
  padding: 6px 8px;
  border: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  border-radius: 4px;
  background: ${(props) => props.theme?.cardBg || "#fff"};
  color: ${(props) => props.theme?.textSecondary || "#6c757d"};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${(props) => props.theme?.headerBg || "#f8f9fa"};
    color: ${(props) => props.theme?.primary || "#007bff"};
  }
`;

const SmallButton = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid
    ${(props) =>
      props.$danger ? "#dc3545" : props.theme?.primary || "#007bff"};
  border-radius: 4px;
  background: ${(props) =>
    props.$danger ? "#dc3545" : props.theme?.primary || "#007bff"};
  color: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const Label = styled.label`
  margin-bottom: 5px;
  font-weight: 500;
  color: ${(props) => props.theme?.title || "#343a40"};
  font-size: 0.9rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme?.border || "#ced4da"};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme?.text || "#495057"};
  background-color: ${(props) => props.theme?.inputBg || "#fff"};
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme?.primary || "#007bff"};
    box-shadow: 0 0 0 2px
      ${(props) => (props.theme?.primary || "#007bff") + "20"};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme?.border || "#ced4da"};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme?.text || "#495057"};
  background-color: ${(props) => props.theme?.inputBg || "#fff"};
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme?.primary || "#007bff"};
    box-shadow: 0 0 0 2px
      ${(props) => (props.theme?.primary || "#007bff") + "20"};
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
  color: ${(props) => props.theme?.text || "#495057"};
`;

const Card = styled.div`
  margin-bottom: 20px;
  border: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  border-left: 4px solid
    ${(props) =>
      props.$isDetail
        ? props.theme?.secondary || "#6c757d"
        : props.theme?.primary || "#007bff"};
  border-radius: 6px;
  overflow: hidden;
  background: ${(props) => props.theme?.cardBg || "#fff"};
`;

const CardHeader = styled.div`
  padding: 15px;
  background: ${(props) => props.theme?.headerBg || "#f8f9fa"};
  border-bottom: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  display: flex;
  justify-content: space-between;
  align-items: center;

  h4 {
    margin: 0;
    color: ${(props) => props.theme?.title || "#343a40"};
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
  color: ${(props) => props.theme?.textSecondary || "#6c757d"};
  margin-bottom: 2px;
`;

const PropertyValue = styled.span`
  font-weight: 500;
  color: ${(props) => props.theme?.text || "#495057"};
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
    color: ${(props) => props.theme?.title || "#343a40"};
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
    border-bottom: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  }

  th {
    background: ${(props) => props.theme?.headerBg || "#f8f9fa"};
    font-weight: 500;
    color: ${(props) => props.theme?.title || "#343a40"};
    font-size: 0.9rem;
  }

  td {
    color: ${(props) => props.theme?.text || "#495057"};
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
  color: ${(props) => props.theme?.textSecondary || "#6c757d"};

  h3 {
    margin: 10px 0;
    color: ${(props) => props.theme?.title || "#343a40"};
  }

  p {
    margin: 0;
    max-width: 400px;
    margin: 0 auto;
    line-height: 1.5;
  }

  small {
    display: block;
    margin-top: 10px;
    font-size: 0.8rem;
    color: ${(props) => props.theme?.textSecondary || "#6c757d"};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: ${(props) => props.theme?.textSecondary || "#6c757d"};
`;
