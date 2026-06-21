import { useState } from "react";
import { LoadsButton, StatusBadge } from "../../index";
import { FaTimes, FaTrash, FaEdit } from "react-icons/fa";

const ModalOverlay = (props) => (
  <div
    {...props}
    className="fixed inset-0 flex items-center justify-center z-1000 p-4 md:p-0"
    onClick={props.onClick}
  />
);

const ModalContent = (props) => (
  <div
    {...props}
    className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
  />
);

const ModalHeader = (props) => (
  <div
    {...props}
    className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center"
  />
);

const ModalTitle = (props) => (
  <h3
    {...props}
    className="m-0 text-lg font-semibold text-slate-900 dark:text-slate-100 text-[18px]"
  />
);

const CloseButton = (props) => (
  <button
    {...props}
    className="bg-transparent border-none text-slate-500 dark:text-slate-400 text-xl p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
  />
);

const ModalBody = (props) => (
  <div
    {...props}
    className="px-4 py-3 overflow-y-auto flex-1"
  />
);

const OrderInfo = (props) => (
  <div
    {...props}
    className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 p-4 bg-white dark:bg-slate-800 rounded-lg"
  />
);

const InfoField = (props) => (
  <div
    {...props}
    className="flex flex-col gap-1"
  />
);

const InfoLabel = (props) => (
  <span
    {...props}
    className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide"
  />
);

const InfoValue = (props) => (
  <span
    {...props}
    className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-[14px]"
  />
);

const LinesSection = (props) => (
  <div
    {...props}
    className="mt-6 md:mt-4"
  />
);

const SectionTitle = (props) => (
  <h4
    {...props}
    className="m-0 mb-4 text-base font-semibold text-slate-900 dark:text-slate-100 text-[16px]"
  />
);

const LinesTable = (props) => (
  <div
    {...props}
    className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
  />
);

const TableHeader = (props) => (
  <div
    {...props}
    className="grid grid-cols-auto-1fr-80px-100px-120px-80px bg-slate-100 dark:bg-slate-800 px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
  />
);

const TableRow = (props) => (
  <div
    {...props}
    className="grid grid-cols-auto-1fr-80px-100px-120px-80px border-t border-slate-200 dark:border-slate-700 align-center transition-colors bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
  />
);

const TableCell = (props) => (
  <span
    {...props}
    className="text-sm text-slate-900 dark:text-slate-100 text-[13px]"
  />
);

const LineCheckbox = (props) => (
  <input
    {...props}
    type="checkbox"
    className="w-4 h-4 cursor-pointer"
  />
);

const ModalFooter = (props) => (
  <div
    {...props}
    className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end"
  />
);

export function OrderDetailsModal({
  isOpen,
  onClose,
  orderDetails = [],
  onRemoveLines,
  editable = false,
  loading = false
}) {
  const [selectedLines, setSelectedLines] = useState([]);

  if (!isOpen) return null;

  const handleLineSelect = (lineaId) => {
    setSelectedLines(prev =>
      prev.includes(lineaId)
        ? prev.filter(id => id !== lineaId)
        : [...prev, lineaId]
    );
  };

  const handleSelectAll = () => {
    if (selectedLines.length === orderDetails.length) {
      setSelectedLines([]);
    } else {
      setSelectedLines(orderDetails.map(line => line.LINEA_TIPO));
    }
  };

  const handleRemoveSelected = () => {
    if (selectedLines.length === 0) return;

    onRemoveLines?.(selectedLines);
    setSelectedLines([]);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const orderInfo = orderDetails[0] || {};
  const totalAmount = orderDetails.reduce((sum, line) => sum + (line.TotalAmount || 0), 0);
  const totalQuantity = orderDetails.reduce((sum, line) => sum + (line.Cantidad || 0), 0);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            Detalles del Pedido #{orderInfo.PEDIDO}
          </ModalTitle>
          <CloseButton onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <OrderInfo>
            <InfoField>
              <InfoLabel>Cliente</InfoLabel>
              <InfoValue>{orderInfo.CLIENTE}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Fecha del Pedido</InfoLabel>
              <InfoValue>{formatDate(orderInfo.FECHA_PEDIDO)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Fecha Prometida</InfoLabel>
              <InfoValue>{formatDate(orderInfo.FECHA_PROMETIDA)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Vendedor</InfoLabel>
              <InfoValue>{orderInfo.VENDEDOR}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Líneas</InfoLabel>
              <InfoValue>{orderDetails.length}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Cantidad</InfoLabel>
              <InfoValue>{totalQuantity.toLocaleString()}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Total Pedido</InfoLabel>
              <InfoValue>{formatCurrency(totalAmount)}</InfoValue>
            </InfoField>
            <InfoField>
              <InfoLabel>Estado</InfoLabel>
              <StatusBadge status="pending">Pendiente</StatusBadge>
            </InfoField>
          </OrderInfo>

          <LinesSection>
            <div className="flex justify-between items-center mb-4">
              <SectionTitle>
                Líneas del Pedido ({orderDetails.length})
              </SectionTitle>
              {editable && selectedLines.length > 0 && (
                <LoadsButton
                  variant="danger"
                  size="small"
                  onClick={handleRemoveSelected}
                  loading={loading}
                >
                  <FaTrash /> Eliminar Seleccionadas ({selectedLines.length})
                </LoadsButton>
              )}
            </div>

            <LinesTable>
              <TableHeader>
                <span>
                  {editable && (
                    <LineCheckbox
                      type="checkbox"
                      checked={selectedLines.length === orderDetails.length && orderDetails.length > 0}
                      onChange={handleSelectAll}
                    />
                  )}
                </span>
                <span>Producto</span>
                <span>Tipo</span>
                <span>Cantidad</span>
                <span>Precio Unit.</span>
                <span>Total</span>
              </TableHeader>

              {orderDetails.map((line) => (
                <TableRow
                  key={line.LINEA_TIPO}
                  selected={selectedLines.includes(line.LINEA_TIPO)}
                >
                  <TableCell>
                    {editable && (
                      <LineCheckbox
                        type="checkbox"
                        checked={selectedLines.includes(line.LINEA_TIPO)}
                        onChange={() => handleLineSelect(line.LINEA_TIPO)}
                      />
                    )}
                  </TableCell>
                  <TableCell>{line.ARTICULO}</TableCell>
                  <TableCell>
                    <StatusBadge status={line.TIPO_LINEA === 'P' ? 'completed' : 'warning'}>
                      {line.TIPO_LINEA === 'P' ? 'Pedida' : 'Bonif.'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{line.Cantidad?.toLocaleString()}</TableCell>
                  <TableCell>{formatCurrency(line.PRECIO_UNITARIO)}</TableCell>
                  <TableCell>{formatCurrency(line.TotalAmount)}</TableCell>
                </TableRow>
              ))}
            </LinesTable>
          </LinesSection>
        </ModalBody>

        <ModalFooter>
          <LoadsButton variant="secondary" onClick={onClose}>
            Cerrar
          </LoadsButton>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );
}