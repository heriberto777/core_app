import { FilterInput, LoadsButton } from "../../index";
import { FaFilter, FaSync, FaSearch } from "react-icons/fa";

/**
 * Corporate FiltersPanel (Tailwind Edition)
 * Incluye filtro de vendedores (solo vendedores reales, no repartidores).
 */
export function FiltersPanel({
  filters,
  onFiltersChange,
  onReset,
  onRefresh,
  onSearch,
  search,
  onSearchChange,
  sellers = [],
  loading = false,
  className = ""
}) {

  const handleFilterChange = (key, value) => {
    const newFilters = {
      ...filters,
      [key]: value,
    };
    onFiltersChange(newFilters);
  };

  const transferStatusOptions = [
    { value: "all", label: "Todos los estados" },
    { value: "pending", label: "Pendientes" },
    { value: "processing", label: "Procesando" },
    { value: "completed", label: "Completados" },
    { value: "cancelled", label: "Cancelados" },
  ];

  // Filtrar solo vendedores reales (U_ESVENDEDOR = 'Si'), NO repartidores
  const sellerOnlyOptions = sellers
    .filter((seller) => seller.isVendedor === "Si")
    .map((seller) => ({
      value: seller.code,
      label: `${seller.name} (${seller.code})`,
    }));

  const handleSellerFilterChange = (value) => {
    if (value === "all") {
      handleFilterChange("sellers", []);
    } else {
      handleFilterChange("sellers", [value]);
    }
  };

  const currentSellerValue = filters.sellers?.length > 0 ? filters.sellers[0] : "all";

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
          value={filters.dateFrom}
          onChange={(value) => handleFilterChange("dateFrom", value)}
        />

        <FilterInput
          label="Fecha Hasta"
          type="date"
          value={filters.dateTo}
          onChange={(value) => handleFilterChange("dateTo", value)}
        />

        <FilterInput
          label="Estado"
          type="select"
          value={filters.transferStatus}
          onChange={(value) => handleFilterChange("transferStatus", value)}
          options={transferStatusOptions}
        />

        {/* Selector de Vendedor */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Vendedor
          </label>
          <select
            value={currentSellerValue}
            onChange={(e) => handleSellerFilterChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white text-slate-800 font-medium cursor-pointer focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
          >
            <option value="all">Todos los vendedores</option>
            {sellerOnlyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Buscar por pedido, cliente..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 py-2 pl-9 border border-slate-200 rounded-md text-sm bg-white text-slate-800 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <LoadsButton variant="primary" onClick={onSearch} loading={loading} minWidth="120px">
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