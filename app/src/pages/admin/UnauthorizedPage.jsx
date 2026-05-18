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
          <ActionButton $primary onClick={() => navigate("/dashboard")}>
            <FaHome />
            Ir al Dashboard
          </ActionButton>

          <ActionButton onClick={() => window.history.back()}>
            <FaArrowLeft />
            Volver
          </ActionButton>
        </ButtonContainer>

        <HelpText>
          <FaExclamationTriangle />
          Si crees que esto es un error, contacta con tu administrador del
          sistema.
        </HelpText>
      </Content>
    </Container>
  );
};

const Container = () => (
  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900 p-4">
</div>
);

const Content = () => (
  <div className="text-center max-w-[500px] w-full">
</div>
);

const IconContainer = () => (
  <div className="text-6xl text-red-600 dark:text-red-500 mb-4">
</div>
);

const Title = () => (
  <h1 className="text-3xl text-red-600 dark:text-red-500 mb-3">
</h1>
);

const Message = () => (
  <p className="text-lg text-slate-900 dark:text-slate-100 mb-5 leading-relaxed">
</p>
);

const UserInfo = () => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-5 text-left">
</div>
);

const InfoItem = () => (
  <div className="mb-2 text-sm last:mb-0 text-slate-900 dark:text-slate-100">
</div>
);

const ButtonContainer = () => (
  <div className="flex gap-3 justify-center mb-5 flex-wrap">
</div>
);

const ActionButton = () => (
  <button className="flex items-center gap-2 px-4 py-2 border-0 rounded-md text-sm font-medium cursor-pointer transition-all bg-indigo-600 hover:bg-indigo-700 text-white transform hover:translate-y-[-2px]">
</button>
);

const HelpText = () => (
  <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
    <span className="text-yellow-500 dark:text-yellow-600">
</span>
    Si crees que esto es un error, contacta con tu administrador del sistema.
  </div>
);

export default UnauthorizedPage;
