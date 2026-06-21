import React from "react";

/**
 * Corporate BotonCircular (Tailwind Edition)
 */
export function BotonCircular({
  icono,
  width = "24px",
  height = "24px",
  bgcolor = "transparent",
  textColor = "currentColor",
  fontsize = "12px",
  translateX = "0",
  translateY = "0",
  className = "",
  style = {},
  ...props
}) {
  return (
    <div
      className={`rounded-full flex items-center justify-center absolute bg-${bgcolor === "transparent" ? "" : bgcolor} ${className}`}
      style={{
        minWidth: width,
        minHeight: height,
        transform: `translate(${translateX}, ${translateY})`,
        ...style,
      }}
      {...props}
    >
      <span className="text-center text-[{fontsize || '12px'}] text-[{textColor || 'currentColor'}]">
        {icono}
      </span>
    </div>
  );
}