import React from "react";

const Spinner = ({ size = "medium", color = "#28a745" }) => {
  // Determinar tamaño basado en prop
  let dimensions;
  switch (size) {
    case "small":
      dimensions = { outer: 24, inner: 20 };
      break;
    case "large":
      dimensions = { outer: 60, inner: 50 };
      break;
    case "medium":
    default:
      dimensions = { outer: 40, inner: 34 };
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className="relative"
        style={{
          width: `${dimensions.outer}px`,
          height: `${dimensions.outer}px`,
        }}
      >
        {/* Anillo giratorio exterior */}
        <div
          className="absolute inset-0 rounded-full border-4 border-t-transparent"
          style={{
            borderColor: `rgba(${color
              .replace("#", "")
              .match(/../g)
              .map((x) => parseInt(x, 16))
              .join(", ")}, 0.2)`,
            borderTopColor: "transparent",
            animation: "spin 1s linear infinite",
          }}
        ></div>

        {/* Anillo giratorio interior */}
        <div
          className="absolute inset-0 rounded-full border-4 border-t-transparent"
          style={{
            margin: `${(dimensions.outer - dimensions.inner) / 2}px`,
            borderColor: color,
            borderTopColor: "transparent",
            animation: "spin-reverse 0.8s linear infinite",
          }}
        ></div>
      </div>

      {/* Estilos para las animaciones */}
      <style jsx>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes spin-reverse {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(-360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default Spinner;
