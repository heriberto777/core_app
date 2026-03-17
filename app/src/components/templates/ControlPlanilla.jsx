import React, { useState } from "react";
import styled from "styled-components";
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

const Container = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const HeaderInfo = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Description = styled.p`
  margin: 0;
  font-size: 16px;
  opacity: 0.7;
  line-height: 1.6;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const InfoCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  padding: 24px;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border};
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
`;

const IconBox = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
`;

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

      <Container>
        <PageHeader>
          <HeaderInfo>
            <Title><FaBell /> Notificaciones del Sistema</Title>
            <Description>
              Administra los puntos de contacto para las alertas logísticas y operativas.
              Configura quién recibe reportes de traspasos, fallos técnicos y resúmenes de carga.
            </Description>
          </HeaderInfo>
          <HeaderActions>
            <Button variant="outline" onClick={handleInitialize}>
              <FaTools /> Inicializar Defaults
            </Button>
            <Button variant="primary" onClick={() => { setEditingRecipient(null); setModalOpen(true); }}>
              <FaPlus /> Agregar Destinatario
            </Button>
          </HeaderActions>
        </PageHeader>

        <InfoCard>
          <IconBox><FaBell /></IconBox>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>Canales Activos</h4>
            <p style={{ margin: 0, fontSize: '14px', opacity: 0.7 }}>
              Actualmente hay <b>{recipients.length}</b> destinatarios configurados en la red de alertas logísticas.
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="ghost" onClick={actions.fetchRecipients} loading={refreshing}>
              <FaSync />
            </Button>
          </div>
        </InfoCard>

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
      </Container>
    </>
  );
}
