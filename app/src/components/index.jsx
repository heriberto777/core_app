// Layouts base - Migrado a Tailwind

// Container
export const Container = ({ children, className = "" }) => (
  <div className={`w-full mx-6 lg:mx-8 ${className}`}>
    {children}
  </div>
);

// Section
export const Section = ({ children, className = "" }) => (
  <section className={`mb-10 ${className}`}>
    {children}
  </section>
);

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
