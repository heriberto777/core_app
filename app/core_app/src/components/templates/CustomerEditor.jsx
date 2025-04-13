import React, { useState, useEffect } from "react";
import { FaSave, FaTimes } from "react-icons/fa";

export function CustomerEditor({ customer, onSave, onCancel }) {
  const [editedCustomer, setEditedCustomer] = useState({ ...customer });

  console.log(customer);

  // Cuando el cliente cambia externamente, actualizar el estado
  useEffect(() => {
    setEditedCustomer({ ...customer });
  }, [customer]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditedCustomer({
      ...editedCustomer,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSave = () => {
    // Validación básica
    if (!editedCustomer.code) {
      alert("El código de cliente es obligatorio");
      return;
    }

    if (!editedCustomer.name) {
      alert("El nombre del cliente es obligatorio");
      return;
    }

    onSave(editedCustomer);
  };

  return (
    <div className="swal2-form-container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ margin: 0 }}>Editar Cliente</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="button"
            style={{ backgroundColor: "var(--secondary-color)" }}
            onClick={onCancel}
          >
            <FaTimes /> Cancelar
          </button>
          <button className="button" onClick={handleSave}>
            <FaSave /> Guardar
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 250px" }}>
            <label>Código</label>
            <input
              type="text"
              name="code"
              value={editedCustomer.COD_CLT || ""}
              onChange={handleChange}
              disabled={true} // El código normalmente no se cambia
              className="swal2-input"
              style={{ backgroundColor: "#f8f9fa" }}
            />
            <small
              style={{ color: "var(--secondary-color)", fontSize: "0.8rem" }}
            >
              El código no se puede modificar
            </small>
          </div>

          <div className="form-group" style={{ flex: "1 1 250px" }}>
            <label>
              Nombre <span style={{ color: "var(--danger-color)" }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={editedCustomer.name || ""}
              onChange={handleChange}
              className="swal2-input"
              required
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 250px" }}>
            <label>Tipo de Cliente</label>
            <select
              name="customerType"
              value={editedCustomer.customerType || ""}
              onChange={handleChange}
              className="swal2-select"
            >
              <option value="">Seleccione...</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="COMPANY">Empresa</option>
              <option value="GOVERNMENT">Gobierno</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: "1 1 250px" }}>
            <label>Categoría</label>
            <select
              name="category"
              value={editedCustomer.category || ""}
              onChange={handleChange}
              className="swal2-select"
            >
              <option value="">Seleccione...</option>
              <option value="A">A - Premium</option>
              <option value="B">B - Regular</option>
              <option value="C">C - Ocasional</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Dirección</label>
          <textarea
            name="address"
            value={editedCustomer.address || ""}
            onChange={handleChange}
            className="swal2-textarea"
            rows="3"
          />
        </div>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Ciudad</label>
            <input
              type="text"
              name="city"
              value={editedCustomer.city || ""}
              onChange={handleChange}
              className="swal2-input"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Provincia/Estado</label>
            <input
              type="text"
              name="state"
              value={editedCustomer.state || ""}
              onChange={handleChange}
              className="swal2-input"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 150px" }}>
            <label>Código Postal</label>
            <input
              type="text"
              name="postalCode"
              value={editedCustomer.postalCode || ""}
              onChange={handleChange}
              className="swal2-input"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Teléfono</label>
            <input
              type="tel"
              name="phone"
              value={editedCustomer.phone || ""}
              onChange={handleChange}
              className="swal2-input"
              placeholder="(XXX) XXX-XXXX"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={editedCustomer.email || ""}
              onChange={handleChange}
              className="swal2-input"
              placeholder="ejemplo@dominio.com"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>RNC/Cédula</label>
            <input
              type="text"
              name="taxId"
              value={editedCustomer.taxId || ""}
              onChange={handleChange}
              className="swal2-input"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Límite de Crédito</label>
            <input
              type="number"
              name="creditLimit"
              value={editedCustomer.creditLimit || ""}
              onChange={handleChange}
              className="swal2-input"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Contacto Principal</label>
            <input
              type="text"
              name="contactPerson"
              value={editedCustomer.contactPerson || ""}
              onChange={handleChange}
              className="swal2-input"
            />
          </div>

          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Días de Crédito</label>
            <input
              type="number"
              name="creditDays"
              value={editedCustomer.creditDays || ""}
              onChange={handleChange}
              className="swal2-input"
              min="0"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div className="form-check" style={{ flex: "1 1 200px" }}>
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              checked={editedCustomer.isActive || false}
              onChange={handleChange}
            />
            <label htmlFor="isActive">Cliente Activo</label>
          </div>

          <div className="form-check" style={{ flex: "1 1 200px" }}>
            <input
              type="checkbox"
              id="hasCredit"
              name="hasCredit"
              checked={editedCustomer.hasCredit || false}
              onChange={handleChange}
            />
            <label htmlFor="hasCredit">Permite Crédito</label>
          </div>
        </div>

        <div className="form-group">
          <label>Notas</label>
          <textarea
            name="notes"
            value={editedCustomer.notes || ""}
            onChange={handleChange}
            className="swal2-textarea"
            rows="3"
            placeholder="Información adicional sobre el cliente..."
          />
        </div>
      </div>
    </div>
  );
}
