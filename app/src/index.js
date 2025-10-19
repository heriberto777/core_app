// /src/index.js - VERSIÓN CORREGIDA

// ========== COMPONENTES REACT ==========
// Átomos
export * from "./components/atomos/ContentHeader";
export * from "./components/atomos/FilterInput";
export * from "./components/atomos/Icono";
export * from "./components/atomos/LoadsButton";
export * from "./components/atomos/MultiSelectInput";
export * from "./components/atomos/StatusBadge";
export * from "./components/atomos/LoadingSpinner";
// export * from "./components/atomos/TextInput";
// export * from "./components/atomos/TextAreaInput";
// export * from "./components/atomos/SelectInput";
// export * from "./components/atomos/CheckboxInput";

// Moléculas
export * from "./components/meleculas/BotonCircular";
export * from "./components/meleculas/FiltersPanel";
export * from "./components/meleculas/ItemDesplegable";
export * from "./components/meleculas/ListaMenuDesplegable";
export * from "./components/meleculas/OrderCard";
export * from "./components/meleculas/OrderDetailsModal";
export * from "./components/meleculas/RefreshButton";
export * from "./components/meleculas/TraspasoFilters";
export * from "./components/meleculas/TraspasoStatusCard";
export * from "./components/meleculas/ConfirmDialog";
export { Pagination as CustomPagination } from "./components/meleculas/Pagination";
export * from "./components/meleculas/DateRangeInput";




// Organismos
export * from "./components/organismos/DataUser";
export * from "./components/organismos/DeliveryPersonSelector";
export * from "./components/organismos/OrdersList";
export * from "./components/organismos/ScheduleConfigManager";
export * from "./components/organismos/ScheduleConfiguration";
export * from "./components/organismos/Sidebar";
export * from "./components/organismos/UIComponents";
export * from "./components/organismos/UserProfile";
export * from "./components/organismos/TraspasoFiltersPanel";
export * from "./components/organismos/TraspasoTrackingTable";
export * from "./components/organismos/NotificationContainer";



// Organismos con default export
export { default as ConsecutiveConfigSection } from "./components/organismos/ConsecutiveConfigSection";
export { default as DynamicSidebar } from "./components/organismos/DynamicSidebar";
export { default as Header } from "./components/organismos/Header";
export { default as LinkedGroupsManager } from "./components/organismos/LinkedGroupsManager";
export { default as ModuleManager } from "./components/organismos/ModuleManager";
export { default as RoleManagement } from "./components/organismos/RoleManagement";
export { default as Spinner } from "./components/organismos/Spinner";
export { default as UserManagement } from "./components/organismos/UserManagement";
export { default as UserRoleManager } from "./components/organismos/UserRoleManager";


// Templates
export * from "./components/templates/ConfigurationPage";
export * from "./components/templates/ConsecutiveDashboard";
export * from "./components/templates/ConsecutiveManager";
export * from "./components/templates/ControlEmailConfig";
export * from "./components/templates/ControlPlanilla";
export * from "./components/templates/CustomerEditor";
export * from "./components/templates/Dashboard";
export * from "./components/templates/DatabaseConnections";
export * from "./components/templates/LoadsManagement";
export * from "./components/templates/LoadsResumen";
export * from "./components/templates/LoadsTasks";
export * from "./components/templates/LoginForm";
export * from "./components/templates/LogsPage";
export * from "./components/templates/MappingEditor";
export * from "./components/templates/MappingsList";
export * from "./components/templates/OrdersVisualization";
export * from "./components/templates/PlanillaBase";
export * from "./components/templates/Statistics";
export * from "./components/templates/TransferHistory";
export * from "./components/templates/TransferHistoryLogs";
export * from "./components/templates/TransferTask";
export * from "./components/templates/TraspasoManagement";


// Templates con default export
export { default as DetailTableWithPromotions } from "./components/templates/DetailTableWithPromotions";
export { default as DocumentsVisualization } from "./components/templates/DocumentsVisualization";
export { default as PromotionConfigSection } from "./components/templates/PromotionConfigSection";
export { default as PromotionIndicator } from "./components/templates/PromotionIndicator";
export { default as ProtectedComponent } from "./components/templates/ProtectedComponent";

// ========== HOOKS ==========
export * from "./hooks/useAuth";
export * from "./hooks/useFetchTask";
export * from "./hooks/useForm";
export * from "./hooks/usePermissions";
export * from "./hooks/useFetchTransfers";
export * from "./hooks/useTransferManagement";
export * from "./hooks/useNotification";
export * from "./hooks/usePagination";
export * from "./hooks/useDebounce";


// ========== CONTEXTS ==========
export * from "./contexts/AuthContexts";
export * from "./contexts/ReloadProvider";

// ========== LAYOUTS ==========
export { default as AdminLayout } from "./layouts/AdminLayout/AdminLayout";

// ========== PAGES ==========
export * from "./pages/admin/Auth/Auth";
export { default as UnauthorizedPage } from "./pages/admin/UnauthorizedPage";

// ========== ROUTERS ==========
export * from "./routers/AdminRouter";

// ========== APP ==========
export * from "./App";
