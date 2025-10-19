// src/components/atomos/LoadingSpinner.jsx
import React from "react";
import styled, { keyframes } from "styled-components";

// 🔄 Animaciones
const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const bounce = keyframes`
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
`;

const wave = keyframes`
  0%, 60%, 100% {
    transform: initial;
  }
  30% {
    transform: translateY(-15px);
  }
`;

// 🔄 Container principal
const SpinnerContainer = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  ${({ size }) => {
    const sizes = {
      tiny: "12px",
      small: "16px",
      medium: "24px",
      large: "32px",
      xlarge: "48px",
      huge: "64px",
    };
    return `
      width: ${sizes[size] || sizes.medium};
      height: ${sizes[size] || sizes.medium};
    `;
  }}
`;

// 🔄 Spinner circular clásico
const CircularSpinner = styled.div`
  width: 100%;
  height: 100%;
  border: ${({ size }) => {
      const borderWidths = {
        tiny: "1px",
        small: "2px",
        medium: "2px",
        large: "3px",
        xlarge: "3px",
        huge: "4px",
      };
      return borderWidths[size] || "2px";
    }}
    solid #e5e7eb;
  border-top: ${({ size }) => {
      const borderWidths = {
        tiny: "1px",
        small: "2px",
        medium: "2px",
        large: "3px",
        xlarge: "3px",
        huge: "4px",
      };
      return borderWidths[size] || "2px";
    }}
    solid ${({ color }) => color || "#3b82f6"};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

// 🔄 Spinner de puntos
const DotsSpinner = styled.div`
  display: flex;
  gap: ${({ size }) => {
    const gaps = {
      tiny: "2px",
      small: "3px",
      medium: "4px",
      large: "5px",
      xlarge: "6px",
      huge: "8px",
    };
    return gaps[size] || "4px";
  }};
  align-items: center;

  .dot {
    width: ${({ size }) => {
      const dotSizes = {
        tiny: "4px",
        small: "6px",
        medium: "8px",
        large: "10px",
        xlarge: "12px",
        huge: "16px",
      };
      return dotSizes[size] || "8px";
    }};
    height: ${({ size }) => {
      const dotSizes = {
        tiny: "4px",
        small: "6px",
        medium: "8px",
        large: "10px",
        xlarge: "12px",
        huge: "16px",
      };
      return dotSizes[size] || "8px";
    }};
    background: ${({ color }) => color || "#3b82f6"};
    border-radius: 50%;
    animation: ${pulse} 1.4s ease-in-out infinite both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0s;
    }
  }
`;

// 🔄 Spinner de barras
const BarsSpinner = styled.div`
  display: flex;
  gap: ${({ size }) => {
    const gaps = {
      tiny: "1px",
      small: "2px",
      medium: "3px",
      large: "4px",
      xlarge: "5px",
      huge: "6px",
    };
    return gaps[size] || "3px";
  }};
  align-items: end;
  height: 100%;

  .bar {
    width: ${({ size }) => {
      const barWidths = {
        tiny: "2px",
        small: "3px",
        medium: "4px",
        large: "5px",
        xlarge: "6px",
        huge: "8px",
      };
      return barWidths[size] || "4px";
    }};
    background: ${({ color }) => color || "#3b82f6"};
    animation: ${wave} 1.2s ease-in-out infinite;
    transform-origin: bottom;

    &:nth-child(1) {
      height: 20%;
      animation-delay: -0.4s;
    }
    &:nth-child(2) {
      height: 40%;
      animation-delay: -0.3s;
    }
    &:nth-child(3) {
      height: 60%;
      animation-delay: -0.2s;
    }
    &:nth-child(4) {
      height: 80%;
      animation-delay: -0.1s;
    }
    &:nth-child(5) {
      height: 100%;
      animation-delay: 0s;
    }
  }
`;

// 🔄 Spinner de círculos rebotando
const BouncingSpinner = styled.div`
  display: flex;
  gap: ${({ size }) => {
    const gaps = {
      tiny: "2px",
      small: "3px",
      medium: "4px",
      large: "5px",
      xlarge: "6px",
      huge: "8px",
    };
    return gaps[size] || "4px";
  }};

  .circle {
    width: ${({ size }) => {
      const circleSizes = {
        tiny: "6px",
        small: "8px",
        medium: "10px",
        large: "12px",
        xlarge: "14px",
        huge: "18px",
      };
      return circleSizes[size] || "10px";
    }};
    height: ${({ size }) => {
      const circleSizes = {
        tiny: "6px",
        small: "8px",
        medium: "10px",
        large: "12px",
        xlarge: "14px",
        huge: "18px",
      };
      return circleSizes[size] || "10px";
    }};
    background: ${({ color }) => color || "#3b82f6"};
    border-radius: 50%;
    animation: ${bounce} 1.4s ease-in-out infinite both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0s;
    }
  }
`;

