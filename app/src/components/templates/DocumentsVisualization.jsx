import React, { useState } from "react";
import { FaArrowLeft, FaInfoCircle, FaSync, FaExclamationTriangle } from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  usePermissions,
  MappingsList,
  MappingEditor,
  CustomerEditor,
  useDocumentsVisualization,
  DocumentsFilterPanel,
  ProcessingResultsModal,
  DocumentDetailsModal,
  DocumentsDataTable,
  Button
} from "../../index";

export function DocumentsVisualization() {
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();

  const canCreateMapping = hasPermission("mappings", "create") || isAdmin;
  const canEditMapping = hasPermission("mappings", "update") || isAdmin;
  const canDeleteMapping = hasPermission("mappings", "delete") || isAdmin;
  const canExecuteMapping = hasPermission("mappings", "execute") || hasPermission("documents", "create") || isAdmin;

  const {
    activeView, setActiveView,
    activeMappingName,
    activeConfig,
    entityType,
    search, setSearch,
    filterValues, setFilterValues,
    filteredDocuments,
    documentsLoading,
    documentsRefreshing,
    documentsError,
    selectedDocuments,
    handleSelectMapping,
    handleReturnToList,
    handleSelectDocument,
    handleSelectAll,
    executeProcessing,
    getDocumentDetails,
    updateEntityData,
    fetchDocuments,
    actionStates
  } = useDocumentsVisualization(accessToken);

  const [editingMappingId, setEditingMappingId] = useState(null);
  const [showConfigInfo, setShowConfigInfo] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docDetailsData, setDocDetailsData] = useState(null);
  const [processingResults, setProcessingResults] = useState(null);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [showEntityEditor, setShowEntityEditor] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);

  const handleEditMapping = (mappingId) => {
    setEditingMappingId(mappingId);
    setActiveView("mappingEditor");
  };

  const handleCreateMapping = () => {
    setEditingMappingId(null);
    setActiveView("mappingEditor");
  };

  const handleSaveMapping = (result) => {
    setActiveView("mappingsList");
  };

  const handleViewDetails = async (doc) => {
    try {
      setSelectedDoc(doc);
      const id = doc[Object.keys(doc)[0]];
      const details = await getDocumentDetails(id);
      setDocDetailsData(details);
      setIsDetailsOpen(true);
    } catch (error) {
      Swal.fire("Error", "No se pudieron cargar los detalles del documento.", "error");
    }
  };

  const handleProcess = async (docIdOrAll) => {
    const isSingle = typeof docIdOrAll === 'string';
    const count = isSingle ? 1 : selectedDocuments.length;

    if (count === 0) return;

    const confirm = await Swal.fire({
      title: '¿Procesar Documento(s)?',
      text: `Se enviarán ${count} registros al sistema de destino.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, procesar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
      const result = await executeProcessing();
      setProcessingResults(result);
      setIsResultsOpen(true);
    } catch (error) {
      Swal.fire("Error", error.message || "Error durante el procesamiento", "error");
    }
  };

  const handleEditEntity = (entity) => {
    setSelectedEntity(entity);
    setShowEntityEditor(true);
  };

  const handleSaveEntity = async (updateData) => {
    try {
      await updateEntityData(updateData);
      setShowEntityEditor(false);
      fetchDocuments();
      Swal.fire("Actualizado", "Los datos han sido actualizados correctamente.", "success");
    } catch (error) {
      Swal.fire("Error", error.message || "No se pudo actualizar la entidad", "error");
    }
  };

  const ConfigSummary = ({ config }) => (
    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-slate-800/10 rounded-xl text-sm border-l-4 border-blue-500">
      <div><strong>Origen:</strong> {config.sourceServer} ({config.sourceDatabase})</div>
      <div><strong>Destino:</strong> {config.targetServer} ({config.targetDatabase})</div>
      <div><strong>Transferencia:</strong> {config.transferType}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeView) {
      case "mappingsList":
        return (
          <MappingsList
            onSelectMapping={handleSelectMapping}
            onEditMapping={handleEditMapping}
            onCreateMapping={handleCreateMapping}
            canCreate={canCreateMapping}
            canEdit={canEditMapping}
            canDelete={canDeleteMapping}
          />
        );

      case "mappingEditor":
        return (
          <MappingEditor
            mappingId={editingMappingId}
            onSave={handleSaveMapping}
            onCancel={() => setActiveView("mappingsList")}
          />
        );

      case "documents":
        return (
          <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
            <div className="flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-gray-200 dark:border-slate-700">
              <Button variant="secondary" onClick={handleReturnToList}>
                <FaArrowLeft /> Configuración
              </Button>
              <h3 className="m-0 flex-1 text-center">
                {activeMappingName}
                <small className="block text-xs opacity-60">Entidad: {entityType}</small>
              </h3>
              <Button variant="ghost" onClick={() => setShowConfigInfo(!showConfigInfo)}>
                <FaInfoCircle /> {showConfigInfo ? "Cerrar" : "Info"}
              </Button>
            </div>

            {showConfigInfo && <ConfigSummary config={activeConfig} />}

            <DocumentsFilterPanel
              search={search} setSearch={setSearch}
              filterValues={filterValues} setFilterValues={setFilterValues}
              onRefresh={fetchDocuments}
              isRefreshing={documentsRefreshing}
            />

            <div className="relative min-h-[400px]">
              {documentsLoading && !documentsRefreshing ? (
                <div className="py-24 text-center font-semibold text-blue-500">Cargando documentos...</div>
              ) : documentsError ? (
                <div className="py-24 text-center text-red-600 flex items-center justify-center gap-2">
                  <FaExclamationTriangle /> {documentsError}
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="py-24 text-center opacity-60">No se encontraron resultados con los filtros actuales.</div>
              ) : (
                <DocumentsDataTable
                  documents={filteredDocuments}
                  config={activeConfig}
                  entityType={entityType}
                  selectedIds={selectedDocuments}
                  onSelect={handleSelectDocument}
                  onSelectAll={handleSelectAll}
                  onViewDetails={handleViewDetails}
                  onProcess={handleProcess}
                  onEditEntity={handleEditEntity}
                  actionStates={actionStates}
                />
              )}
            </div>

            {selectedDocuments.length > 0 && canExecuteMapping && (
              <div className="sticky bottom-5 z-40 animate-slideUp">
                <Button variant="primary" onClick={() => handleProcess()} size="large" className="w-full py-4">
                  Procesar {selectedDocuments.length} seleccionados
                </Button>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5 p-5 min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="text-center mb-5">
        <h2 className="m-0 text-3xl font-extrabold text-gray-900 dark:text-white">Centro de Gestión de Datos</h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">Visualización y procesamiento masivo de documentos entre servidores</p>
      </div>

      <section className="main">
        {renderContent()}
      </section>

      <DocumentDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        document={selectedDoc}
        details={docDetailsData}
      />

      <ProcessingResultsModal
        isOpen={isResultsOpen}
        onClose={() => setIsResultsOpen(false)}
        results={processingResults}
      />

      {showEntityEditor && selectedEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500]">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-[90%] max-w-3xl">
            <CustomerEditor
              customer={selectedEntity}
              mappingId={activeConfig?._id}
              onSave={handleSaveEntity}
              onCancel={() => setShowEntityEditor(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentsVisualization;
