// src/components/moleculas/DateRangeInput.jsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { FaCalendarAlt, FaExchangeAlt } from 'react-icons/fa';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
`;

const RangeContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const DateInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const DateInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  padding-right: 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  background: white;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  &:invalid {
    border-color: #ef4444;
  }

  ${({ hasError }) => hasError && `
    border-color: #ef4444;
    &:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }
  `}
`;

const DateIcon = styled.div`
  position: absolute;
  right: 10px;
  color: #9ca3af;
  pointer-events: none;
  font-size: 14px;
`;

const Separator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;

  @media (max-width: 480px) {
    transform: rotate(90deg);
  }
`;

const QuickActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
`;

const QuickButton = styled.button`
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
    color: #374151;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
`;

const HelpText = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
`;

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
  ...props
}) => {
  const [localError, setLocalError] = useState(null);

  // Validaciones
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

    // Validar después del cambio
    const validationError = validateDates(value, endDate);
    setLocalError(validationError);
  };

  const handleEndDateChange = (value) => {
    setLocalError(null);
    onEndDateChange?.(value);

    // Validar después del cambio
    const validationError = validateDates(startDate, value);
    setLocalError(validationError);
  };

  // Acciones rápidas
  const getQuickActions = () => [
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

  return (
    <Container {...props}>
      {label && (
        <Label>
          {label}
          {required && <span style={{ color: '#ef4444' }}> *</span>}
        </Label>
      )}

      <RangeContainer>
        <DateInputWrapper>
          <DateInput
            type="date"
            value={startDate || ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            min={minDate}
            max={endDate || maxDate}
            disabled={disabled}
            required={required}
            hasError={hasError}
            placeholder={placeholder.start}
          />
          <DateIcon>
            <FaCalendarAlt />
          </DateIcon>
        </DateInputWrapper>

        <Separator>
          <FaExchangeAlt />
        </Separator>

        <DateInputWrapper>
          <DateInput
            type="date"
            value={endDate || ''}
            onChange={(e) => handleEndDateChange(e.target.value)}
            min={startDate || minDate}
            max={maxDate}
            disabled={disabled}
            required={required}
            hasError={hasError}
            placeholder={placeholder.end}
          />
          <DateIcon>
            <FaCalendarAlt />
          </DateIcon>
        </DateInputWrapper>
      </RangeContainer>

      {/* Acciones rápidas */}
      {showQuickActions && !disabled && (
        <QuickActions>
          {getQuickActions().map((action, index) => (
            <QuickButton
              key={index}
              onClick={action.action}
              type="button"
            >
              {action.label}
            </QuickButton>
          ))}
        </QuickActions>
      )}

      {/* Mensajes */}
      {displayError && <ErrorMessage>{displayError}</ErrorMessage>}
      {helpText && !hasError && <HelpText>{helpText}</HelpText>}
    </Container>
  );
};