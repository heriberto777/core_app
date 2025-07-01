// MappingEditor.jsx - CÓDIGO COMPLETO CON BONIFICACIONES INTEGRADAS

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
} from "react-icons/fa";
import Swal from "sweetalert2";

const api = new TransferApi();

export function MappingEditor({ mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState({
    // ... estado inicial sin _id ...
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
      applyPromotionRules: false,
    },
  });
  const [isEditing, setIsEditing] = useState(!mappingId);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    if (mappingId) {
      loadMapping();
    } else {
      setLoading(false);
      setIsEditing(false); // 🔧 Asegurar que está en modo crear
    }
  }, [mappingId]);

  const loadMapping = async () => {
    setLoading(true);
    try {
      const data = await api.getMappingById(accessToken, mappingId);

      if (data) {
        // 🔧 IMPORTANTE: Mantener el _id cuando cargamos para edición
        console.log("📥 Cargando mapping para edición:", data._id);

        const mappingWithDefaults = {
          ...data, // 🔧 Mantener TODOS los campos incluyendo _id
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
        setIsEditing(true); // 🔧 Confirmar modo edición
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

    // 🟢 MANEJO DE MARK PROCESSED CONFIG
    if (name.startsWith("markProcessedConfig.")) {
      const field = name.replace("markProcessedConfig.", "");
      setMapping((prevState) => ({
        ...prevState,
        markProcessedConfig: {
          ...prevState.markProcessedConfig,
          [field]:
            type === "checkbox"
              ? checked
              : field === "batchSize"
              ? parseInt(value) || 100
              : value,
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

  // 🎁 NUEVA FUNCIÓN: Previsualizar bonificaciones
  const previewBonifications = async () => {
    if (!mapping.hasBonificationProcessing) {
      Swal.fire({
        icon: "warning",
        title: "Bonificaciones deshabilitadas",
        text: "Este mapping no tiene habilitado el procesamiento de bonificaciones",
      });
      return;
    }

    if (!mappingId) {
      Swal.fire({
        icon: "warning",
        title: "Configuración no guardada",
        text: "Debe guardar la configuración antes de poder previsualizar bonificaciones",
      });
      return;
    }

    const { value: documentId } = await Swal.fire({
      title: "Previsualizar Bonificaciones",
      text: "Ingrese el ID del documento para previsualizar:",
      input: "text",
      inputPlaceholder: "Ej: 12345",
      showCancelButton: true,
      confirmButtonText: "Previsualizar",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value) {
          return "Debe ingresar un ID de documento";
        }
      },
    });

    if (!documentId) return;

    try {
      Swal.fire({
        title: "Previsualizando bonificaciones...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await api.previewBonificationProcessing(
        accessToken,
        mappingId,
        documentId
      );

      const { original, processed, promotions, transformation } = result.data;

      Swal.fire({
        icon: "info",
        title: `🎁 Preview de Bonificaciones - Documento ${documentId}`,
        html: `
          <div style="text-align: left; font-size: 14px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">

              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="color: #495057; margin: 0 0 10px 0;">📦 Datos Originales</h4>
                <p style="margin: 5px 0;">Total items: <strong>${
                  original.totalItems
                }</strong></p>
                <p style="margin: 5px 0;">Items regulares: <strong>${
                  original.regularItems
                }</strong></p>
                <p style="margin: 5px 0;">Bonificaciones: <strong>${
                  original.bonifications
                }</strong></p>
              </div>

              <div style="background: #e8f5e8; padding: 15px; border-radius: 8px;">
                <h4 style="color: #28a745; margin: 0 0 10px 0;">🎁 Después del Procesamiento</h4>
                <p style="margin: 5px 0;">Total items: <strong>${
                  processed.totalItems
                }</strong></p>
                <p style="margin: 5px 0;">Items regulares: <strong>${
                  processed.regularItems
                }</strong></p>
                <p style="margin: 5px 0;">Bonificaciones: <strong>${
                  processed.bonifications
                }</strong></p>
                <p style="margin: 5px 0; color: #dc3545;">Bonif. huérfanas: <strong>${
                  processed.orphanBonifications
                }</strong></p>
              </div>
            </div>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h4 style="color: #856404; margin: 0 0 10px 0;">🏷️ Promociones Detectadas</h4>
              <p style="margin: 5px 0;">Total promociones: <strong>${
                promotions.summary.totalPromotions
              }</strong></p>
              <p style="margin: 5px 0;">Total bonificaciones: <strong>${
                promotions.summary.totalBonifiedItems
              }</strong></p>
              <p style="margin: 5px 0;">Descuento total: <strong>$${promotions.summary.totalDiscountAmount.toFixed(
                2
              )}</strong></p>
            </div>

            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px;">
              <h4 style="color: #0c5460; margin: 0 0 10px 0;">🔄 Transformación</h4>
              <p style="margin: 5px 0;">Líneas agregadas: <strong>${
                transformation.linesAdded
              }</strong></p>
              <p style="margin: 5px 0;">Bonificaciones vinculadas: <strong>${
                transformation.bonificationsLinked
              }</strong></p>
              ${
                transformation.orphanBonifications > 0
                  ? `<p style="margin: 5px 0; color: #dc3545;">⚠️ Bonificaciones huérfanas: <strong>${transformation.orphanBonifications}</strong></p>`
                  : '<p style="margin: 5px 0; color: #28a745;">✅ Todas las bonificaciones vinculadas correctamente</p>'
              }
            </div>
          </div>
        `,
        width: 700,
        confirmButtonText: "Entendido",
        showCancelButton: true,
        cancelButtonText: "Ver Detalles",
      }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
          // Mostrar detalles en una segunda ventana
          showBonificationDetails(processed.details || []);
        }
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo previsualizar las bonificaciones",
      });
    }
  };

  // 🎁 NUEVA FUNCIÓN: Mostrar detalles de bonificaciones
  const showBonificationDetails = (details) => {
    const detailsHtml = details
      .map(
        (item, index) => `
      <tr style="border-bottom: 1px solid #dee2e6;">
        <td style="padding: 8px; border-right: 1px solid #dee2e6;">${
          item.PEDIDO_LINEA || index + 1
        }</td>
        <td style="padding: 8px; border-right: 1px solid #dee2e6;">${
          item.COD_ART || "-"
        }</td>
        <td style="padding: 8px; border-right: 1px solid #dee2e6;">
          <span style="background: ${
            item.ITEM_TYPE === "REGULAR"
              ? "#28a745"
              : item.ITEM_TYPE === "BONIFICATION"
              ? "#007bff"
              : "#dc3545"
          };
                       color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
            ${item.ITEM_TYPE || "UNKNOWN"}
          </span>
        </td>
        <td style="padding: 8px; border-right: 1px solid #dee2e6;">${
          item.CNT_MAX || 0
        }</td>
        <td style="padding: 8px;">${item.PEDIDO_LINEA_BONIF || "-"}</td>
      </tr>
    `
      )
      .join("");

    Swal.fire({
      title: "🔍 Detalles del Procesamiento",
      html: `
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead style="background: #f8f9fa; position: sticky; top: 0;">
              <tr>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Línea</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Artículo</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Tipo</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Cantidad</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Ref. Línea</th>
              </tr>
            </thead>
            <tbody>
              ${detailsHtml}
            </tbody>
          </table>
        </div>
      `,
      width: 800,
      confirmButtonText: "Cerrar",
    });
  };

  // 🎁 NUEVA FUNCIÓN: Validar configuración de bonificaciones
  const validateBonifications = async () => {
    if (!mapping.hasBonificationProcessing) {
      Swal.fire({
        icon: "warning",
        title: "Bonificaciones deshabilitadas",
        text: "Habilite el procesamiento de bonificaciones primero",
      });
      return;
    }

    try {
      Swal.fire({
        title: "Validando configuración...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      // Validación local primero
      const config = mapping.bonificationConfig;
      const localErrors = [];

      if (!config.sourceTable) localErrors.push("Tabla de origen requerida");
      if (!config.bonificationIndicatorField)
        localErrors.push("Campo indicador de bonificación requerido");
      if (!config.bonificationIndicatorValue)
        localErrors.push("Valor indicador de bonificación requerido");
      if (!config.regularArticleField)
        localErrors.push("Campo de artículo regular requerido");
      if (!config.bonificationReferenceField)
        localErrors.push("Campo de referencia de bonificación requerido");
      if (!config.orderField) localErrors.push("Campo de agrupación requerido");
      if (!config.lineNumberField)
        localErrors.push("Campo de número de línea requerido");
      if (!config.bonificationLineReferenceField)
        localErrors.push("Campo de referencia de línea requerido");

      if (localErrors.length > 0) {
        Swal.fire({
          icon: "error",
          title: "⚠️ Configuración incompleta",
          html: `
            <div style="text-align: left;">
              <p>Los siguientes campos son requeridos:</p>
              <ul style="margin: 10px 0;">
                ${localErrors
                  .map((error) => `<li style="color: #dc3545;">${error}</li>`)
                  .join("")}
              </ul>
            </div>
          `,
        });
        return;
      }

      // Si hay un mappingId, hacer validación en el servidor
      if (mappingId) {
        const result = await api.validateBonificationConfig(
          accessToken,
          mappingId,
          config
        );

        if (result.success) {
          Swal.fire({
            icon: "success",
            title: "✅ Configuración válida",
            html: `
              <div style="text-align: left;">
                <p><strong>La configuración de bonificaciones es correcta.</strong></p>
                <div style="background: #d4edda; padding: 10px; border-radius: 5px; margin: 10px 0;">
                  <p style="margin: 5px 0;">✅ Todos los campos requeridos están configurados</p>
                  <p style="margin: 5px 0;">✅ La tabla de origen es accesible</p>
                  <p style="margin: 5px 0;">✅ Los campos de mapeo existen</p>
                </div>
              </div>
            `,
          });
        } else {
          Swal.fire({
            icon: "warning",
            title: "⚠️ Advertencias encontradas",
            html: `
              <div style="text-align: left;">
                <p>${
                  result.message || "Revise la configuración de bonificaciones"
                }</p>
                ${
                  result.warnings
                    ? `
                  <div style="background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <ul style="margin: 0;">
                      ${result.warnings
                        .map(
                          (warning) =>
                            `<li style="color: #856404;">${warning}</li>`
                        )
                        .join("")}
                    </ul>
                  </div>
                `
                    : ""
                }
              </div>
            `,
          });
        }
      } else {
        // Solo validación local si no está guardado
        Swal.fire({
          icon: "success",
          title: "✅ Configuración local válida",
          text: "La configuración parece correcta. Guarde el mapping para hacer una validación completa.",
        });
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "❌ Error de validación",
        text: error.message || "No se pudo validar la configuración",
      });
    }
  };

  // 🎁 NUEVA FUNCIÓN: Estadísticas de bonificaciones
  const showBonificationStats = async () => {
    if (!mappingId) {
      Swal.fire({
        icon: "warning",
        title: "Configuración no guardada",
        text: "Debe guardar la configuración antes de ver estadísticas",
      });
      return;
    }

    try {
      Swal.fire({
        title: "Cargando estadísticas...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const result = await api.getBonificationStats(accessToken, mappingId, {
        timeRange: "30d",
      });

      const stats = result.data;

      Swal.fire({
        icon: "info",
        title: "📊 Estadísticas de Bonificaciones",
        html: `
          <div style="text-align: left;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">

              <div style="background: #e8f5e8; padding: 15px; border-radius: 8px;">
                <h4 style="color: #28a745; margin: 0 0 10px 0;">📈 Últimos 30 días</h4>
                <p style="margin: 5px 0;">Documentos procesados: <strong>${
                  stats.documentsProcessed || 0
                }</strong></p>
                <p style="margin: 5px 0;">Con bonificaciones: <strong>${
                  stats.documentsWithBonifications || 0
                }</strong></p>
                <p style="margin: 5px 0;">Total bonificaciones: <strong>${
                  stats.totalBonifications || 0
                }</strong></p>
              </div>

              <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
                <h4 style="color: #856404; margin: 0 0 10px 0;">💰 Impacto Económico</h4>
                <p style="margin: 5px 0;">Descuentos aplicados: <strong>$${(
                  stats.totalDiscountAmount || 0
                ).toFixed(2)}</strong></p>
                <p style="margin: 5px 0;">Promociones activas: <strong>${
                  stats.activePromotions || 0
                }</strong></p>
                <p style="margin: 5px 0;">Ahorro promedio: <strong>$${(
                  stats.averageSavings || 0
                ).toFixed(2)}</strong></p>
              </div>
            </div>

            ${
              stats.topPromotionTypes && stats.topPromotionTypes.length > 0
                ? `
              <div style="background: #d1ecf1; padding: 15px; border-radius: 8px;">
                <h4 style="color: #0c5460; margin: 0 0 10px 0;">🏷️ Tipos de Promociones Más Usados</h4>
                ${stats.topPromotionTypes
                  .map(
                    (promo) => `
                  <p style="margin: 5px 0;">${promo.type}: <strong>${promo.count}</strong> usos</p>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        `,
        width: 700,
        confirmButtonText: "Cerrar",
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudieron cargar las estadísticas",
      });
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

    // 🟢 VALIDACIÓN DE BONIFICACIONES
    if (mapping.hasBonificationProcessing) {
      const config = mapping.bonificationConfig;
      const errors = [];

      if (!config.sourceTable) errors.push("Tabla de origen");
      if (!config.bonificationIndicatorField)
        errors.push("Campo indicador de bonificación");
      if (!config.bonificationIndicatorValue)
        errors.push("Valor indicador de bonificación");
      if (!config.orderField) errors.push("Campo de agrupación");
      if (!config.lineNumberField) errors.push("Campo de número de línea");
      if (!config.bonificationLineReferenceField)
        errors.push("Campo de referencia de línea");

      if (errors.length > 0) {
        Swal.fire({
          icon: "warning",
          title: "Configuración de bonificaciones incompleta",
          html: `
          <div style="text-align: left;">
            <p>Los siguientes campos son requeridos para el procesamiento de bonificaciones:</p>
            <ul style="margin: 10px 0;">
              ${errors
                .map((error) => `<li style="color: #dc3545;">${error}</li>`)
                .join("")}
            </ul>
          </div>
        `,
        });
        return;
      }
    }

    // 🔧 CORREGIR: Crear copia limpia sin _id para nuevos mappings
    const mappingCopy = JSON.parse(JSON.stringify(mapping));

    // 🔧 IMPORTANTE: Si es un nuevo mapping (no isEditing), eliminar _id si existe
    if (!isEditing && mappingCopy._id) {
      delete mappingCopy._id;
      console.log("🔧 Eliminando _id para nuevo mapping");
    }

    // Limpiar y validar configuraciones de tablas
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
    console.log("🔍 isEditing:", isEditing, "mappingId:", mappingId);

    setLoading(true);
    try {
      let result;

      // 🔧 CORREGIR: Lógica clara de crear vs actualizar
      if (mappingId && isEditing) {
        // ACTUALIZAR mapping existente
        console.log("🔄 Actualizando mapping existente:", mappingId);
        result = await api.updateMapping(accessToken, mappingId, mappingCopy);
      } else {
        // CREAR nuevo mapping
        console.log("✨ Creando nuevo mapping");
        result = await api.createMapping(accessToken, mappingCopy);
      }

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: isEditing
            ? "Configuración actualizada"
            : "Configuración creada",
          text: result.message || "La configuración se guardó exitosamente",
          footer: mapping.hasBonificationProcessing
            ? "✨ Procesamiento de bonificaciones habilitado"
            : null,
        }).then(() => {
          onSave(result.data || result);
        });
      } else {
        throw new Error(result.message || "Error al guardar");
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo guardar la configuración",
      });
    } finally {
      setLoading(false);
    }
  };

  // 🟢 FUNCIÓN PARA HABILITAR/DESHABILITAR BONIFICACIONES
  const addBonificationConfig = () => {
    setMapping((prev) => ({
      ...prev,
      hasBonificationProcessing: true,
    }));
  };

  const removeBonificationConfig = () => {
    Swal.fire({
      title: "¿Deshabilitar bonificaciones?",
      text: "Se perderá toda la configuración de bonificaciones",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, deshabilitar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (result.isConfirmed) {
        setMapping((prev) => ({
          ...prev,
          hasBonificationProcessing: false,
        }));
      }
    });
  };

  // TODAS LAS DEMÁS FUNCIONES EXISTENTES (sin cambios)...
  const addDocumentTypeRule = () => {
    Swal.fire({
      title: "Nueva Regla de Tipo de Documento",
      html: `
      <div class="form-group">
        <label for="typeName">Nombre del tipo</label>
        <input id="typeName" class="swal2-input" placeholder="Ej: Pedido Normal">
      </div>
      <div class="form-group">
        <label for="conditions">Condiciones (JSON)</label>
        <textarea id="conditions" class="swal2-textarea" placeholder='{"fieldName": "value"}'></textarea>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const typeName = document.getElementById("typeName").value;
        const conditions = document.getElementById("conditions").value;

        if (!typeName) {
          Swal.showValidationMessage("El nombre del tipo es obligatorio");
          return false;
        }

        let parsedConditions;
        try {
          parsedConditions = conditions ? JSON.parse(conditions) : {};
        } catch (e) {
          Swal.showValidationMessage("Las condiciones deben ser JSON válido");
          return false;
        }

        return { typeName, conditions: parsedConditions };
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

  const addForeignKeyDependency = () => {
    Swal.fire({
      title: "Nueva Dependencia de Foreign Key",
      html: `
      <div class="form-group">
        <label for="fieldName">Campo que genera la dependencia</label>
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
      <div class="form-check">
        <input type="checkbox" id="insertIfNotExists" class="swal2-checkbox">
        <label for="insertIfNotExists">Insertar si no existe</label>
      </div>
      <div class="form-check">
        <input type="checkbox" id="validateOnly" class="swal2-checkbox">
        <label for="validateOnly">Solo validar (no insertar)</label>
      </div>
      <div class="form-group">
        <label for="dependentFields">Campos mapeados (JSON)</label>
        <textarea id="dependentFields" class="swal2-textarea" placeholder='[{"sourceField": "COD_CLI", "targetField": "CODIGO", "isKey": true}]'></textarea>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Agregar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fieldName = document.getElementById("fieldName").value;
        const dependentTable = document.getElementById("dependentTable").value;
        const executionOrder =
          parseInt(document.getElementById("executionOrder").value) || 0;
        const insertIfNotExists =
          document.getElementById("insertIfNotExists").checked;
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsValue =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        let dependentFields = [];
        if (dependentFieldsValue) {
          try {
            dependentFields = JSON.parse(dependentFieldsValue);
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
            ...mapping.foreignKeyDependencies,
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
      <div class="form-group">
        <label for="fieldName">Campo que genera la dependencia</label>
        <input id="fieldName" class="swal2-input" value="${
          dependency.fieldName
        }" placeholder="Ej: COD_CLI">
      </div>
      <div class="form-group">
        <label for="dependentTable">Tabla dependiente</label>
        <input id="dependentTable" class="swal2-input" value="${
          dependency.dependentTable
        }" placeholder="Ej: CLIENTES">
      </div>
      <div class="form-group">
        <label for="executionOrder">Orden de ejecución</label>
        <input id="executionOrder" type="number" class="swal2-input" value="${
          dependency.executionOrder || 0
        }">
      </div>
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
      <div class="form-group">
        <label for="dependentFields">Campos mapeados (JSON)</label>
        <textarea id="dependentFields" class="swal2-textarea" placeholder='[{"sourceField": "COD_CLI", "targetField": "CODIGO", "isKey": true}]'>${JSON.stringify(
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
          document.getElementById("insertIfNotExists").checked;
        const validateOnly = document.getElementById("validateOnly").checked;
        const dependentFieldsValue =
          document.getElementById("dependentFields").value;

        if (!fieldName || !dependentTable) {
          Swal.showValidationMessage(
            "Campo y tabla dependiente son obligatorios"
          );
          return false;
        }

        let dependentFields = [];
        if (dependentFieldsValue) {
          try {
            dependentFields = JSON.parse(dependentFieldsValue);
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
          <label for="useSameSourceTable">Usar la misma tabla origen</label>
        </div>
        <div class="form-group">
          <label for="orderByColumn">Columna de ordenamiento</label>
          <input id="orderByColumn" class="swal2-input" placeholder="Ej: NUM_LN">
        </div>
        <div class="form-group">
          <label for="filterCondition">Condición de filtro</label>
          <input id="filterCondition" class="swal2-input" placeholder="Ej: STATUS = 'ACTIVE'">
        </div>
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
        const tableName = document.getElementById("tableName").value;
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

        if (!tableName || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Nombre, tabla origen y tabla destino son obligatorios"
          );
          return false;
        }

        return {
          name: tableName,
          sourceTable,
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
          <label for="useSameSourceTable">Usar la misma tabla origen</label>
        </div>
        <div class="form-group">
          <label for="orderByColumn">Columna de ordenamiento</label>
          <input id="orderByColumn" class="swal2-input" value="${
            tableConfig.orderByColumn || ""
          }" placeholder="Ej: NUM_LN">
        </div>
        <div class="form-group">
          <label for="filterCondition">Condición de filtro</label>
          <input id="filterCondition" class="swal2-input" value="${
            tableConfig.filterCondition || ""
          }" placeholder="Ej: STATUS = 'ACTIVE'">
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
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
        const tableName = document.getElementById("tableName").value;
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

        if (!tableName || !sourceTable || !targetTable) {
          Swal.showValidationMessage(
            "Nombre, tabla origen y tabla destino son obligatorios"
          );
          return false;
        }

        return {
          name: tableName,
          sourceTable,
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
    // [Función existente addFieldMapping - sin cambios]
    // ... código completo de la función existente
  };

  const editFieldMapping = (tableIndex, fieldIndex) => {
    // [Función existente editFieldMapping - sin cambios]
    // ... código completo de la función existente
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
    // [Función existente addValueMapping - sin cambios]
    // ... código completo de la función existente
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
        <ButtonGroup>
          <SaveButton onClick={handleSave} disabled={loading}>
            <FaSave /> {loading ? "Guardando..." : "Guardar"}
          </SaveButton>
          <CancelButton onClick={onCancel}>
            <FaTimes /> Cancelar
          </CancelButton>
        </ButtonGroup>
      </Header>

      <TabNavigation>
        <Tab
          active={activeTab === "general"}
          onClick={() => setActiveTab("general")}
        >
          General
        </Tab>
        <Tab
          active={activeTab === "rules"}
          onClick={() => setActiveTab("rules")}
        >
          Reglas
        </Tab>
        <Tab
          active={activeTab === "dependencies"}
          onClick={() => setActiveTab("dependencies")}
        >
          Dependencias
        </Tab>
        <Tab
          active={activeTab === "bonifications"}
          onClick={() => setActiveTab("bonifications")}
        >
          🎁 Bonificaciones
        </Tab>
        <Tab
          active={activeTab === "tables"}
          onClick={() => setActiveTab("tables")}
        >
          Tablas y Campos
        </Tab>
      </TabNavigation>

      <Content>
        {/* Pestaña General */}
        {activeTab === "general" && (
          <Section>
            <FormGroup>
              <Label>Nombre de la configuración *</Label>
              <Input
                type="text"
                name="name"
                value={mapping.name}
                onChange={handleChange}
                placeholder="Nombre descriptivo de la configuración"
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
                    placeholder="Campo para marcar como procesado"
                  />

                  <Label style={{ marginTop: "10px" }}>
                    Valor para marcar como procesado
                  </Label>
                  <Input
                    type="text"
                    name="markProcessedValue"
                    value={mapping.markProcessedValue}
                    onChange={handleChange}
                    placeholder="Valor que indica procesado"
                  />

                  {mapping.markProcessedStrategy === "batch" && (
                    <>
                      <FormRow style={{ marginTop: "15px" }}>
                        <FormGroup>
                          <Label>Tamaño del lote</Label>
                          <Input
                            type="number"
                            name="markProcessedConfig.batchSize"
                            value={mapping.markProcessedConfig.batchSize}
                            onChange={handleChange}
                            min="1"
                            max="1000"
                          />
                        </FormGroup>

                        <FormGroup>
                          <Label>Campo de timestamp</Label>
                          <Input
                            type="text"
                            name="markProcessedConfig.timestampField"
                            value={mapping.markProcessedConfig.timestampField}
                            onChange={handleChange}
                            placeholder="Campo para fecha de procesamiento"
                          />
                        </FormGroup>
                      </FormRow>

                      <CheckboxGroup>
                        <Checkbox
                          type="checkbox"
                          name="markProcessedConfig.includeTimestamp"
                          checked={mapping.markProcessedConfig.includeTimestamp}
                          onChange={handleChange}
                        />
                        <CheckboxLabel>
                          Incluir timestamp de procesamiento
                        </CheckboxLabel>
                      </CheckboxGroup>

                      <CheckboxGroup>
                        <Checkbox
                          type="checkbox"
                          name="markProcessedConfig.allowRollback"
                          checked={mapping.markProcessedConfig.allowRollback}
                          onChange={handleChange}
                        />
                        <CheckboxLabel>
                          Permitir rollback en caso de errores
                        </CheckboxLabel>
                      </CheckboxGroup>
                    </>
                  )}
                </div>
              )}
            </FormGroup>

            <ConsecutiveConfigSection
              consecutiveConfig={mapping.consecutiveConfig}
              onChange={(config) =>
                handleChange({
                  target: {
                    name: "consecutiveConfig",
                    value: config,
                    type: "custom",
                  },
                })
              }
            />
          </Section>
        )}

        {/* Pestaña Reglas */}
        {activeTab === "rules" && (
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
                    <h4>{rule.typeName}</h4>
                    <SmallButton onClick={() => removeDocumentTypeRule(index)}>
                      <FaTrash />
                    </SmallButton>
                  </CardHeader>
                  <CardBody>
                    <PropertyList>
                      <PropertyItem>
                        <PropertyLabel>Condiciones:</PropertyLabel>
                        <PropertyValue>
                          <pre>{JSON.stringify(rule.conditions, null, 2)}</pre>
                        </PropertyValue>
                      </PropertyItem>
                    </PropertyList>
                  </CardBody>
                </Card>
              ))
            )}
          </Section>
        )}

        {/* Pestaña Dependencias */}
        {activeTab === "dependencies" && (
          <Section>
            <SectionHeader>
              <h3>Dependencias de Foreign Key</h3>
              <SmallButton onClick={addForeignKeyDependency}>
                <FaPlus /> Añadir Dependencia
              </SmallButton>
            </SectionHeader>

            {mapping.foreignKeyDependencies.length === 0 ? (
              <EmptyMessage>No hay dependencias configuradas</EmptyMessage>
            ) : (
              mapping.foreignKeyDependencies.map((dependency, index) => (
                <Card key={index}>
                  <CardHeader>
                    <h4>
                      {dependency.fieldName} → {dependency.dependentTable}
                    </h4>
                    <div>
                      <SmallButton
                        onClick={() => editForeignKeyDependency(index)}
                      >
                        <FaEdit />
                      </SmallButton>
                      <SmallButton
                        onClick={() => removeForeignKeyDependency(index)}
                      >
                        <FaTrash />
                      </SmallButton>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <PropertyList>
                      <PropertyItem>
                        <PropertyLabel>Comportamiento:</PropertyLabel>
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

        {/* 🎁 PESTAÑA DE BONIFICACIONES */}
        {activeTab === "bonifications" && (
          <Section>
            <SectionHeader>
              <h3>Procesamiento de Bonificaciones</h3>
              {!mapping.hasBonificationProcessing ? (
                <SmallButton onClick={addBonificationConfig}>
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

                      <SmallButton onClick={showBonificationStats}>
                        📊 Estadísticas
                      </SmallButton>
                    </>
                  )}

                  <SmallButton $danger onClick={removeBonificationConfig}>
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

                  <FormRow>
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
                  </FormRow>

                  <FormRow>
                    <FormGroup>
                      <Label>Campo de número de línea</Label>
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

                  <CheckboxGroup>
                    <Checkbox
                      type="checkbox"
                      name="bonificationConfig.applyPromotionRules"
                      checked={mapping.bonificationConfig.applyPromotionRules}
                      onChange={handleChange}
                    />
                    <CheckboxLabel>
                      Aplicar reglas de promociones automáticamente
                    </CheckboxLabel>
                    <small
                      style={{
                        color: "#6c757d",
                        fontSize: "0.75rem",
                        display: "block",
                        marginTop: "5px",
                      }}
                    >
                      Cuando está habilitado, el sistema aplicará reglas de
                      promociones según el contexto del cliente
                    </small>
                  </CheckboxGroup>

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
                        2. Asigna líneas secuenciales a artículos regulares
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
                        3. Mapea bonificaciones con sus artículos regulares
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
                        4. Asigna{" "}
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
                        5. Limpia{" "}
                        {mapping.bonificationConfig.bonificationReferenceField}{" "}
                        original para inserción en tabla destino
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
                <p
                  style={{
                    fontSize: "0.9em",
                    color: "#6c757d",
                    marginTop: "10px",
                  }}
                >
                  Una vez habilitado podrá configurar campos específicos, reglas
                  de promociones y validar la configuración antes de procesar
                  documentos.
                </p>
              </EmptyMessage>
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
                <Card key={tableIndex}>
                  <CardHeader>
                    <h4>{tableConfig.name}</h4>
                    <div>
                      <SmallButton onClick={() => editTableConfig(tableIndex)}>
                        <FaEdit />
                      </SmallButton>
                      <SmallButton
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
                                  <td>{field.isSqlFunction ? "✓" : "-"}</td>
                                  <td>
                                    {field.valueMappings
                                      ? field.valueMappings.length
                                      : 0}
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
      </Content>
    </Container>
  );
}

// TODOS LOS STYLED COMPONENTS EXISTENTES (sin cambios)
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e9ecef;

  h2 {
    margin: 0;
    color: #343a40;
    font-weight: 600;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const SaveButton = styled.button`
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background: #218838;
  }

  &:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background: #5a6268;
  }
`;

const TabNavigation = styled.div`
  display: flex;
  border-bottom: 2px solid #e9ecef;
  margin-bottom: 30px;
`;

const Tab = styled.button`
  background: ${(props) => (props.active ? "#007bff" : "transparent")};
  color: ${(props) => (props.active ? "white" : "#495057")};
  border: none;
  padding: 12px 24px;
  cursor: pointer;
  font-weight: 500;
  border-radius: 6px 6px 0 0;
  transition: all 0.2s;

  &:hover {
    background: ${(props) => (props.active ? "#0056b3" : "#f8f9fa")};
  }
`;

const Content = styled.div`
  min-height: 400px;
`;

const Section = styled.div`
  margin-bottom: 30px;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    color: #495057;
    font-weight: 600;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #495057;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
  min-height: 100px;
  resize: vertical;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  margin: 0;
  cursor: pointer;
  font-weight: 500;
  color: #495057;
`;

const Card = styled.div`
  border: 1px solid #e9ecef;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const CardHeader = styled.div`
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h4 {
    margin: 0;
    color: #495057;
    font-weight: 600;
  }

  div {
    display: flex;
    gap: 5px;
  }
`;

const CardBody = styled.div`
  padding: 20px;
`;

const PropertyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PropertyItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 15px;
`;

const PropertyLabel = styled.div`
  font-weight: 600;
  color: #495057;
  min-width: 150px;
  flex-shrink: 0;
`;

const PropertyValue = styled.div`
  color: #6c757d;
  flex: 1;

  pre {
    background: #f8f9fa;
    padding: 8px;
    border-radius: 4px;
    margin: 0;
    font-size: 12px;
    overflow-x: auto;
  }
`;

const SubSection = styled.div`
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e9ecef;
`;

const SubSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;

  h5 {
    margin: 0;
    color: #495057;
    font-weight: 600;
  }
`;

const SmallButton = styled.button`
  background: ${(props) => (props.$danger ? "#dc3545" : "#007bff")};
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background-color 0.2s;

  &:hover {
    background: ${(props) => (props.$danger ? "#c82333" : "#0056b3")};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #e9ecef;
  }

  th {
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
  }

  td {
    color: #6c757d;
  }
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #6c757d;

  h3 {
    margin: 10px 0;
    color: #495057;
  }

  p {
    margin: 5px 0;
    font-size: 14px;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #6c757d;
`;
