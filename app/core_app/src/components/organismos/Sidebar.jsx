// Sidebar.jsx (Optimizado)
import React, { useContext } from "react";
import styled from "styled-components";
import SwitchMode from "react-switch";
import {
  v,
  LinkArray,
  ThemeContext,
  SecondarylinksArray,
  useAuth,
  AdminLayout,
} from "../../index";
import { NavLink, useLocation } from "react-router-dom";
import { Device } from "../../styles/breakpoints";
import { FaMoon, FaSun } from "react-icons/fa";
import { LayoutContext } from "../../layouts/AdminLayout/AdminLayout"; // Importar el contexto

export function Sidebar({ state, setState }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { logout, user } = useAuth();
  const location = useLocation();
  const layoutContext = useContext(LayoutContext);

  // Usar el contexto si está disponible, de lo contrario usar props
  const isOpen = layoutContext?.sidebarOpen || state;
  const toggleSidebar = layoutContext?.toggleSidebar || setState;

  const hasRole = (roles) => roles?.some((role) => user.role?.includes(role));
  const filteredLinkArray = LinkArray?.filter(({ roles }) => hasRole(roles));
  const filteredSecondarylinksArray = SecondarylinksArray?.filter(({ roles }) =>
    hasRole(roles)
  );

  return (
    <SidebarContainer $isOpen={isOpen}>
      <LinksContainer>
        {filteredLinkArray.map(({ icon, label, to }) => (
          <LinkItem key={label} className={isOpen ? "active" : ""}>
            <NavLink
              to={`${to}`}
              className={({ isActive }) => `Links${isActive ? ` active` : ``}`}
            >
              <div className="linkicon">{icon}</div>
              <span className={isOpen ? "label_ver" : "label_oculto"}>
                {label}
              </span>
            </NavLink>
          </LinkItem>
        ))}

        <Divider />

        {filteredSecondarylinksArray.map(({ icon, label, to }) => (
          <LinkItem key={label} className={isOpen ? "active" : ""}>
            {to ? (
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `Links${isActive ? ` active` : ``}`
                }
              >
                <div className="linkicon">{icon}</div>
                <span className={isOpen ? "label_ver" : "label_oculto"}>
                  {label}
                </span>
              </NavLink>
            ) : (
              <button className="Links" onClick={logout}>
                <div className="linkicon">{icon}</div>
                <span className={isOpen ? "label_ver" : "label_oculto"}>
                  {label}
                </span>
              </button>
            )}
          </LinkItem>
        ))}
      </LinksContainer>

      <ThemeToggleContainer>
        <SwitchMode
          onChange={toggleTheme}
          checked={theme === "dark"}
          uncheckedIcon={<FaMoon style={customIconStyles} />}
          checkedIcon={<FaSun style={customIconStyles} />}
          height={24}
          width={48}
          handleDiameter={20}
        />
      </ThemeToggleContainer>
    </SidebarContainer>
  );
}

const SidebarContainer = styled.div`
  position: fixed;
  top: 90px; /* Altura del Header */
  left: 0;
  height: calc(100% - 90px);
  width: ${(props) => (props.$isOpen ? "220px" : "65px")};
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  transition: width 0.3s ease-in-out;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 100;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  /* Añadir para mejorar el scroll */
  -webkit-overflow-scrolling: touch;

  /* Estilos de la barra de desplazamiento */
  &::-webkit-scrollbar {
    width: 6px;
    border-radius: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: ${(props) => props.theme.colorScroll};
    border-radius: 10px;
  }

  /* Responsividad para móviles */
  @media (max-width: 768px) {
    width: 220px; /* Tamaño fijo para móviles */
    transform: ${(props) =>
      props.$isOpen ? "translateX(0)" : "translateX(-100%)"};
    box-shadow: ${(props) =>
      props.$isOpen ? "2px 0 5px rgba(0, 0, 0, 0.1)" : "none"};
  }
`;

const LinksContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 15px 5px;
`;

const LinkItem = styled.div`
  margin: 5px 0;
  transition: all 0.3s ease-in-out;
  position: relative;

  &:hover {
    background: ${(props) => props.theme.bgAlpha};
  }

  .Links {
    display: flex;
    align-items: center;
    text-decoration: none;
    padding: calc(${() => v.smSpacing} - 2px) 0;
    color: ${(props) => props.theme.text};
    height: 60px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;

    .linkicon {
      padding: ${() => v.smSpacing} ${() => v.mdSpacing};
      display: flex;

      svg {
        font-size: 25px;
      }
    }

    .label_ver {
      transition: 0.3s ease-in-out;
      opacity: 1;
    }

    .label_oculto {
      opacity: 0;
    }

    &.active {
      color: ${(props) => props.theme.bg5};
      font-weight: 600;

      &::before {
        content: "";
        position: absolute;
        height: 100%;
        background: ${(props) => props.theme.bg5};
        width: 4px;
        border-radius: 10px;
        left: 0;
      }
    }
  }

  &.active {
    padding: 0;
  }
`;

const Divider = styled.div`
  height: 1px;
  width: 100%;
  background: ${(props) => props.theme.bg4};
  margin: ${() => v.lgSpacing} 0;
`;

const ThemeToggleContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 20px 0;
  border-top: 1px solid ${(props) => props.theme.border || "#eee"};
`;

const customIconStyles = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  width: "100%",
  fontSize: "1.5rem",
};

export default Sidebar;
