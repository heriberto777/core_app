import React, { useState } from "react";
import styled from "styled-components";
import { FaTimes, FaFileAlt, FaTable } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 900px; height: 90vh;
  border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 24px; border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2}20;
  display: flex; justify-content: space-between; align-items: center;
`;

const Body = styled.div`
  flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 32px;
`;

const Section = styled.div`
  display: flex; flex-direction: column; gap: 16px;
`;

const SectionTitle = styled.h4`
  margin: 0; font-size: 16px; color: ${({ theme }) => theme.primary};
  display: flex; align-items: center; gap: 10px;
  text-transform: uppercase; letter-spacing: 1px;
`;

const HeaderGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;
  padding: 20px; background: ${({ theme }) => theme.bg2}10; border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border};
`;

const InfoItem = styled.div`
  display: flex; flex-direction: column; gap: 4px;
`;

const InfoLabel = styled.div`
  font-size: 11px; font-weight: 700; color: ${({ theme }) => theme.textSecondary}; text-transform: uppercase;
`;

const InfoValue = styled.div`
  font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.text};
`;

const TableContainer = styled.div`
  overflow-x: auto; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
`;

const StyledTable = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  thead { background: ${({ theme }) => theme.bg2}40; }
  th { padding: 12px 16px; text-align: left; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; }
  td { padding: 12px 16px; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: ${({ theme }) => theme.bg2}20; }
`;

export function DocumentDetailsModal({ isOpen, onClose, document, details }) {
    if (!isOpen || !document) return null;

    // Extraer todas las tablas de detalle
    const detailTables = details?.details ? Object.keys(details.details) : [];

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: 0 }}>Detalles del Documento</h3>
                        <span style={{ fontSize: '13px', opacity: 0.7 }}>ID Interno: {Object.values(document)[0]}</span>
                    </div>
                    <Button variant="ghost" onClick={onClose} style={{ padding: '8px' }}><FaTimes /></Button>
                </Header>

                <Body>
                    <Section>
                        <SectionTitle><FaFileAlt /> Información de Encabezado</SectionTitle>
                        <HeaderGrid>
                            {Object.entries(document).map(([key, value]) => (
                                <InfoItem key={key}>
                                    <InfoLabel>{key}</InfoLabel>
                                    <InfoValue>
                                        {typeof value === 'boolean'
                                            ? <StatusBadge status={value ? 'active' : 'inactive'}>{value ? 'SÍ' : 'NO'}</StatusBadge>
                                            : value !== null && value !== undefined ? String(value) : "N/A"}
                                    </InfoValue>
                                </InfoItem>
                            ))}
                        </HeaderGrid>
                    </Section>

                    {detailTables.map(tableName => {
                        const tableData = details.details[tableName];
                        if (!tableData || tableData.length === 0) return null;

                        // Obtener columnas dinámicas (excluyendo metadatos internos con _)
                        const columns = Object.keys(tableData[0]).filter(k => !k.startsWith('_'));

                        return (
                            <Section key={tableName}>
                                <SectionTitle><FaTable /> Tabla: {tableName}</SectionTitle>
                                <TableContainer>
                                    <StyledTable>
                                        <thead>
                                            <tr>
                                                {columns.map(col => <th key={col}>{col}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.map((row, idx) => (
                                                <tr key={idx}>
                                                    {columns.map(col => (
                                                        <td key={col}>{row[col] !== null && row[col] !== undefined ? String(row[col]) : "N/A"}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </StyledTable>
                                </TableContainer>
                            </Section>
                        );
                    })}

                    {detailTables.length === 0 && (
                        <div style={{ textAlign: 'center', opacity: 0.5, padding: '40px' }}>
                            <p>No se encontraron registros asociados a este documento.</p>
                        </div>
                    )}
                </Body>
                <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" onClick={onClose}>Cerrar</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
