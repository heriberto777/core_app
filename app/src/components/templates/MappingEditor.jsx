import React, { useState } from "react";
import styled from "styled-components";
import { Helmet } from "react-helmet-async";
import {
  FaSave, FaTimes, FaPlus, FaEdit, FaTrash, FaTable, FaLink, FaFileAlt, FaCogs
} from "react-icons/fa";
import {
  useAuth,
  useMappingEditor,
  ConsecutiveConfigSection,
  PromotionConfigSection,
  TableConfigModal,
  FieldMappingModal,
  DependencyModal,
  DocumentRuleModal,
  ValueMappingModal,
  Button,
  StatusBadge,
  LoadingUI,
  ContentHeader,
} from "../../index";

// === ESTILOS ( Glassmorphism & Atomic Design ) ===
const Container = styled.div`
  display: flex; flex-direction: column; gap: ${({ theme }) => theme.spacing.lg};
  animation: fadeIn 0.4s ease-out;
`;

const ActionsBar = styled.div`
  display: flex; gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end; align-items: center;
  background: ${({ theme }) => theme.cardBg};
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  backdrop-filter: blur(10px);
`;

const TabsContainer = styled.div`
  display: flex; gap: 8px; border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0 10px; overflow-x: auto;
`;

const Tab = styled.button`
  padding: 12px 20px; border: none; background: transparent;
  color: ${({ $active, theme }) => $active ? theme.primary : theme.textSecondary};
  font-weight: ${({ $active }) => $active ? '600' : '400'};
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.primary : 'transparent'};
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
  display: flex; align-items: center; gap: 8px;

  &:hover { color: ${({ theme }) => theme.primary}; background: ${({ theme }) => theme.bg2}40; }
`;

const ContentCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border-radius: 16px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; box-shadow: ${({ theme }) => theme.shadows.premium};
  min-height: 400px;
`;

const FormGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 8px;
`;

const Label = styled.label`
  font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.textSecondary};
`;

const Input = styled.input`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

const Select = styled.select`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
`;

const ListCard = styled.div`
  background: ${({ theme }) => theme.bg2}20; border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border}; padding: 16px;
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; transition: all 0.2s;

  &:hover { border-color: ${({ theme }) => theme.primary}; background: ${({ theme }) => theme.bg2}40; }
