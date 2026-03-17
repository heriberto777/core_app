import React from "react";
import styled from "styled-components";
import { FaEye, FaPlay, FaCheckCircle, FaRegCircle } from "react-icons/fa";
import { StatusBadge, Button } from "../../index";

const Grid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;
  padding: 10px 0;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px;
  border: 1px solid ${({ theme, $selected }) => $selected ? theme.primary : theme.border};
  box-shadow: ${({ theme, $selected }) => $selected ? theme.shadows.premium : theme.shadows.medium};
  display: flex; flex-direction: column; overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  &:hover { transform: translateY(-4px); box-shadow: ${({ theme }) => theme.shadows.premium}; }
`;

const CardHeader = styled.div`
  padding: 20px; border-bottom: 1px solid ${({ theme }) => theme.border}40;
  display: flex; justify-content: space-between; align-items: center;
  background: ${({ theme, $status }) => {
        if (!$status) return 'transparent';
        const s = $status.toUpperCase();
        if (s === 'F') return '#28a74510';
        if (s === 'A') return '#dc354510';
        return '#17a2b810';
    }};
`;

const CardBody = styled.div`
  padding: 20px; display: flex; flex-direction: column; gap: 12px; flex: 1;
`;

const InfoRow = styled.div`
  display: flex; justify-content: space-between; font-size: 13px;
`;

const InfoLabel = styled.span` color: ${({ theme }) => theme.textSecondary}; font-weight: 600; `;
const InfoValue = styled.span` font-weight: 700; color: ${({ theme }) => theme.text}; `;

const CardFooter = styled.div`
  padding: 16px 20px; background: ${({ theme }) => theme.bg2}20; border-top: 1px solid ${({ theme }) => theme.border}40;
  display: flex; justify-content: space-between; align-items: center;
`;

const SelectionOverlay = styled.div`
  position: absolute; top: 12px; left: 12px; cursor: pointer; z-index: 5;
  color: ${({ theme, $selected }) => $selected ? theme.primary : theme.textSecondary + '40'};
  transition: all 0.2s;
  &:hover { transform: scale(1.1); }
`;

export function OrdersCardsGrid({
    data,
    selectedIds,
    onSelect,
    onViewDetails,
    onProcess
}) {
    if (!data || data.length === 0) return null;

    const idField = Object.keys(data[0])[0];

    return (
        <Grid>
            {data.map((order, idx) => {
                const orderId = order[idField];
                const isSelected = selectedIds.includes(orderId);
                const statusField = Object.keys(order).find(k => k.toLowerCase().includes('estado') || k.toLowerCase().includes('status'));
                const status = statusField ? order[statusField] : null;

                return (
                    <Card key={orderId || idx} $selected={isSelected} $status={status}>
                        <SelectionOverlay $selected={isSelected} onClick={() => onSelect(orderId)}>
                            {isSelected ? <FaCheckCircle size={20} /> : <FaRegCircle size={20} />}
                        </SelectionOverlay>

                        <CardHeader $status={status}>
                            <div style={{ paddingLeft: '24px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 800 }}>{orderId}</div>
                                <div style={{ fontSize: '11px', opacity: 0.6 }}>ID Documento</div>
                            </div>
                            <StatusBadge status={status}>{status}</StatusBadge>
                        </CardHeader>

                        <CardBody>
                            {Object.entries(order)
                                .filter(([key]) => key !== idField && key !== statusField)
                                .slice(0, 5) // Mostrar solo los primeros 5 campos para no saturar
                                .map(([key, value]) => (
                                    <InfoRow key={key}>
                                        <InfoLabel>{key}</InfoLabel>
                                        <InfoValue>{value !== null ? value : "—"}</InfoValue>
                                    </InfoRow>
                                ))}
                        </CardBody>

                        <CardFooter>
                            <Button variant="ghost" size="small" onClick={() => onViewDetails(order)} title="Ver Detalle">
                                <FaEye /> Detalles
                            </Button>
                            <Button variant="primary" size="small" onClick={() => onProcess(orderId)}>
                                <FaPlay /> Procesar
                            </Button>
                        </CardFooter>
                    </Card>
                );
            })}
        </Grid>
    );
}
