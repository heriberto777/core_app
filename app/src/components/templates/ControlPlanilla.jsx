import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { FaPlus, FaSync, FaTools, FaBell } from "react-icons/fa";
import {
  useAuth,
  useEmailRecipients,
  useNotification,
  Button,
  RecipientsTable,
  RecipientFormModal,
  NotificationContainer
} from "../../index";
import Swal from "sweetalert2";

export function ControlPlanilla() {
  const { accessToken } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const {
    recipients,
    loading,
    refreshing,
    error,
    actions
  } = useEmailRecipients(accessToken);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState(null);

  const handleCreate = async (data) => {
    try {
      await actions.createRecipient(data);
      showSuccess("Destinatario agregado con éxito");
      setModalOpen(false);
    } catch (err) {
      showError("Error al crear destinatario");
    }
  };

  const handleUpdate = async (data) => {
    try {
      await actions.updateRecipient(editingRecipient._id, data);
      showSuccess("Configuración actualizada");
      setModalOpen(false);
      setEditingRecipient(null);
    } catch (err) {
      showError("Error al actualizar destinatario");
    }
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: "¿Eliminar destinatario?",
      text: `Se dejarán de enviar notificaciones a ${name}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (result.isConfirmed) {
      try {
        await actions.deleteRecipient(id);
        showSuccess("Destinatario eliminado");
      } catch (err) {
        showError("No se pudo eliminar el registro");
      }
    }
  };

  const handleToggle = async (id, currentStatus, name) => {
    try {
      await actions.toggleStatus(id);
      showSuccess(`${name} ha sido ${currentStatus ? 'desactivado' : 'activado'}`);
    } catch (err) {
      showError("Error al cambiar estado de envío");
    }
  };

  const handleInitialize = async () => {
    const result = await Swal.fire({
      title: "Cargar Destinatarios Default",
      text: "Se inicializará la lista con los usuarios base del sistema",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, inicializar",
      cancelButtonText: "No"
    });

    if (result.isConfirmed) {
      try {
        await actions.initializeDefaults();
        showSuccess("Destinatarios inicializados correctamente");
      } catch (err) {
        showError("Error al inicializar valores");
      }
    }
  };

  return (
    <>
      <Helmet>
        <title>Control de Notificaciones | Core App</title>
      </Helmet>

      <div className="w-full flex flex-col gap-5">
        <div className="flex justify-between items-start mb-8 gap-5 max-md:flex-col">
          <div className="flex-1">
            <h1 className="m-0 mb-2 text-3xl font-extrabold flex items-center gap-3">
              <FaBell /> Notificaciones del Sistema
            </h1>
            <p className="m-0 text-base opacity-70 leading-relaxed">
              Administra los puntos de contacto para las alertas logísticas y operativas.
              Configura quién recibe reportes de traspasos, fallos técnicos y resúmenes de carga.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleInitialize}>
              <FaTools /> Inicializar Defaults
            </Button>
            <Button variant="primary" onClick={() => { setEditingRecipient(null); setModalOpen(true); }}>
              <FaPlus /> Agregar Destinatario
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6 flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-2xl">
            <FaBell />
          </div>
          <div>
            <h4 className="m-0 mb-1 text-base font-semibold">Canales Activos</h4>
            <p className="m-0 text-sm opacity-70">
              Actualmente hay <b>{recipients.length}</b> destinatarios configurados en la red de alertas logísticas.
            </p>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" onClick={actions.fetchRecipients} loading={refreshing}>
              <FaSync />
            </Button>
          </div>
        </div>

        <RecipientsTable
          recipients={recipients}
          loading={loading}
          onEdit={(r) => { setEditingRecipient(r); setModalOpen(true); }}
          onDelete={handleDelete}
          onToggle={handleToggle}
        />

        <RecipientFormModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditingRecipient(null); }}
          onSave={editingRecipient ? handleUpdate : handleCreate}
          editingRecipient={editingRecipient}
          loading={loading}
        />

        <NotificationContainer />
      </div>
    </>
  );
}

export default ControlPlanilla;