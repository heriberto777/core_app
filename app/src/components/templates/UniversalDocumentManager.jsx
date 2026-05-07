import React, { useState, useMemo } from "react";
import styled from "styled-components";
import {
    FaArrowLeft, FaSync, FaExclamationTriangle,
    FaShoppingCart, FaUsers, FaFileInvoiceDollar, FaBox, FaRocket, FaExchangeAlt
} from "react-icons/fa";
import Swal from "sweetalert2";

import {
    useAuth,
    usePermissions,
    useDocumentsVisualization,
    useMappings,
    DocumentsFilterPanel,
    ProcessingResultsModal,
    ProcessingStatusModal,
    DocumentDetailsModal,
    DocumentsDataTable,
    CustomerEditor,
    Button
} from "../../index";

const ICON_MAP = {
    pedido: <FaShoppingCart />,
    order: <FaShoppingCart />,
    cliente: <FaUsers />,
    client: <FaUsers />,
    customer: <FaUsers />,
    factura: <FaFileInvoiceDollar />,
    invoice: <FaFileInvoiceDollar />,
    articulo: <FaBox />,
    product: <FaBox />,
    item: <FaBox />,
    traspaso: <FaExchangeAlt />,
    transfer: <FaExchangeAlt />
};

const getProcessIcon = (name = "") => {
    const lowerName = name.toLowerCase();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (lowerName.includes(key)) return icon;
    }
    return <FaRocket />;
};

