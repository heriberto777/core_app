import styled from "styled-components";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TransferApi,
  useAuth,
  useFetchData,
  MappingsList,
  MappingEditor,
  CustomerEditor,
} from "../../index";

import Swal from "sweetalert2";
import {
  FaSync,
  FaPlay,
  FaTable,
  FaListAlt,
  FaEye,
  FaArrowLeft,
  FaInfoCircle,
  FaPencilAlt,
  FaSearch,
  FaTrash,
} from "react-icons/fa";

const api = new TransferApi();

export function DocumentsVisualization() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const { accessToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [activeView, setActiveView] = useState("mappingsList"); // mappingsList, mappingEditor, documents
  const [activeMappingId, setActiveMappingId] = useState(null);
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [showConfigInfo, setShowConfigInfo] = useState(false);
  const [activeConfig, setActiveConfig] = useState(null);
  const [activeMappingName, setActiveMappingName] = useState("");
  const [showEntityEditor, setShowEntityEditor] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityType, setEntityType] = useState("orders");
  const [currentProcessingTask, setCurrentProcessingTask] = useState(null);

  // Filters - usar estado separado para los valores
  const [filterValues, setFilterValues] = useState({
    dateFrom: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    status: "all",
    warehouse: "all",
    showProcessed: false,
  });

  // Memoizar el objeto filters para evitar renderizados innecesarios
  const filters = useMemo(() => {
    return {
      dateFrom: filterValues.dateFrom,
      dateTo: filterValues.dateTo,
      status: filterValues.status,
      warehouse: filterValues.warehouse,
      showProcessed: filterValues.showProcessed,
    };
  }, [filterValues]);

  // Memoizar la función de fetch
  const fetchDocumentsCallback = useCallback(() => {
    if (!activeMappingId) return Promise.resolve([]);
    return api.getDocumentsByMapping(accessToken, activeMappingId, filters);
  }, [accessToken, activeMappingId, filters]);

  // Fetch documents data when a mapping is selected
  const {
    data: documents,
    setData: setDocuments,
    loading: documentsLoading,
    refreshing: documentsRefreshing,
    error: documentsError,
    refetch: fetchDocuments,
  } = useFetchData(
    fetchDocumentsCallback,
    [accessToken, activeMappingId, filters],
    !!activeMappingId,
    30000 // Refresh every 30 seconds
  );

  // Load mapping configuration when activeMappingId changes
  // Memoizar para evitar recreaciones
  const loadMappingConfig = useCallback(
    async (mappingId) => {
      try {
        setIsLoading(true);
        const config = await api.getMappingById(accessToken, mappingId);
        setActiveConfig(config);
        setActiveMappingName(config.name || "Configuración sin nombre");
        setEntityType(config.entityType || "orders");
        setIsLoading(false);
      } catch (error) {
        console.error("Error al cargar configuración:", error);
        setIsLoading(false);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo cargar los detalles de la configuración",
        });
      }
    },
    [accessToken]
  );

  // Effect con dependencias correctas
  useEffect(() => {
    if (activeMappingId) {
      loadMappingConfig(activeMappingId);
    }
  }, [activeMappingId, loadMappingConfig]);

  // Filter documents - memoizado
  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      // Simple search filter for any field
      if (!search) return true;

      const searchLower = search.toLowerCase();
      return Object.values(document).some(
        (value) =>
          value &&
          typeof value === "string" &&
          value.toLowerCase().includes(searchLower)
      );
    });
  }, [documents, search]);

  // Handle selection of documents - con useCallback
  const handleSelectDocument = useCallback((documentId) => {
    setSelectedDocuments((prev) => {
      if (prev.includes(documentId)) {
        return prev.filter((id) => id !== documentId);
      } else {
        return [...prev, documentId];
      }
    });
  }, []);

  // Handle select all documents - con useCallback
  const handleSelectAll = useCallback(() => {
    if (selectAll || selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
      setSelectAll(false);
    } else {
      // Identifying field may vary by mapping - assuming it's the first key
      const idField =
        filteredDocuments.length > 0
          ? Object.keys(filteredDocuments[0])[0]
          : null;

      if (idField) {
        setSelectedDocuments(filteredDocuments.map((doc) => doc[idField]));
        setSelectAll(true);
      }
    }
  }, [filteredDocuments, selectAll, selectedDocuments.length]);

  // Función para editar entidades según su tipo - con useCallback
  const handleEditEntity = useCallback(
    (entity) => {
      if (entityType === "customers") {
        // Mostrar editor de clientes
        setSelectedEntity(entity);
        setShowEntityEditor(true);
      } else if (entityType === "orders") {
        // Comportamiento existente para pedidos
        viewDocumentDetails(entity);
      }
      // Agregar más tipos según sea necesario
    },
    [entityType]
  );

  // Declaración anticipada de viewDocumentDetails
  const viewDocumentDetails = useCallback(
    async (document) => {
      try {
        if (!activeMappingId) {
          Swal.fire({
            title: "Error",
            text: "No hay configuración de mapeo seleccionada",
            icon: "error",
          });
          return;
        }

        setIsLoading(true);

        // Determine the ID field (first property as default)
        const idField = Object.keys(document)[0];
        const documentId = document[idField];

        // Get document details including items using the mapping config
        const details = await api.getDocumentDetailsByMapping(
          accessToken,
          activeMappingId,
          documentId
        );

        setIsLoading(false);

        // Get all detail items across all detail tables
        let allDetails = [];
        let detailTableMapping = {}; // Para mantener registro de qué detalles pertenecen a qué tabla

        // Verificar si hay datos de detalle y extraer los detalles según la estructura
        if (details && details.details) {
          // Procesar cada tabla de detalle y agregar sus datos al array principal
          for (const tableName in details.details) {
            if (
              Array.isArray(details.details[tableName]) &&
              details.details[tableName].length > 0
            ) {
              // Guardar información sobre el origen de cada detalle
              details.details[tableName].forEach((item) => {
                item._detailTableName = tableName;
                detailTableMapping[tableName] = item._targetTable || tableName;
              });

              // Agregar los detalles al array principal
              allDetails = allDetails.concat(details.details[tableName]);
            }
          }
        }

        // Mostrar modal con detalles...
        if (allDetails.length === 0) {
          Swal.fire({
            title: `Documento: ${documentId}`,
            html: `
          <div class="document-details">
            <div class="document-header">
              ${Object.entries(document)
                .filter(([key]) => key !== idField)
                .map(
                  ([key, value]) => `
                  <div class="document-header-item">
                    <strong>${key}:</strong> ${value !== null ? value : "N/A"}
                  </div>
                `
                )
                .join("")}
            </div>
            <h4>Detalle</h4>
            <p>No se encontraron detalles para este documento.</p>
            ${
              activeConfig
                ? `
              <div style="text-align: left; margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
                <strong>Información de configuración:</strong>
                <ul style="margin-top: 5px; padding-left: 20px;">
                  <li>Tablas de detalle configuradas: ${
                    activeConfig.tableConfigs.filter((tc) => tc.isDetailTable)
                      .length
                  }</li>
                  <li>Tablas con misma fuente que el encabezado: ${
                    activeConfig.tableConfigs.filter(
                      (tc) => tc.isDetailTable && tc.useSameSourceTable
                    ).length
                  }</li>
                </ul>
              </div>
            `
                : ""
            }
          </div>
        `,
            showConfirmButton: true,
            confirmButtonText: "Cerrar",
            customClass: {
              container: "document-details-container",
              htmlContainer: "document-details-wrapper",
            },
          });
          return;
        }

        // Obtener todos los campos disponibles (excluyendo metadatos)
        const allFields = new Set();
        allDetails.forEach((item) => {
          Object.keys(item).forEach((key) => {
            if (!key.startsWith("_")) {
              // Excluir campos de metadatos
              allFields.add(key);
            }
          });
        });

        // Ordenar los campos para que sean consistentes
        const sortedFields = Array.from(allFields).sort();

        // Inicialmente mostrar solo hasta 5 campos
        const initialFields = sortedFields.slice(0, 5);

        // Show document details modal with improved UI
        Swal.fire({
          title: `Documento: ${documentId}`,
          width: 900,
          html: `
        <div class="document-details">
          <div class="document-header">
            ${Object.entries(document)
              .filter(([key]) => key !== idField) // Skip ID field
              .map(
                ([key, value]) => `
                <div class="document-header-item">
                  <strong>${key}:</strong> ${value !== null ? value : "N/A"}
                </div>
              `
              )
              .join("")}
          </div>
          
          <h4>Detalle</h4>
          
          <div class="items-table-container">
            <div style="margin-bottom: 8px; text-align: left;">
              <strong>Tablas disponibles:</strong> 
              ${Object.keys(detailTableMapping)
                .map(
                  (tableName) =>
                    `<span style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; margin-right: 5px;">${tableName}</span>`
                )
                .join("")}
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 150px;">Tabla</th>
                  ${initialFields.map((key) => `<th>${key}</th>`).join("")}
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${allDetails
                  .map(
                    (item, idx) => `
                  <tr>
                    <td style="font-weight: bold; color: #007bff;">
                      ${item._detailTableName || "N/A"}
                    </td>
                    ${initialFields
                      .map(
                        (key) => `
                      <td>${
                        item[key] !== null && item[key] !== undefined
                          ? item[key]
                          : "N/A"
                      }</td>
                    `
                      )
                      .join("")}
                    <td>
                      <button type="button" class="view-item-btn" data-item-index="${idx}"
                              style="background: #007bff; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;">
                        Ver más
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      `,
          showConfirmButton: true,
          confirmButtonText: "Cerrar",
          customClass: {
            container: "document-details-container",
            htmlContainer: "document-details-wrapper",
          },
          didOpen: () => {
            // Guardar los datos para usarlos en eventos
            const detailItemsData = allDetails;

            // Usar funciones que no dependan de document
            const modal = Swal.getPopup();

            // Agregar event listeners a los botones de "Ver más"
            modal.querySelectorAll(".view-item-btn").forEach((button) => {
              button.addEventListener("click", (e) => {
                const index = parseInt(
                  e.target.getAttribute("data-item-index"),
                  10
                );
                const item = detailItemsData[index];

                if (item) {
                  let detailHtml =
                    '<div style="text-align: left; max-height: 60vh; overflow-y: auto;">';
                  detailHtml += `
                <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
                  <strong style="font-size: 16px; color: #007bff;">Tabla de detalle: ${
                    item._detailTableName || "N/A"
                  }</strong>
                  ${
                    item._targetTable
                      ? `<div><strong>Tabla destino:</strong> ${item._targetTable}</div>`
                      : ""
                  }
                </div>
              `;

                  detailHtml +=
                    '<table style="width: 100%; border-collapse: collapse;">';

                  // Mostrar primero los campos normales (sin _)
                  Object.entries(item).forEach(([key, value]) => {
                    if (!key.startsWith("_")) {
                      detailHtml += `
                    <tr style="border-bottom: 1px solid #eee;">
                      <td style="padding: 8px; font-weight: bold; width: 40%;">${key}</td>
                      <td style="padding: 8px;">${
                        value !== null && value !== undefined ? value : "N/A"
                      }</td>
                    </tr>
                  `;
                    }
                  });

                  detailHtml += "</table></div>";

                  Swal.fire({
                    title: "Detalle completo",
                    html: detailHtml,
                    width: 600,
                    showConfirmButton: true,
                    confirmButtonText: "Cerrar",
                  });
                }
              });
            });
          },
        });
      } catch (error) {
        setIsLoading(false);
        Swal.fire({
          title: "Error",
          text:
            error.message || "No se pudieron cargar los detalles del documento",
          icon: "error",
        });
      }
    },
    [activeMappingId, accessToken, setIsLoading]
  );

  // Renderizado del editor de entidad - con useCallback
  const renderEntityEditor = useCallback(() => {
    if (!showEntityEditor || !selectedEntity) return null;

    switch (entityType) {
      case "customers":
        return (
          <EditorOverlay>
            <EditorContainer>
              <CustomerEditor
                customer={selectedEntity}
                mappingId={activeMappingId}
                onSave={handleSaveCustomer}
                onCancel={() => setShowEntityEditor(false)}
              />
            </EditorContainer>
          </EditorOverlay>
        );
      // Agregar más casos según se necesite
      default:
        return null;
    }
  }, [entityType, selectedEntity, showEntityEditor]);

  // Función para guardar cliente editado - con useCallback
  const handleSaveCustomer = async (updateData) => {
    try {
      setIsLoading(true);

      // Llamada a la API para actualizar tanto destino como origen
      await api.updateEntityData(accessToken, updateData);

      // Cerrar editor
      setShowEntityEditor(false);

      // Actualizar lista
      fetchDocuments();

      Swal.fire({
        icon: "success",
        title: "Actualizado",
        text: "Los datos han sido actualizados correctamente en ambas bases de datos",
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo actualizar la entidad",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Process documents functionality - con useCallback
  const processDocuments = useCallback(async () => {
    if (!activeMappingId) {
      Swal.fire({
        title: "Error",
        text: "No hay configuración de mapeo seleccionada",
        icon: "error",
      });
      return;
    }

    if (selectedDocuments.length === 0) {
      Swal.fire({
        title: "Ningún documento seleccionado",
        text: "Por favor, seleccione al menos un documento para procesar",
        icon: "warning",
      });
      return;
    }

    try {
      // Ask for confirmation
      const confirmResult = await Swal.fire({
        title: "¿Procesar documentos?",
        text: `¿Está seguro de procesar ${selectedDocuments.length} documentos?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, procesar",
        cancelButtonText: "Cancelar",
      });

      if (!confirmResult.isConfirmed) return;

      // Show loading with a reference que podemos cerrar siempre
      setIsLoading(true);
      let loadingSwal = null;

      try {
        loadingSwal = Swal.fire({
          title: "Procesando documentos...",
          text: "Esto puede tomar un momento",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        // Ejecutar el procesamiento
        const result = await api.processDocumentsByMapping(
          accessToken,
          activeMappingId,
          selectedDocuments
        );

        // Cerrar modal de carga explícitamente
        if (loadingSwal) {
          loadingSwal.close();
        }

        setIsLoading(false);

        // Determinar icono basado en resultados
        let resultIcon = "success";
        if (
          result.data &&
          result.data.processed === 0 &&
          result.data.failed > 0
        ) {
          resultIcon = "error";
        } else if (result.data && result.data.failed > 0) {
          resultIcon = "warning";
        }

        // Determinar título basado en resultados
        let resultTitle = "Procesamiento completado";
        let resultMessage = "";

        if (resultIcon === "error") {
          resultTitle = "Procesamiento fallido";
          // Agregar mensajes específicos para ciertos códigos de error
          if (result.data?.details) {
            const connectionErrors = result.data.details.filter(
              (d) =>
                !d.success &&
                (d.errorCode === "CONNECTION_ERROR" ||
                  d.errorCode === "SEVERE_CONNECTION_ERROR")
            );

            if (connectionErrors.length > 0) {
              resultMessage =
                "Hubo problemas de conexión con la base de datos durante el procesamiento. ";
              if (connectionErrors.length < result.data.details.length) {
                resultMessage +=
                  "Algunos documentos fueron procesados correctamente.";
              }
            }
          }
        } else if (resultIcon === "warning") {
          resultTitle = "Procesamiento parcial";
          resultMessage =
            "Algunos documentos fueron procesados correctamente, pero otros fallaron.";
        }

        // Parse common error types for more readable messages
        const formatErrorMessage = (errMsg, errorCode) => {
          if (errorCode === "NULL_VALUE_ERROR") {
            return errMsg; // Ya está formateado correctamente
          } else if (errorCode === "TRUNCATION_ERROR") {
            return errMsg; // Ya está formateado correctamente
          } else if (errorCode === "CONNECTION_ERROR") {
            return "Error de conexión a la base de datos. Intente nuevamente.";
          } else if (errorCode === "SEVERE_CONNECTION_ERROR") {
            return "Error grave de conexión. Contacte al administrador del sistema.";
          }

          if (errMsg.includes("Cannot insert the value NULL into column")) {
            const colMatch = errMsg.match(/column '([^']+)'/);
            const colName = colMatch ? colMatch[1] : "desconocida";
            return `No se puede insertar NULL en columna '${colName}'. Configure un valor por defecto.`;
          } else if (
            errMsg.includes("String or binary data would be truncated")
          ) {
            const colMatch = errMsg.match(/column '([^']+)'/);
            const colName = colMatch ? colMatch[1] : "desconocida";
            return `Texto demasiado largo para columna '${colName}'. Verifique la longitud máxima.`;
          }
          return errMsg;
        };

        // Mostrar resumen detallado en un nuevo modal
        await Swal.fire({
          title: resultTitle,
          html: `
          <div class="result-summary">
            <p><strong>Resumen:</strong></p>
            <ul>
              <li>Procesados correctamente: ${result.data?.processed || 0}</li>
              <li>Fallidos: ${result.data?.failed || 0}</li>
              <li>Omitidos: ${result.data?.skipped || 0}</li>
            </ul>
            ${
              result.data?.failed > 0 ||
              (result.data?.errorDetails && result.data.errorDetails.length > 0)
                ? `<p><strong>Detalles de errores:</strong></p>
              <div class="error-details" style="max-height: 200px; overflow-y: auto; text-align: left;">
                ${
                  result.data?.errorDetails
                    ? result.data.errorDetails
                        .map(
                          (detail) => `<p class="error-detail-item">
                      <strong>Documento ${
                        detail.documentId
                      }:</strong> ${formatErrorMessage(
                            detail.error || "Error no especificado",
                            detail.errorCode
                          )}
                    </p>`
                        )
                        .join("")
                    : result.data?.details
                    ? result.data.details
                        .filter((detail) => !detail.success)
                        .map(
                          (detail) => `<p class="error-detail-item">
                      <strong>Documento ${
                        detail.documentId
                      }:</strong> ${formatErrorMessage(
                            detail.message ||
                              detail.error ||
                              "Error no especificado",
                            detail.errorCode
                          )}
                    </p>`
                        )
                        .join("")
                    : "<p>No hay detalles específicos del error disponibles.</p>"
                }
              </div>`
                : ""
            }
            ${resultMessage ? `<p>${resultMessage}</p>` : ""}
          </div>
        `,
          icon: resultIcon,
          width: 600,
          customClass: {
            htmlContainer: "document-processing-result",
          },
        });

        // Refresh documents and reset selection
        fetchDocuments();
        setSelectedDocuments([]);
        setSelectAll(false);
      } catch (error) {
        // Asegurarse de cerrar el modal si hay un error
        if (loadingSwal) {
          loadingSwal.close();
        }

        setIsLoading(false);

        console.error("Error completo del procesamiento:", error);

        let errorMessage = "Ocurrió un error al procesar los documentos";
        let errorDetails = "";

        // Intentar extraer información detallada del error
        if (error.response && error.response.data) {
          errorMessage = error.response.data.message || errorMessage;
          errorDetails = error.response.data.errorDetails || "";
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Mostrar el error
        Swal.fire({
          title: "Error en el procesamiento",
          html: `
          <div>
            <p>${errorMessage}</p>
            ${
              errorDetails
                ? `
              <div style="text-align: left; margin-top: 10px; padding: 10px; background: #f8f8f8; border-radius: 5px; max-height: 200px; overflow-y: auto;">
                <strong>Detalles técnicos:</strong><br>
                <pre style="white-space: pre-wrap; font-size: 12px;">${errorDetails}</pre>
              </div>
            `
                : ""
            }
          </div>
        `,
          icon: "error",
          width: 600,
        });
      } finally {
        // Asegurarse de que la bandera de carga se desactive
        setIsLoading(false);
        // Refrescar la lista de documentos para mostrar el estado actual
        fetchDocuments();
      }
    } catch (outerError) {
      // Manejar errores externos (problemas con confirmaciones, etc.)
      setIsLoading(false);
      console.error("Error externo en el proceso:", outerError);

      Swal.fire({
        title: "Error",
        text: outerError.message || "Ocurrió un error inesperado",
        icon: "error",
      });
    }
  }, [activeMappingId, accessToken, selectedDocuments, fetchDocuments]);

  // Handle mapping selection from list - con useCallback
  const handleSelectMapping = useCallback((mappingId) => {
    setActiveMappingId(mappingId);
    setActiveView("documents");
    setSelectedDocuments([]);
    setSelectAll(false);
  }, []);

  // Handle editing mapping - con useCallback
  const handleEditMapping = useCallback((mappingId) => {
    setEditingMappingId(mappingId);
    setActiveView("mappingEditor");
  }, []);

  // Handle creating new mapping - con useCallback
  const handleCreateMapping = useCallback(() => {
    setEditingMappingId(null);
    setActiveView("mappingEditor");
  }, []);

  // Handle save mapping - con useCallback
  const handleSaveMapping = useCallback(
    (result) => {
      if (result._id) {
        // If we're editing and this is also the active mapping, refresh data
        if (activeMappingId === result._id) {
          fetchDocuments();
          loadMappingConfig(result._id); // Reload config
        }
      }
      setActiveView("mappingsList");
    },
    [activeMappingId, fetchDocuments, loadMappingConfig]
  );

  // Render the appropriate view based on activeView state - con useCallback
  const renderView = useCallback(() => {
    switch (activeView) {
      case "mappingsList":
        return (
          <MappingsList
            onSelectMapping={handleSelectMapping}
            onEditMapping={handleEditMapping}
            onCreateMapping={handleCreateMapping}
          />
        );

      case "mappingEditor":
        return (
          <MappingEditor
            mappingId={editingMappingId}
            onSave={handleSaveMapping}
            onCancel={() => setActiveView("mappingsList")}
          />
        );

      case "documents":
        return (
          <>
            <NavigationContainer>
              {/* Back button to return to mappings list */}
              <BackButton onClick={() => setActiveView("mappingsList")}>
                <FaArrowLeft /> Volver a configuraciones
              </BackButton>

              {/* Configuration info panel */}
              <ConfigInfoButton
                onClick={() => setShowConfigInfo(!showConfigInfo)}
              >
                <FaInfoCircle /> {showConfigInfo ? "Ocultar" : "Mostrar"}{" "}
                Detalles de Configuración
              </ConfigInfoButton>
            </NavigationContainer>

            {showConfigInfo && (
              <ConfigInfoPanel>
                <h3>Configuración activa: {activeMappingName}</h3>
                <ConfigInfoSection>
                  <h4>Información General</h4>
                  <InfoItem>
                    <InfoLabel>Tipo de entidad:</InfoLabel>
                    <InfoValue>
                      {activeConfig?.entityType || "orders"}
                    </InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Tipo de transferencia:</InfoLabel>
                    <InfoValue>{activeConfig?.transferType || "N/A"}</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Servidor origen:</InfoLabel>
                    <InfoValue>{activeConfig?.sourceServer || "N/A"}</InfoValue>
                  </InfoItem>
                  <InfoItem>
                    <InfoLabel>Servidor destino:</InfoLabel>
                    <InfoValue>{activeConfig?.targetServer || "N/A"}</InfoValue>
                  </InfoItem>
                </ConfigInfoSection>

                <ConfigInfoSection>
                  <h4>Tipos de Documento</h4>
                  {activeConfig?.documentTypeRules?.length ? (
                    activeConfig.documentTypeRules.map((rule, index) => (
                      <RuleItem key={index}>
                        <div>
                          <strong>{rule.name}</strong>: {rule.sourceField} ={" "}
                          {rule.sourceValues.join(", ")}
                        </div>
                        {rule.description && <div>{rule.description}</div>}
                      </RuleItem>
                    ))
                  ) : (
                    <div>No hay reglas de tipo de documento definidas</div>
                  )}
                </ConfigInfoSection>

                <ConfigInfoSection>
                  <h4>Tablas</h4>
                  {activeConfig?.tableConfigs?.length ? (
                    activeConfig.tableConfigs.map((table, index) => (
                      <div
                        key={index}
                        className="table-info-item"
                        style={{
                          padding: "8px",
                          marginBottom: "8px",
                          backgroundColor: `${({ theme }) =>
                            theme.tableHeader || "#f0f0f0"}`,
                          borderRadius: "4px",
                        }}
                      >
                        <div>
                          <strong>{table.name}</strong> (
                          {table.isDetailTable ? "Detalle" : "Principal"})
                        </div>
                        <div>
                          Origen: {table.sourceTable} → Destino:{" "}
                          {table.targetTable}
                        </div>
                        <div>
                          Clave origen: {table.primaryKey || "N/A"} → Clave
                          destino: {table.targetPrimaryKey || "Auto-detectada"}
                        </div>
                        {table.isDetailTable && (
                          <>
                            <div>Padre: {table.parentTableRef || "N/A"}</div>
                            {table.useSameSourceTable && (
                              <div
                                style={{ color: "#e67e22", fontWeight: "bold" }}
                              >
                                Usa misma tabla de origen que el encabezado
                              </div>
                            )}
                          </>
                        )}
                        <div>
                          {table.fieldMappings?.length || 0} campos mapeados
                          <div
                            style={{
                              marginTop: "8px",
                              paddingLeft: "20px",
                              listStyleType: "none",
                            }}
                          >
                            {table.fieldMappings?.map((field, idx) => (
                              <div
                                key={idx}
                                style={{
                                  marginBottom: "4px",
                                  fontSize: "13px",
                                }}
                              >
                                {field.sourceField || "(sin origen)"} →{" "}
                                <strong>{field.targetField}</strong>
                                {field.removePrefix && (
                                  <span
                                    style={{
                                      color: "#e74c3c",
                                      marginLeft: "5px",
                                      fontSize: "11px",
                                    }}
                                  >
                                    (quitar prefijo: {field.removePrefix})
                                  </span>
                                )}
                                {field.defaultValue !== undefined && (
                                  <span
                                    style={{
                                      marginLeft: "5px",
                                      color: "#666",
                                      fontStyle: "italic",
                                      fontSize: "12px",
                                    }}
                                  >
                                    {field.isRequired ? "* " : ""}
                                    (default: {field.defaultValue})
                                  </span>
                                )}
                                {field.lookupFromTarget && (
                                  <span
                                    style={{
                                      marginLeft: "5px",
                                      color: "#3498db",
                                      fontSize: "11px",
                                    }}
                                  >
                                    (consulta en destino)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>No hay tablas configuradas</div>
                  )}
                </ConfigInfoSection>
                {activeConfig?.consecutiveConfig?.enabled && (
                  <ConfigInfoSection>
                    <h4>Configuración de Consecutivos</h4>
                    <InfoItem>
                      <InfoLabel>Último valor:</InfoLabel>
                      <InfoValue>
                        {activeConfig.consecutiveConfig.lastValue || 0}
                      </InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Campo en encabezado:</InfoLabel>
                      <InfoValue>
                        {activeConfig.consecutiveConfig.fieldName ||
                          "No definido"}
                      </InfoValue>
                    </InfoItem>
                    <InfoItem>
                      <InfoLabel>Campo en detalle:</InfoLabel>
                      <InfoValue>
                        {activeConfig.consecutiveConfig.detailFieldName ||
                          "No definido"}
                      </InfoValue>
                    </InfoItem>
                    {activeConfig.consecutiveConfig.applyToTables &&
                      activeConfig.consecutiveConfig.applyToTables.length >
                        0 && (
                        <>
                          <InfoLabel>Asignaciones específicas:</InfoLabel>
                          {activeConfig.consecutiveConfig.applyToTables.map(
                            (mapping, index) => (
                              <div
                                key={index}
                                style={{
                                  marginLeft: "20px",
                                  marginBottom: "5px",
                                }}
                              >
                                <strong>{mapping.tableName}</strong>:{" "}
                                {mapping.fieldName}
                              </div>
                            )
                          )}
                        </>
                      )}
                    {activeConfig.consecutiveConfig.prefix && (
                      <InfoItem>
                        <InfoLabel>Prefijo:</InfoLabel>
                        <InfoValue>
                          {activeConfig.consecutiveConfig.prefix}
                        </InfoValue>
                      </InfoItem>
                    )}
                    {activeConfig.consecutiveConfig.pattern && (
                      <InfoItem>
                        <InfoLabel>Formato:</InfoLabel>
                        <InfoValue>
                          {activeConfig.consecutiveConfig.pattern}
                        </InfoValue>
                      </InfoItem>
                    )}
                  </ConfigInfoSection>
                )}
              </ConfigInfoPanel>
            )}

            <ActionsContainer>
              <SearchInputContainer>
                <SearchInput
                  type="text"
                  placeholder="Buscar documento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </SearchInputContainer>

              {/* Filters Container */}
              <FiltersContainer>
                <FilterGroup>
                  <FilterLabel>Desde:</FilterLabel>
                  <DateInput
                    type="date"
                    value={filterValues.dateFrom}
                    onChange={(e) =>
                      setFilterValues((prev) => ({
                        ...prev,
                        dateFrom: e.target.value,
                      }))
                    }
                  />
                </FilterGroup>

                <FilterGroup>
                  <FilterLabel>Hasta:</FilterLabel>
                  <DateInput
                    type="date"
                    value={filterValues.dateTo}
                    onChange={(e) =>
                      setFilterValues((prev) => ({
                        ...prev,
                        dateTo: e.target.value,
                      }))
                    }
                  />
                </FilterGroup>

                <FilterGroup>
                  <FilterLabel>Estado:</FilterLabel>
                  <FilterSelect
                    value={filterValues.status}
                    onChange={(e) =>
                      setFilterValues((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="P">Pendientes</option>
                    <option value="F">Facturados</option>
                    <option value="A">Anulados</option>
                  </FilterSelect>
                </FilterGroup>

                <CheckboxContainer>
                  <CheckboxInput
                    type="checkbox"
                    id="showProcessed"
                    checked={filterValues.showProcessed}
                    onChange={(e) =>
                      setFilterValues((prev) => ({
                        ...prev,
                        showProcessed: e.target.checked,
                      }))
                    }
                  />
                  <CheckboxLabel htmlFor="showProcessed">
                    Mostrar procesados
                  </CheckboxLabel>
                </CheckboxContainer>

                <ResetFiltersButton
                  onClick={() =>
                    setFilterValues({
                      dateFrom: new Date(
                        new Date().setDate(new Date().getDate() - 30)
                      )
                        .toISOString()
                        .split("T")[0],
                      dateTo: new Date().toISOString().split("T")[0],
                      status: "all",
                      warehouse: "all",
                      showProcessed: false,
                    })
                  }
                >
                  Limpiar Filtros
                </ResetFiltersButton>
              </FiltersContainer>

              <ButtonsRow>
                <ActionButton
                  onClick={fetchDocuments}
                  title="Refrescar datos"
                  disabled={documentsRefreshing}
                  className={documentsRefreshing ? "refreshing" : ""}
                >
                  <FaSync className={documentsRefreshing ? "spinning" : ""} />
                  {documentsRefreshing ? "Actualizando..." : "Refrescar"}
                </ActionButton>

                <ActionButton
                  onClick={processDocuments}
                  title="Procesar documentos seleccionados"
                  disabled={isLoading || selectedDocuments.length === 0}
                >
                  <FaPlay /> Procesar Seleccionados
                </ActionButton>

                <ViewButtonsGroup>
                  <ViewButton
                    $active={viewMode === "table"}
                    onClick={() => setViewMode("table")}
                    title="Ver como tabla"
                  >
                    <FaTable /> Tabla
                  </ViewButton>
                  <ViewButton
                    $active={viewMode === "cards"}
                    onClick={() => setViewMode("cards")}
                    title="Ver como tarjetas"
                  >
                    <FaListAlt /> Tarjetas
                  </ViewButton>
                </ViewButtonsGroup>
              </ButtonsRow>

              <OrdersCountLabel>
                Mostrando {filteredDocuments.length} de {documents.length}{" "}
                documentos
                {selectedDocuments.length > 0 &&
                  ` | ${selectedDocuments.length} seleccionados`}
              </OrdersCountLabel>
            </ActionsContainer>

            {/* Contenedor principal con overlay de refresco */}
            <div style={{ position: "relative" }}>
              {/* Overlay de refresco */}
              {documentsRefreshing && (
                <RefreshOverlay>
                  <RefreshContent>
                    <FaSync className="refresh-icon-spin" />
                    <RefreshText>Actualizando documentos...</RefreshText>
                  </RefreshContent>
                </RefreshOverlay>
              )}

              {/* Loading state */}
              {documentsLoading && !documentsRefreshing && (
                <LoadingContainer>
                  <LoadingSpinner />
                  <LoadingMessage>Cargando documentos...</LoadingMessage>
                </LoadingContainer>
              )}

              {/* Error state */}
              {documentsError && <ErrorMessage>{documentsError}</ErrorMessage>}

              {/* No results state */}
              {!documentsLoading &&
                !documentsRefreshing &&
                filteredDocuments.length === 0 && (
                  <EmptyMessage>
                    No se encontraron documentos con los filtros seleccionados.
                  </EmptyMessage>
                )}

              {/* Loading overlay */}
              {isLoading && (
                <OverlayLoading>
                  <LoadingSpinner size="large" />
                </OverlayLoading>
              )}

              {/* Table view */}
              {!documentsLoading &&
                filteredDocuments.length > 0 &&
                viewMode === "table" && (
                  <TableContainer>
                    <StyledTable>
                      <thead>
                        <tr>
                          <th className="checkbox-column">
                            <CheckboxInput
                              type="checkbox"
                              checked={
                                selectAll ||
                                (selectedDocuments.length > 0 &&
                                  selectedDocuments.length ===
                                    filteredDocuments.length)
                              }
                              onChange={handleSelectAll}
                            />
                          </th>
                          {/* Mostrar solo encabezados de columnas marcadas como showInList */}
                          {activeConfig &&
                            activeConfig.tableConfigs &&
                            activeConfig.tableConfigs
                              .find((tc) => !tc.isDetailTable)
                              ?.fieldMappings.filter(
                                (field) => field.showInList
                              )
                              .sort(
                                (a, b) =>
                                  (a.displayOrder || 0) - (b.displayOrder || 0)
                              )
                              .map((field) => (
                                <th key={field.targetField}>
                                  {field.displayName || field.targetField}
                                </th>
                              ))}

                          {/* Si no hay configuración o ningún campo marcado, usar todos los campos */}
                          {(!activeConfig ||
                            !activeConfig.tableConfigs ||
                            !activeConfig.tableConfigs
                              .find((tc) => !tc.isDetailTable)
                              ?.fieldMappings.some((f) => f.showInList)) &&
                            Object.keys(filteredDocuments[0]).map((key) => (
                              <th key={key}>{key}</th>
                            ))}
                          <th className="actions-column">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocuments.map((document, index) => {
                          // Get document ID (assuming it's the first field)
                          const documentId = document[Object.keys(document)[0]];

                          return (
                            <tr key={index}>
                              <td className="checkbox-column">
                                <CheckboxInput
                                  type="checkbox"
                                  checked={selectedDocuments.includes(
                                    documentId
                                  )}
                                  onChange={() =>
                                    handleSelectDocument(documentId)
                                  }
                                />
                              </td>
                              {/* Mostrar solo campos marcados como showInList */}
                              {activeConfig &&
                                activeConfig.tableConfigs &&
                                activeConfig.tableConfigs
                                  .find((tc) => !tc.isDetailTable)
                                  ?.fieldMappings.filter(
                                    (field) => field.showInList
                                  )
                                  .sort(
                                    (a, b) =>
                                      (a.displayOrder || 0) -
                                      (b.displayOrder || 0)
                                  )
                                  .map((field) => (
                                    <td key={field.targetField}>
                                      {document[field.targetField] !== null
                                        ? document[field.targetField]
                                        : "N/A"}
                                    </td>
                                  ))}

                              {/* Si no hay configuración o ningún campo marcado, mostrar todos los campos */}
                              {(!activeConfig ||
                                !activeConfig.tableConfigs ||
                                !activeConfig.tableConfigs
                                  .find((tc) => !tc.isDetailTable)
                                  ?.fieldMappings.some((f) => f.showInList)) &&
                                Object.entries(document).map(([key, value]) => (
                                  <td key={key}>
                                    {value !== null ? value : "N/A"}
                                  </td>
                                ))}
                              <td className="actions-column">
                                <ActionButtons>
                                  {entityType === "customers" && (
                                    <TableActionButton
                                      title="Editar cliente"
                                      $color="#ffc107"
                                      onClick={() => handleEditEntity(document)}
                                    >
                                      <FaPencilAlt />
                                    </TableActionButton>
                                  )}

                                  <TableActionButton
                                    title="Ver detalles"
                                    $color="#007bff"
                                    onClick={() =>
                                      viewDocumentDetails(document)
                                    }
                                  >
                                    <FaEye />
                                  </TableActionButton>

                                  <TableActionButton
                                    title="Procesar documento"
                                    $color="#28a745"
                                    onClick={() => {
                                      setSelectedDocuments([documentId]);
                                      processDocuments();
                                    }}
                                  >
                                    <FaPlay />
                                  </TableActionButton>
                                </ActionButtons>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </StyledTable>
                  </TableContainer>
                )}

              {/* Cards view */}
              {!documentsLoading &&
                filteredDocuments.length > 0 &&
                viewMode === "cards" && (
                  <CardsContainer>
                    {filteredDocuments.map((document, index) => {
                      // Get document ID (assuming it's the first field)
                      const documentId = document[Object.keys(document)[0]];
                      // Get type/status field if exists (for styling)
                      const statusField = Object.keys(document).find(
                        (key) =>
                          key.toLowerCase().includes("estado") ||
                          key.toLowerCase().includes("status") ||
                          key.toLowerCase().includes("type")
                      );
                      const status = statusField ? document[statusField] : null;

                      return (
                        <OrderCard
                          key={index}
                          $selected={selectedDocuments.includes(documentId)}
                          $status={status}
                        >
                          <CardHeader>
                            <CardTitle>{documentId}</CardTitle>
                            {status && (
                              <StatusBadge status={status}>
                                {status}
                              </StatusBadge>
                            )}
                          </CardHeader>

                          <CardContent>
                            <CardInfo>
                              {Object.entries(document)
                                .filter(
                                  ([key]) =>
                                    key !== Object.keys(document)[0] &&
                                    key !== statusField
                                )
                                .map(([key, value]) => (
                                  <InfoItem key={key}>
                                    <InfoLabel>{key}:</InfoLabel>
                                    <InfoValue>
                                      {value !== null ? value : "N/A"}
                                    </InfoValue>
                                  </InfoItem>
                                ))}
                            </CardInfo>
                          </CardContent>

                          <CardActions>
                            <CardCheckbox>
                              <CheckboxInput
                                type="checkbox"
                                checked={selectedDocuments.includes(documentId)}
                                onChange={() =>
                                  handleSelectDocument(documentId)
                                }
                              />
                              <span>Seleccionar</span>
                            </CardCheckbox>

                            <ActionButtonsContainer>
                              <ActionRow>
                                {entityType === "customers" && (
                                  <CardActionButton
                                    $color="#ffc107"
                                    onClick={() => handleEditEntity(document)}
                                    title="Editar cliente"
                                  >
                                    <FaPencilAlt />
                                  </CardActionButton>
                                )}

                                <CardActionButton
                                  $color="#007bff"
                                  onClick={() => viewDocumentDetails(document)}
                                  title="Ver detalles"
                                >
                                  <FaEye />
                                </CardActionButton>

                                <CardActionButton
                                  $color="#28a745"
                                  onClick={() => {
                                    setSelectedDocuments([documentId]);
                                    processDocuments();
                                  }}
                                  title="Procesar documento"
                                >
                                  <FaPlay />
                                </CardActionButton>
                              </ActionRow>
                            </ActionButtonsContainer>
                          </CardActions>
                        </OrderCard>
                      );
                    })}
                  </CardsContainer>
                )}

              {/* Entity Editor Modal */}
              {showEntityEditor && renderEntityEditor()}
            </div>
          </>
        );

      default:
        return <div>Vista no encontrada</div>;
    }
  }, [
    activeView,
    editingMappingId,
    handleSelectMapping,
    handleEditMapping,
    handleCreateMapping,
    handleSaveMapping,
    activeMappingName,
    showConfigInfo,
    activeConfig,
    search,
    filterValues,
    documents.length,
    filteredDocuments,
    documentsLoading,
    documentsRefreshing,
    documentsError,
    isLoading,
    selectAll,
    selectedDocuments,
    viewMode,
    entityType,
    handleSelectAll,
    handleSelectDocument,
    handleEditEntity,
    viewDocumentDetails,
    fetchDocuments,
    processDocuments,
    renderEntityEditor,
    showEntityEditor,
  ]);

  return (
    <>
      <ToolbarContainer>
        <InfoSection>
          <h2>Gestión de Documentos</h2>
          <p>
            {activeView === "mappingsList" &&
              "Seleccione una configuración de mapeo para comenzar"}
            {activeView === "mappingEditor" &&
              "Configure los parámetros de mapeo entre servidores"}
            {activeView === "documents" &&
              "Visualice y procese los documentos según la configuración seleccionada"}
          </p>
        </InfoSection>
      </ToolbarContainer>

      <section className="main">{renderView()}</section>
    </>
  );
}

// Estilos para el overlay de refresco
const RefreshOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
  animation: fadeIn 0.2s ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const RefreshContent = styled.div`
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  .refresh-icon-spin {
    font-size: 24px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const RefreshText = styled.div`
  font-size: 14px;
  font-weight: 500;
`;

// Estilos existentes de tu componente original
const Container = styled.div`
  padding: 20px;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 15px 0;
`;

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 5px;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.title || theme.text};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }
`;

const NavigationContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin-bottom: 15px;
  position: relative;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 10px;
  }
`;

// Back button
const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin: 5px;
  transition: background-color 0.3s, transform 0.2s;

  &:hover {
    background-color: ${(props) => props.theme.secondaryHover};
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

// Config Info Button y Panel
const ConfigInfoButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  margin: 5px;
  transition: background-color 0.3s, transform 0.2s;
  &:hover {
    background-color: ${(props) => props.theme.secondaryHover};
  }
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const ConfigInfoPanel = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 15px;
  margin-bottom: 20px;
`;

const ConfigInfoSection = styled.div`
  margin-bottom: 15px;

  h4 {
    margin-top: 10px;
    margin-bottom: 8px;
    color: ${({ theme }) => theme.primary};
    border-bottom: 1px solid ${({ theme }) => theme.border};
    padding-bottom: 4px;
  }
`;

const InfoItem = styled.div`
  display: flex;
  margin-bottom: 5px;
`;

const InfoLabel = styled.div`
  width: 150px;
  font-weight: 500;
`;

const InfoValue = styled.div`
  flex: 1;
`;

// Actions Container
const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const SearchInputContainer = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  margin-bottom: 10px;
`;

const SearchInput = styled.input`
  width: 100%;
  max-width: 800px;
  padding: 10px 15px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background-color: ${({ theme }) => theme.inputBg || "#fff"};

  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

// Filters
const FiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 15px;
  justify-content: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;

  @media (max-width: 768px) {
    width: 100%;
    max-width: 300px;
  }
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  white-space: nowrap;
`;

const FilterSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  color: ${({ theme }) => theme.text};

  @media (max-width: 768px) {
    flex: 1;
  }
`;

const DateInput = styled.input`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  background-color: ${({ theme }) => theme.inputBg || "#fff"};
  color: ${({ theme }) => theme.text};

  @media (max-width: 768px) {
    flex: 1;
  }
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const CheckboxInput = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  cursor: pointer;
`;

const ResetFiltersButton = styled.button`
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #5a6268;
  }

  @media (max-width: 768px) {
    width: 100%;
    max-width: 300px;
  }
`;

// Buttons row
const ButtonsRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;

  @media (max-width: 480px) {
    flex-direction: column;
    width: 100%;
  }
`;

const ActionButton = styled.button`
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 15px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;

  &:hover {
    background-color: #138496;
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  /* Estilo especial cuando está refrescando */
  &.refreshing {
    background-color: #6c757d;
    animation: pulse 2s infinite;
  }

  /* Animación para el ícono */
  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(23, 162, 184, 0.7);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(23, 162, 184, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(23, 162, 184, 0);
    }
  }

  @media (max-width: 480px) {
    width: 100%;
  }
`;

const ViewButtonsGroup = styled.div`
  display: flex;
  margin-left: 10px;
`;

const ViewButton = styled.button`
  background-color: ${(props) => (props.$active ? "#6c757d" : "#f8f9fa")};
  color: ${(props) => (props.$active ? "white" : "#212529")};
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;

  &:hover {
    background-color: ${(props) => (props.$active ? "#5a6268" : "#e2e6ea")};
  }

  @media (max-width: 480px) {
    flex: 1;
  }
`;

const OrdersCountLabel = styled.div`
  text-align: center;
  margin-bottom: 15px;
  font-size: 14px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

// Loading y Error
const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 200px;
  gap: 15px;
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: ${(props) => (props.size === "large" ? "60px" : "40px")};
  height: ${(props) => (props.size === "large" ? "60px" : "40px")};
  border: 4px solid rgba(23, 162, 184, 0.2);
  border-radius: 50%;
  border-top-color: #17a2b8;
  animation: spinner-rotate 1s linear infinite;

  &::after {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    bottom: 4px;
    border: 3px solid transparent;
    border-top-color: #17a2b8;
    border-radius: 50%;
    animation: spinner-rotate 0.8s linear infinite reverse;
  }

  @keyframes spinner-rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.textSecondary || "#666"};
`;

const OverlayLoading = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;

  /* Agregar una animación sutil de fade-in */
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const ErrorMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 8px;
  margin: 20px 0;
`;

const EmptyMessage = styled.div`
  padding: 30px;
  text-align: center;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

// Table View
const TableContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  overflow-x: auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  -webkit-overflow-scrolling: touch; /* Para mejor scroll en iOS */

  @media (max-width: 576px) {
    margin-left: -10px;
    margin-right: -10px;
    width: calc(100% + 20px);
    border-radius: 0;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  color: ${({ theme }) => theme.text};

  th,
  td {
    padding: 12px 15px;
    text-align: left;
  }

  th {
    background-color: ${({ theme }) => theme.tableHeader || "#f0f0f0"};
    color: ${({ theme }) => theme.tableHeaderText || "#333"};
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  tr {
    border-bottom: 1px solid ${({ theme }) => theme.border || "#ddd"};

    &:hover {
      background-color: ${({ theme }) => theme.tableHover || "#f8f9fa"};
    }
  }

  .checkbox-column {
    width: 40px;
    text-align: center;
  }

  .actions-column {
    width: 100px;
    text-align: center;
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  background-color: ${(props) => {
    if (typeof props.status === "string") {
      const status = props.status.toUpperCase();
      if (status === "P" || status.includes("PEND")) return "#17a2b8";
      if (status === "F" || status.includes("FACT")) return "#28a745";
      if (status === "A" || status.includes("ANUL")) return "#dc3545";
    }
    return "#6c757d"; // Default
  }};
  color: white;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 5px;
  justify-content: center;
`;

const TableActionButton = styled.button`
  background: none;
  border: none;
  color: ${(props) => props.$color || "#0275d8"};
  font-size: 16px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => props.$color || "#0275d8"};
    background-color: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    color: #adb5bd;
    cursor: not-allowed;
  }
`;

// Cards View
const CardsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  padding: 10px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

const OrderCard = styled.div`
  width: 320px;
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-left: 4px solid
    ${(props) => {
      if (props.$selected) return "#007bff";
      if (typeof props.$status === "string") {
        const status = props.$status.toUpperCase();
        if (status === "P" || status.includes("PEND")) return "#17a2b8";
        if (status === "F" || status.includes("FACT")) return "#28a745";
        if (status === "A" || status.includes("ANUL")) return "#dc3545";
      }
      return "#6c757d"; // Default
    }};
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  padding: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => theme.cardHeaderBg || "#f8f9fa"};
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.title || theme.text};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 10px;
`;

const CardContent = styled.div`
  padding: 15px;
  flex: 1;
`;

const CardInfo = styled.div`
  margin-bottom: 15px;
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  padding: 15px;
  border-top: 1px solid ${({ theme }) => theme.border || "#eee"};
  background-color: ${({ theme }) => theme.cardFooterBg || "#f8f9fa"};
  justify-content: space-between;
  align-items: center;
`;

const CardCheckbox = styled.label`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  cursor: pointer;
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
`;

const CardActionButton = styled.button`
  padding: 8px;
  border: none;
  border-radius: 4px;
  background-color: ${(props) => props.$color || "#6c757d"};
  color: white;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;

  &:hover {
    filter: brightness(90%);
  }

  &:disabled {
    background-color: #adb5bd;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

// Editor overlay
const EditorOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
`;

const EditorContainer = styled.div`
  background-color: ${({ theme }) => theme.cardBg || "#fff"};
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  padding: 20px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
`;

const RuleItem = styled.div`
  padding: 5px 0;
  border-bottom: 1px dashed ${({ theme }) => theme.border};
`;

export default DocumentsVisualization;
