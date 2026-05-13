import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  FaSave, FaTimes, FaPlus, FaEdit, FaTrash, FaTable, FaLink, FaFileAlt, FaCogs, FaChevronDown, FaChevronUp, FaArrowRight
} from "react-icons/fa";
import {
  useAuth,
  useMappingEditor,
  useConsecutiveManager,
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
  WorkflowConfigSection,
  Input,
} from "../../index";

const INITIAL_FIELDS_SHOWN = 8;

/**
 * MappingEditor (Tailwind Edition)
 * Re-diseño corporativo ligero y moderno.
 */
export function MappingEditor({ mappingId, onSave, onCancel }) {
  const { accessToken } = useAuth();
  const { consecutives } = useConsecutiveManager(accessToken);
  const [activeTab, setActiveTab] = useState("general");
  const [expandedTables, setExpandedTables] = useState({});

  const {
    mapping, loading, saving, isEditing, handleChange, handleSave,
    addTable, removeTable, updateTable, addFieldMapping, updateFieldMapping, removeFieldMapping,
    addDocumentTypeRule, updateDocumentTypeRule, removeDocumentTypeRule,
    addForeignKeyDependency, updateForeignKeyDependency, removeForeignKeyDependency,
    addValueMapping, removeValueMapping
  } = useMappingEditor(mappingId, accessToken, onSave, onCancel);

  const [modalState, setModalState] = useState({ type: null, isOpen: false, data: null, extraInfo: null });

  const toggleTableExpansion = (tIdx) => {
    setExpandedTables(prev => ({ ...prev, [tIdx]: !prev[tIdx] }));
  };

  const isTableExpanded = (tIdx) => expandedTables[tIdx] === true;

  const openModal = (type, data = null, extraInfo = null) =>
    setModalState({ type, isOpen: true, data, extraInfo });

  const closeModal = () => setModalState({ ...modalState, isOpen: false });

  if (loading) return <LoadingUI message="Cargando configuración de mapeo..." />;

  const tabs = [
    { id: "general", label: "General", icon: <FaCogs /> },
    { id: "documentTypes", label: "Tipos Docto", icon: <FaFileAlt /> },
    { id: "dependencies", label: "Dependencias", icon: <FaLink /> },
    { id: "tables", label: "Tablas y Campos", icon: <FaTable /> },
    { id: "workflow", label: "Flujo / Workflow", icon: <FaArrowRight /> },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <Helmet><title>Editor de Mapeo - Core ERP</title></Helmet>

      <ContentHeader
        title={isEditing ? `Editando: ${mapping.name}` : "Nueva Configuración de Mapeo"}
        description="Configure la relación entre servidores y el flujo de datos entre entidades del sistema."
      />

      {/* BARRA DE ACCIONES */}
      <div className="flex gap-4 justify-end items-center bg-white p-4 rounded-xl border border-slate-200 shadow-soft backdrop-blur-md">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <FaSave /> {saving ? "Guardando..." : "Guardar Configuración"}
        </Button>
      </div>

      {/* TABS NAVEGACIÓN */}
      <div className="flex gap-1 border-b border-slate-200 px-2 overflow-x-auto bg-white/50 rounded-t-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-all border-b-2
              ${activeTab === tab.id 
                ? "text-primary-600 border-primary-600 bg-primary-50/50" 
                : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"}
            `}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-8 shadow-soft min-h-[500px]">
        {activeTab === "general" && (
          <div className="flex flex-col gap-8 max-w-5xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Input 
                label="Nombre de la Configuración" 
                name="name" 
                value={mapping.name} 
                onChange={handleChange} 
                placeholder="Ej: Pedidos Catelli" 
              />
              <div className="flex flex-col gap-1.5 w-full mb-3">
                <label className="text-[13px] font-semibold text-slate-500 ml-1">Tipo de Entidad</label>
                <select 
                  name="entityType" 
                  value={mapping.entityType} 
                  onChange={handleChange}
                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
                >
                  <option value="orders">Pedidos</option>
                  <option value="invoices">Facturas</option>
                  <option value="customers">Clientes</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="active-check"
                  name="active"
                  checked={mapping.active}
                  onChange={handleChange}
                  className="w-5 h-5 rounded-lg border-slate-300 text-primary-600 focus:ring-primary-500 transition-all cursor-pointer"
                />
                <label htmlFor="active-check" className="text-sm font-bold text-slate-700 cursor-pointer">
                  Configuración Activa
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-[13px] font-semibold text-slate-500 ml-1">Servidor Origen</label>
                <select name="sourceServer" value={mapping.sourceServer} onChange={handleChange} className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none">
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-[13px] font-semibold text-slate-500 ml-1">Servidor Destino</label>
                <select name="targetServer" value={mapping.targetServer} onChange={handleChange} className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none">
                  <option value="server1">Server 1</option>
                  <option value="server2">Server 2</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Campo Marcado" name="markProcessedField" value={mapping.markProcessedField || ""} onChange={handleChange} placeholder="Ej: IS_PROCESSED" />
              <Input label="Valor Marcado" name="markProcessedValue" value={mapping.markProcessedValue || ""} onChange={handleChange} placeholder="Ej: 1" />
            </div>

            <ConsecutiveConfigSection mapping={mapping} handleChange={handleChange} />
            <PromotionConfigSection mapping={mapping} handleChange={handleChange} />
          </div>
        )}

        {activeTab === "documentTypes" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Reglas de Negocio</h3>
                <p className="text-sm text-slate-500 mt-1">Defina condiciones basadas en campos de origen para segmentar lógicas específicas.</p>
              </div>
              <Button variant="primary" onClick={() => openModal('docRule')}><FaPlus /> Añadir Regla</Button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {mapping.documentTypeRules.map((rule, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 transition-all group">
                  <div>
                    <div className="font-bold text-slate-800">{rule.name}</div>
                    <div className="text-xs text-slate-500 font-medium">{rule.sourceField}: <span className="text-primary-600">{rule.sourceValues.join(', ')}</span></div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" className="bg-white p-2" onClick={() => openModal('docRule', rule, idx)}><FaEdit /></Button>
                    <Button variant="ghost" className="bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => removeDocumentTypeRule(idx)}><FaTrash /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "dependencies" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Integridad Referencial (FK)</h3>
                <p className="text-sm text-slate-500 mt-1">Configure las dependencias de claves foráneas para asegurar integridad.</p>
              </div>
              <Button variant="primary" onClick={() => openModal('dependency')}><FaPlus /> Añadir Dependencia</Button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {mapping.foreignKeyDependencies.map((dep, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 transition-all group">
                  <div>
                    <div className="font-bold text-slate-800">{dep.fieldName} <span className="text-slate-400 mx-2">→</span> {dep.dependentTable}</div>
                    <div className="text-xs text-slate-500 font-medium">Orden: {dep.executionOrder} | {dep.insertIfNotExists ? "Auto-Insertar" : "Validar"}</div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" className="bg-white p-2" onClick={() => openModal('dependency', dep, idx)}><FaEdit /></Button>
                    <Button variant="ghost" className="bg-white p-2 text-red-500 hover:bg-red-50" onClick={() => removeForeignKeyDependency(idx)}><FaTrash /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "tables" && (
          <div className="space-y-8">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Estructura de Tablas</h3>
                <p className="text-sm text-slate-500 mt-1">Mapee las tablas de origen con sus correspondientes en el destino.</p>
              </div>
              <Button variant="primary" onClick={() => openModal('table')}><FaPlus /> Añadir Tabla</Button>
            </div>
            
            {mapping.tableConfigs.map((table, tIdx) => {
              const totalFields = table.fieldMappings?.length || 0;
              const isExpanded = isTableExpanded(tIdx);
              const fieldsToShow = isExpanded ? totalFields : Math.min(INITIAL_FIELDS_SHOWN, totalFields);
              const hiddenFields = totalFields - fieldsToShow;
              
              return (
                <div key={tIdx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* TABLA HEADER */}
                  <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                        <FaTable size={20} />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          {table.name} 
                          {table.isDetailTable && <span className="px-2 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold uppercase rounded-full">Detalle</span>}
                        </h4>
                        <div className="text-xs text-slate-500 font-medium">
                          {table.sourceTable || 'Padre'} <span className="text-slate-300 mx-1">→</span> {table.targetTable} 
                          <span className="ml-3 text-primary-500">({totalFields} campos)</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="bg-white" onClick={() => openModal('field', null, { tIdx })}><FaPlus /> Campo</Button>
                      <Button variant="ghost" size="sm" className="bg-white" onClick={() => openModal('table', table, tIdx)}><FaEdit /></Button>
                      <Button variant="ghost" size="sm" className="bg-white text-red-500 hover:bg-red-50" onClick={() => removeTable(tIdx)}><FaTrash /></Button>
                    </div>
                  </div>

                  {/* TABLA FIELDS */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                          <th className="px-6 py-3 font-bold uppercase text-[10px] tracking-wider">Origen</th>
                          <th className="px-6 py-3 font-bold uppercase text-[10px] tracking-wider">Destino</th>
                          <th className="px-6 py-3 font-bold uppercase text-[10px] tracking-wider">Tipo</th>
                          <th className="px-6 py-3 font-bold uppercase text-[10px] tracking-wider">Config</th>
                          <th className="px-6 py-3 font-bold uppercase text-[10px] tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {table.fieldMappings?.slice(0, fieldsToShow).map((field, fIdx) => (
                          <tr key={fIdx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 text-slate-500 italic">{field.sourceField || "-"}</td>
                            <td className="px-6 py-3">
                              <span className="font-bold text-slate-700">{field.targetField}</span>
                              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                            </td>
                            <td className="px-6 py-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium">{field.fieldType}</span></td>
                            <td className="px-6 py-3">
                              <div className="flex gap-2">
                                {field.lookupFromTarget && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase">Lookup</span>}
                                {field.isConsecutive && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-bold uppercase"># Seq</span>}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <button className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all" title="Mapeos de valor" onClick={() => openModal('value', null, { tIdx, fIdx })}>
                                  <span className="text-[10px] font-bold mr-1">{field.valueMappings?.length || 0}</span><FaPlus size={10} />
                                </button>
                                <button className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all" onClick={() => openModal('field', field, { tIdx, fIdx })}>
                                  <FaEdit size={14} />
                                </button>
                                <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" onClick={() => removeFieldMapping(tIdx, fIdx)}>
                                  <FaTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalFields > INITIAL_FIELDS_SHOWN && (
                    <button 
                      onClick={() => toggleTableExpansion(tIdx)}
                      className="w-full py-3 bg-slate-50/50 text-slate-500 text-xs font-bold hover:bg-slate-100 transition-all flex justify-center items-center gap-2 border-t border-slate-100"
                    >
                      {isExpanded ? <><FaChevronUp /> Mostrar menos</> : <><FaChevronDown /> Mostrar {hiddenFields} campos más</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "workflow" && (
          <WorkflowConfigSection 
            mapping={mapping} 
            handleChange={handleChange} 
            accessToken={accessToken} 
          />
        )}
      </div>

      {/* MODALES */}
      <TableConfigModal
        isOpen={modalState.isOpen && modalState.type === 'table'}
        initialData={modalState.data}
        onClose={closeModal}
        onSave={(data) => modalState.data ? updateTable(modalState.extraInfo, data) : addTable(data)}
      />

      <FieldMappingModal
        isOpen={modalState.isOpen && modalState.type === 'field'}
        initialData={modalState.data}
        consecutives={consecutives}
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
    </div>
  );
}
