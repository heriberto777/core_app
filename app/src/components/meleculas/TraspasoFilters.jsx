import styled from "styled-components";
import { FilterInput, LoadsButton } from "../../index";
import { FaFilter, FaSync, FaSearch } from "react-icons/fa";

const Panel = styled.div`
  background: ${(props) => props.theme.cardBg || "white"};
  border: 1px solid ${(props) => props.theme.border || "#e5e7eb"};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    padding: 12px;
    margin-bottom: 16px;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: ${(props) => props.theme.text || "#111827"};
  font-weight: 600;

  @media (max-width: 768px) {
    margin-bottom: 12px;
  }
`;

const FiltersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 8px;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  flex: 1;
  min-width: 200px;

  @media (max-width: 768px) {
    min-width: auto;
    width: 100%;
  }
`;

const SearchIcon = styled(FaSearch)`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: ${(props) => props.theme.textTertiary || "#9ca3af"};
  font-size: 14px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid ${(props) => props.theme.border || "#d1d5db"};
  border-radius: 6px;
  font-size: 14px;
  background-color: ${(props) => props.theme.inputBg || "white"};
  color: ${(props) => props.theme.text || "#111827"};

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary || "#3b82f6"};
    box-shadow: 0 0 0 3px ${(props) => props.theme.primary || "#3b82f6"}20;
  }

  &::placeholder {
    color: ${(props) => props.theme.textTertiary || "#9ca3af"};
  }
`;

export function TraspasoFilters({
  filters,
  onFiltersChange,
  onReset,
  onRefresh,
  onSearch,
  search,
  onSearchChange,
  loading = false,
}) {
  const handleFilterChange = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const statusOptions = [
    { value: "all", label: "Todos los estados" },
    { value: "pending", label: "Pendientes" },
    { value: "completed", label: "Completados" },
    { value: "failed", label: "Fallidos" },
    { value: "manual_required", label: "Manual requerido" },
    { value: "validation_failed", label: "Validación fallida" },
    { value: "cancelled", label: "Cancelados" },
  ];

  return (
    <Panel>
      <PanelHeader>
        <FaFilter />
        Filtros de Búsqueda
      </PanelHeader>

      <FiltersGrid>
        <FilterInput
          label="Fecha Desde"
          type="date"
          value={filters.dateFrom || ""}
          onChange={(value) => handleFilterChange("dateFrom", value)}
        />

        <FilterInput
          label="Fecha Hasta"
          type="date"
          value={filters.dateTo || ""}
          onChange={(value) => handleFilterChange("dateTo", value)}
        />

        <FilterInput
          label="Estado"
          type="select"
          value={filters.status || "all"}
          onChange={(value) => handleFilterChange("status", value)}
          options={statusOptions}
        />

        <FilterInput
          label="Repartidor"
          type="text"
          value={filters.deliveryPerson || ""}
          onChange={(value) => handleFilterChange("deliveryPerson", value)}
          placeholder="Código del repartidor"
        />
      </FiltersGrid>

      <ActionsRow>
        <SearchContainer>
          <SearchIcon />
          <SearchInput
            placeholder="Buscar por Load ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </SearchContainer>

        <LoadsButton variant="primary" onClick={onSearch} loading={loading}>
          <FaSearch /> Buscar
        </LoadsButton>

        <LoadsButton variant="secondary" onClick={onReset} disabled={loading}>
          Limpiar
        </LoadsButton>

        <LoadsButton variant="secondary" onClick={onRefresh} loading={loading}>
          <FaSync /> Actualizar
        </LoadsButton>
      </ActionsRow>
    </Panel>
  );
}
