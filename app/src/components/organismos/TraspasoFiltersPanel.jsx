import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { FaSearch, FaRedo, FaFilter, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { Button } from "../index";

const GlassCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.soft};
`;

const Header = styled.div`
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border-bottom: ${props => props.expanded ? `1px solid ${props.theme.border}40` : "none"};
  background: ${({ theme }) => theme.bg2}20;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.titleColor};
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Content = styled.div`
  padding: 24px;
  display: ${props => props.expanded ? "block" : "none"};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.textSecondary};
  opacity: 0.9;
`;

const Input = styled.input`
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20;
  }
`;

const Select = styled.select`
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.border}40;
`;

const QuickFilters = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`;

const Badge = styled.button`
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid ${props => props.active ? props.theme.primary : props.theme.border};
  background: ${props => props.active ? props.theme.primary : props.theme.bg2}40;
  color: ${props => props.active ? "white" : props.theme.textSecondary};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.active ? props.theme.primaryDark : props.theme.bg2};
    color: ${props => props.active ? "white" : props.theme.primary};
  }
`;

export const TraspasoFiltersPanel = ({ filters, onFiltersChange, onReset, onSearch, loading, metadata }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  // No necesitamos estado local si queremos reactividad pura, 
  // pero mantendremos el patrón de 'apply' para evitar peticiones excesivas
  // si el usuario así lo prefiere. Sin embargo, para solucionar el bug reportado,
  // dispararemos el cambio inmediatamente.

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newFilters = { ...filters, [name]: value };
    onFiltersChange(newFilters);
    // disparar búsqueda automática al cambiar ciertos filtros (loadId podría necesitar debounce)
    if (name !== "loadId") {
      onSearch();
    }
  };

  const setPeriod = (days) => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const newF = { ...filters, dateFrom: from, dateTo: to };
    onFiltersChange(newF);
    onSearch();
  };

  return (
    <GlassCard>
      <Header expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>
        <Title><FaFilter /> Filtros de Auditoría</Title>
        {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
      </Header>

      <Content expanded={isExpanded}>
        <QuickFilters>
          <Badge active={false} onClick={() => setPeriod(0)}>Hoy</Badge>
          <Badge active={false} onClick={() => setPeriod(7)}>Última Semana</Badge>
          <Badge active={false} onClick={() => setPeriod(30)}>Último Mes</Badge>
        </QuickFilters>

        <Grid>
          <Field>
            <Label>Load ID / Documento</Label>
            <Input
              name="loadId"
              placeholder="Ej: 20240310..."
              value={filters.loadId || ""}
              onChange={handleChange}
            />
          </Field>

          <Field>
            <Label>Estado</Label>
            <Select name="status" value={filters.status || "all"} onChange={handleChange}>
              <option value="all">Todos</option>
              <option value="completed">Completados</option>
              <option value="pending">Pendientes</option>
              <option value="processing">Procesando</option>
              <option value="failed">Fallidos</option>
            </Select>
          </Field>

          <Field>
            <Label>Desde</Label>
            <Input type="date" name="dateFrom" value={filters.dateFrom || ""} onChange={handleChange} />
          </Field>

          <Field>
            <Label>Hasta</Label>
            <Input type="date" name="dateTo" value={filters.dateTo || ""} onChange={handleChange} />
          </Field>
        </Grid>

        <Actions>
          <Button variant="outline" onClick={onReset} disabled={loading}>
            <FaRedo /> Limpiar
          </Button>
          <Button variant="primary" onClick={onSearch} loading={loading}>
            <FaSearch /> Filtrar Traspasos
          </Button>
        </Actions>
      </Content>
    </GlassCard>
  );
};
