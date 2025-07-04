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

    const mappingCopy = JSON.parse(JSON.stringify(mapping));

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

  // 🟢 FUNCIONES PARA BONIFICACIONES
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
        {/* PESTAÑA GENERAL */}
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

            {/* SECCIÓN DE MARCADO MEJORADA */}
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

        {/* 🟢 PESTAÑA BONIFICACIONES COMPLETA */}
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

                  <FormRow>
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

                    {/* 🆕 NUEVO CAMPO: Cantidad bonificada */}
                    <FormGroup>
                      <Label>Campo de cantidad bonificada</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.bonificationQuantityField"
                        value={
                          mapping.bonificationConfig.bonificationQuantityField
                        }
                        onChange={handleChange}
                        placeholder="ej: CANTIDAD_BONIFICAD"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo específico para la cantidad bonificada
                      </small>
                    </FormGroup>
                  </FormRow>

                  <FormRow>
                    {/* 🆕 NUEVO CAMPO: Cantidad regular */}
                    <FormGroup>
                      <Label>Campo de cantidad regular</Label>
                      <Input
                        type="text"
                        name="bonificationConfig.regularQuantityField"
                        value={mapping.bonificationConfig.regularQuantityField}
                        onChange={handleChange}
                        placeholder="ej: CANTIDAD_REGULAR"
                      />
                      <small style={{ color: "#6c757d", fontSize: "0.75rem" }}>
                        Campo específico para la cantidad regular del artículo
                      </small>
                    </FormGroup>

                    <FormGroup
                      style={{ display: "flex", alignItems: "center" }}
                    >
                      <CheckboxGroup>
                        <Checkbox
                          type="checkbox"
                          name="bonificationConfig.applyPromotionRules"
                          checked={
                            mapping.bonificationConfig.applyPromotionRules
                          }
                          onChange={handleChange}
                        />
                        <CheckboxLabel>
                          Aplicar reglas de promociones automáticamente
                        </CheckboxLabel>
                      </CheckboxGroup>
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
                    </FormGroup>
                  </FormRow>

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
                        5. Procesa cantidades separadas para regulares (
                        {mapping.bonificationConfig.regularQuantityField ||
                          "N/A"}
                        ) y bonificaciones (
                        {mapping.bonificationConfig.bonificationQuantityField ||
                          "N/A"}
                        )
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
                  de promociones, campos de cantidad separados y validar la
                  configuración antes de procesar documentos.
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
  background: ${(props) => props.theme?.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: ${(props) =>
    props.theme?.boxShadow || "0 2px 4px rgba(0,0,0,0.1)"};
  overflow: hidden;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: ${(props) => props.theme?.text || "#333"};
`;

const Header = styled.div`
  padding: 20px;
  background: ${(props) => props.theme?.headerBg || "#f8f9fa"};
  border-bottom: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    margin: 0;
    color: ${(props) => props.theme?.title || "#343a40"};
  }
`;

const ButtonsGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  background: ${(props) =>
    props.$secondary
      ? props.theme?.secondary || "#6c757d"
      : props.theme?.primary || "#007bff"};
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
    background: ${(props) =>
      props.$secondary
        ? props.theme?.secondaryHover || "#5a6268"
        : props.theme?.primaryHover || "#0056b3"};
  }
`;

const SmallButton = styled.button`
  background: ${(props) =>
    props.$danger
      ? props.theme?.danger || "#dc3545"
      : props.theme?.primary || "#007bff"};
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  transition: background-color 0.2s;

  &:hover {
    background: ${(props) =>
      props.$danger
        ? props.theme?.dangerHover || "#c82333"
        : props.theme?.primaryHover || "#0056b3"};
  }
`;

const Tabs = styled.div`
  display: flex;
  margin-bottom: 20px;
  border-bottom: 1px solid ${(props) => props.theme?.border || "#dee2e6"};
  overflow-x: auto;
`;

const Tab = styled.div`
  padding: 10px 20px;
  cursor: pointer;
  border-bottom: 3px solid
    ${(props) =>
      props.$active ? props.theme?.primary || "#007bff" : "transparent"};
  color: ${(props) =>
    props.$active
      ? props.theme?.primary || "#007bff"
      : props.theme?.text || "#6c757d"};
  font-weight: ${(props) => (props.$active ? "bold" : "normal")};
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.theme?.primary || "#007bff"};
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
    color: ${(props) => props.theme?.title || "#343a40"};
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
  color: ${(props) => props.theme?.text || "#495057"};
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

const Textarea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme?.border || "#ced4da"};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme?.text || "#495057"};
  background-color: ${(props) => props.theme?.inputBg || "#fff"};
  min-height: 100px;
  resize: vertical;
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
