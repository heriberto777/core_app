import React from "react";
import styled from "styled-components";
import { FaGift, FaPercentage, FaTag, FaArrowRight } from "react-icons/fa";

const PromotionIndicator = ({
  promotionType,
  isBonus = false,
  isTrigger = false,
  bonusLineRef = null,
  size = "small",
}) => {
  if (!promotionType || promotionType === "NONE") {
    return null;
  }

  const getIcon = () => {
    if (isBonus) return <FaGift />;
    if (isTrigger) return <FaArrowRight />;
    return <FaTag />;
  };

  const getColor = () => {
    if (isBonus) return "#2ecc71";
    if (isTrigger) return "#3498db";
    return "#f39c12";
  };

  const getTooltip = () => {
    if (isBonus) return `Bonificación - Ref: línea ${bonusLineRef}`;
    if (isTrigger) return "Producto que dispara promoción";
    return "Promoción aplicada";
  };

  return (
    <IndicatorContainer size={size} color={getColor()} title={getTooltip()}>
      {getIcon()}
    </IndicatorContainer>
  );
};

export default PromotionIndicator;

const IndicatorContainer = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ size }) => (size === "large" ? "32px" : "20px")};
  height: ${({ size }) => (size === "large" ? "32px" : "20px")};
  border-radius: 50%;
  background-color: ${({ color }) => color};
  color: white;
  font-size: ${({ size }) => (size === "large" ? "0.9rem" : "0.7rem")};
  cursor: help;
  margin-left: 0.5rem;

  &:hover {
    opacity: 0.8;
    transform: scale(1.1);
  }
`;
