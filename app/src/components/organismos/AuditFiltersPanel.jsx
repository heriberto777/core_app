import React from "react";
import styled from "styled-components";
import { FaFilter, FaCalendarAlt, FaSearch, FaSync, FaDownload, FaHistory, FaServer } from "react-icons/fa";
import { Button } from "../index";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const Panel = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 24px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.soft};
`;

const TabContainer = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.border}40;
  padding-bottom: 16px;
`;

const Tab = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => props.active ? props.theme.primary + "15" : "transparent"};
  color: ${props => props.active ? props.theme.primary : props.theme.textSecondary};

  &:hover {
    background: ${({ theme }) => theme.primary}10;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  align-items: flex-end;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 11px;
  font-weight: 800;
  color: ${({ theme }) => theme.textSecondary};
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background: ${({ theme }) => theme.inputBg};
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.text};
  background: ${({ theme }) => theme.inputBg};
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20;
  }
`;

const DatePickerWrapper = styled.div`
  .react-datepicker-wrapper {
    width: 100%;
  }

  .custom-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    font-size: 14px;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.inputBg};
  }
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.border}40;
  justify-content: flex-end;
`;

export const AuditFiltersPanel = ({
  logType,
  setLogType,
  filters,
  onFilterChange,
  onRefresh,
  onExport,
  loading
}) => {
  return (
    <Panel>
      <TabContainer>
        <Tab active={logType === "system"} onClick={() => setLogType("system")}>
          <FaServer /> LOGS DE SISTEMA
        </Tab>
        <Tab active={logType === "transfer"} onClick={() => setLogType("transfer")}>
          <FaHistory /> HISTORIAL DE TRANSFERENCIAS
        </Tab>
      </TabContainer>

      <FilterGrid>
        {logType === "system" && (
          <FormGroup>
            <Label><FaFilter /> Nivel</Label>
            <Select
              value={filters.level}
              onChange={e => onFilterChange({ level: e.target.value })}
            >
              <option value="all">Todos los niveles</option>
              <option value="INFO">Información</option>
              <option value="WARNING">Advertencia</option>
              <option value="ERROR">Error</option>
              <option value="CRITICAL">Crítico</option>
            </Select>
          </FormGroup>
        )}

        {logType === "transfer" && (
          <FormGroup>
            <Label><FaFilter /> Estado</Label>
            <Select
              value={filters.status}
              onChange={e => onFilterChange({ status: e.target.value })}
            >
              <option value="all">Todos los estados</option>
              <option value="completed">Completada</option>
              <option value="failed">Fallida</option>
              <option value="cancelled">Cancelada</option>
            </Select>
          </FormGroup>
        )}

        <FormGroup>
          <Label><FaCalendarAlt /> Fecha Inicio</Label>
          <DatePickerWrapper>
            <DatePicker
              selected={filters.startDate}
              onChange={date => onFilterChange({ startDate: date })}
              dateFormat="dd/MM/yyyy"
              placeholderText="Seleccionar fecha"
              className="custom-input"
            />
          </DatePickerWrapper>
        </FormGroup>

        <FormGroup>
          <Label><FaCalendarAlt /> Fecha Fin</Label>
          <DatePickerWrapper>
            <DatePicker
              selected={filters.endDate}
              onChange={date => onFilterChange({ endDate: date })}
              dateFormat="dd/MM/yyyy"
              placeholderText="Seleccionar fecha"
              className="custom-input"
            />
          </DatePickerWrapper>
        </FormGroup>

        <FormGroup>
          <Label><FaSearch /> Búsqueda</Label>
          <Input
            placeholder={logType === "system" ? "Buscar en mensaje..." : "Buscar tarea..."}
            value={filters.search}
            onChange={e => onFilterChange({ search: e.target.value })}
          />
        </FormGroup>
      </FilterGrid>

      <ActionGroup>
        <Button variant="outline" onClick={onExport} disabled={loading}>
          <FaDownload /> Exportar CSV
        </Button>
        <Button variant="primary" onClick={onRefresh} loading={loading}>
          <FaSync /> Actualizar
        </Button>
      </ActionGroup>
    </Panel>
  );
};
