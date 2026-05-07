import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSync, FaLink, FaLayerGroup } from "react-icons/fa";
import { TransferTaskApi } from "../../api/TransferTaskApi";

const taskApi = new TransferTaskApi();

export function ProcessingStatusModal({ isOpen, taskId, accessToken, mappingName, onFinished }) {
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState("");
    const [status, setStatus] = useState("running");

    useEffect(() => {
        let interval;
        if (isOpen && taskId && taskId !== "undefined") {
            setCurrentStep(mappingName || "Iniciando proceso...");
            
            // Polling para obtener el estado real del proceso
            interval = setInterval(async () => {
                try {
                    const response = await taskApi.getTaskStatusById(accessToken, taskId);
                    if (response && response.success) {
                        const task = response.data;
                        setProgress(task.progress || 0);
                        if (task.currentStep) setCurrentStep(task.currentStep);
                        setStatus(task.status);
                        
                        if (task.status === "completed" || task.status === "failed") {
                            clearInterval(interval);
                            if (onFinished && task.lastProcessingResult) {
                                setTimeout(() => onFinished(task.lastProcessingResult), 500);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error polling task status:", error);
                }
            }, 1500);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isOpen, taskId, accessToken, mappingName]);

    if (!isOpen) return null;

    return (
        <ModalOverlay>
            <StatusCard>
                <Header>
                    <IconWrapper>
                        <FaSync className="spinning" />
                    </IconWrapper>
                    <TitleContainer>
                        <h3>Procesamiento en Curso</h3>
                        <p>Por favor, no cierre la ventana hasta finalizar.</p>
                    </TitleContainer>
                </Header>

                <ProgressSection>
                    <StepIndicator>
                        <FaLayerGroup size={14} />
                        <span>Ejecutando: <strong>{currentStep}</strong></span>
                    </StepIndicator>
                    
                    <ProgressBarContainer>
                        <ProgressBar $width={progress} />
                        <ProgressLabel>{progress}%</ProgressLabel>
                    </ProgressBarContainer>
                    
                    <WorkflowBadges>
                        <Badge $active={true}><FaLink /> Workflow Activo</Badge>
                        <Badge $active={progress > 99}>Sincronización ERP</Badge>
                    </WorkflowBadges>
                </ProgressSection>

                <FooterMessage>
                    El sistema está transfiriendo datos y validando consecutivos en tiempo real.
                </FooterMessage>
            </StatusCard>
        </ModalOverlay>
    );
}

const ModalOverlay = styled.div`
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 3000;
`;

const StatusCard = styled.div`
    background: ${({ theme }) => theme.cardBg};
    width: 90%; max-width: 450px;
    padding: 30px; border-radius: 24px;
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadows.premium};
    animation: zoomIn 0.3s ease-out;

    @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
`;

const Header = styled.div`
    display: flex; align-items: center; gap: 20px; margin-bottom: 30px;
`;

const IconWrapper = styled.div`
    width: 50px; height: 50px; border-radius: 15px;
    background: ${({ theme }) => theme.primary}20;
    color: ${({ theme }) => theme.primary};
    display: flex; align-items: center; justify-content: center; font-size: 24px;

    .spinning { animation: spin 2s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const TitleContainer = styled.div`
    h3 { margin: 0; font-size: 18px; font-weight: 800; color: ${({ theme }) => theme.title}; }
    p { margin: 4px 0 0; font-size: 13px; color: ${({ theme }) => theme.textSecondary}; }
`;

const ProgressSection = styled.div`
    display: flex; flex-direction: column; gap: 15px;
`;

const StepIndicator = styled.div`
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.bg2}60;
    padding: 10px 15px; border-radius: 12px;
    
    strong { color: ${({ theme }) => theme.primary}; }
`;

const ProgressBarContainer = styled.div`
    height: 12px; background: ${({ theme }) => theme.border}40;
    border-radius: 10px; overflow: hidden; position: relative;
`;

const ProgressBar = styled.div`
    height: 100%; background: linear-gradient(90deg, ${({ theme }) => theme.primary}, #60a5fa);
    width: ${({ $width }) => $width}%;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
`;

const ProgressLabel = styled.div`
    position: absolute; right: 10px; top: -20px;
    font-size: 11px; font-weight: 800; color: ${({ theme }) => theme.primary};
`;

const WorkflowBadges = styled.div`
    display: flex; gap: 10px; margin-top: 5px;
`;

const Badge = styled.div`
    font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 6px;
    display: flex; align-items: center; gap: 5px;
    background: ${({ $active, theme }) => $active ? theme.primary + '20' : theme.border + '20'};
    color: ${({ $active, theme }) => $active ? theme.primary : theme.textSecondary};
`;

const FooterMessage = styled.div`
    margin-top: 30px; text-align: center;
    font-size: 12px; color: ${({ theme }) => theme.textSecondary}; font-style: italic;
    opacity: 0.7;
`;
