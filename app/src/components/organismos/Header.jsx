// Header.jsx (Optimizado)
import { useEffect, useRef, useState, useContext } from "react";
import styled from "styled-components";
import { DataUser, v, AdminLayout } from "../../index";
import { Device } from "../../styles/breakpoints";
import { FaBars, FaTimes } from "react-icons/fa";
import { LayoutContext } from "../../layouts/AdminLayout/AdminLayout";

export function Header({ stateConfig, sidebarConfig }) {
  const headerRef = useRef(null);
  const layoutContext = useContext(LayoutContext); // Usar el contexto si está disponible

  // Usar el contexto si está disponible, de lo contrario usar las props
  const toggleSidebar =
    layoutContext?.toggleSidebar || sidebarConfig?.toggleSidebar;
  const isOpen = layoutContext?.sidebarOpen || sidebarConfig?.isOpen;

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Solo cerrar si el menú está abierto
      if (
        stateConfig.openstate &&
        headerRef.current &&
        !headerRef.current.contains(event.target)
      ) {
        stateConfig.setOpenState(false);
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [stateConfig?.openstate]);

  return (
    <HeaderContainer ref={headerRef}>
      <LogoSection>
        {/* Botón de toggle para la barra lateral */}
        <SidebarToggle onClick={toggleSidebar}>
          {isOpen ? <FaTimes /> : <FaBars />}
        </SidebarToggle>

        {/* Logo */}
        <LogoContainer>
          <img src={v.logoLetra} alt="Logo" />
        </LogoContainer>
      </LogoSection>

      <UserSection onClick={(e) => e.stopPropagation()}>
        <DataUser stateConfig={stateConfig} />
      </UserSection>
    </HeaderContainer>
  );
}

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0 20px;
  background-color: ${({ theme }) => theme.headerBg || theme.bg};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
`;

const LogoContainer = styled.div`
  height: 50px;
  display: flex;
  align-items: center;

  img {
    height: 30px;
    object-fit: contain;
    transition: transform 0.3s ease;
  }

  @media ${Device.tablet} {
    img {
      transform: scale(1.2);
    }
  }
`;

const SidebarToggle = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.primary || "#007bff"};
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 4px;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  @media (max-width: 768px) {
    font-size: 22px;
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
`;

export default Header;