// 🔄 Spinner de texto/emoji
const TextSpinner = styled.div`
  font-size: ${({ size }) => {
    const fontSizes = {
      tiny: "10px",
      small: "12px",
      medium: "16px",
      large: "20px",
      xlarge: "24px",
      huge: "32px",
    };
    return fontSizes[size] || "16px";
  }};
  color: ${({ color }) => color || "#3b82f6"};
  animation: ${spin} 2s linear infinite;
  user-select: none;
`;

// 🔄 Spinner de anillo
const RingSpinner = styled.div`
  width: 100%;
  height: 100%;
  border: ${({ size }) => {
      const borderWidths = {
        tiny: "1px",
        small: "2px",
        medium: "3px",
        large: "4px",
        xlarge: "5px",
        huge: "6px",
      };
      return borderWidths[size] || "3px";
    }}
    solid transparent;
  border-top: ${({ size }) => {
      const borderWidths = {
        tiny: "1px",
        small: "2px",
        medium: "3px",
        large: "4px",
        xlarge: "5px",
        huge: "6px",
      };
      return borderWidths[size] || "3px";
    }}
    solid ${({ color }) => color || "#3b82f6"};
  border-bottom: ${({ size }) => {
      const borderWidths = {
        tiny: "1px",
        small: "2px",
        medium: "3px",
        large: "4px",
        xlarge: "5px",
        huge: "6px",
      };
      return borderWidths[size] || "3px";
    }}
    solid ${({ color }) => color || "#3b82f6"};
  border-radius: 50%;
  animation: ${spin} 1.2s linear infinite;
`;

// 🔄 Wrapper con texto adicional
const SpinnerWithText = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .spinner-text {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    max-width: 200px;
  }
`;

export const LoadingSpinner = ({
  size = "medium",
  color = null,
  type = "spinner", // 'spinner', 'dots', 'bars', 'bouncing', 'text', 'ring'
  text = "🔄",
  showText = false,
  textLabel = "Cargando...",
  className,
  style,
  ...props
}) => {
  const renderSpinner = () => {
    const spinnerProps = { size, color };

    switch (type) {
      case "dots":
        return (
          <DotsSpinner {...spinnerProps}>
            <div className="dot" />
            <div className="dot" />
            <div className="dot" />
          </DotsSpinner>
        );

      case "bars":
        return (
          <BarsSpinner {...spinnerProps}>
            <div className="bar" />
            <div className="bar" />
            <div className="bar" />
            <div className="bar" />
            <div className="bar" />
          </BarsSpinner>
        );

      case "bouncing":
        return (
          <BouncingSpinner {...spinnerProps}>
            <div className="circle" />
            <div className="circle" />
            <div className="circle" />
          </BouncingSpinner>
        );

      case "text":
        return <TextSpinner {...spinnerProps}>{text}</TextSpinner>;

      case "ring":
        return <RingSpinner {...spinnerProps} />;

      default: // 'spinner'
        return <CircularSpinner {...spinnerProps} />;
    }
  };

  const spinner = (
    <SpinnerContainer
      size={size}
      className={className}
      style={style}
      {...props}
    >
      {renderSpinner()}
    </SpinnerContainer>
  );

  if (showText) {
    return (
      <SpinnerWithText>
        {spinner}
        <div className="spinner-text">{textLabel}</div>
      </SpinnerWithText>
    );
  }

  return spinner;
};

// 🔄 Exportar variantes predefinidas para casos comunes
export const SmallSpinner = (props) => (
  <LoadingSpinner size="small" {...props} />
);

export const LargeSpinner = (props) => (
  <LoadingSpinner size="large" {...props} />
);

export const DotsLoader = (props) => <LoadingSpinner type="dots" {...props} />;

export const BarsLoader = (props) => <LoadingSpinner type="bars" {...props} />;

export const TextLoader = (props) => <LoadingSpinner type="text" {...props} />;

// 🔄 Componente de página completa para loading
export const PageLoader = ({
  message = "Cargando...",
  size = "large",
  type = "spinner",
  ...props
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "200px",
      padding: "48px",
      gap: "16px",
    }}
  >
    <LoadingSpinner size={size} type={type} {...props} />
    <div
      style={{
        fontSize: "14px",
        color: "#6b7280",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  </div>
);
