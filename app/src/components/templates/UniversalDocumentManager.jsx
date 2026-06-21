import React, { useState, useMemo } from "react";
import {
    FaArrowLeft, FaSync, FaExclamationTriangle,
    FaShoppingCart, FaUsers, FaFileInvoiceDollar, FaBox, FaRocket, FaExchangeAlt, FaLink
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
        mappings.filter(m => {
            const isActive = m.active !== false;
            const isRestrictedChild = m.isWorkflowChild === true && m.allowDirectExecution === false;
            return isActive && !isRestrictedChild;
        }),
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
                setSelectedDocuments([specificId]);
                await executeProcessing([specificId]);
            } else {
                await executeProcessing();
            }
        } catch (error) {
            Swal.fire("Error", error.message || "Error operativo", "error");
        }
    };

    const handleSelectMappingInternal = (mapping) => {
        if (mapping.isWorkflowChild && !mapping.allowDirectExecution) {
            Swal.fire({
                title: 'Proceso Restringido',
                html: `Este es un <strong>proceso hijo</strong> configurado para ejecutarse solo desde su proceso padre.<br/><br/>¿Desea continuar de todos modos?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, abrir',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#f39c12'
            }).then((result) => {
                if (result.isConfirmed) {
                    handleSelectMapping(mapping._id);
                }
            });
            return;
        }
        handleSelectMapping(mapping._id);
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
        <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">Centro de Operaciones Universales</h2>
                <p className="text-base text-gray-500 dark:text-gray-400 opacity-80">Selecciona un proceso de negocio para gestionar sus documentos pendientes</p>
            </div>

            {mappingsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3].map(i => <div key={i} className="h-64 rounded-3xl bg-white dark:bg-slate-800 opacity-50" />)}
                </div>
            ) : activeMappings.length === 0 ? (
                <div className="text-center py-24 opacity-50 text-gray-500 dark:text-gray-400">
                    <FaExclamationTriangle size={40} className="mx-auto mb-4" />
                    <h3>No hay procesos configurados</h3>
                    <p>Contacta con el administrador para habilitar mapeos de datos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {activeMappings.map((mapping) => {
                        const isParent = mapping.workflowConfig?.enabled && mapping.workflowConfig?.nextMappings?.length > 0;
                        const isChild = mapping.isWorkflowChild;

                        return (
                            <div
                                key={mapping._id}
                                onClick={() => handleSelectMappingInternal(mapping)}
                                className="relative bg-white dark:bg-slate-800 rounded-3xl p-8 border border-gray-200 dark:border-slate-700 flex flex-col gap-5 cursor-pointer transition-all duration-300 hover:-translate-y-3 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-2xl overflow-hidden group"
                            >
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 -translate-x-full group-hover:translate-x-0 transition-transform duration-400" />

                                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-3xl">
                                    {getProcessIcon(mapping.name)}
                                </div>

                                <div className="absolute top-4 right-4 flex gap-2 z-10">
                                    {isParent && (
                                        <span className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow-lg border border-white/20">
                                            ✨ PROCESO PADRE
                                        </span>
                                    )}
                                    {isChild && <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">HIJO</span>}
                                </div>

                                <div className="flex-1">
                                    <h3 className="m-0 text-2xl font-bold text-gray-900 dark:text-white">{mapping.name}</h3>
                                    {isParent && (
                                        <div className="text-emerald-600 dark:text-emerald-400 font-extrabold text-xs mb-3 flex items-center gap-1">
                                            <FaLink /> DISPARA FLUJO AUTOMÁTICO
                                        </div>
                                    )}
                                    <p className="my-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{mapping.description || "Gestión y transferencia de documentos"}</p>
                                    <span className="inline-block mt-4 text-xs font-bold uppercase tracking-wider px-3 py-1 bg-blue-500/10 text-blue-500 rounded-lg">
                                        {mapping.transferType}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between pt-5 border-t border-gray-200/40 text-sm font-bold text-blue-500">
                                    <span>Iniciar Gestión</span>
                                    <FaRocket />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const renderManager = () => (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-lg">
                <Button variant="secondary" onClick={handleReturnToList}>
                    <FaArrowLeft /> Volver al Lanzador
                </Button>
                <h3 className="m-0 flex flex-col items-center gap-1 text-2xl font-extrabold text-gray-900 dark:text-white">
                    {activeMappingName}
                    <span className="text-xs px-3 py-1 rounded-full bg-blue-500 text-white">{entityType.toUpperCase()}</span>
                </h3>
                <div className="w-36" />
            </div>

            <DocumentsFilterPanel
                search={search} setSearch={setSearch}
                filterValues={filterValues} setFilterValues={setFilterValues}
                onRefresh={fetchDocuments}
                isRefreshing={documentsRefreshing}
            />

            <div className="min-h-[500px] relative">
                {documentsLoading && !documentsRefreshing ? (
                    <div className="py-48 text-center text-blue-500 font-bold">
                        <FaSync className="spinning inline-block mr-2" /> Cargando datos operacionales...
                    </div>
                ) : documentsError ? (
                    <div className="py-48 text-center text-red-500">
                        <FaExclamationTriangle className="inline-block mr-2" /> {documentsError}
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className="py-48 text-center italic opacity-60">Excelente! No hay documentos pendientes por procesar.</div>
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

            {selectedDocuments.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50">
                    <button
                        onClick={() => handleProcess()}
                        className="w-full py-5 rounded-2xl border-none bg-blue-500 text-white text-lg font-extrabold shadow-xl hover:scale-105 hover:brightness-110 active:scale-95 transition-all"
                    >
                        EJECUTAR PROCESAMIENTO ({selectedDocuments.length})
                    </button>
                </div>
            )}
        </div>
    );

    const renderContent = () => {
        if (activeView === "mappingsList") return renderLauncher();

        if (isEditOpen && editingDoc) {
            return (
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-lg">
                        <Button variant="secondary" onClick={() => setIsEditOpen(false)}>
                            <FaArrowLeft /> Volver a la Lista
                        </Button>
                        <h3 className="m-0 text-2xl font-extrabold text-gray-900 dark:text-white">Editando Documento técnico</h3>
                        <div className="w-36" />
                    </div>
                    <CustomerEditor
                        customer={editingDoc}
                        mappingId={activeMappingId}
                        onSave={handleSaveEdit}
                        onCancel={() => setIsEditOpen(false)}
                    />
                </div>
            );
        }

        return renderManager();
    };

    return (
        <div className="p-8 bg-gray-50 dark:bg-slate-900 min-h-screen animate-fadeIn">
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
        </div>
    );
}

export default UniversalDocumentManager;
