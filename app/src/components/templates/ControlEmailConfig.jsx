import React, { useState } from "react";
import { FaSync, FaPlus, FaCog, FaExclamationTriangle, FaEnvelope } from "react-icons/fa";
import { Helmet } from "react-helmet-async";
import Swal from "sweetalert2";

import {
  useAuth,
  useEmailConfig,
  EmailConfigTable,
  EmailConfigFormModal,
  EmailTestModal,
  Button,
  LoadingSpinner
} from "../../index";

export function ControlEmailConfig() {
  const { accessToken } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);

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
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col animate-fadeIn">
      <Helmet>
        <title>Email Config - Core ERP</title>
      </Helmet>

      <div className="flex-1 p-5 p-10 max-w-[1400px] mx-auto w-full flex flex-col gap-8">
        <div className="flex justify-between items-end py-2.5 max-md:flex-col max-md:items-start max-md:gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[28px] font-extrabold text-slate-800 dark:text-white flex items-center gap-3">
              <FaEnvelope className="text-blue-500" /> Infraestructura de Email
            </h2>
            <p className="m-0 text-sm font-semibold text-slate-500">Gestión de servidores SMTP y notificaciones automatizadas del sistema.</p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" icon={<FaCog />} onClick={onInitializeDefaults}>Inicializar Defaults</Button>
            <Button variant="secondary" icon={<FaSync className={refreshing ? "animate-spin" : ""} />} onClick={actions.refetch} disabled={loading}>Refrescar</Button>
            <Button variant="primary" icon={<FaPlus />} onClick={handleOpenAdd}>Agregar Cuenta</Button>
          </div>
        </div>

        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center p-20 gap-5 text-center">
            <LoadingSpinner />
            <p className="font-bold text-slate-500">Sincronizando configuraciones SMTP...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-20 gap-5 text-center">
            <FaExclamationTriangle size={40} className="text-red-500" />
            <p className="font-bold text-red-500">{error}</p>
            <Button variant="primary" onClick={actions.refetch}>Reintentar Conexión</Button>
          </div>
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
          loading={loading}
        />

        <EmailTestModal
          isOpen={isTestOpen}
          onClose={() => setIsTestOpen(false)}
          config={selectedConfig}
        />
      </div>
    </div>
  );
}

export default ControlEmailConfig;