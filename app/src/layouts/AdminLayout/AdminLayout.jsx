import React, { useState, useEffect, createContext, useCallback } from "react";
import styled from "styled-components";
import { Sidebar, Header, useAuth } from "../../index";
import { Device } from "../../styles/breakpoints";

// ⭐ CONTEXTO MEJORADO PARA EL LAYOUT ⭐
export const LayoutContext = createContext();

export function AdminLayout({
  children,
  title,
  subtitle,
  actions,
  toolbar,
  loading = false,
  error = null,
}) {
  const { user, reloadUserPermissions } = useAuth();

  // Estados del layout
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(loading);

  // ⭐ MANEJO RESPONSIVO MEJORADO ⭐
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth <= 992 && window.innerWidth > 768;
      const isDesktop = window.innerWidth > 992;

      if (isMobile) {
        setSidebarOpen(false);
      } else if (isDesktop) {
        setSidebarOpen(true);
      }
      // En tablet, mantener el estado actual
    };

    // Configuración inicial y listener
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ⭐ RECARGAR PERMISOS PERIÓDICAMENTE ⭐
  useEffect(() => {
    if (!user || !reloadUserPermissions) return;

    // Recargar permisos cada 10 minutos
    const permissionsInterval = setInterval(() => {
      reloadUserPermissions();
    }, 10 * 60 * 1000);

    // Recargar al enfocar la ventana
    const handleFocus = () => {
      reloadUserPermissions();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(permissionsInterval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user, reloadUserPermissions]);

  // ⭐ FUNCIONES DEL LAYOUT ⭐
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleUserMenu = useCallback(() => {
    setUserMenuOpen((prev) => !prev);
  }, []);

  const closeUserMenu = useCallback(() => {
    setUserMenuOpen(false);
  }, []);

  // ⭐ MANEJAR CLICS FUERA DE ELEMENTOS ⭐
  const handleOutsideClick = useCallback(
    (e) => {
      // Cerrar menú de usuario si está abierto
      if (userMenuOpen) {
        closeUserMenu();
      }

      // Cerrar sidebar en móvil si se hace clic en el overlay
      if (window.innerWidth <= 768 && sidebarOpen) {
        const sidebar = e.target.closest(".sidebar-wrapper");
        const toggleButton = e.target.closest(".sidebar-toggle");

        if (!sidebar && !toggleButton) {
          closeSidebar();
        }
      }
    },
    [userMenuOpen, sidebarOpen, closeUserMenu, closeSidebar]
  );

  // ⭐ VALORES DEL CONTEXTO ⭐
  const layoutContextValue = {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    closeSidebar,
    userMenuOpen,
    setUserMenuOpen,
    toggleUserMenu,
    closeUserMenu,
    pageLoading,
    setPageLoading,
  };

  // ⭐ RENDERIZAR CONTENIDO DE ERROR ⭐
  if (error) {
    return (
      <LayoutContext.Provider value={layoutContextValue}>
        <Container>
          <ErrorContainer>
            <ErrorIcon>⚠️</ErrorIcon>
            <ErrorTitle>Error en la aplicación</ErrorTitle>
            <ErrorMessage>{error}</ErrorMessage>
            <ErrorActions>
              <button onClick={() => window.location.reload()}>
                Recargar página
              </button>
            </ErrorActions>
          </ErrorContainer>
        </Container>
      </LayoutContext.Provider>
    );
  }

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      <Container
        className={sidebarOpen ? "sidebar-open" : "sidebar-closed"}
        onClick={handleOutsideClick}
      >
        {/* ⭐ HEADER ⭐ */}
        <HeaderWrapper className="header">
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
        </HeaderWrapper>

        {/* ⭐ SIDEBAR ⭐ */}
        <SidebarWrapper className="sidebar-wrapper">
          <Sidebar />
        </SidebarWrapper>

        {/* ⭐ CONTENIDO PRINCIPAL ⭐ */}
        <MainContent className="content">
          {/* Área de título y toolbar */}
          {(title || toolbar) && (
            <TitleSection className="title-area">
              <TitleContainer>
                {title && <PageTitle>{title}</PageTitle>}
                {subtitle && <PageSubtitle>{subtitle}</PageSubtitle>}
              </TitleContainer>
              {toolbar && <ToolbarContainer>{toolbar}</ToolbarContainer>}
            </TitleSection>
          )}

          {/* Área de acciones */}
          {actions && (
            <ActionsSection className="actions-area">
              <ActionsContainer>{actions}</ActionsContainer>
            </ActionsSection>
          )}

          {/* Área de contenido principal */}
          <ContentSection className="main-content">
            {pageLoading ? (
              <LoadingContainer>
                <LoadingSpinner>🔄</LoadingSpinner>
                <LoadingText>Cargando contenido...</LoadingText>
              </LoadingContainer>
            ) : (
              children
            )}
          </ContentSection>
        </MainContent>

        {/* ⭐ OVERLAY PARA MÓVIL ⭐ */}
        {sidebarOpen && window.innerWidth <= 768 && (
          <SidebarOverlay onClick={closeSidebar} />
        )}
      </Container>
    </LayoutContext.Provider>
  );
}

