import React, { useState } from "react";
import { useAuth, useClusterBase, usePermissions, ClusterBaseFormModal, ClusterBaseTable, Button } from "../../index";
import { FaPlus, FaBullseye } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * ClusterBaseSettings (Tailwind Edition)
 * Objetivos Bronze/Silver/Gold por organización — tabla con alta/edición/
 * eliminación, mismo patrón que TrucksManagement (antes era un formulario
 * de una sola fila; se pasó a lista para poder ver, editar y eliminar cada
 * organización cargada).
 */
export function ClusterBaseSettings() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const { rows, loading, saving, actions } = useClusterBase(accessToken);

  const canCreate = hasPermission("cluster-base", "create") || isAdmin;

  const handleEdit = (row) => {
    setSelectedRow(row);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedRow(null);
    setModalOpen(true);
  };

  const handleSave = async (organization, data) => {
    try {
      await actions.saveClusterBase(organization, data);
      Swal.fire({
        icon: "success",
        title: organization ? "Objetivos base actualizados" : "Objetivos base creados",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudieron guardar los objetivos base", "error");
      throw e;
    }
  };

  const handleDelete = async (organization) => {
    const confirm = await Swal.fire({
      icon: "warning",
      title: `¿Eliminar objetivos base de ${organization}?`,
      text: "Si ya se sincronizaron con server2, quedarán marcados como Baja hasta confirmar la baja allá.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;

    try {
      await actions.deleteClusterBase(organization);
      Swal.fire({
        icon: "success",
        title: "Objetivos base eliminados",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudieron eliminar los objetivos base", "error");
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Objetivos Base</h1>
        <p className="text-slate-500 mt-2 font-medium">
          Metas Bronze / Silver / Gold por organización.
        </p>
      </header>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-soft flex justify-end">
        {canCreate && (
          <Button variant="primary" onClick={handleAdd}>
            <FaPlus /> Nuevos Objetivos Base
          </Button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
            <FaBullseye size={32} />
          </div>
          <p className="text-lg font-bold text-slate-800">Cargando objetivos base...</p>
        </div>
      ) : (
        <ClusterBaseTable rows={rows} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      <ClusterBaseFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={selectedRow}
        saving={saving}
      />
    </div>
  );
}
