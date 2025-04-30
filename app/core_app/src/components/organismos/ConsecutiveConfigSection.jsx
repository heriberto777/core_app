import React, { useEffect, useState } from "react";
import styled from "styled-components";
import Swal from "sweetalert2";

// Estilos para el componente
const ConfigSection = styled.div`
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

const HelpText = styled.small`
  display: block;
  margin-top: 0.25rem;
  color: ${({ theme }) => theme?.textSecondary || "#6c757d"};
  font-size: 12px;
`;

// Nuevo componente para seleccionar tablas y campos
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
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  background-color: ${({ theme }) => theme?.primary || "#0275d8"};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 0.5rem;

  &:hover {
    background-color: ${({ theme }) => theme?.primaryHover || "#0069d9"};
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

  &:hover {
    background-color: ${({ theme }) => theme?.dangerHover || "#bd2130"};
  }
`;

const ConsecutiveConfigSection = ({ mapping = {}, handleChange }) => {
  // Accedemos a consecutiveConfig de manera segura
  const consecutiveConfig = mapping.consecutiveConfig || {};
  const isEnabled = consecutiveConfig.enabled || false;

  const [tableMappings, setTableMappings] = useState(
    consecutiveConfig.applyToTables || []
  );

  useEffect(() => {
    setTableMappings(consecutiveConfig.applyToTables || []);
  }, [consecutiveConfig.applyToTables]);

  // Obtener todas las tablas disponibles en la configuración
  const availableTables = React.useMemo(() => {
    if (!mapping.tableConfigs) return [];

    return mapping.tableConfigs.map((config) => ({
      name: config.name,
      isDetail: config.isDetailTable || false,
      fields: (config.fieldMappings || []).map((field) => field.targetField),
    }));
  }, [mapping.tableConfigs]);

  // Función para añadir una asignación de tabla-campo
  const addTableFieldMapping = async () => {
    // Si no hay tablas configuradas
    if (!availableTables || availableTables.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No hay tablas configuradas",
        text: "Primero configure al menos una tabla en la pestaña 'Tablas y Campos'.",
      });
      return;
    }

    // Crear opciones de tablas para el select
    const tableOptions = availableTables
      .map(
        (table) =>
          `<option value="${table.name}">${table.name} (${
            table.isDetail ? "Detalle" : "Principal"
          })</option>`
      )
      .join("");

    // Mostrar formulario con SweetAlert2
    const { value: formValues } = await Swal.fire({
      title: "Asignar Consecutivo a Tabla",
      html: `
        <div class="form-group" style="margin-bottom: 15px; text-align: left;">
          <label for="table-select" style="display: block; margin-bottom: 5px; font-weight: 500;">Seleccione Tabla:</label>
          <select id="table-select" class="swal2-select" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
            ${tableOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 15px; text-align: left;">
          <label for="field-select" style="display: block; margin-bottom: 5px; font-weight: 500;">Campo para Consecutivo:</label>
          <select id="field-select" class="swal2-select" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;" disabled>
            <option value="">Seleccione una tabla primero</option>
          </select>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Añadir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Cuando se abre el modal, configurar el evento change para el select de tabla
        const tableSelect = document.getElementById("table-select");
        const fieldSelect = document.getElementById("field-select");

        tableSelect.addEventListener("change", () => {
          // Actualizar opciones de campos basado en la tabla seleccionada
          const selectedTable = availableTables.find(
            (t) => t.name === tableSelect.value
          );

          if (selectedTable && selectedTable.fields.length > 0) {
            // Habilitar y llenar el select de campos
            fieldSelect.disabled = false;
            fieldSelect.innerHTML = selectedTable.fields
              .map((field) => `<option value="${field}">${field}</option>`)
              .join("");
          } else {
            // Si no hay campos, deshabilitar select
            fieldSelect.disabled = true;
            fieldSelect.innerHTML =
              '<option value="">No hay campos disponibles</option>';
          }
        });

        // Disparar evento change en la carga para llenar el primer select de campos
        if (tableSelect.value) {
          const event = new Event("change");
          tableSelect.dispatchEvent(event);
        }
      },
      preConfirm: () => {
        const tableSelect = document.getElementById("table-select");
        const fieldSelect = document.getElementById("field-select");

        if (!tableSelect.value) {
          Swal.showValidationMessage("Debe seleccionar una tabla");
          return false;
        }

        if (!fieldSelect.value) {
          Swal.showValidationMessage("Debe seleccionar un campo");
          return false;
        }

        return {
          tableName: tableSelect.value,
          fieldName: fieldSelect.value,
        };
      },
    });

    // Si el usuario canceló, no hacer nada
    if (!formValues) return;

    // Verificar que no exista ya la misma asignación
    const exists = tableMappings.some(
      (m) =>
        m.tableName === formValues.tableName &&
        m.fieldName === formValues.fieldName
    );

    if (exists) {
      Swal.fire({
        icon: "warning",
        title: "Asignación duplicada",
        text: `Ya existe una asignación para la tabla ${formValues.tableName} con el campo ${formValues.fieldName}`,
      });
      return;
    }

    // Actualizar la lista de mapeos
    const updatedMappings = [...(tableMappings || []), formValues];

    // Actualizar estado local
    setTableMappings(updatedMappings);

    // Actualizar en el estado global
    const updatedConfig = {
      ...consecutiveConfig,
      applyToTables: updatedMappings,
    };

    // Simular un evento para el handleChange existente
    const event = {
      target: {
        name: "consecutiveConfig",
        value: updatedConfig,
        type: "custom",
      },
    };

    handleChange(event);

    // Mostrar mensaje de éxito
    Swal.fire({
      icon: "success",
      title: "Asignación creada",
      text: `Se ha asignado el campo ${formValues.fieldName} de la tabla ${formValues.tableName} para recibir el consecutivo.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Función para eliminar una asignación
  const removeTableFieldMapping = async (index) => {
    // Pedir confirmación
    const result = await Swal.fire({
      title: "¿Eliminar asignación?",
      text: `¿Está seguro que desea eliminar esta asignación de consecutivo?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    // Continuar con la eliminación
    const updatedMappings = [...tableMappings];
    updatedMappings.splice(index, 1);

    // Actualizar estado local
    setTableMappings(updatedMappings);

    // Actualizar en el estado global
    const updatedConfig = {
      ...consecutiveConfig,
      applyToTables: updatedMappings,
    };

    // Simular un evento para el handleChange existente
    const event = {
      target: {
        name: "consecutiveConfig",
        value: updatedConfig,
        type: "custom",
      },
    };

    handleChange(event);

    // Mostrar mensaje de éxito
    Swal.fire({
      icon: "success",
      title: "Asignación eliminada",
      timer: 1500,
      showConfirmButton: false,
    });
  };

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

          {/* Nueva sección para asignación específica de campos a tablas */}
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
                    <RemoveButton
                      onClick={() => removeTableFieldMapping(index)}
                    >
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

          <FormGroup>
            <FormLabel htmlFor="last-value">Último valor usado:</FormLabel>
            <FormInput
              type="text"
              id="last-value"
              name="consecutiveConfig.lastValue"
              value={consecutiveConfig.lastValue || 0}
              onChange={handleChange}
              placeholder="0"
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
    </ConfigSection>
  );
};

export default ConsecutiveConfigSection;
