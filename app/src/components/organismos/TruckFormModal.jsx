import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaTruck } from "react-icons/fa";
import { Button, Input } from "../../index";

/**
 * TruckFormModal (Tailwind Edition)
 * Alta/edición de un camión del maestro propio (core_app.trucks), con el
 * repartidor asignado directo en el mismo formulario — mismo catálogo de
 * repartidores que ya usa Centro de Carga de Rutas (repartidores viene del
 * hook useTrucks, que reutiliza ese mismo endpoint).
 */
export function TruckFormModal({ isOpen, onClose, onSave, initialData, repartidores = [] }) {
  const [formData, setFormData] = useState({ code: "", description: "", plate: "", codeSeller: "", organization: "CATELLI" });
  const [loading, setLoading] = useState(false);

  const isEditing = !!initialData;

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      code: initialData?.code || "",
      description: initialData?.description || "",
      plate: initialData?.plate || "",
      codeSeller: initialData?.code_seller || "",
      organization: initialData?.code_unit_org || "CATELLI",
    });
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.code.trim() || !formData.description.trim() || !formData.organization.trim()) return;

    setLoading(true);
    try {
      await onSave(isEditing ? initialData.code : null, {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        plate: formData.plate.trim() || null,
        codeSeller: formData.codeSeller || null,
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
              <FaTruck size={18} />
            </div>
            {isEditing ? "Editar Camión" : "Nuevo Camión"}
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
            label="Código de Camión"
            name="code"
            value={formData.code}
            onChange={handleChange}
            placeholder="Ej: CM01"
            disabled={isEditing}
          />
          <Input
            label="Descripción"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Ej: Camión Zona Norte"
          />
          <Input
            label="Placa"
            name="plate"
            value={formData.plate}
            onChange={handleChange}
            placeholder="Ej: A123456"
          />
          <Input
            label="Organización"
            name="organization"
            value={formData.organization}
            onChange={(e) => setFormData((prev) => ({ ...prev, organization: e.target.value.toUpperCase() }))}
            placeholder="Ej: CATELLI"
            className="uppercase"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-slate-500 ml-1">Repartidor Asignado</label>
            <select
              name="codeSeller"
              value={formData.codeSeller}
              onChange={handleChange}
              className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
            >
              <option value="">-- Sin asignar --</option>
              {repartidores.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </div>

          {isEditing && (
            <p className="text-xs text-slate-400 -mt-1">
              El código no se puede editar una vez creado el camión. Para activar o
              desactivar, usá el interruptor en la lista.
            </p>
          )}
        </div>

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            <FaSave /> {isEditing ? "Guardar Cambios" : "Crear Camión"}
          </Button>
        </div>
      </div>
    </div>
  );
}