export function UniversalDocumentManager() {
    const { accessToken } = useAuth();
    const { hasPermission, isAdmin } = usePermissions();

    const canCreateMapping = hasPermission("mappings", "create") || isAdmin;
    const canEditMapping = hasPermission("mappings", "update") || isAdmin;
    const canDeleteMapping = hasPermission("mappings", "delete") || isAdmin;
    const canExecuteMapping = hasPermission("mappings", "execute") || hasPermission("documents", "create") || isAdmin;

    const {
        mappings,
        loading: mappingsLoading
    } = useMappings(accessToken);

    const {
        activeView,
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
        fetchDocuments,
        activeMappingId,
        setSelectedDocuments,
        isProcessing,
        setIsProcessing,
        actionStates
    } = useDocumentsVisualization(accessToken);

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [docDetailsData, setDocDetailsData] = useState(null);
    const [processingResults, setProcessingResults] = useState(null);
    const [isResultsOpen, setIsResultsOpen] = useState(false);

    const activeMappings = useMemo(() =>
        mappings.filter(m => m.active),
        [mappings]);

    const handleViewDetails = async (doc) => {
        try {
            setSelectedDoc(doc);
            const id = doc[Object.keys(doc)[0]];
            const details = await getDocumentDetails(id);
            setDocDetailsData(details);
            setIsDetailsOpen(true);
        } catch (error) {
            Swal.fire("Error", "No se pudieron cargar los detalles.", "error");
        }
    };

    const handleProcess = async (specificId = null) => {
        const docsToProcessCount = specificId ? 1 : selectedDocuments.length;
        if (docsToProcessCount === 0) return;

        const confirm = await Swal.fire({
            title: '¿Iniciar Procesamiento?',
            text: `Se procesarán ${docsToProcessCount} registros del proceso "${activeMappingName}".`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, ejecutar ahora',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: 'var(--primary, #3498db)'
        });

        if (!confirm.isConfirmed) return;

        try {
            if (specificId) {
                // Sincronizamos la selección para que el hook lo maneje
                setSelectedDocuments([specificId]);
                await executeProcessing([specificId]);
                // No abrimos el modal aquí, el ProcessingStatusModal lo hará al terminar
            } else {
                await executeProcessing();
                // No abrimos el modal aquí, el ProcessingStatusModal lo hará al terminar
            }
        } catch (error) {
            Swal.fire("Error", error.message || "Error operativo", "error");
        }
    };

    const handleEditEntity = (doc) => {
        setEditingDoc(doc);
        setIsEditOpen(true);
    };

    const handleSaveEdit = async () => {
        setIsEditOpen(false);
        setEditingDoc(null);
        await fetchDocuments();
    };

    const renderLauncher = () => (
        <LauncherContainer>
            <LauncherHeader>
                <h2>Centro de Operaciones Universales</h2>
                <p>Selecciona un proceso de negocio para gestionar sus documentos pendientes</p>
            </LauncherHeader>

            {mappingsLoading ? (
                <LoadingGrid>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                </LoadingGrid>
            ) : activeMappings.length === 0 ? (
                <EmptyLauncher>
                    <FaExclamationTriangle size={40} />
                    <h3>No hay procesos configurados</h3>
                    <p>Contacta con el administrador para habilitar mapeos de datos.</p>
                </EmptyLauncher>
            ) : (
                <CardsGrid>
                    {activeMappings.map((mapping) => (
                        <OperationalCard
                            key={mapping._id}
                            onClick={() => handleSelectMapping(mapping._id)}
                        >
                            <CardIcon>{getProcessIcon(mapping.name)}</CardIcon>
                            <CardContent>
                                <h3>{mapping.name}</h3>
                                <p>{mapping.description || "Gestión y transferencia de documentos"}</p>
                                <ProcessType>{mapping.transferType}</ProcessType>
                            </CardContent>
                            <CardFooter>
                                <span>Iniciar Gestión</span>
                                <FaRocket />
                            </CardFooter>
                        </OperationalCard>
                    ))}
                </CardsGrid>
            )}
        </LauncherContainer>
    );

    const renderManager = () => (
        <ManagerContainer>
            <ManagerHeader>
                <Button variant="secondary" onClick={handleReturnToList}>
                    <FaArrowLeft /> Volver al Lanzador
                </Button>
                <HeaderTitle>
                    {activeMappingName}
                    <Badge>{entityType.toUpperCase()}</Badge>
                </HeaderTitle>
                <div style={{ width: '150px' }} />
            </ManagerHeader>

            <DocumentsFilterPanel
                search={search} setSearch={setSearch}
                filterValues={filterValues} setFilterValues={setFilterValues}
                onRefresh={fetchDocuments}
                isRefreshing={documentsRefreshing}
            />

            <TableWrapper>
                {documentsLoading && !documentsRefreshing ? (
                    <LoadingState>
                        <FaSync className="spinning" /> Cargando datos operacionales...
                    </LoadingState>
                ) : documentsError ? (
                    <ErrorState>
                        <FaExclamationTriangle /> {documentsError}
                    </ErrorState>
                ) : filteredDocuments.length === 0 ? (
                    <EmptyState>Excelente! No hay documentos pendientes por procesar.</EmptyState>
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
            </TableWrapper>

            {selectedDocuments.length > 0 && (
                <FloatingActions>
                    <ProcessButton onClick={() => handleProcess()} loading={isProcessing}>
                        EJECUTAR PROCESAMIENTO ({selectedDocuments.length})
                    </ProcessButton>
                </FloatingActions>
            )}
        </ManagerContainer>
    );

    const renderContent = () => {
        if (activeView === "mappingsList") return renderLauncher();

        if (isEditOpen && editingDoc) {
            return (
                <ManagerContainer>
                    <ManagerHeader>
                        <Button variant="secondary" onClick={() => setIsEditOpen(false)}>
                            <FaArrowLeft /> Volver a la Lista
                        </Button>
                        <HeaderTitle>Editando Documento técnico</HeaderTitle>
                        <div style={{ width: '150px' }} />
                    </ManagerHeader>
                    <CustomerEditor
                        customer={editingDoc}
                        mappingId={activeMappingId}
                        onSave={handleSaveEdit}
                        onCancel={() => setIsEditOpen(false)}
                    />
                </ManagerContainer>
            );
        }

        return renderManager();
    };

    return (
        <MainWrapper>
            {renderContent()}

            <DocumentDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                document={selectedDoc}
                details={docDetailsData}
            />

            <ProcessingStatusModal
                isOpen={isProcessing}
                taskId={activeConfig?.taskId}
                accessToken={accessToken}
                mappingName={activeMappingName}
                onFinished={(result) => {
                    setProcessingResults(result);
                    setIsProcessing(false);
                    setIsResultsOpen(true);
                }}
            />

            <ProcessingResultsModal
                isOpen={isResultsOpen}
                onClose={() => setIsResultsOpen(false)}
                results={processingResults}
            />
        </MainWrapper>
    );
}

// --- Styled Components Premium ---

const MainWrapper = styled.div`
    padding: 30px;
    background: ${({ theme }) => theme.bg};
    min-height: 100vh;
    animation: fadeIn 0.5s ease-out;
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
`;

const LauncherContainer = styled.div`
    max-width: 1200px;
    margin: 0 auto;
`;

const LauncherHeader = styled.div`
    text-align: center;
    margin-bottom: 50px;
    h2 { font-size: 32px; font-weight: 800; color: ${({ theme }) => theme.title}; margin-bottom: 10px; }
    p { font-size: 16px; color: ${({ theme }) => theme.textSecondary}; opacity: 0.8; }
`;

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px;
`;

const OperationalCard = styled.div`
    background: ${({ theme }) => theme.cardBg};
    border-radius: 24px;
    padding: 30px;
    border: 1px solid ${({ theme }) => theme.border};
    display: flex;
    flex-direction: column;
    gap: 20px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    box-shadow: ${({ theme }) => theme.shadows.soft};

    &:hover {
        transform: translateY(-10px);
        border-color: ${({ theme }) => theme.primary};
        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        
        &::after { transform: translateX(0); }
    }

    &::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; width: 100%; height: 4px;
        background: ${({ theme }) => theme.primary};
        transform: translateX(-100%);
        transition: transform 0.4s ease;
    }
`;

const CardIcon = styled.div`
    width: 60px; height: 60px;
    border-radius: 16px;
    background: ${({ theme }) => theme.primary}15;
    color: ${({ theme }) => theme.primary};
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
`;

const CardContent = styled.div`
    flex: 1;
    h3 { margin: 0; font-size: 22px; font-weight: 700; color: ${({ theme }) => theme.title}; }
    p { margin: 8px 0 0; font-size: 14px; color: ${({ theme }) => theme.textSecondary}; line-height: 1.5; }
`;

const ProcessType = styled.span`
    display: inline-block;
    margin-top: 15px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 4px 10px;
    background: ${({ theme }) => theme.primary}10;
    color: ${({ theme }) => theme.primary};
    border-radius: 6px;
`;

const CardFooter = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 20px; border-top: 1px solid ${({ theme }) => theme.border}40;
    font-size: 14px; font-weight: 700; color: ${({ theme }) => theme.primary};
`;

const ManagerContainer = styled.div`
    display: flex; flex-direction: column; gap: 24px;
`;

const ManagerHeader = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px; background: ${({ theme }) => theme.cardBg}; border-radius: 20px;
    border: 1px solid ${({ theme }) => theme.border}; box-shadow: ${({ theme }) => theme.shadows.premium};
`;

const HeaderTitle = styled.h3`
    margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
    font-size: 24px; font-weight: 800; color: ${({ theme }) => theme.title};
`;

const Badge = styled.span`
    font-size: 10px; padding: 2px 10px; border-radius: 30px;
    background: ${({ theme }) => theme.primary}; color: white;
`;

const TableWrapper = styled.div` min-height: 500px; position: relative; `;

const FloatingActions = styled.div`
    position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
    width: 90%; max-width: 600px; z-index: 1000;
`;

const ProcessButton = styled(Button)`
    width: 100%; padding: 20px; border-radius: 20px; border: none;
    background: ${({ theme }) => theme.primary}; color: white;
    font-size: 18px; font-weight: 800; cursor: pointer;
    box-shadow: 0 15px 35px ${({ theme }) => theme.primary}50;
    transition: all 0.3s ease;
    &:hover { transform: scale(1.02); filter: brightness(1.1); }
    &:active { transform: scale(0.98); }
`;

const LoadingGrid = styled.div` display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; `;
const SkeletonCard = styled.div` height: 250px; border-radius: 24px; background: ${({ theme }) => theme.cardBg}; opacity: 0.5; `;
const EmptyLauncher = styled.div` text-align: center; padding: 100px; opacity: 0.5; color: ${({ theme }) => theme.textSecondary}; `;
const LoadingState = styled.div` padding: 200px; text-align: center; color: ${({ theme }) => theme.primary}; font-weight: 700; `;
const ErrorState = styled.div` padding: 200px; text-align: center; color: #ff4757; `;
const EmptyState = styled.div` padding: 200px; text-align: center; font-style: italic; opacity: 0.6; `;

export default UniversalDocumentManager;
