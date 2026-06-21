import React, { useState } from "react";
import { FaTimes, FaChevronDown, FaChevronRight } from "react-icons/fa";
import { StatusBadge } from "../index";

const Overlay = (props) => (
  <div
    {...props}
    className="fixed inset-0 flex items-center justify-center z-1000 bg-black/70 backdrop-blur-sm"
    onClick={props.onClick}
  />
);

const Content = (props) => (
  <div
    {...props}
    className="w-[90vw] max-w-4xl max-h-[90vh] rounded-lg shadow-xl flex flex-col overflow-hidden border border-slate-700 bg-white dark:bg-slate-800"
  />
);

const Header = (props) => (
  <div
    {...props}
    className="px-4 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-100 dark:bg-slate-900"
  />
);

const Title = (props) => (
  <h3
    {...props}
    className="m-0 text-lg text-slate-900 dark:text-slate-100"
  />
);

const CloseButton = (props) => (
  <button
    {...props}
    className="bg-transparent border-none text-slate-500 dark:text-slate-400 text-xl hover:text-red-600 dark:hover:text-red-500 transition-colors"
  />
);

const Body = (props) => (
  <div
    {...props}
    className="px-6 py-4 overflow-y-auto flex flex-col gap-4"
  />
);

const DetailRow = (props) => (
  <div
    {...props}
    className="flex flex-col gap-1"
  />
);

const Label = (props) => (
  <span
    {...props}
    className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
  />
);

const Value = (props) => (
  <div
    {...props}
    className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed"
  />
);

const CodeBlock = (props) => (
  <pre
    {...props}
    className="bg-slate-100 dark:bg-slate-900 p-3 rounded-lg font-mono text-xs overflow-x-auto border border-slate-700 text-slate-900 dark:text-slate-100"
  />
);

const CollapsibleSectionWrapper = (props) => (
  <div
    {...props}
    className="border border-slate-700 rounded-lg overflow-hidden"
  />
);

const CollapsibleHeader = (props) => (
  <div
    {...props}
    className="bg-slate-100 dark:bg-slate-900 px-3 py-3 flex items-center gap-2 cursor-pointer select-none transition-colors hover:bg-slate-200 dark:hover:bg-slate-800"
  />
);

const CollapsibleTitle = (props) => (
  <span
    {...props}
    className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex-1"
  />
);

const CollapsibleContent = (props) => (
  <div
    {...props}
    className="p-3 border-t border-slate-700"
  />
);

const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <CollapsibleSectionWrapper>
      <CollapsibleHeader onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <FaChevronDown size={14} color="#888" /> : <FaChevronRight size={14} color="#888" />}
        <CollapsibleTitle>{title}</CollapsibleTitle>
      </CollapsibleHeader>
      {isOpen && <CollapsibleContent>{children}</CollapsibleContent>}
    </CollapsibleSectionWrapper>
  );
};

