// src/components/organismos/TraspasoFiltersPanel.jsx
import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  FilterInput,
  MultiSelectInput,
  DateRangeInput,
  LoadsButton,
} from "../../index";

import { FaSearch, FaRedo, FaFilter } from "react-icons/fa";

// 🔄 Usar el mismo estilo que FiltersPanel de LoadsManagement
const FiltersContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
  overflow: hidden;
`;

const FiltersHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: between;
  align-items: center;
  background: #f9fafb;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-count {
    background: #3b82f6;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    margin-left: 8px;
  }
`;

const FiltersBody = styled.div`
  padding: 20px;
`;

const FiltersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
`;

const ActionsContainer = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;

  @media (max-width: 768px) {
    justify-content: stretch;

    button {
      flex: 1;
    }
  }
`;

const QuickFilters = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const QuickFilterButton = styled.button`
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: ${(props) => (props.active ? "#3b82f6" : "white")};
  color: ${(props) => (props.active ? "white" : "#374151")};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${(props) => (props.active ? "#2563eb" : "#f3f4f6")};
  }
`;

export const TraspasoFiltersPanel = ({
  filters,
  onFiltersChange,
  onReset,
  onSearch,
  loading = false,
  warehouses = [],
  loadOptions = [],
}) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [isExpanded, setIsExpanded] = useState(true);

  // Sincronizar con props cuando cambien
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Opciones de estado
  const statusOptions = [
    { value: "all", label: "Todos los estados" },
    { value: "PENDING", label: "Pendientes" },
    { value: "PROCESSING", label: "Procesando" },
    { value: "COMPLETED", label: "Completados" },
    { value: "ERROR", label: "Con errores" },
    { value: "CANCELLED", label: "Cancelados" },
  ];

  // Opciones de bodegas
  const warehouseOptions = [
    { value: "all", label: "Todas las bodegas" },
    ...warehouses.map((warehouse) => ({
      value: warehouse.code,
      label: `${warehouse.code} - ${warehouse.name}`,
    })),
  ];

  // Manejador de cambios en filtros locales
  const handleLocalFilterChange = useCallback((filterName, value) => {
    setLocalFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  }, []);

  // Aplicar filtros
  const handleApplyFilters = useCallback(() => {
    onFiltersChange(localFilters);
    onSearch?.();
  }, [localFilters, onFiltersChange, onSearch]);

  // Resetear filtros
  const handleReset = useCallback(() => {
    const resetFilters = {
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      dateTo: new Date().toISOString().split("T")[0],
      status: "all",
      sourceWarehouse: "all",
      targetWarehouse: "all",
      loadId: "",
    };
    setLocalFilters(resetFilters);
    onReset?.(resetFilters);
  }, [onReset]);

  // Filtros rápidos
  const quickFilters = [
    {
      label: "Hoy",
      action: () => {
        const today = new Date().toISOString().split("T")[0];
        handleLocalFilterChange("dateFrom", today);
        handleLocalFilterChange("dateTo", today);
      },
    },
    {
      label: "Esta semana",
      action: () => {
        const today = new Date();
        const weekStart = new Date(
          today.setDate(today.getDate() - today.getDay())
        );
        handleLocalFilterChange(
          "dateFrom",
          weekStart.toISOString().split("T")[0]
        );
        handleLocalFilterChange(
          "dateTo",
          new Date().toISOString().split("T")[0]
        );
      },
    },
    {
      label: "Solo pendientes",
      action: () => handleLocalFilterChange("status", "PENDING"),
    },
    {
      label: "Solo errores",
      action: () => handleLocalFilterChange("status", "ERROR"),
    },
  ];

  // Contar filtros activos
  const activeFiltersCount = Object.entries(localFilters).reduce(
    (count, [key, value]) => {
      if (key === "dateFrom" || key === "dateTo") return count;
      if (value && value !== "all" && value !== "") return count + 1;
      return count;
    },
    0
  );

  return (
    <FiltersContainer>
      <FiltersHeader>
        <h3>
          <FaFilter />
          Filtros de Búsqueda
          {activeFiltersCount > 0 && (
            <span className="filter-count">{activeFiltersCount}</span>
          )}
        </h3>
        <LoadsButton
          variant="secondary"
          size="small"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Contraer" : "Expandir"}
        </LoadsButton>
      </FiltersHeader>

      {isExpanded && (
        <FiltersBody>
          {/* Filtros rápidos */}
          <QuickFilters>
            {quickFilters.map((filter, index) => (
              <QuickFilterButton
                key={index}
                onClick={filter.action}
                type="button"
              >
                {filter.label}
              </QuickFilterButton>
            ))}
          </QuickFilters>

          <FiltersGrid>
            {/* Rango de fechas */}
            <FilterGroup>
              <FilterLabel>Período de Transferencia</FilterLabel>
              <DateRangeInput
                startDate={localFilters.dateFrom}
                endDate={localFilters.dateTo}
                onStartDateChange={(date) =>
                  handleLocalFilterChange("dateFrom", date)
                }
                onEndDateChange={(date) =>
                  handleLocalFilterChange("dateTo", date)
                }
                maxDate={new Date().toISOString().split("T")[0]}
              />
            </FilterGroup>

            {/* Estado */}
            <FilterGroup>
              <FilterLabel>Estado del Traspaso</FilterLabel>
              <FilterInput
                type="select"
                value={localFilters.status}
                onChange={(value) => handleLocalFilterChange("status", value)}
                options={statusOptions}
                placeholder="Seleccionar estado..."
              />
            </FilterGroup>

            {/* Bodega origen */}
            <FilterGroup>
              <FilterLabel>Bodega de Origen</FilterLabel>
              <FilterInput
                type="select"
                value={localFilters.sourceWarehouse}
                onChange={(value) =>
                  handleLocalFilterChange("sourceWarehouse", value)
                }
                options={warehouseOptions}
                placeholder="Seleccionar bodega origen..."
              />
            </FilterGroup>

            {/* Bodega destino */}
            <FilterGroup>
              <FilterLabel>Bodega de Destino</FilterLabel>
              <FilterInput
                type="select"
                value={localFilters.targetWarehouse}
                onChange={(value) =>
                  handleLocalFilterChange("targetWarehouse", value)
                }
                options={warehouseOptions}
                placeholder="Seleccionar bodega destino..."
              />
            </FilterGroup>

            {/* Load ID */}
            <FilterGroup>
              <FilterLabel>Load ID</FilterLabel>
              <FilterInput
                type="text"
                value={localFilters.loadId}
                onChange={(value) => handleLocalFilterChange("loadId", value)}
                placeholder="Buscar por Load ID..."
              />
            </FilterGroup>
          </FiltersGrid>

          <ActionsContainer>
            <LoadsButton
              variant="secondary"
              onClick={handleReset}
              disabled={loading}
            >
              <FaRedo /> Limpiar
            </LoadsButton>

            <LoadsButton
              variant="primary"
              onClick={handleApplyFilters}
              loading={loading}
              disabled={loading}
            >
              <FaSearch /> Buscar Traspasos
            </LoadsButton>
          </ActionsContainer>
        </FiltersBody>
      )}
    </FiltersContainer>
  );
};
