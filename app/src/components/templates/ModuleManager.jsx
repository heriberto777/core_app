import React, { useState } from "react";
import {
    useAuth,
    useModules,
    usePermissions,
    ModuleFormModal,
    ModulesTable,
    Button
} from "../../index";
import { FaPlus, FaSearch, FaCogs, FaSync, FaDownload, FaTools } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * ModuleManager (Tailwind Edition)
 * Supervisión y configuración de la arquitectura modular del ecosistema.
 */
export function ModuleManager() {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedModule, setSelectedModule] = useState(null);

    const { accessToken, reloadModuleConfig } = useAuth();
    const { hasPermission, isAdmin } = usePermissions();

    const {
        modules,
        loading,
        categories,
        availableActions,
        searchTerm,
        setSearchTerm,
        actions
    } = useModules(accessToken, reloadModuleConfig);

    const canCreate = hasPermission("modules", "create");

    const handleEdit = (module) => {
        setSelectedModule(module);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedRole(null); // Corrigiendo posible typo en lógica original (selectedModule)
        setSelectedModule(null);
        setModalOpen(true);
    };

    const handleSave = async (data) => {
        try {
            await actions.saveModule(selectedModule?._id, data);
            setModalOpen(false);
            Swal.fire({
                icon: 'success', title: selectedModule ? 'Configuración actualizada' : 'Módulo registrado', toast: true,
                position: 'top-end', showConfirmButton: false, timer: 3000
            });
        } catch (e) {
            Swal.fire("Error", e.message || "Error al procesar el módulo", "error");
        }
    };

    const handleDelete = async (module) => {
        const result = await Swal.fire({
            title: '¿Extirpar módulo del sistema?',
            text: `Esta acción es crítica. Escribe "${module.name}" para confirmar la eliminación de "${module.displayName}".`,
            icon: 'warning',
            input: 'text',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Eliminar permanentemente',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (value !== module.name) return 'El nombre no coincide.';
            }
        });

        if (result.isConfirmed) {
            try {
                await actions.deleteModule(module._id);
                Swal.fire('Extirpado', 'El servicio ha sido removido del ecosistema.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
            }
        }
    };

    const handleToggleStatus = async (module) => {
        try {
            await actions.toggleModuleStatus(module._id);
        } catch (e) {
            Swal.fire("Error", "No se pudo cambiar el estado del servicio", "error");
        }
    };

    const handleDuplicate = async (module) => {
        const { value: newNames } = await Swal.fire({
            title: 'Clonar Esquema de Módulo',
            html: `
        <div style="text-align: left; padding: 10px;">
          <label style="display: block; font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Nuevo Nombre Técnico</label>
          <input id="newName" class="swal2-input" style="margin-top: 0; margin-bottom: 15px;" value="${module.name}_copy">
          <label style="display: block; font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;">Nuevo Nombre Visual</label>
          <input id="newDisp" class="swal2-input" style="margin-top: 0;" value="${module.displayName} (Copia)">
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Clonar Servicio',
            confirmButtonColor: '#6366f1',
            preConfirm: () => ({
                newName: document.getElementById('newName').value,
                newDisplayName: document.getElementById('newDisp').value
            })
        });

        if (newNames) {
            try {
                await actions.duplicateModule(module._id, newNames);
                Swal.fire('Clonado', 'El esquema ha sido duplicado con éxito.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'Error al clonar', 'error');
            }
        }
    };

    const handleInvalidateCache = async () => {
        const result = await Swal.fire({
            title: '¿Invalidar caché global?',
            text: 'Esto forzará a todos los usuarios a recargar la configuración del sistema.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, sincronizar ahora',
            confirmButtonColor: '#3b82f6'
        });

        if (result.isConfirmed) {
            try {
                await actions.invalidateCache();
                Swal.fire('Sincronizado', 'El caché del sistema ha sido invalidado.', 'success');
            } catch (e) {
                Swal.fire('Error', 'No se pudo sincronizar', 'error');
            }
        }
    };

    return (
        <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
            {/* HEADER */}
            <header className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Arquitectura Modular</h1>
                    <p className="text-slate-500 mt-2 font-medium">Supervisa y configura los micro-servicios y capacidades del ecosistema.</p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={handleInvalidateCache} className="!p-3" title="Sincronizar Caché">
                            <FaSync />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => actions.exportModules()} className="!p-3" title="Exportar Esquema JSON">
                            <FaDownload />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => actions.initializeSystemModules()} className="!p-3" title="Reparar Módulos Base">
                            <FaTools />
                        </Button>
                    </div>
                )}
            </header>

            {/* TOOLBAR */}
            <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-soft flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-lg">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        placeholder="Buscar por servicio, categoría o slug..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full py-3 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium"
                    />
                </div>
                {canCreate && (
                    <Button variant="primary" onClick={handleAdd}>
                        <FaPlus /> Registrar Nuevo Componente
                    </Button>
                )}
            </div>

            {/* CONTENT */}
            {loading && modules.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-32 text-center gap-6 bg-white rounded-[32px] border border-slate-200 border-dashed">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                      <FaCogs size={32} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-800">Escaneando infraestructura modular...</p>
                      <p className="text-sm text-slate-400 mt-1">Identificando servicios y dependencias.</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-soft overflow-hidden">
                    <ModulesTable
                        data={modules}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                        onToggleStatus={handleToggleStatus}
                    />
                </div>
            )}

            <ModuleFormModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                initialData={selectedModule}
                categories={categories}
                availableActions={availableActions}
            />
        </div>
    );
}
