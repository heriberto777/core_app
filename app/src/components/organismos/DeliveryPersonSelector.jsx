// app/src/components/organismos/DeliveryPersonSelector.jsx - TAILWIND EDITION
import { useState, useMemo } from "react";
import { LoadsButton } from "../../index";
import { FaTruck, FaWarehouse, FaTimes, FaUser, FaCheckCircle, FaCircle, FaInfoCircle, FaSearch } from "react-icons/fa";

export function DeliveryPersonSelector({
  isOpen,
  onClose,
  onSelect,
  selectedOrders = [],
  deliveryPersons = [],
  loading = false
}) {
  const [selectedVendedor, setSelectedVendedor] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtrar solo repartidores (isVendedor = 'Re') y aplicar búsqueda
  const filteredDeliveryPersons = useMemo(() => {
    const onlyDelivery = deliveryPersons.filter(
      (person) => person.isVendedor === "Re"
    );

    if (!searchQuery.trim()) return onlyDelivery;

    const normalizedQuery = searchQuery.toLowerCase().trim();
    return onlyDelivery.filter((person) => {
      const personName = (person.name || person.NOMBRE || "").toLowerCase();
      const personCode = (person.code || person.VENDEDOR || person.id || "").toString().toLowerCase();
      const personWarehouse = (person.assignedWarehouse || person.BODEGA_ASIGNADA || "").toLowerCase();
      return (
        personName.includes(normalizedQuery) ||
        personCode.includes(normalizedQuery) ||
        personWarehouse.includes(normalizedQuery)
      );
    });
  }, [deliveryPersons, searchQuery]);

  if (!isOpen) return null;

  const orderCount = selectedOrders.length;
  const totalAmount = selectedOrders.reduce(
    (sum, order) => sum + (order.totalPedido || 0),
    0
  );
  const totalLines = selectedOrders.reduce(
    (sum, order) => sum + (order.totalLineas || 0),
    0
  );


  const handleSelect = () => {
    if (!selectedVendedor) return;
    onSelect(selectedVendedor.code || selectedVendedor.VENDEDOR);
  };

  const handleClose = () => {
    setSearchQuery("");
    setSelectedVendedor(null);
    onClose();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-[650px] max-h-[90vh] rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="px-8 py-7 border-b border-slate-50 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <FaTruck className="text-xl" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-black text-slate-900 leading-tight">Asignación Logística</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Selección de Repartidor</span>
            </div>
          </div>
          <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <FaTimes />
          </button>
        </div>

        {/* Summary (Sticky below header) */}
        <div className="px-8 pt-8 pb-0 bg-white sticky top-[81px] z-10">
          <div className="bg-slate-50 border border-slate-100 rounded-[28px] p-8 space-y-6">
            <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-indigo-600 pl-4">
              Resumen de la Carga
            </h4>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center group">
                <div className="text-2xl font-black text-indigo-600 leading-none mb-1">{orderCount}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pedidos</div>
              </div>
              <div className="text-center group">
                <div className="text-2xl font-black text-indigo-600 leading-none mb-1">{totalLines}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Líneas</div>
              </div>
              <div className="text-center group">
                <div className="text-xl font-black text-indigo-600 leading-none mb-1 truncate px-2">{formatCurrency(totalAmount)}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total DOP</div>
              </div>
            </div>
          </div>

          {/* Buscador de Repartidor */}
          <div className="mt-6 relative">
            <FaSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-sm" />
            <input
              type="text"
              placeholder="Buscar repartidor por nombre, código o bodega..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-800 placeholder:text-slate-300 placeholder:font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"
              >
                <FaTimes className="text-xs" />
              </button>
            )}
          </div>

          {/* Contador de resultados */}
          <div className="mt-3 mb-2 px-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {filteredDeliveryPersons.length} repartidor{filteredDeliveryPersons.length !== 1 ? "es" : ""} disponible{filteredDeliveryPersons.length !== 1 ? "s" : ""}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
          </div>
        </div>

        {/* Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
          {filteredDeliveryPersons.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-6 opacity-30">
              <FaUser className="text-6xl" />
              <div className="space-y-1">
                <p className="text-sm font-black uppercase tracking-widest">
                  {searchQuery ? "Sin resultados para esta búsqueda" : "Sin repartidores disponibles"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  {searchQuery ? "Intente con otro término" : "Contacte al administrador del sistema"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredDeliveryPersons.map((vendedor) => {
                const vendedorId = vendedor.code || vendedor.VENDEDOR || vendedor.id;
                const isSelected = (selectedVendedor?.code || selectedVendedor?.VENDEDOR || selectedVendedor?.id) === vendedorId;

                return (
                  <div
                    key={vendedorId}
                    onClick={() => setSelectedVendedor(vendedor)}
                    className={`
                      p-6 rounded-[24px] border-2 transition-all duration-300 cursor-pointer relative group flex flex-col gap-4
                      ${isSelected 
                        ? "bg-emerald-50 border-emerald-500 shadow-xl shadow-emerald-500/10 scale-[1.02]" 
                        : "bg-white border-slate-100 hover:border-indigo-500 hover:shadow-lg hover:-translate-y-1"}
                    `}
                  >
                    <div className="absolute top-6 right-6 text-2xl transition-all duration-500">
                      {isSelected ? <FaCheckCircle className="text-emerald-500 animate-in zoom-in duration-300" /> : <FaCircle className="text-slate-100" />}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white transition-colors duration-500 ${isSelected ? "bg-emerald-500" : "bg-slate-900 group-hover:bg-indigo-600"}`}>
                        <FaUser className="text-xl" />
                      </div>
                      <div className="flex flex-col truncate pr-10">
                        <span className="text-sm font-black text-slate-900 leading-tight truncate">{vendedor.name || vendedor.NOMBRE}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Código: #{vendedorId}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
                      <FaWarehouse className="text-slate-300 text-xs" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Bodega: <span className="text-slate-900 font-black">{vendedor.assignedWarehouse || vendedor.BODEGA_ASIGNADA || "N/A"}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-50 bg-white/80 backdrop-blur-md sticky bottom-0 z-10 space-y-6">
          {selectedVendedor && (
            <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-[20px] flex items-center justify-between animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                  <FaInfoCircle />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Seleccionado:</span>
                  <span className="text-xs font-black text-indigo-900 truncate max-w-[200px]">{selectedVendedor.name || selectedVendedor.NOMBRE}</span>
                </div>
              </div>
              <div className="text-[10px] font-black bg-white/60 text-indigo-600 px-3 py-1 rounded-full border border-indigo-100">
                BODEGA: {selectedVendedor.assignedWarehouse || "GENERAL"}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <LoadsButton variant="ghost" onClick={handleClose} className="font-bold">Cancelar</LoadsButton>
            <LoadsButton
              variant="primary"
              onClick={handleSelect}
              disabled={!selectedVendedor || loading}
              loading={loading}
              className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 text-xs font-black uppercase tracking-widest border-none"
            >
              <FaTruck className="mr-2" /> Asignar y Procesar ({orderCount})
            </LoadsButton>
          </div>
        </div>
      </div>
    </div>
  );
}