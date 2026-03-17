import React, { useState } from "react";
import styled from "styled-components";
import { FaArrowLeft, FaExclamationTriangle, FaChartLine, FaBoxOpen, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Swal from "sweetalert2";

import {
  useAuth,
  usePermissions,
  useLoadsResumen,
  SummaryFilterPanel,
  SummaryDataTable,
  SummaryDetailsModal,
  ReturnProcessModal,
  Button
} from "../../index";

export function LoadsResumen() {
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  
  const canProcessReturn = hasPermission("loads", "update") || hasPermission("loads", "manage") || isAdmin;

  const navigate = useNavigate();
  const { loadId: paramLoadId } = useParams();

  // Modales State
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [inventorySnapshot, setInventorySnapshot] = useState(null);

  // Hook de orquestación (Auditoría + Devoluciones)
  const {
    summaries,
    loading,
    refreshing,
    error,
    pagination,
    filters,
    updateFilters,
    clearFilters,
    refetch,
    actions
  } = useLoadsResumen(accessToken, paramLoadId);

  const handleViewDetails = async (id) => {
    try {
      const data = await actions.getSummaryDetails(id);
      setSelectedSummary(data);
      setIsDetailsOpen(true);
    } catch (err) {
      Swal.fire({ title: "Error", text: "No se pudieron cargar los detalles técnicos.", icon: "error" });
    }
  };

  const handleOpenReturn = async (id) => {
    try {
      Swal.fire({ title: "Verificando Stock...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const inventory = await actions.checkInventoryForReturn(id);

      const canReturn = inventory.productsWithInventory.some(p => p.maxReturnableQuantity > 0);
      Swal.close();

      if (!canReturn) {
        Swal.fire({ title: "Atención", text: "No hay productos disponibles para devolver en el inventario actual.", icon: "warning" });
        return;
      }

      setInventorySnapshot(inventory);
      setIsReturnOpen(true);
    } catch (err) {
      Swal.fire({ title: "Error de Inventario", text: err.message, icon: "error" });
    }
  };

  const onProcessReturn = async (data) => {
    try {
      const result = await actions.processReturn(data);
      Swal.fire({
        title: "Retorno Exitoso",
        text: `Documento generado: ${result.returnDocument}`,
        icon: "success"
      });
    } catch (err) {
      Swal.fire({ title: "Error en Proceso", text: err.message, icon: "error" });
      throw err; // Re-throw for modal to handle loading state
    }
  };

  return (
    <Container>
      <Helmet>
        <title>Audit Summary - Core ERP</title>
      </Helmet>

      <MainArea>
        <TopBar>
          <TitleSection>
            <BackButton onClick={() => navigate("/loads")}>
              <FaArrowLeft /> Volver a Cargas
            </BackButton>
            <PageTitle><FaChartLine color="var(--primary)" /> Auditoría de Traspasos</PageTitle>
            <PageSubtitle>Centro de gestión de sumarios de carga y procesos de retorno técnico.</PageSubtitle>
          </TitleSection>

          <Toolbar>
            <Button variant="ghost" icon={<FaBoxOpen />} onClick={clearFilters}>Limpiar Filtros</Button>
          </Toolbar>
        </TopBar>

        <SummaryFilterPanel
          filters={filters}
          onUpdate={updateFilters}
          onClear={clearFilters}
          onSearch={refetch}
          loading={loading}
        />

        {error ? (
          <CenteredArea $error>
            <FaExclamationTriangle size={40} />
            <p>{error}</p>
            <Button variant="primary" onClick={refetch}>Reintentar Consulta</Button>
          </CenteredArea>
        ) : (
          <ResultsArea>
            <SummaryDataTable
              summaries={summaries}
              onView={handleViewDetails}
              onReturn={handleOpenReturn}
              refreshing={refreshing}
            />

            <PaginationBar>
              <PaginationInfo>
                Página <strong>{pagination.currentPage}</strong> de <strong>{pagination.totalPages}</strong>
              </PaginationInfo>
              <PaginationActions>
                <NavButton disabled={pagination.currentPage === 1} onClick={() => pagination.handlePageChange(pagination.currentPage - 1)}>
                  <FaChevronLeft /> Anterior
                </NavButton>
                <NavButton disabled={pagination.currentPage === pagination.totalPages} onClick={() => pagination.handlePageChange(pagination.currentPage + 1)}>
                  Siguiente <FaChevronRight />
                </NavButton>
              </PaginationActions>
            </PaginationBar>
          </ResultsArea>
        )}
      </MainArea>

      <SummaryDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        summary={selectedSummary}
      />

      <ReturnProcessModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        inventoryData={inventorySnapshot}
        onProcess={onProcessReturn}
      />
    </Container>
  );
}

// --- Styled Components Premium ---

const Container = styled.div`
  min-height: 100vh; background: ${({ theme }) => theme.bg};
  display: flex; flex-direction: column;
`;

const HeaderSection = styled.header` padding: 0 20px; `;

const MainArea = styled.main`
  flex: 1; padding: 20px 40px; max-width: 1400px; margin: 0 auto; width: 100%;
  display: flex; flex-direction: column; gap: 32px;
  @media (max-width: 768px) { padding: 15px; }
`;

const TopBar = styled.div`
  display: flex; justify-content: space-between; align-items: flex-end;
  @media (max-width: 900px) { flex-direction: column; align-items: flex-start; gap: 20px; }
`;

const TitleSection = styled.div` display: flex; flex-direction: column; gap: 8px; `;
const BackButton = styled.button`
  background: none; border: none; color: ${({ theme }) => theme.primary}; 
  font-size: 13px; font-weight: 800; display: flex; align-items: center; gap: 8px;
  cursor: pointer; text-transform: uppercase; padding: 0;
  &:hover { opacity: 0.8; }
`;
const PageTitle = styled.h2` margin: 0; font-size: 28px; font-weight: 800; color: ${({ theme }) => theme.title}; display: flex; align-items: center; gap: 12px; `;
const PageSubtitle = styled.p` margin: 0; font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.textSecondary}; `;

const Toolbar = styled.div` display: flex; gap: 12px; `;

const ResultsArea = styled.div` display: flex; flex-direction: column; gap: 20px; `;

const CenteredArea = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px; gap: 20px; text-align: center;
  p { font-weight: 700; color: ${({ theme, $error }) => $error ? '#ef4444' : theme.textSecondary}; }
`;

const PaginationBar = styled.div`
  display: flex; justify-content: space-between; align-items: center; padding: 20px;
  background: ${({ theme }) => theme.cardBg}; border-radius: 20px; border: 1px solid ${({ theme }) => theme.border}40;
`;

const PaginationInfo = styled.div` font-size: 13px; color: ${({ theme }) => theme.textSecondary}; `;

const PaginationActions = styled.div` display: flex; gap: 12px; `;

const NavButton = styled.button`
  display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bg2}10;
  color: ${({ theme }) => theme.text}; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.2s;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.primary}; color: white; border-color: ${({ theme }) => theme.primary}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

export default LoadsResumen;
