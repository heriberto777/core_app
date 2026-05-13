import React, { useState } from "react";
import { useAuth } from "../../index";
import { TransferTaskApi } from "../../api/index";
import Swal from "sweetalert2";
import { FaCog, FaPlay, FaPause, FaClock, FaInfoCircle, FaCalendarAlt } from "react-icons/fa";

const cnnApi = new TransferTaskApi();

// Estilos Premium para SweetAlert2 (inyectados vía Tailwind en el HTML)
const scheduleManagerStyles = `
  .swal2-popup.premium-modal {
    border-radius: 32px !important;
    padding: 2rem !important;
  }
  .swal2-title.premium-title {
    font-weight: 900 !important;
    font-size: 1.5rem !important;
    color: #0f172a !important;
    letter-spacing: -0.025em !important;
  }
`;

export function ScheduleConfigButton({ disabled = false, onSuccess }) {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const openScheduleModal = async () => {
    setLoading(true);
    try {
      const response = await cnnApi.getSchuledTime(accessToken);
      const currentHour = response?.hour || "02:00";
      const currentEnabled = response?.enabled !== false;
      showConfigModal(currentHour, currentEnabled, accessToken, onSuccess);
    } catch (error) {
      console.error("Error fetching schedule config:", error);
      showConfigModal("02:00", true, accessToken, onSuccess);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
        onClick={openScheduleModal} 
        disabled={disabled || loading}
        className="ml-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FaCog className={loading ? "animate-spin" : ""} /> {loading ? "Cargando..." : "Configuración Avanzada"}
    </button>
  );
}

export function openScheduleConfigModal(accessToken, onSuccess) {
  if (!accessToken) return;
  cnnApi.getSchuledTime(accessToken).then((response) => {
    showConfigModal(response?.hour || "02:00", response?.enabled !== false, accessToken, onSuccess);
  }).catch(() => {
    showConfigModal("02:00", true, accessToken, onSuccess);
  });
}

function showConfigModal(initialTime, initialEnabled, accessToken, onSuccess) {
    let modalTime = initialTime;
    let modalEnabled = initialEnabled;

    const getNextExecutionDisplay = () => {
      if (!modalEnabled) return "Ejecución deshabilitada";
      const [hours, minutes] = modalTime.split(":").map(Number);
      const nextRun = new Date();
      nextRun.setHours(hours, minutes, 0, 0);
      if (nextRun < new Date()) nextRun.setDate(nextRun.getDate() + 1);
      
      const formattedTime = nextRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const formattedDate = nextRun.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
      return `${formattedTime} • ${formattedDate}`;
    };

    const generateHTML = () => `
      <div class="text-left space-y-8 mt-6">
        <div class="flex items-center justify-between p-6 bg-slate-50 rounded-[24px] border border-slate-100">
            <div class="flex flex-col gap-1">
                <span class="text-sm font-black text-slate-900">Estado del Planificador</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activar ejecución automática diaria</span>
            </div>
            <button id="toggleScheduler" class="px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm ${modalEnabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}">
              ${modalEnabled ? '<i class="fas fa-play"></i> Activado' : '<i class="fas fa-pause"></i> Pausado'}
            </button>
        </div>

        <div class="space-y-4">
            <div class="flex items-center gap-2 px-2">
                <i class="fas fa-clock text-indigo-500 text-xs"></i>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora de ejecución automática</span>
            </div>
            <input
              id="timeInput"
              type="time"
              value="${modalTime}"
              ${!modalEnabled ? "disabled" : ""}
              class="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-xl font-black text-center focus:outline-none focus:border-indigo-500 transition-all ${!modalEnabled ? "opacity-30 grayscale cursor-not-allowed" : ""}"
            />
        </div>

        <div class="p-6 rounded-[24px] border border-indigo-100 bg-indigo-50/30 flex items-start gap-4">
            <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-600/20">
                <i class="fas fa-calendar-alt"></i>
            </div>
            <div class="flex flex-col gap-1">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Próxima Sincronización</span>
                <span id="nextRunDisplay" class="text-lg font-black text-indigo-900">${getNextExecutionDisplay()}</span>
                <p id="scheduleDesc" class="text-[10px] font-bold text-indigo-600 leading-relaxed mt-1">
                    ${modalEnabled ? 'Las tareas automáticas se procesarán en la ventana de mantenimiento definida.' : 'El procesamiento automático está inactivo.'}
                </p>
            </div>
        </div>

        <div class="flex gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <i class="fas fa-info-circle text-amber-500 mt-0.5"></i>
            <p class="text-[10px] font-bold text-amber-800 leading-relaxed uppercase tracking-tight">
                El motor solo ejecutará tareas marcadas como "Automático" o "Ambas". Las manuales requieren intervención del operador.
            </p>
        </div>
      </div>
    `;

    Swal.fire({
      title: "Programación de Tareas",
      html: generateHTML(),
      width: 550,
      showCancelButton: true,
      confirmButtonText: "Guardar Configuración",
      cancelButtonText: "Cancelar",
      showLoaderOnConfirm: true,
      customClass: {
          popup: 'rounded-[32px] p-8',
          title: 'text-2xl font-black text-slate-900',
          confirmButton: 'px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-black transition-all border-none ml-2',
          cancelButton: 'px-10 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] border-none mr-2'
      },
      buttonsStyling: false,
      didOpen: (popup) => {
        const timeInput = popup.querySelector("#timeInput");
        const toggleButton = popup.querySelector("#toggleScheduler");
        const nextRunDisplay = popup.querySelector("#nextRunDisplay");
        const scheduleDesc = popup.querySelector("#scheduleDesc");

        timeInput?.addEventListener("change", (e) => {
          modalTime = e.target.value;
          if (nextRunDisplay) nextRunDisplay.textContent = getNextExecutionDisplay();
        });

        toggleButton?.addEventListener("click", () => {
          modalEnabled = !modalEnabled;
          toggleButton.className = `px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm ${modalEnabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`;
          toggleButton.innerHTML = modalEnabled ? '<i class="fas fa-play"></i> Activado' : '<i class="fas fa-pause"></i> Pausado';
          
          if (timeInput) {
              timeInput.disabled = !modalEnabled;
              timeInput.className = `w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-xl font-black text-center focus:outline-none focus:border-indigo-500 transition-all ${!modalEnabled ? "opacity-30 grayscale cursor-not-allowed" : ""}`;
          }
          if (nextRunDisplay) nextRunDisplay.textContent = getNextExecutionDisplay();
          if (scheduleDesc) scheduleDesc.textContent = modalEnabled ? 'Las tareas automáticas se procesarán en la ventana de mantenimiento definida.' : 'El procesamiento automático está inactivo.';
        });
      },
      preConfirm: async () => {
        try {
          const result = await cnnApi.addTimeTransfer(accessToken, { hour: modalTime, enabled: modalEnabled });
          if (result) return { success: true, hour: modalTime, enabled: modalEnabled };
          throw new Error("Error en servidor");
        } catch (error) {
          Swal.showValidationMessage(error.message);
          return { success: false };
        }
      },
    }).then((result) => {
      if (result.isConfirmed && result.value?.success) {
        Swal.fire("Configurado", "Se ha actualizado la ventana de ejecución.", "success");
        if (onSuccess) onSuccess(result.value);
      }
    });
}
