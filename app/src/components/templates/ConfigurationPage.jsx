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
  ControlEmailConfig,
  ConsecutiveManager,
  ControlPlanilla,
  ScheduleConfigButton,
  UserManagement,
  DatabaseConnections,
  ScheduleConfiguration,
} from "../../index";


export function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState("database");
  const { user } = useAuth();

  const configTabs = [
    {
      id: "database",
      label: "Bases de Datos",
      icon: <FaDatabase />,
      component: <DatabaseConnections />,
      requiresAdmin: true,
    },
    {
      id: "email",
      label: "Configuración de Email",
      icon: <FaEnvelope />,
      component: <ControlEmailConfig />,
      requiresAdmin: false,
    },
    {
      id: "consecutive",
      label: "Gestión de Consecutivos",
      icon: <FaListOl />,
      component: <ConsecutiveManager />,
      requiresAdmin: false,
    },
    {
      id: "recipients",
      label: "Destinatarios de Email",
      icon: <FaUsers />,
      component: <ControlPlanilla />,
      requiresAdmin: false,
    },
    {
      id: "schedule",
      label: "Programación Automática",
      icon: <FaClock />,
      component: <ScheduleConfiguration />,
      requiresAdmin: true,
    },
    {
      id: "users",
      label: "Gestión de Usuarios",
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
      <Header>
        <h1>
          <FaCog /> Centro de Configuraciones
        </h1>
        <p>
          Gestiona todas las configuraciones del sistema desde un solo lugar
        </p>
      </Header>

      <TabContainer>
        <TabNav>
          {availableTabs.map((tab) => (
            <TabButton
              key={tab.id}
              $active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </TabButton>
          ))}
        </TabNav>

        <TabContent>
          {availableTabs.find((tab) => tab.id === activeTab)?.component}
        </TabContent>
      </TabContainer>
    </ConfigContainer>
  );
}

// Estilos
const ConfigContainer = styled.div`
  padding: 20px;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 30px;

  h1 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
    font-size: 2rem;
  }

  p {
    color: ${({ theme }) => theme.textSecondary};
    margin: 0;
  }
`;

const TabContainer = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const TabNav = styled.div`
  display: flex;
  background: ${({ theme }) => theme.tableHeader};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  overflow-x: auto;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const TabButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 20px;
  background: ${({ $active, theme }) =>
    $active ? theme.primary : "transparent"};
  color: ${({ $active, theme }) => ($active ? "white" : theme.text)};
  border: none;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  border-bottom: 3px solid
    ${({ $active, theme }) => ($active ? theme.primary : "transparent")};

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.primary : theme.tableHover};
  }

  span {
    font-weight: 500;
  }

  @media (max-width: 768px) {
    justify-content: flex-start;
    border-bottom: none;
    border-left: 3px solid
      ${({ $active, theme }) => ($active ? theme.primary : "transparent")};
  }
`;

const TabContent = styled.div`
  padding: 20px;
  min-height: 400px;
`;

const ScheduleContainer = styled.div`
  h2 {
    margin: 0 0 10px 0;
    color: ${({ theme }) => theme.title};
  }

  p {
    color: ${({ theme }) => theme.textSecondary};
    margin-bottom: 20px;
  }
`;
