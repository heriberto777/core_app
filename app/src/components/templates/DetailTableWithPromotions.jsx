import React, { useState, useEffect } from "react";
import styled from "styled-components";
import PromotionIndicator from "./PromotionIndicator";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const DetailTableWithPromotions = ({ data = [], mapping = {}, documentId }) => {
  const [showPromotionColumns, setShowPromotionColumns] = useState(true);
  const [processedData, setProcessedData] = useState([]);

  useEffect(() => {
    // Procesar datos para mostrar información de promociones
    const processed = data.map((item) => ({
      ...item,
      _isPromotion: item._IS_BONUS_LINE || item._IS_TRIGGER_LINE,
      _promotionType: item._PROMOTION_TYPE || "NONE",
      _hasPromotionData: item.PEDIDO_LINEA_BONIF || item.CANTIDAD_BONIF,
    }));

    setProcessedData(processed);
  }, [data]);

  const promotionConfig = mapping.promotionConfig || {};
  const isPromotionEnabled = promotionConfig.enabled;

  // Columnas básicas
  const basicColumns = [
    { key: "NUM_LN", label: "Línea", width: "80px" },
    { key: "COD_ART", label: "Código", width: "120px" },
    { key: "DESCRIPCION", label: "Descripción", width: "200px" },
    { key: "CANTIDAD", label: "Cantidad", width: "100px" },
    { key: "PRECIO", label: "Precio", width: "100px" },
    { key: "TOTAL", label: "Total", width: "100px" },
  ];

  // Columnas de promociones
  const promotionColumns = [
    { key: "PEDIDO_LINEA_BONIF", label: "Ref. Bonif.", width: "80px" },
    { key: "CANTIDAD_PEDIDA", label: "Cant. Pedida", width: "100px" },
    { key: "CANTIDAD_BONIF", label: "Cant. Bonif.", width: "100px" },
    { key: "CANTIDAD_A_FACTURAR", label: "Cant. Facturar", width: "100px" },
  ];

  const allColumns =
    showPromotionColumns && isPromotionEnabled
      ? [...basicColumns, ...promotionColumns]
      : basicColumns;

  const getRowStyle = (item) => {
    if (!isPromotionEnabled) return {};

    if (item._IS_BONUS_LINE) {
      return { backgroundColor: "#e8f5e8", borderLeft: "4px solid #2ecc71" };
    }
    if (item._IS_TRIGGER_LINE) {
      return { backgroundColor: "#e8f4f8", borderLeft: "4px solid #3498db" };
    }
    return {};
  };

  return (
    <TableContainer>
      <TableHeader>
        <TableTitle>
          Detalles del Documento {documentId}
          {isPromotionEnabled && (
            <PromotionBadge>
              <FaGift /> Promociones Activas
            </PromotionBadge>
          )}
        </TableTitle>

        {isPromotionEnabled && (
          <TableControls>
            <ControlButton
              onClick={() => setShowPromotionColumns(!showPromotionColumns)}
              active={showPromotionColumns}
            >
              {showPromotionColumns ? <FaEyeSlash /> : <FaEye />}
              {showPromotionColumns ? "Ocultar" : "Mostrar"} Columnas de
              Promoción
            </ControlButton>
          </TableControls>
        )}
      </TableHeader>

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              {allColumns.map((col) => (
                <Th key={col.key} width={col.width}>
                  {col.label}
                </Th>
              ))}
              {isPromotionEnabled && <Th width="60px">Promo</Th>}
            </tr>
          </thead>
          <tbody>
            {processedData.map((item, index) => (
              <Tr key={index} style={getRowStyle(item)}>
                {allColumns.map((col) => (
                  <Td key={col.key}>
                    {col.key === "PEDIDO_LINEA_BONIF" && item[col.key] ? (
                      <ReferenceLink>→ Línea {item[col.key]}</ReferenceLink>
                    ) : (
                      item[col.key] || "-"
                    )}
                  </Td>
                ))}
                {isPromotionEnabled && (
                  <Td>
                    <PromotionIndicator
                      promotionType={item._promotionType}
                      isBonus={item._IS_BONUS_LINE}
                      isTrigger={item._IS_TRIGGER_LINE}
                      bonusLineRef={item.PEDIDO_LINEA_BONIF}
                      size="small"
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      {isPromotionEnabled && (
        <TableFooter>
          <Legend>
            <LegendItem>
              <LegendColor color="#2ecc71" />
              Línea de Bonificación
            </LegendItem>
            <LegendItem>
              <LegendColor color="#3498db" />
              Línea que Dispara Promoción
            </LegendItem>
            <LegendItem>
              <LegendColor color="#f39c12" />
              Promoción Aplicada
            </LegendItem>
          </Legend>
        </TableFooter>
      )}
    </TableContainer>
  );
};

export default DetailTableWithPromotions;

// Estilos
const TableContainer = styled.div`
  background-color: ${({ theme }) => theme?.cardBg || "#ffffff"};
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
  border-bottom: 1px solid ${({ theme }) => theme?.border || "#eee"};
`;

const TableTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1.1rem;
  color: ${({ theme }) => theme?.text || "#333"};
`;

const PromotionBadge = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background-color: #2ecc71;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
`;

const TableControls = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ControlButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid ${({ theme }) => theme?.border || "#ccc"};
  border-radius: 4px;
  background-color: ${({ active, theme }) =>
    active ? theme?.primary || "#0275d8" : "white"};
  color: ${({ active }) => (active ? "white" : "#333")};
  cursor: pointer;
  font-size: 0.9rem;

  &:hover {
    opacity: 0.8;
  }
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
`;

const Th = styled.th`
  padding: 0.75rem;
  text-align: left;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
  border-bottom: 1px solid ${({ theme }) => theme?.border || "#eee"};
  font-weight: 600;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
  width: ${({ width }) => width || "auto"};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const Tr = styled.tr`
  &:hover {
    background-color: ${({ theme }) => theme?.hoverBg || "#f8f9fa"};
  }
`;

const Td = styled.td`
  padding: 0.75rem;
  border-bottom: 1px solid ${({ theme }) => theme?.border || "#eee"};
  color: ${({ theme }) => theme?.text || "#333"};
`;

const ReferenceLink = styled.span`
  color: #3498db;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const TableFooter = styled.div`
  padding: 1rem;
  background-color: ${({ theme }) => theme?.background || "#f8f9fa"};
  border-top: 1px solid ${({ theme }) => theme?.border || "#eee"};
`;

const Legend = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme?.textSecondary || "#555"};
`;

const LegendColor = styled.div`
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background-color: ${({ color }) => color};
`;
