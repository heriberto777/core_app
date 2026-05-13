import React, { useState } from "react";
import {
  FaCog,
  FaUsers,
  FaEnvelope,
  FaListOl,
  FaClock,
  FaUser,
  FaDatabase,
} from "react-icons/fa";
import {
  useAuth,
  usePermissions,
  ControlEmailConfig,
  ConsecutiveManager,
  ControlPlanilla,
  UserManagement,
  DatabaseConnections,
  ScheduleConfiguration,
  LoadingUI,
} from "../../index";

export function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState("database");
  const { user, loading } = useAuth();
  const { isAdmin, hasPermission } = usePermissions();

  if (loading) return <LoadingUI message="Cargando configuración..." />;

  const configTabs = [
    {
      id: "database",
      label: "Bases de Datos",
      description: "Configure y gestione las conexiones a las bases de datos de origen y destino.",
      icon: <FaDatabase />,
      component: <DatabaseConnections />,
      requiresAdmin: true,
    },
    {
      id: "email",
      label: "Configuración de Email",
      description: "Ajuste los parámetros del servidor SMTP para el envío de notificaciones y reportes.",
      icon: <FaEnvelope />,
      component: <ControlEmailConfig />,
      requiresAdmin: false,
    },
    {
      id: "consecutive",
      label: "Gestión de Consecutivos",
      description: "Administre los folios y numeraciones automáticas para documentos y procesos.",
      icon: <FaListOl />,
      component: <ConsecutiveManager />,
      requiresAdmin: false,
    },
    {
      id: "recipients",
      label: "Destinatarios de Email",
      description: "Gestione las listas de contactos y planillas que recibirán información del sistema.",
      icon: <FaUsers />,
      component: <ControlPlanilla />,
      requiresAdmin: false,
    },
    {
      id: "schedule",
      label: "Programación Automática",
      description: "Configure las tareas programadas y la ejecución automática de transferencias.",
      icon: <FaClock />,
      component: <ScheduleConfiguration />,
      requiresAdmin: true,
    },
    {
      id: "users",
      label: "Gestión de Usuarios",
      description: "Administre los accesos, roles y perfiles de usuario del sistema.",
      icon: <FaUser />,
      component: <UserManagement />,
      requiresAdmin: true,
    },
  ];

  const availableTabs = configTabs.filter(
    (tab) => !tab.requiresAdmin || user?.role?.includes("admin")
  );

  const activeTabData = availableTabs.find((t) => t.id === activeTab);

  return (
    <div className="flex flex-col gap-5 w-full flex-1 animate-fadeIn">
      <div className="grid grid-cols-[220px_1fr] gap-4 w-full min-h-0 items-start max-[1024px]:grid-cols-1">
        <aside className="flex flex-col gap-3 bg-slate-100/20 dark:bg-slate-700/20 p-3 rounded-3xl border border-slate-200/30 dark:border-slate-700/30 h-fit sticky top-6 backdrop-blur-sm min-w-[200px]">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-4 p-4 bg-transparent rounded-xl cursor-pointer transition-all duration-300 font-semibold text-left overflow-hidden hover:bg-slate-200/60 dark:hover:bg-slate-600/60 hover:translate-x-2 ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-blue-500/20 to-blue-500/10 shadow-lg border border-blue-500/30 text-blue-500"
                  : "text-slate-500 dark:text-slate-400 border border-transparent"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute left-0 top-[15%] h-[70%] w-1 bg-blue-500 rounded-r-full shadow-lg shadow-blue-500/50"></div>
              )}
            </button>
          ))}
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
