import React, { useState, useRef } from "react";
import { useAuth, LoadingUI } from "../../index";
import Swal from "sweetalert2";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaCamera,
  FaEdit,
  FaSave,
  FaTimes,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

/**
 * Corporate UserProfile (Tailwind Edition)
 */
export function UserProfile({ className = "" }) {
  const { user, accessToken, updateUser, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    name: user?.name || "",
    lastname: user?.lastname || "",
    email: user?.email || "",
    telefono: user?.telefono || "",
  });
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const fileInputRef = useRef(null);

  if (loading) return <LoadingUI message="Cargando perfil..." />;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire("Error", "El archivo no puede ser mayor a 5MB", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => setPreviewAvatar(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      await updateUser(formData);
      Swal.fire("Éxito", "Perfil actualizado correctamente", "success");
      setEditing(false);
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  };

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-6 shadow-md ${className}`}>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Perfil de Usuario</h2>
        <button
          onClick={() => setEditing(!editing)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2
            ${editing 
              ? "bg-slate-100 text-slate-600 hover:bg-slate-200" 
              : "bg-primary-500 text-white hover:bg-primary-600"}`}
        >
          {editing ? <><FaTimes /> Cancelar</> : <><FaEdit /> Editar</>}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
              {previewAvatar || user?.avatar ? (
                <img 
                  src={previewAvatar || `${user?.avatar}`} 
                  alt="Avatar" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <FaUser className="text-4xl text-slate-400" />
              )}
            </div>
            {editing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-primary-600 transition-colors"
              >
                <FaCamera />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
          <p className="mt-3 text-sm text-slate-500 font-medium">{user?.role?.[0] || "Usuario"}</p>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Nombre</label>
            {editing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            ) : (
              <p className="text-slate-800 font-medium">{user?.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Apellido</label>
            {editing ? (
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            ) : (
              <p className="text-slate-800 font-medium">{user?.lastname}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FaEnvelope /> Correo Electrónico
            </label>
            <p className="text-slate-800 font-medium">{user?.email}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Teléfono</label>
            {editing ? (
              <input
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleInputChange}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            ) : (
              <p className="text-slate-800 font-medium">{user?.telefono || "—"}</p>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 cursor-pointer transition-colors flex items-center gap-2"
          >
            <FaSave /> Guardar Cambios
          </button>
        </div>
      )}
    </div>
  );
}