import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ConsecutiveConfigSection, TransferApi, useAuth } from "../../index";
import {
  FaSave,
  FaPlus,
  FaTrash,
  FaTimes,
  FaEdit,
  FaToggleOn,
  FaToggleOff,
  FaCog,
  FaInfoCircle,
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

    // Nuevo procesador de bonificaciones
    bonificationProcessor: {
      enabled: false,
      detailTable: "FAC_DET_PED",
      groupByField: "NUM_PED",
      lineNumberField: "NUM_LN",
      bonificationMarkerField: "ART_BON",
      bonificationMarkerValue: "B",
      regularMarkerValue: "0",
      articleCodeField: "COD_ART",
      bonificationRefField: "COD_ART_RFR",
      targetLineField: "PEDIDO_LINEA",
      targetBonifRefField: "PEDIDO_LINEA_BONIF",
      preserveOriginalOrder: false,
      createOrphanBonifications: true,
      logLevel: "detailed",
    },

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
        // ✅ CORRECCIÓN: Validación completa de datos
        const processedData = {
          ...data,
          // Asegurar que tableConfigs sea siempre un array válido
          tableConfigs: Array.isArray(data.tableConfigs)
            ? data.tableConfigs
            : [],

          // Asegurar configuraciones por defecto para bonificaciones
          bonificationProcessor: data.bonificationProcessor || {
            enabled: false,
            detailTable: "FAC_DET_PED",
            groupByField: "NUM_PED",
            lineNumberField: "NUM_LN",
            bonificationMarkerField: "ART_BON",
            bonificationMarkerValue: "B",
            regularMarkerValue: "0",
            articleCodeField: "COD_ART",
            bonificationRefField: "COD_ART_RFR",
            targetLineField: "PEDIDO_LINEA",
            targetBonifRefField: "PEDIDO_LINEA_BONIF",
            preserveOriginalOrder: false,
            createOrphanBonifications: true,
            logLevel: "detailed",
          },

          markProcessedConfig: data.markProcessedConfig || {
            batchSize: 100,
            includeTimestamp: true,
            timestampField: "LAST_PROCESSED_DATE",
            allowRollback: false,
          },

          // Asegurar otros arrays
          documentTypeRules: Array.isArray(data.documentTypeRules)
            ? data.documentTypeRules
            : [],
          foreignKeyDependencies: Array.isArray(data.foreignKeyDependencies)
            ? data.foreignKeyDependencies
            : [],
        };

        // ✅ CORRECCIÓN: Validar cada tableConfig individualmente
        processedData.tableConfigs = processedData.tableConfigs.map(
          (tableConfig) => ({
            ...tableConfig,
            // Asegurar propiedades obligatorias
            name: tableConfig.name || "",
            sourceTable: tableConfig.sourceTable || "",
            targetTable: tableConfig.targetTable || "",
            primaryKey: tableConfig.primaryKey || "",
            targetPrimaryKey: tableConfig.targetPrimaryKey || "",
            isDetailTable: !!tableConfig.isDetailTable,
            parentTableRef: tableConfig.parentTableRef || null,
            useSameSourceTable: !!tableConfig.useSameSourceTable,
            orderByColumn: tableConfig.orderByColumn || null,
            filterCondition: tableConfig.filterCondition || null,
            fieldMappings: Array.isArray(tableConfig.fieldMappings)
              ? tableConfig.fieldMappings
              : [],
          })
        );

        setMapping(processedData);
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

  const handleToggleBonifications = () => {
    setMapping((prev) => ({
      ...prev,
      bonificationProcessor: {
        ...prev.bonificationProcessor,
        enabled: !prev.bonificationProcessor?.enabled,
      },
    }));
  };

  const updateBonifConfig = (field, value) => {
    setMapping((prev) => ({
      ...prev,
      bonificationProcessor: {
        ...prev.bonificationProcessor,
        [field]: value,
      },
    }));
  };

  // ✅ CORRECCIÓN: Función addTableConfig con validación
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
            <label for="useSameSourceTable">¿Usar misma tabla origen?</label>
          </div>
          <div class="form-group">
            <label for="orderByColumn">Campo de ordenamiento</label>
            <input id="orderByColumn" class="swal2-input" placeholder="Ej: NUM_LN">
          </div>
          <div class="form-group">
            <label for="filterCondition">Condición de filtro</label>
            <input id="filterCondition" class="swal2-input" placeholder="Ej: ESTADO = 'A'">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Manejar visibilidad de opciones de detalle
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
          useSameSourceTable,
          orderByColumn: orderByColumn || null,
          filterCondition: filterCondition || null,
          fieldMappings: [],
        };
      },
    }).then((result) => {
      if (result.isConfirmed) {
        setMapping((prev) => ({
          ...prev,
          tableConfigs: [...(prev.tableConfigs || []), result.value],
        }));
      }
    });
  };

  // ✅ CORRECCIÓN: Función removeTableConfig con validación
  const removeTableConfig = (index) => {
    if (
      !mapping.tableConfigs ||
      index < 0 ||
      index >= mapping.tableConfigs.length
    ) {
      return;
    }

    const newConfigs = [...mapping.tableConfigs];
    newConfigs.splice(index, 1);
    setMapping({
      ...mapping,
      tableConfigs: newConfigs,
    });
  };

  // ✅ CORRECCIÓN: Función editTableConfig con validación
  const editTableConfig = (index) => {
    if (
      !mapping.tableConfigs ||
      index < 0 ||
      index >= mapping.tableConfigs.length
    ) {
      return;
    }

    const tableConfig = mapping.tableConfigs[index];

    // Asegurar que tableConfig tenga todas las propiedades necesarias
    const safeTableConfig = {
      name: tableConfig.name || "",
      sourceTable: tableConfig.sourceTable || "",
      targetTable: tableConfig.targetTable || "",
      primaryKey: tableConfig.primaryKey || "",
      targetPrimaryKey: tableConfig.targetPrimaryKey || "",
      isDetailTable: !!tableConfig.isDetailTable,
      parentTableRef: tableConfig.parentTableRef || "",
      useSameSourceTable: !!tableConfig.useSameSourceTable,
      orderByColumn: tableConfig.orderByColumn || "",
      filterCondition: tableConfig.filterCondition || "",
    };

    Swal.fire({
      title: "Editar Configuración de Tabla",
      html: `
        <div class="form-group">
          <label for="tableName">Nombre</label>
          <input id="tableName" class="swal2-input" value="${
            safeTableConfig.name
          }" placeholder="Ej: pedidosHeader">
        </div>
        <div class="form-group">
          <label for="sourceTable">Tabla origen</label>
          <input id="sourceTable" class="swal2-input" value="${
            safeTableConfig.sourceTable
          }" placeholder="Ej: FAC_ENC_PED">
        </div>
        <div class="form-group">
          <label for="targetTable">Tabla destino</label>
          <input id="targetTable" class="swal2-input" value="${
            safeTableConfig.targetTable
          }" placeholder="Ej: PEDIDO">
        </div>
        <div class="form-group">
          <label for="primaryKey">Clave primaria en tabla origen</label>
          <input id="primaryKey" class="swal2-input" value="${
            safeTableConfig.primaryKey
          }" placeholder="Ej: NUM_PED">
        </div>
        <div class="form-group">
          <label for="targetPrimaryKey">Clave primaria en tabla destino</label>
          <input id="targetPrimaryKey" class="swal2-input" value="${
            safeTableConfig.targetPrimaryKey
          }" placeholder="Ej: PEDIDO">
        </div>
        <div class="form-check">
          <input type="checkbox" id="isDetailTable" class="swal2-checkbox" ${
            safeTableConfig.isDetailTable ? "checked" : ""
          }>
          <label for="isDetailTable">¿Es tabla de detalle?</label>
        </div>
        <div id="detailOptions" style="display: ${
          safeTableConfig.isDetailTable ? "block" : "none"
        }; margin-left: 20px; padding-left: 10px; border-left: 2px solid #eee;">
          <div class="form-group">
            <label for="parentTableRef">Referencia a tabla padre</label>
            <input id="parentTableRef" class="swal2-input" value="${
              safeTableConfig.parentTableRef
            }" placeholder="Ej: pedidosHeader">
          </div>
          <div class="form-check">
            <input type="checkbox" id="useSameSourceTable" class="swal2-checkbox" ${
              safeTableConfig.useSameSourceTable ? "checked" : ""
            }>
            <label for="useSameSourceTable">¿Usar misma tabla origen?</label>
          </div>
          <div class="form-group">
            <label for="orderByColumn">Campo de ordenamiento</label>
            <input id="orderByColumn" class="swal2-input" value="${
              safeTableConfig.orderByColumn
            }" placeholder="Ej: NUM_LN">
          </div>
          <div class="form-group">
            <label for="filterCondition">Condición de filtro</label>
            <input id="filterCondition" class="swal2-input" value="${
              safeTableConfig.filterCondition
            }" placeholder="Ej: ESTADO = 'A'">
          </div>
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
          ...tableConfig,
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
        };
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const newTableConfigs = [...mapping.tableConfigs];
        newTableConfigs[index] = result.value;
        setMapping({
          ...mapping,
          tableConfigs: newTableConfigs,
        });
      }
    });
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

    if (!mapping.tableConfigs || mapping.tableConfigs.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Configuración incompleta",
        text: "Debe configurar al menos una tabla",
      });
      return;
    }

    // Validación específica para bonificaciones
    if (mapping.bonificationProcessor?.enabled) {
      const processor = mapping.bonificationProcessor;
      if (
        !processor.detailTable ||
        !processor.groupByField ||
        !processor.bonificationMarkerField ||
        !processor.articleCodeField ||
        !processor.bonificationRefField ||
        !processor.targetLineField
      ) {
        Swal.fire({
          icon: "warning",
          title: "Configuración del procesador incompleta",
          text: "Todos los campos del procesador de bonificaciones son obligatorios",
        });
        return;
      }
    }

    // ✅ CORRECCIÓN: Asegurar propiedades de campos con validación
    const mappingCopy = JSON.parse(JSON.stringify(mapping));

    if (mappingCopy.tableConfigs) {
      mappingCopy.tableConfigs.forEach((tableConfig) => {
        if (
          tableConfig.fieldMappings &&
          Array.isArray(tableConfig.fieldMappings)
        ) {
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
    }

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
        onSave(result.data);
      } else {
        Swal.fire({
          icon: "error",
          title: "Error al guardar",
          text: result.message || "No se pudo guardar la configuración",
        });
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo guardar la configuración",
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ CORRECCIÓN: Renderizado con validaciones
  if (loading) {
    return <div>Cargando...</div>;
  }

  return (
    <Container>
      <Header>
        <h2>{isEditing ? "Editar" : "Nueva"} Configuración de Mapeo</h2>
        <ButtonsGroup>
          <Button onClick={handleSave} disabled={loading}>
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
          $active={activeTab === "bonifications"}
          onClick={() => setActiveTab("bonifications")}
        >
          Bonificaciones
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
                value={mapping.name || ""}
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

            <FormRow>
              <FormGroup>
                <Label>Tipo de Transferencia</Label>
                <Select
                  name="transferType"
                  value={mapping.transferType || "down"}
                  onChange={handleChange}
                >
                  <option value="down">Servidor Central → Sucursal</option>
                  <option value="up">Sucursal → Servidor Central</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Estado</Label>
                <Select
                  name="active"
                  value={mapping.active}
                  onChange={handleChange}
                >
                  <option value={true}>Activo</option>
                  <option value={false}>Inactivo</option>
                </Select>
              </FormGroup>
            </FormRow>
          </Section>
        )}

        {/* Pestaña Bonificaciones */}
        {activeTab === "bonifications" && (
          <Section>
            <SectionHeader>
              <h3>Procesador de Bonificaciones</h3>
              <ToggleButton
                $active={mapping.bonificationProcessor?.enabled}
                onClick={handleToggleBonifications}
              >
                {mapping.bonificationProcessor?.enabled
                  ? "Habilitado"
                  : "Deshabilitado"}
              </ToggleButton>
            </SectionHeader>

            <InfoCard>
              <h4>🎯 Algoritmo Inteligente de Bonificaciones</h4>
              <p>
                Sistema automático que identifica, clasifica y reorganiza
                productos regulares y sus bonificaciones asociadas durante la
                transferencia de datos.
              </p>
            </InfoCard>

            {mapping.bonificationProcessor?.enabled && (
              <ConfigGrid>
                <ConfigSection>
                  <h4>📋 Configuración de Origen</h4>

                  <FormGroup>
                    <Label>Tabla de Detalles</Label>
                    <Input
                      value={
                        mapping.bonificationProcessor?.detailTable ||
                        "FAC_DET_PED"
                      }
                      onChange={(e) =>
                        updateBonifConfig("detailTable", e.target.value)
                      }
                      placeholder="FAC_DET_PED"
                    />
                  </FormGroup>

                  <FormGroup>
                    <Label>Campo de Agrupación</Label>
                    <Input
                      value={
                        mapping.bonificationProcessor?.groupByField || "NUM_PED"
                      }
                      onChange={(e) =>
                        updateBonifConfig("groupByField", e.target.value)
                      }
                      placeholder="NUM_PED"
                    />
                  </FormGroup>

                  <FormGroup>
                    <Label>Campo Número de Línea</Label>
                    <Input
                      value={
                        mapping.bonificationProcessor?.lineNumberField ||
                        "NUM_LN"
                      }
                      onChange={(e) =>
                        updateBonifConfig("lineNumberField", e.target.value)
                      }
                      placeholder="NUM_LN"
                    />
                  </FormGroup>
                </ConfigSection>
              </ConfigGrid>
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

            {!mapping.tableConfigs || mapping.tableConfigs.length === 0 ? (
              <EmptyMessage>No hay tablas configuradas</EmptyMessage>
            ) : (
              mapping.tableConfigs.map((tableConfig, tableIndex) => {
                // ✅ CORRECCIÓN: Validación de tableConfig antes de renderizar
                if (!tableConfig) {
                  return null;
                }

                return (
                  <Card key={tableIndex} $isDetail={tableConfig.isDetailTable}>
                    <CardHeader>
                      <h4>{tableConfig.name || "Tabla sin nombre"}</h4>
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
                            {tableConfig.sourceTable || "No definida"}
                          </PropertyValue>
                        </PropertyItem>

                        <PropertyItem>
                          <PropertyLabel>Tabla destino:</PropertyLabel>
                          <PropertyValue>
                            {tableConfig.targetTable || "No definida"}
                          </PropertyValue>
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
                            {tableConfig.isDetailTable
                              ? "Detalle"
                              : "Principal"}
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

                        {!tableConfig.fieldMappings ||
                        tableConfig.fieldMappings.length === 0 ? (
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
                                (field, fieldIndex) => {
                                  // ✅ CORRECCIÓN: Validación de field antes de renderizar
                                  if (!field) {
                                    return null;
                                  }

                                  return (
                                    <tr key={fieldIndex}>
                                      <td>{field.sourceField || "-"}</td>
                                      <td>{field.targetField || "-"}</td>
                                      <td>
                                        {field.defaultValue !== undefined
                                          ? String(field.defaultValue)
                                          : "-"}
                                      </td>
                                      <td>
                                        {field.isSqlFunction ? "Sí" : "No"}
                                      </td>
                                      <td>
                                        {field.valueMappings &&
                                        field.valueMappings.length > 0
                                          ? field.valueMappings.length
                                          : 0}
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
                                  );
                                }
                              )}
                            </tbody>
                          </Table>
                        )}
                      </SubSection>
                    </CardBody>
                  </Card>
                );
              })
            )}
          </Section>
        )}
      </Content>
    </Container>
  );
}

// ✅ Styled Components (mantén los mismos que tienes)
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
  padding-bottom: 20px;
  border-bottom: 1px solid #e0e0e0;

  h2 {
    margin: 0;
    color: #333;
  }
`;

const ButtonsGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const Button = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;

  ${(props) =>
    props.$secondary
      ? `
    background-color: #6c757d;
    color: white;
    &:hover { background-color: #5a6268; }
  `
      : `
    background-color: #007bff;
    color: white;
    &:hover { background-color: #0056b3; }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Tabs = styled.div`
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 30px;
`;

const Tab = styled.button`
  padding: 12px 24px;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 500;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;

  ${(props) =>
    props.$active
      ? `
    color: #007bff;
    border-bottom-color: #007bff;
    background-color: #f8f9fa;
  `
      : `
    color: #6c757d;
    &:hover {
      color: #007bff;
      background-color: #f8f9fa;
    }
  `}
`;

const Content = styled.div`
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
`;

const Section = styled.div`
  margin-bottom: 40px;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    color: #333;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;

  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const SmallButton = styled.button`
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;

  ${(props) =>
    props.$danger
      ? `
    background-color: #dc3545;
    color: white;
    &:hover { background-color: #c82333; }
  `
      : `
    background-color: #28a745;
    color: white;
    &:hover { background-color: #218838; }
  `}
`;

const ToggleButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;

  ${(props) =>
    props.$active
      ? `
    background-color: #28a745;
    color: white;
  `
      : `
    background-color: #6c757d;
    color: white;
  `}
`;

const InfoCard = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;

  h4 {
    margin: 0 0 10px 0;
    color: #495057;
  }

  p {
    margin: 0;
    color: #6c757d;
    line-height: 1.5;
  }
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
`;

const ConfigSection = styled.div`
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;

  h4 {
    margin: 0 0 20px 0;
    color: #495057;
  }
`;

const Card = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
  ${(props) => props.$isDetail && `border-left: 4px solid #28a745;`}
`;

const CardHeader = styled.div`
  background: #f8f9fa;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h4 {
    margin: 0;
    color: #333;
  }

  .button_container {
    display: flex;
    gap: 5px;
  }
`;

const CardBody = styled.div`
  padding: 20px;
`;

const PropertyList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
`;

const PropertyItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const PropertyLabel = styled.span`
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
  margin-bottom: 5px;
`;

const PropertyValue = styled.span`
  font-size: 14px;
  color: #333;
  font-weight: 500;
`;

const SubSection = styled.div`
  border-top: 1px solid #e0e0e0;
  padding-top: 20px;
`;

const SubSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;

  h5 {
    margin: 0;
    color: #333;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
  }

  th {
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
  }

  tr:hover {
    background: #f8f9fa;
  }
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 40px;
  color: #6c757d;
  font-style: italic;
`;
