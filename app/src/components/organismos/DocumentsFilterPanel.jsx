import React from "react";
import styled from "styled-components";
import { FaSearch, FaSync, FaEraser } from "react-icons/fa";
import { Button } from "../../index";

const FilterWrapper = styled.div`
  background: ${({ theme }) => theme.cardBg};
  padding: 24px; border-radius: 16px; border: 1px solid ${({ theme }) => theme.border};
  backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 20px;
  box-shadow: ${({ theme }) => theme.shadows.premium};
`;

const SearchContainer = styled.div`
  position: relative; width: 100%;
`;

const SearchInput = styled.input`
  width: 100%; padding: 12px 16px 12px 44px; border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.text}; font-size: 15px; transition: all 0.2s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.primary}20; }
`;

const SearchIcon = styled(FaSearch)`
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  color: ${({ theme }) => theme.textSecondary};
`;

const FiltersGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; align-items: flex-end;
`;

const FormGroup = styled.div`
  display: flex; flex-direction: column; gap: 6px;
`;

const Label = styled.label`
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${({ theme }) => theme.textSecondary};
`;

const Select = styled.select`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px; cursor: pointer;
`;

const Input = styled.input`
  padding: 10px 14px; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.inputBg}; color: ${({ theme }) => theme.text};
  font-size: 14px;
`;

const CheckboxLabel = styled.label`
  display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px;
  background: ${({ theme }) => theme.bg2}20; border-radius: 10px; border: 1px solid ${({ theme }) => theme.border};
  font-size: 13px; color: ${({ theme }) => theme.text}; transition: all 0.2s;
  &:hover { background: ${({ theme }) => theme.bg2}40; border-color: ${({ theme }) => theme.primary}40; }
`;

export function DocumentsFilterPanel({
    search, setSearch,
    filterValues, setFilterValues,
    onRefresh, isRefreshing
}) {
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFilterValues(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const resetFilters = () => {
        setFilterValues({
            dateFrom: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
            dateTo: new Date().toISOString().split("T")[0],
            status: "all",
            warehouse: "all",
            showProcessed: false,
        });
        setSearch("");
    };

    return (
        <FilterWrapper>
            <SearchContainer>
                <SearchIcon />
                <SearchInput
                    placeholder="Buscar documento por cualquier campo (Nro, Cliente, ERP...)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </SearchContainer>

            <FiltersGrid>
                <FormGroup>
                    <Label>Fecha Desde</Label>
                    <Input type="date" name="dateFrom" value={filterValues.dateFrom} onChange={handleChange} />
                </FormGroup>
                <FormGroup>
                    <Label>Fecha Hasta</Label>
                    <Input type="date" name="dateTo" value={filterValues.dateTo} onChange={handleChange} />
                </FormGroup>
                <FormGroup>
                    <Label>Estado Documento</Label>
                    <Select name="status" value={filterValues.status} onChange={handleChange}>
                        <option value="all">Todos los estados</option>
                        <option value="P">Pendientes (P)</option>
                        <option value="F">Facturados (F)</option>
                        <option value="A">Anulados (A)</option>
                    </Select>
                </FormGroup>

                <FormGroup>
                    <CheckboxLabel>
                        <input type="checkbox" name="showProcessed" checked={filterValues.showProcessed} onChange={handleChange} />
                        <span>Mostrar ya procesados</span>
                    </CheckboxLabel>
                </FormGroup>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={resetFilters} title="Limpiar todos los filtros" style={{ flex: 1 }}>
                        <FaEraser />
                    </Button>
                    <Button variant="primary" onClick={onRefresh} disabled={isRefreshing} style={{ flex: 2 }}>
                        <FaSync className={isRefreshing ? "spinning" : ""} /> {isRefreshing ? "Cargando..." : "Refrescar"}
                    </Button>
                </div>
            </FiltersGrid>
        </FilterWrapper>
    );
}
