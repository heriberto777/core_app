import React from "react";
import styled from "styled-components";
import { FaSearch, FaTruck, FaCalendarAlt, FaFilter, FaSync } from "react-icons/fa";
import { Button } from "../../index";

const Container = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 24px; border: 1px solid ${({ theme }) => theme.border};
  padding: 24px; box-shadow: ${({ theme }) => theme.shadows.medium};
  display: flex; flex-direction: column; gap: 20px;
`;

const FilterGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;
`;

const FormGroup = styled.div` display: flex; flex-direction: column; gap: 8px; `;

const Label = styled.label`
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary}; display: flex; align-items: center; gap: 6px;
`;

const Input = styled.input`
  padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; font-weight: 600; transition: all 0.2s;
  &:focus { border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; outline: none; }
`;

const Select = styled.select`
  padding: 12px 16px; border-radius: 12px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; font-weight: 600; cursor: pointer;
`;

const Actions = styled.div` display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px; `;

export function SummaryFilterPanel({ filters, onUpdate, onClear, onSearch, loading }) {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({ [name]: value });
    };

    return (
        <Container>
            <FilterGrid>
                <FormGroup>
                    <Label><FaTruck /> Carga #</Label>
                    <Input name="loadId" value={filters.loadId} onChange={handleChange} placeholder="Ej: 00123" />
                </FormGroup>

                <FormGroup>
                    <Label><FaTruck /> Ruta / Vendedor</Label>
                    <Input name="route" value={filters.route} onChange={handleChange} placeholder="Ej: R01" />
                </FormGroup>

                <FormGroup>
                    <Label><FaCalendarAlt /> Desde</Label>
                    <Input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleChange} />
                </FormGroup>

                <FormGroup>
                    <Label><FaCalendarAlt /> Hasta</Label>
                    <Input type="date" name="dateTo" value={filters.dateTo} onChange={handleChange} />
                </FormGroup>

                <FormGroup>
                    <Label><FaFilter /> Estado</Label>
                    <Select name="status" value={filters.status} onChange={handleChange}>
                        <option value="">Todos los estados</option>
                        <option value="completed">Completado</option>
                        <option value="partial_return">Devolución Parcial</option>
                        <option value="full_return">Devolución Total</option>
                    </Select>
                </FormGroup>
            </FilterGrid>

            <Actions>
                <Button variant="ghost" onClick={onClear} disabled={loading}>Limpiar</Button>
                <Button variant="primary" icon={<FaSearch />} onClick={onSearch} loading={loading}>Aplicar Filtros</Button>
            </Actions>
        </Container>
    );
}
