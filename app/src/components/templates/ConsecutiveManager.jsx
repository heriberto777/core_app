import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { TransferApi, useAuth } from "../../index";
import {
  FaEdit,
  FaTrash,
  FaPlus,
  FaSync,
  FaCheck,
  FaTimes,
  FaLink,
  FaPlay,
  FaSearch,
  FaClock,
  FaInfoCircle,
  FaChartLine,
} from "react-icons/fa";
import Swal from "sweetalert2";

const api = new TransferApi();

export function ConsecutiveManager() {
  const { accessToken } = useAuth();
  const [consecutives, setConsecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardData, setDashboardData] = useState([]);

  useEffect(() => {
    loadConsecutives();
    if (showDashboard) {
      loadDashboard();
      const interval = setInterval(loadDashboard, 30000); // Actualizar cada 30 segundos
      return () => clearInterval(interval);
    }
  }, [showDashboard]);

  const loadConsecutives = async () => {
    try {
      setLoading(true);
      const response = await api.getConsecutives(accessToken);
      if (response.success) {
        setConsecutives(response.data);
      } else {
        throw new Error(response.message || "Error al cargar los consecutivos");
      }
    } catch (error) {
      console.error("Error al cargar consecutivos:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar los consecutivos",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const response = await api.getConsecutiveDashboard(accessToken);
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    }
  };

  const handleDelete = async (id, name) => {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar consecutivo?",
        text: `¿Está seguro de eliminar el consecutivo "${name}"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        const response = await api.deleteConsecutive(accessToken, id);
        if (response.success) {
          Swal.fire("Eliminado", "El consecutivo ha sido eliminado", "success");
          loadConsecutives();
        } else {
          throw new Error(response.message || "Error al eliminar");
        }
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo eliminar el consecutivo",
      });
    }
  };

  const handleReset = async (id, name) => {
    try {
      const { value: initialValue } = await Swal.fire({
        title: `Reiniciar consecutivo: ${name}`,
        input: "number",
        inputLabel: "Nuevo valor inicial",
        inputValue: 0,
        showCancelButton: true,
        confirmButtonText: "Reiniciar",
        cancelButtonText: "Cancelar",
        inputValidator: (value) => {
          if (!value) {
            return "Debe ingresar un valor";
          }
          if (isNaN(parseInt(value))) {
            return "Debe ser un número válido";
          }
        },
      });

      if (initialValue !== undefined) {
        const response = await api.resetConsecutive(
          accessToken,
          id,
          initialValue
        );
        if (response.success) {
          Swal.fire(
            "Reiniciado",
            `Consecutivo reiniciado a ${initialValue}`,
            "success"
          );
          loadConsecutives();
        } else {
          throw new Error(response.message || "Error al reiniciar");
        }
      }
    } catch (error) {
      console.error("Error al reiniciar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo reiniciar el consecutivo",
      });
    }
  };

  // Función para asignar consecutivo a un mapeo específicamente
  const handleAssignToMapping = async (consecutiveId, consecutiveName) => {
    try {
      setLoading(true);
      // 1. Primero, obtener la lista de mapeos
      const mappings = await api.getMappings(accessToken);
      setLoading(false);

      if (!mappings || mappings.length === 0) {
        Swal.fire({
          icon: "info",
          title: "Sin mapeos",
          text: "No hay configuraciones de mapeo disponibles para asignar este consecutivo.",
        });
        return;
      }

      // 2. Mostrar diálogo para seleccionar mapeo
      const mappingOptions = mappings
        .map(
          (m) =>
            `<option value="${m._id}">${m.name} (${
              m.entityType || "pedidos"
            })</option>`
        )
        .join("");

      const { value: selectedMappingId } = await Swal.fire({
        title: `Asignar Consecutivo: ${consecutiveName}`,
        html: `
          <div class="form-group">
            <label for="mapping-select">Seleccione un mapeo:</label>
            <select id="mapping-select" class="swal2-select" style="width: 100%">
              ${mappingOptions}
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Asignar",
        cancelButtonText: "Cancelar",
        preConfirm: () => {
          return document.getElementById("mapping-select").value;
        },
      });

      if (!selectedMappingId) return;

      // 3. Mostrar los permisos que se asignarán
      const { value: confirmed } = await Swal.fire({
        title: "Confirmar asignación",
        html: `
          <p>Se asignará el consecutivo <strong>${consecutiveName}</strong> al mapeo seleccionado.</p>
          <p>Operaciones permitidas:</p>
          <ul style="text-align: left; margin-left: 20px;">
            <li>Lectura (permitir consultar el consecutivo)</li>
            <li>Incremento (permitir generar nuevos valores)</li>
          </ul>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Confirmar",
        cancelButtonText: "Cancelar",
      });

      if (!confirmed) return;

      // 4. Realizar la asignación
      setLoading(true);
      const result = await api.assignConsecutive(accessToken, consecutiveId, {
        entityType: "mapping",
        entityId: selectedMappingId,
        allowedOperations: ["read", "increment"],
      });
      setLoading(false);

      if (result.success) {
        Swal.fire({
          icon: "success",
          title: "Asignación exitosa",
          text: `El consecutivo ha sido asignado correctamente al mapeo seleccionado.`,
        });
      } else {
        throw new Error(result.message || "Error en la asignación");
      }
    } catch (error) {
      setLoading(false);
      console.error("Error al asignar consecutivo a mapeo:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo completar la asignación",
      });
    }
  };

  // Función para ver detalles del consecutivo
  const handleViewDetails = async (consecutiveId) => {
    try {
      // Obtener métricas del consecutivo
      const response = await api.getConsecutiveMetrics(
        accessToken,
        consecutiveId,
        "24h"
      );

      if (response.success) {
        const metrics = response.data;

        let html = `
          <div style="text-align: left; max-height: 400px; overflow-y: auto;">
            <h4 style="margin-top: 0;">Resumen del Consecutivo</h4>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px; font-weight: bold;">Valor Actual:</td>
                <td style="padding: 8px;">${metrics.currentValue}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px; font-weight: bold;">Incrementos (24h):</td>
                <td style="padding: 8px;">${
                  metrics.metrics.totalIncrements
                }</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px; font-weight: bold;">Reservas Activas:</td>
                <td style="padding: 8px; color: #17a2b8;">${
                  metrics.metrics.activeReservations
                }</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px; font-weight: bold;">Rango de Valores:</td>
                <td style="padding: 8px;">
                  Min: ${metrics.metrics.valueRange.min} | 
                  Actual: ${metrics.metrics.valueRange.current} | 
                  Max: ${metrics.metrics.valueRange.max}
                </td>
              </tr>
            </table>
            
            ${
              metrics.metrics.bySegment
                ? `
              <h4 style="margin-top: 20px;">Segmentos</h4>
              <table style="width: 100%; border-collapse: collapse;">
                ${Object.entries(metrics.metrics.bySegment)
                  .map(
                    ([segment, data]) => `
                  <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px; font-weight: bold;">${segment}:</td>
                    <td style="padding: 8px;">
                      Valor: ${data.currentValue} | 
                      Incrementos: ${data.incrementCount}
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </table>
            `
                : ""
            }
          </div>
        `;

        Swal.fire({
          title: `Detalles: ${metrics.consecutiveName}`,
          html: html,
          showCloseButton: true,
          width: 600,
          confirmButtonText: "Cerrar",
        });
      }
    } catch (error) {
      console.error("Error al obtener detalles:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar los detalles del consecutivo",
      });
    }
  };

  // Función para ver reservas activas
  const viewReservations = async (consecutiveId) => {
    try {
      const consecutive = consecutives.find((c) => c._id === consecutiveId);
      if (!consecutive || !consecutive.reservations) return;

      const activeReservations = consecutive.reservations.filter(
        (r) => r.status === "reserved" && new Date(r.expiresAt) > new Date()
      );

      if (activeReservations.length === 0) {
        Swal.fire({
          icon: "info",
          title: "Sin Reservas Activas",
          text: "No hay reservas activas para este consecutivo.",
        });
        return;
      }

      const html = `
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8f9fa;">
                <th style="padding: 10px; border: 1px solid #dee2e6;">Valor</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Reservado Por</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Expira En</th>
                <th style="padding: 10px; border: 1px solid #dee2e6;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${activeReservations
                .map((reservation) => {
                  const expiresIn = Math.max(
                    0,
                    Math.floor(
                      (new Date(reservation.expiresAt) - new Date()) / 1000
                    )
                  );
                  const minutes = Math.floor(expiresIn / 60);
                  const seconds = expiresIn % 60;

                  return `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">
                      ${reservation.value}
                    </td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">
                      ${reservation.reservedBy}
                    </td>
                    <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">
                      ${minutes}m ${seconds}s
                    </td>
                    <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">
                      <span style="color: ${
                        reservation.status === "reserved"
                          ? "#17a2b8"
                          : "#28a745"
                      };">
                        ${reservation.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;

      Swal.fire({
        title: "Reservas Activas",
        html: html,
        showCloseButton: true,
        showConfirmButton: false,
        width: 800,
      });
    } catch (error) {
      console.error("Error al obtener reservas:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar las reservas activas.",
      });
    }
  };

  // Función original para asignar a cualquier tipo de entidad
  const handleAssign = async (id, name) => {
    try {
      const { value: formValues } = await Swal.fire({
        title: `Asignar consecutivo: ${name}`,
        html: `
          <div class="form-group">
            <label for="entity-type">Tipo de entidad:</label>
            <select id="entity-type" class="swal2-select">
              <option value="user">Usuario</option>
              <option value="company">Compañía</option>
              <option value="mapping">Configuración de Mapeo</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div class="form-group">
            <label for="entity-id">ID de entidad:</label>
            <input id="entity-id" class="swal2-input" placeholder="ID de la entidad">
          </div>
          <div class="form-group">
            <label>Operaciones permitidas:</label>
            <div class="checkbox-group">
              <input type="checkbox" id="op-read" checked> <label for="op-read">Lectura</label>
              <input type="checkbox" id="op-increment" checked> <label for="op-increment">Incremento</label>
              <input type="checkbox" id="op-reset"> <label for="op-reset">Reinicio</label>
              <input type="checkbox" id="op-all"> <label for="op-all">Todas</label>
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Asignar",
        cancelButtonText: "Cancelar",
        preConfirm: () => {
          const entityType = document.getElementById("entity-type").value;
          const entityId = document.getElementById("entity-id").value;
          const opRead = document.getElementById("op-read").checked;
          const opIncrement = document.getElementById("op-increment").checked;
          const opReset = document.getElementById("op-reset").checked;
          const opAll = document.getElementById("op-all").checked;

          if (!entityId) {
            Swal.showValidationMessage("Debe ingresar un ID de entidad");
            return false;
          }

          // Construir array de operaciones permitidas
          const allowedOperations = [];
          if (opAll) {
            allowedOperations.push("all");
          } else {
            if (opRead) allowedOperations.push("read");
            if (opIncrement) allowedOperations.push("increment");
            if (opReset) allowedOperations.push("reset");
          }

          if (allowedOperations.length === 0) {
            Swal.showValidationMessage(
              "Debe seleccionar al menos una operación"
            );
            return false;
          }

          return {
            entityType,
            entityId,
            allowedOperations,
          };
        },
      });

      if (formValues) {
        const response = await api.assignConsecutive(
          accessToken,
          id,
          formValues
        );
        if (response.success) {
          Swal.fire(
            "Asignado",
            "El consecutivo ha sido asignado correctamente",
            "success"
          );
          loadConsecutives();
        } else {
          throw new Error(response.message || "Error al asignar");
        }
      }
    } catch (error) {
      console.error("Error al asignar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo asignar el consecutivo",
      });
    }
  };

  // Función para editar un consecutivo existente
  const handleEditConsecutive = async (id, currentData) => {
    try {
      // Preparar opciones para los segmentos, si existen
      let segmentOptionsHtml = "";
      if (currentData.segments && currentData.segments.enabled) {
        segmentOptionsHtml = `
          <div id="segment-options" style="margin-top: 15px; padding: 10px; background: #f8f8f8; border-radius: 5px;">
            <div class="form-group">
              <input type="checkbox" id="enable-segments" checked>
              <label for="enable-segments">Habilitar segmentación</label>
            </div>
            <div class="form-group" style="margin-top: 10px;">
              <label for="segment-type">Tipo de segmento:</label>
              <select id="segment-type" class="swal2-select" style="width: 100%; margin-top: 5px;">
                <option value="year" ${
                  currentData.segments.type === "year" ? "selected" : ""
                }>Por año</option>
                <option value="month" ${
                  currentData.segments.type === "month" ? "selected" : ""
                }>Por mes</option>
                <option value="company" ${
                  currentData.segments.type === "company" ? "selected" : ""
                }>Por compañía</option>
                <option value="user" ${
                  currentData.segments.type === "user" ? "selected" : ""
                }>Por usuario</option>
                <option value="custom" ${
                  currentData.segments.type === "custom" ? "selected" : ""
                }>Personalizado</option>
              </select>
            </div>
            <div id="custom-segment" style="display: ${
              currentData.segments.type === "custom" ? "block" : "none"
            }; margin-top: 10px;">
              <div class="form-group">
                <label for="segment-field">Campo personalizado:</label>
                <input id="segment-field" class="swal2-input" value="${
                  currentData.segments.field || ""
                }" placeholder="Nombre del campo">
              </div>
            </div>
          </div>
        `;
      } else {
        segmentOptionsHtml = `
          <div class="form-group" style="margin-top: 15px;">
            <input type="checkbox" id="enable-segments">
            <label for="enable-segments">Habilitar segmentación</label>
          </div>
          <div id="segment-options" style="display: none; margin-top: 10px; padding: 10px; background: #f8f8f8; border-radius: 5px;">
            <div class="form-group">
              <label for="segment-type">Tipo de segmento:</label>
              <select id="segment-type" class="swal2-select" style="width: 100%; margin-top: 5px;">
                <option value="year">Por año</option>
                <option value="month">Por mes</option>
                <option value="company">Por compañía</option>
                <option value="user">Por usuario</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            <div id="custom-segment" style="display: none; margin-top: 10px;">
              <div class="form-group">
                <label for="segment-field">Campo personalizado:</label>
                <input id="segment-field" class="swal2-input" placeholder="Nombre del campo">
              </div>
            </div>
          </div>
        `;
      }

      const { value: formValues } = await Swal.fire({
        title: "Editar Consecutivo",
        html: `
          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="name">Nombre:</label>
            <input id="name" class="swal2-input" value="${
              currentData.name
            }" placeholder="Nombre del consecutivo">
          </div>
          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="description">Descripción:</label>
            <input id="description" class="swal2-input" value="${
              currentData.description || ""
            }" placeholder="Descripción (opcional)">
          </div>
          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
            <label for="current-value">Valor actual:</label>
            <input id="current-value" type="number" class="swal2-input" value="${
              currentData.currentValue || 0
            }">
          </div>
          <div class="form-group" style="margin-bottom: 15px; text-align: left;">
          <label for="prefix">Prefijo (opcional):</label>
           <input id="prefix" class="swal2-input" value="${
             currentData.prefix || ""
           }" placeholder="Ej: INV-">
         </div>
         <div class="form-group" style="margin-bottom: 15px; text-align: left;">
           <label for="pattern">Patrón de formato (opcional):</label>
           <input id="pattern" class="swal2-input" value="${
             currentData.pattern || ""
           }" placeholder="Ej: {PREFIX}{YEAR}-{VALUE:6}">
         </div>
         <div class="form-group" style="margin-bottom: 15px; text-align: left;">
           <input type="checkbox" id="active" ${
             currentData.active ? "checked" : ""
           }>
           <label for="active">Activo</label>
         </div>
         ${segmentOptionsHtml}
       `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Guardar cambios",
        cancelButtonText: "Cancelar",
        didOpen: () => {
          // Activar/desactivar opciones de segmentación
          const enableSegments = document.getElementById("enable-segments");
          const segmentOptions = document.getElementById("segment-options");
          const segmentType = document.getElementById("segment-type");
          const customSegment = document.getElementById("custom-segment");

          if (enableSegments) {
            enableSegments.addEventListener("change", () => {
              segmentOptions.style.display = enableSegments.checked
                ? "block"
                : "none";
            });
          }

          if (segmentType) {
            segmentType.addEventListener("change", () => {
              customSegment.style.display =
                segmentType.value === "custom" ? "block" : "none";
            });
          }
        },
        preConfirm: () => {
          const name = document.getElementById("name").value;
          const description = document.getElementById("description").value;
          const currentValue = parseInt(
            document.getElementById("current-value").value || "0",
            10
          );
          const prefix = document.getElementById("prefix").value;
          const pattern = document.getElementById("pattern").value;
          const active = document.getElementById("active").checked;

          const enableSegments =
            document.getElementById("enable-segments")?.checked || false;

          let segments = null;
          if (enableSegments) {
            const segmentType = document.getElementById("segment-type").value;
            let segmentField = null;

            if (segmentType === "custom") {
              segmentField = document.getElementById("segment-field").value;
              if (!segmentField) {
                Swal.showValidationMessage(
                  "Debe especificar un campo para la segmentación personalizada"
                );
                return false;
              }
            }

            segments = {
              enabled: true,
              type: segmentType,
              field: segmentField,
              values: currentData.segments?.values || {},
            };
          }

          if (!name) {
            Swal.showValidationMessage("El nombre es obligatorio");
            return false;
          }

          return {
            name,
            description,
            currentValue,
            prefix,
            pattern,
            active,
            segments,
          };
        },
      });

      if (formValues) {
        setLoading(true);
        const result = await api.updateConsecutive(accessToken, id, formValues);
        setLoading(false);

        if (result.success) {
          Swal.fire({
            title: "Consecutivo actualizado",
            text: "Los cambios han sido guardados correctamente",
            icon: "success",
          });

          // Actualizar la lista de consecutivos
          loadConsecutives();
        } else {
          throw new Error(
            result.message || "Error al actualizar el consecutivo"
          );
        }
      }
    } catch (error) {
      setLoading(false);
      console.error("Error al editar consecutivo:", error);
      Swal.fire({
        title: "Error",
        text: error.message || "No se pudo editar el consecutivo",
        icon: "error",
      });
    }
  };

  const createConsecutive = async () => {
    try {
      const { value: formValues } = await Swal.fire({
        title: "Nuevo Consecutivo",
        html: `
         <div class="form-group">
           <label for="name">Nombre:</label>
           <input id="name" class="swal2-input" placeholder="Nombre del consecutivo">
         </div>
         <div class="form-group">
           <label for="description">Descripción:</label>
           <input id="description" class="swal2-input" placeholder="Descripción (opcional)">
         </div>
         <div class="form-group">
           <label for="current-value">Valor inicial:</label>
           <input id="current-value" type="number" class="swal2-input" value="0">
         </div>
         <div class="form-group">
           <label for="prefix">Prefijo (opcional):</label>
           <input id="prefix" class="swal2-input" placeholder="Ej: INV-">
         </div>
         <div class="form-group">
           <label for="pad-length">Longitud de relleno:</label>
           <input id="pad-length" type="number" class="swal2-input" value="7">
         </div>
         <div class="form-group">
           <label for="pad-char">Carácter de relleno:</label>
           <input id="pad-char" class="swal2-input" value="0" maxlength="1">
         </div>
         <div class="form-group">
           <label for="pattern">Patrón de formato (opcional):</label>
           <input id="pattern" class="swal2-input" placeholder="Ej: {PREFIX}{YEAR}-{VALUE:6}">
         </div>
         <div class="form-group">
           <input type="checkbox" id="enable-segments"> <label for="enable-segments">Habilitar segmentación</label>
         </div>
         <div id="segment-options" style="display: none; margin-top: 10px; padding: 10px; background: #f8f8f8; border-radius: 5px;">
           <div class="form-group">
             <label for="segment-type">Tipo de segmento:</label>
             <select id="segment-type" class="swal2-select">
               <option value="year">Por año</option>
               <option value="month">Por mes</option>
               <option value="company">Por compañía</option>
               <option value="user">Por usuario</option>
               <option value="custom">Personalizado</option>
             </select>
           </div>
           <div id="custom-segment" style="display: none;">
             <div class="form-group">
               <label for="segment-field">Campo personalizado:</label>
               <input id="segment-field" class="swal2-input" placeholder="Nombre del campo">
             </div>
           </div>
         </div>
       `,
        width: 600,
        showCancelButton: true,
        confirmButtonText: "Crear",
        cancelButtonText: "Cancelar",
        didOpen: () => {
          // Activar/desactivar opciones de segmentación
          const enableSegments = document.getElementById("enable-segments");
          const segmentOptions = document.getElementById("segment-options");
          const segmentType = document.getElementById("segment-type");
          const customSegment = document.getElementById("custom-segment");

          enableSegments.addEventListener("change", () => {
            segmentOptions.style.display = enableSegments.checked
              ? "block"
              : "none";
          });

          segmentType.addEventListener("change", () => {
            customSegment.style.display =
              segmentType.value === "custom" ? "block" : "none";
          });
        },
        preConfirm: () => {
          const name = document.getElementById("name").value;
          const description = document.getElementById("description").value;
          const currentValue = parseInt(
            document.getElementById("current-value").value || "0",
            10
          );
          const prefix = document.getElementById("prefix").value;
          const padLength = parseInt(
            document.getElementById("pad-length").value || "7",
            10
          );
          const padChar = document.getElementById("pad-char").value || "0";
          const pattern = document.getElementById("pattern").value;
          const enableSegments =
            document.getElementById("enable-segments").checked;

          let segments = null;
          if (enableSegments) {
            const segmentType = document.getElementById("segment-type").value;
            let segmentField = null;

            if (segmentType === "custom") {
              segmentField = document.getElementById("segment-field").value;
              if (!segmentField) {
                Swal.showValidationMessage(
                  "Debe especificar un campo para la segmentación personalizada"
                );
                return false;
              }
            }

            segments = {
              enabled: true,
              type: segmentType,
              field: segmentField,
              values: {},
            };
          }

          if (!name) {
            Swal.showValidationMessage("El nombre es obligatorio");
            return false;
          }

          return {
            name,
            description,
            currentValue,
            prefix,
            padLength,
            padChar,
            pattern,
            segments,
            active: true,
          };
        },
      });

      if (formValues) {
        const response = await api.createConsecutive(accessToken, formValues);
        if (response.success) {
          Swal.fire(
            "Creado",
            "El consecutivo ha sido creado correctamente",
            "success"
          );
          loadConsecutives();
        } else {
          throw new Error(response.message || "Error al crear");
        }
      }
    } catch (error) {
      console.error("Error al crear consecutivo:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo crear el consecutivo",
      });
    }
  };

  const getNextValue = async (id, name) => {
    try {
      // Verificar si requiere un segmento
      const consecutive = consecutives.find((c) => c._id === id);
      let segmentValue = null;

      if (consecutive && consecutive.segments && consecutive.segments.enabled) {
        if (consecutive.segments.type === "year") {
          segmentValue = new Date().getFullYear().toString();
        } else if (consecutive.segments.type === "month") {
          const date = new Date();
          segmentValue = `${date.getFullYear()}${(date.getMonth() + 1)
            .toString()
            .padStart(2, "0")}`;
        } else {
          // Solicitar el valor del segmento al usuario
          const { value } = await Swal.fire({
            title: `Obtener siguiente valor de: ${name}`,
            input: "text",
            inputLabel: `Valor del segmento (${consecutive.segments.type}):`,
            showCancelButton: true,
            confirmButtonText: "Obtener",
            cancelButtonText: "Cancelar",
            inputValidator: (value) => {
              if (!value) {
                return "Debe ingresar un valor para el segmento";
              }
            },
          });

          if (!value) return; // Usuario canceló
          segmentValue = value;
        }
      }

      // Obtener el siguiente valor
      const response = await api.getNextConsecutiveValue(accessToken, id, {
        segment: segmentValue,
      });

      if (response.success) {
        Swal.fire({
          title: "Siguiente valor generado",
          html: `
           <div style="margin: 20px; padding: 15px; background: #f8f8f8; border-radius: 5px; font-size: 1.2em; word-break: break-all;">
             <strong>${response.data.value}</strong>
           </div>
         `,
          icon: "success",
        });

        // Actualizar la lista para mostrar el nuevo valor actual
        loadConsecutives();
      } else {
        throw new Error(
          response.message || "Error al obtener el siguiente valor"
        );
      }
    } catch (error) {
      console.error("Error al obtener siguiente valor:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo obtener el siguiente valor",
      });
    }
  };

  const filteredConsecutives = consecutives.filter(
    (consecutive) =>
      consecutive.name.toLowerCase().includes(search.toLowerCase()) ||
      consecutive.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Componente Dashboard
  const DashboardComponent = () => {
    const getHealthStatus = (consecutive) => {
      if (consecutive.expiredReservations > 5)
        return { status: "warning", color: "#ffc107" };
      if (consecutive.activeReservations > 10)
        return { status: "caution", color: "#17a2b8" };
      return { status: "good", color: "#28a745" };
    };

    return (
      <DashboardContainer>
        <DashboardHeader>
          <h3>Dashboard de Consecutivos</h3>
          <BackButton onClick={() => setShowDashboard(false)}>
            <FaTimes /> Cerrar Dashboard
          </BackButton>
        </DashboardHeader>

        <CardsGrid>
          {dashboardData.map((consecutive) => {
            const health = getHealthStatus(consecutive);

            return (
              <ConsecutiveCard key={consecutive.id}>
                <CardHeader>
                  <CardTitle>{consecutive.name}</CardTitle>
                  <HealthIndicator $color={health.color} />
                </CardHeader>

                <CardBody>
                  <MetricItem>
                    <MetricLabel>Valor Actual:</MetricLabel>
                    <MetricValue>{consecutive.currentValue}</MetricValue>
                  </MetricItem>

                  <MetricItem>
                    <MetricLabel>Reservas Activas:</MetricLabel>
                    <MetricValue style={{ color: "#17a2b8" }}>
                      {consecutive.activeReservations}
                    </MetricValue>
                  </MetricItem>

                  <MetricItem>
                    <MetricLabel>Incrementos (24h):</MetricLabel>
                    <MetricValue style={{ color: "#28a745" }}>
                      {consecutive.totalIncrements}
                    </MetricValue>
                  </MetricItem>

                  {consecutive.expiredReservations > 0 && (
                    <MetricItem>
                      <MetricLabel>Reservas Expiradas:</MetricLabel>
                      <MetricValue style={{ color: "#dc3545" }}>
                        <FaExclamationTriangle />{" "}
                        {consecutive.expiredReservations}
                      </MetricValue>
                    </MetricItem>
                  )}
                </CardBody>
              </ConsecutiveCard>
            );
          })}
        </CardsGrid>
      </DashboardContainer>
    );
  };

  return (
    <Container>
      <HeaderSection>
        <h2>Gestión de Consecutivos</h2>
        <ActionsBar>
          <SearchContainer>
            <SearchInput
              type="text"
              placeholder="Buscar consecutivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </SearchContainer>
          <Button onClick={createConsecutive}>
            <FaPlus /> Nuevo Consecutivo
          </Button>
          <Button onClick={() => setShowDashboard(!showDashboard)}>
            <FaChartLine /> {showDashboard ? "Ver Lista" : "Ver Dashboard"}
          </Button>
          <RefreshButton onClick={loadConsecutives}>
            <FaSync />
          </RefreshButton>
        </ActionsBar>
      </HeaderSection>

      {showDashboard ? (
        <DashboardComponent />
      ) : (
        <>
          {loading ? (
            <LoadingMessage>Cargando consecutivos...</LoadingMessage>
          ) : (
            <>
              {filteredConsecutives.length === 0 ? (
                <EmptyMessage>No se encontraron consecutivos.</EmptyMessage>
              ) : (
                <TableContainer>
                  <Table>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Valor Actual</th>
                        <th>Formato</th>
                        <th>Segmentado</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsecutives.map((consecutive) => (
                        <tr key={consecutive._id}>
                          <td>{consecutive.name}</td>
                          <td>{consecutive.description || "-"}</td>
                          <td>{consecutive.currentValue}</td>
                          <td>
                            {consecutive.pattern ||
                              `${
                                consecutive.prefix || ""
                              }[${consecutive.padChar.repeat(
                                consecutive.padLength
                              )}]${consecutive.suffix || ""}`}
                          </td>
                          <td className="centered">
                            {consecutive.segments?.enabled ? (
                              <Badge $type="info">
                                {consecutive.segments.type}
                              </Badge>
                            ) : (
                              <Badge $type="default">No</Badge>
                            )}
                          </td>
                          <td className="centered">
                            <Badge
                              $type={consecutive.active ? "success" : "warning"}
                            >
                              {consecutive.active ? "Activo" : "Inactivo"}
                            </Badge>
                          </td>
                          <td>
                            <ActionButtons>
                              <ActionButton
                                $color="#007bff"
                                onClick={() =>
                                  getNextValue(
                                    consecutive._id,
                                    consecutive.name
                                  )
                                }
                                title="Obtener siguiente valor"
                              >
                                <FaPlay />
                              </ActionButton>
                              <ActionButton
                                $color="#6f42c1"
                                onClick={() =>
                                  viewReservations(consecutive._id)
                                }
                                title="Ver reservas activas"
                              >
                                <FaClock />
                              </ActionButton>
                              <ActionButton
                                $color="#17a2b8"
                                onClick={() =>
                                  handleViewDetails(consecutive._id)
                                }
                                title="Ver detalles y métricas"
                              >
                                <FaInfoCircle />
                              </ActionButton>
                              <ActionButton
                                $color="#28a745"
                                onClick={() =>
                                  handleReset(consecutive._id, consecutive.name)
                                }
                                title="Reiniciar consecutivo"
                              >
                                <FaSync />
                              </ActionButton>
                              <ActionButton
                                $color="#6f42c1"
                                onClick={() =>
                                  handleAssignToMapping(
                                    consecutive._id,
                                    consecutive.name
                                  )
                                }
                                title="Asignar a mapeo"
                              >
                                <FaLink />
                              </ActionButton>
                              <ActionButton
                                $color="#ffc107"
                                onClick={() =>
                                  handleEditConsecutive(
                                    consecutive._id,
                                    consecutive
                                  )
                                }
                                title="Editar consecutivo"
                              >
                                <FaEdit />
                              </ActionButton>
                              <ActionButton
                                $color="#dc3545"
                                onClick={() =>
                                  handleDelete(
                                    consecutive._id,
                                    consecutive.name
                                  )
                                }
                                title="Eliminar consecutivo"
                              >
                                <FaTrash />
                              </ActionButton>
                            </ActionButtons>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </>
      )}

      {loading && (
        <OverlayLoading>
          <LoadingSpinner />
          <LoadingText>Procesando solicitud...</LoadingText>
        </OverlayLoading>
      )}
    </Container>
  );
}

// Estilos
const Container = styled.div`
  padding: 20px;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
  position: relative;
  min-height: 300px;
