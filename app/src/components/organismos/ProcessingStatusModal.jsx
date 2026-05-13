import React, { useState, useEffect } from "react";
import { FaSync, FaLink, FaLayerGroup, FaArrowRight } from "react-icons/fa";
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
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[3000] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[480px] p-10 rounded-[32px] border border-slate-100 shadow-2xl flex flex-col gap-10 animate-in zoom-in-95 duration-500 overflow-hidden relative">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50" />
                
                <div className="flex items-center gap-6 relative z-10">
                    <div className="w-16 h-16 bg-blue-600 rounded-[22px] flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
                        <FaSync className="text-2xl animate-spin" style={{ animationDuration: '3s' }} />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="text-xl font-black text-slate-900 leading-tight">Procesamiento en Curso</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronización Bidireccional Activa</p>
                    </div>
                </div>

                <div className="space-y-8 relative z-10">
                    <div className="flex items-center gap-4 bg-slate-50/80 border border-slate-100 p-4 rounded-2xl">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                            <FaLayerGroup className="text-xs" />
                        </div>
                        <div className="flex flex-col truncate">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paso Actual</span>
                            <span className="text-sm font-black text-slate-900 truncate">{currentStep}</span>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-end px-1">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Progreso de Tarea</span>
                            <span className="text-xl font-black text-slate-900 leading-none">{progress}%</span>
                        </div>
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
                            <div 
                                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-1000 ease-out relative"
                                style={{ width: `${progress}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-blue-100 shadow-sm">
                            <FaLink className="text-[8px]" /> Workflow Activo
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all duration-500 ${
                            progress > 95 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-300 border-slate-100"
                        }`}>
                            ERP Link {progress > 95 && "✓"}
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-slate-50 text-center relative z-10">
                    <p className="text-xs font-bold text-slate-400 italic leading-relaxed">
                        El sistema está transfiriendo datos y validando la integridad de los consecutivos en tiempo real. Por favor, mantenga esta ventana abierta.
                    </p>
                </div>
            </div>
        </div>
    );
}
