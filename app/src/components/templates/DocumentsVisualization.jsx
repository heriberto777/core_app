import React, { useState, useCallback } from "react";
import styled from "styled-components";
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

  // Hook de lógica centralizada
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

  // Estados locales para modales
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [showConfigInfo, setShowConfigInfo] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docDetailsData, setDocDetailsData] = useState(null);
  const [processingResults, setProcessingResults] = useState(null);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [showEntityEditor, setShowEntityEditor] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);

  // --- Handlers de UI ---

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
      // Obtener el ID del primer campo
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

  // --- Renderizado Condicional ---

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
          <DocumentsContainer>
            <HeaderActions>
              <Button variant="secondary" onClick={handleReturnToList}>
                <FaArrowLeft /> Configuración
              </Button>
              <h3 style={{ margin: 0, flex: 1, textAlign: 'center' }}>
                {activeMappingName}
                <small style={{ display: 'block', fontSize: '11px', opacity: 0.6 }}>Entidad: {entityType}</small>
              </h3>
              <Button variant="ghost" onClick={() => setShowConfigInfo(!showConfigInfo)}>
                <FaInfoCircle /> {showConfigInfo ? "Cerrar" : "Info"}
              </Button>
            </HeaderActions>

            {showConfigInfo && <ConfigSummary config={activeConfig} />}

            <DocumentsFilterPanel
              search={search} setSearch={setSearch}
              filterValues={filterValues} setFilterValues={setFilterValues}
              onRefresh={fetchDocuments}
              isRefreshing={documentsRefreshing}
            />

            <MainTableWrapper>
              {documentsLoading && !documentsRefreshing ? (
                <LoadingState>Cargando documentos...</LoadingState>
              ) : documentsError ? (
                <ErrorState><FaExclamationTriangle /> {documentsError}</ErrorState>
              ) : filteredDocuments.length === 0 ? (
                <EmptyState>No se encontraron resultados con los filtros actuales.</EmptyState>
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
            </MainTableWrapper>

            {selectedDocuments.length > 0 && canExecuteMapping && (
              <BatchActionButton>
                <Button variant="primary" onClick={() => handleProcess()} size="large" style={{ width: '100%', padding: '16px' }}>
                  Procesar {selectedDocuments.length} seleccionados
                </Button>
              </BatchActionButton>
            )}
          </DocumentsContainer>
        );
      default:
        return null;
    }
  };

  return (
    <PageLayout>
      <TitleBar>
        <h2>Centro de Gestión de Datos</h2>
        <p>Visualización y procesamiento masivo de documentos entre servidores</p>
      </TitleBar>

      <section className="main">
        {renderContent()}
      </section>

      {/* Modales */}
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
        <EditorOverlay>
          <EditorContainer>
            <CustomerEditor
              customer={selectedEntity}
              mappingId={activeConfig?._id}
              onSave={handleSaveEntity}
              onCancel={() => setShowEntityEditor(false)}
            />
          </EditorContainer>
        </EditorOverlay>
      )}
    </PageLayout>
  );
}

// --- Styled Components Premium ---

const PageLayout = styled.div`
  display: flex; flex-direction: column; gap: 20px; padding: 20px; min-height: 100vh;
  background: ${({ theme }) => theme.bg};
`;

const TitleBar = styled.div`
  text-align: center; margin-bottom: 20px;
  h2 { margin: 0; font-size: 28px; font-weight: 800; color: ${({ theme }) => theme.title}; }
  p { margin: 5px 0 0; color: ${({ theme }) => theme.textSecondary}; font-size: 15px; }
`;

const DocumentsContainer = styled.div`
  display: flex; flex-direction: column; gap: 24px; max-width: 1200px; margin: 0 auto; width: 100%;
`;

const HeaderActions = styled.div`
  display: flex; align-items: center; gap: 16px; 
  padding: 16px; background: ${({ theme }) => theme.cardBg}80; 
  backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid ${({ theme }) => theme.border};
`;

const MainTableWrapper = styled.div`
  position: relative; min-height: 400px;
`;

const BatchActionButton = styled.div`
  position: sticky; bottom: 20px; z-index: 100;
  animation: slideUp 0.3s ease-out;
`;

const LoadingState = styled.div` padding: 100px; text-align: center; font-weight: 600; color: ${({ theme }) => theme.primary}; `;
const ErrorState = styled.div` padding: 100px; text-align: center; color: #dc3545; display: flex; align-items: center; justify-content: center; gap: 10px; `;
const EmptyState = styled.div` padding: 100px; text-align: center; opacity: 0.6; `;

const EditorOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1500;
`;

const EditorContainer = styled.div`
  background: ${({ theme }) => theme.cardBg}; padding: 24px; border-radius: 20px; width: 90%; max-width: 800px;
`;

const ConfigSummary = ({ config }) => (
  <ConfigPanel>
    <div><strong>Origen:</strong> {config.sourceServer} ({config.sourceDatabase})</div>
    <div><strong>Destino:</strong> {config.targetServer} ({config.targetDatabase})</div>
    <div><strong>Transferencia:</strong> {config.transferType}</div>
  </ConfigPanel>
);

const ConfigPanel = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  padding: 16px; background: ${({ theme }) => theme.bg2}20; border-radius: 12px; font-size: 13px;
  border-left: 4px solid ${({ theme }) => theme.primary};
`;

export default DocumentsVisualization;
