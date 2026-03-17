import React, { useState } from "react";
import styled from "styled-components";
import {
    FaCog,
    FaEdit,
    FaTrash,
    FaCopy,
    FaToggleOn,
    FaToggleOff,
    FaShieldAlt,
    FaLayerGroup,
    FaChevronDown,
    FaChevronUp,
    FaCubes
} from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 24px;
`;

const ModuleCard = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid ${props => props.isSystem ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.3)"};
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const IconBox = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 15px;
  background: ${props => props.isSystem ? "#eff6ff" : "#f8fafc"};
  color: ${props => props.isSystem ? "#3b82f6" : "#64748b"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
`;

const MainInfo = styled.div`
  h3 {
    font-size: 17px;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  p {
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
  }
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  
  span {
    color: #475569;
  }
`;

const ActionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ActionHeader = styled.div`
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  justify-content: space-between;
  cursor: pointer;
`;

const ActionsBadgeList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ActionBadge = styled.span`
  padding: 4px 10px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
`;

const ControlBar = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

export const ModulesTable = ({ data, onEdit, onDelete, onDuplicate, onToggleStatus }) => {
    const [expanded, setExpanded] = useState({});

    const toggleExpand = (id) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <Grid>
            {data.map(module => (
                <ModuleCard key={module._id} isSystem={module.isSystem}>
                    <Header>
                        <IconBox isSystem={module.isSystem}>
                            <FaCog />
                        </IconBox>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {module.isSystem && <StatusBadge variant="primary">SISTEMA</StatusBadge>}
                            <StatusBadge variant={module.isActive ? "success" : "danger"}>
                                {module.isActive ? "ACTIVO" : "INACTIVO"}
                            </StatusBadge>
                        </div>
                    </Header>

                    <MainInfo>
                        <h3>{module.displayName}</h3>
                        <p>{module.description || "Módulo base del ecosistema CORE."}</p>
                        <code style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>SLUG: {module.name}</code>
                    </MainInfo>

                    <MetaGrid>
                        <MetaItem>
                            <FaLayerGroup />
                            <span>{module.uiConfig?.category?.toUpperCase() || "OTROS"}</span>
                        </MetaItem>
                        <MetaItem>
                            <FaCubes />
                            <span>ORDEN: {module.uiConfig?.order || 0}</span>
                        </MetaItem>
                    </MetaGrid>

                    <ActionsSection>
                        <ActionHeader onClick={() => toggleExpand(module._id)}>
                            Capacidades Disponibles ({module.actions?.length || 0})
                            {expanded[module._id] ? <FaChevronUp /> : <FaChevronDown />}
                        </ActionHeader>
                        {expanded[module._id] && (
                            <ActionsBadgeList>
                                {module.actions?.map(action => {
                                    const actionLabel = typeof action === 'string' ? action : (action.displayName || action.name);
                                    const actionKey = typeof action === 'string' ? action : (action._id || action.name);
                                    return <ActionBadge key={actionKey}>{actionLabel}</ActionBadge>;
                                })}
                            </ActionsBadgeList>
                        )}
                    </ActionsSection>

                    <ControlBar>
                        <Button variant="ghost" size="small" onClick={() => onEdit(module)}>
                            <FaEdit />
                        </Button>
                        <Button variant="ghost" size="small" onClick={() => onDuplicate(module)}>
                            <FaCopy />
                        </Button>
                        <Button
                            variant="ghost"
                            size="small"
                            color={module.isActive ? "#f59e0b" : "#10b981"}
                            onClick={() => onToggleStatus(module)}
                        >
                            {module.isActive ? <FaToggleOn /> : <FaToggleOff />}
                        </Button>
                        {!module.isSystem && (
                            <Button variant="ghost" size="small" color="#ef4444" onClick={() => onDelete(module)}>
                                <FaTrash />
                            </Button>
                        )}
                    </ControlBar>
                </ModuleCard>
            ))}
        </Grid>
    );
};
