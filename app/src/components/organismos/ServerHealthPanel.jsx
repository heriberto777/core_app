import React from "react";
import styled from "styled-components";
import { FaMicrochip, FaDatabase, FaWifi } from "react-icons/fa";

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.medium}; flex: 1;
`;

const Title = styled.h3`
  margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px;
  color: ${({ theme }) => theme.titleColor}; padding-bottom: 12px;
`;

const StatusList = styled.div` display: flex; flex-direction: column; gap: 16px; `;

const StatusItem = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: ${({ theme }) => theme.bg2}10; border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border}40;
`;

const ServerInfo = styled.div` display: flex; align-items: center; gap: 12px; `;

const StatusIndicator = styled.div`
  width: 10px; height: 10px; border-radius: 50%;
  background: ${({ $status }) => {
    if ($status === "online") return "#10b981";
    if ($status === "offline") return "#ef4444";
    if ($status === "warning") return "#f59e0b";
    return "#64748b";
  }};
  box-shadow: 0 0 8px ${({ $status }) => {
    if ($status === "online") return "#10b98180";
    if ($status === "offline") return "#ef444480";
    return "transparent";
  }};
  position: relative;
  &::after {
    content: ''; position: absolute; inset: -4px; border-radius: 50%;
    border: 2px solid ${({ $status }) => $status === "online" ? "#10b98140" : "transparent"};
    animation: ${props => props.$status === "online" ? "pulse 2s infinite" : "none"};
  }
  @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
`;

const ServerText = styled.div` display: flex; flex-direction: column; `;
const ServerName = styled.span` font-size: 14px; font-weight: 700; `;
const ServerDetails = styled.span` font-size: 11px; color: ${({ theme }) => theme.textSecondary}; `;

export function ServerHealthPanel({ status }) {
  const servers = [
    { name: "Servidor Principal (S1)", id: "server1", icon: <FaMicrochip /> },
    { name: "Servidor Espejo (S2)", id: "server2", icon: <FaWifi /> },
    { name: "Base de Datos (NoSQL)", id: "mongodb", icon: <FaDatabase /> },
  ];

  return (
    <Card>
      <Title><FaWifi color="var(--primary)" /> Salud de la Infraestructura</Title>
      <StatusList>
        {servers.map(s => {
          const sData = status[s.id] || { status: 'unknown' };
          return (
            <StatusItem key={s.id}>
              <ServerInfo>
                <StatusIndicator $status={sData.status} />
                <ServerText>
                  <ServerName>{s.name}</ServerName>
                  <ServerDetails>
                    {sData.status === 'online' ? `Conectado - Latencia: ${sData.responseTime || 0}ms` :
                      sData.status === 'offline' ? 'Sin respuesta del host' : 'Estado: ' + sData.status}
                  </ServerDetails>
                </ServerText>
              </ServerInfo>
              <div style={{ color: 'var(--textSecondary)', opacity: 0.3 }}>{s.icon}</div>
            </StatusItem>
          );
        })}
      </StatusList>
    </Card>
  );
}
