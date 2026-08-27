import React, { useState, useEffect } from "react";
import { FaSave, FaTimes, FaRoute } from "react-icons/fa";
import { Button, Input } from "../../index";

/**
 * RouteFormModal (Tailwind Edition)
 * Alta/edición de una ruta del maestro propio (core_app.routes).
 */
export function RouteFormModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({ codeRoute: "", description: "" });
  const [loading, setLoading] = useState(false);

  const isEditing = !!initialData;

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      codeRoute: initialData?.code_route || "",
      description: initialData?.description || "",
    });
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.codeRoute.trim() || !formData.description.trim()) return;

    setLoading(true);
    try {
      await onSave(isEditing ? initialData.code_route : null, {
        codeRoute: formData.codeRoute.trim().toUpperCase(),
        description: formData.description.trim(),
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
              <FaRoute size={18} />
            </div>
            {isEditing ? "Editar Ruta" : "Nueva Ruta"}
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
            label="Código de Ruta"
            name="codeRoute"
            value={formData.codeRoute}
            onChange={handleChange}
            placeholder="Ej: RP01"
            disabled={isEditing}
          />
          <Input
            label="Descripción"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Ej: Ruta Zona Norte"
          />
          {isEditing && (
            <p className="text-xs text-slate-400 -mt-1">
              El código no se puede editar una vez creada la ruta. Para activar o
              desactivar, usá el interruptor en la lista.
            </p>
          )}
        </div>

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            <FaSave /> {isEditing ? "Guardar Cambios" : "Crear Ruta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
