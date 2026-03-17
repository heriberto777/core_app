import React from "react";
import styled from "styled-components";
import { FaShieldAlt, FaUsers, FaCrown, FaEdit, FaTrash, FaCopy, FaToggleOn, FaToggleOff } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
`;

const RoleCard = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid ${props => props.isSystem ? "rgba(243, 156, 18, 0.3)" : "rgba(255, 255, 255, 0.3)"};
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-4px);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const IconWrapper = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: ${props => props.isSystem ? "#fff7ed" : "#f1f5f9"};
  color: ${props => props.isSystem ? "#f39c12" : "#3b82f6"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
`;

const RoleInfo = styled.div`
  h3 {
    font-size: 16px;
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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  border-top: 1px solid #f1f5f9;
  padding-top: 16px;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  
  svg {
    color: #94a3b8;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
`;

export const RolesTable = ({ data, onEdit, onDelete, onDuplicate, onToggleStatus, onViewUsers }) => {
    return (
        <Grid>
            {data.map(role => (
                <RoleCard key={role._id} isSystem={role.isSystem}>
                    <CardHeader>
                        <IconWrapper isSystem={role.isSystem}>
                            {role.isSystem ? <FaCrown /> : <FaShieldAlt />}
                        </IconWrapper>
                        <StatusBadge variant={role.isActive ? "success" : "danger"}>
                            {role.isActive ? "ACTIVO" : "INACTIVO"}
                        </StatusBadge>
                    </CardHeader>

                    <RoleInfo>
                        <h3>{role.displayName}</h3>
                        <p>{role.description || "Sin descripción asignada."}</p>
                        <code style={{ fontSize: '11px', opacity: 0.6 }}>ID: {role.name}</code>
                    </RoleInfo>

                    <StatsGrid>
                        <StatItem>
                            <FaUsers />
                            <span>{role.userCount || 0} Usuarios</span>
                        </StatItem>
                        <StatItem>
                            <FaShieldAlt />
                            <span>{role.permissions?.length || 0} Recursos</span>
                        </StatItem>
                    </StatsGrid>

                    <Actions>
                        <Button variant="ghost" size="small" onClick={() => onViewUsers(role)}>
                            <FaUsers />
                        </Button>
                        <Button variant="ghost" size="small" onClick={() => onEdit(role)}>
                            <FaEdit />
                        </Button>
                        <Button variant="ghost" size="small" onClick={() => onDuplicate(role)}>
                            <FaCopy />
                        </Button>
                        <Button
                            variant="ghost"
                            size="small"
                            color={role.isActive ? "#f59e0b" : "#10b981"}
                            onClick={() => onToggleStatus(role._id, role.isActive)}
                        >
                            {role.isActive ? <FaToggleOn /> : <FaToggleOff />}
                        </Button>
                        {!role.isSystem && role.userCount === 0 && (
                            <Button variant="ghost" size="small" color="#ef4444" onClick={() => onDelete(role)}>
                                <FaTrash />
                            </Button>
                        )}
                    </Actions>
                </RoleCard>
            ))}
        </Grid>
    );
};
