// components/molecules/Sidebar/Sidebar.jsx - VERSIÓN OPTIMIZADA
import React, { useContext, useState, useMemo } from "react";
import styled from "styled-components";
import SwitchMode from "react-switch";
import { v, ThemeContext, useAuth, usePermissions } from "../../index";
import { NavLink, useLocation } from "react-router-dom";
import { Device } from "../../styles/breakpoints";
import {
  FaMoon,
  FaSun,
  FaSignOutAlt,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { LayoutContext } from "../../layouts/AdminLayout/AdminLayout";

export function Sidebar({ state, setState }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { logout, user } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const location = useLocation();
  const layoutContext = useContext(LayoutContext);

  // Estados locales
  const [hoveredCategory, setHoveredCategory] = useState(null);

  // Usar contexto si está disponible
  const isOpen =
    layoutContext?.sidebarOpen !== undefined
      ? layoutContext.sidebarOpen
      : state;
  const toggleSidebar = layoutContext?.toggleSidebar || setState;

  // ⭐ CONFIGURACIÓN DE RUTAS OPTIMIZADA CON MEMOIZACIÓN ⭐
  const routesConfig = useMemo(
    () => [
      {
        path: "/dashboard",
        name: "Dashboard",
        icon: "🏠",
        category: "General",
        description: "Panel principal del sistema",
        order: 1,
        isAccessible: true, // Siempre accesible para usuarios autenticados
      },
      {
        path: "/tasks",
        name: "Tareas",
        icon: "📋",
        category: "Operaciones",
        description: "Gestión y transferencia de tareas",
        order: 2,
        isAccessible: hasPermission("tasks", "read"),
      },
      {
        path: "/loads",
        name: "Cargas",
        icon: "📦",
        category: "Operaciones",
        description: "Gestión de cargas de datos",
        order: 3,
        isAccessible: hasPermission("loads", "read"),
      },
      {
        path: "/documents",
        name: "Documentos",
        icon: "📄",
        category: "Documentos",
        description: "Gestión de documentos del sistema",
        order: 4,
        isAccessible: hasPermission("documents", "read"),
      },
      {
        path: "/summaries",
        name: "Resúmenes",
        icon: "📊",
        category: "Análisis",
        description: "Resúmenes y reportes del sistema",
        order: 5,
        isAccessible: hasPermission("reports", "read"),
      },
      {
        path: "/analytics",
        name: "Analíticas",
        icon: "📈",
        category: "Análisis",
        description: "Análisis estadístico y métricas",
        order: 6,
        isAccessible: hasPermission("analytics", "read"),
      },
      {
        path: "/historys",
        name: "Historial",
        icon: "🕐",
        category: "Análisis",
        description: "Historial de operaciones",
        order: 7,
        isAccessible: hasPermission("history", "read"),
      },
      {
        path: "/users",
        name: "Usuarios",
        icon: "👥",
        category: "Administración",
        description: "Gestión de usuarios del sistema",
        order: 8,
        isAccessible: isAdmin && hasPermission("users", "read"),
      },
      {
        path: "/roles",
        name: "Roles",
        icon: "🔐",
        category: "Administración",
        description: "Gestión de roles y permisos",
        order: 9,
        isAccessible: isAdmin && hasPermission("roles", "read"),
      },
      {
        path: "/modules",
        name: "Modulos",
        icon: "🔐",
        category: "Administración",
        description: "Gestión de modulos",
        order: 9,
        isAccessible: isAdmin && hasPermission("modules", "read"),
      },
      {
        path: "/configuraciones",
        name: "Configuraciones",
        icon: "⚙️",
        category: "Sistema",
        description: "Configuraciones del sistema",
        order: 10,
        isAccessible: hasPermission("settings", "read"),
      },
      {
        path: "/perfil",
        name: "Mi Perfil",
        icon: "👤",
        category: "Personal",
        description: "Configuración del perfil personal",
        order: 11,
        isAccessible: true, // Siempre accesible
      },
    ],
    [hasPermission, isAdmin]
  );

  // ⭐ FILTRAR Y AGRUPAR RUTAS ACCESIBLES ⭐
  const groupedRoutes = useMemo(() => {
    const accessibleRoutes = routesConfig
      .filter((route) => route.isAccessible)
      .sort((a, b) => a.order - b.order);

    const grouped = accessibleRoutes.reduce((acc, route) => {
      if (!acc[route.category]) {
        acc[route.category] = [];
      }
      acc[route.category].push(route);
      return acc;
    }, {});

    return grouped;
  }, [routesConfig]);

  // ⭐ MANEJAR LOGOUT CON CONFIRMACIÓN ⭐
  const handleLogout = () => {
    if (window.confirm("¿Estás seguro de que deseas cerrar sesión?")) {
      logout();
    }
  };

  // ⭐ RENDERIZAR ELEMENTO DE NAVEGACIÓN ⭐
  const renderNavItem = (route) => (
    <NavItem key={route.path}>
      <StyledNavLink
        to={route.path}
        className={({ isActive }) => (isActive ? "active" : "")}
        title={route.description}
      >
        <span className="icon">{route.icon}</span>
        {isOpen && <span className="label">{route.name}</span>}
      </StyledNavLink>
    </NavItem>
  );

  // ⭐ RENDERIZAR CATEGORÍA ⭐
  const renderCategory = (categoryName, routes) => (
    <CategorySection
      key={categoryName}
      onMouseEnter={() => setHoveredCategory(categoryName)}
      onMouseLeave={() => setHoveredCategory(null)}
    >
      {isOpen && (
        <CategoryTitle>
          {categoryName}
          {hoveredCategory === categoryName && (
            <CategoryTooltip>
              {routes.length} elemento{routes.length > 1 ? "s" : ""}
            </CategoryTooltip>
          )}
        </CategoryTitle>
      )}
      <nav>{routes.map(renderNavItem)}</nav>
    </CategorySection>
  );

  return (
    <Container className={isOpen ? "open" : "closed"}>
      {/* ⭐ HEADER DEL SIDEBAR ⭐ */}
      <Header>
        <div className="brand">
          <span className="logo">📊</span>
          {isOpen && <span className="brand-text">Control Panel</span>}
        </div>
        <ToggleButton onClick={toggleSidebar}>
          {isOpen ? <FaChevronLeft /> : <FaChevronRight />}
        </ToggleButton>
      </Header>

      {/* ⭐ INFORMACIÓN DEL USUARIO ⭐ */}
      {isOpen && user && (
        <UserInfo>
          <div className="user-avatar">
            {user.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="user-details">
            <div className="user-name">
              {user.name} {user.lastname}
            </div>
            <div className="user-role">
              {isAdmin
                ? "Administrador"
                : user.roles?.[0]?.displayName || "Usuario"}
            </div>
          </div>
        </UserInfo>
      )}

      {/* ⭐ NAVEGACIÓN PRINCIPAL ⭐ */}
      <Navigation>
        {Object.entries(groupedRoutes).map(([categoryName, routes]) =>
          renderCategory(categoryName, routes)
        )}
      </Navigation>

      {/* ⭐ FOOTER DEL SIDEBAR ⭐ */}
      <Footer>
        {/* Switch de tema */}
        <ThemeToggle>
          <SwitchMode
            checked={theme === "dark"}
            onChange={toggleTheme}
            offColor="#ccc"
            onColor="#4a90e2"
            uncheckedIcon={<FaSun size={16} color="#FDB813" />}
            checkedIcon={<FaMoon size={16} color="#fff" />}
            width={48}
            height={24}
          />
          {isOpen && <span>Tema {theme === "dark" ? "Oscuro" : "Claro"}</span>}
        </ThemeToggle>

        {/* Botón de logout */}
        <LogoutButton onClick={handleLogout} title="Cerrar Sesión">
          <FaSignOutAlt />
          {isOpen && <span>Cerrar Sesión</span>}
        </LogoutButton>
      </Footer>
    </Container>
  );
}

// ⭐ STYLED COMPONENTS OPTIMIZADOS ⭐
const Container = styled.aside`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: ${({ theme }) => theme.sidebarBg || theme.bg};
  border-right: 1px solid ${({ theme }) => theme.border || "#e0e0e0"};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 10;

  &.open {
    width: 260px;
  }

  &.closed {
    width: 65px;
  }

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;

    &.closed {
      transform: translateX(-100%);
    }
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#e0e0e0"};
  min-height: 70px;

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    .logo {
      font-size: 1.5rem;
    }

    .brand-text {
      font-weight: 600;
      color: ${({ theme }) => theme.primary || "#4a90e2"};
    }
  }
`;

const ToggleButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.text || "#333"};
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.hoverBg || "#f5f5f5"};
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.border || "#e0e0e0"};

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: ${({ theme }) => theme.primary || "#4a90e2"};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .user-details {
    flex: 1;
    min-width: 0;

    .user-name {
      font-weight: 500;
      font-size: 0.9rem;
      color: ${({ theme }) => theme.text || "#333"};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      font-size: 0.75rem;
      color: ${({ theme }) => theme.textSecondary || "#666"};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
`;

const Navigation = styled.nav`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
`;

const CategorySection = styled.div`
  margin-bottom: 1rem;
  position: relative;
`;

const CategoryTitle = styled.h3`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary || "#666"};
  margin: 0 0 0.5rem 0;
  padding: 0 1rem;
  position: relative;
`;

const CategoryTooltip = styled.span`
  position: absolute;
  right: 1rem;
  font-size: 0.6rem;
  background: ${({ theme }) => theme.tooltipBg || "#333"};
  color: white;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  opacity: 0.8;
`;

const NavItem = styled.div`
  margin: 0 0.5rem;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  color: ${({ theme }) => theme.text || "#333"};
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.2s ease;
  position: relative;

  .icon {
    font-size: 1.2rem;
    min-width: 20px;
    text-align: center;
  }

  .label {
    font-size: 0.9rem;
    font-weight: 400;
    white-space: nowrap;
  }

  &:hover {
    background-color: ${({ theme }) => theme.hoverBg || "#f5f5f5"};
    transform: translateX(2px);
  }

  &.active {
    background-color: ${({ theme }) => theme.activeBg || "#4a90e2"};
    color: ${({ theme }) => theme.activeText || "white"};

    &::before {
      content: "";
      position: absolute;
      left: -0.5rem;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 70%;
      background-color: ${({ theme }) => theme.primary || "#4a90e2"};
      border-radius: 0 2px 2px 0;
    }
  }
`;

const Footer = styled.footer`
  padding: 1rem;
  border-top: 1px solid ${({ theme }) => theme.border || "#e0e0e0"};
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ThemeToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;

  span {
    font-size: 0.85rem;
    color: ${({ theme }) => theme.text || "#333"};
  }
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.danger || "#e74c3c"};
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  font-size: 0.85rem;
  transition: background-color 0.2s;
  width: 100%;
  text-align: left;

  &:hover {
    background-color: ${({ theme }) => theme.dangerBg || "#fee"};
  }
`;
