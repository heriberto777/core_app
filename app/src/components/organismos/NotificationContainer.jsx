import React from 'react';
import { useNotification } from '../../index';
import { FaTimes, FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaExclamationTriangle } from "react-icons/fa";

/**
 * Corporate NotificationContainer (Tailwind Edition)
 * Sistema de notificaciones flotantes con diseño moderno.
 */
export const NotificationContainer = () => {
  const { notifications, hideNotification } = useNotification();

  const icons = {
    success: <FaCheckCircle className="text-emerald-500" />,
    error: <FaExclamationCircle className="text-red-500" />,
    warning: <FaExclamationTriangle className="text-amber-500" />,
    info: <FaInfoCircle className="text-primary-500" />
  };

  const variants = {
    success: "bg-emerald-50 border-emerald-100 text-emerald-900 shadow-emerald-900/5",
    error: "bg-red-50 border-red-100 text-red-900 shadow-red-900/5",
    warning: "bg-amber-50 border-amber-100 text-amber-900 shadow-amber-900/5",
    info: "bg-primary-50 border-primary-100 text-primary-900 shadow-primary-900/5"
  };

  return (
    <div className="fixed top-24 right-6 z-[10000] pointer-events-none flex flex-col gap-3 items-end">
      {notifications.map(notification => (
        <div 
          key={notification.id} 
          className={`
            pointer-events-auto flex items-start gap-4 p-4 rounded-2xl border shadow-xl min-w-[320px] max-w-[450px]
            animate-slideInRight transition-all duration-300
            ${variants[notification.type] || variants.info}
          `}
        >
          <div className="text-xl mt-0.5">
            {icons[notification.type] || icons.info}
          </div>
          
          <div className="flex-1 flex flex-col gap-1">
            <div className="text-sm font-extrabold leading-tight">
              {notification.message}
            </div>
            {notification.actionLabel && notification.onAction && (
              <button 
                onClick={() => notification.onAction(notification.id)}
                className="text-[11px] font-bold uppercase tracking-widest mt-1 hover:underline text-primary-600 w-fit"
              >
                {notification.actionLabel}
              </button>
            )}
          </div>

          <button 
            onClick={() => hideNotification(notification.id)}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-lg transition-all"
          >
            <FaTimes size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};