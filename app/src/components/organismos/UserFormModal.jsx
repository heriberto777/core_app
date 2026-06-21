import React, { useState, useEffect } from "react";
import { FaUser, FaEnvelope, FaShieldAlt, FaPhone, FaLock, FaUserShield, FaTimes } from "react-icons/fa";
import { Button, Input } from "../index";

/**
 * UserFormModal (Tailwind Edition)
 * Modal corporativo para configuración de identidades y permisos.
 */
export const UserFormModal = ({ isOpen, onClose, onSave, initialData = null, roles = [], resources = [], actions = [] }) => {
    const [formData, setFormData] = useState({
        name: "", lastname: "", email: "", telefono: "",
        password: "", roles: [], permissions: [], isAdmin: false
    });

    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("info");
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [newPassword, setNewPassword] = useState("");

    const handleTogglePermission = (resourceId, action) => {
        const currentPermissions = [...(formData.permissions || [])];
        const resourceIdx = currentPermissions.findIndex(p => p.resource === resourceId);
        const actionValue = typeof action === 'string' ? action : (action.name || action.value || action._id);

        if (resourceIdx > -1) {
            const actionIdx = currentPermissions[resourceIdx].actions.findIndex(a => {
                const aValue = typeof a === 'string' ? a : (a.name || a.value || a._id);
                return aValue === actionValue;
            });
            if (actionIdx > -1) {
                currentPermissions[resourceIdx].actions.splice(actionIdx, 1);
                if (currentPermissions[resourceIdx].actions.length === 0) currentPermissions.splice(resourceIdx, 1);
            } else {
                currentPermissions[resourceIdx].actions.push(actionValue);
            }
        } else {
            currentPermissions.push({ resource: resourceId, actions: [actionValue] });
        }
        setFormData({ ...formData, permissions: currentPermissions });
    };

    useEffect(() => {
        if (initialData) {
            const rolesArray = Array.isArray(initialData.roles) 
                ? initialData.roles.map(r => typeof r === 'object' ? r._id : r)
                : [];
            const rolesFromRolesInfo = (initialData.rolesInfo || []).map(r => r._id || r);
            const finalRoles = rolesArray.length > 0 ? rolesArray : rolesFromRolesInfo;
            const permissionsArray = Array.isArray(initialData.permissions) ? initialData.permissions : [];
            
            setFormData({
                name: initialData.name || "", lastname: initialData.lastname || "",
                email: initialData.email || "", telefono: initialData.telefono || "",
                roles: finalRoles, permissions: permissionsArray,
                isAdmin: initialData.isAdmin || false, password: ""
            });
        } else {
            setFormData({
                name: "", lastname: "", email: "", telefono: "",
                password: "", roles: [], permissions: [], isAdmin: false
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const dataToSave = { ...formData };
            if (newPassword && newPassword.length >= 6) dataToSave.newPassword = newPassword;
            await onSave(dataToSave);
            setShowPasswordChange(false);
            setNewPassword("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full max-w-3xl max-h-[95vh] rounded-[32px] shadow-premium flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
                {/* HEADER */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                        <FaShieldAlt size={18} />
                      </div>
                      {initialData ? "Configurar Identidad" : "Nueva Identidad"}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                        <FaTimes />
                    </button>
                </div>

                {/* TABS */}
                <div className="px-8 bg-slate-50/50 flex border-b border-slate-100">
                    <button 
                      onClick={() => setActiveTab('info')}
                      className={`px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'info' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >Información</button>
                    <button 
                      onClick={() => setActiveTab('roles')}
                      className={`px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'roles' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >Roles</button>
                    {resources.length > 0 && (
                      <button 
                        onClick={() => setActiveTab('permissions')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'permissions' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >Privilegios</button>
                    )}
                </div>

                {/* BODY */}
                <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                    <form onSubmit={handleSubmit} id="user-form">
                        {activeTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                                <Input label="Nombre" name="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Juan" required />
                                <Input label="Apellido" name="lastname" value={formData.lastname} onChange={e => setFormData({ ...formData, lastname: e.target.value })} placeholder="Ej: Pérez" required />
                                <Input label="Email Corporativo" type="email" name="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="correo@empresa.com" required />
                                <Input label="Teléfono de Contacto" name="telefono" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} placeholder="999 999 999" />
                                
                                {!initialData && (
                                    <div className="md:col-span-2">
                                        <Input label="Contraseña de Acceso" type="password" name="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" required />
                                    </div>
                                )}

                                <div className="md:col-span-2 p-5 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-4">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.isAdmin} 
                                        onChange={e => setFormData({ ...formData, isAdmin: e.target.checked })}
                                        className="w-6 h-6 rounded-lg text-amber-600 border-amber-200 focus:ring-amber-500"
                                    />
                                    <div>
                                        <div className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
                                          <FaUserShield className="text-amber-500" /> Administrador de Sistema
                                        </div>
                                        <div className="text-xs font-medium text-amber-700/70">Otorga acceso total a todas las funciones del ERP.</div>
                                    </div>
                                </div>

                                {initialData && (
                                    <div className="md:col-span-2 pt-2">
                                        {!showPasswordChange ? (
                                            <Button variant="secondary" onClick={() => setShowPasswordChange(true)}>
                                                <FaLock /> Cambiar Contraseña
                                            </Button>
                                        ) : (
                                            <div className="space-y-4 animate-fadeIn bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                                <Input label="Nueva Contraseña" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                                                <Button variant="ghost" size="sm" onClick={() => { setShowPasswordChange(false); setNewPassword(""); }}>Cancelar Cambio</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'roles' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="flex flex-col gap-1.5 w-full">
                                    <label className="text-[13px] font-semibold text-slate-500 ml-1">Asignar Roles</label>
                                    <p className="text-[10px] text-slate-400 mb-2 ml-1 uppercase tracking-widest font-bold">(Ctrl+Click para selección múltiple)</p>
                                    <select 
                                      multiple 
                                      value={formData.roles}
                                      onChange={e => setFormData({ ...formData, roles: Array.from(e.target.selectedOptions, o => o.value) })}
                                      className="w-full py-2.5 px-4 text-sm rounded-2xl border border-slate-200 bg-white focus:border-primary-500 outline-none min-h-[200px] custom-scrollbar"
                                    >
                                        {roles.map(role => (
                                            <option key={role._id} value={role._id} className="py-2 px-3 hover:bg-slate-50 rounded-lg cursor-pointer">
                                                {role.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {activeTab === 'permissions' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100 text-xs font-bold text-primary-700">
                                    Los permisos asignados aquí se sumarán a los que el usuario ya posea por sus roles.
                                </div>
                                {resources.map(res => (
                                    <div key={res._id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
                                        <div className="flex flex-col">
                                            <h4 className="text-sm font-extrabold text-slate-800">{res.displayName}</h4>
                                            <p className="text-[11px] text-slate-400 font-medium">{res.description}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {actions.map(act => {
                                                const val = typeof act === 'string' ? act : act._id;
                                                const lab = typeof act === 'string' ? act : act.displayName;
                                                const isChecked = (formData.permissions || []).find(p => p.resource === res._id)?.actions?.includes(val);
                                                return (
                                                    <label key={val} className={`
                                                        px-3 py-1.5 rounded-xl text-[11px] font-extrabold uppercase tracking-tight cursor-pointer transition-all border
                                                        ${isChecked 
                                                          ? 'bg-primary-500 border-primary-500 text-white shadow-md' 
                                                          : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}
                                                    `}>
                                                        <input type="checkbox" className="hidden" checked={isChecked || false} onChange={() => handleTogglePermission(res._id, val)} />
                                                        {lab}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </form>
                </div>

                {/* FOOTER */}
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" type="submit" form="user-form" loading={loading}>
                        {initialData ? "Actualizar Perfil" : "Crear Identidad"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