`;

const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;

  h2 {
    margin: 0 0 15px 0;
    color: ${(props) => props.theme.title};
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  flex: 1;
  max-width: 400px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 15px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) => props.theme.primaryHover};
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background-color: ${(props) => props.theme.secondary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) => props.theme.secondaryHover};
  }
`;

const TableContainer = styled.div`
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid ${(props) => props.theme.border};
  }

  th {
    background-color: ${(props) => props.theme.tableHeader};
    color: ${(props) => props.theme.tableHeaderText};
    font-weight: 600;
  }

  td.centered {
    text-align: center;
  }

  tr:hover td {
    background-color: ${(props) => props.theme.tableHover};
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 5px;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: ${(props) => props.$color || props.theme.primary};
  padding: 5px;

  &:hover {
    transform: scale(1.1);
  }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 12px;
  background-color: ${(props) => {
    switch (props.$type) {
      case "success":
        return "#28a745";
      case "warning":
        return "#ffc107";
      case "danger":
        return "#dc3545";
      case "info":
        return "#17a2b8";
      default:
        return "#6c757d";
    }
  }};
  color: ${(props) => (props.$type === "warning" ? "#212529" : "white")};
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: ${(props) => props.theme.textSecondary};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 30px;
  color: ${(props) => props.theme.textSecondary};
  background-color: ${(props) => props.theme.cardBg};
  border-radius: 8px;
  margin-top: 20px;
`;

const OverlayLoading = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid ${(props) => props.theme.primary};
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  margin-top: 10px;
  color: ${(props) => props.theme.primary};
  font-size: 14px;
`;

// Estilos para el dashboard
const DashboardContainer = styled.div`
  margin-top: 20px;
`;

const DashboardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

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
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
`;

const ConsecutiveCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
`;

const HealthIndicator = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${(props) => props.$color};
`;

const CardBody = styled.div`
  padding: 15px;
`;

const MetricItem = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const MetricLabel = styled.span`
  color: #666;
`;

const MetricValue = styled.span`
  font-weight: 500;
`;
