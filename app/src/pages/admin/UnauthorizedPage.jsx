import React from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "../../index";
import {
  FaLock,
  FaHome,
  FaArrowLeft,
  FaExclamationTriangle,
} from "react-icons/fa";

const UnauthorizedPage = () => {
  const { user } = usePermissions();
  const navigate = useNavigate();

  return (
    <Container>
      <Content>
        <IconContainer>
          <FaLock />
        </IconContainer>

        <Title>Acceso Denegado</Title>

        <Message>
          No tienes permisos suficientes para acceder a esta página.
        </Message>

        {user && (
          <UserInfo>
            <InfoItem>
              <strong>Usuario:</strong> {user.name} {user.lastname}
            </InfoItem>
            <InfoItem>
              <strong>Email:</strong> {user.email}
            </InfoItem>
            <InfoItem>
              <strong>Roles:</strong>{" "}
              {user.roles?.length > 0
                ? user.roles
                    .map((role) => role.displayName || role.name)
                    .join(", ")
                : user.role?.join(", ") || "Sin roles asignados"}
            </InfoItem>
            <InfoItem>
              <strong>Admin:</strong> {user.isAdmin ? "Sí" : "No"}
            </InfoItem>
          </UserInfo>
        )}

        <ButtonContainer>
          <ActionButton primary onClick={() => navigate("/dashboard")}>
            <FaHome />
            Ir al Dashboard
          </ActionButton>

          <ActionButton onClick={() => window.history.back()}>
            <FaArrowLeft />
            Volver
          </ActionButton>
        </ButtonContainer>

        <HelpText>
          <FaExclamationTriangle className="text-yellow-500 dark:text-yellow-600 shrink-0" />
          Si crees que esto es un error, contacta con tu administrador del
          sistema.
        </HelpText>
      </Content>
    </Container>
  );
};

// Cada uno de estos wrappers venía de un `styled.div` migrado a Tailwind
// (commit f4cb82de) que perdió el `children` en la conversión — devolvían
// un elemento vacío que se cerraba de inmediato, así que toda la página
// (ícono, título, mensaje, datos del usuario, botones) nunca se mostraba.
const Container = ({ children }) => (
  <div className="min-h-dvh flex items-center justify-center bg-white dark:bg-slate-900 p-4">
    {children}
  </div>
);

const Content = ({ children }) => (
  <div className="text-center max-w-[500px] w-full">{children}</div>
);

const IconContainer = ({ children }) => (
  <div className="text-6xl text-red-600 dark:text-red-500 mb-4">{children}</div>
);

const Title = ({ children }) => (
  <h1 className="text-3xl text-red-600 dark:text-red-500 mb-3">{children}</h1>
);

const Message = ({ children }) => (
  <p className="text-lg text-slate-900 dark:text-slate-100 mb-5 leading-relaxed">
    {children}
  </p>
);

const UserInfo = ({ children }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-5 text-left">
    {children}
  </div>
);

const InfoItem = ({ children }) => (
  <div className="mb-2 text-sm last:mb-0 text-slate-900 dark:text-slate-100">
    {children}
  </div>
);

const ButtonContainer = ({ children }) => (
  <div className="flex gap-3 justify-center mb-5 flex-wrap">{children}</div>
);

const ActionButton = ({ children, primary = false, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all transform hover:translate-y-[-2px] ${
      primary
        ? "border-0 bg-indigo-600 hover:bg-indigo-700 text-white"
        : "border border-slate-200 dark:border-slate-600 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100"
    }`}
  >
    {children}
  </button>
);

const HelpText = ({ children }) => (
  <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
    {children}
  </div>
);

export default UnauthorizedPage;
