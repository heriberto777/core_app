import React, { useState, useEffect } from "react";
import {
  FaClock,
  FaSync,
  FaCheck,
  FaTimes,
  FaInfoCircle,
  FaShieldAlt,
  FaHistory,
  FaEye,
  FaTasks,
  FaEnvelope,
  FaListOl,
  FaCog,
  FaUser,
  FaCalendarCheck,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useAuth, ScheduleConfigButton, Button } from "../../index";
import { TransferTaskApi } from "../../api/index";

const cnnApi = new TransferTaskApi();

export function ScheduleConfiguration() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [scheduleConfig, setScheduleConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taskStats, setTaskStats] = useState({
    total: 0,
    automatic: 0,
    manual: 0,
    inactive: 0,
  });

  // Cargar configuración actual
  useEffect(() => {
    loadScheduleConfig();
    loadTaskStats();
  }, []);

  const loadScheduleConfig = async () => {
    try {
      const config = await cnnApi.getSchuledTime(accessToken);
      setScheduleConfig(config);
    } catch (error) {
      console.error("Error al cargar configuración:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskStats = async () => {
    try {
      const tasks = await cnnApi.getTasks(accessToken);
      const list = Array.isArray(tasks) ? tasks : [];
      setTaskStats({
        total: list.length,
        automatic: list.filter((t) => t.type === "auto" || t.type === "both").length,
        manual: list.filter((t) => t.type === "manual").length,
        inactive: list.filter((t) => !t.active).length,
      });
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
    }
  };

  const handleConfigSuccess = () => {
    // Recargar desde el backend en vez de confiar en el eco optimista del
    // modal: solo el backend sabe si el cron realmente quedó activo en
    // memoria (active/running), que es lo que el indicador de estado usa.
    loadScheduleConfig();
  };

  const getNextExecutionTime = () => {
    if (!scheduleConfig?.enabled || !scheduleConfig?.hour) {
      return "Programación desactivada";
    }

    const [hours, minutes] = scheduleConfig.hour.split(":").map(Number);
    const nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    if (nextRun < new Date()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const timeString = nextRun.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const dateString = nextRun.toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const timeUntil = Math.ceil((nextRun - new Date()) / (1000 * 60 * 60));

    return {
      time: timeString,
      date: dateString,
      hoursUntil:
        timeUntil > 24
          ? Math.floor(timeUntil / 24) + " días"
          : timeUntil + " horas",
    };
  };

  const nextExecution = getNextExecutionTime();
  // "SISTEMA ACTIVO" debe reflejar si el cron está realmente programado en
  // memoria ahora mismo (active), no solo el flag "enabled" guardado en
  // Mongo — ambos pueden divergir justo después de un reinicio del server.
  const isSchedulerActive = scheduleConfig?.active ?? scheduleConfig?.enabled;

  return (
    <div className="bg-white/50 backdrop-blur-xl border border-slate-200 rounded-xl p-8 flex flex-col gap-10 shadow-sm animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-100 pb-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <FaClock />
            </div>
            Programación Automática
          </h2>
          <p className="text-sm text-slate-500 font-medium ml-13">
            Configura la hora de ejecución automática y monitorea el estado del orquestador.
          </p>
        </div>
        <div className="sm:ml-auto">
          <ScheduleConfigButton onSuccess={handleConfigSuccess} />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4 opacity-50 animate-pulse">
          <FaSync className="text-3xl text-blue-600 animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Obteniendo configuración...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Status Card */}
          <div className={`p-8 rounded-xl border-l-8 bg-white shadow-sm flex flex-col gap-6 animate-in slide-in-from-left-4 duration-500 ${
            isSchedulerActive ? "border-emerald-500 shadow-emerald-500/5" : "border-red-500 shadow-red-500/5 opacity-80"
          }`}>
            <div className="flex items-center gap-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg ${
                isSchedulerActive ? "bg-emerald-500 shadow-emerald-500/20" : "bg-red-500 shadow-red-500/20"
              }`}>
                {isSchedulerActive ? <FaCheck /> : <FaTimes />}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Estado del Programador</span>
                <span className={`text-xl font-black ${isSchedulerActive ? "text-emerald-600" : "text-red-600"}`}>
                  {isSchedulerActive ? "SISTEMA ACTIVO" : "SISTEMA INACTIVO"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-50 ml-20">
              {isSchedulerActive ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hora Configurada</span>
                    <span className="text-sm font-black text-slate-900 bg-slate-50 px-3 py-1 rounded-lg w-fit">{scheduleConfig.hour}</span>
                  </div>
                  {typeof nextExecution === "object" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Próxima Ejecución</span>
                        <span className="text-sm font-black text-slate-900">{nextExecution.time} - {nextExecution.date}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tiempo Restante</span>
                        <span className="text-sm font-black text-emerald-600">{nextExecution.hoursUntil} aprox.</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="col-span-full">
                  <p className="text-xs font-bold text-slate-400 italic">
                    Las tareas automáticas están desactivadas. El sistema requiere intervención manual para disparar los procesos.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: "Total Tareas", val: taskStats.total, color: "blue", icon: <FaListOl /> },
              { label: "Automáticas", val: taskStats.automatic, color: "emerald", icon: <FaCog /> },
              { label: "Manuales", val: taskStats.manual, color: "amber", icon: <FaUser /> },
              { label: "Inactivas", val: taskStats.inactive, color: "red", icon: <FaTimes /> }
            ].map(stat => (
              <div key={stat.label} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-5 group hover:border-blue-200 transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-colors bg-${stat.color}-50 text-${stat.color}-500 group-hover:bg-${stat.color}-500 group-hover:text-white`}>
                  {stat.icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-slate-900 leading-none mb-1">{stat.val}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="p-8 bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col gap-6">
              <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-3">
                <FaInfoCircle /> Funcionamiento
              </h3>
              <ul className="flex flex-col gap-4">
                {[
                  { t: "Ejecución Diaria", d: "El sistema orquesta automáticamente todas las tareas 'Automáticas' a la hora definida." },
                  { t: "Criterios", d: "Solo se consideran tareas activas con tipo 'Automático' o 'Ambas'." },
                  { t: "Logs", d: "Cada disparo genera una traza detallada en el sistema de auditoría central." }
                ].map(item => (
                  <li key={item.t} className="flex gap-4">
                    <div className="min-w-[4px] h-4 mt-1 bg-blue-500 rounded-full" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-black text-slate-900">{item.t}</span>
                      <span className="text-xs text-slate-500 leading-relaxed">{item.d}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8 bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col gap-6">
              <h3 className="text-[11px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center gap-3">
                <FaShieldAlt /> Consideraciones
              </h3>
              <ul className="flex flex-col gap-4">
                {[
                  { t: "Recursos", d: "Evite programar ejecuciones pesadas en horas de alto tráfico operacional." },
                  { t: "Red", d: "Verifique que los túneles y bases de datos destino estén disponibles." },
                  { t: "Monitoreo", d: "Revise los logs semanalmente para asegurar la integridad de la sincronización." }
                ].map(item => (
                  <li key={item.t} className="flex gap-4">
                    <div className="min-w-[4px] h-4 mt-1 bg-amber-500 rounded-full" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-black text-slate-900">{item.t}</span>
                      <span className="text-xs text-slate-500 leading-relaxed">{item.d}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* History Section */}
          <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col gap-8">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                <FaHistory /> Últimas Ejecuciones
              </h3>
              <Button variant="ghost" className="text-blue-600 font-bold text-xs uppercase tracking-widest" onClick={() => navigate("/history")}>
                Ver Todo el Historial
              </Button>
            </div>

            {/* No existe todavía un endpoint que agregue el historial de
                ejecuciones automáticas across todas las tareas en un solo
                resumen — mostrar filas inventadas como si fueran datos
                reales era engañoso. El detalle real por tarea sí existe en
                el Centro de Auditoría. */}
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
              <FaHistory className="text-3xl opacity-30" />
              <p className="text-xs font-bold text-center max-w-sm">
                El resumen agregado de ejecuciones automáticas aún no está disponible aquí.
                Consulta el detalle completo por tarea en el Centro de Auditoría.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-8 bg-slate-50/50 border border-slate-100 rounded-xl flex flex-col gap-6">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Acciones Rápidas</h3>
            <div className="flex gap-4 flex-wrap">
              <Button variant="ghost" className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm" onClick={() => navigate("/history")}>
                <FaEye className="mr-2" /> Ver Logs
              </Button>
              <Button variant="ghost" className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm" onClick={() => navigate("/tasks")}>
                <FaTasks className="mr-2" /> Gestionar Tareas
              </Button>
              <Button variant="ghost" className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm" onClick={() => navigate("/configuraciones")}>
                <FaEnvelope className="mr-2" /> Config. Email
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
