import { StatusBadge, LoadsButton } from "../../index";
import { FaEye, FaEdit, FaTrash, FaTruck, FaCalendar, FaUser, FaDollarSign } from "react-icons/fa";

/**
 * Corporate OrderCard (Tailwind Edition)
 */
export function OrderCard({
  order,
  selected = false,
  onSelect,
  onView,
  onEdit,
  onCancel,
  onLoad,
  showActions = true,
  className = ""
}) {
  const handleCardClick = (e) => {
    e.stopPropagation();
    onSelect?.(order.pedido);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div
      className={`
        bg-white border rounded-lg p-4 cursor-pointer transition-all duration-200
        hover:shadow-lg hover:-translate-y-0.5
        ${selected ? "border-primary-500 ring-2 ring-primary-500/20" : "border-slate-200"}
        ${className}
      `}
      onClick={handleCardClick}
    >
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(order.pedido)}
            className="w-4 h-4 cursor-pointer"
          />
          <div>
            <h4 className="m-0 text-base font-semibold text-slate-800 mb-1">Pedido #{order.pedido}</h4>
            <p className="m-0 text-sm text-slate-500 font-medium">{order.cliente}</p>
          </div>
        </div>
        <StatusBadge status={order.transferStatus}>
          {order.transferStatus === 'pending' ? 'Pendiente' :
           order.transferStatus === 'processing' ? 'Procesando' :
           order.transferStatus === 'completed' ? 'Completado' :
           order.transferStatus}
        </StatusBadge>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <FaCalendar className="text-primary-500" />
          <span className="font-medium text-slate-800">{formatDate(order.fechaPedido)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <FaUser className="text-primary-500" />
          <span className="font-medium text-slate-800">{order.nombreVendedor}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <FaDollarSign className="text-primary-500" />
          <span className="font-medium text-slate-800">{formatCurrency(order.totalPedido)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <FaTruck className="text-primary-500" />
          <span className="font-medium text-slate-800">{order.totalLineas} líneas</span>
        </div>
      </div>

      {showActions && (
        <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
          <LoadsButton
            variant="primary"
            size="small"
            onClick={() => onLoad?.(order.pedido)}
            disabled={order.transferStatus !== 'pending'}
          >
            <FaTruck /> Cargar
          </LoadsButton>
          <LoadsButton
            variant="secondary"
            size="small"
            onClick={() => onView?.(order.pedido)}
          >
            <FaEye /> Ver
          </LoadsButton>
          <LoadsButton
            variant="warning"
            size="small"
            onClick={() => onEdit?.(order.pedido)}
          >
            <FaEdit /> Editar
          </LoadsButton>
          <LoadsButton
            variant="danger"
            size="small"
            onClick={() => onCancel?.(order.pedido)}
          >
            <FaTrash /> Cancelar
          </LoadsButton>
        </div>
      )}
    </div>
  );
}