import React from "react";
import styled from "styled-components";
import { FaCalendarAlt, FaClock } from "react-icons/fa";
import { ScheduleConfigButton } from "../../index";

const Card = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.medium}; flex: 1;
`;

const Title = styled.h3`
  margin: 0; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px;
  color: ${({ theme }) => theme.title}; border-bottom: 2px solid ${({ theme }) => theme.primary}20; padding-bottom: 12px;
`;

const NextRunInfo = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 20px 0; gap: 10px; background: ${({ theme }) => theme.bg2}10; border-radius: 20px;
  border: 1px dashed ${({ theme }) => theme.border};
`;

const TimeValue = styled.div`
  font-size: 42px; font-weight: 900; color: ${({ theme }) => theme.primary}; letter-spacing: -1px;
`;

const DateValue = styled.div`
  font-size: 15px; font-weight: 700; color: ${({ theme }) => theme.text}; text-transform: capitalize;
`;

const Details = styled.div`
  font-size: 12px; color: ${({ theme }) => theme.textSecondary}; text-align: center; max-width: 200px;
`;

const Footer = styled.div` display: flex; justify-content: center; padding-top: 10px; `;

export function SchedulerPanel({ nextRun, onConfigSuccess, loading }) {
    return (
        <Card>
            <Title><FaCalendarAlt color="var(--primary)" /> Programación Automática</Title>
            <NextRunInfo>
                <TimeValue>
                    {nextRun ? nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                </TimeValue>
                <DateValue>
                    {nextRun ? nextRun.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : "Sin programación activa"}
                </DateValue>
                <Details><FaClock /> Ejecución global de todas las tareas activas configuradas.</Details>
            </NextRunInfo>
            <Footer>
                <ScheduleConfigButton disabled={loading} onSuccess={onConfigSuccess} />
            </Footer>
        </Card>
    );
}
