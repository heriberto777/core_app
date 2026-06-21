import { FilterInput, LoadsButton } from "../../index";
import { FaFilter, FaSync, FaSearch } from "react-icons/fa";

/**
 * Corporate TraspasoFilters (Tailwind Edition)
 */
export function TraspasoFilters({
  filters,
  onFiltersChange,
  onReset,
  onRefresh,
  onSearch,
  search,
  onSearchChange,
  loading = false,
  className = ""
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
    <div className={`bg-white border border-slate-200 rounded-lg p-4 mb-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold">
        <FaFilter />
        Filtros de Búsqueda
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
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
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Buscar por Load ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <LoadsButton variant="primary" onClick={onSearch} loading={loading}>
          <FaSearch /> Buscar
        </LoadsButton>

        <LoadsButton variant="secondary" onClick={onReset} disabled={loading}>
          Limpiar
        </LoadsButton>

        <LoadsButton variant="secondary" onClick={onRefresh} loading={loading}>
          <FaSync /> Actualizar
        </LoadsButton>
      </div>
    </div>
  );
}