`;

export function MappingEditor({ mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState("general");

  const {
    mapping, loading, saving, isEditing, handleChange, handleSave,
    addTable, removeTable, updateTable, addFieldMapping, updateFieldMapping, removeFieldMapping,
    addDocumentTypeRule, updateDocumentTypeRule, removeDocumentTypeRule,
    addForeignKeyDependency, updateForeignKeyDependency, removeForeignKeyDependency,
    addValueMapping, removeValueMapping
  } = useMappingEditor(mappingId, accessToken, onSave, onCancel);

  // Estados para Modales
  const [modalState, setModalState] = useState({ type: null, isOpen: false, data: null, extraInfo: null });

  const openModal = (type, data = null, extraInfo = null) =>
    setModalState({ type, isOpen: true, data, extraInfo });

  const closeModal = () => setModalState({ ...modalState, isOpen: false });

  if (loading) return <LoadingUI message="Cargando configuración de mapeo..." />;

  return (
    <Container>
      <Helmet><title>Editor de Mapeo - Core ERP</title></Helmet>

      <ContentHeader
        title={isEditing ? `Editando: ${mapping.name}` : "Nueva Configuración de Mapeo"}
        description="Configure la relación entre servidores y el flujo de datos entre entidades del sistema."
      />

      <ActionsBar>
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <FaSave /> {saving ? "Guardando..." : "Guardar Configuración"}
        </Button>
      </ActionsBar>

      <TabsContainer>
        <Tab $active={activeTab === "general"} onClick={() => setActiveTab("general")}><FaCogs /> General</Tab>
        <Tab $active={activeTab === "documentTypes"} onClick={() => setActiveTab("documentTypes")}><FaFileAlt /> Tipos Docto</Tab>
        <Tab $active={activeTab === "dependencies"} onClick={() => setActiveTab("dependencies")}><FaLink /> Dependencias FK</Tab>
        <Tab $active={activeTab === "tables"} onClick={() => setActiveTab("tables")}><FaTable /> Tablas y Campos</Tab>
      </TabsContainer>

      <ContentCard>
        {activeTab === "general" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <FormGrid>
              <FormGroup>
                <Label>Nombre de la Configuración</Label>
                <Input name="name" value={mapping.name} onChange={handleChange} placeholder="Ej: Pedidos Catelli" />
              </FormGroup>
              <FormGroup>
                <Label>Tipo de Entidad</Label>
                <Select name="entityType" value={mapping.entityType} onChange={handleChange}>
                  <option value="orders">Pedidos</option>
                  <option value="invoices">Facturas</option>
                  <option value="customers">Clientes</option>
                </Select>
              </FormGroup>
              <FormGroup style={{ justifyContent: 'center' }}>
                <Label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '10px' }}>
                  <Input
                    type="checkbox"
                    name="active"
                    checked={mapping.active}
                    onChange={handleChange}
                    style={{ width: '20px', height: '20px' }}
                  />
                  <strong>Configuración Activa</strong>
                </Label>
              </FormGroup>
            </FormGrid>

            <FormGrid>
              <FormGroup>
                <Label>Servidor Origen</Label>
                <Select name="sourceServer" value={mapping.sourceServer} onChange={handleChange}>
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>Servidor Destino</Label>
                <Select name="targetServer" value={mapping.targetServer} onChange={handleChange}>
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </Select>
              </FormGroup>
            </FormGrid>

            <FormGrid>
              <FormGroup>
                <Label>Campo Marcado</Label>
                <Input name="markProcessedField" value={mapping.markProcessedField} onChange={handleChange} />
              </FormGroup>
              <FormGroup>
                <Label>Valor Marcado</Label>
                <Input name="markProcessedValue" value={mapping.markProcessedValue} onChange={handleChange} />
              </FormGroup>
            </FormGrid>

            <ConsecutiveConfigSection mapping={mapping} handleChange={handleChange} />
            <PromotionConfigSection mapping={mapping} handleChange={handleChange} />
          </div>
        )}

        {activeTab === "documentTypes" && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Reglas de Negocio</h3>
                <Button variant="primary" onClick={() => openModal('docRule')}><FaPlus /> Añadir Regla</Button>
              </div>
              <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: '14px' }}>
                Defina condiciones basadas en campos de origen para segmentar o aplicar lógicas específicas a diferentes tipos de documentos.
              </p>
            </div>
            {mapping.documentTypeRules.map((rule, idx) => (
              <ListCard key={idx}>
                <div>
                  <strong>{rule.name}</strong>
                  <div style={{ fontSize: '12px', color: '#666' }}>{rule.sourceField}: {rule.sourceValues.join(', ')}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="ghost" onClick={() => openModal('docRule', rule, idx)}><FaEdit /></Button>
                  <Button variant="ghost" $danger onClick={() => removeDocumentTypeRule(idx)}><FaTrash /></Button>
                </div>
              </ListCard>
            ))}
          </div>
        )}

        {activeTab === "dependencies" && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Integridad Referencial (FK)</h3>
                <Button variant="primary" onClick={() => openModal('dependency')}><FaPlus /> Añadir Dependencia</Button>
              </div>
              <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: '14px' }}>
                Configure las dependencias de claves foráneas. El sistema asegurará que los registros relacionados existan en el destino antes de procesar el registro principal.
              </p>
            </div>
            {mapping.foreignKeyDependencies.map((dep, idx) => (
              <ListCard key={idx}>
                <div>
                  <strong>{dep.fieldName} → {dep.dependentTable}</strong>
                  <div style={{ fontSize: '12px', color: '#666' }}>Orden: {dep.executionOrder} | {dep.insertIfNotExists ? "Auto-Insertar" : "Validar"}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="ghost" onClick={() => openModal('dependency', dep, idx)}><FaEdit /></Button>
                  <Button variant="ghost" $danger onClick={() => removeForeignKeyDependency(idx)}><FaTrash /></Button>
                </div>
              </ListCard>
            ))}
          </div>
        )}

        {activeTab === "tables" && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Estructura de Tablas</h3>
                <Button variant="primary" onClick={() => openModal('table')}><FaPlus /> Añadir Tabla</Button>
              </div>
              <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: '14px' }}>
                Mapee las tablas de origen con sus correspondientes en el destino y defina la transformación campo por campo.
              </p>
            </div>
            {mapping.tableConfigs.map((table, tIdx) => (
              <div key={tIdx} style={{ marginBottom: '32px', border: '1px solid #eee', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{table.name} {table.isDetailTable && <StatusBadge status="info">Detalle</StatusBadge>}</h4>
                    <span style={{ fontSize: '12px', color: '#666' }}>{table.sourceTable || 'Padre'} → {table.targetTable}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => openModal('field', null, { tIdx })}><FaPlus /> Campo</Button>
                    <Button variant="ghost" onClick={() => openModal('table', table, tIdx)}><FaEdit /></Button>
                    <Button variant="ghost" $danger onClick={() => removeTable(tIdx)}><FaTrash /></Button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                        <th style={{ padding: '12px' }}>Origen</th>
                        <th style={{ padding: '12px' }}>Destino</th>
                        <th style={{ padding: '12px' }}>Tipo</th>
                        <th style={{ padding: '12px' }}>Lookup</th>
                        <th style={{ padding: '12px' }}>Mapeos</th>
                        <th style={{ padding: '12px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.fieldMappings?.map((field, fIdx) => (
                        <tr key={fIdx} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '12px' }}>{field.sourceField || <span style={{ opacity: 0.5 }}>-</span>}</td>
                          <td style={{ padding: '12px' }}><strong>{field.targetField}</strong> {field.isRequired && <span style={{ color: 'red' }}>*</span>}</td>
                          <td style={{ padding: '12px' }}>{field.fieldType}</td>
                          <td style={{ padding: '12px' }}>{field.lookupFromTarget ? <StatusBadge status="active">Sí</StatusBadge> : '-'}</td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{field.valueMappings?.length || 0}</span>
                              <Button variant="ghost" style={{ padding: '4px' }} onClick={() => openModal('value', null, { tIdx, fIdx })}><FaPlus /></Button>
                            </div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <Button variant="ghost" style={{ padding: '4px' }} onClick={() => openModal('field', field, { tIdx, fIdx })}><FaEdit /></Button>
                              <Button variant="ghost" $danger style={{ padding: '4px' }} onClick={() => removeFieldMapping(tIdx, fIdx)}><FaTrash /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </ContentCard>

      {/* RENDER DE MODALES */}
      <TableConfigModal
        isOpen={modalState.isOpen && modalState.type === 'table'}
        initialData={modalState.data}
        onClose={closeModal}
        onSave={(data) => modalState.data ? updateTable(modalState.extraInfo, data) : addTable(data)}
      />

      <FieldMappingModal
        isOpen={modalState.isOpen && modalState.type === 'field'}
        initialData={modalState.data}
        onClose={closeModal}
        onSave={(data) => modalState.data ? updateFieldMapping(modalState.extraInfo.tIdx, modalState.extraInfo.fIdx, data) : addFieldMapping(modalState.extraInfo.tIdx, data)}
      />

      <DependencyModal
        isOpen={modalState.isOpen && modalState.type === 'dependency'}
        initialData={modalState.data}
        onClose={closeModal}
        onSave={(data) => modalState.data ? updateForeignKeyDependency(modalState.extraInfo, data) : addForeignKeyDependency(data)}
      />

      <DocumentRuleModal
        isOpen={modalState.isOpen && modalState.type === 'docRule'}
        initialData={modalState.data}
        onClose={closeModal}
        onSave={(data) => modalState.data ? updateDocumentTypeRule(modalState.extraInfo, data) : addDocumentTypeRule(data)}
      />

      <ValueMappingModal
        isOpen={modalState.isOpen && modalState.type === 'value'}
        onClose={closeModal}
        onSave={(data) => addValueMapping(modalState.extraInfo.tIdx, modalState.extraInfo.fIdx, data)}
      />
    </Container>
  );
}
