// AdminLayout.jsx (Optimizado)
import React, { useState, useEffect, createContext } from "react";
import styled from "styled-components";
import { Sidebar, Header } from "../../index";
import { Device } from "../../styles/breakpoints";

// Contexto para compartir el estado del layout entre componentes
export const LayoutContext = createContext();

export function AdminLayout({ children, toolbar, actions, title, subtitle }) {
  // Estado para el sidebar
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  // Estado para el menú de usuario en el header
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Manejar responsive para la barra lateral
  useEffect(() => {
    const handleResize = () => {
      // En dispositivos móviles, cerrar automáticamente el sidebar
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      } else if (window.innerWidth > 992) {
        // En dispositivos grandes, mantener abierto el sidebar
        setSidebarOpen(true);
      }
    };

    // Inicializar y agregar event listener
    handleResize();
    window.addEventListener("resize", handleResize);

    // Limpiar event listener al desmontar
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Toggle función para la barra lateral
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Cerrar el menú de usuario al hacer clic fuera
  const handleOutsideClick = (e) => {
    if (userMenuOpen) {
      setUserMenuOpen(false);
    }
  };

  // Valores del contexto para compartir
  const layoutContextValue = {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    userMenuOpen,
    setUserMenuOpen,
  };

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      <Container
        className={sidebarOpen ? "sidebar-open" : "sidebar-closed"}
        onClick={handleOutsideClick}
      >
        <header className="header">
          <Header
            stateConfig={{
              openstate: userMenuOpen,
              setOpenState: () => setUserMenuOpen(!userMenuOpen),
            }}
            sidebarConfig={{
              isOpen: sidebarOpen,
              toggleSidebar: toggleSidebar,
            }}
          />
        </header>

        <div className="sidebar-wrapper">
          <Sidebar state={sidebarOpen} setState={toggleSidebar} />
        </div>

        <main className="content">
          {/* Área de título y herramientas */}
          {(title || toolbar) && (
            <section className="area1">
              <ToolbarContainer>
                <InfoSection>
                  {title && <h2>{title}</h2>}
                  {subtitle && <p>{subtitle}</p>}
                  {toolbar}
                </InfoSection>
              </ToolbarContainer>
            </section>
          )}

          {/* Área de acciones (filtros, botones, etc.) */}
          {actions && (
            <section className="area2">
              <ActionsContainer>{actions}</ActionsContainer>
            </section>
          )}

          {/* Área de contenido principal */}
          <section className="main">{children}</section>
        </main>

        {/* Overlay para cuando el sidebar está abierto en móvil */}
        {sidebarOpen && window.innerWidth <= 768 && (
          <SidebarOverlay onClick={toggleSidebar} />
        )}
      </Container>
    </LayoutContext.Provider>
  );
}

const Container = styled.div`
  display: grid;
  min-height: 100vh;
  width: 100%;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  transition: all 0.3s ease-in-out;

  /* Grid layout para mobile (por defecto) */
  grid-template-areas:
    "header"
    "content";
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;

  /* Para tablet y desktop, añadimos la barra lateral */
  @media ${Device.tablet} {
    grid-template-areas:
      "header header"
      "sidebar content";
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;

    @media ${Device.tablet} {
      grid-template-areas:
        "header header"
        "sidebar content";

      /* Cuando el sidebar está abierto, le damos exactamente el ancho que necesita */
      &.sidebar-open {
        grid-template-columns: 220px 1fr; /* Ancho exacto del sidebar */
      }

      /* Cuando está cerrado, solo el espacio para los iconos */
      &.sidebar-closed {
        grid-template-columns: 65px 1fr; /* Ancho exacto del sidebar colapsado */
      }
    }
  }

  .header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 100;
    background-color: ${({ theme }) => theme.headerBg || theme.bg};
    border-bottom: 1px solid ${({ theme }) => theme.border || "#eee"};
    height: 90px;
    display: flex;
    align-items: center;

    @media (max-width: 768px) {
      height: 70px;
    }

    @media (max-width: 480px) {
      height: 60px;
    }
  }

  .sidebar-wrapper {
    grid-area: sidebar;

    @media (max-width: 768px) {
      position: fixed;
      left: 0;
      top: 0;
      height: 100%;
      z-index: 99;
    }
  }

  .content {
    grid-area: content;
    padding: 0;
    display: grid;
    grid-template-areas:
      "area1"
      "area2"
      "main";
    grid-template-rows: auto auto 1fr;
    overflow-x: hidden;
    /* transition: margin-left 0.3s ease-in-out; */

    margin-left: 0;
  }

  .area1 {
    grid-area: area1;
    padding: 15px;
    margin-bottom: 10px;

    @media (max-width: 768px) {
      padding: 10px;
    }

    @media (max-width: 480px) {
      padding: 5px;
    }
  }

  .area2 {
    grid-area: area2;
    padding: 0 15px;
    margin-bottom: 20px;

    @media (max-width: 768px) {
      padding: 0 10px;
      margin-top: 15px;
      margin-bottom: 10px;
    }

    @media (max-width: 480px) {
      padding: 0 5px;
      margin-top: 10px;
      margin-bottom: 5px;
    }
  }

  .main {
    grid-area: main;
    /* padding: 0 15px 15px 15px; */
    overflow-x: auto;
    width: 100%;

    @media (max-width: 768px) {
      padding: 0 10px 10px 10px;
    }

    @media (max-width: 480px) {
      padding: 0 5px 5px 5px;
    }
  }
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: center;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.title || theme.text};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.textSecondary || "#666"};
  }
`;

const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const SidebarOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 98;
  display: none;

  /* Mejorar para móviles */
  touch-action: none; /* Prevenir desplazamiento cuando overlay está activo */

  @media (max-width: 768px) {
    display: ${(props) => (props.isOpen ? "block" : "none")};
  }
`;

export default AdminLayout;
