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
    success: "bg-emerald-50 dark:bg-emerald-900/40 border-emerald-100 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 shadow-emerald-900/5",
    error: "bg-red-50 dark:bg-red-900/40 border-red-100 dark:border-red-800 text-red-900 dark:text-red-200 shadow-red-900/5",
    warning: "bg-amber-50 dark:bg-amber-900/40 border-amber-100 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-amber-900/5",
    info: "bg-primary-50 dark:bg-primary-900/40 border-primary-100 dark:border-primary-800 text-primary-900 dark:text-primary-200 shadow-primary-900/5"
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
            className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-900/30 rounded-lg transition-all"
          >
            <FaTimes size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};