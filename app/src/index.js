// /src/index.js - VERSIÓN CORREGIDA

// ========== COMPONENTES REACT ==========
// Átomos
export * from "./components/atomos/ContentHeader";
export * from "./components/atomos/FilterInput";
export * from "./components/atomos/Icono";
export * from "./components/atomos/LoadsButton";
export * from "./components/atomos/MultiSelectInput";
export * from "./components/atomos/StatusBadge";
export * from "./components/atomos/StatCard";
export * from "./components/atomos/LoadingUI";
export * from "./components/atomos/LoadingSpinner";
export * from "./components/atomos/Button";
export * from "./components/atomos/Input";
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
export * from "./components/meleculas/LogDetailModal";
export * from "./components/meleculas/ClearLogsModal";
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
export * from "./components/organismos/TaskMetricsPanel";
export * from "./components/organismos/TaskFormModal";
export * from "./components/organismos/LoadsProcessModal";
export * from "./components/organismos/TableConfigModal";
export * from "./components/organismos/FieldMappingModal";
export * from "./components/organismos/DependencyModal";
export * from "./components/organismos/DocumentRuleModal";
export * from "./components/organismos/ValueMappingModal";
export * from "./components/organismos/DocumentsFilterPanel";
export * from "./components/organismos/ProcessingResultsModal";
export * from "./components/organismos/ProcessingStatusModal";
export * from "./components/organismos/DocumentDetailsModal";
export * from "./components/organismos/DocumentsDataTable";
export * from "./components/organismos/ConsecutiveFormModal";
export * from "./components/organismos/ConsecutiveDetailsModal";
export * from "./components/organismos/ConsecutiveAssignModal";
export * from "./components/organismos/ConsecutiveDashboardPanel";
export * from "./components/organismos/OrdersFilterPanel";
export * from "./components/organismos/OrdersDataTable";
export * from "./components/organismos/OrdersCardsGrid";
export { OrderDetailsModalOrg as OrderDetailsModal } from "./components/organismos/OrderDetailsModal";
export * from "./components/organismos/StatCardsGrid";
export * from "./components/organismos/ServerHealthPanel";
export * from "./components/organismos/SchedulerPanel";
export * from "./components/organismos/RecentActivitiesTable";
export * from "./components/organismos/QuickAccessGrid";
export * from "./components/organismos/CustomerField";
export * from "./components/organismos/CustomerFormGroups";
export * from "./components/organismos/SourceDataViewerModal";
export * from "./components/organismos/EmailConfigTable";
export * from "./components/organismos/EmailConfigFormModal";
export * from "./components/organismos/EmailTestModal";
export * from "./components/organismos/SummaryFilterPanel";
export * from "./components/organismos/SummaryDataTable";
export * from "./components/organismos/TraspasoStatsGrid";
export * from "./components/organismos/LoadsStatsGrid";
export * from "./components/organismos/SummaryDetailsModal";
export * from "./components/organismos/ReturnProcessModal";
export * from "./components/organismos/RecipientFormModal";
export * from "./components/organismos/RecipientsTable";
export * from "./components/organismos/AuditFiltersPanel";
export * from "./components/organismos/AuditDataTable";
export * from "./components/organismos/IntelligenceGrids";
export * from "./components/organismos/DBConnectionModal";
export * from "./components/organismos/UserFormModal";
export * from "./components/organismos/UsersTable";
export * from "./components/organismos/RoleFormModal";
export * from "./components/organismos/RolesTable";
export * from "./components/organismos/LiveHealthCard";
export * from "./components/organismos/ModuleFormModal";
export * from "./components/organismos/ModulesTable";


// Organismos con default export
export { default as ConsecutiveConfigSection } from "./components/organismos/ConsecutiveConfigSection";
export { default as DynamicSidebar } from "./components/organismos/DynamicSidebar";
export { default as Header } from "./components/organismos/Header";
export { default as LinkedGroupsManager } from "./components/organismos/LinkedGroupsManager";
export { default as Spinner } from "./components/organismos/Spinner";
export { default as UserRoleManager } from "./components/organismos/UserRoleManager";
export { default as WorkflowConfigSection } from "./components/organismos/WorkflowConfigSection";


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
export * from "./components/templates/ModuleManager";
export * from "./components/templates/LogsPage";
export * from "./components/templates/MappingEditor";
export * from "./components/templates/MappingsList";
export * from "./components/templates/RoleManagement";
export * from "./components/templates/OrdersVisualization";
export * from "./components/templates/PlanillaBase";
export * from "./components/templates/Statistics";
export * from "./components/templates/TransferHistory";
export * from "./components/templates/TransferHistoryLogs";
export * from "./components/templates/AuditCenter";
export * from "./components/templates/UserManagement";
export * from "./components/templates/TransferTask";
export * from "./components/templates/TraspasoManagement";
export * from "./components/templates/UniversalDocumentManager";


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
export * from "./hooks/useLogin";
export * from "./hooks/usePermissions";
export * from "./hooks/useFetchTransfers";
export * from "./hooks/useTransferManagement";
export * from "./hooks/useNotification";
export * from "./hooks/usePagination";
export * from "./hooks/useDebounce";
export * from "./hooks/useTransferTask";
export * from "./hooks/useLoadsTasks";
export * from "./hooks/useMappingEditor";
export * from "./hooks/useDocumentsVisualization";
export * from "./hooks/useConsecutiveManager";
export * from "./hooks/useOrdersVisualization";
export * from "./hooks/useDashboard";
export * from "./hooks/useCustomerEditor";
export * from "./hooks/useEmailConfig";
export * from "./hooks/useLoadsResumen";
export * from "./hooks/useLoadsManagement";
export * from "./hooks/useEmailRecipients";
export * from "./hooks/useAuditLogs";
export * from "./hooks/usePromotionConfig";
export * from "./hooks/useSystemStats";
export * from "./hooks/useDBConnections";
export * from "./hooks/useUsers";
export * from "./hooks/useRoles";
export * from "./hooks/useModules";
export * from "./hooks/useMappings";
export * from "./hooks/useTaskHistory";


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

// ========== APIS ==========
export * from "./api/index";
