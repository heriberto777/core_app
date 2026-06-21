import React, { useState, useMemo } from "react";
import { FaThLarge, FaTable, FaTruck, FaTrash, FaEye } from "react-icons/fa";
import { OrderCard, StatusBadge } from "../../index";

/**
 * OrdersList (Tailwind Edition)
 * Listado versátil de pedidos (Cards/Table) con gestión de selección masiva.
 */
export function OrdersList({
  orders = [],
  selectedOrders = [],
  onOrderSelect,
  onSelectAll,
  onView,
  onEdit,
  onCancel,
  onLoad,
  onBulkLoad,
  onBulkCancel,
  loading = false,
  isProcessing = false,
  viewMode = "cards",
}) {
  const [currentViewMode, setCurrentViewMode] = useState(viewMode);

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length && orders.length > 0) {
      onSelectAll([]);
    } else {
      onSelectAll(orders.map((order) => order.pedido));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="p-32 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-lg font-extrabold text-slate-800 uppercase tracking-widest">Sincronizando bitácora...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-32 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
          <FaTable size={40} />
        </div>
        <div>
          <p className="text-xl font-black text-slate-800">No se encontraron registros</p>
          <p className="text-sm text-slate-400 mt-2">Prueba ajustando los filtros o refrescando la base de datos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn">
      {/* TOOLBAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-4">
        <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
          Pedidos Identificados <span className="text-primary-500 bg-primary-50 px-2 py-0.5 rounded-lg text-xs">{orders.length}</span>
        </h3>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-3 text-xs font-extrabold text-slate-400 uppercase tracking-widest border-r border-slate-100 pr-4">
            <span className={selectedOrders.length > 0 ? "text-primary-600" : ""}>{selectedOrders.length} seleccionados</span>
            <button 
              onClick={handleSelectAll}
              className="text-primary-500 hover:underline active:opacity-70 transition-all"
            >
              {selectedOrders.length === orders.length ? "Deseleccionar" : "Seleccionar Todo"}
            </button>
          </div>

          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
            <button
              onClick={() => setCurrentViewMode("cards")}
              className={`p-2 rounded-lg transition-all ${currentViewMode === "cards" ? "bg-white shadow-sm text-primary-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              <FaThLarge size={14} />
            </button>
            <button
              onClick={() => setCurrentViewMode("table")}
              className={`p-2 rounded-lg transition-all ${currentViewMode === "table" ? "bg-white shadow-sm text-primary-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              <FaTable size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      {currentViewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 p-4">
          {orders.map((order) => (
            <OrderCard
              key={order.pedido}
              order={order}
              selected={selectedOrders.includes(order.pedido)}
              onSelect={onOrderSelect}
              onView={onView}
              onEdit={onEdit}
              onCancel={onCancel}
              onLoad={onLoad}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 w-10">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all"
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Pedido</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cliente / Comprador</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Responsable</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Estado Logístico</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map((order) => (
                <tr 
                  key={order.pedido} 
                  className={`hover:bg-slate-50/40 transition-colors group ${selectedOrders.includes(order.pedido) ? "bg-primary-50/20" : ""}`}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 transition-all"
                      checked={selectedOrders.includes(order.pedido)}
                      onChange={() => onOrderSelect(order.pedido)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-extrabold text-slate-800 tracking-tight">#{order.pedido}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-700 truncate max-w-[250px]">{order.cliente}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{order.nombreVendedor}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={order.transferStatus === "pending" ? "INACTIVE" : order.transferStatus === "completed" ? "ACTIVE" : "PENDING"}>
                      {order.transferStatus === "pending" ? "Pendiente" : order.transferStatus === "completed" ? "Completado" : "En Proceso"}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-black text-slate-900 font-mono tracking-tighter">{formatCurrency(order.totalPedido)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onLoad(order.pedido)}
                        disabled={order.transferStatus !== "pending"}
                        className="p-2 text-primary-500 hover:bg-primary-50 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Cargar para despacho"
                      >
                        <FaTruck size={14} />
                      </button>
                      <button 
                        onClick={() => onView(order.pedido)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                        title="Ver detalles"
                      >
                        <FaEye size={14} />
                      </button>
                      <button 
                        onClick={() => onCancel(order.pedido)}
                        disabled={order.transferStatus === "completed" || order.transferStatus === "cancelled"}
                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Anular pedido"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}