// ⭐ STYLED COMPONENTS OPTIMIZADOS ⭐
const Container = styled.div`
  display: grid;
  min-height: 100vh;
  width: 100%;
  background-color: ${({ theme }) => theme.bg};
  color: ${({ theme }) => theme.text};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Layout para móvil */
  grid-template-areas:
    "header"
    "content";
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;

  /* Layout para tablet y desktop */
  @media ${Device.tablet} {
    grid-template-areas:
      "header header"
      "sidebar content";
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;

    &.sidebar-open {
      grid-template-columns: 260px 1fr;
    }

    &.sidebar-closed {
      grid-template-columns: 65px 1fr;
    }
  }
`;

const HeaderWrapper = styled.header`
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: ${({ theme }) => theme.headerBg || theme.bg};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  height: 70px;
  display: flex;
  align-items: center;
  backdrop-filter: blur(10px);

  @media (max-width: 768px) {
    height: 60px;
  }
`;

const SidebarWrapper = styled.div`
  grid-area: sidebar;

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    z-index: 999;
  }
`;

const MainContent = styled.main`
  grid-area: content;
  display: grid;
  grid-template-areas:
    "title-area"
    "actions-area"
    "main-content";
  grid-template-rows: auto auto 1fr;
  overflow: hidden;
  background-color: ${({ theme }) => theme.contentBg || theme.bg};
`;

const TitleSection = styled.section`
  grid-area: title-area;
  padding: 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.titleBg || "transparent"};

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const PageTitle = styled.h1`
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.titleColor || theme.text};

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const PageSubtitle = styled.p`
  margin: 0;
  font-size: 1rem;
  color: ${({ theme }) => theme.textSecondary};
  opacity: 0.8;
`;

const ToolbarContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
`;

const ActionsSection = styled.section`
  grid-area: actions-area;
  padding: 0 1.5rem 1rem 1.5rem;

  @media (max-width: 768px) {
    padding: 0 1rem 1rem 1rem;
  }
`;

const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;

  @media ${Device.tablet} {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
`;

const ContentSection = styled.section`
  grid-area: main-content;
  overflow: auto;
  padding: 0 1.5rem 1.5rem 1.5rem;

  @media (max-width: 768px) {
    padding: 0 1rem 1rem 1rem;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 200px;
  gap: 1rem;
`;

const LoadingSpinner = styled.div`
  font-size: 2rem;
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  color: ${({ theme }) => theme.textSecondary};
  font-size: 0.9rem;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
`;

const ErrorIcon = styled.div`
  font-size: 3rem;
`;

const ErrorTitle = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.danger || "#e74c3c"};
`;

const ErrorMessage = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.textSecondary};
  max-width: 400px;
`;

const ErrorActions = styled.div`
  button {
    background: ${({ theme }) => theme.primary || "#4a90e2"};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;

    &:hover {
      background: ${({ theme }) => theme.primaryDark || "#357abd"};
    }
  }
`;

const SidebarOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 998;
  backdrop-filter: blur(2px);

  @media (min-width: 769px) {
    display: none;
  }
`;

export default AdminLayout;
