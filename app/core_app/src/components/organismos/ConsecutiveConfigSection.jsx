import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";
import { TransferApi, useAuth } from "../../index";

const api = new TransferApi();

const ConsecutiveConfigSection = ({ mapping = {}, handleChange }) => {
  const { accessToken } = useAuth();

  // Acceso seguro a la configuración de consecutivos
  const consecutiveConfig = mapping.consecutiveConfig || {};
  const isEnabled = consecutiveConfig.enabled || false;

  // Estados para manejar consecutivos centralizados
  const [assignedConsecutives, setAssignedConsecutives] = useState([]);
  const [selectedCentralizedConsecutive, setSelectedCentralizedConsecutive] =
    useState("");
  const [useCentralizedSystem, setUseCentralizedSystem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableMappings, setTableMappings] = useState(
    consecutiveConfig.applyToTables || []
  );

  // Cargar consecutivos asignados al mapping actual
  const loadAssignedConsecutives = useCallback(async () => {
    if (!mapping?._id || !accessToken) return;

    try {
      setLoading(true);
      const response = await api.getConsecutivesByEntity(
        accessToken,
        "mapping",
        mapping._id
      );

      if (response?.success && response.data?.length > 0) {
        setAssignedConsecutives(response.data);
        setSelectedCentralizedConsecutive(response.data[0]._id);
        setUseCentralizedSystem(true);

        // Sincronizar con el estado principal del mapping
        updateCentralizedSystemConfig(true, response.data[0]._id);
      } else {
        setUseCentralizedSystem(false);
      }
    } catch (error) {
      console.error("Error al cargar consecutivos asignados:", error);
      setUseCentralizedSystem(false);
    } finally {
      setLoading(false);
    }
  }, [mapping._id, accessToken]);

  // Efecto para cargar consecutivos cuando cambie el mapping
  useEffect(() => {
    loadAssignedConsecutives();
  }, [loadAssignedConsecutives]);

  // Efecto para sincronizar table mappings
  useEffect(() => {
    setTableMappings(consecutiveConfig.applyToTables || []);
  }, [consecutiveConfig.applyToTables]);

  // Obtener tablas disponibles de la configuración
  const availableTables = React.useMemo(() => {
    if (!mapping.tableConfigs) return [];

    return mapping.tableConfigs.map((config) => ({
      name: config.name,
      isDetail: config.isDetailTable || false,
      fields: (config.fieldMappings || []).map((field) => field.targetField),
    }));
  }, [mapping.tableConfigs]);

  // Función para actualizar la configuración del sistema centralizado
  const updateCentralizedSystemConfig = (isUsing, consecutiveId = null) => {
    const updatedConfig = {
      ...consecutiveConfig,
      useCentralizedSystem: isUsing,
      selectedCentralizedConsecutive: consecutiveId,
    };

    const event = {
      target: {
        name: "consecutiveConfig",
        value: updatedConfig,
        type: "custom",
      },
    };

    handleChange(event);
  };

  // Manejar cambio de sistema (local vs centralizado)
  const handleSystemChange = (event) => {
    const isCentralized = event.target.value === "centralized";
    setUseCentralizedSystem(isCentralized);
    updateCentralizedSystemConfig(
      isCentralized,
      isCentralized ? selectedCentralizedConsecutive : null
    );
  };

  // Manejar cambio de consecutivo seleccionado
  const handleConsecutiveChange = (event) => {
    const consecutiveId = event.target.value;
    setSelectedCentralizedConsecutive(consecutiveId);
    updateCentralizedSystemConfig(true, consecutiveId);
  };

  // Ver detalles del consecutivo centralizado
  const handleViewConsecutiveDetails = async () => {
    if (!selectedCentralizedConsecutive) return;

    try {
      setLoading(true);
      const response = await api.getConsecutiveById(
        accessToken,
        selectedCentralizedConsecutive
      );

      if (response.success && response.data) {
        const consec = response.data;
        await Swal.fire({
          title: `Consecutivo: ${consec.name}`,
          html: `
            <div style="text-align: left; padding: 10px;">
              <p><strong>Descripción:</strong> ${
                consec.description || "N/A"
              }</p>
              <p><strong>Valor actual:</strong> ${consec.currentValue}</p>
              <p><strong>Formato:</strong> ${
                consec.pattern ||
                `${consec.prefix || ""}[valor]${consec.suffix || ""}`
              }</p>
              <p><strong>Segmentado:</strong> ${
                consec.segments?.enabled ? `Sí (${consec.segments.type})` : "No"
              }</p>
              <p><strong>Estado:</strong> ${
                consec.active ? "Activo" : "Inactivo"
              }</p>
            </div>
          `,
          icon: "info",
          confirmButtonText: "Cerrar",
        });
      }
    } catch (error) {
      console.error("Error al obtener detalles del consecutivo:", error);
      Swal.fire({
        title: "Error",
        text: "No se pudieron obtener los detalles del consecutivo",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Asignar un consecutivo existente
  const handleAddNewAssignedConsecutive = async () => {
    try {
      setLoading(true);
      const response = await api.getConsecutives(accessToken);
      setLoading(false);

      if (!response.success || !response.data || response.data.length === 0) {
        Swal.fire({
          title: "Sin consecutivos",
          text: "No hay consecutivos disponibles para asignar",
          icon: "info",
        });
        return;
      }

      // Filtrar consecutivos ya asignados
      const assignedIds = assignedConsecutives.map((c) => c._id);
      const availableConsecutives = response.data.filter(
        (c) => !assignedIds.includes(c._id)
      );

      if (availableConsecutives.length === 0) {
        Swal.fire({
          title: "Sin consecutivos",
          text: "Todos los consecutivos ya están asignados a este mapeo",
          icon: "info",
        });
        return;
      }

      // Crear opciones para el select
      const options = availableConsecutives
        .map(
          (c) =>
            `<option value="${c._id}">${c.name} - ${
              c.description || "Sin descripción"
            }</option>`
        )
        .join("");

      const { value: selectedId } = await Swal.fire({
        title: "Asignar Consecutivo",
        html: `
          <div class="form-group">
            <label for="consecutive-select">Seleccione un consecutivo:</label>
            <select id="consecutive-select" class="swal2-select" style="width: 100%; margin-top: 10px;">
              <option value="">-- Seleccione un consecutivo --</option>
              ${options}
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Asignar",
        cancelButtonText: "Cancelar",
        preConfirm: () => {
          const value = document.getElementById("consecutive-select").value;
          if (!value) {
            Swal.showValidationMessage("Debe seleccionar un consecutivo");
            return false;
          }
          return value;
        },
      });

      if (selectedId) {
        await assignConsecutiveToMapping(selectedId, availableConsecutives);
      }
    } catch (error) {
      setLoading(false);
      console.error("Error al asignar consecutivo:", error);
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudo asignar el consecutivo",
        icon: "error",
      });
    }
  };

  // Crear y asignar un nuevo consecutivo
  const handleCreateAndAssignConsecutive = async () => {
    try {
      const { value: formValues } = await Swal.fire({
        title: "Crear Nuevo Consecutivo",
        html: `
          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="name">Nombre:</label>
            <input id="name" class="swal2-input" placeholder="Nombre del consecutivo" required>
          </div>

          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="description">Descripción:</label>
            <textarea id="description" class="swal2-textarea" placeholder="Descripción del consecutivo" rows="3"></textarea>
          </div>

          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="prefix">Prefijo:</label>
            <input id="prefix" class="swal2-input" placeholder="Ej: FAC-" maxlength="10">
          </div>

          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="startValue">Valor inicial:</label>
            <input id="startValue" class="swal2-input" type="number" value="1" min="1">
          </div>

          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="pattern">Formato:</label>
            <input id="pattern" class="swal2-input" placeholder="{PREFIX}{VALUE:6}" value="{PREFIX}{VALUE:6}">
            <small style="color: #666; font-size: 12px;">Variables: {PREFIX}, {VALUE:n}, {YEAR}, {MONTH}, {DAY}</small>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Crear y Asignar",
        cancelButtonText: "Cancelar",
        width: "500px",
        preConfirm: () => {
          const name = document.getElementById("name").value;
          const description = document.getElementById("description").value;
          const prefix = document.getElementById("prefix").value;
          const startValue =
            parseInt(document.getElementById("startValue").value) || 1;
          const pattern = document.getElementById("pattern").value;

          if (!name.trim()) {
            Swal.showValidationMessage("El nombre es requerido");
            return false;
          }

          return {
            name: name.trim(),
            description: description.trim(),
            prefix,
            startValue,
            pattern,
          };
        },
      });

      if (formValues) {
        setLoading(true);
        const createResult = await api.createConsecutive(accessToken, {
          ...formValues,
          entityType: "mapping",
          entityId: mapping._id,
        });

        if (createResult.success && createResult.data) {
          await assignConsecutiveToMapping(createResult.data._id, [
            createResult.data,
          ]);

          Swal.fire({
            title: "Éxito",
            text: "Consecutivo creado y asignado correctamente",
            icon: "success",
          });
        } else {
          throw new Error(createResult.message || "Error al crear consecutivo");
        }
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      console.error("Error al crear y asignar consecutivo:", error);
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudo crear o asignar el consecutivo",
        icon: "error",
      });
    }
  };

  // Función auxiliar para asignar consecutivo al mapping
  const assignConsecutiveToMapping = async (
    consecutiveId,
    consecutivesList
  ) => {
    setLoading(true);
    const assignResult = await api.assignConsecutive(
      accessToken,
      consecutiveId,
      {
        entityType: "mapping",
        entityId: mapping._id,
        allowedOperations: ["read", "increment"],
      }
    );

    if (assignResult.success) {
      const newConsecutive = consecutivesList.find(
        (c) => c._id === consecutiveId
      );
      setAssignedConsecutives([...assignedConsecutives, newConsecutive]);
      setSelectedCentralizedConsecutive(consecutiveId);
      setUseCentralizedSystem(true);
      updateCentralizedSystemConfig(true, consecutiveId);

      Swal.fire({
        title: "Éxito",
        text: "Consecutivo asignado correctamente",
        icon: "success",
      });
    } else {
      throw new Error(assignResult.message || "Error al asignar consecutivo");
    }
    setLoading(false);
  };

  // Añadir asignación de tabla-campo
  const addTableFieldMapping = async () => {
    if (!availableTables || availableTables.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No hay tablas configuradas",
        text: "Primero configure al menos una tabla en la pestaña 'Tablas y Campos'.",
      });
      return;
    }

    const tableOptions = availableTables
      .map(
        (table) =>
          `<option value="${table.name}">${table.name} (${
            table.isDetail ? "Detalle" : "Encabezado"
          })</option>`
      )
      .join("");

    const { value: mappingData } = await Swal.fire({
      title: "Asignar Campo de Consecutivo",
      html: `
        <div class="form-group" style="margin-bottom: 15px; text-align: left;">
          <label for="table-select">Tabla:</label>
          <select id="table-select" class="swal2-select" style="width: 100%;">
            <option value="">-- Seleccione una tabla --</option>
            ${tableOptions}
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 15px; text-align: left;">
          <label for="field-select">Campo:</label>
          <select id="field-select" class="swal2-select" style="width: 100%;" disabled>
            <option value="">-- Primero seleccione una tabla --</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        const tableSelect = document.getElementById("table-select");
        const fieldSelect = document.getElementById("field-select");

        tableSelect.addEventListener("change", () => {
          const selectedTable = availableTables.find(
            (t) => t.name === tableSelect.value
          );

          if (selectedTable && selectedTable.fields.length > 0) {
            fieldSelect.disabled = false;
            fieldSelect.innerHTML = selectedTable.fields
              .map((field) => `<option value="${field}">${field}</option>`)
              .join("");
          } else {
            fieldSelect.disabled = true;
            fieldSelect.innerHTML =
              '<option value="">No hay campos disponibles</option>';
          }
        });
      },
      preConfirm: () => {
        const tableName = document.getElementById("table-select").value;
        const fieldName = document.getElementById("field-select").value;

        if (!tableName) {
          Swal.showValidationMessage("Debe seleccionar una tabla");
          return false;
        }

        if (!fieldName) {
          Swal.showValidationMessage("Debe seleccionar un campo");
          return false;
        }

        return { tableName, fieldName };
      },
    });

    if (mappingData) {
      // Verificar si ya existe esta combinación tabla-campo
      const exists = tableMappings.some(
        (m) =>
          m.tableName === mappingData.tableName &&
          m.fieldName === mappingData.fieldName
      );

      if (exists) {
        Swal.fire({
          icon: "warning",
          title: "Configuración duplicada",
          text: "Esta combinación de tabla y campo ya existe.",
        });
        return;
      }

      const updatedMappings = [...tableMappings, mappingData];
      setTableMappings(updatedMappings);

      // Actualizar configuración global
      const updatedConfig = {
        ...consecutiveConfig,
        applyToTables: updatedMappings,
      };

      const event = {
        target: {
          name: "consecutiveConfig",
          value: updatedConfig,
          type: "custom",
        },
      };

      handleChange(event);

      Swal.fire({
        icon: "success",
        title: "Asignación añadida",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };

  // Eliminar asignación de tabla-campo
  const removeTableFieldMapping = async (index) => {
    const result = await Swal.fire({
      title: "¿Eliminar asignación?",
      text: `¿Está seguro que desea eliminar esta asignación de consecutivo?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    const updatedMappings = [...tableMappings];
    updatedMappings.splice(index, 1);
    setTableMappings(updatedMappings);

    // Actualizar configuración global
    const updatedConfig = {
      ...consecutiveConfig,
      applyToTables: updatedMappings,
    };

    const event = {
      target: {
        name: "consecutiveConfig",
        value: updatedConfig,
        type: "custom",
      },
    };

    handleChange(event);

    Swal.fire({
      icon: "success",
      title: "Asignación eliminada",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Si no hay mapping, no renderizar nada
  if (!mapping) {
    return null;
  }

  return (
    <ConfigSection>
      <SectionTitle>Configuración de Numeración Consecutiva</SectionTitle>

      <CheckboxContainer>
        <CheckboxInput
          type="checkbox"
          id="consecutive-enabled"
          name="consecutiveConfig.enabled"
          checked={isEnabled}
          onChange={handleChange}
        />
        <CheckboxLabel htmlFor="consecutive-enabled">
          Activar numeración consecutiva automática
        </CheckboxLabel>
      </CheckboxContainer>

      {isEnabled && (
        <SystemSelectionContainer>
          <FormLabel>Sistema de consecutivos:</FormLabel>
          <RadioGroup>
            <RadioOption>
              <RadioInput
                type="radio"
                id="local-system"
                name="consecutive-system"
                value="local"
                checked={!useCentralizedSystem}
                onChange={handleSystemChange}
              />
              <RadioLabel htmlFor="local-system">
                Sistema local (configuración específica para este mapeo)
              </RadioLabel>
            </RadioOption>

            <RadioOption>
              <RadioInput
                type="radio"
                id="centralized-system"
                name="consecutive-system"
                value="centralized"
                checked={useCentralizedSystem}
                onChange={handleSystemChange}
              />
              <RadioLabel htmlFor="centralized-system">
                Sistema centralizado (consecutivos compartidos)
              </RadioLabel>
            </RadioOption>
          </RadioGroup>

          {/* LÓGICA PARA SISTEMA CENTRALIZADO */}
          {useCentralizedSystem && (
            <CentralizedOptions>
              {assignedConsecutives.length > 0 ? (
                <>
                  <FormLabel htmlFor="centralized-consecutive">
                    Consecutivo asignado:
                  </FormLabel>
                  <Select
                    id="centralized-consecutive"
                    value={selectedCentralizedConsecutive}
                    onChange={handleConsecutiveChange}
                  >
                    {assignedConsecutives.map((consecutive) => (
                      <option key={consecutive._id} value={consecutive._id}>
                        {consecutive.name} -{" "}
                        {consecutive.description || "Sin descripción"}
                      </option>
                    ))}
                  </Select>

                  <HelpText>
                    El consecutivo seleccionado será utilizado para generar
                    valores automáticamente. Los campos configurados a
                    continuación se usarán para determinar dónde se asignarán
                    los valores.
                  </HelpText>

                  <CentralizedActions>
                    <Button onClick={handleViewConsecutiveDetails}>
                      Ver detalles
                    </Button>
                    <Button onClick={handleAddNewAssignedConsecutive}>
                      Asignar otro consecutivo
                    </Button>
                  </CentralizedActions>
                </>
              ) : (
                <EmptyAssigned>
                  <p>No hay consecutivos asignados actualmente.</p>
                  <Button onClick={handleAddNewAssignedConsecutive}>
                    Asignar un consecutivo existente
                  </Button>
                  <Button onClick={handleCreateAndAssignConsecutive}>
                    Crear y asignar nuevo consecutivo
                  </Button>
                </EmptyAssigned>
              )}
            </CentralizedOptions>
          )}
        </SystemSelectionContainer>
      )}

      {/* CONFIGURACIÓN LOCAL - Solo se muestra si está habilitado y NO es sistema centralizado */}
      {isEnabled && !useCentralizedSystem && (
        <>
          <FormGroup>
            <FormLabel htmlFor="field-name">Campo en encabezado:</FormLabel>
            <FormInput
              type="text"
              id="field-name"
              name="consecutiveConfig.fieldName"
              placeholder="Nombre del campo en tabla principal (ej: NUM_CONSECUTIVO)"
              value={consecutiveConfig.fieldName || ""}
              onChange={handleChange}
            />
            <HelpText>
              Nombre del campo donde se guardará el consecutivo en la tabla
              principal
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="detail-field-name">Campo en detalle:</FormLabel>
            <FormInput
              type="text"
              id="detail-field-name"
              name="consecutiveConfig.detailFieldName"
              placeholder="Nombre del campo en tabla de detalle (ej: NUM_CONSECUTIVO)"
              value={consecutiveConfig.detailFieldName || ""}
              onChange={handleChange}
            />
            <HelpText>
              Nombre del campo donde se guardará el mismo consecutivo en la
              tabla de detalle
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="last-value">Último valor usado:</FormLabel>
            <FormInput
              type="number"
              id="last-value"
              name="consecutiveConfig.lastValue"
              value={consecutiveConfig.lastValue || 0}
              onChange={handleChange}
              placeholder="0"
              min="0"
            />
            <HelpText>El próximo consecutivo será este valor + 1</HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="prefix">Prefijo (opcional):</FormLabel>
            <FormInput
              type="text"
              id="prefix"
              name="consecutiveConfig.prefix"
              placeholder="Ej: INV-"
              value={consecutiveConfig.prefix || ""}
              onChange={handleChange}
              maxLength="10"
            />
            <HelpText>
              Texto que se añadirá antes del número (ej: "FAC-", "INV-", etc.)
            </HelpText>
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="pattern">Formato (opcional):</FormLabel>
            <FormInput
              type="text"
              id="pattern"
              name="consecutiveConfig.pattern"
              placeholder="Ej: {PREFIX}{VALUE:6}"
              value={consecutiveConfig.pattern || ""}
              onChange={handleChange}
            />
            <HelpText>Formato del consecutivo. Variables disponibles:</HelpText>
            <HelpText>{"{PREFIX}"}: Prefijo especificado arriba</HelpText>
            <HelpText>
              {"{VALUE:n}"}: Número consecutivo con n dígitos (ej: {"{VALUE:6}"}{" "}
              para 000001)
            </HelpText>
            <HelpText>{"{YEAR}"}: Año actual (ej: 2023)</HelpText>
            <HelpText>
              {"{MONTH}"}: Mes actual con dos dígitos (ej: 05)
            </HelpText>
            <HelpText>{"{DAY}"}: Día actual con dos dígitos (ej: 09)</HelpText>
            <HelpText>
              Ejemplo: {"{PREFIX}{YEAR}-{VALUE:4}"} generará "FAC2023-0001"
            </HelpText>
          </FormGroup>

          <CheckboxContainer>
            <CheckboxInput
              type="checkbox"
              id="update-after"
              name="consecutiveConfig.updateAfterTransfer"
              checked={consecutiveConfig.updateAfterTransfer !== false}
              onChange={handleChange}
            />
            <CheckboxLabel htmlFor="update-after">
              Actualizar consecutivo inmediatamente después de cada documento
            </CheckboxLabel>
          </CheckboxContainer>
          <HelpText>
            Si está desactivado, el consecutivo se actualizará al finalizar todo
            el proceso
          </HelpText>
        </>
      )}

      {/* ASIGNACIÓN ESPECÍFICA POR TABLAS - Se muestra tanto para local como centralizado */}
      {isEnabled && (
        <TableFieldMapping>
          <FormLabel>Asignación específica por tablas:</FormLabel>
          <HelpText>
            Configure campos específicos para cada tabla que necesita el
            consecutivo. Esto tiene prioridad sobre los campos generales
            definidos arriba.
          </HelpText>

          <AddButton onClick={addTableFieldMapping}>
            + Añadir tabla y campo
          </AddButton>

          <TablesList>
            {tableMappings && tableMappings.length > 0 ? (
              tableMappings.map((mapping, index) => (
                <TableItem key={index}>
                  <strong>Tabla:</strong> {mapping.tableName}
                  <br />
                  <strong>Campo:</strong> {mapping.fieldName}
                  <RemoveButton onClick={() => removeTableFieldMapping(index)}>
                    Eliminar
                  </RemoveButton>
                </TableItem>
              ))
            ) : (
              <HelpText>
                No hay asignaciones específicas configuradas. Si no configura
                asignaciones específicas, se usarán los campos generales
                definidos arriba.
              </HelpText>
            )}
          </TablesList>
        </TableFieldMapping>
      )}

      {loading && (
        <LoadingOverlay>
          <LoadingSpinner />
          Cargando...
        </LoadingOverlay>
      )}
    </ConfigSection>
  );
};

export default ConsecutiveConfigSection;

// ESTILOS STYLED-COMPONENTS (mantengo los mismos estilos que ya tienes, solo agregando los que faltan)
const ConfigSection = styled.div`
  position: relative;
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
  color: ${({ theme }) => theme?.primary || "#333"};
  border-bottom: 1px solid ${({ theme }) => theme?.border || "#eee"};
  padding-bottom: 0.5rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const FormLabel = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme?.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme?.primary || "#0275d8"};
    box-shadow: 0 0 0 2px rgba(2, 117, 216, 0.25);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme?.border || "#ccc"};
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 1rem;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme?.primary || "#0275d8"};
  }
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
`;

const CheckboxInput = styled.input`
  margin-right: 8px;
  width: 16px;
  height: 16px;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  user-select: none;
  cursor: pointer;
`;

const SystemSelectionContainer = styled.div`
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: ${({ theme }) => theme?.tableHeader || "#f8f9fa"};
  border-radius: 6px;
`;

const RadioGroup = styled.div`
  margin: 0.75rem 0;
`;

const RadioOption = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const RadioInput = styled.input`
  margin-right: 0.5rem;
`;

const RadioLabel = styled.label`
  cursor: pointer;
  font-size: 14px;
`;

const CentralizedOptions = styled.div`
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme?.border || "#eee"};
`;

const CentralizedActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  padding: 0.5rem 0.75rem;
  background-color: ${({ theme }) => theme?.primary || "#0275d8"};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme?.primaryHover || "#0269c2"};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const EmptyAssigned = styled.div`
  padding: 1rem;
  text-align: center;

  p {
    margin-bottom: 1rem;
    color: ${({ theme }) => theme?.textSecondary || "#6c757d"};
  }

  button {
    margin: 0.5rem;
  }
`;

const HelpText = styled.small`
  display: block;
  margin-top: 0.25rem;
  color: ${({ theme }) => theme?.textSecondary || "#6c757d"};
  font-size: 12px;
  line-height: 1.4;
`;

const TableFieldMapping = styled.div`
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme?.tableHeader || "#f8f9fa"};
  border-radius: 6px;
`;

const TablesList = styled.div`
  max-height: 250px;
  overflow-y: auto;
  margin-top: 0.5rem;
`;

const TableItem = styled.div`
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background-color: ${({ theme }) => theme?.cardBg || "#fff"};
  border: 1px solid ${({ theme }) => theme?.border || "#eee"};
  border-radius: 4px;
  font-size: 13px;
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  background-color: ${({ theme }) => theme?.success || "#28a745"};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme?.successHover || "#218838"};
  }
`;

const RemoveButton = styled.button`
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  background-color: ${({ theme }) => theme?.danger || "#dc3545"};
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  margin-left: 0.5rem;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme?.dangerHover || "#bd2130"};
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme?.primary || "#0275d8"};
`;

const LoadingSpinner = styled.div`
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid ${({ theme }) => theme?.primary || "#0275d8"};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;
