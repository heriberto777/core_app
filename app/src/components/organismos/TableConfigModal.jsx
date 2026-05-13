import React, { useState, useEffect } from "react";
import { FaSave, FaTimes } from "react-icons/fa";
import { Button, Input } from "../../index";

/**
 * TableConfigModal (Tailwind Edition)
 * Modal corporativo para configuración de tablas.
 */
export function TableConfigModal({ isOpen, onClose, onSave, initialData }) {
    const [formData, setFormData] = useState({
        name: "",
        sourceTable: "",
        targetTable: "",
        primaryKey: "",
        targetPrimaryKey: "",
        foreignKey: "",
        joinType: "INNER",
        isDetailTable: false,
        parentTableRef: "",
        useSameSourceTable: false,
        orderByColumn: "",
        filterCondition: "",
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (initialData) {
            setFormData({
                name: initialData.name || "",
                sourceTable: initialData.sourceTable || "",
                targetTable: initialData.targetTable || "",
                primaryKey: initialData.primaryKey || "",
                targetPrimaryKey: initialData.targetPrimaryKey || "",
                foreignKey: initialData.foreignKey || "",
                joinType: initialData.joinType || "INNER",
                isDetailTable: initialData.isDetailTable || false,
                parentTableRef: initialData.parentTableRef || "",
                useSameSourceTable: initialData.useSameSourceTable || false,
                orderByColumn: initialData.orderByColumn || "",
                filterCondition: initialData.filterCondition || "",
            });
        } else {
            setFormData({
                name: "",
                sourceTable: "",
                targetTable: "",
                primaryKey: "",
                targetPrimaryKey: "",
                foreignKey: "",
                joinType: "INNER",
                isDetailTable: false,
                parentTableRef: "",
                useSameSourceTable: false,
                orderByColumn: "",
                filterCondition: "",
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.targetTable || (!formData.sourceTable && !formData.useSameSourceTable)) {
            alert("Los campos Nombre, Tabla Destino y Tabla Origen son obligatorios.");
            return;
        }
        setLoading(true);
        try {
            await onSave(formData);
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
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-premium flex flex-col overflow-hidden animate-slideUp"
              onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-extrabold text-slate-800">
                      {initialData ? "Editar Tabla" : "Añadir Tabla"}
                    </h3>
                    <button 
                      onClick={onClose}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Nombre de Referencia" name="name" value={formData.name} onChange={handleChange} placeholder="Ej: pedidosHeader" />
                        <Input label="Tabla Destino (ERP)" name="targetTable" value={formData.targetTable} onChange={handleChange} placeholder="Ej: PEDIDO" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input 
                          label="Tabla Origen (Externo)" 
                          name="sourceTable" 
                          value={formData.sourceTable} 
                          onChange={handleChange} 
                          placeholder="Ej: FAC_ENC_PED" 
                          disabled={formData.isDetailTable && formData.useSameSourceTable} 
                        />
                        <div className="flex flex-col gap-1.5 w-full mb-3">
                          <label className="text-[13px] font-semibold text-slate-500 ml-1">Filtro SQL Adicional</label>
                          <input 
                            name="filterCondition" 
                            value={formData.filterCondition} 
                            onChange={handleChange} 
                            placeholder="Ej: TIP_DOC = 'F'..." 
                            className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none transition-all"
                          />
                          <p className="text-[10px] font-medium text-slate-400 mt-1 ml-1 uppercase tracking-wider">Use operadores SQL: AND, OR, IS NULL, etc.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Clave Primaria Origen" name="primaryKey" value={formData.primaryKey} onChange={handleChange} placeholder="Ej: NUM_PED" />
                        <Input label="Clave Primaria Destino" name="targetPrimaryKey" value={formData.targetPrimaryKey} onChange={handleChange} placeholder="Ej: PEDIDO" />
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <input 
                          type="checkbox" 
                          name="isDetailTable" 
                          id="isDetailTable" 
                          checked={formData.isDetailTable} 
                          onChange={handleChange}
                          className="w-5 h-5 rounded-lg text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="isDetailTable" className="text-sm font-bold text-slate-700 cursor-pointer">Es tabla de detalle</label>
                    </div>

                    {formData.isDetailTable && (
                        <div className="space-y-6 pt-2 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Input label="Referencia Tabla Padre" name="parentTableRef" value={formData.parentTableRef} onChange={handleChange} placeholder="Ej: pedidosHeader" />
                                <Input label="Columna Ordenamiento" name="orderByColumn" value={formData.orderByColumn} onChange={handleChange} placeholder="Ej: SECUENCIA" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Input label="Clave Foránea (Relación)" name="foreignKey" value={formData.foreignKey} onChange={handleChange} placeholder="Ej: NUM_PED" />
                                <div className="flex flex-col gap-1.5 w-full">
                                  <label className="text-[13px] font-semibold text-slate-500 ml-1">Tipo de Join</label>
                                  <select 
                                    name="joinType" 
                                    value={formData.joinType} 
                                    onChange={handleChange}
                                    className="w-full py-2.5 px-4 text-sm rounded-xl border border-slate-200 bg-white focus:border-primary-500 outline-none"
                                  >
                                      <option value="INNER">INNER JOIN</option>
                                      <option value="LEFT">LEFT JOIN</option>
                                      <option value="RIGHT">RIGHT JOIN</option>
                                  </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-primary-50/50 rounded-2xl border border-primary-100">
                                <input 
                                  type="checkbox" 
                                  name="useSameSourceTable" 
                                  id="useSameSourceTable" 
                                  checked={formData.useSameSourceTable} 
                                  onChange={handleChange}
                                  className="w-5 h-5 rounded-lg text-primary-600 focus:ring-primary-500"
                                />
                                <label htmlFor="useSameSourceTable" className="text-sm font-bold text-primary-700 cursor-pointer">Usar misma tabla origen que padre</label>
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        <FaSave /> {initialData ? "Actualizar" : "Añadir"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
