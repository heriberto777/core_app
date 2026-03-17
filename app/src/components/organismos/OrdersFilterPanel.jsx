import React from "react";
import styled from "styled-components";
import { FaFilter, FaSync, FaCalendarAlt, FaWarehouse } from "react-icons/fa";
import { Button } from "../../index";

const FilterPanel = styled.div`
  background: ${({ theme }) => theme.cardBg}80;
  backdrop-filter: blur(12px); border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.border};
  padding: 20px; display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

const FilterGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; align-items: flex-end;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 6px;
`;

const Label = styled.label`
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary}; display: flex; align-items: center; gap: 6px;
`;

const Input = styled.input`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text}; font-size: 13px;
  transition: all 0.2s;
  &:focus { border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; outline: none; }
`;

const Select = styled.select`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text}; font-size: 13px;
  cursor: pointer;
`;

const CheckboxContainer = styled.label`
  display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px;
  border-radius: 12px; transition: background 0.2s;
  &:hover { background: ${({ theme }) => theme.bg2}20; }
  span { font-size: 13px; font-weight: 600; }
`;

const ActionRow = styled.div`
  display: flex; justify-content: flex-end; gap: 12px; padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.border}40;
`;

export function OrdersFilterPanel({ filters, setFilters, onRefresh }) {
    // Reactividad: el hook useOrdersVisualization ya observa 'filters', 
    // pero si onRefresh realiza lógica adicional, la mantenemos.
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFilters(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handleReset = () => {
        setFilters({
            dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
            dateTo: new Date().toISOString().split("T")[0],
            status: "all",
            warehouse: "all",
            showProcessed: false,
        });
    };

    return (
        <FilterPanel>
            <FilterGrid>
                <FormGroup>
                    <Label><FaCalendarAlt /> Desde</Label>
                    <Input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleChange} />
                </FormGroup>

                <FormGroup>
                    <Label><FaCalendarAlt /> Hasta</Label>
                    <Input type="date" name="dateTo" value={filters.dateTo} onChange={handleChange} />
                </FormGroup>

                <FormGroup>
                    <Label><FaWarehouse /> Bodega / Almacén</Label>
                    <Select name="warehouse" value={filters.warehouse} onChange={handleChange}>
                        <option value="all">Todas las bodegas</option>
                        <option value="01">Almacén Central</option>
                        <option value="02">Punto de Venta</option>
                        {/* Estos valores deberían venir de una API en el futuro, por ahora mantenemos consistencia con la lógica actual */}
                    </Select>
                </FormGroup>

                <FormGroup>
                    <Label><FaFilter /> Estado del Documento</Label>
                    <Select name="status" value={filters.status} onChange={handleChange}>
                        <option value="all">Todos los estados</option>
                        <option value="P">Pendientes (P)</option>
                        <option value="F">Facturados (F)</option>
                        <option value="A">Anulados (A)</option>
                    </Select>
                </FormGroup>

                <FormGroup>
                    <CheckboxContainer>
                        <input type="checkbox" name="showProcessed" checked={filters.showProcessed} onChange={handleChange} />
                        <span>Incluir Procesados</span>
                    </CheckboxContainer>
                </FormGroup>
            </FilterGrid>

            <ActionRow>
                <Button variant="ghost" onClick={handleReset}><FaSync /> Limpiar Filtros</Button>
                <Button variant="primary" onClick={onRefresh}><FaSync /> Actualizar Datos</Button>
            </ActionRow>
        </FilterPanel>
    );
}
