import React from "react";
import styled from "styled-components";
import { FaEdit, FaTrash, FaEye, FaToggleOn, FaToggleOff, FaCrown } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const TableContainer = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 20px;
  text-align: left;
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid #f1f5f9;
`;

const Tr = styled.tr`
  transition: all 0.2s;
  &:hover {
    background: rgba(248, 250, 252, 0.5);
  }
`;

const Td = styled.td`
  padding: 16px 20px;
  font-size: 14px;
  color: #1e293b;
  border-bottom: 1px solid #f1f5f9;
`;

const UserCell = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Avatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: ${props => props.isAdmin ? "#f39c1220" : "#3b82f620"};
  color: ${props => props.isAdmin ? "#f39c12" : "#3b82f6"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 16px;
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  
  .name {
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .role {
    font-size: 12px;
    color: #64748b;
  }
`;

const RoleGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const RoleTag = styled.span`
  padding: 2px 8px;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 8px;
`;

export const UsersTable = ({ data, onEdit, onDelete, onToggleStatus, onView, currentUserId }) => {
    return (
        <TableContainer>
            <Table>
                <thead>
                    <tr>
                        <Th>Usuario</Th>
                        <Th>Email / Contacto</Th>
                        <Th>Roles</Th>
                        <Th>Estado</Th>
                        <Th>Acciones</Th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((user) => (
                        <Tr key={user._id}>
                            <Td>
                                <UserCell>
                                    <Avatar isAdmin={user.isAdmin}>
                                        {user.name?.charAt(0)}
                                    </Avatar>
                                    <Info>
                                        <div className="name">
                                            {user.name} {user.lastname}
                                            {user.isAdmin && <FaCrown size={12} title="Administrador de Sistema" />}
                                        </div>
                                        <div className="role">ID: {user._id}</div>
                                    </Info>
                                </UserCell>
                            </Td>
                            <Td>
                                <div style={{ fontWeight: 600 }}>{user.email}</div>
                                <div style={{ fontSize: '12px', opacity: 0.7 }}>{user.telefono || 'Sin teléfono'}</div>
                            </Td>
                            <Td>
                                <RoleGrid>
                                    {user.roles?.map(r => (
                                        <RoleTag key={r._id}>{r.displayName}</RoleTag>
                                    ))}
                                    {!user.roles?.length && <span style={{ opacity: 0.6, fontSize: '12px' }}>Sin roles</span>}
                                </RoleGrid>
                            </Td>
                            <Td>
                                <StatusBadge variant={user.activo ? "success" : "danger"}>
                                    {user.activo ? "Activo" : "Inactivo"}
                                </StatusBadge>
                            </Td>
                            <Td>
                                <ActionGroup>
                                    <Button variant="ghost" size="small" onClick={() => onView(user)}>
                                        <FaEye />
                                    </Button>
                                    <Button variant="ghost" size="small" onClick={() => onEdit(user)}>
                                        <FaEdit />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="small"
                                        color={user.activo ? "#f59e0b" : "#10b981"}
                                        onClick={() => onToggleStatus(user._id, user.activo)}
                                    >
                                        {user.activo ? <FaToggleOn /> : <FaToggleOff />}
                                    </Button>
                                    {user._id !== currentUserId && (
                                        <Button variant="ghost" size="small" color="#ef4444" onClick={() => onDelete(user)}>
                                            <FaTrash />
                                        </Button>
                                    )}
                                </ActionGroup>
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </Table>
        </TableContainer>
    );
};
