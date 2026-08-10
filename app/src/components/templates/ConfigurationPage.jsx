import React, { useState } from "react";
import {
  FaCog,
  FaUsers,
  FaEnvelope,
  FaListOl,
  FaClock,
  FaUser,
  FaDatabase,
  FaBell,
  FaChevronDown,
  FaServer,
  FaComments,
  FaKey,
} from "react-icons/fa";
import {
  useAuth,
  usePermissions,
  ControlEmailConfig,
  ConsecutiveManager,
  ControlPlanilla,
  ControlNotificationConfig,
  UserManagement,
  DatabaseConnections,
  ScheduleConfiguration,
  LoadingUI,
} from "../../index";

// Grupos por dominio para el acordeón del sidebar — antes eran 7 pestañas
// sueltas en una sola lista vertical, ocupando mucho espacio de entrada
// (más notorio ahora que el sidebar dejó de ser sticky en móvil/tablet).
const GROUPS = [
  { id: "infra", label: "Infraestructura", icon: <FaServer /> },
  { id: "comms", label: "Comunicaciones", icon: <FaComments /> },
  { id: "auto", label: "Automatización y Accesos", icon: <FaKey /> },
];

export function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState("database");
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(["infra"]));
  const { loading } = useAuth();
  const { isAdmin, hasPermission } = usePermissions();

  if (loading) return <LoadingUI message="Cargando configuración..." />;

  const configTabs = [
    {
      id: "database",
      group: "infra",
      label: "Bases de Datos",
      description: "Configure y gestione las conexiones a las bases de datos de origen y destino.",
      icon: <FaDatabase />,
      component: <DatabaseConnections />,
      requiresAdmin: true,
      requiredResource: "settings",
      requiredAction: "read",
    },
    {
      id: "email",
      group: "comms",
      label: "Configuración de Email",
      description: "Ajuste los parámetros del servidor SMTP para el envío de notificaciones y reportes.",
      icon: <FaEnvelope />,
      component: <ControlEmailConfig />,
      requiresAdmin: false,
    },
    {
      id: "recipients",
      group: "comms",
      label: "Destinatarios de Email",
      description: "Gestione las listas de contactos y planillas que recibirán información del sistema.",
      icon: <FaUsers />,
      component: <ControlPlanilla />,
      requiresAdmin: false,
    },
    {
      id: "notifications",
      group: "comms",
      label: "Notificaciones (Webhook)",
      description: "Conecta un webhook externo (ej. n8n) para recibir el resumen de tareas automáticas y manuales.",
      icon: <FaBell />,
      component: <ControlNotificationConfig />,
      requiresAdmin: false,
    },
    {
      id: "consecutive",
      group: "auto",
      label: "Gestión de Consecutivos",
      description: "Administre los folios y numeraciones automáticas para documentos y procesos.",
      icon: <FaListOl />,
      component: <ConsecutiveManager />,
      requiresAdmin: false,
    },
    {
      id: "schedule",
      group: "auto",
      label: "Programación Automática",
      description: "Configure las tareas programadas y la ejecución automática de transferencias.",
      icon: <FaClock />,
      component: <ScheduleConfiguration />,
      requiresAdmin: true,
      // El scheduler vive bajo el recurso "loads" en el backend
      // (transferTaskRoutes.js: /config/horas usa checkPermission("loads", ...)),
      // no un recurso propio — se refleja igual aquí a propósito.
      requiredResource: "loads",
      requiredAction: "read",
    },
    {
      id: "users",
      group: "auto",
      label: "Gestión de Usuarios",
      description: "Administre los accesos, roles y perfiles de usuario del sistema.",
      icon: <FaUser />,
      component: <UserManagement hideHeader />,
      requiresAdmin: true,
      requiredResource: "users",
      requiredAction: "read",
    },
  ];

  // Antes esto comparaba contra `user.role` (campo legacy, deprecated —
  // ver useBasePermissions.hasLegacyRole), que el formulario de creación de
  // usuarios nunca llena. Un usuario marcado isAdmin o con un rol moderno
  // con permisos reales nunca veía estas pestañas por esa desconexión.
  const availableTabs = configTabs.filter(
    (tab) => !tab.requiresAdmin || isAdmin || hasPermission(tab.requiredResource, tab.requiredAction)
  );

  const activeTabData = availableTabs.find((t) => t.id === activeTab);

  const visibleGroups = GROUPS.filter((g) => availableTabs.some((t) => t.group === g.id));

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectTab = (tab) => {
    setActiveTab(tab.id);
    setExpandedGroups((prev) => new Set(prev).add(tab.group));
  };

  return (
    <div className="flex flex-col gap-5 w-full flex-1 animate-fadeIn">
      <div className="grid grid-cols-[220px_1fr] gap-4 w-full min-h-0 items-start max-[1024px]:grid-cols-1">
        <aside className="flex flex-col gap-2 bg-slate-100/20 dark:bg-slate-700/20 p-3 rounded-3xl border border-slate-200/30 dark:border-slate-700/30 h-fit lg:sticky lg:top-6 backdrop-blur-sm min-w-[200px]">
          {visibleGroups.map((group) => {
            const groupTabs = availableTabs.filter((t) => t.group === group.id);
            const isExpanded = expandedGroups.has(group.id);

            return (
              <div key={group.id} className="flex flex-col gap-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center gap-3 p-3 rounded-xl font-bold text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-600/60 transition-all"
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm">{group.icon}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <FaChevronDown
                    className={`text-[10px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-1 pl-1 animate-fadeIn">
                    {groupTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => selectTab(tab)}
                        className={`relative flex items-center gap-4 p-3 pl-4 bg-transparent rounded-xl cursor-pointer transition-all duration-300 font-semibold text-left text-sm overflow-hidden hover:bg-slate-200/60 dark:hover:bg-slate-600/60 hover:translate-x-2 ${
                          activeTab === tab.id
                            ? "bg-gradient-to-r from-blue-500/20 to-blue-500/10 shadow-lg border border-blue-500/30 text-blue-500"
                            : "text-slate-500 dark:text-slate-400 border border-transparent"
                        }`}
                      >
                        <span className="text-base">{tab.icon}</span>
                        <span>{tab.label}</span>
                        {activeTab === tab.id && (
                          <div className="absolute left-0 top-[15%] h-[70%] w-1 bg-blue-500 rounded-r-full shadow-lg shadow-blue-500/50"></div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <main className="min-h-0 flex-1">
          <div className="bg-white dark:bg-slate-800 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-3xl p-6 w-full min-w-0 shadow-xl animate-slideUp">
            <div className="mb-6 pb-5 border-b border-slate-200/40 dark:border-slate-700/40 flex justify-between items-center">
              <div className="flex-1">
                <h2 className="m-0 text-2xl font-extrabold text-slate-900 dark:text-white">
                  {activeTabData?.label}
                </h2>
                <p className="mt-2 text-sm opacity-70">
                  {activeTabData?.description}
                </p>
              </div>
            </div>
            <div className="animate-slideUp">
              {activeTabData?.component}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