export const LogDetailModal = ({ log, onClose }) => {
    if (!log) return null;

    return (
        <Overlay onClick={onClose}>
            <Content onClick={(e) => e.stopPropagation()}>
                <Header>
                    <Title>Detalle del Registro</Title>
                    <CloseButton onClick={onClose}><FaTimes /></CloseButton>
                </Header>
                <Body>
                    {/* Sección 1: Información básica */}
                    <div className="grid grid-cols-3 gap-4">
                        <DetailRow>
                            <Label>Nivel</Label>
                            <StatusBadge status={log.level}>{log.level}</StatusBadge>
                        </DetailRow>
                        <DetailRow>
                            <Label>Fecha</Label>
                            <Value>{new Date(log.timestamp).toLocaleString()}</Value>
                        </DetailRow>
                        <DetailRow>
                            <Label>Fuente</Label>
                            <Value>{log.source || "Sistema Central"}</Value>
                        </DetailRow>
                    </div>

                    {/* Sección 2: Información operacional */}
                    {(log.operationType || log.entityType) && (
                        <div className="grid grid-cols-4 gap-4">
                            {log.operationType && (
                                <DetailRow>
                                    <Label>Tipo de Operación</Label>
                                    <Value className="text-blue-600 dark:text-blue-500 font-semibold">{log.operationType}</Value>
                                </DetailRow>
                            )}
                            {log.entityType && (
                                <DetailRow>
                                    <Label>Tipo de Entidad</Label>
                                    <Value className="text-green-600 dark:text-green-500 font-semibold">{log.entityType}</Value>
                                </DetailRow>
                            )}
                            {log.entityId && (
                                <DetailRow>
                                    <Label>ID de Entidad</Label>
                                    <Value>{log.entityId}</Value>
                                </DetailRow>
                            )}
                            {log.affectedRecords > 0 && (
                                <DetailRow>
                                    <Label>Registros Afectados</Label>
                                    <Value className="font-semibold">{log.affectedRecords}</Value>
                                </DetailRow>
                            )}
                        </div>
                    )}

                    {/* Sección 3: Rendimiento */}
                    {(log.durationMs > 0 || log.durationMs !== undefined) && (
                        <DetailRow>
                            <Label>Duración</Label>
                            <Value className={`font-semibold ${
                                log.durationMs < 1000 ? 'text-green-600 dark:text-green-500' :
                                log.durationMs < 5000 ? 'text-yellow-500' : 'text-red-600 dark:text-red-500'
                            }`}>
                                {log.durationMs} ms
                                {log.durationMs < 1000 && " ✅"}
                                {log.durationMs >= 1000 && log.durationMs < 5000 && " ⚠️"}
                                {log.durationMs >= 5000 && " 🔴"}
                            </Value>
                        </DetailRow>
                    )}

                    {/* Sección 4: Mensaje */}
                    <DetailRow>
                        <Label>Mensaje</Label>
                        <Value className="font-medium text-base">{log.message}</Value>
                    </DetailRow>

                    {/* Sección 5: Contexto HTTP */}
                    {(log.httpMethod || log.httpPath) && (
                        <div className="grid grid-cols-3 gap-4">
                            {log.httpMethod && (
                                <DetailRow>
                                    <Label>Método HTTP</Label>
                                    <Value className="font-semibold text-violet-600 dark:text-violet-500">{log.httpMethod}</Value>
                                </DetailRow>
                            )}
                            {log.httpPath && (
                                <DetailRow>
                                    <Label>Ruta HTTP</Label>
                                    <Value className="font-mono text-xs">{log.httpPath}</Value>
                                </DetailRow>
                            )}
                            {log.httpStatusCode && (
                                <DetailRow>
                                    <Label>Status Code</Label>
                                    <Value className={`font-semibold ${
                                        log.httpStatusCode < 400 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                                    }`}>
                                        {log.httpStatusCode}
                                    </Value>
                                </DetailRow>
                            )}
                        </div>
                    )}

                    {/* Sección 6: Error */}
                    {(log.errorCode || log.error) && (
                        <DetailRow>
                            <Label>Código de Error</Label>
                            <Value className="text-red-600 dark:text-red-500 font-semibold">{log.errorCode || log.error}</Value>
                        </DetailRow>
                    )}

                    {/* Sección 7: Query SQL */}
                    {log.query && (
                        <DetailRow>
                            <Label>Query SQL</Label>
                            <CodeBlock>{log.query}</CodeBlock>
                        </DetailRow>
                    )}

                    {/* Sección 8: Context Details - Collapsible */}
                    {(log.mappingId || log.mappingName || log.fieldName || log.tableSource || log.tableTarget || log.stepName) && (
                        <CollapsibleSection title="Detalles del Mapping" defaultOpen={true}>
                            <div className="grid grid-cols-2 gap-3">
                                {log.mappingId && (
                                    <DetailRow>
                                        <Label>Mapping ID</Label>
                                        <Value className="font-mono text-xs">{log.mappingId}</Value>
                                    </DetailRow>
                                )}
                                {log.mappingName && (
                                    <DetailRow>
                                        <Label>Mapping</Label>
                                        <Value className="font-semibold text-blue-600 dark:text-blue-500">{log.mappingName}</Value>
                                    </DetailRow>
                                )}
                                {log.fieldName && (
                                    <DetailRow>
                                        <Label>Campo</Label>
                                        <Value className="font-medium">{log.fieldName}</Value>
                                    </DetailRow>
                                )}
                                {log.stepName && (
                                    <DetailRow>
                                        <Label>Paso</Label>
                                        <Value className="text-amber-600 dark:text-amber-500">{log.stepName}</Value>
                                    </DetailRow>
                                )}
                                {log.tableSource && (
                                    <DetailRow>
                                        <Label>Tabla Origen</Label>
                                        <Value className="font-mono text-xs">{log.tableSource}</Value>
                                    </DetailRow>
                                )}
                                {log.tableTarget && (
                                    <DetailRow>
                                        <Label>Tabla Destino</Label>
                                        <Value className="font-mono text-xs">{log.tableTarget}</Value>
                                    </DetailRow>
                                )}
                                {log.documentId && (
                                    <DetailRow>
                                        <Label>Document ID</Label>
                                        <Value className="font-mono text-xs">{log.documentId}</Value>
                                    </DetailRow>
                                )}
                                {log.transactionId && (
                                    <DetailRow>
                                        <Label>Transaction ID</Label>
                                        <Value className="font-mono text-xs">{log.transactionId}</Value>
                                    </DetailRow>
                                )}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Sección 9: Failed Value - Collapsible */}
                    {(log.failedValue !== undefined && log.failedValue !== null) && (
                        <CollapsibleSection title="Valor que Causó el Error" defaultOpen={true}>
                            <DetailRow>
                                <CodeBlock className="text-amber-600 dark:text-amber-500">
                                    {typeof log.failedValue === "object"
                                        ? JSON.stringify(log.failedValue, null, 2)
                                        : String(log.failedValue)}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}

                    {/* Sección 10: Error Details - Collapsible */}
                    {log.errorDetails && (
                        <CollapsibleSection title="Detalles del Error" defaultOpen={true}>
                            <DetailRow>
                                <CodeBlock>
                                    {typeof log.errorDetails === "object"
                                        ? JSON.stringify(log.errorDetails, null, 2)
                                        : log.errorDetails}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}

                    {/* Sección 11: Metadata */}
                    {log.metadata && (
                        <DetailRow>
                            <Label>Metadata</Label>
                            <CodeBlock>
                                {typeof log.metadata === "object"
                                    ? JSON.stringify(log.metadata, null, 2)
                                    : log.metadata}
                            </CodeBlock>
                        </DetailRow>
                    )}

                    {/* Sección 12: Original Stack Trace - Collapsible */}
                    {log.originalStack && (
                        <CollapsibleSection title="Stack Trace Original" defaultOpen={false}>
                            <DetailRow>
                                <CodeBlock className="text-red-600 dark:text-red-500">
                                    {log.originalStack}
                                </CodeBlock>
                            </DetailRow>
                        </CollapsibleSection>
                    )}
                </Body>
            </Content>
        </Overlay>
    );
};
