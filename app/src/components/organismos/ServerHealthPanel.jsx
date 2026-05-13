import React from "react";
import { FaMicrochip, FaDatabase, FaWifi } from "react-icons/fa";

/**
 * Corporate ServerHealthPanel (Tailwind Edition)
 */
export function ServerHealthPanel({ status, className = "" }) {
  const servers = [
    { name: "Servidor Principal (S1)", id: "server1", icon: <FaMicrochip /> },
    { name: "Servidor Espejo (S2)", id: "server2", icon: <FaWifi /> },
    { name: "Base de Datos (NoSQL)", id: "mongodb", icon: <FaDatabase /> },
  ];

  const getStatusColor = (s) => {
    if (s === "online") return "bg-emerald-500 shadow-emerald-500/50";
    if (s === "offline") return "bg-red-500 shadow-red-500/50";
    if (s === "warning") return "bg-amber-500";
    return "bg-slate-400";
  };

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-6 flex flex-col gap-5 shadow-md flex-1 ${className}`}>
      <h3 className="m-0 text-base font-extrabold flex items-center gap-2.5 text-slate-800 pb-3">
        <FaWifi className="text-primary-500" /> Salud de la Infraestructura
      </h3>
      <div className="flex flex-col gap-4">
        {servers.map(s => {
          const sData = status[s.id] || { status: 'unknown' };
          return (
            <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-2xl border border-slate-200/40">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(sData.status)} ${sData.status === 'online' ? 'animate-pulse' : ''}`} />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {sData.status === 'online' ? `Conectado - Latencia: ${sData.responseTime || 0}ms` :
                      sData.status === 'offline' ? 'Sin respuesta del host' : 'Estado: ' + sData.status}
                  </span>
                </div>
              </div>
              <div className="text-slate-300 opacity-30">{s.icon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}