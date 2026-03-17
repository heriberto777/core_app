import React from "react";
import styled from "styled-components";
import { FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaCheck, FaTimes, FaUserCircle } from "react-icons/fa";
import { StatusBadge, Button } from "../index";

const TableContainer = styled.div`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 16px 24px;
  background: rgba(248, 250, 252, 0.5);
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
`;

const Tr = styled.tr`
  border-bottom: 1px solid rgba(0, 0, 0, 0.03);
  transition: all 0.2s;
  ${props => !props.active && `opacity: 0.6;`}

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

const Td = styled.td`
  padding: 18px 24px;
  font-size: 14px;
  color: #1e293b;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Avatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 18px;
`;

const NotifBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  background: ${props => props.enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(241, 245, 249, 0.8)"};
  color: ${props => props.enabled ? "#10b981" : "#94a3b8"};
  margin-right: 6px;
`;

export const RecipientsTable = ({
    recipients = [],
    loading,
    onEdit,
    onDelete,
    onToggle
}) => {
    if (loading && recipients.length === 0) {
        return <div style={{ textAlign: 'center', padding: '60px', opacity: 0.7 }}>Cargando destinatarios...</div>;
    }

    return (
        <TableContainer>
            <div style={{ overflowX: 'auto' }}>
                <Table>
                    <thead>
                        <tr>
                            <Th>Miembo / Usuario</Th>
                            <Th>Tipos de Alerta</Th>
                            <Th>Estado Envío</Th>
                            <Th style={{ textAlign: 'right' }}>Acciones</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {recipients.length === 0 ? (
                            <tr>
                                <td colSpan="4" style={{ padding: '60px', textAlign: 'center', opacity: 0.6 }}>
                                    No se han configurado destinatarios para notificaciones.
                                </td>
                            </tr>
                        ) : (
                            recipients.map(r => (
                                <Tr key={r._id} active={r.isSend}>
                                    <Td>
                                        <UserInfo>
                                            <Avatar><FaUserCircle /></Avatar>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 700 }}>{r.name}</span>
                                                <span style={{ fontSize: '12px', opacity: 0.7 }}>{r.email}</span>
                                            </div>
                                        </UserInfo>
                                    </Td>
                                    <Td>
                                        <NotifBadge enabled={r.notificationTypes?.traspaso}>
                                            {r.notificationTypes?.traspaso ? <FaCheck /> : <FaTimes />} TRASPASOS
                                        </NotifBadge>
                                        <NotifBadge enabled={r.notificationTypes?.transferencias}>
                                            {r.notificationTypes?.transferencias ? <FaCheck /> : <FaTimes />} TRANSFERENCIAS
                                        </NotifBadge>
                                        <NotifBadge enabled={r.notificationTypes?.erroresCriticos}>
                                            {r.notificationTypes?.erroresCriticos ? <FaCheck /> : <FaTimes />} ERRORES
                                        </NotifBadge>
                                    </Td>
                                    <Td>
                                        <StatusBadge variant={r.isSend ? "success" : "danger"}>
                                            {r.isSend ? "ACTIVO" : "SUSPENDIDO"}
                                        </StatusBadge>
                                    </Td>
                                    <Td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <Button variant="ghost" size="small" onClick={() => onEdit(r)} title="Editar">
                                                <FaEdit />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="small"
                                                onClick={() => onToggle(r._id, r.isSend, r.name)}
                                                title={r.isSend ? "Pausar Envíos" : "Activar Envíos"}
                                            >
                                                {r.isSend ? <FaToggleOn style={{ color: '#f59e0b' }} /> : <FaToggleOff />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="small"
                                                onClick={() => onDelete(r._id, r.name)}
                                                title="Eliminar"
                                                style={{ color: '#ef4444' }}
                                            >
                                                <FaTrash />
                                            </Button>
                                        </div>
                                    </Td>
                                </Tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>
        </TableContainer>
    );
};
