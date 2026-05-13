import React, { useState } from "react";
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

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [inventorySnapshot, setInventorySnapshot] = useState(null);

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
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">
      <Helmet>
        <title>Audit Summary - Core ERP</title>
      </Helmet>

      <div className="flex-1 p-5 lg:p-10 max-w-7xl mx-auto w-full flex flex-col gap-8">
        <div className="flex flex-col lg:flex-row justify-between items-end gap-5">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/loads")}
              className="bg-none border-none text-blue-500 text-xs font-extrabold flex items-center gap-2 cursor-pointer uppercase hover:opacity-80 transition-opacity p-0"
            >
              <FaArrowLeft /> Volver a Cargas
            </button>
            <h2 className="m-0 text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3">
              <FaChartLine color="var(--primary)" /> Auditoría de Traspasos
            </h2>
            <p className="m-0 text-sm font-semibold text-gray-500 dark:text-gray-400">Centro de gestión de sumarios de carga y procesos de retorno técnico.</p>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" icon={<FaBoxOpen />} onClick={clearFilters}>Limpiar Filtros</Button>
          </div>
        </div>

        <SummaryFilterPanel
          filters={filters}
          onUpdate={updateFilters}
          onClear={clearFilters}
          onSearch={refetch}
          loading={loading}
        />

        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
            <FaExclamationTriangle size={40} className="text-red-500" />
            <p className="font-bold text-red-500">{error}</p>
            <Button variant="primary" onClick={refetch}>Reintentar Consulta</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <SummaryDataTable
              summaries={summaries}
              onView={handleViewDetails}
              onReturn={handleOpenReturn}
              refreshing={refreshing}
            />

            <div className="flex justify-between items-center p-5 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/40 dark:border-slate-700/40">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Página <strong>{pagination.currentPage}</strong> de <strong>{pagination.totalPages}</strong>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={pagination.currentPage === 1}
                  onClick={() => pagination.handlePageChange(pagination.currentPage - 1)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/10 text-xs font-extrabold cursor-pointer transition-all hover:bg-blue-500 hover:text-white hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-inherit disabled:hover:border-inherit"
                >
                  <FaChevronLeft /> Anterior
                </button>
                <button
                  disabled={pagination.currentPage === pagination.totalPages}
                  onClick={() => pagination.handlePageChange(pagination.currentPage + 1)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/10 text-xs font-extrabold cursor-pointer transition-all hover:bg-blue-500 hover:text-white hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-inherit disabled:hover:border-inherit"
                >
                  Siguiente <FaChevronRight />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}

export default LoadsResumen;
