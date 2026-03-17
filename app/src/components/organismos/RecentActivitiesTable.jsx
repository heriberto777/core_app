import React from "react";
import styled from "styled-components";
import { FaHistory, FaArrowRight } from "react-icons/fa";
import { Link } from "react-router-dom";
import { StatusBadge, Button } from "../../index";

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.medium}; grid-column: 1 / -1;
`;

const Header = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 2px solid ${({ theme }) => theme.primary}20; padding-bottom: 12px;
`;

const Title = styled.h3` margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px; color: ${({ theme }) => theme.title}; `;

const TableWrapper = styled.div` overflow-x: auto; `;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  th { padding: 16px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: ${({ theme }) => theme.textSecondary}; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  td { padding: 16px; border-bottom: 1px solid ${({ theme }) => theme.border}40; color: ${({ theme }) => theme.text}; }
  tr:hover { background: ${({ theme }) => theme.bg2}10; }
  tr:last-child td { border-bottom: none; }
`;

export function RecentActivitiesTable({ transfers }) {
    return (
        <Card>
            <Header>
                <Title><FaHistory color="var(--primary)" /> Últimas Actividades</Title>
                <Link to="/historys" style={{ textDecoration: 'none' }}>
                    <Button variant="ghost" size="small">Ver Historial Completo <FaArrowRight /></Button>
                </Link>
            </Header>
            <TableWrapper>
                <Table>
                    <thead>
                        <tr>
                            <th>Tarea de Transferencia</th>
                            <th>Fecha y Hora</th>
                            <th>Registros</th>
                            <th>Estado Operativo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transfers.length > 0 ? transfers.map((tx, idx) => (
                            <tr key={tx.id || idx}>
                                <td style={{ fontWeight: 700 }}>{tx.name}</td>
                                <td>{new Date(tx.date).toLocaleString()}</td>
                                <td>{tx.totalRecords}</td>
                                <td><StatusBadge status={tx.status}>{tx.status}</StatusBadge></td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', opacity: 0.5, fontStyle: 'italic' }}>
                                    No hay registros de transferencias recientes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </TableWrapper>
        </Card>
    );
}
