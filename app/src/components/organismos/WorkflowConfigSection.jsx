import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaPlus, FaTrash, FaLink, FaArrowRight, FaCogs } from "react-icons/fa";
import { Button } from "../../index";
import { MappingApi } from "../../api/index";

const api = new MappingApi();

const WorkflowConfigSection = ({ mapping = {}, handleChange, accessToken }) => {
  const [allMappings, setAllMappings] = useState([]);
  const [loading, setLoading] = useState(false);

  const workflowConfig = mapping.workflowConfig || { enabled: false, nextMappings: [], stopWorkflowOnError: true };

  useEffect(() => {
    const fetchMappings = async () => {
      try {
        setLoading(true);
        const response = await api.getMappings(accessToken);
        setAllMappings(response.filter(m => m._id !== mapping._id)); // Evitar circularidad simple
      } catch (error) {
        console.error("Error fetching mappings for workflow:", error);
      } finally {
        setLoading(false);
      }
    };
    if (accessToken) fetchMappings();
  }, [accessToken, mapping._id]);

  const handleToggleWorkflow = (e) => {
    handleChange({
      target: {
        name: "workflowConfig.enabled",
        value: e.target.checked,
        checked: e.target.checked,
        type: "checkbox"
      }
    });
  };

  const handleToggleStopOnError = (e) => {
    handleChange({
      target: {
        name: "workflowConfig.stopWorkflowOnError",
        value: e.target.checked,
        checked: e.target.checked,
        type: "checkbox"
      }
    });
  };

  const addNextMapping = () => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings.push({
      mappingId: "",
      linkField: "",
      description: "",
      autoExecute: true,
      executionOrder: nextMappings.length
    });
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  const removeNextMapping = (index) => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings.splice(index, 1);
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  const updateNextMapping = (index, field, value) => {
    const nextMappings = [...(workflowConfig.nextMappings || [])];
    nextMappings[index] = { ...nextMappings[index], [field]: value };
    
    handleChange({
      target: {
        name: "workflowConfig.nextMappings",
        value: nextMappings,
        type: "custom"
      }
    });
  };

  return (
    <SectionContainer>
      <SectionHeader>
        <div className="title">
          <FaLink /> Flujo de Trabajo (Workflow)
        </div>
        <p>Configure procesos automáticos que se disparan después de procesar exitosamente este mapping.</p>
      </SectionHeader>

      <ControlRow>
        <CheckboxLabel>
          <input 
            type="checkbox" 
            checked={workflowConfig.enabled} 
            onChange={handleToggleWorkflow} 
          />
          Habilitar Encadenamiento Automático
        </CheckboxLabel>

        <CheckboxLabel>
          <input 
            type="checkbox" 
            checked={workflowConfig.stopWorkflowOnError} 
            onChange={handleToggleStopOnError} 
          />
          Detener workflow si ocurre un error
        </CheckboxLabel>
      </ControlRow>

      {workflowConfig.enabled && (
        <WorkflowBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>Mappings Seguidores</h4>
            <Button variant="primary" onClick={addNextMapping} style={{ padding: '6px 12px', fontSize: '12px' }}>
              <FaPlus /> Añadir Paso
            </Button>
          </div>

          <StepsList>
            {(workflowConfig.nextMappings || []).map((step, idx) => (
              <StepCard key={idx}>
                <StepHeader>
                  <div className="order">Paso {idx + 1}</div>
                  <Button variant="ghost" $danger onClick={() => removeNextMapping(idx)} style={{ padding: '4px' }}>
                    <FaTrash />
                  </Button>
                </StepHeader>
                
                <StepGrid>
                  <div className="field">
                    <label>Mapping a Disparar</label>
                    <select 
                      value={step.mappingId} 
                      onChange={(e) => updateNextMapping(idx, 'mappingId', e.target.value)}
                    >
                      <option value="">Seleccione un proceso...</option>
                      {allMappings.map(m => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Campo de Enlace (Link Field)</label>
                    <input 
                      type="text" 
                      placeholder="Ej: NUM_FACT" 
                      value={step.linkField} 
                      onChange={(e) => updateNextMapping(idx, 'linkField', e.target.value)}
                    />
                    <small>Nombre de la columna en el mapping hijo que referencia al padre.</small>
                  </div>

                  <div className="field">
                    <label>Campo Origen en Padre (Valor de Búsqueda)</label>
                    <input 
                      type="text" 
                      placeholder="Ej: NCF (Deje vacío para PK)" 
                      value={step.parentLinkField || ""} 
                      onChange={(e) => updateNextMapping(idx, 'parentLinkField', e.target.value)}
                    />
                    <small>Campo del Padre que contiene el valor a buscar en el Hijo.</small>
                  </div>


                  <div className="field">
                    <label>Descripción del Paso</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Generar Recibos" 
                      value={step.description} 
                      onChange={(e) => updateNextMapping(idx, 'description', e.target.value)}
                    />
                  </div>

                  <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={step.autoExecute} 
                      onChange={(e) => updateNextMapping(idx, 'autoExecute', e.target.checked)}
                    />
                    <label style={{ marginBottom: 0 }}>Ejecución Automática</label>
                  </div>
                </StepGrid>
                
                <VisualLink>
                  <FaArrowRight /> {allMappings.find(m => m._id === step.mappingId)?.name || "..."}
                </VisualLink>
              </StepCard>
            ))}

            {(!workflowConfig.nextMappings || workflowConfig.nextMappings.length === 0) && (
              <EmptyState>
                <FaCogs size={30} opacity={0.3} />
                <p>No hay pasos configurados. Añada un mapping para iniciar la cadena.</p>
              </EmptyState>
            )}
          </StepsList>
        </WorkflowBody>
      )}
    </SectionContainer>
  );
};

// --- Styled Components ---

const SectionContainer = styled.div`
  background: ${({ theme }) => theme.bg2}10;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border};
  padding: 24px;
  margin-top: 20px;
`;

const SectionHeader = styled.div`
  margin-bottom: 20px;
  .title {
    font-size: 18px; font-weight: 700; color: ${({ theme }) => theme.title};
    display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  }
  p { font-size: 13px; color: ${({ theme }) => theme.textSecondary}; margin: 0; }
`;

const ControlRow = styled.div`
  display: flex; gap: 30px; margin-bottom: 20px; padding-bottom: 20px;
  border-bottom: 1px solid ${({ theme }) => theme.border}50;
`;

const CheckboxLabel = styled.label`
  display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px;
  cursor: pointer;
  input { width: 18px; height: 18px; cursor: pointer; }
`;

const WorkflowBody = styled.div`
  animation: fadeIn 0.3s ease-out;
`;

const StepsList = styled.div`
  display: flex; flex-direction: column; gap: 16px;
`;

const StepCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  padding: 16px;
  position: relative;
  transition: border-color 0.2s;
  &:hover { border-color: ${({ theme }) => theme.primary}; }
`;

const StepHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 15px;
  .order { font-size: 12px; font-weight: 800; text-transform: uppercase; color: ${({ theme }) => theme.primary}; }
`;

const StepGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;
  
  .field {
    display: flex; flex-direction: column; gap: 6px;
    label { font-size: 12px; font-weight: 700; color: ${({ theme }) => theme.textSecondary}; }
    input, select {
      padding: 8px 12px; border-radius: 8px; border: 1px solid ${({ theme }) => theme.border};
      background: ${({ theme }) => theme.bg}; color: ${({ theme }) => theme.text};
      font-size: 13px;
    }
    small { font-size: 10px; opacity: 0.6; }
  }
`;

const VisualLink = styled.div`
  margin-top: 15px; padding-top: 10px; border-top: 1px dotted ${({ theme }) => theme.border};
  display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;
  color: ${({ theme }) => theme.primary};
`;

const EmptyState = styled.div`
  padding: 40px; text-align: center; color: ${({ theme }) => theme.textSecondary};
  background: ${({ theme }) => theme.bg}40; border-radius: 12px; border: 1px dashed ${({ theme }) => theme.border};
  p { margin-top: 10px; font-size: 13px; }
`;

export default WorkflowConfigSection;