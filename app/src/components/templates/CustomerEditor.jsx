import React, { useState } from "react";
import { FaSave, FaTimes, FaDatabase, FaExclamationTriangle } from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  useCustomerEditor,
  CustomerFormGroups,
  SourceDataViewerModal,
  Button,
  LoadingSpinner
} from "../../index";

export function CustomerEditor({ customer, mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);

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
      <div className="flex flex-col items-center justify-center p-15 gap-5 text-center">
        <LoadingSpinner />
        <p className="text-slate-500 font-semibold">Configurando entorno de edición técnica...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-15 gap-5 text-center">
        <FaExclamationTriangle size={40} className="text-red-500" />
        <p className="text-red-500 font-bold">Error de inicialización: {error}</p>
        <Button variant="primary" onClick={onCancel}>Cerrar Editor</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 bg-white dark:bg-slate-900 rounded-3xl shadow-sm">
      <div className="flex justify-between items-center gap-5 flex-wrap md:flex-nowrap">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-2xl font-extrabold text-slate-800 dark:text-white">
            Edición de {mapping?.entityType === "customers" ? "Cliente" : "Documento"}
          </h3>
          <span className="text-[11px] font-extrabold text-blue-600 bg-blue-600/10 px-2 py-0.5 rounded-lg self-start">
            Mapping: {mapping?.name || mappingId}
          </span>
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" icon={<FaDatabase />} onClick={handleUpdateFromSource} loading={fieldLoading}>Sincronizar Origen</Button>
          <Button variant="outline" icon={<FaTimes />} onClick={onCancel} disabled={isSaving}>Cancelar</Button>
          <Button variant="primary" icon={<FaSave />} onClick={onConfirmSave} loading={isSaving}>Guardar Cambios</Button>
        </div>
      </div>

      {originalSourceData && (
        <div className="bg-blue-500/10 border border-dashed border-blue-500/30 px-5 py-3 rounded-2xl flex justify-between items-center flex-wrap gap-2.5">
          <span className="text-[13px] font-semibold text-slate-500">Los datos del formulario están vinculados a un registro fuente en la base de datos.</span>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setIsSourceModalOpen(true)}
            className="py-1 px-3"
          >
            Abrir Inspector de Fuente
          </Button>
        </div>
      )}

      <div className="flex-1">
        <CustomerFormGroups
          groups={fieldGroups}
          customerData={editedCustomer}
          meta={fieldMeta}
          loadingFields={fieldLoading}
          onChange={handleChange}
          onRefreshField={handleRefreshField}
        />
      </div>

      <SourceDataViewerModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        data={originalSourceData}
      />
    </div>
  );
}

export default CustomerEditor;