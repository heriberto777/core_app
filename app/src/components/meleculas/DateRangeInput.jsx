import React, { useState } from 'react';
import { FaCalendarAlt, FaExchangeAlt } from 'react-icons/fa';

/**
 * Corporate DateRangeInput (Tailwind Edition)
 */
export const DateRangeInput = ({
  label,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minDate,
  maxDate,
  disabled = false,
  required = false,
  showQuickActions = true,
  error = null,
  helpText = null,
  placeholder = { start: 'Fecha inicio', end: 'Fecha fin' },
  className = "",
  ...props
}) => {
  const [localError, setLocalError] = useState(null);

  const validateDates = (start, end) => {
    if (!start || !end) return null;

    const startDateObj = new Date(start);
    const endDateObj = new Date(end);

    if (startDateObj > endDateObj) {
      return 'La fecha de inicio debe ser anterior a la fecha de fin';
    }

    if (minDate && startDateObj < new Date(minDate)) {
      return `La fecha de inicio no puede ser anterior a ${new Date(minDate).toLocaleDateString()}`;
    }

    if (maxDate && endDateObj > new Date(maxDate)) {
      return `La fecha de fin no puede ser posterior a ${new Date(maxDate).toLocaleDateString()}`;
    }

    return null;
  };

  const handleStartDateChange = (value) => {
    setLocalError(null);
    onStartDateChange?.(value);
    const validationError = validateDates(value, endDate);
    setLocalError(validationError);
  };

  const handleEndDateChange = (value) => {
    setLocalError(null);
    onEndDateChange?.(value);
    const validationError = validateDates(startDate, value);
    setLocalError(validationError);
  };

  const quickActions = [
    {
      label: 'Hoy',
      action: () => {
        const today = new Date().toISOString().split('T')[0];
        handleStartDateChange(today);
        handleEndDateChange(today);
      }
    },
    {
      label: 'Ayer',
      action: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        handleStartDateChange(dateStr);
        handleEndDateChange(dateStr);
      }
    },
    {
      label: 'Esta semana',
      action: () => {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        handleStartDateChange(startOfWeek.toISOString().split('T')[0]);
        handleEndDateChange(today.toISOString().split('T')[0]);
      }
    },
    {
      label: 'Este mes',
      action: () => {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        handleStartDateChange(startOfMonth.toISOString().split('T')[0]);
        handleEndDateChange(today.toISOString().split('T')[0]);
      }
    },
    {
      label: 'Últimos 30 días',
      action: () => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        handleStartDateChange(thirtyDaysAgo.toISOString().split('T')[0]);
        handleEndDateChange(today.toISOString().split('T')[0]);
      }
    }
  ];

  const displayError = error || localError;
  const hasError = Boolean(displayError);

  const inputClass = `
    w-full px-3 py-2 pr-9 border rounded-md text-sm text-slate-800 bg-white transition-all duration-200
    focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
    disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
    ${hasError ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-300"}
  `;

  return (
    <div className={`flex flex-col gap-2 ${className}`} {...props}>
      {label && (
        <label className="text-sm font-medium text-slate-700 mb-1">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center sm:grid-cols-1 sm:gap-2">
        <div className="relative flex items-center">
          <input
            type="date"
            value={startDate || ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            min={minDate}
            max={endDate || maxDate}
            disabled={disabled}
            required={required}
            placeholder={placeholder.start}
            className={inputClass}
          />
          <div className="absolute right-3 text-slate-400 pointer-events-none text-sm">
            <FaCalendarAlt />
          </div>
        </div>

        <div className="flex items-center justify-center text-slate-500 text-xs font-medium sm:rotate-90">
          <FaExchangeAlt />
        </div>

        <div className="relative flex items-center">
          <input
            type="date"
            value={endDate || ''}
            onChange={(e) => handleEndDateChange(e.target.value)}
            min={startDate || minDate}
            max={maxDate}
            disabled={disabled}
            required={required}
            placeholder={placeholder.end}
            className={inputClass}
          />
          <div className="absolute right-3 text-slate-400 pointer-events-none text-sm">
            <FaCalendarAlt />
          </div>
        </div>
      </div>

      {showQuickActions && !disabled && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={action.action}
              type="button"
              className="px-2 py-1 border border-slate-200 bg-white text-slate-500 text-xs rounded cursor-pointer transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-600"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {displayError && <div className="text-xs text-red-500 mt-1">{displayError}</div>}
      {helpText && !hasError && <div className="text-xs text-slate-500 mt-1">{helpText}</div>}
    </div>
  );
};