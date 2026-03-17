import React from "react";
import styled from "styled-components";
import { FaDatabase, FaTimes, FaSearch } from "react-icons/fa";
import { Modal, Button } from "../../index";

const Content = styled.div`
  display: flex; flex-direction: column; gap: 20px; overflow: hidden; max-height: 70vh;
`;

const TableContainer = styled.div`
  overflow-y: auto; border-radius: 16px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bg2}10;
`;

const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  thead { position: sticky; top: 0; z-index: 10; background: ${({ theme }) => theme.cardBg}; }
  th { padding: 12px 16px; text-align: left; font-weight: 800; text-transform: uppercase; font-size: 11px; color: ${({ theme }) => theme.textSecondary}; border-bottom: 2px solid ${({ theme }) => theme.border}; }
  td { padding: 12px 16px; border-bottom: 1px solid ${({ theme }) => theme.border}20; color: ${({ theme }) => theme.text}; font-family: monospace; }
  tr:hover { background: ${({ theme }) => theme.bg2}20; }
  tr:last-child td { border-bottom: none; }
`;

const Empty = styled.div` padding: 40px; text-align: center; opacity: 0.5; font-style: italic; `;

export function SourceDataViewerModal({ isOpen, onClose, data }) {
    if (!isOpen) return null;

    const dataEntries = data ? Object.entries(data) : [];

    return (
        <Modal isOpen={isOpen} onClose={onClose} width="800px">
            <div style={{ padding: '24px' }}>
                <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FaDatabase color="var(--primary)" /> Inspección de Datos Fuente (DB)
                </h2>

                <Content>
                    {dataEntries.length > 0 ? (
                        <TableContainer>
                            <Table>
                                <thead>
                                    <tr>
                                        <th>Columna Origen</th>
                                        <th>Valor Actual en Tabla</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dataEntries.map(([key, val]) => (
                                        <tr key={key}>
                                            <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{key}</td>
                                            <td>{val !== null && val !== undefined ? String(val) : <em>N/A (Null)</em>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Empty>No hay datos de origen cargados para este registro.</Empty>
                    )}
                </Content>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <Button variant="secondary" onClick={onClose} icon={<FaTimes />}>Cerrar Inspector</Button>
                </div>
            </div>
        </Modal>
    );
}
