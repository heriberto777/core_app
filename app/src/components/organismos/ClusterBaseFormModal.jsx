import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaBullseye } from "react-icons/fa";
import { Button, Input } from "../../index";

/**
 * ClusterBaseFormModal (Tailwind Edition)
 * Alta/edición de objetivos base (core_app.cluster_base) por organización —
 * mismo criterio que TruckFormModal: la organización cumple el rol de
 * "código" (no se puede editar una vez creada la fila).
 */
export function ClusterBaseFormModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({ organization: "CATELLI", bronzeBase: "", silverBase: "", goldBase: "" });
  const [loading, setLoading] = useState(false);

  const isEditing = !!initialData;

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      organization: initialData?.code_unit_org || "CATELLI",
      bronzeBase: initialData?.bronze_base ?? "",
      silverBase: initialData?.silver_base ?? "",
      goldBase: initialData?.gold_base ?? "",
    });
  }, [initialData, isOpen]);

  const handleSubmit = async () => {
    if (!formData.organization.trim()) return;

    setLoading(true);
    try {
      await onSave(isEditing ? initialData.code_unit_org : null, {
        bronzeBase: Number(formData.bronzeBase) || 0,
        silverBase: Number(formData.silverBase) || 0,
        goldBase: Number(formData.goldBase) || 0,
        organization: formData.organization.trim().toUpperCase(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-xl shadow-premium flex flex-col overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
              <FaBullseye size={18} />
            </div>
            {isEditing ? "Editar Objetivos Base" : "Nuevos Objetivos Base"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-8 space-y-4">
          <Input
            label="Organización"
            name="organization"
            value={formData.organization}
            onChange={(e) => setFormData((prev) => ({ ...prev, organization: e.target.value.toUpperCase() }))}
            placeholder="Ej: CATELLI"
            className="uppercase"
            disabled={isEditing}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Base Bronze"
              name="bronzeBase"
              type="number"
              value={formData.bronzeBase}
              onChange={(e) => setFormData((prev) => ({ ...prev, bronzeBase: e.target.value }))}
            />
            <Input
              label="Base Silver"
              name="silverBase"
              type="number"
              value={formData.silverBase}
              onChange={(e) => setFormData((prev) => ({ ...prev, silverBase: e.target.value }))}
            />
            <Input
              label="Base Gold"
              name="goldBase"
              type="number"
              value={formData.goldBase}
              onChange={(e) => setFormData((prev) => ({ ...prev, goldBase: e.target.value }))}
            />
          </div>

          {isEditing && (
            <p className="text-xs text-slate-400 -mt-1">
              La organización no se puede editar una vez creada la fila. Para
              eliminarla, usá el botón de eliminar en la lista.
            </p>
          )}
        </div>

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            <FaSave /> {isEditing ? "Guardar Cambios" : "Crear"}
          </Button>
        </div>
      </div>
    </div>
  );
}
