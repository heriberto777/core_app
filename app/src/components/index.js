import styled from "styled-components";

// Layouts base
export const Container = styled.div`
  width: 100%;
  margin: 0;
  padding: 0 24px;
  animation: fadeIn 0.4s ease-out;

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 768px) {
    padding: 0 10px;
  }
`;

export const Section = styled.section`
  margin-bottom: 40px;
`;

// Reaprovechar los exportadores para componentes comunes que se buscan en ../index
// Átomos
export * from "./atomos/Button";
export * from "./atomos/StatusBadge";
export * from "./atomos/StatCard";
export * from "./atomos/LoadingUI";
export * from "./atomos/LoadingSpinner";
export * from "./atomos/Input";
export * from "./atomos/Select";
export * from "./atomos/Icono";
export * from "./atomos/FilterInput";

// Moléculas
export * from "./meleculas/RefreshButton";
export * from "./meleculas/FiltersPanel";
export * from "./meleculas/BotonCircular";
export * from "./meleculas/OrderCard";
