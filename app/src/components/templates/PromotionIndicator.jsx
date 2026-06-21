import React from "react";
import { FaGift, FaPercentage, FaTag, FaArrowRight } from "react-icons/fa";

export function PromotionIndicator({
  promotionType,
  isBonus = false,
  isTrigger = false,
  bonusLineRef = null,
  size = "small",
}) {
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

  const sizeClasses = size === "large" ? "w-8 h-8 text-[0.9rem]" : "w-5 h-5 text-[0.7rem]";

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full text-white cursor-help ml-2 hover:opacity-80 hover:scale-110 transition-all ${sizeClasses} bg-[${isBonus ? "#2ecc71" : isTrigger ? "#3498db" : "#f39c12"}]`}
      title={getTooltip()}
    >
      {getIcon()}
    </div>
  );
}

export default PromotionIndicator;