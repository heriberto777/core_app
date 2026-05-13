import React from "react";

/**
 * Corporate LoadingSpinner (Tailwind Edition)
 * Sin styled-components - usa animaciones CSS del archivo index.css
 */

const sizes = {
  tiny: { container: "w-3 h-3", border: "border-[1px]", dot: "w-1 h-1", bar: "w-0.5", circle: "w-1.5 h-1.5", text: "text-[10px]" },
  small: { container: "w-4 h-4", border: "border-2", dot: "w-1.5 h-1.5", bar: "w-1", circle: "w-2 h-2", text: "text-xs" },
  medium: { container: "w-6 h-6", border: "border-2", dot: "w-2 h-2", bar: "w-1", circle: "w-2.5 h-2.5", text: "text-sm" },
  large: { container: "w-8 h-8", border: "border-3", dot: "w-2.5 h-2.5", bar: "w-1.5", circle: "w-3 h-3", text: "text-base" },
  xlarge: { container: "w-12 h-12", border: "border-3", dot: "w-3 h-3", bar: "w-2", circle: "w-3.5 h-3.5", text: "text-lg" },
  huge: { container: "w-16 h-16", border: "border-4", dot: "w-4 h-4", bar: "w-2", circle: "w-4.5 h-4.5", text: "text-xl" },
};

export const LoadingSpinner = ({
  size = "medium",
  color = null,
  type = "spinner",
  text = "🔄",
  showText = false,
  textLabel = "Cargando...",
  className = "",
  style,
  ...props
}) => {
  const sizeConfig = sizes[size] || sizes.medium;
  const spinnerColor = color || "border-primary-500";
  const bgColor = color ? `border-transparent border-t-transparent` : "border-slate-200 border-t-primary-500";

  const renderSpinner = () => {
    switch (type) {
      case "dots":
        return (
          <div className={`flex items-center gap-1`}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${sizeConfig.dot} rounded-full ${spinnerColor} animate-pulse`}
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        );

      case "bars":
        return (
          <div className={`flex items-end h-full gap-0.5`}>
            {[0.2, 0.4, 0.6, 0.8, 1].map((height, i) => (
              <div
                key={i}
                className={`${sizeConfig.bar} ${spinnerColor} rounded-t animate-wave`}
                style={{ height: `${height * 100}%`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        );

      case "bouncing":
        return (
          <div className={`flex items-center gap-1`}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${sizeConfig.circle} rounded-full ${spinnerColor} animate-bounce`}
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        );

      case "text":
        return (
          <span className={`${sizeConfig.text} ${spinnerColor} animate-spin`}>
            {text}
          </span>
        );

      case "ring":
        return (
          <div
            className={`w-full h-full rounded-full border-4 ${bgColor} animate-spin`}
          />
        );

      default:
        return (
          <div
            className={`w-full h-full rounded-full border-4 border-slate-200 ${spinnerColor} animate-spin`}
          />
        );
    }
  };

  return (
    <div
      className={`inline-flex items-center justify-center ${sizeConfig.container} ${className}`}
      style={style}
      {...props}
    >
      {renderSpinner()}
    </div>
  );
};

export const SmallSpinner = (props) => (
  <LoadingSpinner size="small" {...props} />
);

export const LargeSpinner = (props) => (
  <LoadingSpinner size="large" {...props} />
);

export const DotsLoader = (props) => <LoadingSpinner type="dots" {...props} />;

export const BarsLoader = (props) => <LoadingSpinner type="bars" {...props} />;

export const TextLoader = (props) => <LoadingSpinner type="text" {...props} />;

export const PageLoader = ({
  message = "Cargando...",
  size = "large",
  type = "spinner",
  ...props
}) => (
  <div className="flex flex-col items-center justify-center min-h-[200px] p-12 gap-4">
    <LoadingSpinner size={size} type={type} {...props} />
    <div className="text-sm text-slate-500 text-center">
      {message}
    </div>
  </div>
);