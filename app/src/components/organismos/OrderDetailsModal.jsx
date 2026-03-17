import React from "react";
import styled from "styled-components";
import { FaTimes, FaBoxOpen, FaInfoCircle, FaListUl } from "react-icons/fa";
import { Button, StatusBadge } from "../../index";

const ModalOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.cardBg};
  width: 95%; max-width: 900px; max-height: 90vh;
  border-radius: 28px; border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadows.premium};
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.3s ease-out;
`;

const Header = styled.div`
  padding: 24px 32px; border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme }) => theme.bg2}20;
`;

const Body = styled.div`
  padding: 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 32px;
`;

const Section = styled.div`
  display: flex; flex-direction: column; gap: 16px;
`;

const SectionTitle = styled.h4`
  margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  color: ${({ theme }) => theme.primary}; display: flex; align-items: center; gap: 10px;
`;

const HeaderGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;
  padding: 20px; background: ${({ theme }) => theme.bg2}10; border-radius: 20px; border: 1px solid ${({ theme }) => theme.border}40;
`;

const InfoBox = styled.div`
  display: flex; flex-direction: column; gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 11px; font-weight: 800; color: ${({ theme }) => theme.textSecondary}; text-transform: uppercase;
`;

const InfoValue = styled.span`
  font-size: 14px; font-weight: 700; color: ${({ theme }) => theme.text};
`;

const TableContainer = styled.div`
  border-radius: 16px; border: 1px solid ${({ theme }) => theme.border}; overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.small};
`;

const ScrollableTable = styled.div`
  overflow-x: auto; max-height: 400px; overflow-y: auto;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 12px;
  thead { position: sticky; top: 0; background: ${({ theme }) => theme.bg2}; z-index: 5; }
  th { padding: 12px 16px; text-align: left; color: ${({ theme }) => theme.textSecondary}; border-bottom: 1px solid ${({ theme }) => theme.border}; }
  td { padding: 12px 16px; border-bottom: 1px solid ${({ theme }) => theme.border}40; }
  tr:last-child td { border-bottom: none; }
`;

export function OrderDetailsModalOrg({ isOpen, onClose, documentId, orderData, detailsData }) {
    if (!isOpen || !documentId) return null;

    // Flatten details from all possible detail tables
    const allDetailRows = [];
    if (detailsData?.data?.details) {
        Object.values(detailsData.data.details).forEach(tableItems => {
            if (Array.isArray(tableItems)) {
                allDetailRows.push(...tableItems);
            }
        });
    }

    // Get first row to define columns
    const columns = allDetailRows.length > 0 ? Object.keys(allDetailRows[0]) : [];

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <Header>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaBoxOpen size={24} color="var(--primary)" />
                        <div>
                            <h3 style={{ margin: 0 }}>Detalle de Documento</h3>
                            <span style={{ fontSize: '12px', opacity: 0.6 }}>ID: <strong>{documentId}</strong></span>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={onClose}><FaTimes /></Button>
                </Header>

                <Body>
                    {orderData && (
                        <Section>
                            <SectionTitle><FaInfoCircle /> Información de Encabezado</SectionTitle>
                            <HeaderGrid>
                                {Object.entries(orderData).map(([key, value]) => (
                                    <InfoBox key={key}>
                                        <InfoLabel>{key}</InfoLabel>
                                        <InfoValue>
                                            {key.toLowerCase().includes('estado') ? (
                                                <StatusBadge status={value}>{value}</StatusBadge>
                                            ) : (
                                                value !== null ? value : "—"
                                            )}
                                        </InfoValue>
                                    </InfoBox>
                                ))}
                            </HeaderGrid>
                        </Section>
                    )}

                    <Section>
                        <SectionTitle><FaListUl /> Partidas / Detalles</SectionTitle>
                        <TableContainer>
                            <ScrollableTable>
                                <Table>
                                    <thead>
                                        <tr>
                                            {columns.map(col => <th key={col}>{col}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allDetailRows.map((row, idx) => (
                                            <tr key={idx}>
                                                {columns.map(col => (
                                                    <td key={col}>{row[col] !== null ? row[col] : "—"}</td>
                                                ))}
                                            </tr>
                                        ))}
                                        {allDetailRows.length === 0 && (
                                            <tr>
                                                <td colSpan={100} style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>
                                                    No hay líneas de detalle disponibles para este documento.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </ScrollableTable>
                        </TableContainer>
                    </Section>
                </Body>

                <div style={{ padding: '24px 32px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="primary" onClick={onClose}>Entendido</Button>
                </div>
            </ModalContent>
        </ModalOverlay>
    );
}
