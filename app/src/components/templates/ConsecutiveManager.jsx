import React, { useState } from "react";
import {
  FaPlus, FaSync, FaChartLine, FaSearch, FaPlay, FaInfoCircle,
  FaEdit, FaTrash, FaLink, FaHistory
} from "react-icons/fa";
import Swal from "sweetalert2";

import {
  useAuth,
  useConsecutiveManager,
  ConsecutiveFormModal,
  ConsecutiveDetailsModal,
  ConsecutiveAssignModal,
  ConsecutiveDashboardPanel,
  Button,
  StatusBadge,
  LoadingUI
} from "../../index";

/**
 * ConsecutiveManager (Tailwind Edition)
 * Gestión centralizada de folios y numeración con diseño corporativo premium.
 */
export function ConsecutiveManager() {
  const { accessToken } = useAuth();

  const {
    filteredConsecutives,
    loading,
    isProcessing,
    search, setSearch,
    showDashboard, setShowDashboard,
    dashboardData,
    loadConsecutives,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleReset,
    handleAssign,
    getNextValue,
    getMetrics
  } = useConsecutiveManager(accessToken);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedConsecutive, setSelectedConsecutive] = useState(null);
  const [metricsData, setMetricsData] = useState(null);

  const openCreate = () => {
    setSelectedConsecutive(null);
    setIsFormOpen(true);
  };

  const openEdit = (consecutive) => {
    setSelectedConsecutive(consecutive);
    setIsFormOpen(true);
  };

  const onSaveForm = async (data) => {
    try {
      if (selectedConsecutive) {
        await handleUpdate(selectedConsecutive._id, data);
        Swal.fire({ icon: 'success', title: 'Actualizado', text: 'Consecutivo actualizado correctamente', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        await handleCreate(data);
        Swal.fire({ icon: 'success', title: 'Creado', text: 'Consecutivo creado correctamente', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }
      setIsFormOpen(false);
    } catch (error) {
      Swal.fire("Error", "No se pudo guardar el consecutivo", "error");
    }
  };

  const onViewDetails = async (consecutive) => {
    try {
      const metrics = await getMetrics(consecutive._id);
      setMetricsData(metrics);
      setIsDetailsOpen(true);
    } catch (error) {
      Swal.fire("Error", "No se pudieron obtener las métricas", "error");
    }
  };

  const onAssignClick = (consecutive) => {
    setSelectedConsecutive(consecutive);
    setIsAssignOpen(true);
  };

  const onConfirmAssign = async (assignmentData) => {
    try {
      await handleAssign(selectedConsecutive._id, assignmentData);
      Swal.fire({ icon: 'success', title: 'Asignado', text: 'Asignación realizada con éxito', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      setIsAssignOpen(false);
    } catch (error) {
      Swal.fire("Error", "No se pudo realizar la asignación", "error");
    }
  };

  const onDeleteClick = async (consecutive) => {
    const confirm = await Swal.fire({
      title: '¿Eliminar Consecutivo?',
      text: `Esta acción no se puede deshacer. Se eliminará "${consecutive.name}".`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, eliminar'
    });

    if (confirm.isConfirmed) {
      try {
        await handleDelete(consecutive._id);
        Swal.fire("Eliminado", "El registro ha sido borrado.", "success");
      } catch (error) {
        Swal.fire("Error", "No se pudo eliminar el consecutivo.", "error");
      }
    }
  };

  const onResetClick = async (consecutive) => {
    const { value: initialValue } = await Swal.fire({
      title: `Reiniciar Consecutivo: ${consecutive.name}`,
      input: 'number',
      inputLabel: 'Nuevo valor inicial',
      inputValue: 0,
      showCancelButton: true,
      inputValidator: (value) => !value && 'Debe ingresar un valor'
    });

    if (initialValue !== undefined) {
      try {
        await handleReset(consecutive._id, initialValue);
        Swal.fire("Reiniciado", `Folio reiniciado a ${initialValue}`, "success");
      } catch (error) {
        Swal.fire("Error", "No se pudo reiniciar el folio.", "error");
      }
    }
  };

  const onGetNextValue = async (consecutive) => {
    try {
      let segment = null;
      if (consecutive.segments?.enabled && ['year', 'month'].includes(consecutive.segments.type)) {
        const date = new Date();
        segment = consecutive.segments.type === 'year'
          ? date.getFullYear().toString()
          : `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      } else if (consecutive.segments?.enabled) {
        const { value } = await Swal.fire({ title: 'Valor de Segmento', input: 'text', inputLabel: `Ingrese el valor para ${consecutive.segments.type}`, showCancelButton: true });
        if (!value) return;
        segment = value;
      }

      const result = await getNextValue(consecutive._id, segment);
      Swal.fire({
        title: "Folio Generado",
        html: `<div style="font-size: 2.5rem; font-weight: 900; color: #6366f1; padding: 30px; letter-spacing: -1px; font-family: monospace;">${result.value}</div>`,
        icon: 'success'
      });
    } catch (error) {
      Swal.fire("Error", "No se pudo generar el siguiente valor.", "error");
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      {/* HEADER SECTION */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Gestión de Consecutivos</h1>
          <p className="text-slate-500 mt-2 font-medium">Control centralizado de folios, numeración y segmentación de documentos.</p>
        </div>
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:w-80">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar por nombre o descripción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
            />
          </div>
          <Button variant="secondary" onClick={() => setShowDashboard(!showDashboard)} className="whitespace-nowrap">
            {showDashboard ? <><FaHistory /> Lista</> : <><FaChartLine /> Dashboard</>}
          </Button>
          <Button variant="primary" onClick={openCreate} className="whitespace-nowrap">
            <FaPlus /> Nuevo Folio
          </Button>
          <button 
            onClick={loadConsecutives} 
            className={`w-12 h-12 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-50 hover:text-primary-500 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <FaSync />
          </button>
        </div>
      </header>

      {/* CONTENT AREA */}
      <div className="min-h-[500px]">
        {showDashboard ? (
          <ConsecutiveDashboardPanel data={dashboardData} onClose={() => setShowDashboard(false)} />
        ) : (
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden">
            {loading ? (
              <LoadingUI message="Sincronizando consecutivos con el servidor de folios..." />
            ) : filteredConsecutives.length === 0 ? (
              <div className="p-32 flex flex-col items-center justify-center text-center gap-4 text-slate-400">
                <FaHistory size={48} className="opacity-20" />
                <p className="font-bold">No se encontraron consecutivos configurados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Consecutivo</th>
                      <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Valor Actual</th>
                      <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Máscara / Formato</th>
                      <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Segmentación</th>
                      <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                      <th className="px-6 py-5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredConsecutives.map(c => (
                      <tr key={c._id} className="hover:bg-slate-50/30 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="font-extrabold text-slate-700 tracking-tight">{c.name}</div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{c.description || 'Sin descripción'}</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-2xl font-black text-primary-600 font-mono tracking-tighter">{c.currentValue}</span>
                        </td>
                        <td className="px-6 py-5">
                          <code className="px-3 py-1 bg-slate-100 rounded-lg text-slate-600 text-xs font-bold border border-slate-200">
                            {c.pattern || `${c.prefix || ''}[${c.padChar.repeat(c.padLength)}]`}
                          </code>
                        </td>
                        <td className="px-6 py-5">
                          {c.segments?.enabled ? (
                            <StatusBadge status="PENDING">SEGMENTADO ({c.segments.type})</StatusBadge>
                          ) : (
                            <StatusBadge status="ACTIVE">GLOBAL</StatusBadge>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <StatusBadge status={c.active ? 'ACTIVE' : 'INACTIVE'}>
                            {c.active ? 'ACTIVO' : 'INACTIVO'}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onGetNextValue(c)} className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all" title="Generar Siguiente"><FaPlay size={14}/></button>
                            <button onClick={() => onViewDetails(c)} className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all" title="Métricas"><FaInfoCircle size={14}/></button>
                            <button onClick={() => onAssignClick(c)} className="p-2 text-slate-400 hover:text-violet-500 hover:bg-violet-50 rounded-lg transition-all" title="Vincular"><FaLink size={14}/></button>
                            <button onClick={() => onResetClick(c)} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all" title="Reiniciar"><FaSync size={14}/></button>
                            <button onClick={() => openEdit(c)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all" title="Editar"><FaEdit size={14}/></button>
                            <button onClick={() => onDeleteClick(c)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Eliminar"><FaTrash size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODALS */}
      <ConsecutiveFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSave={onSaveForm} consecutive={selectedConsecutive} />
      <ConsecutiveDetailsModal isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} metrics={metricsData} />
      <ConsecutiveAssignModal isOpen={isAssignOpen} onClose={() => setIsAssignOpen(false)} consecutive={selectedConsecutive} accessToken={accessToken} onAssign={onConfirmAssign} />

      {isProcessing && (
        <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center gap-6 text-white animate-fadeIn">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="font-extrabold text-lg tracking-tight uppercase">Procesando solicitud técnica...</span>
        </div>
      )}
    </div>
  );
}

export default ConsecutiveManager;
