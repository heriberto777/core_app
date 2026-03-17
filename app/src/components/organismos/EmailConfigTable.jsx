import React from "react";
import styled from "styled-components";
import {
    FaEdit, FaTrash, FaToggleOn, FaToggleOff,
    FaStar, FaVial, FaServer, FaEnvelope, FaLock, FaUnlock
} from "react-icons/fa";
import { Button } from "../../index";

const Container = styled.div`
  width: 100%; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.cardBg}; overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

const TableWrapper = styled.div` overflow-x: auto; `;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  th { padding: 16px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bg2}10; }
  td { padding: 16px; border-bottom: 1px solid ${({ theme }) => theme.border}40; color: ${({ theme }) => theme.text}; vertical-align: middle; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
  tr:last-child td { border-bottom: none; }
  tr.disabled { opacity: 0.6; }
`;

const ConfigName = styled.div`
  display: flex; align-items: center; gap: 8px; font-weight: 800;
  svg { color: #f59e0b; }
`;

const InfoItem = styled.div`
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${({ theme }) => theme.textSecondary};
  svg { opacity: 0.5; }
`;

const Badge = styled.span`
  padding: 4px 8px; border-radius: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase;
  background: ${({ $bg }) => $bg}15; color: ${({ $bg }) => $bg}; border: 1px solid ${({ $bg }) => $bg}30;
`;

const StatusChip = styled.div`
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
  color: ${({ $active }) => $active ? "#10b981" : "#ef4444"};
`;

const Actions = styled.div` display: flex; gap: 8px; `;

export function EmailConfigTable({ configs, onEdit, onDelete, onToggle, onSetDefault, onTest }) {
    return (
        <Container>
            <TableWrapper>
                <Table>
                    <thead>
                        <tr>
                            <th>Nombre de Configuración</th>
                            <th>Host & Puerto</th>
                            <th>Cuenta/Usuario</th>
                            <th>Seguridad</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {configs.length > 0 ? configs.map(config => (
                            <tr key={config._id} className={!config.isActive ? "disabled" : ""}>
                                <td>
                                    <ConfigName>
                                        {config.isDefault && <FaStar title="Predeterminada" />}
                                        {config.name}
                                    </ConfigName>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <InfoItem><FaServer /> {config.host}</InfoItem>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <Badge $bg="#64748b">Port: {config.port}</Badge>
                                            {config.isDefault && <Badge $bg="#f59e0b">Default</Badge>}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <InfoItem><FaEnvelope /> {config.auth?.user}</InfoItem>
                                </td>
                                <td>
                                    {config.secure ?
                                        <Badge $bg="#10b981"><FaLock size={10} /> SSL/TLS</Badge> :
                                        <Badge $bg="#ef4444"><FaUnlock size={10} /> No Seguro</Badge>
                                    }
                                </td>
                                <td>
                                    <StatusChip $active={config.isActive}>
                                        {config.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                                        {config.isActive ? "ACTIVA" : "INACTIVA"}
                                    </StatusChip>
                                </td>
                                <td>
                                    <Actions>
                                        <Button variant="ghost" size="small" onClick={() => onEdit(config)} icon={<FaEdit />} title="Editar" />
                                        <Button variant="ghost" size="small" onClick={() => onTest(config)} icon={<FaVial />} title="Enviar Prueba" color="#17a2b8" />
                                        {!config.isDefault && (
                                            <Button variant="ghost" size="small" onClick={() => onSetDefault(config)} icon={<FaStar />} title="Hacer Predeterminada" color="#f59e0b" />
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="small"
                                            onClick={() => onToggle(config)}
                                            icon={config.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                            title={config.isActive ? "Desactivar" : "Activar"}
                                            color={config.isActive ? "#f97316" : "#10b981"}
                                        />
                                        <Button variant="ghost" size="small" onClick={() => onDelete(config)} icon={<FaTrash />} title="Eliminar" color="#ef4444" />
                                    </Actions>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '60px', opacity: 0.5, fontStyle: 'italic' }}>
                                    No se han encontrado configuraciones de email.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </TableWrapper>
        </Container>
    );
}
