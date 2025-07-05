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
    foreignKeyDependencies: [],
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

    // Verificar que todos los campos tienen las propiedades de visualización necesarias
    const mappingCopy = JSON.parse(JSON.stringify(mapping));

    // Verificar y corregir propiedades faltantes para cada campo en cada tabla
    mappingCopy.tableConfigs.forEach((tableConfig) => {
      if (tableConfig.fieldMappings) {
        tableConfig.fieldMappings.forEach((field) => {
          // Asegurarse de que existen todas las propiedades de visualización
          field.isEditable = field.isEditable !== false; // true por defecto
          field.showInList = field.showInList === true; // false por defecto
          field.displayName = field.displayName || null;
          field.displayOrder = field.displayOrder || 0;
          field.fieldGroup = field.fieldGroup || null;
          field.fieldType = field.fieldType || "text";

          // Mantener las options solo si fieldType es select
          if (field.fieldType === "select") {
            field.options = field.options || [];
          } else {
            field.options = null;
          }
        });
      }
    });

    // Log para depuración
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

        <!-- NUEVA SECCIÓN: Configuración de conversión de unidades -->
        <div class="unit-conversion-section">
          <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Conversión de Unidades</h4>

          <div class="form-check">
            <input type="checkbox" id="enableUnitConversion" class="swal2-checkbox">
            <label for="enableUnitConversion"><strong>¿Habilitar conversión de unidades?</strong></label>
            <small style="display: block; margin-top: 5px;">Convierte automáticamente entre diferentes unidades de medida (ej: Cajas a Unidades)</small>
          </div>

          <div id="unitConversionConfig" class="unit-conversion-config" style="display: none; margin-top: 15px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
            <div style="display: flex; flex-wrap: wrap; gap: 15px;">
              <div class="form-group" style="flex: 1 1 200px;">
                <label for="unitMeasureField">Campo Unidad de Medida</label>
                <input id="unitMeasureField" class="swal2-input" value="Unit_Measure" placeholder="Ej: Unit_Measure">
                <small>Campo que indica la unidad actual del producto</small>
              </div>

              <div class="form-group" style="flex: 1 1 200px;">
                <label for="conversionFactorField">Campo Factor de Conversión</label>
                <input id="conversionFactorField" class="swal2-input" value="Factor_Conversion" placeholder="Ej: Factor_Conversion">
                <small>Campo que contiene el factor numérico para la conversión</small>
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;">
              <div class="form-group" style="flex: 1 1 200px;">
                <label for="fromUnit">Unidad Origen (convertir desde)</label>
                <input id="fromUnit" class="swal2-input" value="Caja" placeholder="Ej: Caja, CJA">
                <small>Unidad que requiere conversión</small>
              </div>

              <div class="form-group" style="flex: 1 1 200px;">
                <label for="toUnit">Unidad Destino (convertir a)</label>
                <input id="toUnit" class="swal2-input" value="Und" placeholder="Ej: Und, Unidad">
                <small>Unidad final después de la conversión</small>
              </div>
            </div>

            <div class="form-group" style="margin-top: 15px;">
              <label for="conversionOperation">Operación de Conversión</label>
              <select id="conversionOperation" class="swal2-select">
                <option value="multiply">Multiplicar (para cantidades: cajas × factor = unidades)</option>
                <option value="divide">Dividir (para precios: precio_caja ÷ factor = precio_unitario)</option>
              </select>
              <small style="display: block; margin-top: 5px;">
                <strong>Ejemplo:</strong><br>
                • Cantidad: 10 Cajas × 144 = 1440 Unidades<br>
                • Precio: $1000 por Caja ÷ 144 = $6.94 por Unidad
              </small>
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

        <!-- NUEVA SECCIÓN: Opciones de visualización -->
        <div class="display-options-section">
          <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Opciones de visualización</h4>

          <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px;">
            <div class="form-check" style="flex: 1 1 200px;">
              <input type="checkbox" id="isEditable" class="swal2-checkbox" checked>
              <label for="isEditable"><strong>¿Permitir edición?</strong></label>
              <small style="display: block; margin-top: 5px;">Si está marcado, este campo podrá editarse en formularios.</small>
            </div>

            <div class="form-check" style="flex: 1 1 200px;">
              <input type="checkbox" id="showInList" class="swal2-checkbox">
              <label for="showInList"><strong>¿Mostrar en listas?</strong></label>
              <small style="display: block; margin-top: 5px;">Si está marcado, este campo aparecerá en vistas de lista.</small>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
            <div class="form-group" style="flex: 1 1 200px;">
              <label for="displayName">Nombre para mostrar</label>
              <input id="displayName" class="swal2-input" placeholder="Ej: Código de Cliente">
              <small style="display: block; margin-top: 5px;">Nombre amigable para mostrar en la interfaz.</small>
            </div>

            <div class="form-group" style="flex: 1 1 200px;">
              <label for="displayOrder">Orden de visualización</label>
              <input id="displayOrder" type="number" class="swal2-input" value="0" placeholder="0">
              <small style="display: block; margin-top: 5px;">Posición de este campo en listas y formularios (menor = primero).</small>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
            <div class="form-group" style="flex: 1 1 200px;">
              <label for="fieldGroup">Grupo de campos</label>
              <input id="fieldGroup" class="swal2-input" placeholder="Ej: Información General">
              <small style="display: block; margin-top: 5px;">Grupo donde aparecerá en formularios de edición.</small>
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
              <small style="display: block; margin-top: 5px;">Tipo de entrada para formularios.</small>
            </div>
          </div>

          <!-- Opciones para tipo "select" -->
          <div id="selectOptionsContainer" style="margin-top: 15px; display: none;">
            <label>Opciones para lista desplegable</label>
            <div id="optionsContainer">
              <div class="option-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                <input type="text" class="swal2-input option-label" placeholder="Etiqueta" style="flex: 1;">
                <input type="text" class="swal2-input option-value" placeholder="Valor" style="flex: 1;">
                <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
              </div>
            </div>
            <button type="button" id="addOption" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 5px 10px; margin-top: 10px;">+ Añadir Opción</button>
          </div>
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

        // NUEVO: Control de conversión de unidades
        const enableConversionCheckbox = document.getElementById(
          "enableUnitConversion"
        );
        const conversionConfigDiv = document.getElementById(
          "unitConversionConfig"
        );

        // Selector de tipo de campo
        const fieldTypeSelect = document.getElementById("fieldType");
        const selectOptionsContainer = document.getElementById(
          "selectOptionsContainer"
        );

        // Función para actualizar la UI según selección
        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;

          // Mostrar/ocultar secciones según corresponda
          lookupSection.style.display = isLookup ? "block" : "none";
          defaultValueSection.style.display = isLookup ? "none" : "block";

          // Actualizar mostrar/ocultar opciones de select
          selectOptionsContainer.style.display =
            fieldTypeSelect.value === "select" ? "block" : "none";

          // NUEVO: Mostrar/ocultar configuración de conversión
          conversionConfigDiv.style.display = enableConversionCheckbox.checked
            ? "block"
            : "none";
        };

        // Asignar eventos
        lookupFromTargetCheckbox.addEventListener("change", updateUI);
        fieldTypeSelect.addEventListener("change", updateUI);
        enableConversionCheckbox.addEventListener("change", updateUI); // NUEVO

        // Inicializar UI
        updateUI();

        // Manejar botón para añadir opciones
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

          // Añadir evento para eliminar
          optionRow
            .querySelector(".btn-remove-option")
            .addEventListener("click", () => {
              optionRow.remove();
            });
        });

        // Añadir eventos a los botones de eliminar existentes
        document.querySelectorAll(".btn-remove-option").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest(".option-row").remove();
          });
        });

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
          <button type="button" class="btn-remove-param" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">
            ✕
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
        // Recopilar valores de los campos
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

        // NUEVO: Valores para conversión de unidades
        const enableUnitConversion = document.getElementById(
          "enableUnitConversion"
        ).checked;

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

        // Validar que tengamos origen de datos (source, lookup, conversion o valor default)
        if (
          !sourceField &&
          !lookupFromTarget &&
          !enableUnitConversion &&
          !defaultValue &&
          isRequired
        ) {
          Swal.showValidationMessage(
            "Los campos obligatorios deben tener un origen de datos (campo origen, consulta, conversión o valor por defecto)"
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

        // Recopilar opciones para tipo "select"
        const options = [];
        if (fieldType === "select") {
          document.querySelectorAll(".option-row").forEach((row) => {
            const label = row.querySelector(".option-label").value.trim();
            const value = row.querySelector(".option-value").value.trim();

            if (label || value) {
              options.push({ label, value });
            }
          });
        }

        // Propiedades de lookup
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false;

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

            if (paramName && paramSourceField) {
              lookupParams.push({ paramName, sourceField: paramSourceField });
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

        // NUEVO: Propiedades de conversión de unidades
        let unitConversion = { enabled: false };

        if (enableUnitConversion) {
          const unitMeasureField = document
            .getElementById("unitMeasureField")
            .value.trim();
          const conversionFactorField = document
            .getElementById("conversionFactorField")
            .value.trim();
          const fromUnit = document.getElementById("fromUnit").value.trim();
          const toUnit = document.getElementById("toUnit").value.trim();
          const operation = document.getElementById(
            "conversionOperation"
          ).value;

          // Validar campos requeridos para conversión
          if (
            !unitMeasureField ||
            !conversionFactorField ||
            !fromUnit ||
            !toUnit
          ) {
            Swal.showValidationMessage(
              "Para habilitar conversión de unidades, todos los campos son obligatorios"
            );
            return false;
          }

          unitConversion = {
            enabled: true,
            unitMeasureField,
            conversionFactorField,
            fromUnit,
            toUnit,
            operation,
          };
        }

        // Crear objeto completo con todas las propiedades
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

          // NUEVO: Propiedades de conversión de unidades
          unitConversion,

          // Propiedades de visualización
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
        // Agregar log para depuración
        console.log("Nuevo campo a agregar:", result.value);

        // Verificar que el objeto result.value tiene todas las propiedades
        const expectedProps = [
          "sourceField",
          "targetField",
          "defaultValue",
          "removePrefix",
          "isRequired",
          "valueMappings",
          "lookupFromTarget",
          "lookupQuery",
          "lookupParams",
          "validateExistence",
          "failIfNotFound",
          "unitConversion", // NUEVO
          "isEditable",
          "showInList",
          "displayName",
          "displayOrder",
          "fieldGroup",
          "fieldType",
          "options",
        ];

        const missingProps = expectedProps.filter(
          (prop) => result.value[prop] === undefined
        );
        if (missingProps.length > 0) {
          console.warn("Propiedades faltantes en el campo:", missingProps);
        }

        // Crear copia profunda de las tablas para evitar referencias mutables
        const newTableConfigs = JSON.parse(
          JSON.stringify(mapping.tableConfigs)
        );

        // Asegurarse de que fieldMappings existe en esta tabla
        if (!newTableConfigs[tableIndex].fieldMappings) {
          newTableConfigs[tableIndex].fieldMappings = [];
        }

        // Añadir el nuevo campo asegurándonos de que todas las propiedades están presentes
        newTableConfigs[tableIndex].fieldMappings.push(result.value);

        // Actualizar el estado con la nueva configuración
        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });

        // Log del nuevo estado para verificar
        console.log("Tabla actualizada:", newTableConfigs[tableIndex]);
      }
    });
  };

  // Función editFieldMapping completa
  const editFieldMapping = (tableIndex, fieldIndex) => {
    const field = mapping.tableConfigs[tableIndex].fieldMappings[fieldIndex];

    // Verificar que el campo existe y tiene todas las propiedades necesarias
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

       <!-- NUEVA SECCIÓN: Configuración de conversión de unidades -->
       <div class="unit-conversion-section">
         <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Conversión de Unidades</h4>

         <div class="form-check">
           <input type="checkbox" id="enableUnitConversion" class="swal2-checkbox" ${
             field.unitConversion?.enabled ? "checked" : ""
           }>
           <label for="enableUnitConversion"><strong>¿Habilitar conversión de unidades?</strong></label>
           <small style="display: block; margin-top: 5px;">Convierte automáticamente entre diferentes unidades de medida (ej: Cajas a Unidades)</small>
         </div>

         <div id="unitConversionConfig" class="unit-conversion-config" style="display: ${
           field.unitConversion?.enabled ? "block" : "none"
         }; margin-top: 15px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
           <div style="display: flex; flex-wrap: wrap; gap: 15px;">
             <div class="form-group" style="flex: 1 1 200px;">
               <label for="unitMeasureField">Campo Unidad de Medida</label>
               <input id="unitMeasureField" class="swal2-input" value="${
                 field.unitConversion?.unitMeasureField || "Unit_Measure"
               }" placeholder="Ej: Unit_Measure">
               <small>Campo que indica la unidad actual del producto</small>
             </div>

             <div class="form-group" style="flex: 1 1 200px;">
               <label for="conversionFactorField">Campo Factor de Conversión</label>
               <input id="conversionFactorField" class="swal2-input" value="${
                 field.unitConversion?.conversionFactorField ||
                 "Factor_Conversion"
               }" placeholder="Ej: Factor_Conversion">
               <small>Campo que contiene el factor numérico para la conversión</small>
             </div>
           </div>

           <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;">
             <div class="form-group" style="flex: 1 1 200px;">
               <label for="fromUnit">Unidad Origen (convertir desde)</label>
               <input id="fromUnit" class="swal2-input" value="${
                 field.unitConversion?.fromUnit || "Caja"
               }" placeholder="Ej: Caja, CJA">
               <small>Unidad que requiere conversión</small>
             </div>

             <div class="form-group" style="flex: 1 1 200px;">
               <label for="toUnit">Unidad Destino (convertir a)</label>
               <input id="toUnit" class="swal2-input" value="${
                 field.unitConversion?.toUnit || "Und"
               }" placeholder="Ej: Und, Unidad">
               <small>Unidad final después de la conversión</small>
             </div>
           </div>

           <div class="form-group" style="margin-top: 15px;">
             <label for="conversionOperation">Operación de Conversión</label>
             <select id="conversionOperation" class="swal2-select">
               <option value="multiply" ${
                 field.unitConversion?.operation === "multiply"
                   ? "selected"
                   : ""
               }>Multiplicar (para cantidades: cajas × factor = unidades)</option>
               <option value="divide" ${
                 field.unitConversion?.operation === "divide" ? "selected" : ""
               }>Dividir (para precios: precio_caja ÷ factor = precio_unitario)</option>
             </select>
             <small style="display: block; margin-top: 5px;">
               <strong>Ejemplo:</strong><br>
               • Cantidad: 10 Cajas × 144 = 1440 Unidades<br>
               • Precio: $1000 por Caja ÷ 144 = $6.94 por Unidad
             </small>
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

       <!-- SECCIÓN: Opciones de visualización -->
       <div class="display-options-section">
         <h4 style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">Opciones de visualización</h4>

         <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px;">
           <div class="form-check" style="flex: 1 1 200px;">
             <input type="checkbox" id="isEditable" class="swal2-checkbox" ${
               field.isEditable !== false ? "checked" : ""
             }>
             <label for="isEditable"><strong>¿Permitir edición?</strong></label>
             <small style="display: block; margin-top: 5px;">Si está marcado, este campo podrá editarse en formularios.</small>
           </div>

           <div class="form-check" style="flex: 1 1 200px;">
             <input type="checkbox" id="showInList" class="swal2-checkbox" ${
               field.showInList ? "checked" : ""
             }>
             <label for="showInList"><strong>¿Mostrar en listas?</strong></label>
             <small style="display: block; margin-top: 5px;">Si está marcado, este campo aparecerá en vistas de lista.</small>
           </div>
         </div>

         <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
           <div class="form-group" style="flex: 1 1 200px;">
             <label for="displayName">Nombre para mostrar</label>
             <input id="displayName" class="swal2-input" value="${
               field.displayName || ""
             }" placeholder="Ej: Código de Cliente">
             <small style="display: block; margin-top: 5px;">Nombre amigable para mostrar en la interfaz.</small>
           </div>

           <div class="form-group" style="flex: 1 1 200px;">
             <label for="displayOrder">Orden de visualización</label>
             <input id="displayOrder" type="number" class="swal2-input" value="${
               field.displayOrder || 0
             }" placeholder="0">
             <small style="display: block; margin-top: 5px;">Posición de este campo en listas y formularios (menor = primero).</small>
           </div>
         </div>

         <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px;">
           <div class="form-group" style="flex: 1 1 200px;">
             <label for="fieldGroup">Grupo de campos</label>
             <input id="fieldGroup" class="swal2-input" value="${
               field.fieldGroup || ""
             }" placeholder="Ej: Información General">
             <small style="display: block; margin-top: 5px;">Grupo donde aparecerá en formularios de edición.</small>
           </div>

           <div class="form-group" style="flex: 1 1 200px;">
             <label for="fieldType">Tipo de campo</label>
             <select id="fieldType" class="swal2-select">
               <option value="text" ${
                 !field.fieldType || field.fieldType === "text"
                   ? "selected"
                   : ""
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
             <small style="display: block; margin-top: 5px;">Tipo de entrada para formularios.</small>
           </div>
         </div>

         <!-- Opciones para tipo "select" -->
         <div id="selectOptionsContainer" style="margin-top: 15px; display: ${
           field.fieldType === "select" ? "block" : "none"
         };">
           <label>Opciones para lista desplegable</label>
           <div id="optionsContainer">
             ${
               (field.options || [])
                 .map(
                   (option, idx) => `
                 <div class="option-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                   <input type="text" class="swal2-input option-label" placeholder="Etiqueta" value="${
                     option.label || ""
                   }" style="flex: 1;">
                   <input type="text" class="swal2-input option-value" placeholder="Valor" value="${
                     option.value || ""
                   }" style="flex: 1;">
                   <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
                 </div>
               `
                 )
                 .join("") ||
               `
                 <div class="option-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                   <input type="text" class="swal2-input option-label" placeholder="Etiqueta" style="flex: 1;">
                   <input type="text" class="swal2-input option-value" placeholder="Valor" style="flex: 1;">
                   <button type="button" class="btn-remove-option" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">✕</button>
                 </div>
               `
             }
           </div>
           <button type="button" id="addOption" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 5px 10px; margin-top: 10px;">+ Añadir Opción</button>
         </div>
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

        // NUEVO: Control de conversión de unidades
        const enableConversionCheckbox = document.getElementById(
          "enableUnitConversion"
        );
        const conversionConfigDiv = document.getElementById(
          "unitConversionConfig"
        );

        // Selector de tipo de campo
        const fieldTypeSelect = document.getElementById("fieldType");
        const selectOptionsContainer = document.getElementById(
          "selectOptionsContainer"
        );

        // Función para actualizar la UI según selección
        const updateUI = () => {
          const isLookup = lookupFromTargetCheckbox.checked;

          // Mostrar/ocultar secciones según corresponda
          if (lookupSection) {
            lookupSection.style.display = isLookup ? "block" : "none";
          }
          defaultValueSection.style.display = isLookup ? "none" : "block";

          // Actualizar mostrar/ocultar opciones de select
          selectOptionsContainer.style.display =
            fieldTypeSelect.value === "select" ? "block" : "none";

          // NUEVO: Mostrar/ocultar configuración de conversión
          conversionConfigDiv.style.display = enableConversionCheckbox.checked
            ? "block"
            : "none";
        };

        // Asignar eventos
        lookupFromTargetCheckbox.addEventListener("change", updateUI);
        fieldTypeSelect.addEventListener("change", updateUI);
        enableConversionCheckbox.addEventListener("change", updateUI); // NUEVO

        // Inicializar UI
        updateUI();

        // Manejar botón para añadir opciones
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

          // Añadir evento para eliminar
          optionRow
            .querySelector(".btn-remove-option")
            .addEventListener("click", () => {
              optionRow.remove();
            });
        });

        // Añadir eventos a los botones de eliminar existentes
        document.querySelectorAll(".btn-remove-option").forEach((btn) => {
          btn.addEventListener("click", () => {
            btn.closest(".option-row").remove();
          });
        });

        // Manejar parámetros de consulta
        const addLookupParamButton = document.getElementById("addLookupParam");
        if (addLookupParamButton) {
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
           <button type="button" class="btn-remove-param" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 0 10px;">
             ✕
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

          // Añadir eventos a los botones de eliminar existentes
          document.querySelectorAll(".btn-remove-param").forEach((btn) => {
            btn.addEventListener("click", () => {
              btn.closest(".lookup-param-row").remove();
            });
          });

          // Añadir un parámetro inicial si no hay parámetros y está en modo lookup
          if (
            lookupFromTargetCheckbox.checked &&
            lookupParamsContainer.children.length === 0
          ) {
            addLookupParamRow();
          }
        }
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
        const lookupFromTarget =
          document.getElementById("lookupFromTarget").checked;

        // NUEVO: Recopilar configuración de conversión
        const enableUnitConversion = document.getElementById(
          "enableUnitConversion"
        ).checked;

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

        // Validar que los campos obligatorios tengan origen de datos
        if (
          !sourceField &&
          !lookupFromTarget &&
          !enableUnitConversion &&
          !defaultValue &&
          isRequired
        ) {
          Swal.showValidationMessage(
            "Los campos obligatorios deben tener un origen de datos (campo origen, consulta, conversión o valor por defecto)"
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

        // Recopilar opciones para tipo "select"
        const options = [];
        if (fieldType === "select") {
          document.querySelectorAll(".option-row").forEach((row) => {
            const label = row.querySelector(".option-label").value.trim();
            const value = row.querySelector(".option-value").value.trim();

            if (label || value) {
              options.push({ label, value });
            }
          });
        }

        // Propiedades de lookup
        let lookupQuery = "";
        let lookupParams = [];
        let validateExistence = false;
        let failIfNotFound = false;

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

            if (paramName && paramSourceField) {
              lookupParams.push({ paramName, sourceField: paramSourceField });
            }
          });

          // Validar consulta
          if (!lookupQuery && lookupFromTarget) {
            Swal.showValidationMessage(
              "Debe proporcionar una consulta SQL para el lookup"
            );
            return false;
          }

          // Validar parámetros
          if (
            lookupQuery &&
            lookupQuery.includes("@") &&
            lookupParams.length === 0
          ) {
            Swal.showValidationMessage(
              "La consulta usa parámetros pero no se han definido"
            );
            return false;
          }
        }

        // NUEVO: Recopilar configuración de conversión de unidades
        let unitConversion = field.unitConversion || { enabled: false };

        if (enableUnitConversion) {
          const unitMeasureField = document
            .getElementById("unitMeasureField")
            .value.trim();
          const conversionFactorField = document
            .getElementById("conversionFactorField")
            .value.trim();
          const fromUnit = document.getElementById("fromUnit").value.trim();
          const toUnit = document.getElementById("toUnit").value.trim();
          const operation = document.getElementById(
            "conversionOperation"
          ).value;

          // Validar campos requeridos para conversión
          if (
            !unitMeasureField ||
            !conversionFactorField ||
            !fromUnit ||
            !toUnit
          ) {
            Swal.showValidationMessage(
              "Todos los campos de conversión son obligatorios"
            );
            return false;
          }

          unitConversion = {
            enabled: true,
            unitMeasureField,
            conversionFactorField,
            fromUnit,
            toUnit,
            operation,
          };
        } else {
          unitConversion = { enabled: false };
        }

        // Objeto final con todos los valores
        const updatedField = {
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

          // NUEVO: Propiedades de conversión de unidades
          unitConversion,

          // Propiedades de visualización
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
        // Agregar log para depuración
        console.log("Campo actualizado:", result.value);

        // Verificar que el objeto result.value tiene todas las propiedades
        const expectedProps = [
          "sourceField",
          "targetField",
          "defaultValue",
          "removePrefix",
          "isRequired",
          "valueMappings",
          "lookupFromTarget",
          "lookupQuery",
          "lookupParams",
          "validateExistence",
          "failIfNotFound",
          "unitConversion", // NUEVO
          "isEditable",
          "showInList",
          "displayName",
          "displayOrder",
          "fieldGroup",
          "fieldType",
          "options",
        ];

        const missingProps = expectedProps.filter(
          (prop) => result.value[prop] === undefined
        );
        if (missingProps.length > 0) {
          console.warn(
            "⚠️ Propiedades faltantes en el campo actualizado:",
            missingProps
          );
        }

        // Crear copia profunda de las tablas para evitar referencias mutables
        const newTableConfigs = JSON.parse(
          JSON.stringify(mapping.tableConfigs)
        );

        // Actualizar el campo con el objeto completo result.value
        newTableConfigs[tableIndex].fieldMappings[fieldIndex] = result.value;

        // Actualizar el estado del mapping con las configuraciones actualizadas
        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });

        // Log del nuevo estado para verificar
        console.log(
          "Campo después de la actualización:",
          newTableConfigs[tableIndex].fieldMappings[fieldIndex]
        );
      }
    });
  };

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
              <label><input type="checkbox" class="is-key-checkbox"> Es clave</label>
              <button type="button" class="btn-remove-field">✕</button>
            </div>
          </div>
          <button type="button" id="addDependentField">+ Añadir Campo</button>
        </div>
      </div>
    `,
      width: 800,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Manejar añadir/quitar campos
        document
          .getElementById("addDependentField")
          .addEventListener("click", () => {
            const container = document.getElementById(
              "dependentFieldsContainer"
            );
            const newRow = document.createElement("div");
            newRow.className = "dependent-field-row";
            newRow.innerHTML = `
          <input type="text" class="swal2-input source-field" placeholder="Campo origen (opcional)">
          <input type="text" class="swal2-input target-field" placeholder="Campo destino" required>
          <input type="text" class="swal2-input default-value" placeholder="Valor por defecto">
          <label><input type="checkbox" class="is-key-checkbox"> Es clave</label>
          <button type="button" class="btn-remove-field">✕</button>
        `;
            container.appendChild(newRow);

            newRow
              .querySelector(".btn-remove-field")
              .addEventListener("click", () => {
                newRow.remove();
              });
          });

        // Manejar quitar campos existentes
        document.querySelectorAll(".btn-remove-field").forEach((btn) => {
          btn.addEventListener("click", () =>
            btn.closest(".dependent-field-row").remove()
          );
        });
      },
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
            "Campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        // Recopilar campos dependientes
        const dependentFields = [];
        document.querySelectorAll(".dependent-field-row").forEach((row) => {
          const sourceField = row.querySelector(".source-field").value.trim();
          const targetField = row.querySelector(".target-field").value.trim();
          const defaultValue = row.querySelector(".default-value").value.trim();
          const isKey = row.querySelector(".is-key-checkbox").checked;

          if (targetField) {
            dependentFields.push({
              sourceField: sourceField || null,
              targetField,
              defaultValue: defaultValue || undefined,
              isKey,
            });
          }
        });

        if (dependentFields.length === 0) {
          Swal.showValidationMessage(
            "Debe definir al menos un campo para la tabla dependiente"
          );
          return false;
        }

        if (!dependentFields.some((f) => f.isKey)) {
          Swal.showValidationMessage(
            "Debe marcar al menos un campo como clave"
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

        <div class="dependent-fields-section">
          <h4>Campos a insertar/validar</h4>
          <div id="dependentFieldsContainer">
            ${dependency.dependentFields
              .map(
                (field) => `
              <div class="dependent-field-row">
                <input type="text" class="swal2-input source-field" value="${
                  field.sourceField || ""
                }" placeholder="Campo origen" style="width: 30%;">
                <input type="text" class="swal2-input target-field" value="${
                  field.targetField
                }" placeholder="Campo destino" style="width: 30%;">
                <input type="text" class="swal2-input default-value" value="${
                  field.defaultValue || ""
                }" placeholder="Valor por defecto" style="width: 25%;">
                <div class="checkbox-container" style="width: 10%;">
                  <input type="checkbox" class="is-key-checkbox" ${
                    field.isKey ? "checked" : ""
                  }>
                  <label>Clave</label>
                </div>
                <button type="button" class="btn-remove-field" style="width: 5%; background: #dc3545; color: white; border: none; border-radius: 4px;">✕</button>
              </div>
            `
              )
              .join("")}
          </div>
          <button type="button" id="addDependentField" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 5px 10px; margin-top: 10px;">+ Añadir Campo</button>
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      width: 800,
      didOpen: () => {
        // Manejar eventos (mismo código que en addForeignKeyDependency)
        const addFieldBtn = document.getElementById("addDependentField");
        const fieldsContainer = document.getElementById(
          "dependentFieldsContainer"
        );

        // Añadir campo dependiente
        addFieldBtn.addEventListener("click", () => {
          const fieldRow = document.createElement("div");
          fieldRow.className = "dependent-field-row";
          fieldRow.innerHTML = `
          <input type="text" class="swal2-input source-field" placeholder="Campo origen" style="width: 30%;">
          <input type="text" class="swal2-input target-field" placeholder="Campo destino" style="width: 30%;">
          <input type="text" class="swal2-input default-value" placeholder="Valor por defecto" style="width: 25%;">
          <div class="checkbox-container" style="width: 10%;">
            <input type="checkbox" class="is-key-checkbox">
            <label>Clave</label>
          </div>
          <button type="button" class="btn-remove-field" style="width: 5%; background: #dc3545; color: white; border: none; border-radius: 4px;">✕</button>
        `;

          fieldsContainer.appendChild(fieldRow);

          // Añadir evento para eliminar
          fieldRow
            .querySelector(".btn-remove-field")
            .addEventListener("click", () => {
              fieldRow.remove();
            });
        });

        // Eventos para eliminar campos existentes
        document.querySelectorAll(".btn-remove-field").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.target.closest(".dependent-field-row").remove();
          });
        });
      },
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
            "Campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        // Recopilar campos dependientes
        const dependentFields = [];
        document.querySelectorAll(".dependent-field-row").forEach((row) => {
          const sourceField = row.querySelector(".source-field").value.trim();
          const targetField = row.querySelector(".target-field").value.trim();
          const defaultValue = row.querySelector(".default-value").value.trim();
          const isKey = row.querySelector(".is-key-checkbox").checked;

          if (targetField) {
            dependentFields.push({
              sourceField: sourceField || null,
              targetField,
              defaultValue: defaultValue || undefined,
              isKey,
            });
          }
        });

        if (dependentFields.length === 0) {
          Swal.showValidationMessage(
            "Debe definir al menos un campo dependiente"
          );
          return false;
        }

        const hasKey = dependentFields.some((f) => f.isKey);
        if (!hasKey) {
          Swal.showValidationMessage(
            "Debe marcar al menos un campo como clave"
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
    const newDependencies = [...(mapping.foreignKeyDependencies || [])];
    newDependencies.splice(index, 1);
    setMapping({
      ...mapping,
      foreignKeyDependencies: newDependencies,
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

            {/* Campo: Tipo de Entidad */}
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

            {/* NUEVA SECCIÓN: Estrategia de Marcado */}
            <FormGroup>
              <Label>Estrategia de Marcado</Label>
              <Select
                name="markProcessedStrategy"
                value={mapping.markProcessedStrategy || "individual"}
                onChange={handleChange}
              >
                <option value="individual">
                  Individual (marcar inmediatamente)
                </option>
                <option value="batch">En Lotes (marcar al final)</option>
                <option value="none">No Marcar</option>
              </Select>
              <small
                style={{
                  color: "#666",
                  fontSize: "12px",
                  marginTop: "4px",
                  display: "block",
                  lineHeight: "1.4",
                }}
              >
                <strong>Individual:</strong> Marca cada documento inmediatamente
                después de procesarlo.
                <br />
                <strong>Lotes:</strong> Marca todos los documentos exitosos al
                final del procesamiento.
                <br />
                <strong>Ninguno:</strong> No marca documentos (útil para
                pruebas).
              </small>
            </FormGroup>

            {/* NUEVA SECCIÓN: Configuración Avanzada de Marcado */}
            {(mapping.markProcessedStrategy === "batch" ||
              mapping.markProcessedStrategy === "individual") && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "20px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "8px",
                  border: "1px solid #dee2e6",
                  borderLeft: "4px solid #007bff",
                }}
              >
                <h4
                  style={{
                    marginTop: "0",
                    marginBottom: "15px",
                    color: "#495057",
                    fontSize: "1.1rem",
                    fontWeight: "600",
                    paddingBottom: "8px",
                    borderBottom: "1px solid #dee2e6",
                  }}
                >
                  Configuración Avanzada de Marcado
                </h4>

                <FormRow>
                  <FormGroup>
                    <Label>Tamaño de Lote</Label>
                    <Input
                      type="number"
                      value={mapping.markProcessedConfig?.batchSize || 100}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 100;
                        setMapping((prev) => ({
                          ...prev,
                          markProcessedConfig: {
                            ...prev.markProcessedConfig,
                            batchSize: value,
                          },
                        }));
                      }}
                      min="1"
                      max="1000"
                      placeholder="100"
                    />
                    <small
                      style={{
                        color: "#6c757d",
                        fontSize: "12px",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      Número de documentos a marcar por lote (solo para
                      estrategia "En Lotes")
                    </small>
                  </FormGroup>

                  <FormGroup>
                    <Label>Campo de Timestamp</Label>
                    <Input
                      type="text"
                      value={
                        mapping.markProcessedConfig?.timestampField ||
                        "LAST_PROCESSED_DATE"
                      }
                      onChange={(e) => {
                        setMapping((prev) => ({
                          ...prev,
                          markProcessedConfig: {
                            ...prev.markProcessedConfig,
                            timestampField: e.target.value,
                          },
                        }));
                      }}
                      placeholder="LAST_PROCESSED_DATE"
                    />
                    <small
                      style={{
                        color: "#6c757d",
                        fontSize: "12px",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      Campo donde se guardará la fecha de procesamiento
                    </small>
                  </FormGroup>
                </FormRow>

                <CheckboxGroup style={{ marginBottom: "12px" }}>
                  <Checkbox
                    type="checkbox"
                    checked={
                      mapping.markProcessedConfig?.includeTimestamp !== false
                    }
                    onChange={(e) => {
                      setMapping((prev) => ({
                        ...prev,
                        markProcessedConfig: {
                          ...prev.markProcessedConfig,
                          includeTimestamp: e.target.checked,
                        },
                      }));
                    }}
                    id="includeTimestamp"
                  />
                  <CheckboxLabel htmlFor="includeTimestamp">
                    Incluir fecha de procesamiento
                  </CheckboxLabel>
                </CheckboxGroup>

                <CheckboxGroup style={{ marginBottom: "12px" }}>
                  <Checkbox
                    type="checkbox"
                    checked={
                      mapping.markProcessedConfig?.allowRollback || false
                    }
                    onChange={(e) => {
                      setMapping((prev) => ({
                        ...prev,
                        markProcessedConfig: {
                          ...prev.markProcessedConfig,
                          allowRollback: e.target.checked,
                        },
                      }));
                    }}
                    id="allowRollback"
                  />
                  <CheckboxLabel htmlFor="allowRollback">
                    Permitir rollback en caso de errores (solo para lotes)
                  </CheckboxLabel>
                </CheckboxGroup>

                {/* Información adicional sobre rollback */}
                {mapping.markProcessedConfig?.allowRollback && (
                  <div
                    style={{
                      marginTop: "15px",
                      padding: "12px",
                      backgroundColor: "#fff3e0",
                      border: "1px solid #ffcc80",
                      borderLeft: "4px solid #ff9800",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "600",
                        color: "#e65100",
                        marginBottom: "8px",
                        fontSize: "0.95rem",
                      }}
                    >
                      ⚠️ Rollback Habilitado
                    </div>
                    <div
                      style={{
                        color: "#424242",
                        fontSize: "0.85rem",
                        lineHeight: "1.4",
                      }}
                    >
                      Si algún documento falla durante el procesamiento por
                      lotes, todos los documentos exitosos serán desmarcados
                      automáticamente. Esto mantiene la consistencia pero puede
                      requerir reprocesamiento.
                    </div>
                  </div>
                )}

                {/* Información sobre estrategias */}
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
                      <strong>Lotes:</strong> Recomendado para volúmenes grandes
                      (más de 100 documentos) por mejor rendimiento
                    </li>
                    <li style={{ marginBottom: "4px" }}>
                      <strong>Ninguno:</strong> Útil para pruebas o cuando se
                      requiere reprocesamiento múltiple
                    </li>
                  </ul>
                </div>
              </div>
            )}

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
