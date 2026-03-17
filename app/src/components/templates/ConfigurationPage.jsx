import React, { useState } from "react";
import styled from "styled-components";
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

  // Filtrar tabs según permisos
  const availableTabs = configTabs.filter(
    (tab) => !tab.requiresAdmin || user?.role?.includes("admin")
  );

  return (
    <ConfigContainer>

      <MainLayout>
        <SideNav>
          {availableTabs.map((tab) => (
            <NavButton
              key={tab.id}
              $active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="icon">{tab.icon}</span>
              <span className="label">{tab.label}</span>
              {activeTab === tab.id && <ActiveIndicator layoutId="active" />}
            </NavButton>
          ))}
        </SideNav>

        <ContentArea>
          <GlassCard>
            <div className="content-header">
              <div style={{ flex: 1 }}>
                <h2>{availableTabs.find(t => t.id === activeTab)?.label}</h2>
                <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: '14px' }}>
                  {availableTabs.find(t => t.id === activeTab)?.description}
                </p>
              </div>
            </div>
            <div className="content-body">
              {availableTabs.find((tab) => tab.id === activeTab)?.component}
            </div>
          </GlassCard>
        </ContentArea>
      </MainLayout>
    </ConfigContainer>
  );
}

// --- ESTILOS MODERNIZADOS ---

const ConfigContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  flex: 1;
  animation: fadeIn 0.5s ease;

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;


const MainLayout = styled.div`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  width: 100%;
  min-height: 0;
  align-items: flex-start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const SideNav = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${({ theme }) => theme.bg2}20;
  padding: 12px;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.border}30;
  height: fit-content;
  position: sticky;
  top: 24px;
  backdrop-filter: blur(8px);
  min-width: 200px;
`;

const NavButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px 20px;
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.primary : theme.textSecondary)};
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 600;
  text-align: left;
  overflow: hidden;

  &:hover {
    background: ${({ theme }) => theme.bg2}60;
    color: ${({ theme }) => theme.primary};
    transform: translateX(8px);
  }

  .icon {
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s;
  }

  &:hover .icon {
    transform: scale(1.1);
  }

  ${({ $active, theme }) => $active && `
    background: linear-gradient(135deg, ${theme.primary}25 0%, ${theme.primary}08 100%);
    box-shadow: 0 8px 20px ${theme.primary}15;
    border: 1px solid ${theme.primary}30;
  `}
`;

const ActiveIndicator = styled.div`
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 4px;
  background: ${({ theme }) => theme.primary};
  border-radius: 0 4px 4px 0;
  box-shadow: 2px 0 10px ${({ theme }) => theme.primary}50;
`;

const ContentArea = styled.main`
  min-height: 0;
  flex: 1;
`;

const GlassCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(12px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 28px;
  padding: 24px;
  width: 100%;
  min-width: 0;
  box-shadow: 0 10px 40px rgba(0,0,0,0.06);

  .content-header {
    margin-bottom: 25px;
    padding-bottom: 20px;
    border-bottom: 1px solid ${({ theme }) => theme.border}40;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h2 {
      margin: 0;
      font-size: 1.8rem;
      font-weight: 800;
      color: ${({ theme }) => theme.titleColor};
    }
  }

  .content-body {
    animation: slideUp 0.4s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
