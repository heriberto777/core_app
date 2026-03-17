import React, { useState } from "react";
import styled from "styled-components";
import { FaSave, FaTimes, FaDatabase, FaExclamationTriangle } from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  useCustomerEditor,
  CustomerFormGroups,
  SourceDataViewerModal,
  Button
} from "../../index";

export function CustomerEditor({ customer, mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);

  // Hook de lógica avanzada (mapeo, grupos, transformaciones)
  const {
    editedCustomer,
    originalSourceData,
    loading,
    mapping,
    fieldMeta,
    fieldGroups,
    fieldLoading,
    error,
    handleChange,
    handleSave,
    handleRefreshField,
    loadSourceData
  } = useCustomerEditor(accessToken, { customer, mappingId, onSave });

  const [isSaving, setIsSaving] = useState(false);

  const onConfirmSave = async () => {
    setIsSaving(true);
    try {
      await handleSave();
      Swal.fire({
        title: "Guardado Exitoso",
        text: "Los datos se sincronizaron correctamente en ambas tablas.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      if (err.message.startsWith("Campos requeridos")) {
        Swal.fire({ title: "Atención", text: err.message, icon: "warning" });
      } else {
        Swal.fire({ title: "Error al guardar", text: err.message, icon: "error" });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateFromSource = async () => {
    const result = await Swal.fire({
      title: "¿Sincronizar desde Origen?",
      text: "Esto reemplazará los datos actuales del formulario con los valores más recientes de la tabla fuente de la DB.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, Sincronizar",
      cancelButtonText: "Mantener actuales"
    });

    if (result.isConfirmed) {
      loadSourceData();
    }
  };

  if (loading) {
    return (
      <CenteredArea>
        <Spinner />
        <p>Configurando entorno de edición técnica...</p>
      </CenteredArea>
    );
  }

  if (error) {
    return (
      <CenteredArea $error>
        <FaExclamationTriangle size={40} color="#ef4444" />
        <p>Error de inicialización: {error}</p>
        <Button variant="primary" onClick={onCancel}>Cerrar Editor</Button>
      </CenteredArea>
    );
  }

  return (
    <Container>
      <HeaderRow>
        <TitleGroup>
          <Title>Edición de {mapping?.entityType === "customers" ? "Cliente" : "Documento"}</Title>
          <Badge>Mapping: {mapping?.name || mappingId}</Badge>
        </TitleGroup>

        <Actions>
          <Button variant="ghost" icon={<FaDatabase />} onClick={handleUpdateFromSource} loading={fieldLoading}>Sincronizar Origen</Button>
          <Button variant="outline" icon={<FaTimes />} onClick={onCancel} disabled={isSaving}>Cancelar</Button>
          <Button variant="primary" icon={<FaSave />} onClick={onConfirmSave} loading={isSaving}>Guardar Cambios</Button>
        </Actions>
      </HeaderRow>

      {originalSourceData && (
        <AuditBar>
          <span>Los datos del formulario están vinculados a un registro fuente en la base de datos.</span>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setIsSourceModalOpen(true)}
            style={{ padding: '4px 12px' }}
          >
            Abrir Inspector de Fuente
          </Button>
        </AuditBar>
      )}

      <ContentArea>
        <CustomerFormGroups
          groups={fieldGroups}
          customerData={editedCustomer}
          meta={fieldMeta}
          loadingFields={fieldLoading}
          onChange={handleChange}
          onRefreshField={handleRefreshField}
        />
      </ContentArea>

      <SourceDataViewerModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        data={originalSourceData}
      />
    </Container>
  );
}

// --- Styled Components Premium ---

const Container = styled.div`
  display: flex; flex-direction: column; gap: 24px; padding: 20px;
  background: ${({ theme }) => theme.bg}; border-radius: 32px;
`;

const HeaderRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 20px;
  @media (max-width: 900px) { flex-direction: column; align-items: flex-start; }
`;

const TitleGroup = styled.div` display: flex; flex-direction: column; gap: 4px; `;
const Title = styled.h3` margin: 0; font-size: 24px; font-weight: 800; color: ${({ theme }) => theme.title}; `;
const Badge = styled.span` font-size: 11px; font-weight: 800; color: ${({ theme }) => theme.primary}; background: ${({ theme }) => theme.primary}15; padding: 2px 8px; border-radius: 8px; align-self: flex-start; `;

const Actions = styled.div` display: flex; gap: 12px; `;

const AuditBar = styled.div`
  background: ${({ theme }) => theme.primary}08; border: 1px dashed ${({ theme }) => theme.primary}30;
  padding: 12px 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center;
  span { font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.textSecondary}; }
  @media (max-width: 600px) { flex-direction: column; gap: 10px; text-align: center; }
`;

const ContentArea = styled.div` flex: 1; `;

const CenteredArea = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px; gap: 20px; text-align: center;
  p { font-weight: 700; color: ${({ theme, $error }) => $error ? '#ef4444' : theme.textSecondary}; }
`;

const Spinner = styled.div`
  width: 40px; height: 40px; border: 4px solid ${({ theme }) => theme.primary}20;
  border-top-color: ${({ theme }) => theme.primary}; border-radius: 50%;
  animation: spin 1s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export default CustomerEditor;
