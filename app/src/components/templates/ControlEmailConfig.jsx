import React, { useState } from "react";
import styled from "styled-components";
import { FaSync, FaPlus, FaCog, FaExclamationTriangle, FaEnvelope } from "react-icons/fa";
import { Helmet } from "react-helmet-async";
import Swal from "sweetalert2";

import {
  useAuth,
  useEmailConfig,
  EmailConfigTable,
  EmailConfigFormModal,
  EmailTestModal,
  Button
} from "../../index";

export function ControlEmailConfig() {
  const { accessToken } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);

  // Hook de lógica técnica y telemetría SMTP
  const {
    configs,
    loading,
    refreshing,
    error,
    actions
  } = useEmailConfig(accessToken);

  const handleOpenAdd = () => {
    setSelectedConfig(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (config) => {
    setSelectedConfig(config);
    setIsFormOpen(true);
  };

  const handleOpenTest = (config) => {
    setSelectedConfig(config);
    setIsTestOpen(true);
  };

  const onSaveConfig = async (data) => {
    try {
      if (selectedConfig) {
        await actions.updateConfig(selectedConfig._id, data);
        Swal.fire({ title: "Actualizado", text: "Configuración SMTP actualizada con éxito.", icon: "success", timer: 2000, showConfirmButton: false });
      } else {
        await actions.createConfig(data);
        Swal.fire({ title: "Guardado", text: "Nueva configuración SMTP agregada.", icon: "success", timer: 2000, showConfirmButton: false });
      }
      setIsFormOpen(false);
    } catch (err) {
      Swal.fire({ title: "Error", text: err.message, icon: "error" });
    }
  };

  const onDeleteConfig = async (config) => {
    const result = await Swal.fire({
      title: "¿Eliminar cuenta?",
      text: `¿Deseas eliminar definitivamente "${config.name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, Eliminar"
    });

    if (result.isConfirmed) {
      try {
        await actions.deleteConfig(config._id);
        Swal.fire({ title: "Eliminado", icon: "success", timer: 1500, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ title: "Error", text: err.message, icon: "error" });
      }
    }
  };

  const onSetDefault = async (config) => {
    try {
      await actions.setAsDefault(config._id);
      Swal.fire({ title: "Predeterminada", text: `"${config.name}" es ahora la cuenta principal.`, icon: "success", timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: "Error", text: err.message, icon: "error" });
    }
  };

  const onInitializeDefaults = async () => {
    const result = await Swal.fire({
      title: "Inicializar Sistema",
      text: "¿Deseas crear las configuraciones SMTP estándar del sistema?",
      icon: "question",
      showCancelButton: true
    });

    if (result.isConfirmed) {
      try {
        await actions.initializeDefaults();
        Swal.fire({ title: "Listo", text: "Configuraciones inicializadas.", icon: "success", timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ title: "Error", text: err.message, icon: "error" });
      }
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <Helmet>
        <title>Email Config - Core ERP</title>
      </Helmet>

      <TopBar>
        <TitleSection>
          <PageTitle><FaEnvelope color="var(--primary)" /> Infraestructura de Email</PageTitle>
          <PageSubtitle>Gestión de servidores SMTP y notificaciones automatizadas del sistema.</PageSubtitle>
        </TitleSection>

        <Toolbar>
          <Button variant="outline" icon={<FaCog />} onClick={onInitializeDefaults}>Inicializar Defaults</Button>
          <Button variant="secondary" icon={<FaSync className={refreshing ? "spin" : ""} />} onClick={actions.refetch} disabled={loading}>Refrescar</Button>
          <Button variant="primary" icon={<FaPlus />} onClick={handleOpenAdd}>Agregar Cuenta</Button>
        </Toolbar>
      </TopBar>

      {loading && !refreshing ? (
        <CenteredArea>
          <Spinner />
          <p>Sincronizando configuraciones SMTP...</p>
        </CenteredArea>
      ) : error ? (
        <CenteredArea $error>
          <FaExclamationTriangle size={40} />
          <p>{error}</p>
          <Button variant="primary" onClick={actions.refetch}>Reintentar Conexión</Button>
        </CenteredArea>
      ) : (
        <EmailConfigTable
          configs={configs}
          onEdit={handleOpenEdit}
          onDelete={onDeleteConfig}
          onToggle={(c) => actions.toggleStatus(c._id)}
          onSetDefault={onSetDefault}
          onTest={handleOpenTest}
        />
      )}

      <EmailConfigFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        config={selectedConfig}
        onSave={onSaveConfig}
      />

      <EmailTestModal
        isOpen={isTestOpen}
        onClose={() => setIsTestOpen(false)}
        config={selectedConfig}
        onSendTest={actions.testConfig}
      />

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// --- Styled Components Premium ---

const Container = styled.div`
  min-height: 100vh; background: ${({ theme }) => theme.bg};
  display: flex; flex-direction: column;
`;

const HeaderSection = styled.header` padding: 0 20px; `;

const MainArea = styled.main`
  flex: 1; padding: 20px 40px; max-width: 1400px; margin: 0 auto; width: 100%;
  display: flex; flex-direction: column; gap: 32px;
  @media (max-width: 768px) { padding: 10px; }
`;

const TopBar = styled.div`
  display: flex; justify-content: space-between; align-items: flex-end; padding: 10px 0;
  @media (max-width: 1024px) { flex-direction: column; align-items: flex-start; gap: 24px; }
`;

const TitleSection = styled.div` display: flex; flex-direction: column; gap: 4px; `;
const PageTitle = styled.h2` margin: 0; font-size: 28px; font-weight: 800; color: ${({ theme }) => theme.title}; display: flex; align-items: center; gap: 12px; `;
const PageSubtitle = styled.p` margin: 0; font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.textSecondary}; `;

const Toolbar = styled.div` display: flex; gap: 12px; `;

const CenteredArea = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px; gap: 20px; text-align: center;
  p { font-weight: 700; color: ${({ theme, $error }) => $error ? '#ef4444' : theme.textSecondary}; }
`;

const Spinner = styled.div`
  width: 44px; height: 44px; border: 4px solid ${({ theme }) => theme.primary}20;
  border-top-color: ${({ theme }) => theme.primary}; border-radius: 50%;
  animation: spin 1s linear infinite;
`;

export default ControlEmailConfig;
